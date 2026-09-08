import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeAgentShorthand, normalizeDirectRequirement, normalizeShorthand } from "./normalize.ts"
import type { AgentEntry } from "./schema.ts"

test("normalizeDirectRequirement gives requirement precedence over shorthand models", () => {
  const requirement = {
    fallbackChain: [{ providers: ["openai"], model: "gpt-5.6", temperature: 0.2 }],
    variant: "max" as const,
    requiresProvider: ["openai"],
  }
  const entry = {
    requirement,
    model: "anthropic/claude-opus",
    fallbackModels: ["google/gemini-pro"],
  }

  const direct = normalizeDirectRequirement(entry)!
  const shorthand = normalizeShorthand(entry)?.requirement!

  assert.deepEqual(direct, requirement)
  assert.notEqual(direct, requirement)
  assert.notEqual(direct.fallbackChain, requirement.fallbackChain)
  assert.notEqual(direct.fallbackChain[0], requirement.fallbackChain[0])
  assert.deepEqual(shorthand, requirement)
  assert.notEqual(shorthand, requirement)
})

test("canonical models map to fallback entries and override every legacy chain source", () => {
  const source = {
    models: [
      "openai/gpt-5.6-sol:high",
      {
        model: "anthropic/claude-sonnet-4-6:max",
        reasoning: "none" as const,
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 8_192,
      },
    ],
    reasoning: "high" as const,
    variant: "max" as const,
    model: "legacy/primary",
    fallbackModels: ["legacy/fallback"],
    alias: "qualified:target",
    requirement: {
      reasoning: "low" as const,
      variant: "medium" as const,
      requiresModel: "guarded-model",
      requiresAnyModel: true,
      requiresProvider: ["openai", "anthropic"],
      fallbackChain: [{ providers: ["legacy"], model: "requirement-chain" }],
    },
  } satisfies AgentEntry

  const result = normalizeDirectRequirement(source)!

  assert.deepEqual(result, {
    reasoning: "high",
    variant: "max",
    requiresModel: "guarded-model",
    requiresAnyModel: true,
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "high" },
      {
        providers: ["anthropic"],
        model: "claude-sonnet-4-6",
        reasoning: "off",
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 8_192,
      },
    ],
  })
  assert.notEqual(result.requiresProvider, source.requirement.requiresProvider)
  result.requiresProvider!.push("mutated")
  assert.deepEqual(source.requirement.requiresProvider, ["openai", "anthropic"])
})

test("canonical models preserve requirement defaults when shorthand defaults are absent", () => {
  const result = normalizeDirectRequirement({
    models: [{ model: "openai/gpt-5.6-sol:max", temperature: 2, top_p: 0, max_tokens: 1 }],
    requirement: {
      reasoning: "low",
      variant: "medium",
      requiresAnyModel: false,
      fallbackChain: [{ providers: ["legacy"], model: "discarded" }],
    },
  })

  assert.deepEqual(result, {
    reasoning: "low",
    variant: "medium",
    requiresAnyModel: false,
    fallbackChain: [{
      providers: ["openai"],
      model: "gpt-5.6-sol",
      reasoning: "max",
      temperature: 2,
      topP: 0,
      maxTokens: 1,
    }],
  })
})

test("direct canonical models suppress aliases and keep entry fields local", () => {
  let aliasCalls = 0
  const result = normalizeShorthand(
    {
      alias: "target",
      reasoning: "medium",
      models: [
        { model: "openai/gpt-5.6-sol:high", reasoning: "none", temperature: 0.4 },
        "anthropic/claude-sonnet-4-6:low",
      ],
    },
    {
      selfName: "source",
      resolveAlias: () => {
        aliasCalls++
        return normalizeShorthand({ model: "legacy/target" })
      },
    },
  )

  assert.equal(aliasCalls, 0)
  assert.deepEqual(result?.requirement, {
    reasoning: "medium",
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "off", temperature: 0.4 },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "low" },
    ],
  })
  assert.equal(result?.requirement?.fallbackChain[1]?.temperature, undefined)
})

