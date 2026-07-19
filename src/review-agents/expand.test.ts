import { test } from "node:test"
import assert from "node:assert/strict"

import type { AgentEntry } from "../config/schema.ts"
import { ORACLE_SLOT_NAMES } from "./names.ts"
import { expandReviewAgents, expandedReviewAgentMap } from "./expand.ts"

test("expands built-in normal slots and only explicitly configured later slots and tiers", () => {
  const agents: Record<string, AgentEntry> = {
    oracle: { variants: { high: "max" } },
    "oracle-3rd": { model: "anthropic/claude-opus-4-7", variants: { low: "high" } },
    reviewer: { variants: { max: { model: "openai/gpt-5.6-sol", variant: "max" } } },
  }
  const names = expandReviewAgents({ agents }).map((profile) => profile.name)
  assert.deepEqual(names.filter((name) => name.startsWith("oracle")), [
    "oracle", "oracle-high", "oracle-2nd", "oracle-3rd", "oracle-3rd-low",
  ])
  assert.deepEqual(names.filter((name) => name.startsWith("reviewer")), ["reviewer", "reviewer-max"])
  for (const slot of ORACLE_SLOT_NAMES.slice(3)) assert.equal(names.includes(slot), false)
})

test("oracle slots retain priority order without dispatch or automatic fan-out", () => {
  const agents: Record<string, AgentEntry> = {
    "oracle-5th": { model: "e/five" },
    "oracle-3rd": { model: "c/three" },
  }
  const normals = expandReviewAgents({ agents })
    .filter((profile) => profile.identity.role === "oracle" && profile.identity.logicalTier === "normal")
    .map((profile) => profile.name)
  assert.deepEqual(normals, ["oracle", "oracle-2nd", "oracle-3rd", "oracle-5th"])
})

test("built-in normal slots do not synthesize logical tiers", () => {
  const names = expandReviewAgents().map((profile) => profile.name)
  assert.deepEqual(names, ["oracle", "oracle-2nd", "reviewer"])
  assert.equal(names.includes("oracle-high"), false)
  assert.equal(names.includes("oracle-2nd-high"), false)
})

test("tier expansion deep-clones requirements and materializes native variants across fallbacks", () => {
  const normal: AgentEntry = {
    requirement: {
      variant: "xhigh",
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [
        { providers: ["openai"], model: "primary", variant: "xhigh", temperature: 0.2, thinking: { type: "enabled", budgetTokens: 4096 } },
        { providers: ["anthropic"], model: "fallback", variant: "max", maxTokens: 12000 },
      ],
    },
    tools: { read: true, task: false },
    permission: { webfetch: "allow" },
    skills: ["requesting-code-review"],
    promptAppend: "Review the actual diff.",
    temperature: 0.4,
    variants: {
      low: "low",
      high: { model: "google/gemini-3.1-pro" },
      max: { model: "openai/gpt-5.6-sol", variant: "max" },
    },
  }
  const agents = { "oracle-3rd": normal }
  const before = structuredClone(agents)
  const profiles = expandedReviewAgentMap({ agents })

  const low = profiles.get("oracle-3rd-low")!
  assert.equal(low.requirement.variant, "low")
  assert.deepEqual(low.requirement.fallbackChain.map((entry) => entry.variant), ["low", "low"])

  const high = profiles.get("oracle-3rd-high")!
  assert.deepEqual(high.requirement.fallbackChain.map((entry) => `${entry.providers[0]}/${entry.model}`), [
    "google/gemini-3.1-pro", "anthropic/fallback",
  ])
  assert.deepEqual(high.requirement.requiresProvider, ["google", "anthropic"])
  assert.equal(high.requirement.fallbackChain[0]?.variant, "xhigh")
  assert.equal(high.requirement.fallbackChain[0]?.temperature, 0.2)

  const max = profiles.get("oracle-3rd-max")!
  assert.deepEqual(max.requirement.fallbackChain.map((entry) => entry.variant), ["max", "max"])
  assert.deepEqual(max.registration.skills, ["requesting-code-review"])
  assert.equal(max.registration.promptAppend, "Review the actual diff.")
  assert.deepEqual(agents, before)
  assert.notEqual(max.requirement, normal.requirement)
  assert.notEqual(max.requirement.fallbackChain[0], normal.requirement?.fallbackChain[0])
})

test("variant-only tier is user-configured but inherits catalog suppression from normal", () => {
  const builtinTier = expandedReviewAgentMap({ agents: { oracle: { variants: { high: "max" } } } }).get("oracle-high")!
  assert.equal(builtinTier.resolutionSource, "user-config")
  assert.equal(builtinTier.suppressCatalogUpgrade, false)

  const explicitTier = expandedReviewAgentMap({
    agents: { oracle: { model: "openai/gpt-5.6-terra", variants: { high: "max" } } },
  }).get("oracle-high")!
  assert.equal(explicitTier.suppressCatalogUpgrade, true)
})

test("unsuffixed disable cascades while suffixed disable is profile-only", () => {
  const agents: Record<string, AgentEntry> = {
    oracle: { variants: { high: "max", max: "max" } },
    reviewer: { variants: { high: "xhigh" } },
  }
  assert.deepEqual(
    expandReviewAgents({ agents, disabledAgents: ["oracle-high"] }).map((profile) => profile.name).filter((name) => name.startsWith("oracle")),
    ["oracle", "oracle-max", "oracle-2nd"],
  )
  assert.equal(expandReviewAgents({ agents, disabledAgents: ["oracle"] }).some((profile) => profile.name.startsWith("oracle") && !profile.name.startsWith("oracle-2nd")), false)
  assert.equal(expandReviewAgents({ agents, disabledAgents: ["oracle-second"] }).some((profile) => profile.name.startsWith("oracle-2nd")), false)
  assert.equal(expandReviewAgents({ agents: { reviewer: { ...agents.reviewer, disabled: true } } }).some((profile) => profile.name.startsWith("reviewer")), false)
})

test("later slot must resolve a normal requirement before any tier can exist", () => {
  assert.throws(
    () => expandReviewAgents({ agents: { "oracle-4th": { description: "missing model", variants: { high: "max" } } } }),
    /oracle-4th.*normal model requirement/,
  )
})
