import { test } from "node:test"
import assert from "node:assert/strict"

import {
  ORACLE_SLOT_NAMES,
  canonicalizeReviewAgentName,
  isReservedReviewAgentName,
  parseReviewAgentName,
} from "./names.ts"

test("parses all nine Oracle slots and every logical tier", () => {
  for (const [index, slot] of ORACLE_SLOT_NAMES.entries()) {
    for (const tier of ["normal", "low", "high", "max"] as const) {
      const name = tier === "normal" ? slot : `${slot}-${tier}`
      assert.deepEqual(parseReviewAgentName(name), {
        role: "oracle",
        ordinal: index + 1,
        logicalTier: tier,
        canonicalSlot: slot,
        canonicalName: name,
      })
    }
  }
})

test("Reviewer supports tiers but never ordinal slots", () => {
  for (const tier of ["normal", "low", "high", "max"] as const) {
    const name = tier === "normal" ? "reviewer" : `reviewer-${tier}`
    assert.deepEqual(parseReviewAgentName(name), {
      role: "reviewer",
      ordinal: 1,
      logicalTier: tier,
      canonicalSlot: "reviewer",
      canonicalName: name,
    })
  }
  assert.equal(parseReviewAgentName("reviewer-2nd"), null)
})

test("runtime oracle-second alias canonicalizes only the unsuffixed second slot", () => {
  assert.equal(canonicalizeReviewAgentName("oracle-second"), "oracle-2nd")
  assert.equal(parseReviewAgentName("oracle-second")?.ordinal, 2)
  assert.equal(parseReviewAgentName("oracle-second-high"), null)
})

test("rejects malformed and out-of-range reserved review names", () => {
  for (const name of [
    "oracle-2", "oracle-10th", "oracle-normal", "oracle-2nd-normal",
    "oracle-0th", "oracle-tenth", "reviewer-normal", "reviewer-9th",
  ]) {
    assert.equal(parseReviewAgentName(name), null, name)
    assert.equal(isReservedReviewAgentName(name), true, name)
  }
  assert.equal(isReservedReviewAgentName("review-helper"), false)
})