test("canonical models do not retain caller entry objects", () => {
  const source: AgentEntry = {
    models: [{
      model: "openai/gpt-5.6-sol:high",
      reasoning: "none" as const,
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 8_192,
    }],
  }

  const result = normalizeDirectRequirement(source)!
  const sourceModel = source.models?.[0]
  assert.ok(sourceModel && typeof sourceModel !== "string")
  sourceModel.model = "changed/model"
  sourceModel.reasoning = "high"
  sourceModel.temperature = 1
  sourceModel.top_p = 0
  sourceModel.max_tokens = 1

  assert.deepEqual(result.fallbackChain, [{
    providers: ["openai"],
    model: "gpt-5.6-sol",
    reasoning: "off",
    temperature: 0.2,
    topP: 0.8,
    maxTokens: 8_192,
  }])
})

test("normalizeDirectRequirement creates the existing model and fallback chain", () => {
  const direct = normalizeDirectRequirement({
    model: "openai/gpt-5.6",
    variant: "high" as const,
    fallbackModels: [{
      providers: ["anthropic"],
      model: "claude-opus",
      reasoningEffort: "max",
      temperature: 0.1,
      topP: 0.8,
      maxTokens: 8_000,
      thinking: { type: "enabled" as const, budgetTokens: 4_096 },
    }],
  })

  assert.deepEqual(direct, {
    variant: "high",
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6", variant: "high" },
      {
        providers: ["anthropic"],
        model: "claude-opus",
        reasoningEffort: "max",
        temperature: 0.1,
        topP: 0.8,
        maxTokens: 8_000,
        thinking: { type: "enabled", budgetTokens: 4_096 },
      },
    ],
  })
  assert.equal(normalizeDirectRequirement({ alias: "reviewer" }), undefined)
})

test("normalizeShorthand resolves alias target requirement", () => {
  const target = { model: "openai/gpt-5.5", variant: "high" as const }
  const aliasEntry = { alias: "reviewer" }
  const resolveAlias = (name: string) =>
    name === "reviewer" ? normalizeShorthand(target) : undefined
  const result = normalizeShorthand(aliasEntry, { resolveAlias, selfName: "oracle" })
  assert.ok(result?.requirement)
  assert.equal(result.requirement!.fallbackChain[0]!.model, "gpt-5.5")
})

test("normalizeShorthand applies source alias intensity over target requirement defaults", () => {
  const target = {
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-6-astra", reasoning: "max" as const }],
      reasoning: "xhigh" as const,
    },
  }
  const resolveAlias = (name: string) => name === "reviewer" ? normalizeShorthand(target) : undefined

  const variant = normalizeShorthand(
    { alias: "reviewer", variant: "high" },
    { resolveAlias, selfName: "source-variant" },
  )
  assert.equal(variant?.requirement?.variant, "high")
  assert.equal(variant?.requirement?.reasoning, undefined)
  assert.equal(variant?.requirement?.fallbackChain[0]?.reasoning, "max")

  const reasoning = normalizeShorthand(
    { alias: "reviewer", variant: "high", reasoning: "none" },
    { resolveAlias, selfName: "source-reasoning" },
  )
  assert.equal(reasoning?.requirement?.reasoning, "off")
  assert.equal(reasoning?.requirement?.variant, undefined)
})

test("normalizeShorthand direct config overrides alias", () => {
  const aliasEntry = { alias: "reviewer", model: "zhipu/glm-5.1" }
  const resolveAlias = (name: string) =>
    name === "reviewer" ? normalizeShorthand({ model: "openai/gpt-5.5" }) : undefined
  const result = normalizeShorthand(aliasEntry, { resolveAlias, selfName: "oracle" })
  assert.equal(result!.requirement!.fallbackChain[0]!.model, "glm-5.1")
})

test("normalizeShorthand detects circular alias", () => {
  const resolveAlias = (name: string) =>
    name === "a" ? normalizeShorthand({ alias: "b" }, { resolveAlias, selfName: "a", visited: new Set(["self", "a"]) }) as never
      : name === "b" ? normalizeShorthand({ alias: "a" }, { resolveAlias, selfName: "b", visited: new Set(["self", "a", "b"]) }) as never
        : undefined
  assert.throws(
    () => normalizeShorthand({ alias: "a" }, { resolveAlias, selfName: "self", visited: new Set(["self"]) }),
    /circular alias/i,
  )
})

