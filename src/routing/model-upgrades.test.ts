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
