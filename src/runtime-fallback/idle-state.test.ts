import { test } from "node:test"
import assert from "node:assert/strict"
import {
  acquireIdleContinuationLease,
  beginIdleSession,
  clearSession,
  createIdleContinuationState,
  DEFAULT_CONTINUATION_PROMPT,
  getSessionData,
  invalidateIdleSession,
  isIdleContinuationEnabled,
  markSessionAborted,
} from "./idle-state.ts"

test("createIdleContinuationState starts with empty maps and globalEnabled false", () => {
  const s = createIdleContinuationState()
  assert.equal(s.globalEnabled, false)
  assert.equal(s.sessionOverrides.size, 0)
  assert.equal(s.sessionData.size, 0)
  assert.equal(s.nextGeneration, 0)
  assert.equal(s.sessionGenerations.size, 0)
  assert.equal(s.activeLeases.size, 0)
  assert.equal(s.sessionLifecycleKinds.size, 0)
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

test("markSessionAborted advances generation, invalidates the lease, and preserves aborted data", () => {
  const s = createIdleContinuationState()
  s.sessionOverrides.set("ses_1", true)
  const lease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(lease)
  const data = getSessionData(s, "ses_1")
  data.continuationCount = 3

  markSessionAborted(s, "ses_1")

  assert.equal(s.nextGeneration, 2)
  assert.equal(s.sessionGenerations.get("ses_1"), 2)
  assert.equal(lease.isCurrent(), false)
  assert.equal(s.sessionData.get("ses_1"), data)
  assert.deepEqual(s.sessionData.get("ses_1"), { aborted: true, continuationCount: 3 })
  assert.equal(s.sessionOverrides.get("ses_1"), true)
})

test("clearSession removes data and override without invalidating lifecycle", () => {
  const s = createIdleContinuationState()
  const lease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(lease)
  s.sessionOverrides.set("ses_1", true)
  s.sessionData.set("ses_1", { aborted: false, continuationCount: 3 })

  clearSession(s, "ses_1")

  assert.equal(s.sessionOverrides.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
  assert.equal(s.sessionGenerations.get("ses_1"), 1)
  assert.equal(lease.isCurrent(), true)
  lease.release()
})

test("beginIdleSession promotes a lazy lifecycle and preserves an observed lifecycle", () => {
  const s = createIdleContinuationState()
  s.sessionOverrides.set("ses_1", true)
  const oldLease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(oldLease)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "lazy")
  getSessionData(s, "ses_1").continuationCount = 4

  beginIdleSession(s, "ses_1")

  assert.equal(s.nextGeneration, 2)
  assert.equal(s.sessionGenerations.get("ses_1"), 2)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "observed")
  assert.equal(s.activeLeases.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
  assert.equal(s.sessionOverrides.get("ses_1"), true)
  assert.equal(oldLease.isCurrent(), false)

  const observedLease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(observedLease)
  const observedData = getSessionData(s, "ses_1")
  observedData.continuationCount = 9
  const observedGeneration = s.sessionGenerations.get("ses_1")
  const activeLease = s.activeLeases.get("ses_1")

  beginIdleSession(s, "ses_1")

  assert.equal(s.sessionGenerations.get("ses_1"), observedGeneration)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "observed")
  assert.equal(s.activeLeases.get("ses_1"), activeLease)
  assert.equal(s.sessionData.get("ses_1"), observedData)
  assert.equal(s.sessionOverrides.get("ses_1"), true)
  assert.equal(observedLease.isCurrent(), true)
  observedLease.release()
})

test("invalidateIdleSession blocks lazy revival until an observed creation", () => {
  const s = createIdleContinuationState()
  const lease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(lease)
  s.sessionOverrides.set("ses_1", true)
  getSessionData(s, "ses_1").continuationCount = 2

  invalidateIdleSession(s, "ses_1")

  assert.equal(s.sessionGenerations.has("ses_1"), false)
  assert.equal(s.activeLeases.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
  assert.equal(s.sessionOverrides.has("ses_1"), false)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "deleted")
  assert.equal(lease.isCurrent(), false)
  assert.equal(acquireIdleContinuationLease(s, "ses_1"), undefined)
  assert.equal(s.sessionGenerations.has("ses_1"), false)
  assert.equal(s.activeLeases.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)

  beginIdleSession(s, "ses_1")

  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "observed")
  const replacementLease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(replacementLease)
  replacementLease.release()
})

test("markSessionAborted does not revive an invalidated session", () => {
  const s = createIdleContinuationState()
  invalidateIdleSession(s, "ses_1")

  markSessionAborted(s, "ses_1")

  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "deleted")
  assert.equal(s.sessionGenerations.has("ses_1"), false)
  assert.equal(s.activeLeases.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
})

test("acquireIdleContinuationLease lazily begins a lifecycle and coalesces overlap", () => {
  const s = createIdleContinuationState()

  const first = acquireIdleContinuationLease(s, "ses_1")

  assert.ok(first)
  assert.equal(s.nextGeneration, 1)
  assert.equal(s.sessionGenerations.get("ses_1"), 1)
  assert.equal(typeof s.activeLeases.get("ses_1")?.token, "symbol")
  assert.equal(first.isCurrent(), true)
  assert.equal(acquireIdleContinuationLease(s, "ses_1"), undefined)
  first.release()

  const second = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(second)
  assert.equal(second.isCurrent(), true)
  second.release()
})

test("old releases cannot remove newer same-generation or replacement-generation leases", () => {
  const s = createIdleContinuationState()
  const oldSameGeneration = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(oldSameGeneration)
  oldSameGeneration.release()

  const newerSameGeneration = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(newerSameGeneration)
  oldSameGeneration.release()

  assert.equal(newerSameGeneration.isCurrent(), true)
  assert.equal(acquireIdleContinuationLease(s, "ses_1"), undefined)
  newerSameGeneration.release()

  const oldGeneration = acquireIdleContinuationLease(s, "ses_2")
  assert.ok(oldGeneration)
  beginIdleSession(s, "ses_2")
  const replacementGeneration = acquireIdleContinuationLease(s, "ses_2")
  assert.ok(replacementGeneration)
  oldGeneration.release()

  assert.equal(replacementGeneration.isCurrent(), true)
  assert.equal(acquireIdleContinuationLease(s, "ses_2"), undefined)
  replacementGeneration.release()
})

test("DEFAULT_CONTINUATION_PROMPT is non-empty string", () => {
  assert.equal(typeof DEFAULT_CONTINUATION_PROMPT, "string")
  assert.ok(DEFAULT_CONTINUATION_PROMPT.length > 0)
})
