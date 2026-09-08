import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModelRequirement } from "../shared/types.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import { BUILTIN_CATEGORY_INDEX } from "../data/categories.ts"
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
  const oracleRequirement = BUILTIN_AGENT_INDEX.get("oracle")!.requirement

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
    "gpt-5.7-sol": {}, "gpt-5.7-terra": {},
  } } } }
  const oracle = BUILTIN_AGENT_INDEX.get("oracle")!.requirement
  const second = BUILTIN_AGENT_INDEX.get("oracle-2nd")!.requirement
  assert.equal(selectCatalogModel(target, "oracle-low", oracle), "openai/gpt-5.7-terra")
  assert.equal(selectCatalogModel(target, "oracle-high", oracle), "openai/gpt-5.7-terra")
  assert.equal(selectCatalogModel(target, "oracle-2nd-max", second), "openai/gpt-5.7-sol")
  assert.equal(selectCatalogModel(target, "reviewer-high", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement), "openai/gpt-5.7-sol")
})

test("planning catalog lanes ignore logical tier suffixes", () => {
  const target = { provider: { openai: { models: {
    "gpt-5.7-sol": {}, "gpt-5.7-terra": {},
  } } } }
  assert.equal(
    selectCatalogModel(target, "planner-high", BUILTIN_AGENT_INDEX.get("planner")!.requirement),
    "openai/gpt-5.7-sol",
  )
  assert.equal(
    selectCatalogModel(target, "plan-critic-low", BUILTIN_AGENT_INDEX.get("plan-critic")!.requirement),
    "openai/gpt-5.7-sol",
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

test("successor matching materializes the GPT-6 no-lane flagship over any GPT baseline", () => {
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

test("catalog falls back to the newest no-lane GPT-6 flagship when no lane candidates exist", () => {
  const target = { provider: { openai: { models: { "gpt-6-astra": {} } } } }

  // Chains that declare a GPT-6+ no-lane entry upgrade to the catalog flagship.
  assert.equal(
    selectCatalogModel(target, "deep", BUILTIN_CATEGORY_INDEX.get("deep")!.requirement),
    "openai/gpt-6-astra",
  )
  assert.equal(
    selectCatalogModel(target, "frontend", BUILTIN_CATEGORY_INDEX.get("frontend")!.requirement),
    "openai/gpt-6-astra",
  )
})

test("catalog no-lane GPT-6 fallback does not upgrade chains without a GPT-6 entry", () => {
  const target = {
    provider: {
      openai: { models: { "gpt-6-astra": {}, "gpt-5.6-sol": {}, "gpt-5.5": {}, "gpt-5.4-mini": {} } },
      anthropic: { models: { "claude-sonnet-4-6": {}, "claude-haiku-4-5": {} } },
    },
  }

  // Chains without a no-lane GPT-6+ entry never receive the flagship from
  // the catalog fallback: quick keeps its cheap tier, coding/research keep
  // their chain heads via the requirement (selectCatalogModel returns
  // undefined so the head-selection path applies), and lane-first synthetic
  // chains and the reviewer chain do not opt in either.
  assert.equal(
    selectCatalogModel(target, "quick", BUILTIN_CATEGORY_INDEX.get("quick")!.requirement),
    undefined,
  )
  assert.equal(
    selectCatalogModel(target, "coding", BUILTIN_CATEGORY_INDEX.get("coding")!.requirement),
    undefined,
  )
  // research's chain has no lane and no GPT-6 entry, so no catalog upgrade
  // applies — the head-selection path keeps its gpt-5.6-sol chain head.
  assert.equal(
    selectCatalogModel(target, "research", BUILTIN_CATEGORY_INDEX.get("research")!.requirement),
    undefined,
  )
  // reviewer (sol lane) and a lane-first synthetic deep chain still resolve
  // through the existing lane-candidate scan — the flagship never replaces
  // an available lane model.
  assert.equal(
    selectCatalogModel(target, "reviewer", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement),
    "openai/gpt-5.6-sol",
  )
  assert.equal(
    selectCatalogModel(target, "deep", { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-terra" }] }),
    "openai/gpt-5.6-sol",
  )
})

test("catalog prefers lane candidates over the no-lane GPT-6 flagship fallback", () => {
  const target = { provider: { openai: { models: { "gpt-6-astra": {}, "gpt-5.6-sol": {} } } } }

  assert.equal(
    selectCatalogModel(target, "reviewer", BUILTIN_AGENT_INDEX.get("reviewer")!.requirement),
    "openai/gpt-5.6-sol",
  )
  assert.equal(
    selectCatalogModel(target, "deep", BUILTIN_CATEGORY_INDEX.get("deep")!.requirement),
    "openai/gpt-5.6-sol",
  )
})
