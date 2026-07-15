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
  recoveryDelayMs?: number
}

const RECOVERY_FIELDS = [
  ["retryAfter", false],
  ["retry_after", false],
  ["retryDelay", false],
  ["retryAfterMs", true],
  ["retry_after_ms", true],
] as const

const UNIT_MS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
}

const DURATION_RE = /^\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\s*$/i
const MESSAGE_DURATION_RE = /(?:retry after|try again in|reset in)\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b/gi
const MESSAGE_TIMESTAMP_RE = /(?:reset at|retry at|try again at)\s+(.+?)(?=\s*;|$)/gi
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i
const HTTP_DATE_RE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/i

function positiveDelay(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function parseTimestampDelay(value: string, now: number): number | undefined {
  const trimmed = value.trim()
  if (!ISO_TIMESTAMP_RE.test(trimmed) && !HTTP_DATE_RE.test(trimmed)) return undefined
  const timestamp = Date.parse(trimmed)
  return Number.isFinite(timestamp) ? positiveDelay(timestamp - now) : undefined
}

function parseRetryAfterHeader(value: unknown, now: number): number | undefined {
  if (typeof value === "number") return positiveDelay(value * 1_000)
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return positiveDelay(Number(trimmed) * 1_000)
  }
  return parseTimestampDelay(trimmed, now)
}

function parseRecoveryValue(
  value: unknown,
  isMilliseconds: boolean,
  now: number,
): number | undefined {
  const multiplier = isMilliseconds ? 1 : 1_000
  if (typeof value === "number") return positiveDelay(value * multiplier)
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return positiveDelay(Number(trimmed) * multiplier)
  }

  const duration = trimmed.match(DURATION_RE)
  if (duration) {
    const unit = duration[2]?.toLowerCase()
    const unitMultiplier = unit ? UNIT_MS[unit] : undefined
    if (unitMultiplier !== undefined) {
      return positiveDelay(Number(duration[1]) * unitMultiplier)
    }
  }

  return parseTimestampDelay(trimmed, now)
}

function collectMessageDelays(message: string, now: number): number[] {
  const delays: number[] = []
  for (const match of message.matchAll(MESSAGE_DURATION_RE)) {
    const unit = match[2]?.toLowerCase()
    const unitMultiplier = unit ? UNIT_MS[unit] : undefined
    const delay = unitMultiplier === undefined ? undefined : positiveDelay(Number(match[1]) * unitMultiplier)
    if (delay !== undefined) delays.push(delay)
  }
  for (const match of message.matchAll(MESSAGE_TIMESTAMP_RE)) {
    const timestamp = match[1]
    if (timestamp === undefined) continue
    const delay = parseTimestampDelay(timestamp.trim(), now)
    if (delay !== undefined) delays.push(delay)
  }
  return delays
}

export function extractRecoveryDelayMs(error: unknown, now = Date.now()): number | undefined {
  const delays: number[] = []
  const add = (delay: number | undefined) => {
    if (delay !== undefined) delays.push(delay)
  }
  const inspectRecord = (record: Record<string, unknown>) => {
    for (const [field, isMilliseconds] of RECOVERY_FIELDS) {
      add(parseRecoveryValue(record[field], isMilliseconds, now))
    }
    if (typeof record.message === "string") {
      delays.push(...collectMessageDelays(record.message, now))
    }
  }

  if (typeof error === "string") {
    delays.push(...collectMessageDelays(error, now))
  } else if (isRecord(error)) {
    inspectRecord(error)
    for (const nested of [error.error, error.cause]) {
      if (typeof nested === "string") {
        delays.push(...collectMessageDelays(nested, now))
      } else if (isRecord(nested)) {
        inspectRecord(nested)
      }
    }

    const response = error.response
    if (isRecord(response) && isRecord(response.headers)) {
      for (const [name, value] of Object.entries(response.headers)) {
        if (name.toLowerCase() === "retry-after") {
          add(parseRetryAfterHeader(value, now))
        }
      }
    }
  }

  return delays.length > 0 ? Math.max(...delays) : undefined
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
  now = Date.now(),
): ErrorClassification {
  const message = extractMessage(error)
  const statusCode = extractStatusCode(error)
  const errorName = extractErrorName(error)
  const recoveryDelayMs = statusCode === 429 ? extractRecoveryDelayMs(error, now) : undefined

  if (statusCode !== undefined && cfg.retryOnStatusCodes.includes(statusCode)) {
    return {
      retryable: true,
      reason: `status ${statusCode}`,
      statusCode,
      errorName,
      message,
      ...(recoveryDelayMs === undefined ? {} : { recoveryDelayMs }),
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
          ...(recoveryDelayMs === undefined ? {} : { recoveryDelayMs }),
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
    ...(recoveryDelayMs === undefined ? {} : { recoveryDelayMs }),
  }
}
