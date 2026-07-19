import assert from "node:assert/strict"
import { test } from "node:test"

import type { FastModelsConfig } from "../config/schema.ts"
import type { EffectiveModelRoute, ModelRequirement } from "../shared/types.ts"
import {
  buildEffectiveModelRoute,
  materializeSelectedPrimary,
  parseFastModeValue,
  selectFastCandidate,
} from "./effective-route.ts"

const fastModels = (overrides: Partial<FastModelsConfig> = {}): FastModelsConfig => ({
  providers: [],
  mappings: {},
  ...overrides,
})

const metadataRequirement = (): ModelRequirement => ({
  variant: "max",
  requiresModel: "gpt-5.5",
  requiresAnyModel: false,
  requiresProvider: ["openai", "github-copilot"],
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
    { providers: ["anthropic"], model: "claude-opus-4-7", variant: "xhigh" },
  ],
})

test("fast activation accepts only exact 1 and true values", () => {
  for (const value of [undefined, "", "0", "false", "TRUE", " true", "1 ", "yes"]) {
    assert.equal(parseFastModeValue(value), false, value)
  }
  assert.equal(parseFastModeValue("1"), true)
  assert.equal(parseFastModeValue("true"), true)
})

test("fast candidate requires a case-sensitive provider allowlist", () => {
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({ providers: ["OpenAI"] }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }), null)
})

test("explicit mappings win without catalog visibility and preserve slash-containing provider-local model IDs", () => {
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6": "gpt-5.6-turbo" },
    }),
  }), "gpt-5.6-turbo")

  const slashContainingModelID = "publishers/google/models/gemini-fast"
  const slashMappingArgs = {
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6": slashContainingModelID },
    }),
  }
  assert.equal(selectFastCandidate(slashMappingArgs), slashContainingModelID)
  assert.equal(buildEffectiveModelRoute({
    ...slashMappingArgs,
    requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6" }] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
  }).model, `openai/${slashContainingModelID}`)
})

test("an explicit self mapping is an authoritative no-op", () => {
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6": "gpt-5.6" },
    }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }), null)
})

test("an explicit mapping can promote an already-fast selected model", () => {
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6-fast",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6-fast": "gpt-5.6-turbo" },
    }),
  }), "gpt-5.6-turbo")
})

test("automatic fast candidates require an allowlisted provider and catalog visibility", () => {
  const args = {
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({ providers: ["openai"] }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }
  assert.equal(selectFastCandidate(args), "gpt-5.6-fast")
  assert.equal(selectFastCandidate({ ...args, catalogModels: new Set<string>() }), null)
})

test("fast candidate selection no-ops for disabled or invalid automatic inputs", () => {
  const automatic = new Set(["gpt-5.6-fast", "gpt-5.6-fast-fast"])
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6",
    fastMode: false,
    fastModels: fastModels({ providers: ["openai"] }),
    catalogModels: automatic,
  }), null)
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: {} as FastModelsConfig,
    catalogModels: automatic,
  }), null)
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels(),
    catalogModels: automatic,
  }), null)
  for (const selectedModel of ["gpt-5.6", "/gpt-5.6", "openai/"]) {
    assert.equal(selectFastCandidate({
      selectedModel,
      fastMode: true,
      fastModels: fastModels({ providers: ["openai"] }),
      catalogModels: automatic,
    }), null)
  }
  assert.equal(selectFastCandidate({
    selectedModel: "openai/gpt-5.6-fast",
    fastMode: true,
    fastModels: fastModels({ providers: ["openai"] }),
    catalogModels: automatic,
  }), null)
})

test("materializing an exact primary copies controls, pins the provider, and removes only its baseline", () => {
  const requirement = metadataRequirement()
  const materialized = materializeSelectedPrimary(requirement, "openai/gpt-5.5")

  assert.deepEqual(materialized, {
    ...requirement,
    requiresProvider: ["openai", "github-copilot"],
    fallbackChain: [
      { ...requirement.fallbackChain[0]!, providers: ["openai"] },
      { ...requirement.fallbackChain[1]!, providers: ["anthropic"] },
    ],
  })
  assert.notEqual(materialized.fallbackChain[0], requirement.fallbackChain[0])
  assert.notEqual(materialized.fallbackChain[0]!.thinking, requirement.fallbackChain[0]!.thinking)
  materialized.fallbackChain[0]!.providers.push("mutated")
  materialized.fallbackChain[0]!.thinking!.budgetTokens = 1
  assert.deepEqual(requirement.fallbackChain[0]!.providers, ["openai", "github-copilot"])
  assert.equal(requirement.fallbackChain[0]!.thinking!.budgetTokens, 4_000)
})

