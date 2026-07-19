import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeAgentShorthand, normalizeDirectRequirement, normalizeShorthand } from "./normalize.ts"

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

  assert.equal(normalizeDirectRequirement(entry), requirement)
  assert.equal(normalizeShorthand(entry)?.requirement, requirement)
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
    model: { model: "openai/gpt-5.6-sol" },
  })
  assert.equal(resolved?.description, "outer metadata")
  assert.equal(resolved?.requirement?.fallbackChain[0]?.model, "gpt-5.6-sol")

  assert.throws(
    () => normalizeAgentShorthand("a", {
      a: { alias: "b" },
      b: { alias: "a" },
    }),
    /circular alias: a -> b -> a/i,
  )
})
