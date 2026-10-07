import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModelRequirement } from "../shared/types.ts"
import { defaultConfig } from "../config/schema.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import { BUILTIN_CATEGORY_INDEX } from "../data/categories.ts"
import { materializeSelectedPrimary } from "./effective-route.ts"
import { resolveModelRouting } from "./resolver.ts"
import {
  matchRequirementSuccessor,
  matchRequirementSuccessorWithIndex,
  selectCatalogModel,
} from "./model-upgrades.ts"

const reviewerRequirement: ModelRequirement = {
  fallbackChain: [
    {
      providers: ["openai", "github-copilot"],
      model: "gpt-5.5",
      variant: "high",
      reasoningEffort: "high",
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 12_000,
      thinking: { type: "enabled", budgetTokens: 4_000 },
    },
  ],
}

test("Astra heads select only cataloged same-lane successors before Sol candidates", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai", "github-copilot"], model: "gpt-6-astra", variant: "max", temperature: 0.1 },
      { providers: ["openai", "github-copilot"], model: "gpt-6.1-sol", variant: "xhigh", temperature: 0.2 },
      { providers: ["openai"], model: "gpt-5.5", variant: "xhigh" },
    ],
  }
  const target = { provider: {
    "github-copilot": { models: { "gpt-6.2-astra": {} } },
    openai: { models: {
      "gpt-6-astra": {}, "gpt-6.1-astra": {}, "gpt-6.2-astra": {},
      "gpt-6.9-sol": {}, "gpt-7": {}, "gpt-8-luna": {}, "gpt-9-astral": {},
    } },
    unrelated: { models: { "gpt-10-astra": {} } },
  } }
  assert.equal(selectCatalogModel(target, "deep", requirement), "openai/gpt-6.2-astra")
  const match = matchRequirementSuccessorWithIndex(requirement, "openai", "gpt-6.2-astra")
  assert.deepEqual(match, {
    baselineIndex: 0,
    entry: { ...requirement.fallbackChain[0], providers: ["openai"], model: "gpt-6.2-astra" },
  })
  const materialized = materializeSelectedPrimary(requirement, "openai/gpt-6.2-astra")
  assert.deepEqual(materialized.fallbackChain, [match!.entry, ...requirement.fallbackChain.slice(1)])
  const resolved = resolveModelRouting({
    agentName: "deep", providerID: "openai", modelID: "gpt-6.2-astra",
    effectiveRequirement: { requirement, source: "category-default" },
  })
  assert.equal(resolved?.entry.model, "gpt-6.2-astra")
  assert.equal(resolved?.entry.temperature, 0.1)
  assert.equal(resolved?.variant, "max")
  assert.equal(matchRequirementSuccessor(requirement, "unrelated", "gpt-6.3-astra"), null)
  for (const model of ["gpt-7", "gpt-7-preview", "gpt-6.3-luna", "gpt-6.3-astral"]) {
    assert.equal(matchRequirementSuccessor(requirement, "openai", model), null, model)
  }
})

test("new Sol defaults outrank Oracle legacy compatibility and keep same-Sol upgrades", () => {
  const oracle = BUILTIN_AGENT_INDEX.get("oracle")!.requirement
  const target = { provider: { openai: { models: {
    "gpt-5.4": {}, "gpt-5.5": {}, "gpt-6.1-sol": {}, "gpt-6.2-sol": {}, "gpt-6.3-astra": {},
  } } } }
  for (const role of ["oracle", "oracle-low", "oracle-high"]) {
    assert.equal(selectCatalogModel(target, role, oracle), "openai/gpt-6.2-sol", role)
  }
  const match = matchRequirementSuccessorWithIndex(oracle, "openai", "gpt-6.2-sol")
  const baselineIndex = oracle.fallbackChain.findIndex((entry) => entry.model === "gpt-6.1-sol")
  assert.equal(match?.baselineIndex, baselineIndex)
  assert.deepEqual(match?.entry, { ...oracle.fallbackChain[baselineIndex], providers: ["openai"], model: "gpt-6.2-sol" })
  assert.equal(selectCatalogModel({ provider: { openai: { models: { "gpt-5.4": {}, "gpt-5.5": {} } } } }, "oracle", oracle), "openai/gpt-5.4")
})

