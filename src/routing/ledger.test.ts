import { test } from "node:test"
import assert from "node:assert/strict"

import {
  createResolutionLedger,
  recordResolution,
  recentResolutions,
  clearResolutions,
  onResolution,
} from "./ledger.ts"

const sampleEntry = {
  ts: 1000,
  sessionID: "ses-1",
  agent: "reviewer",
  input: { providerID: "openai", modelID: "gpt-5.5" },
  applied: { variant: "high" as const },
  source: "agent-default" as const,
}

test("independent ledgers do not share entries", () => {
  const a = createResolutionLedger()
  const b = createResolutionLedger()

  a.recordResolution(sampleEntry)

  assert.equal(a.recentResolutions().length, 1)
  assert.equal(b.recentResolutions().length, 0)
})

test("independent ledgers do not share listeners", () => {
  const a = createResolutionLedger()
  const b = createResolutionLedger()

  let aFired = 0
  let bFired = 0

  a.onResolution(() => aFired++)
  b.onResolution(() => bFired++)

  a.recordResolution(sampleEntry)

  assert.equal(aFired, 1)
  assert.equal(bFired, 0)
})

test("clear on one ledger does not affect another", () => {
  const a = createResolutionLedger()
  const b = createResolutionLedger()

  a.recordResolution(sampleEntry)
  b.recordResolution(sampleEntry)

  a.clearResolutions()

  assert.equal(a.recentResolutions().length, 0)
  assert.equal(b.recentResolutions().length, 1)
})

test("default singleton wrappers still work", () => {
  clearResolutions()

  recordResolution(sampleEntry)

  assert.equal(recentResolutions().length, 1)
  assert.equal(recentResolutions()[0]!.sessionID, "ses-1")
})

test("default singleton onResolution fires and unsubscribe works", () => {
  clearResolutions()

  let count = 0
  const unsub = onResolution(() => count++)

  recordResolution(sampleEntry)
  assert.equal(count, 1)

  unsub()
  recordResolution(sampleEntry)
  assert.equal(count, 1)
})

test("default singleton clearResolutions clears entries", () => {
  recordResolution(sampleEntry)
  clearResolutions()
  assert.equal(recentResolutions().length, 0)
})
