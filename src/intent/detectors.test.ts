import { test } from "node:test"
import assert from "node:assert/strict"

import { isPlannerAgent, stripSystemReminders } from "./detectors.ts"

test("stripSystemReminders removes both reminder shapes", () => {
  const t = "a <SYSTEM_REMINDER>x</SYSTEM_REMINDER> b  c"
  assert.equal(stripSystemReminders(t).replace(/\s+/g, " ").trim(), "a b c")
})

test("stripSystemReminders does not eat text before a lone closing dcp tag", () => {
  const t = "important instructions here"
  assert.equal(stripSystemReminders(t), t)
})

test("stripSystemReminders removes paired dcp-system-reminder blocks", () => {
  const t = "before <dcp-system-reminder>inner</dcp-system-reminder> after"
  assert.equal(stripSystemReminders(t), "before  after")
})

test("isPlannerAgent recognises plan/planner", () => {
  assert.equal(isPlannerAgent("plan"), true)
  assert.equal(isPlannerAgent("planner"), true)
  assert.equal(isPlannerAgent("PLANNER"), true)
  assert.equal(isPlannerAgent("orchestrator"), false)
  assert.equal(isPlannerAgent(undefined), false)
})
