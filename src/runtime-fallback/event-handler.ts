import { classifyError, type ErrorClassification } from "./error-classifier.ts"
import {
  markModelFailed,
  modelKey,
  peekNextFallback,
  commitFallback,
  type FallbackState,
} from "./fallback-state.ts"
import { dispatchFallbackRetry, isDispatchInFlight, type OcmmClient } from "./dispatcher.ts"
import { resolveEffectiveRequirement } from "../routing/resolver.ts"
import type { OcmmConfig, RuntimeFallbackConfig } from "../config/schema.ts"
import type { ModelRequirement } from "../shared/types.ts"
import { clearSessionIntent as defaultClearSessionIntent } from "../hooks/chat-message.ts"
import {
  isIdleContinuationEnabled,
  markSessionAborted,
  getSessionData,
  clearSession,
  DEFAULT_CONTINUATION_PROMPT,
  type IdleContinuationState,
} from "./idle-state.ts"
import { hasUnfinishedTodos } from "./todo-reader.ts"
import { isRecord, log } from "../shared/logger.ts"
import {
  createSubagent429Controller,
  type Subagent429Scheduler,
  type Subagent429Target,
} from "./subagent-429-controller.ts"
import {
  applyRequirementDefaults,
  chainHeadIdentity,
  createRuntimeFallbackSessionLifecycle,
  getOrCreateFallbackState,
  isRuntimeFallbackAbort,
  parseModelIdentity,
  resolveParentSessionID,
  resolveEventModelIdentity,
  resolveRuntimeFallbackAgent,
  resolveRuntimeFallbackSessionID,
  resolveRetryTarget,
} from "./event-handler-support.ts"

export type RuntimeFallbackDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
  clearSessionIntent?: (sessionID: string) => void
  registeredAgentModels?: ReadonlyMap<string, string>
  scheduler?: Subagent429Scheduler
  clock?: () => number
  random?: () => number
}

type GenericFallbackInput = {
  sessionID: string
  generation: number
  agent?: string
  classification: ErrorClassification
  requirement: ModelRequirement | null
  state?: FallbackState
  failedTarget?: Subagent429Target
  runtimeConfig: RuntimeFallbackConfig
}

