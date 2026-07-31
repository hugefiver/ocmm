import assert from "node:assert/strict"
import { test } from "node:test"

import { normalizeDirectRequirement } from "../config/normalize.ts"
import type { FastModelsConfig } from "../config/schema.ts"
import type { EffectiveModelRoute, ModelRequirement } from "../shared/types.ts"
import {
  buildEffectiveModelRoute,
  materializeSelectedPrimary,
  parseFastModeValue,
  selectFastPath,
} from "./effective-route.ts"

const fastModels = (overrides: Partial<FastModelsConfig> = {}): FastModelsConfig => ({
  providers: [],
  mappings: {},
  defaultRules: false,
  rules: [],
  ...overrides,
})

const metadataRequirement = (): ModelRequirement => ({
  reasoning: "high",
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
    assert.equal(parseFastModeValue(value), false)
  }
  assert.equal(parseFastModeValue("1"), true)
  assert.equal(parseFastModeValue("true"), true)
})

test("explicit mappings win without catalog visibility and preserve slash-containing provider-local IDs", () => {
  const selectedModel = "google/publishers/google/models/gemini-3"
  const modelID = "publishers/google/models/gemini-3-fast"
  const args = {
    selectedModel,
    fastMode: true,
    fastModels: fastModels({
      providers: ["google"],
      mappings: { [selectedModel]: modelID },
    }),
  }

  assert.deepEqual(selectFastPath(args), { kind: "model", modelID })
  assert.deepEqual(buildEffectiveModelRoute({
    ...args,
    requirement: { fallbackChain: [{ providers: ["google"], model: "publishers/google/models/gemini-3" }] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
  }).fastPath, { kind: "model", modelID })
})

test("an allowlisted explicit self mapping suppresses suffix and options routes", () => {
  const rules = [{ match: { provider: "openai" }, options: { serviceTier: "flex" } }]
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6": "gpt-5.6" },
      rules,
    }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }), { kind: "off" })
})

test("explicit mappings run before already-fast suppression", () => {
  const args = {
    selectedModel: "openai/gpt-5.6-fast",
    fastMode: true,
    fastModels: fastModels({ providers: ["openai"] }),
  }
  assert.deepEqual(selectFastPath(args), { kind: "off" })
  assert.deepEqual(selectFastPath({
    ...args,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6-fast": "gpt-5.6-turbo" },
    }),
  }), { kind: "model", modelID: "gpt-5.6-turbo" })
})

test("an allowlisted catalog suffix beats option routing", () => {
  const rules = [{ match: { model: "gpt-*" }, options: { serviceTier: "flex" } }]
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({ providers: ["openai"], rules }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }), { kind: "model", modelID: "gpt-5.6-fast" })
})

test("fast paths fall through to options for provider and catalog promotion misses", () => {
  const rules = [{ match: { provider: "*" }, options: { nested: { enabled: true } } }]
  const cases = [
    fastModels({ providers: [], defaultRules: true, rules }),
    fastModels({ providers: ["OpenAI"], defaultRules: true, rules }),
    fastModels({ providers: ["openai"], defaultRules: true, rules }),
  ]
  const catalogModels = new Set<string>()
  for (const configured of cases) {
    const fastPath = selectFastPath({
      selectedModel: "openai/gpt-5.6",
      fastMode: true,
      fastModels: configured,
      catalogModels,
    })
    assert.deepEqual(fastPath, { kind: "options", defaultRules: true, rules })
    assert.equal(fastPath.kind, "options")
    assert.notEqual(fastPath.rules, configured.rules)
  }
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels(),
    catalogModels,
  }), { kind: "options", defaultRules: false, rules: [] })
})

test("disabled and invalid selected identities are off", () => {
  const automatic = new Set(["gpt-5.6-fast"])
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: false,
    fastModels: fastModels({ providers: ["openai"] }),
    catalogModels: automatic,
  }), { kind: "off" })
  for (const selectedModel of ["gpt-5.6", "/gpt-5.6", "openai/"]) {
    assert.deepEqual(selectFastPath({
      selectedModel,
      fastMode: true,
      fastModels: fastModels({ providers: ["openai"] }),
      catalogModels: automatic,
    }), { kind: "off" })
  }
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

test("materializing an unmatched primary synthesizes it with native requirement reasoning and variant and keeps every baseline", () => {
  const requirement = metadataRequirement()
  const materialized = materializeSelectedPrimary(requirement, "openai/gpt-6")

  assert.deepEqual(materialized.fallbackChain, [
    { providers: ["openai"], model: "gpt-6", reasoning: "high", variant: "max" },
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

test("an options fast path leaves the selected model and materialized fallback chain unchanged", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [
      { providers: ["outside", "fallback"], model: "original", variant: "high" },
      { providers: ["fallback"], model: "later", variant: "low" },
    ],
  }
  const rules = [{ match: { provider: "outside" }, options: { serviceTier: "flex" } }]
  const route = buildEffectiveModelRoute({
    selectedModel: "outside/original",
    requirement,
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastMode: true,
    fastModels: fastModels({ defaultRules: true, rules }),
    catalogModels: new Set(["original-fast"]),
  })

  assert.equal(route.model, "outside/original")
  assert.deepEqual(route.requirement, materializeSelectedPrimary(requirement, "outside/original"))
  assert.deepEqual(route.fastPath, { kind: "options", defaultRules: true, rules })
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
        reasoning: "off",
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
    fastPath: { kind: "model", modelID: "original-fast" },
  })
  assert.notEqual(route.requirement.fallbackChain[0]!.thinking, requirement.fallbackChain[0]!.thinking)
  assert.notEqual(route.requirement.fallbackChain[1]!.thinking, requirement.fallbackChain[0]!.thinking)
})

test("effective routes preserve normalized canonical controls and requirement guards", () => {
  const requirement = normalizeDirectRequirement({
    models: [
      { model: "openai/gpt-5.6-sol:high", temperature: 0.2, top_p: 0.8, max_tokens: 4_096 },
      "anthropic/claude-sonnet-4-6:low",
    ],
    requirement: {
      requiresModel: "gpt-5.6-sol",
      requiresAnyModel: true,
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [{ providers: ["discarded"], model: "discarded" }],
    },
  })!
  const route = buildEffectiveModelRoute({
    selectedModel: "openai/gpt-5.6-sol",
    requirement,
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastMode: false,
    fastModels: fastModels(),
  })

  assert.deepEqual(route.requirement, {
    requiresModel: "gpt-5.6-sol",
    requiresAnyModel: true,
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      {
        providers: ["openai"],
        model: "gpt-5.6-sol",
        reasoning: "high",
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 4_096,
      },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "low" },
    ],
  })
  assert.notEqual(route.requirement, requirement)
  assert.notEqual(route.requirement.fallbackChain, requirement.fallbackChain)
  assert.notEqual(route.requirement.requiresProvider, requirement.requiresProvider)

  route.requirement.fallbackChain[0]!.providers.push("mutated")
  route.requirement.requiresProvider!.push("mutated")
  assert.deepEqual(requirement.fallbackChain[0]!.providers, ["openai"])
  assert.deepEqual(requirement.requiresProvider, ["openai", "anthropic"])
})
