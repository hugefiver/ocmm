/**
 * Per-session fallback state machine.
 *
 * Tracks the original model, which fallback layer we're on, and a per-model
 * cooldown timestamp map. Pure data + pure functions; no I/O.
 */
import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"

export type FallbackState = {
  /** The model that originally failed (providerID/modelID). */
  originalModel: string
  /** Index into the fallback chain we're currently on (0 = primary). */
  fallbackIndex: number
  /** Count of committed model switches this session (same-model retries do not count). */
  attempts: number
  /** Map of "providerID/modelID" -> epoch-ms of last failure. */
  failedModels: Map<string, number>
  /** The model currently active / most recently dispatched (providerID/modelID).
   *  Used as the failed-model key when an error event carries no model info. */
  activeModel?: string
}

export type FallbackCandidateBlocker = (entry: FallbackEntry) => boolean

export function createFallbackState(originalModel: string): FallbackState {
  return {
    originalModel,
    fallbackIndex: 0,
    attempts: 0,
    failedModels: new Map(),
  }
}

export function modelKey(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`
}

export function markModelFailed(
  state: FallbackState,
  modelKey: string,
  now: number = Date.now(),
): void {
  state.failedModels.set(modelKey, now)
}

export function isModelInCooldown(
  modelKey: string,
  state: FallbackState,
  cooldownSeconds: number,
  now: number = Date.now(),
): boolean {
  const failedAt = state.failedModels.get(modelKey)
  if (failedAt === undefined) return false
  return now - failedAt < cooldownSeconds * 1000
}

/**
 * Find the next eligible fallback entry in a chain.
 *
 * Starts after `state.fallbackIndex` (so the primary is never re-picked
 * unless explicitly included elsewhere). Skips entries whose model is in
 * cooldown and entries equivalent to the just-failed model.
 */
export function findNextAvailableFallback(
  state: FallbackState,
  chain: FallbackEntry[],
  cooldownSeconds: number,
  justFailedModelKey: string,
  now: number = Date.now(),
  isCandidateBlocked: FallbackCandidateBlocker = () => false,
): { entry: FallbackEntry; index: number } | null {
  for (let i = state.fallbackIndex + 1; i < chain.length; i++) {
    const entry = chain[i]
    if (!entry) continue
    const providerID = entry.providers[0] ?? ""
    const key = modelKey(providerID, entry.model)
    if (key === justFailedModelKey) continue
    if (isModelInCooldown(key, state, cooldownSeconds, now)) continue
    if (isCandidateBlocked(entry)) continue
    return { entry, index: i }
  }
  return null
}

export type PeekResult =
  | { ok: true; entry: FallbackEntry; index: number; nextAttempts: number }
  | { ok: false; reason: "max-attempts" | "no-fallback-chain" | "no-next-model" }

/**
 * Peek at the next eligible fallback entry WITHOUT mutating state.
 *
 * Use this before dispatch to check whether a fallback is available.
 * After a successful dispatch, call {@link commitFallback} to advance
 * the state machine.
 */
export function peekNextFallback(
  state: FallbackState,
  requirement: ModelRequirement | null,
  justFailedModelKey: string,
  maxAttempts: number,
  cooldownSeconds: number,
  now: number = Date.now(),
  isCandidateBlocked: FallbackCandidateBlocker = () => false,
): PeekResult {
  if (state.attempts >= maxAttempts) {
    return { ok: false, reason: "max-attempts" }
  }
  if (!requirement || requirement.fallbackChain.length === 0) {
    return { ok: false, reason: "no-fallback-chain" }
  }

  const next = findNextAvailableFallback(
    state,
    requirement.fallbackChain,
    cooldownSeconds,
    justFailedModelKey,
    now,
    isCandidateBlocked,
  )
  if (!next) {
    return { ok: false, reason: "no-next-model" }
  }

  return { ok: true, entry: next.entry, index: next.index, nextAttempts: state.attempts + 1 }
}

/**
 * Commit a fallback entry to the state machine after a successful dispatch.
 *
 * Advances `fallbackIndex`, increments `attempts`, and sets `activeModel`.
 * Only call this after the model has actually been dispatched.
 */
export function commitFallback(
  state: FallbackState,
  entry: FallbackEntry,
  index: number,
): void {
  state.fallbackIndex = index
  state.attempts += 1
  state.activeModel = modelKey(entry.providers[0] ?? "", entry.model)
}

/** @deprecated Use {@link peekNextFallback} + {@link commitFallback} instead. */
export function prepareFallback(
  state: FallbackState,
  requirement: ModelRequirement | null,
  justFailedModelKey: string,
  maxAttempts: number,
  cooldownSeconds: number,
  now: number = Date.now(),
  isCandidateBlocked: FallbackCandidateBlocker = () => false,
): { ok: true; entry: FallbackEntry; index: number; attempts: number } | { ok: false; reason: string } {
  if (state.attempts >= maxAttempts) {
    return { ok: false, reason: "max-attempts" }
  }
  if (!requirement || requirement.fallbackChain.length === 0) {
    return { ok: false, reason: "no-fallback-chain" }
  }

  const next = findNextAvailableFallback(
    state,
    requirement.fallbackChain,
    cooldownSeconds,
    justFailedModelKey,
    now,
    isCandidateBlocked,
  )
  if (!next) {
    return { ok: false, reason: "no-next-model" }
  }

  state.fallbackIndex = next.index
  state.attempts += 1
  state.activeModel = modelKey(next.entry.providers[0] ?? "", next.entry.model)
  return { ok: true, entry: next.entry, index: next.index, attempts: state.attempts }
}