export function createRuntimeFallbackEventHandler(deps: RuntimeFallbackDeps): (
  input: unknown,
) => Promise<void> {
  const sessionStates = new Map<string, FallbackState>()
  const clock = deps.clock ?? Date.now
  const lifecycle = createRuntimeFallbackSessionLifecycle(deps.client)
  const controller = createSubagent429Controller({
    ...(deps.scheduler === undefined ? {} : { scheduler: deps.scheduler }),
    clock,
    ...(deps.random === undefined ? {} : { random: deps.random }),
    logger: log,
    ...(deps.client === undefined
      ? {}
        : {
          dispatchRetry: async ({ sessionID, agent, target, reason }) => {
            const generation = lifecycle.currentGeneration(sessionID)
            await lifecycle.waitForStaleDispatches(sessionID, generation)
            if (!lifecycle.isCurrent(sessionID, generation)) return false
            return lifecycle.trackDispatch(sessionID, generation, dispatchFallbackRetry({
              client: lifecycle.guardedClient(sessionID, generation),
              sessionID,
              ...(deps.directory === undefined ? {} : { directory: deps.directory }),
              ...(agent === undefined ? {} : { agent }),
              newEntry: target.entry,
              reason,
              abortBeforeDispatch: false,
            }))
          },
        }),
  })

  const runGenericFallback = async ({
    sessionID,
    generation,
    agent,
    classification,
    requirement,
    state,
    failedTarget,
    runtimeConfig,
  }: GenericFallbackInput): Promise<void> => {
    if (!lifecycle.isCurrent(sessionID, generation)) return
    if (!classification.retryable) return
    if (!requirement || requirement.fallbackChain.length <= 1) {
      log.info(`no fallback chain configured for agent=${agent ?? "<none>"}; skipping`)
      return
    }
    if (!state || !failedTarget) {
      log.info(`could not determine failed model for agent=${agent ?? "<none>"}; skipping`)
      return
    }

    const justFailedKey = modelKey(failedTarget.providerID, failedTarget.modelID)
    markModelFailed(state, justFailedKey, clock())
    const peek = peekNextFallback(
      state,
      requirement,
      justFailedKey,
      runtimeConfig.maxAttempts,
      runtimeConfig.cooldownSeconds,
      clock(),
    )
    if (!peek.ok) {
      log.warn(`fallback exhausted: ${peek.reason} (session=${sessionID.slice(0, 16)}…)`)
      return
    }

    const entry = applyRequirementDefaults(requirement, peek.entry)
    log.info(
      `fallback attempt ${peek.nextAttempts}/${runtimeConfig.maxAttempts}: ` +
        `model=${entry.providers[0] ?? ""}/${entry.model}`,
    )
    if (!runtimeConfig.dispatch) {
      log.info("dispatch disabled; observe-only")
      return
    }
    if (!deps.client) {
      log.warn("no client available; cannot dispatch (observe-only)")
      return
    }

    await lifecycle.waitForStaleDispatches(sessionID, generation)
    if (!lifecycle.isCurrent(sessionID, generation)) return
    const dispatched = await lifecycle.trackDispatch(sessionID, generation, dispatchFallbackRetry({
      client: lifecycle.guardedClient(sessionID, generation),
      sessionID,
      ...(deps.directory === undefined ? {} : { directory: deps.directory }),
      ...(agent === undefined ? {} : { agent }),
      newEntry: entry,
      reason: classification.reason,
    }))
    if (dispatched && lifecycle.isCurrent(sessionID, generation)) {
      commitFallback(state, entry, peek.index)
    }
  }

  return async (raw) => {
    if (!isRecord(raw)) return
    const event = isRecord(raw.event) ? raw.event : raw
    const eventType = typeof event.type === "string" ? event.type : ""
    if (!eventType) return

    const props = isRecord(event.properties) ? event.properties : event
    const sessionID = resolveRuntimeFallbackSessionID(props)

    if (eventType === "session.created") {
      if (sessionID) {
        lifecycle.beginSession(sessionID)
        sessionStates.delete(sessionID)
        controller.onSessionCreated(sessionID, resolveParentSessionID(props) !== undefined)
      }
      return
    }

    if (eventType === "session.deleted") {
      if (sessionID) {
        lifecycle.invalidateSession(sessionID)
        controller.onDeleted(sessionID);
        (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
        sessionStates.delete(sessionID)
        if (deps.idleState) clearSession(deps.idleState, sessionID)
      }
      return
    }

    if (eventType === "session.idle") {
      if (sessionID) {
        const idleResult = controller.onIdle(sessionID);
        (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
        // Do NOT delete sessionStates here — the session may still be live
        // and a later session.error must continue from existing fallback
        // state (fallbackIndex, activeModel, attempts). Only session.deleted
        // and session.created reset fallback state.
        if (!idleResult.suppressIdleContinuation) {
          await handleIdleContinuation(deps, sessionID)
        }
      }
      return
    }

    if (eventType !== "session.error") return

    const cfg = deps.getConfig()
    if (!cfg.runtimeFallback.enabled) return
    if (!sessionID) {
      log.debug("session.error without sessionID; skipping")
      return
    }

    const error = props.error
    if (isRuntimeFallbackAbort(error)) {
      if (deps.idleState) {
        markSessionAborted(deps.idleState, sessionID)
      }
      log.debug(`session.error abort (likely our own); skipping`)
      return
    }
    const classification: ErrorClassification = classifyError(error, cfg.runtimeFallback, clock())
    const agent = resolveRuntimeFallbackAgent(props)
    log.info(
      `session.error: session=${sessionID.slice(0, 16)}… agent=${agent ?? "<none>"} ` +
        `retryable=${classification.retryable} reason=${classification.reason}`,
    )
    const effective = agent
      ? resolveEffectiveRequirement({
          agentName: agent,
          agentsConfig: cfg.agents,
          categoriesConfig: cfg.categories,
        })
      : null
    const requirement = effective?.requirement ?? null
    const eventModel = resolveEventModelIdentity(props)
    const inFlight = isDispatchInFlight(sessionID)
    const activeDispatchTarget = !eventModel && inFlight
      ? controller.getActiveDispatchTarget(sessionID)
      : undefined
    const registeredModel = agent
      ? parseModelIdentity(deps.registeredAgentModels?.get(agent))
      : null
    const headModel = chainHeadIdentity(requirement)
    let state = sessionStates.get(sessionID)
    if (!state && classification.retryable && requirement && requirement.fallbackChain.length > 0) {
      const initialModel = eventModel
        ?? (activeDispatchTarget ? { providerID: activeDispatchTarget.providerID, modelID: activeDispatchTarget.modelID } : null)
        ?? registeredModel
        ?? headModel
      if (initialModel) state = getOrCreateFallbackState(sessionStates, sessionID, requirement, initialModel)
    }

    const stateModel = parseModelIdentity(state?.activeModel)
    const failedTarget = activeDispatchTarget
      ?? (eventModel ? resolveRetryTarget(requirement, eventModel) : undefined)
      ?? (stateModel ? resolveRetryTarget(requirement, stateModel) : undefined)
      ?? (headModel ? resolveRetryTarget(requirement, headModel) : undefined)
    const genericInput = (target = failedTarget): GenericFallbackInput => ({
      sessionID,
      generation: lifecycle.currentGeneration(sessionID),
      ...(agent === undefined ? {} : { agent }),
      classification,
      requirement,
      ...(state === undefined ? {} : { state }),
      ...(target === undefined ? {} : { failedTarget: target }),
      runtimeConfig: cfg.runtimeFallback,
    })
    const dedicated429 = classification.retryable && classification.statusCode === 429

    if (!dedicated429) {
      const decision = controller.onOtherError({
        sessionID,
        runGenericFallback: async (activeTarget) => runGenericFallback(genericInput(activeTarget)),
      })
      if (decision.handled) return
      if (inFlight) {
        log.debug("session.error while generic retry is in flight; skipping")
        return
      }
      await runGenericFallback(genericInput())
      return
    }

    // Dedicated retries are meaningful even with a one-entry chain because
    // they re-dispatch that exact model. They only need a non-empty chain to
    // establish a target and later prepare a switch.
    if (!requirement || requirement.fallbackChain.length === 0 || !state || !failedTarget) {
      controller.onDeleted(sessionID)
      return
    }

    const decision = controller.on429({
      sessionID,
      ...(agent === undefined ? {} : { agent }),
      target: failedTarget,
      classification: {
        reason: classification.reason,
        ...(classification.recoveryDelayMs === undefined ? {} : { recoveryDelayMs: classification.recoveryDelayMs }),
      },
      runtimeConfig: cfg.runtimeFallback,
      prepareSwitch: (failed, isCandidateBlocked) => {
        const failedKey = modelKey(failed.providerID, failed.modelID)
        markModelFailed(state, failedKey, clock())
        const peek = peekNextFallback(
          state,
          requirement,
          failedKey,
          cfg.runtimeFallback.maxAttempts,
          cfg.runtimeFallback.cooldownSeconds,
          clock(),
          isCandidateBlocked,
        )
        if (!peek.ok) return { ok: false, reason: peek.reason }

        const providerID = peek.entry.providers[0] ?? ""
        const entry = { ...applyRequirementDefaults(requirement, peek.entry), providers: [providerID] }
        let committed = false
        return {
          ok: true,
          prepared: {
            target: { providerID, modelID: entry.model, entry },
            attempt: peek.nextAttempts,
            commit: () => {
              if (committed) return
              committed = true
              commitFallback(state!, entry, peek.index)
            },
          },
        }
      },
    })
    if (decision.handled) return
    if (inFlight) {
      log.debug("session.error while retry in flight; dedicated controller did not handle")
      return
    }
    await runGenericFallback(genericInput())
  }
}

async function handleIdleContinuation(deps: RuntimeFallbackDeps, sessionID: string): Promise<void> {
  const idleState = deps.idleState
  if (!idleState) return

  const data = idleState.sessionData.get(sessionID)
  // ESC abort — never continue
  if (data?.aborted) {
    clearSession(idleState, sessionID)
    return
  }

  // Not enabled — clean up
  if (!isIdleContinuationEnabled(idleState, sessionID)) {
    clearSession(idleState, sessionID)
    return
  }

  const cfg = deps.getConfig()
  const idleCfg = cfg.idleContinuation
  const maxContinuations = idleCfg?.maxContinuations ?? 20

  const count = data?.continuationCount ?? 0
  if (count >= maxContinuations) {
    clearSession(idleState, sessionID)
    return
  }

  if (!deps.client) return

  const hasUnfinished = await hasUnfinishedTodos(deps.client, sessionID)
  if (!hasUnfinished) {
    clearSession(idleState, sessionID)
    return
  }

  const prompt = idleCfg?.prompt ?? DEFAULT_CONTINUATION_PROMPT
  try {
    await deps.client.session.prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: prompt }] },
    })
    const sessionData = getSessionData(idleState, sessionID)
    sessionData.continuationCount = count + 1
  } catch (err) {
    log.warn("idle continuation prompt failed", { sessionID, error: String(err) })
    clearSession(idleState, sessionID)
  }
}
