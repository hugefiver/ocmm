/**
 * Error classification for reactive runtime fallback.
 *
 * Given an OpenCode `session.error` payload, decide whether the error is
 * retryable and extract diagnostic fields. Pure functions — no I/O.
 */
import type { RuntimeFallbackConfig } from "../config/schema.ts"
import { isRecord } from "../shared/logger.ts"

export type ErrorClassification = {
  retryable: boolean
  reason: string
  statusCode?: number
  errorName?: string
  message: string
}

export function extractStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  const s = error.status ?? error.statusCode ?? error.code
  if (typeof s === "number") return s
  if (typeof s === "string") {
    const n = Number.parseInt(s, 10)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function extractErrorName(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  if (typeof error.name === "string") return error.name
  if (typeof error.type === "string") return error.type
  return undefined
}

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (isRecord(error)) {
    if (typeof error.message === "string") return error.message
    if (typeof error.error === "string") return error.error
    if (isRecord(error.error) && typeof error.error.message === "string") {
      return error.error.message
    }
    try {
      return JSON.stringify(error)
    } catch {
      return "<unserializable>"
    }
  }
  return String(error ?? "")
}

export function classifyError(
  error: unknown,
  cfg: RuntimeFallbackConfig,
): ErrorClassification {
  const message = extractMessage(error)
  const statusCode = extractStatusCode(error)
  const errorName = extractErrorName(error)

  if (statusCode !== undefined && cfg.retryOnStatusCodes.includes(statusCode)) {
    return {
      retryable: true,
      reason: `status ${statusCode}`,
      statusCode,
      errorName,
      message,
    }
  }

  const lower = message.toLowerCase()
  for (const pat of cfg.retryOnPatterns) {
    try {
      const re = new RegExp(pat, "i")
      if (re.test(lower)) {
        return {
          retryable: true,
          reason: `pattern: ${pat}`,
          statusCode,
          errorName,
          message,
        }
      }
    } catch {
      // Invalid user-provided regex — skip silently.
    }
  }

  return {
    retryable: false,
    reason: "non-retryable",
    statusCode,
    errorName,
    message,
  }
}