test("Astra and Sol successors cannot downgrade an existing newer same-lane baseline", () => {
  for (const lane of ["astra", "sol"] as const) {
    const requirement: ModelRequirement = { fallbackChain: [
      { providers: ["openai"], model: `gpt-6.2-${lane}`, variant: "xhigh" },
      { providers: ["openai"], model: "gpt-5.5", variant: "high" },
    ] }
    assert.equal(matchRequirementSuccessor(requirement, "openai", `gpt-6.1-${lane}`), null)
    assert.equal(selectCatalogModel({ provider: { openai: { models: { [`gpt-6.1-${lane}`]: {} } } } }, "reviewer", requirement), undefined)
  }
})

test("Astra successor matching retains its own baseline index and controls behind unrelated GPT entries", () => {
  const requirement: ModelRequirement = { fallbackChain: [
    { providers: ["openai"], model: "gpt-6.1-sol", variant: "high", temperature: 0.2 },
    { providers: ["openai"], model: "gpt-6-astra", variant: "max", reasoningEffort: "max", maxTokens: 16_000 },
    { providers: ["openai"], model: "gpt-5.5", variant: "xhigh" },
  ] }
  for (const model of ["gpt-6.1-astra", "gpt-6.2-astra-fast", "gpt-7-astra"]) {
    const match = matchRequirementSuccessorWithIndex(requirement, "openai", model)
    assert.deepEqual(match, {
      baselineIndex: 1,
      entry: { ...requirement.fallbackChain[1], model },
    })
    assert.deepEqual(materializeSelectedPrimary(requirement, `openai/${model}`).fallbackChain, [
      match!.entry, requirement.fallbackChain[0], requirement.fallbackChain[2],
    ])
  }
})

test("Astra catalog upgrades use only exact observed provider/model keys", () => {
  const requirement = BUILTIN_CATEGORY_INDEX.get("hard-reasoning")!.requirement
  for (const model of ["gpt-6.1-astra", "gpt-6.2-astra-fast", "gpt-7-astra"]) {
    const target = { provider: { "github-copilot": { models: { [model]: {} } } } }
    assert.equal(selectCatalogModel(target, "hard-reasoning", requirement), `github-copilot/${model}`)
  }
  for (const models of [undefined, {}, { "gpt-7": {}, "gpt-8-sol": {}, "gpt-9-astral": {}, "gpt-5.9-astra": {} }]) {
    const target = { provider: { openai: { models }, other: { models: { "gpt-9-astra": {} } } } }
    // A declared Sol fallback may be selected, but no generic GPT becomes Astra.
    assert.equal(selectCatalogModel(target, "hard-reasoning", requirement), models && "gpt-8-sol" in models ? "openai/gpt-8-sol" : undefined)
  }
})

test("runtime catalog upgrades leave explicit user models authoritative", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      orchestrator: { model: "openai/gpt-5.5", variant: "high" as const },
      planner: { model: "openai/gpt-5.6-sol", variant: "max" as const },
      oracle: { model: "openai/gpt-5.4", variant: "xhigh" as const },
    },
    categories: { quick: { model: "openai/gpt-5.4-mini", variant: "low" as const } },
  }
  const target = { agent: {} as Record<string, unknown>, provider: { openai: { models: {
    "gpt-6-astra": {}, "gpt-6.2-astra": {}, "gpt-6.1-sol": {}, "gpt-6.2-sol": {}, "gpt-6-luna": {},
  } } } }
  await createConfigHandler({ getConfig: () => config, cwd: process.cwd() })(target, undefined)
  for (const [name, model] of [
    ["orchestrator", "openai/gpt-5.5"], ["planner", "openai/gpt-5.6-sol"],
    ["oracle", "openai/gpt-5.4"], ["quick", "openai/gpt-5.4-mini"],
    ["builder", "openai/gpt-6.2-sol"], ["deep", "openai/gpt-6.2-astra"],
  ] as const) {
    assert.equal((target.agent[name] as { model?: string }).model, model, name)
  }
})

