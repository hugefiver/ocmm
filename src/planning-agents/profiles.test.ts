import assert from "node:assert/strict"
import { test } from "node:test"

import type { AgentEntry } from "../config/schema.ts"
import {
  PLANNING_AGENT_POLICIES,
  expandPlanningAgents,
  expandedPlanningAgentMap,
} from "./profiles.ts"

test("planning expansion emits default normals and only explicit suffixes", () => {
  assert.deepEqual(expandPlanningAgents().map((profile) => profile.name), ["planner", "plan-critic"])

  const profiles = expandPlanningAgents({
    agents: {
      planner: { variants: { high: "max" } },
      "plan-critic": {
        variants: { low: { model: "openai/gpt-5.5", variant: "low" }, max: "max" },
      },
    },
  })
  assert.deepEqual(profiles.map((profile) => profile.name), [
    "planner", "planner-high", "plan-critic", "plan-critic-low", "plan-critic-max",
  ])
  assert.deepEqual(profiles.find((profile) => profile.name === "planner-high")?.policy, {
    promptSource: "planner",
    mode: "all",
    permissionClass: "planner",
    includeLocalePrefix: true,
    reviewEffortFloor: false,
  })
  assert.deepEqual(profiles.find((profile) => profile.name === "plan-critic-low")?.policy, {
    promptSource: "plan-critic",
    mode: "subagent",
    permissionClass: "read-only",
    includeLocalePrefix: false,
    reviewEffortFloor: true,
  })
})

test("planning disable policy cascades from base and isolates exact suffixes", () => {
  const input = {
    agents: {
      planner: { variants: { low: "low" as const, high: "high" as const } },
      "plan-critic": { variants: { low: "low" as const, high: "high" as const } },
    },
    disabledAgents: ["planner-high", "plan-critic"],
  }
  assert.deepEqual(expandPlanningAgents(input).map((profile) => profile.name), ["planner", "planner-low"])

  assert.deepEqual(expandPlanningAgents({
    agents: {
      planner: { disabled: true, variants: { max: "max" } },
      "plan-critic": { variants: { high: "high" } },
    },
  }).map((profile) => profile.name), ["plan-critic", "plan-critic-high"])
})

test("planning profiles preserve tier order, deep clone state, and suppress model-only upgrades", () => {
  const planner: AgentEntry = {
    requirement: {
      variant: "xhigh",
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [
        {
          providers: ["openai"],
          model: "primary",
          variant: "xhigh",
          thinking: { type: "enabled", budgetTokens: 4_096 },
        },
        { providers: ["anthropic"], model: "fallback", variant: "max" },
      ],
    },
    skills: ["writing-plans"],
    permission: { task: "deny" },
    variants: { low: "low", high: { model: "google/gemini-3.1-pro" }, max: "max" },
  }
  const before = structuredClone(planner)
  const profiles = expandPlanningAgents({
    agents: {
      planner,
      "plan-critic": { variants: { low: "low", high: "high", max: "max" } },
    },
  })
  assert.deepEqual(profiles.map((profile) => profile.name), [
    "planner", "planner-low", "planner-high", "planner-max",
    "plan-critic", "plan-critic-low", "plan-critic-high", "plan-critic-max",
  ])

  const map = new Map(profiles.map((profile) => [profile.name, profile]))
  const normal = map.get("planner")!
  const low = map.get("planner-low")!
  const high = map.get("planner-high")!
  assert.equal(high.requirement.fallbackChain[0]?.model, "gemini-3.1-pro")
  assert.deepEqual(high.requirement.fallbackChain[0]?.providers, ["google"])
  assert.equal(high.suppressCatalogUpgrade, true)
  assert.notEqual(normal.requirement, low.requirement)
  assert.notEqual(normal.requirement.fallbackChain[0], low.requirement.fallbackChain[0])
  assert.notEqual(normal.registration, low.registration)
  assert.notEqual(normal.policy, low.policy)

  low.requirement.fallbackChain[0]!.providers.push("mutated")
  low.requirement.fallbackChain[0]!.thinking!.budgetTokens = 1
  low.registration.skills!.push("mutated")
  low.registration.permission!.task = "allow"
  assert.deepEqual(normal.requirement.fallbackChain[0]?.providers, ["openai"])
  assert.equal(normal.requirement.fallbackChain[0]?.thinking?.budgetTokens, 4_096)
  assert.deepEqual(normal.registration.skills, ["writing-plans"])
  assert.deepEqual(normal.registration.permission, { task: "deny" })
  assert.deepEqual(planner, before)
})

test("model-only overrides suppress catalog upgrades on an otherwise default base", () => {
  const profiles = expandedPlanningAgentMap({
    agents: { planner: { variants: { high: { model: "openai/gpt-5.6-sol" } } } },
  })
  assert.equal(profiles.get("planner")?.suppressCatalogUpgrade, false)
  assert.equal(profiles.get("planner-high")?.suppressCatalogUpgrade, true)
  assert.equal(profiles.get("planner-high")?.resolutionSource, "user-config")
  assert.notEqual(profiles.get("planner")?.policy, PLANNING_AGENT_POLICIES.planner)
})
