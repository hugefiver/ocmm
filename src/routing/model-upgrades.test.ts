import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModelRequirement } from "../shared/types.ts"
import { matchRequirementSuccessor, selectCatalogModel } from "./model-upgrades.ts"

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
  const oracleRequirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai", "github-copilot"], model: "gpt-5.4", variant: "xhigh" },
      { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
      { providers: ["openai", "github-copilot"], model: "gpt-5.6-terra", variant: "xhigh" },
    ],
  }

  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.4": {}, "gpt-5.6-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.4",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.5": {}, "gpt-5.7-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.5",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.7-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.7-terra",
  )
})

test("oracle-high catalog selection uses Sol lane", () => {
  const oracleHighRequirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "max" },
    ],
  }

  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.6-sol": {} } } } }, "oracle-high", oracleHighRequirement),
    "openai/gpt-5.6-sol",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.7-terra": {} } } } }, "oracle-high", oracleHighRequirement),
    undefined,
  )
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