test("legacy lane scans retain the first GPT baseline's provider tie order", () => {
  const requirement: ModelRequirement = { fallbackChain: [
    { providers: ["openai", "github-copilot"], model: "gpt-5.5" },
    { providers: ["github-copilot", "openai"], model: "gpt-5.6-sol" },
  ] }
  const target = { provider: {
    "github-copilot": { models: { "gpt-5.7-sol": {} } },
    openai: { models: { "gpt-5.7-sol": {} } },
  } }
  assert.equal(selectCatalogModel(target, "builder", requirement), "openai/gpt-5.7-sol")
})

test("catalog ties follow the compatible fallback provider order", () => {
  const target = {
    provider: {
      "github-copilot": { models: { "gpt-5.6-sol": {} } },
      openai: { models: { "gpt-5.6-sol": {} } },
    },
  }

  assert.equal(selectCatalogModel(target, "reviewer", reviewerRequirement), "openai/gpt-5.6-sol")
})

test("oracle catalog selection prefers exact cross-generation GPT fallbacks before Terra successors", () => {
  const oracleRequirement: ModelRequirement = { fallbackChain: [
    { providers: ["openai"], model: "gpt-5.4", variant: "xhigh" },
    { providers: ["openai"], model: "gpt-5.6-terra", variant: "xhigh" },
    { providers: ["openai"], model: "gpt-5.5", variant: "xhigh" },
  ] }

  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.4": {}, "gpt-5.5": {}, "gpt-5.6-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.4",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.5": {}, "gpt-5.6-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.5",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.7-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.7-terra",
  )
})

test("review catalog lanes ignore logical tier suffixes", () => {
  const target = { provider: { openai: { models: {
    "gpt-6.2-sol": {}, "gpt-6.2-terra": {},
  } } } }
  const oracle = BUILTIN_AGENT_INDEX.get("oracle")!.requirement
  const second = BUILTIN_AGENT_INDEX.get("oracle-2nd")!.requirement
  assert.equal(selectCatalogModel(target, "oracle-low", oracle), "openai/gpt-6.2-sol")
  assert.equal(selectCatalogModel(target, "oracle-high", oracle), "openai/gpt-6.2-sol")
  assert.equal(selectCatalogModel(target, "oracle-2nd-max", second), "openai/gpt-6.2-sol")
  assert.equal(selectCatalogModel(target, "reviewer-high", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement), "openai/gpt-6.2-sol")
})

test("planning catalog lanes ignore logical tier suffixes", () => {
  const target = { provider: { openai: { models: {
    "gpt-6.2-sol": {}, "gpt-6.2-astra": {},
  } } } }
  assert.equal(
    selectCatalogModel(target, "planner-high", BUILTIN_AGENT_INDEX.get("planner")!.requirement),
    "openai/gpt-6.2-astra",
  )
  assert.equal(
    selectCatalogModel(target, "plan-critic-low", BUILTIN_AGENT_INDEX.get("plan-critic")!.requirement),
    "openai/gpt-6.2-astra",
  )
})

test("later Oracle slots receive no invented GPT lane", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", variant: "xhigh" as const }],
  }
  const target = { provider: { openai: { models: { "gpt-5.7-sol": {}, "gpt-5.7-terra": {} } } } }
  assert.equal(selectCatalogModel(target, "oracle-3rd", requirement), undefined)
})

test("successor matching prefers same GPT lane baseline before cross-generation entries", () => {
  const oracleRequirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4", variant: "xhigh", temperature: 0.1 },
      { providers: ["openai"], model: "gpt-5.5", variant: "xhigh", temperature: 0.2 },
      { providers: ["openai"], model: "gpt-5.6-terra", variant: "xhigh", temperature: 0.3 },
    ],
  }

  assert.deepEqual(matchRequirementSuccessor(oracleRequirement, "openai", "gpt-5.7-terra"), {
    providers: ["openai"],
    model: "gpt-5.7-terra",
    variant: "xhigh",
    temperature: 0.3,
  })
})

