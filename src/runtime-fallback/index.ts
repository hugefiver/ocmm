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
export { createRuntimeFallbackEventHandler } from "./event-handler.ts"
