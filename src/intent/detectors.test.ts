import { test } from "node:test"
import assert from "node:assert/strict"

import { detectIntent, isPlannerAgent, stripSystemReminders } from "./detectors.ts"

test("detectIntent finds bare ultrawork keywords", () => {
  assert.deepEqual(detectIntent("please ultrawork on this")?.type, "ultrawork")
  assert.deepEqual(detectIntent("ulw the refactor")?.type, "ultrawork")
  assert.deepEqual(detectIntent("ULW please")?.type, "ultrawork")
  assert.equal(detectIntent("ultrawords are fine"), null) // word boundary
})

test("detectIntent finds team / hyperplan", () => {
  assert.deepEqual(detectIntent("kick off team-mode")?.type, "team")
  assert.deepEqual(detectIntent("hyperplan this")?.type, "hyperplan")
  assert.deepEqual(detectIntent("hpp first")?.type, "hyperplan")
})

test("detectIntent recognises composite keyword", () => {
  assert.deepEqual(detectIntent("hyperplan ultrawork")?.type, "hyperplan-ultrawork")
  assert.deepEqual(detectIntent("ulw hpp")?.type, "hyperplan-ultrawork")
})

test("detectIntent ignores text inside SYSTEM_REMINDER blocks", () => {
  const text = "<SYSTEM_REMINDER>ultrawork mandatory</SYSTEM_REMINDER>plain ask"
  assert.equal(detectIntent(text), null)
})

test("stripSystemReminders removes both reminder shapes", () => {
  const t = "a <SYSTEM_REMINDER>x</SYSTEM_REMINDER> b <dcp-system-reminder>y</dcp-system-reminder> c"
  assert.equal(stripSystemReminders(t).replace(/\s+/g, " ").trim(), "a b c")
})

test("isPlannerAgent recognises plan/prometheus", () => {
  assert.equal(isPlannerAgent("plan"), true)
  assert.equal(isPlannerAgent("prometheus"), true)
  assert.equal(isPlannerAgent("PROMETHEUS"), true)
  assert.equal(isPlannerAgent("sisyphus"), false)
  assert.equal(isPlannerAgent(undefined), false)
})
