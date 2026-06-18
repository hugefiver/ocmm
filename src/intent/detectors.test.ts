import { test } from "node:test"
import assert from "node:assert/strict"

import { detectIntent, isPlannerAgent, stripSystemReminders } from "./detectors.ts"

test("detectIntent finds bare deepwork keywords", () => {
  assert.equal(detectIntent("please deepwork on this")?.type, "deepwork")
  assert.equal(detectIntent("dw the refactor")?.type, "deepwork")
  assert.equal(detectIntent("DW please")?.type, "deepwork")
  assert.equal(detectIntent("deepworks are fine"), null)
})

test("detectIntent finds team / superplan", () => {
  assert.equal(detectIntent("kick off team-mode")?.type, "team")
  assert.equal(detectIntent("superplan this")?.type, "superplan")
  assert.equal(detectIntent("sp first")?.type, "superplan")
})

test("detectIntent recognises composite keyword", () => {
  assert.equal(detectIntent("superplan deepwork")?.type, "superplan-deepwork")
  assert.equal(detectIntent("dw sp")?.type, "superplan-deepwork")
})

test("detectIntent ignores text inside SYSTEM_REMINDER blocks", () => {
  const text = "<SYSTEM_REMINDER>deepwork mandatory</SYSTEM_REMINDER>plain ask"
  assert.equal(detectIntent(text), null)
})

test("stripSystemReminders removes both reminder shapes", () => {
  const t = "a <SYSTEM_REMINDER>x</SYSTEM_REMINDER> b <dcp-system-reminder>y</dcp-system-reminder> c"
  assert.equal(stripSystemReminders(t).replace(/\s+/g, " ").trim(), "a b c")
})

test("isPlannerAgent recognises plan/planner", () => {
  assert.equal(isPlannerAgent("plan"), true)
  assert.equal(isPlannerAgent("planner"), true)
  assert.equal(isPlannerAgent("PLANNER"), true)
  assert.equal(isPlannerAgent("orchestrator"), false)
  assert.equal(isPlannerAgent(undefined), false)
})