test("normalizeShorthand transitive alias A->B->C", () => {
  const resolveAlias = (name: string) => {
    if (name === "a") return normalizeShorthand({ alias: "b" }, { resolveAlias, selfName: "a", visited: new Set(["self", "a"]) })
    if (name === "b") return normalizeShorthand({ alias: "c" }, { resolveAlias, selfName: "b", visited: new Set(["self", "a", "b"]) })
    if (name === "c") return normalizeShorthand({ model: "zhipu/glm-5.1" })
    return undefined
  }
  const result = normalizeShorthand({ alias: "a" }, { resolveAlias, selfName: "self", visited: new Set(["self"]) })
  assert.equal(result!.requirement!.fallbackChain[0]!.model, "glm-5.1")
})

test("normalization handles canonical fields, aliases, suffixes, and max ambiguity", () => {
  const requirement = normalizeDirectRequirement({
    model: "openai/gpt-5.6-sol:high",
    reasoning: "none",
    variant: "auto",
    fallbackModels: [
      "anthropic/claude-sonnet-4-6:max",
      "gpt-5.6-sol:max",
      "provider/model:custom",
      { providers: ["google"], model: "gemini-3.1-pro:max" },
      { providers: ["zhipu"], model: "glm-5.2:max", reasoning: "low" },
    ],
  })

  assert.deepEqual(requirement, {
    reasoning: "off",
    variant: "auto",
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "off", variant: "auto" },
      { providers: ["anthropic"], model: "claude-sonnet-4-6", reasoning: "max" },
      { providers: [], model: "gpt-5.6-sol:max" },
      { providers: ["provider"], model: "model:custom" },
      { providers: ["google"], model: "gemini-3.1-pro", reasoning: "max" },
      { providers: ["zhipu"], model: "glm-5.2", reasoning: "low" },
    ],
  })
})

test("normalization recursively copies requirement objects and canonicalizes reasoning", () => {
  const source = {
    reasoning: "none" as const,
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol:max" },
      {
        providers: ["anthropic"],
        model: "claude-sonnet-4-6:low",
        reasoning: "none" as const,
        thinking: { type: "enabled" as const, budgetTokens: 4_096 },
      },
    ],
  }
  const requirement = normalizeDirectRequirement({ requirement: source })!

  assert.deepEqual(requirement, {
    reasoning: "off",
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "max" },
      {
        providers: ["anthropic"],
        model: "claude-sonnet-4-6",
        reasoning: "off",
        thinking: { type: "enabled", budgetTokens: 4_096 },
      },
    ],
  })
  assert.notEqual(requirement, source)
  assert.notEqual(requirement.requiresProvider, source.requiresProvider)
  assert.notEqual(requirement.fallbackChain, source.fallbackChain)
  assert.notEqual(requirement.fallbackChain[0], source.fallbackChain[0])
  assert.notEqual(requirement.fallbackChain[1]!.providers, source.fallbackChain[1]!.providers)
  assert.notEqual(requirement.fallbackChain[1]!.thinking, source.fallbackChain[1]!.thinking)

  source.requiresProvider[0] = "mutated"
  source.fallbackChain[0]!.providers[0] = "mutated"
  source.fallbackChain[1]!.thinking!.budgetTokens = 1
  assert.deepEqual(requirement, {
    reasoning: "off",
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol", reasoning: "max" },
      {
        providers: ["anthropic"],
        model: "claude-sonnet-4-6",
        reasoning: "off",
        thinking: { type: "enabled", budgetTokens: 4_096 },
      },
    ],
  })
})

test("normalizeShorthand no alias and no model returns undefined requirement", () => {
  const result = normalizeShorthand({ description: "just a desc" })
  assert.equal(result!.requirement, undefined)
  assert.equal(result!.description, "just a desc")
})

test("normalizeAgentShorthand resolves arbitrary depth and rejects cycles", () => {
  const resolved = normalizeAgentShorthand("reviewer", {
    reviewer: { alias: "policy-a", description: "outer metadata" },
    "policy-a": { alias: "policy-b" },
    "policy-b": { alias: "model" },
    model: { model: "openai/gpt-5.6-sol:high", reasoning: "none" },
  })
  assert.equal(resolved?.description, "outer metadata")
  assert.equal(resolved?.requirement?.fallbackChain[0]?.model, "gpt-5.6-sol")
  assert.equal(resolved?.requirement?.reasoning, "off")
  assert.equal(resolved?.requirement?.fallbackChain[0]?.reasoning, "off")

  assert.throws(
    () => normalizeAgentShorthand("a", {
      a: { alias: "b" },
      b: { alias: "a" },
    }),
    /circular alias: a -> b -> a/i,
  )
})
