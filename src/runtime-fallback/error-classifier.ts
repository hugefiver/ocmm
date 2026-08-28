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

export type BoundedErrorShape = {
  statusCodes: number[]
  names: string[]
  messages: string[]
}

/**
 * Reads the error fields that classification trusts without following arbitrary
 * provider object graphs. Values are root-first and deduplicated in encounter
 * order so callers can retain deterministic diagnostics and precedence.
 */
export function readBoundedErrorShape(error: unknown, maxDepth = 4): BoundedErrorShape {
  const output: BoundedErrorShape = {
    statusCodes: [],
    names: [],
    messages: [],
  }
  const queue: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }]
  const visited = new Set<object>()

  const addUnique = <T>(values: T[], value: T) => {
    if (!values.includes(value)) values.push(value)
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (!current) continue

    if (typeof current.value === "string") {
      addUnique(output.messages, current.value)
      continue
    }
    if (!isRecord(current.value) || visited.has(current.value)) continue
    visited.add(current.value)

    const status = current.value.status ?? current.value.statusCode ?? current.value.code
    const parsedStatus =
      typeof status === "number"
        ? status
        : typeof status === "string" && /^\d+$/.test(status.trim())
          ? Number(status)
          : undefined
    if (parsedStatus !== undefined && Number.isFinite(parsedStatus)) {
      addUnique(output.statusCodes, parsedStatus)
    }
    if (typeof current.value.name === "string") addUnique(output.names, current.value.name)
    if (typeof current.value.message === "string") addUnique(output.messages, current.value.message)

    if (current.depth < maxDepth) {
      for (const key of ["error", "data", "cause"] as const) {
        queue.push({ value: current.value[key], depth: current.depth + 1 })
      }
    }
  }

  return output
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

export function classifyError(
  error: unknown,
  cfg: RuntimeFallbackConfig,
  now = Date.now(),
): ErrorClassification {
  const shape = readBoundedErrorShape(error)
  const statusCode = shape.statusCodes[0]
  const errorName = shape.names[0]
  const message = shape.messages[0] ?? ""
  const recoveryDelayMs = shape.statusCodes.includes(429) ? extractRecoveryDelayMs(error, now) : undefined

  if (shape.names.includes("ContextOverflowError")) {
    return {
      retryable: false,
      reason: "context overflow",
      statusCode,
      errorName,
      message,
      ...(recoveryDelayMs === undefined ? {} : { recoveryDelayMs }),
    }
  }

  for (const retryableStatus of shape.statusCodes) {
    if (!cfg.retryOnStatusCodes.includes(retryableStatus)) continue
    return {
      retryable: true,
      reason: `status ${retryableStatus}`,
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
