/**
 * In-memory routing ledger.
 *
 * Records each routing decision per session. Callers can subscribe via
 * `onResolution()` (e.g. for tests / debug) or read recent entries via
 * `recentResolutions()`. The ledger is bounded so long sessions don't leak.
 */

import type { ResolutionEntry } from "../shared/types.ts"

const MAX_ENTRIES = 256

const entries: ResolutionEntry[] = []
const listeners = new Set<(e: ResolutionEntry) => void>()

export function recordResolution(entry: ResolutionEntry): void {
  entries.push(entry)
  while (entries.length > MAX_ENTRIES) entries.shift()
  for (const listener of listeners) {
    try {
      listener(entry)
    } catch {
      /* swallow */
    }
  }
}

export function recentResolutions(): readonly ResolutionEntry[] {
  return entries
}

export function clearResolutions(): void {
  entries.length = 0
}

export function onResolution(fn: (e: ResolutionEntry) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
