import {
  markModelFailed,
  modelKey,
  peekNextFallback,
  commitFallback,
  type FallbackState,
} from "./fallback-state.ts"
import { dispatchFallbackRetry, type OcmmClient } from "./dispatcher.ts"
import type { RuntimeFallbackConfig } from "../config/schema.ts"
import type { ModelRequirement } from "../shared/types.ts"
import type { ErrorClassification } from "./error-classifier.ts"
import type { Subagent429Target } from "./subagent-429-controller.ts"
import { applyRequirementDefaults, type RuntimeFallbackSessionLifecycle } from "./event-handler-support.ts"
import { log } from "../shared/logger.ts"

export type GenericFallbackInput = {
  sessionID: string
  generation: number
  snapshotId: number
  agent?: string
  classification: ErrorClassification
  requirement: ModelRequirement | null
  state?: FallbackState
  failedTarget?: Subagent429Target
  runtimeConfig: RuntimeFallbackConfig
}

export type GenericFallbackContext = {
  lifecycle: RuntimeFallbackSessionLifecycle
  isCurrentSnapshot: (snapshotId: number) => boolean
  client?: OcmmClient
  directory?: string
  clock: () => number
}

export async function runGenericFallback(
  ctx: GenericFallbackContext,
  input: GenericFallbackInput,
): Promise<void> {
  const { lifecycle, client, directory, clock, isCurrentSnapshot } = ctx
  const { sessionID, generation, snapshotId, agent, classification, requirement, state, failedTarget, runtimeConfig } = input
  const isCurrent = (): boolean =>
    lifecycle.isCurrent(sessionID, generation) && isCurrentSnapshot(snapshotId)

  if (!isCurrent()) return
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
  if (!client) {
    log.warn("no client available; cannot dispatch (observe-only)")
    return
  }

  await lifecycle.waitForStaleDispatches(sessionID, generation)
  if (!isCurrent()) return
  const dispatched = await lifecycle.trackDispatch(sessionID, generation, dispatchFallbackRetry({
    client: lifecycle.guardedClient(sessionID, generation, () => isCurrentSnapshot(snapshotId)),
    sessionID,
    ...(directory === undefined ? {} : { directory }),
    ...(agent === undefined ? {} : { agent }),
    newEntry: entry,
    reason: classification.reason,
  }))
  if (dispatched && isCurrent()) {
    commitFallback(state, entry, peek.index)
  }
}
