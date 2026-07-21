import { test } from "node:test"
import assert from "node:assert/strict"

import type { AgentEntry } from "../config/schema.ts"
import type { Agent } from "../shared/types.ts"
import {
  materializeLogicalTierProfiles,
  resolveLogicalTierBase,
  type ResolvedLogicalTierBase,
} from "./materialize.ts"

const base = (): ResolvedLogicalTierBase => ({
  requirement: {
    variant: "xhigh",
    requiresModel: "gpt-5.5",
    requiresProvider: ["openai", "github-copilot"],
    fallbackChain: [
      {
        providers: ["openai", "github-copilot"],
        model: "gpt-5.5",
        variant: "xhigh",
        temperature: 0.2,
        thinking: { type: "enabled", budgetTokens: 4_000 },
      },
      { providers: ["anthropic"], model: "claude-opus-4-7", variant: "xhigh" },
    ],
  },
  registration: {
    description: "canonical role",
    skills: ["writing-plans"],
    permission: { task: "deny" },
  },
  resolutionSource: "agent-default",
  suppressCatalogUpgrade: false,
})

test("materialization emits normal plus explicit tiers without sharing mutable state", () => {
  const source = base()
  const before = structuredClone(source)
  const profiles = materializeLogicalTierProfiles({
    baseName: "planner",
    base: source,
    variants: {
      low: "low",
      high: { model: "openai/gpt-5.6-sol" },
      max: { model: "openai/gpt-5.6-sol", variant: "max" },
    },
    isDisabled: () => false,
  })

  assert.deepEqual(profiles.map(({ name, logicalTier }) => [name, logicalTier]), [
    ["planner", "normal"],
    ["planner-low", "low"],
    ["planner-high", "high"],
    ["planner-max", "max"],
  ])
  assert.equal(profiles[1]!.requirement.variant, "low")
  assert.deepEqual(profiles[1]!.requirement.fallbackChain.map((entry) => entry.variant), ["low", "low"])

  const high = profiles[2]!
  assert.equal(high.requirement.fallbackChain[0]!.model, "gpt-5.6-sol")
  assert.deepEqual(high.requirement.fallbackChain[0]!.providers, ["openai"])
  assert.equal(high.requirement.fallbackChain[0]!.variant, "xhigh")
  assert.equal(high.requirement.fallbackChain[0]!.temperature, 0.2)
  assert.equal(high.requirement.fallbackChain[1]!.model, "claude-opus-4-7")
  assert.equal(high.requirement.variant, "xhigh")
  assert.equal(high.requirement.requiresModel, "gpt-5.6-sol")
  assert.deepEqual(high.requirement.requiresProvider, ["openai", "anthropic"])
  assert.equal(high.suppressCatalogUpgrade, true)

  const max = profiles[3]!
  assert.equal(max.requirement.variant, "max")
  assert.deepEqual(max.requirement.fallbackChain.map((entry) => entry.variant), ["max", "max"])
  assert.deepEqual(profiles.slice(1).map((profile) => profile.resolutionSource), ["user-config", "user-config", "user-config"])

  profiles[1]!.requirement.fallbackChain[0]!.providers.push("mutated")
  profiles[1]!.requirement.fallbackChain[0]!.thinking!.budgetTokens = 1
  profiles[1]!.registration.skills!.push("mutated")
  profiles[1]!.registration.permission!.task = "allow"
  assert.deepEqual(profiles[0]!.requirement.fallbackChain[0]!.providers, ["openai", "github-copilot"])
  assert.equal(profiles[0]!.requirement.fallbackChain[0]!.thinking!.budgetTokens, 4_000)
  assert.deepEqual(profiles[0]!.registration.skills, ["writing-plans"])
  assert.deepEqual(profiles[0]!.registration.permission, { task: "deny" })
  assert.deepEqual(source, before)
})

test("materialization omits absent and disabled tiers", () => {
  const profiles = materializeLogicalTierProfiles({
    baseName: "plan-critic",
    base: base(),
    variants: { low: "low", high: "high" },
    isDisabled: (name) => name === "plan-critic-high",
  })
  assert.deepEqual(profiles.map((profile) => profile.name), ["plan-critic", "plan-critic-low"])
})

test("model-only overrides remove an existing provider constraint for an unqualified model", () => {
  const profile = materializeLogicalTierProfiles({
    baseName: "planner",
    base: base(),
    variants: { high: { model: "local-model" } },
    isDisabled: () => false,
  }).find(({ name }) => name === "planner-high")!

  assert.deepEqual(profile.requirement.fallbackChain[0]!.providers, [])
  assert.equal(profile.requirement.fallbackChain[0]!.model, "local-model")
  assert.equal(profile.requirement.requiresModel, "local-model")
  assert.equal(profile.requirement.requiresProvider, undefined)
  assert.equal(profile.requirement.variant, "xhigh")
  assert.equal(profile.requirement.fallbackChain[0]!.variant, "xhigh")
  assert.equal(profile.suppressCatalogUpgrade, true)
})

