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
import type { OcmmConfig } from "../config/schema.ts"
import { clearSessionIntent as defaultClearSessionIntent } from "../hooks/chat-message.ts"
import { markSessionAborted, clearSession, type IdleContinuationState } from "./idle-state.ts"
import { isRecord, log } from "../shared/logger.ts"
import {
  createSubagent429Controller,
  type Subagent429Scheduler,
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
import { runGenericFallback, type GenericFallbackInput } from "./event-handler-generic-fallback.ts"
import { handleIdleContinuation } from "./event-handler-idle-continuation.ts"

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

  const genericFallbackCtx = {
    lifecycle,
    ...(deps.client === undefined ? {} : { client: deps.client }),
    ...(deps.directory === undefined ? {} : { directory: deps.directory }),
    clock,
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
        // Do NOT delete sessionStates here - the session may still be live
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
    const registeredModel = agent ? parseModelIdentity(deps.registeredAgentModels?.get(agent)) : null
    const headModel = chainHeadIdentity(requirement)
    let state = sessionStates.get(sessionID)
    if (!state && classification.retryable && requirement && requirement.fallbackChain.length > 0) {
      const initialModel = eventModel
        ?? (activeDispatchTarget
          ? { providerID: activeDispatchTarget.providerID, modelID: activeDispatchTarget.modelID }
          : null)
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

    // A stale in-flight dispatch from an older generation may still hold the
    // global sessionID lock. Let it settle, confirm this generation is still
    // current, then re-read the lock; only a genuine in-flight dispatch skips.
    const skipBecauseInFlight = async (): Promise<boolean> => {
      if (!inFlight) return false
      const generation = lifecycle.currentGeneration(sessionID)
      await lifecycle.waitForStaleDispatches(sessionID, generation)
      if (!lifecycle.isCurrent(sessionID, generation)) return true
      return isDispatchInFlight(sessionID)
    }

    if (!dedicated429) {
      const decision = controller.onOtherError({
        sessionID,
        runGenericFallback: async (activeTarget) => runGenericFallback(genericFallbackCtx, genericInput(activeTarget)),
      })
      if (decision.handled) return
      if (await skipBecauseInFlight()) {
        log.debug("session.error while generic retry is in flight; skipping")
        return
      }
      await runGenericFallback(genericFallbackCtx, genericInput())
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
    if (await skipBecauseInFlight()) {
      log.debug("session.error while retry in flight; dedicated controller did not handle")
      return
    }
    await runGenericFallback(genericFallbackCtx, genericInput())
  }
}