test("catalog rejects GPT Sol and Terra models older than 5.6", () => {
  const target = {
    provider: {
      openai: {
        models: {
          "gpt-4.9-sol": {},
          "gpt-5.5-sol": {},
          "gpt-5.5-terra": {},
        },
      },
    },
  }

  assert.equal(selectCatalogModel(target, "reviewer", reviewerRequirement), undefined)
})

test("successor matching synthesizes GPT and GLM entries with baseline controls", () => {
  const gpt = matchRequirementSuccessor(reviewerRequirement, "openai", "gpt-5.7-sol")
  assert.deepEqual(gpt, {
    ...reviewerRequirement.fallbackChain[0],
    providers: ["openai"],
    model: "gpt-5.7-sol",
  })

  const glmRequirement: ModelRequirement = {
    fallbackChain: [
      {
        providers: ["zhipu"],
        model: "glm-5.1",
        variant: "max",
        reasoningEffort: "max",
        temperature: 0.1,
      },
    ],
  }
  assert.deepEqual(matchRequirementSuccessor(glmRequirement, "zhipu", "glm-5.3"), {
    ...glmRequirement.fallbackChain[0],
    providers: ["zhipu"],
    model: "glm-5.3",
  })
})

test("successor matching exposes the chosen baseline index while preserving the legacy wrapper", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4", temperature: 0.1 },
      { providers: ["openai"], model: "gpt-5.5", temperature: 0.2 },
      { providers: ["openai"], model: "gpt-5.6-terra", temperature: 0.3 },
    ],
  }

  const match = matchRequirementSuccessorWithIndex(requirement, "openai", "gpt-5.7-terra")
  assert.deepEqual(match, {
    baselineIndex: 2,
    entry: { providers: ["openai"], model: "gpt-5.7-terra", temperature: 0.3 },
  })
  assert.deepEqual(matchRequirementSuccessor(requirement, "openai", "gpt-5.7-terra"), match?.entry)
})

test("successor matching retains the confirmed GPT-6 Astra bridge over legacy GPT baselines", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", variant: "xhigh", temperature: 0.3 },
      { providers: ["openai"], model: "gpt-5.5", variant: "xhigh", temperature: 0.2 },
    ],
  }

  assert.deepEqual(matchRequirementSuccessor(requirement, "openai", "gpt-6-astra"), {
    providers: ["openai"],
    model: "gpt-6-astra",
    variant: "xhigh",
    temperature: 0.3,
  })

  const laneOnly: ModelRequirement = {
    fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra", variant: "high" }],
  }
  assert.deepEqual(matchRequirementSuccessor(laneOnly, "openai", "gpt-6-astra"), {
    providers: ["openai"],
    model: "gpt-6-astra",
    variant: "high",
  })
  assert.equal(matchRequirementSuccessor(requirement, "openai", "gpt-5.6"), null)
  assert.equal(matchRequirementSuccessor(requirement, "openai", "gpt-5.7"), null)
})

test("catalog selects the declared GPT-6 Astra when it is the only lane candidate", () => {
  const target = { provider: { openai: { models: { "gpt-6-astra": {} } } } }

  assert.equal(
    selectCatalogModel(target, "deep", BUILTIN_CATEGORY_INDEX.get("deep")!.requirement),
    "openai/gpt-6-astra",
  )
  assert.equal(
    selectCatalogModel(target, "frontend", BUILTIN_CATEGORY_INDEX.get("frontend")!.requirement),
    "openai/gpt-6-astra",
  )
})