test("resolveLogicalTierBase returns null without a configured entry or builtin", () => {
  assert.equal(resolveLogicalTierBase({ baseName: "custom" }), null)
})

test("resolveLogicalTierBase returns null for a disabled normal entry", () => {
  const builtin: Agent = {
    name: "planner",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "builtin" }] },
  }
  assert.equal(resolveLogicalTierBase({
    baseName: "planner",
    agents: { planner: { disabled: true, model: "openai/configured" } },
    builtin,
  }), null)
})

test("resolveLogicalTierBase clones direct configured requirements and registration", () => {
  const configured: AgentEntry = {
    requirement: {
      requiresProvider: ["openai"],
      fallbackChain: [{
        providers: ["openai"],
        model: "configured",
        thinking: { type: "enabled", budgetTokens: 2_000 },
      }],
    },
    tools: { read: true },
    permission: { task: "deny" },
    skills: ["writing-plans"],
    thinking: { type: "enabled", budgetTokens: 1_000 },
  }
  const resolved = resolveLogicalTierBase({ baseName: "custom", agents: { custom: configured } })!

  assert.equal(resolved.resolutionSource, "user-config")
  assert.equal(resolved.suppressCatalogUpgrade, true)
  assert.deepEqual(resolved.registration.tools, { read: true })
  assert.deepEqual(resolved.registration.permission, { task: "deny" })
  assert.deepEqual(resolved.registration.skills, ["writing-plans"])

  resolved.requirement.requiresProvider!.push("mutated")
  resolved.requirement.fallbackChain[0]!.providers.push("mutated")
  resolved.requirement.fallbackChain[0]!.thinking!.budgetTokens = 1
  resolved.registration.tools!.read = false
  resolved.registration.skills!.push("mutated")
  resolved.registration.thinking!.budgetTokens = 1
  assert.deepEqual(configured.requirement?.requiresProvider, ["openai"])
  assert.deepEqual(configured.requirement?.fallbackChain[0]!.providers, ["openai"])
  assert.equal(configured.requirement?.fallbackChain[0]!.thinking?.budgetTokens, 2_000)
  assert.deepEqual(configured.tools, { read: true })
  assert.deepEqual(configured.skills, ["writing-plans"])
  assert.equal(configured.thinking?.budgetTokens, 1_000)
})

test("resolveLogicalTierBase resolves configured builtin default aliases as user config", () => {
  const builtin: Agent = {
    name: "oracle",
    description: "builtin description",
    defaultAlias: "reviewer",
    requirement: { fallbackChain: [{ providers: ["anthropic"], model: "builtin" }] },
  }
  const resolved = resolveLogicalTierBase({
    baseName: "oracle",
    agents: {
      oracle: { skills: ["requesting-code-review"] },
      reviewer: { model: "openai/configured-alias" },
    },
    builtin,
  })!

  assert.deepEqual(resolved.requirement.fallbackChain, [{ providers: ["openai"], model: "configured-alias" }])
  assert.deepEqual(resolved.registration, {
    description: "builtin description",
    skills: ["requesting-code-review"],
  })
  assert.equal(resolved.resolutionSource, "user-config")
  assert.equal(resolved.suppressCatalogUpgrade, true)
})

test("resolveLogicalTierBase clones builtin defaults with agent-default metadata", () => {
  const builtin: Agent = {
    name: "planner",
    description: "builtin description",
    requirement: {
      requiresProvider: ["openai"],
      fallbackChain: [{ providers: ["openai"], model: "builtin" }],
    },
  }
  const resolved = resolveLogicalTierBase({ baseName: "planner", builtin })!

  assert.deepEqual(resolved.registration, { description: "builtin description" })
  assert.equal(resolved.resolutionSource, "agent-default")
  assert.equal(resolved.suppressCatalogUpgrade, false)
  resolved.requirement.requiresProvider!.push("mutated")
  resolved.requirement.fallbackChain[0]!.providers.push("mutated")
  assert.deepEqual(builtin.requirement.requiresProvider, ["openai"])
  assert.deepEqual(builtin.requirement.fallbackChain[0]!.providers, ["openai"])
})

test("resolveLogicalTierBase uses builtin defaults for metadata-only configured entries", () => {
  const builtin: Agent = {
    name: "planner",
    description: "builtin description",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "builtin" }] },
  }
  const resolved = resolveLogicalTierBase({
    baseName: "planner",
    agents: { planner: { description: "configured description" } },
    builtin,
  })!

  assert.deepEqual(resolved.registration, { description: "configured description" })
  assert.equal(resolved.requirement.fallbackChain[0]!.model, "builtin")
  assert.equal(resolved.resolutionSource, "agent-default")
  assert.equal(resolved.suppressCatalogUpgrade, false)
})

test("resolveLogicalTierBase rejects configured nonbuiltins without a normal requirement", () => {
  assert.throws(
    () => resolveLogicalTierBase({ baseName: "custom", agents: { custom: { description: "metadata only" } } }),
    new Error("logical tier base custom must resolve a normal model requirement before registration"),
  )
})