test("materializing successor primaries retains GPT and GLM baseline controls and removes their baseline index", () => {
  const gpt: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4", temperature: 0.1 },
      { providers: ["openai"], model: "gpt-5.6-terra", temperature: 0.3, thinking: { type: "enabled", budgetTokens: 99 } },
    ],
  }
  assert.deepEqual(materializeSelectedPrimary(gpt, "openai/gpt-5.7-terra").fallbackChain, [
    { providers: ["openai"], model: "gpt-5.7-terra", temperature: 0.3, thinking: { type: "enabled", budgetTokens: 99 } },
    { providers: ["openai"], model: "gpt-5.4", temperature: 0.1 },
  ])

  const glm: ModelRequirement = {
    fallbackChain: [
      { providers: ["zhipu"], model: "glm-5.1", reasoningEffort: "max", temperature: 0.1 },
      { providers: ["other"], model: "fallback" },
    ],
  }
  assert.deepEqual(materializeSelectedPrimary(glm, "zhipu/glm-5.3").fallbackChain, [
    { providers: ["zhipu"], model: "glm-5.3", reasoningEffort: "max", temperature: 0.1 },
    { providers: ["other"], model: "fallback" },
  ])
})

test("materializing a boundary-prefix primary retains its controls and removes only the matched index", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.4", temperature: 0.1 },
      { providers: ["openai", "github-copilot"], model: "gpt-5.5", temperature: 0.2, topP: 0.8 },
      { providers: ["anthropic"], model: "claude-opus-4-7" },
    ],
  }

  assert.deepEqual(materializeSelectedPrimary(requirement, "openai/gpt-5.5-20260713").fallbackChain, [
    { providers: ["openai"], model: "gpt-5.5-20260713", temperature: 0.2, topP: 0.8 },
    { providers: ["openai"], model: "gpt-5.4", temperature: 0.1 },
    { providers: ["anthropic"], model: "claude-opus-4-7" },
  ])
})

test("materializing an unmatched primary synthesizes it with the native requirement variant and keeps every baseline", () => {
  const requirement = metadataRequirement()
  const materialized = materializeSelectedPrimary(requirement, "openai/gpt-6")

  assert.deepEqual(materialized.fallbackChain, [
    { providers: ["openai"], model: "gpt-6", variant: "max" },
    { ...requirement.fallbackChain[0]!, providers: ["openai", "github-copilot"] },
    { ...requirement.fallbackChain[1]!, providers: ["anthropic"] },
  ])
  assert.deepEqual(materialized.requiresProvider, ["openai", "github-copilot"])
})

test("an unqualified selected model returns a deep-cloned baseline without empty providers", () => {
  const requirement = metadataRequirement()
  const materialized = materializeSelectedPrimary(requirement, "gpt-5.5")

  assert.deepEqual(materialized, requirement)
  assert.notEqual(materialized, requirement)
  assert.notEqual(materialized.fallbackChain, requirement.fallbackChain)
  assert.notEqual(materialized.fallbackChain[0]!.providers, requirement.fallbackChain[0]!.providers)
  assert.ok(materialized.fallbackChain.every((entry) => entry.providers.length > 0))
})

test("primary materialization preserves distinct provider ordering and stable-dedupes exact identities", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["a", "b"], model: "same" },
      { providers: ["a", "b"], model: "same", temperature: 0.5 },
      { providers: ["b", "a"], model: "same" },
      { providers: ["a"], model: "other" },
    ],
  }
  const materialized = materializeSelectedPrimary(requirement, "p/new")

  assert.deepEqual(materialized.fallbackChain, [
    { providers: ["p"], model: "new" },
    { providers: ["a", "b"], model: "same" },
    { providers: ["b", "a"], model: "same" },
    { providers: ["a"], model: "other" },
  ])
})

test("an effective fast route prepends the copied fast primary and retains distinct stable fallbacks", () => {
  const requirement: ModelRequirement = {
    variant: "max",
    requiresModel: "original",
    requiresAnyModel: false,
    requiresProvider: ["openai", "github-copilot"],
    fallbackChain: [
      {
        providers: ["openai", "github-copilot"],
        model: "original",
        variant: "high",
        reasoningEffort: "high",
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 12_000,
        thinking: { type: "enabled", budgetTokens: 4_000 },
      },
      { providers: ["openai"], model: "original-fast", variant: "low" },
      { providers: ["openai"], model: "original", variant: "low" },
      { providers: ["github-copilot", "openai"], model: "original", variant: "low" },
    ],
  }

  const route: EffectiveModelRoute = buildEffectiveModelRoute({
    selectedModel: "openai/original",
    requirement,
    requirementSource: "agent-default",
    primarySource: "catalog-upgrade",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/original": "original-fast" },
    }),
  })

  const original = {
    ...requirement.fallbackChain[0]!,
    providers: ["openai"],
  }
  assert.deepEqual(route, {
    model: "openai/original-fast",
    requirement: {
      ...requirement,
      requiresProvider: ["openai", "github-copilot"],
      fallbackChain: [
        { ...original, model: "original-fast" },
        original,
        { providers: ["github-copilot", "openai"], model: "original", variant: "low" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "catalog-upgrade",
  })
  assert.notEqual(route.requirement.fallbackChain[0]!.thinking, requirement.fallbackChain[0]!.thinking)
  assert.notEqual(route.requirement.fallbackChain[1]!.thinking, requirement.fallbackChain[0]!.thinking)
})
