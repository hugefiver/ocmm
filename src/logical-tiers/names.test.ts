import { test } from "node:test"
import assert from "node:assert/strict"

import {
  LOGICAL_TIER_ORDER,
  LOGICAL_TIER_SUFFIXES,
  logicalTierProfileName,
  splitLogicalTierProfileName,
} from "./names.ts"

test("logical tier names keep normal unsuffixed and parse only supported suffixes", () => {
  assert.deepEqual(LOGICAL_TIER_SUFFIXES, ["low", "high", "max"])
  assert.deepEqual(LOGICAL_TIER_ORDER, ["normal", "low", "high", "max"])
  assert.deepEqual(splitLogicalTierProfileName("planner"), { baseName: "planner", logicalTier: "normal" })
  assert.deepEqual(splitLogicalTierProfileName("planner-high"), { baseName: "planner", logicalTier: "high" })
  assert.deepEqual(splitLogicalTierProfileName("plan-critic-max"), { baseName: "plan-critic", logicalTier: "max" })
  assert.deepEqual(splitLogicalTierProfileName("planner-normal"), { baseName: "planner-normal", logicalTier: "normal" })
  assert.equal(logicalTierProfileName("planner", "normal"), "planner")
  assert.equal(logicalTierProfileName("planner", "low"), "planner-low")
})
