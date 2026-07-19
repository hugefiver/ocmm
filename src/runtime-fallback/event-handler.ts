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
import { createEffectiveRouteRegistry, type EffectiveRouteRegistry } from "../routing/route-registry.ts"
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
  isExplicitRuntimeFallbackAbort,
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
import { canonicalizeReviewAgentName } from "../review-agents/names.ts"
import {
  resolveSessionLineage,
  resolveTaskPartInterruption,
} from "../shared/opencode-events.ts"
import { createSubagentInterruptionOutputAdapter } from "./interruption-output-adapter.ts"

export type RuntimeFallbackDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
  clearSessionIntent?: (sessionID: string) => void
  routeRegistry?: EffectiveRouteRegistry
  scheduler?: Subagent429Scheduler
  clock?: () => number
  random?: () => number
}

export type RuntimeFallbackRuntime = {
  event: (input: unknown) => Promise<void>
  afterTask: (input: unknown, output: unknown) => Promise<void>
}

export const SUPPRESSION_TOMBSTONE_GRACE_MS = 5 * 60_000
export const MAX_SUPPRESSION_TOMBSTONES = 256

export function createRuntimeFallbackRuntime(deps: RuntimeFallbackDeps): RuntimeFallbackRuntime {
  const sessionStates = new Map<string, FallbackState>()
  const clock = deps.clock ?? Date.now
  const routeRegistry = deps.routeRegistry ?? createEffectiveRouteRegistry()
  // The subagent-interruption-recovery hook gates only the durable correlation
  // calls (recordSessionLineage, recordTaskPart, markExplicitAbort). It never
  // gates the existing 429/generic fallback/lifecycle/idle behavior.
  const interruptionRecoveryEnabled = (): boolean =>
    !deps.getConfig().disabledHooks.includes("subagent-interruption-recovery")
  const lifecycle = createRuntimeFallbackSessionLifecycle(deps.client)
  // Lifecycle-scoped suppression tombstone: an explicit abort or session.deleted
  // for a child blocks late retryable session.error events for the bounded grace
  // window, even when controller state is absent (hook disabled, onDeleted
  // already evicted the controller record) and runtime fallback is enabled.
  // A subsequent legitimate session.created with the same ID clears the
  // tombstone so delete->recreate can dispatch normally. A duplicate active
  // creation (session still tracked by the lifecycle) does NOT clear it - that
  // matches the existing idempotent duplicate-create semantics, where a new
  // session.created for an already-active session is a replay, not a restart.
  const suppressedSessions = new Map<string, number>()
  const pruneSuppressedSessions = (): void => {
    const now = clock()
    for (const [sessionID, suppressedAt] of suppressedSessions) {
      if (now - suppressedAt >= SUPPRESSION_TOMBSTONE_GRACE_MS) suppressedSessions.delete(sessionID)
    }
    if (suppressedSessions.size <= MAX_SUPPRESSION_TOMBSTONES) return
    const oldest = [...suppressedSessions.entries()]
      .sort(([, left], [, right]) => left - right)
      .slice(0, suppressedSessions.size - MAX_SUPPRESSION_TOMBSTONES)
    for (const [sessionID] of oldest) suppressedSessions.delete(sessionID)
  }
  const suppressSession = (sessionID: string): void => {
    pruneSuppressedSessions()
    suppressedSessions.set(sessionID, clock())
    pruneSuppressedSessions()
  }
  const clearSuppression = (sessionID: string): void => {
    pruneSuppressedSessions()
    suppressedSessions.delete(sessionID)
  }
  const isSuppressed = (sessionID: string): boolean => {
    pruneSuppressedSessions()
    return suppressedSessions.has(sessionID)
  }
  const controller = createSubagent429Controller({
    ...(deps.scheduler === undefined ? {} : { scheduler: deps.scheduler }),
    clock,
    isCurrentSnapshot: routeRegistry.isCurrentSnapshot,
    ...(deps.random === undefined ? {} : { random: deps.random }),
    logger: log,
    ...(deps.client === undefined
      ? {}
        : {
          dispatchRetry: async ({ sessionID, snapshotId, agent, target, reason }) => {
            if (!routeRegistry.isCurrentSnapshot(snapshotId)) return false
            const generation = lifecycle.currentGeneration(sessionID)
            await lifecycle.waitForStaleDispatches(sessionID, generation)
            if (!lifecycle.isCurrent(sessionID, generation) || !routeRegistry.isCurrentSnapshot(snapshotId)) return false
            return lifecycle.trackDispatch(sessionID, generation, dispatchFallbackRetry({
              client: lifecycle.guardedClient(
                sessionID,
                generation,
                () => routeRegistry.isCurrentSnapshot(snapshotId),
              ),
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
    isCurrentSnapshot: routeRegistry.isCurrentSnapshot,
    ...(deps.client === undefined ? {} : { client: deps.client }),
    ...(deps.directory === undefined ? {} : { directory: deps.directory }),
    clock,
  }

  const event = async (raw: unknown): Promise<void> => {
    if (!isRecord(raw)) return
    const event = isRecord(raw.event) ? raw.event : raw
    const eventType = typeof event.type === "string" ? event.type : ""
    if (!eventType) return

    const props = isRecord(event.properties) ? event.properties : event
    const sessionID = resolveRuntimeFallbackSessionID(props)
    const routeSnapshot = routeRegistry.snapshot()

    if (eventType === "session.created") {
      // Decode lineage via the shared decoder so runtime fallback, permissions,
      // and interruption correlation share one parent-ID spelling policy.
      const lineage = resolveSessionLineage(raw)
      if (lineage && lineage.sessionID) {
        const childSessionID = lineage.sessionID
        if (!lifecycle.hasSession(childSessionID)) {
          // Legitimate (re)creation: this is either a fresh session or a
          // delete->recreate cycle. Either way, clear any prior suppression
          // tombstone so a later retryable error can dispatch normally.
          // A duplicate-active-create (session still tracked) skips this
          // branch and preserves the tombstone, matching the idempotent
          // duplicate-create semantics.
          clearSuppression(childSessionID)
          lifecycle.beginSession(childSessionID)
          sessionStates.delete(childSessionID)
          controller.onSessionCreated(
            childSessionID,
            lineage.parentSessionID !== undefined,
            routeSnapshot.snapshotId,
          )
          // When interruption recovery is enabled and a parent exists, record
          // the durable lineage. This does NOT dispatch and is additive.
          if (interruptionRecoveryEnabled() && lineage.parentSessionID !== undefined) {
            controller.recordSessionLineage({
              childSessionID,
              parentSessionID: lineage.parentSessionID,
            })
          }
        }
      } else if (sessionID) {
        // Fallback: sessionID resolved through the legacy path even if the
        // shared decoder did not produce a lineage. Preserve prior behavior.
        if (!lifecycle.hasSession(sessionID)) {
          clearSuppression(sessionID)
          lifecycle.beginSession(sessionID)
          sessionStates.delete(sessionID)
          controller.onSessionCreated(
            sessionID,
            resolveParentSessionID(props) !== undefined,
            routeSnapshot.snapshotId,
          )
        }
      }
      return
    }

    if (eventType === "session.deleted") {
      if (sessionID) {
        // Call the existing controller.onDeleted() before other cache cleanup
        // so the durable correlation is invalidated before any idle continuations.
        lifecycle.invalidateSession(sessionID)
        controller.onDeleted(sessionID);
        (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
        sessionStates.delete(sessionID)
        if (deps.idleState) clearSession(deps.idleState, sessionID)
        // Record a bounded lifecycle tombstone so late retryable session.error
        // events cannot fall through to dedicated 429 or generic fallback. A
        // legitimate session.created with the same ID clears it immediately.
        suppressSession(sessionID)
      }
      return
    }

    if (eventType === "session.idle") {
      if (sessionID) {
        const idleResult = controller.onIdle(sessionID, routeSnapshot.snapshotId);
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

    // Process parent-side task tool part interruptions BEFORE the generic
    // session.error gate. This event must NEVER dispatch on its own - it
    // only records durable evidence so a later retryable child error can
    // be correlated and dispatched through the existing 429/generic paths.
    if (eventType === "message.part.updated") {
      if (interruptionRecoveryEnabled()) {
        const evidence = resolveTaskPartInterruption(raw)
        if (evidence) {
          // Canonicalize the evidence agent (e.g. oracle-second -> oracle-2nd).
          const canonicalAgent = evidence.agent === undefined
            ? undefined
            : (canonicalizeReviewAgentName(evidence.agent) ?? evidence.agent)
          controller.recordTaskPart({
            childSessionID: evidence.childSessionID,
            parentSessionID: evidence.parentSessionID,
            ...(evidence.parentPartID === undefined ? {} : { parentPartID: evidence.parentPartID }),
            ...(evidence.callID === undefined ? {} : { callID: evidence.callID }),
            ...(canonicalAgent === undefined ? {} : { agent: canonicalAgent }),
            ...(evidence.taskID === undefined ? {} : { taskID: evidence.taskID }),
            terminalTaskErrorObserved: true,
          })
        }
      }
      return
    }

    if (eventType !== "session.error") return

    const cfg = deps.getConfig()

    // Evaluate explicit abort BEFORE the runtimeFallback.enabled early return.
    // This ensures that even when runtime fallback is disabled, an explicit
    // abort cancels any pending 429 gate and records abort evidence so a
    // misleading output notice cannot be produced for an aborted child.
    const earlyError = props.error
    if (isRuntimeFallbackAbort(earlyError)) {
      if (sessionID && isExplicitRuntimeFallbackAbort(earlyError)) {
        if (interruptionRecoveryEnabled()) {
          controller.markExplicitAbort(sessionID)
        }
        if (deps.idleState) {
          markSessionAborted(deps.idleState, sessionID)
        }
        // Record a bounded lifecycle tombstone so late retryable session.error
        // events cannot fall through to dedicated 429 or generic fallback. A
        // legitimate session.created with the same ID clears it immediately.
        suppressSession(sessionID)
      }
      log.debug(`session.error abort (likely our own); skipping`)
      return
    }
    if (!cfg.runtimeFallback.enabled) return
    if (!sessionID) {
      log.debug("session.error without sessionID; skipping")
      return
    }
    // Lifecycle tombstone: an explicit abort or session.deleted blocks late
    // retryable session.error events during its bounded grace window, even
    // when controller state is absent (hook disabled, onDeleted already
    // evicted the controller record). This blocks both fallback paths before
    // any dispatch attempt.
    if (isSuppressed(sessionID)) {
      log.debug(`session.error for suppressed session=${sessionID.slice(0, 16)}…; skipping`)
      return
    }

    const error = props.error
    const classification: ErrorClassification = classifyError(error, cfg.runtimeFallback, clock())
    // Resolve the child agent from the event payload; if absent, fall back to
    // the durable correlation's recorded agent so a child session whose
    // session.error omits the agent can still be matched for retry.
    const eventAgent = resolveRuntimeFallbackAgent(props)
    const correlationAgent = controller.getInterruptionCorrelation({ childSessionID: sessionID })?.agent
    const agent = eventAgent ?? correlationAgent
    log.info(
      `session.error: session=${sessionID.slice(0, 16)}… agent=${agent ?? "<none>"} ` +
        `retryable=${classification.retryable} reason=${classification.reason}`,
    )
    const publishedRoute = routeSnapshot.published && agent
      ? routeSnapshot.routes.get(agent)
      : undefined
    const effective = !routeSnapshot.published && agent
      ? resolveEffectiveRequirement({
          agentName: agent,
          agentsConfig: cfg.agents,
          categoriesConfig: cfg.categories,
          disabledAgents: cfg.disabledAgents,
        })
      : null
    const requirement = routeSnapshot.published
      ? publishedRoute?.requirement ?? null
      : effective?.requirement ?? null
    const routeModel = routeSnapshot.published ? parseModelIdentity(publishedRoute?.model) : null
    // Once the classification is retryable and a known effective agent
    // requirement exists, record durable retryable-child-error evidence. This
    // does NOT dispatch - the existing on429()/generic fallback paths below
    // remain the only dispatch paths. It only flips the retryableChildError
    // boolean on the durable correlation so a parent-side task evidence
    // already recorded (or arriving later) can be correlated.
    if (interruptionRecoveryEnabled() && classification.retryable && requirement) {
      controller.markRetryableChildError(sessionID)
    }
    const eventModel = resolveEventModelIdentity(props)
    const inFlight = isDispatchInFlight(sessionID)
    const activeDispatchTarget = !eventModel && inFlight
      ? controller.getActiveDispatchTarget(sessionID, routeSnapshot.snapshotId)
      : undefined
    const headModel = chainHeadIdentity(requirement)
    let state = sessionStates.get(sessionID)
    if (classification.retryable && requirement && requirement.fallbackChain.length > 0) {
      const initialModel = eventModel
        ?? (activeDispatchTarget
          ? { providerID: activeDispatchTarget.providerID, modelID: activeDispatchTarget.modelID }
          : null)
        ?? routeModel
        ?? headModel
      if (initialModel) {
        state = getOrCreateFallbackState(
          sessionStates,
          sessionID,
          requirement,
          initialModel,
          routeSnapshot.snapshotId,
        )
      }
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
      snapshotId: routeSnapshot.snapshotId,
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
        snapshotId: routeSnapshot.snapshotId,
        runGenericFallback: async (activeTarget) => {
          if (!routeRegistry.isCurrentSnapshot(routeSnapshot.snapshotId)) return
          await runGenericFallback(genericFallbackCtx, genericInput(activeTarget))
        },
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
      snapshotId: routeSnapshot.snapshotId,
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
            snapshotId: routeSnapshot.snapshotId,
            commit: () => {
              if (committed || !routeRegistry.isCurrentSnapshot(routeSnapshot.snapshotId)) return
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

  return {
    event,
    afterTask: createSubagentInterruptionOutputAdapter({ getConfig: deps.getConfig, controller }),
  }
}

export function createRuntimeFallbackEventHandler(deps: RuntimeFallbackDeps): (
  input: unknown,
) => Promise<void> {
  return createRuntimeFallbackRuntime(deps).event
}
