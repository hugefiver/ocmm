import assert from "node:assert/strict"
import { test } from "node:test"

import {
  PLANNING_AGENT_NAMES,
  isPlanningAgentName,
  isReservedPlanningAgentName,
  parsePlanningAgentName,
} from "./names.ts"

test("planning identities accept canonical normal and supported suffix profiles", () => {
  assert.deepEqual(PLANNING_AGENT_NAMES, ["planner", "plan-critic"])
  for (const role of PLANNING_AGENT_NAMES) {
    assert.deepEqual(parsePlanningAgentName(role), {
      role,
      logicalTier: "normal",
      canonicalName: role,
    })
    assert.equal(isPlanningAgentName(role), true)
    for (const logicalTier of ["low", "high", "max"] as const) {
      const name = `${role}-${logicalTier}`
      assert.deepEqual(parsePlanningAgentName(name), { role, logicalTier, canonicalName: name })
      assert.equal(isPlanningAgentName(name), true)
    }
  }
})

test("planning namespaces reserve malformed and direct config suffix names", () => {
  for (const name of [
    "planner-normal", "planner-2nd", "planner-fast", "plan-critic-normal",
    "plan-critic-2nd", "plan-critic-fast",
  ]) {
    assert.equal(parsePlanningAgentName(name), null, name)
    assert.equal(isPlanningAgentName(name), false, name)
    assert.equal(isReservedPlanningAgentName(name), true, name)
  }
  assert.equal(parsePlanningAgentName("custom-planner"), null)
  assert.equal(isReservedPlanningAgentName("custom-planner"), false)
})
