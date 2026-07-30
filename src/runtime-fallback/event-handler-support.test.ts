import { test } from "node:test"
import assert from "node:assert/strict"

import { applyRequirementDefaults, resolveRetryTarget } from "./event-handler-support.ts"
import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"

test("requirement defaults retain canonical reasoning alongside a legacy variant", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [],
    reasoning: "off",
    variant: "high",
  }
  const entry: FallbackEntry = { providers: ["openai"], model: "gpt-5.6-sol" }

  const defaulted = applyRequirementDefaults(requirement, entry)

  assert.deepEqual(defaulted, {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "off",
    variant: "high",
  })
  assert.deepEqual(entry, { providers: ["openai"], model: "gpt-5.6-sol" })
})

test("entry inference metadata takes precedence over requirement defaults", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [],
    reasoning: "off",
    variant: "high",
  }
  const entry: FallbackEntry = {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "max",
    variant: "low",
  }

  const defaulted = applyRequirementDefaults(requirement, entry)

  assert.deepEqual(defaulted, entry)
  assert.deepEqual(entry, {
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "max",
    variant: "low",
  })
})

test("retry target pins the actual identity while retaining canonical reasoning", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [{ providers: ["openai", "github-copilot"], model: "gpt-5.6-sol" }],
    reasoning: "high",
  }

  const target = resolveRetryTarget(requirement, {
    providerID: "github-copilot",
    modelID: "gpt-5.6-sol",
  })

  assert.deepEqual(target, {
    providerID: "github-copilot",
    modelID: "gpt-5.6-sol",
    entry: {
      providers: ["github-copilot"],
      model: "gpt-5.6-sol",
      reasoning: "high",
    },
  })
})
