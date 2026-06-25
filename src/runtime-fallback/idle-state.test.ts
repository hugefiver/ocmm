import { test } from "node:test"
import assert from "node:assert/strict"
import { createIdleContinuationState, isIdleContinuationEnabled, getSessionData, markSessionAborted, clearSession, DEFAULT_CONTINUATION_PROMPT } from "./idle-state.ts"

test("createIdleContinuationState starts with empty maps and globalEnabled false", () => {
  const s = createIdleContinuationState()
  assert.equal(s.globalEnabled, false)
  assert.equal(s.sessionOverrides.size, 0)
  assert.equal(s.sessionData.size, 0)
})

test("isIdleContinuationEnabled returns global when no override", () => {
  const s = createIdleContinuationState()
  s.globalEnabled = true
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), true)
  s.globalEnabled = false
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), false)
})

test("isIdleContinuationEnabled session override wins over global", () => {
  const s = createIdleContinuationState()
  s.globalEnabled = true
  s.sessionOverrides.set("ses_1", false)
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), false)
  s.sessionOverrides.set("ses_1", true)
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), true)
})

test("getSessionData creates data on first access", () => {
  const s = createIdleContinuationState()
  const data = getSessionData(s, "ses_1")
  assert.equal(data.aborted, false)
  assert.equal(data.continuationCount, 0)
  assert.equal(s.sessionData.size, 1)
})

test("getSessionData returns same reference on subsequent calls", () => {
  const s = createIdleContinuationState()
  const d1 = getSessionData(s, "ses_1")
  d1.continuationCount = 5
  const d2 = getSessionData(s, "ses_1")
  assert.equal(d2.continuationCount, 5)
})

test("markSessionAborted sets aborted flag", () => {
  const s = createIdleContinuationState()
  markSessionAborted(s, "ses_1")
  const data = s.sessionData.get("ses_1")
  assert.equal(data?.aborted, true)
})

test("clearSession removes both data and override", () => {
  const s = createIdleContinuationState()
  s.sessionOverrides.set("ses_1", true)
  s.sessionData.set("ses_1", { aborted: false, continuationCount: 3 })
  clearSession(s, "ses_1")
  assert.equal(s.sessionOverrides.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
})

test("DEFAULT_CONTINUATION_PROMPT is non-empty string", () => {
  assert.equal(typeof DEFAULT_CONTINUATION_PROMPT, "string")
  assert.ok(DEFAULT_CONTINUATION_PROMPT.length > 0)
})
