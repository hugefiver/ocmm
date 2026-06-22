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
  const t = "a <SYSTEM_REMINDER>x</SYSTEM_REMINDER> b  c"
  assert.equal(stripSystemReminders(t).replace(/\s+/g, " ").trim(), "a b c")
})

test("stripSystemReminders does not eat text before a lone closing dcp tag", () => {
  const t = "important instructions here</dcp-system-reminder>"
  // A lone closing tag without an opening tag must not match — the old regex
  // /[\s\S]*?<\/dcp-system-reminder>/ would eat everything before the closer.
  assert.equal(stripSystemReminders(t), t)
})

test("stripSystemReminders removes paired dcp-system-reminder blocks", () => {
  const t = "before <dcp-system-reminder>secret</dcp-system-reminder> after"
  assert.equal(stripSystemReminders(t), "before  after")
})

test("isPlannerAgent recognises plan/planner", () => {
  assert.equal(isPlannerAgent("plan"), true)
  assert.equal(isPlannerAgent("planner"), true)
  assert.equal(isPlannerAgent("PLANNER"), true)
  assert.equal(isPlannerAgent("orchestrator"), false)
  assert.equal(isPlannerAgent(undefined), false)
})
