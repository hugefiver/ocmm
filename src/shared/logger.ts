/**
 * Tiny logger that respects OCMM_DEBUG.
 *
 * Goals:
 *   - one place to gate all chatter
 *   - never throw
 *   - never depend on console internals
 */

const PREFIX = "[ocmm]"

function debugEnabled(): boolean {
  const raw = process.env.OCMM_DEBUG
  if (!raw) return false
  const v = raw.toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

export const log = {
  debug(...args: unknown[]): void {
    if (!debugEnabled()) return
    try {
      // eslint-disable-next-line no-console
      console.debug(PREFIX, ...args)
    } catch {
      /* swallow */
    }
  },
  info(...args: unknown[]): void {
    if (!debugEnabled()) return
    try {
      // eslint-disable-next-line no-console
      console.log(PREFIX, ...args)
    } catch {
      /* swallow */
    }
  },
  warn(...args: unknown[]): void {
    if (!debugEnabled()) return
    try {
      // eslint-disable-next-line no-console
      console.warn(PREFIX, ...args)
    } catch {
      /* swallow */
    }
  },
  error(...args: unknown[]): void {
    if (!debugEnabled()) return
    try {
      // eslint-disable-next-line no-console
      console.error(PREFIX, ...args)
    } catch {
      /* swallow */
    }
  },
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