test("catalog does not substitute Astra for Sol or Luna defaults", () => {
  const target = {
    provider: {
      openai: { models: { "gpt-6-astra": {}, "gpt-6.1-sol": {}, "gpt-5.5": {}, "gpt-5.4-mini": {} } },
      anthropic: { models: { "claude-sonnet-4-6": {}, "claude-haiku-4-5": {} } },
    },
  }

  assert.equal(
    selectCatalogModel(target, "quick", BUILTIN_CATEGORY_INDEX.get("quick")!.requirement),
    undefined,
  )
  assert.equal(
    selectCatalogModel(target, "coding", BUILTIN_CATEGORY_INDEX.get("coding")!.requirement),
    undefined,
  )
  assert.equal(
    selectCatalogModel(target, "research", BUILTIN_CATEGORY_INDEX.get("research")!.requirement),
    "openai/gpt-6.1-sol",
  )
  assert.equal(
    selectCatalogModel(target, "reviewer", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement),
    "openai/gpt-6.1-sol",
  )
  assert.equal(
    selectCatalogModel(target, "deep", { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra" }] }),
    "openai/gpt-6.1-sol",
  )
})

test("catalog preserves each declared lane even when Astra and Sol are both available", () => {
  const target = { provider: { openai: { models: { "gpt-6-astra": {}, "gpt-6.1-sol": {} } } } }

  assert.equal(
    selectCatalogModel(target, "reviewer", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement),
    "openai/gpt-6.1-sol",
  )
  assert.equal(
    selectCatalogModel(target, "deep", BUILTIN_CATEGORY_INDEX.get("deep")!.requirement),
    "openai/gpt-6-astra",
  )
})

test("modern lanes preserve available non-GPT heads without inventing legacy promotions", () => {
  const target = { provider: {
    anthropic: { models: { "claude-sonnet-4-6": {} } },
    openai: { models: { "gpt-6.2-astra": {}, "gpt-6.2-sol": {} } },
  } }
  for (const lane of ["astra", "sol"] as const) {
    const requirement: ModelRequirement = { fallbackChain: [
      { providers: ["anthropic"], model: "claude-sonnet-4-6" },
      { providers: ["openai"], model: `gpt-6.1-${lane}` },
    ] }
    assert.equal(selectCatalogModel(target, "coding", requirement), undefined, lane)
    const gptFirst = { fallbackChain: [...requirement.fallbackChain].reverse() }
    assert.equal(selectCatalogModel(target, "coding", gptFirst), `openai/gpt-6.2-${lane}`, lane)
  }
})

test("modern lanes fall through non-GPT heads unavailable in their declared providers", () => {
  const requirement = BUILTIN_CATEGORY_INDEX.get("coding")!.requirement
  for (const anthropic of [undefined, { models: {} }, { models: { "claude-opus-5": {} } }]) {
    const target = { provider: {
      anthropic,
      unrelated: { models: { "claude-sonnet-4-6": {}, "gpt-6.9-sol": {} } },
      openai: { models: { "gpt-6.2-sol": {} } },
    } }
    assert.equal(selectCatalogModel(target, "coding", requirement), "openai/gpt-6.2-sol")
  }
})

test("legacy roles retain catalog promotions over available non-GPT heads", () => {
  const target = { provider: {
    anthropic: { models: { "claude-sonnet-4-6": {} } },
    openai: { models: { "gpt-5.7-sol": {}, "gpt-6.2-sol": {}, "gpt-6.2-astra": {} } },
  } }
  for (const baseline of ["gpt-5.5", "gpt-6.1-sol", "gpt-6-astra"]) {
    const requirement: ModelRequirement = { fallbackChain: [
      { providers: ["anthropic"], model: "claude-sonnet-4-6" },
      { providers: ["openai"], model: baseline },
    ] }
    for (const role of ["orchestrator", "builder", "reviewer", "planner", "plan-critic", "clarifier"]) {
      const expected = baseline === "gpt-6-astra" ? "openai/gpt-6.2-astra" : "openai/gpt-6.2-sol"
      assert.equal(selectCatalogModel(target, role, requirement), expected, `${role}/${baseline}`)
    }
  }
})
