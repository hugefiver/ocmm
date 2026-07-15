import { test } from "node:test"
import assert from "node:assert/strict"

import {
  classifyError,
  extractErrorName,
  extractRecoveryDelayMs,
  extractStatusCode,
} from "./error-classifier.ts"
import { defaultConfig } from "../config/schema.ts"

const cfg = defaultConfig().runtimeFallback
const NOW = Date.parse("2026-07-15T12:00:00.000Z")

test("extractStatusCode reads status / statusCode / numeric code", () => {
  assert.equal(extractStatusCode({ status: 429 }), 429)
  assert.equal(extractStatusCode({ statusCode: 503 }), 503)
  assert.equal(extractStatusCode({ code: "502" }), 502)
  assert.equal(extractStatusCode({ foo: "bar" }), undefined)
})

test("extractErrorName reads name or type", () => {
  assert.equal(extractErrorName({ name: "RateLimitError" }), "RateLimitError")
  assert.equal(extractErrorName({ type: "QuotaExceeded" }), "QuotaExceeded")
  assert.equal(extractErrorName({ foo: "bar" }), undefined)
})

test("classifyError marks status code 429 retryable", () => {
  const r = classifyError({ status: 429, message: "slow down" }, cfg)
  assert.equal(r.retryable, true)
  assert.equal(r.statusCode, 429)
  assert.match(r.reason, /status 429/)
})

test("classifyError marks 503 retryable", () => {
  const r = classifyError({ status: 503 }, cfg)
  assert.equal(r.retryable, true)
})

test("classifyError marks non-listed status not retryable by code alone", () => {
  const r = classifyError({ status: 404, message: "not found" }, cfg)
  assert.equal(r.retryable, false)
  assert.equal(r.reason, "non-retryable")
})

test("classifyError matches retryable pattern in message", () => {
  const r = classifyError({ message: "Service Unavailable right now" }, cfg)
  assert.equal(r.retryable, true)
  assert.match(r.reason, /pattern/)
})

test("classifyError matches 'rate limit' case-insensitively", () => {
  const r = classifyError({ message: "RATE LIMIT exceeded" }, cfg)
  assert.equal(r.retryable, true)
})

test("classifyError extracts nested error.message", () => {
  const r = classifyError({ error: { message: "overloaded" } }, cfg)
  assert.equal(r.retryable, true)
  assert.equal(r.message, "overloaded")
})

test("classifyError handles string errors", () => {
  const r = classifyError("try again later", cfg)
  assert.equal(r.retryable, true)
})

test("classifyError handles unknown shapes without throwing", () => {
  const r = classifyError(null, cfg)
  assert.equal(r.retryable, false)
  assert.equal(r.message, "")
})

test("classifyError skips invalid regex patterns silently", () => {
  const badCfg = { ...cfg, retryOnPatterns: ["(invalid"] }
  const r = classifyError({ message: "anything" }, badCfg)
  assert.equal(r.retryable, false)
})

test("status code takes priority over pattern matching", () => {
  const r = classifyError({ status: 400, message: "rate limit" }, cfg)
  assert.equal(r.retryable, true)
  assert.match(r.reason, /pattern/)
})

test("extractRecoveryDelayMs reads bounded retry metadata", () => {
  assert.equal(extractRecoveryDelayMs({ retryAfter: 90 }, NOW), 90_000)
  assert.equal(extractRecoveryDelayMs({ error: { retry_after: "12m" } }, NOW), 720_000)
  assert.equal(extractRecoveryDelayMs({ cause: { retryDelay: "1.5 seconds" } }, NOW), 1_500)
  assert.equal(extractRecoveryDelayMs({ retryDelay: "2 hrs" }, NOW), 7_200_000)
  assert.equal(extractRecoveryDelayMs({ retryAfterMs: 2_500 }, NOW), 2_500)
  assert.equal(extractRecoveryDelayMs({ error: { retry_after_ms: "1750" } }, NOW), 1_750)
})

test("extractRecoveryDelayMs reads case-insensitive Retry-After headers and timestamps", () => {
  assert.equal(
    extractRecoveryDelayMs({ response: { headers: { "rEtRy-AfTeR": "90" } } }, NOW),
    90_000,
  )
  assert.equal(
    extractRecoveryDelayMs(
      { response: { headers: { "Retry-After": "Wed, 15 Jul 2026 12:01:30 GMT" } } },
      NOW,
    ),
    90_000,
  )
  assert.equal(extractRecoveryDelayMs({ retryAfter: "2026-07-15T12:02:00.000Z" }, NOW), 120_000)
})

test("extractRecoveryDelayMs reads bounded retry messages", () => {
  assert.equal(extractRecoveryDelayMs({ message: "retry after 90 seconds" }, NOW), 90_000)
  assert.equal(extractRecoveryDelayMs({ message: "retry after 45 secs" }, NOW), 45_000)
  assert.equal(extractRecoveryDelayMs({ error: "try again in 12m" }, NOW), 720_000)
  assert.equal(
    extractRecoveryDelayMs({ cause: "reset at 2026-07-15T12:01:30.000Z" }, NOW),
    90_000,
  )
})

test("extractRecoveryDelayMs uses the longest positive bounded candidate", () => {
  assert.equal(
    extractRecoveryDelayMs(
      {
        retryAfter: 30,
        error: { retry_after: "90s" },
        cause: { retryAfterMs: 120_000 },
        response: { headers: { "Retry-After": "100" } },
      },
      NOW,
    ),
    120_000,
  )
})

test("extractRecoveryDelayMs rejects ambiguous, non-positive, past, and unbounded values", () => {
  for (const error of [
    { message: "90" },
    { retryAfter: 0 },
    { retryAfter: -1 },
    { message: "retry after soon" },
    { retryAfter: "2026-07-15T11:59:59.000Z" },
    { retryAfter: "07/16/2026" },
    { response: { headers: { "Retry-After": "12m" } } },
    { metadata: { nested: { retryAfter: 90 } } },
  ]) {
    assert.equal(extractRecoveryDelayMs(error, NOW), undefined)
  }
})

test("classifyError exposes recoveryDelayMs only for explicit status 429", () => {
  const rateLimited = classifyError({ status: 429, retryAfter: 90 }, cfg, NOW)
  assert.equal(rateLimited.recoveryDelayMs, 90_000)
  assert.equal(classifyError({ statusCode: 429, retryAfter: 90 }, cfg, NOW).recoveryDelayMs, 90_000)
  assert.equal(classifyError({ code: "429", retryAfter: 90 }, cfg, NOW).recoveryDelayMs, 90_000)

  const unavailable = classifyError({ status: 503, retryAfter: 90 }, cfg, NOW)
  assert.equal(unavailable.recoveryDelayMs, undefined)
  assert.equal(Object.hasOwn(unavailable, "recoveryDelayMs"), false)

  const patternOnly = classifyError("rate limit: retry after 90 seconds", cfg, NOW)
  assert.equal(patternOnly.recoveryDelayMs, undefined)
  assert.equal(Object.hasOwn(patternOnly, "recoveryDelayMs"), false)
})
