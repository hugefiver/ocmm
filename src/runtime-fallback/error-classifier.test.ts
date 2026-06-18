import { test } from "node:test"
import assert from "node:assert/strict"

import { classifyError, extractErrorName, extractStatusCode } from "./error-classifier.ts"
import { defaultConfig } from "../config/schema.ts"

const cfg = defaultConfig().runtimeFallback

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
