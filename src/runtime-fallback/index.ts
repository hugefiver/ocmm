export {
  classifyError,
  extractErrorName,
  extractStatusCode,
  type ErrorClassification,
} from "./error-classifier.ts"
export {
  createFallbackState,
  findNextAvailableFallback,
  isModelInCooldown,
  markModelFailed,
  modelKey,
  peekNextFallback,
  commitFallback,
  prepareFallback,
  type FallbackState,
  type PeekResult,
} from "./fallback-state.ts"
export {
  dispatchFallbackRetry,
  isDispatchInFlight,
  type DispatchArgs,
  type OcmmClient,
} from "./dispatcher.ts"
import {
  createRuntimeFallbackRuntime as createRuntimeFallbackRuntimeInternal,
  createRuntimeFallbackEventHandler as createRuntimeFallbackEventHandlerInternal,
  type RuntimeFallbackRuntime,
} from "./event-handler.ts"
import type { OcmmConfig } from "../config/schema.ts"
import type { EffectiveRouteRegistry } from "../routing/route-registry.ts"
import type { OcmmClient } from "./dispatcher.ts"
import type { IdleContinuationState } from "./idle-state.ts"
import type { Subagent429Scheduler } from "./subagent-429-controller.ts"

export type { RuntimeFallbackRuntime } from "./event-handler.ts"

/** Public runtime contract: failed-model lookup is always route-snapshot based. */
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

export function createRuntimeFallbackRuntime(deps: RuntimeFallbackDeps): RuntimeFallbackRuntime {
  return createRuntimeFallbackRuntimeInternal(deps)
}

export function createRuntimeFallbackEventHandler(deps: RuntimeFallbackDeps): (input: unknown) => Promise<void> {
  return createRuntimeFallbackEventHandlerInternal(deps)
}
