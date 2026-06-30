/**
 * In-memory routing ledger.
 *
 * Records each routing decision per session. Callers can subscribe via
 * `onResolution()` (e.g. for tests / debug) or read recent entries via
 * `recentResolutions()`. The ledger is bounded so long sessions don't leak.
 */

import type { ResolutionEntry } from "../shared/types.ts"

const MAX_ENTRIES = 256

export function createResolutionLedger() {
  const entries: ResolutionEntry[] = []
  const listeners = new Set<(e: ResolutionEntry) => void>()

  function recordResolution(entry: ResolutionEntry): void {
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

  function recentResolutions(): readonly ResolutionEntry[] {
    return entries
  }

  function clearResolutions(): void {
    entries.length = 0
  }

  function onResolution(fn: (e: ResolutionEntry) => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  return { recordResolution, recentResolutions, clearResolutions, onResolution }
}

export type ResolutionLedger = ReturnType<typeof createResolutionLedger>

// Default singleton ledger for backward compatibility with existing callers.
const defaultLedger = createResolutionLedger()

export const recordResolution = defaultLedger.recordResolution
export const recentResolutions = defaultLedger.recentResolutions
export const clearResolutions = defaultLedger.clearResolutions
export const onResolution = defaultLedger.onResolution
