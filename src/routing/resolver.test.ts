import { test } from "node:test"
import assert from "node:assert/strict"

import { resolveModelRouting } from "./resolver.ts"

test("matches an entry in the built-in agent chain", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.entry.model, "gpt-5.5")
  assert.equal(r!.variant, "xhigh")
  assert.equal(r!.source, "agent-default")
})

test("oracle routes to its own cross-gen builtin chain", () => {
  const oracle = resolveModelRouting({
    agentName: "oracle",
    modelID: "gpt-5.5",
    providerID: "openai",
  })
  const explore = resolveModelRouting({
    agentName: "explore",
    modelID: "gpt-5.4-mini-fast",
    providerID: "openai",
  })

  assert.equal(oracle!.source, "agent-default")
  assert.equal(oracle!.variant, "xhigh")
  // gpt-5.5 matches the "gpt-5" entry in oracle's cross-gen chain (versioned alias match).
  assert.equal(oracle!.entry.model, "gpt-5")
  assert.equal(explore!.source, "agent-default")
  assert.equal(explore!.entry.model, "gpt-5.4-mini-fast")
})

test("oracle inherits reviewer model via defaultAlias when user writes oracle entry without model", () => {
  const r = resolveModelRouting({
    agentName: "oracle",
    modelID: "claude-opus-4-7",
    providerID: "anthropic",
    agentsConfig: {
      // User wrote an oracle entry but didn't specify a model or alias.
      // defaultAlias: "reviewer" kicks in to inherit reviewer's user-config model.
      oracle: { description: "custom oracle description" },
      reviewer: { model: "anthropic/claude-opus-4-7" },
    },
  })
  assert.equal(r!.source, "user-config")
  assert.equal(r!.entry.model, "claude-opus-4-7")
})

test("falls back to first chain entry when current model isn't in the chain", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "totally-foreign-model",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.entry.model, "gpt-5.5")
  assert.equal(r!.source, "agent-default")
})

test("input variant overrides chain variant", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
    inputVariant: "low",
  })
  assert.equal(r!.variant, "low")
})

test("user agent override beats built-in", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
    agentsConfig: {
      reviewer: {
        requirement: {
          variant: "minimal",
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", variant: "minimal" }],
        },
      },
    },
  })
  assert.equal(r!.source, "user-config")
  assert.equal(r!.variant, "minimal")
})

test("user shorthand `model` produces a one-entry chain", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "claude-opus-4-7",
    providerID: "anthropic",
    agentsConfig: {
      reviewer: { model: "anthropic/claude-opus-4-7" },
    },
  })
  assert.equal(r!.source, "user-config")
  assert.equal(r!.entry.model, "claude-opus-4-7")
})

test("disabled agent override drops to built-in", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
    agentsConfig: { reviewer: { disabled: true } },
  })
  assert.ok(r)
  assert.equal(r!.source, "agent-default")
})

test("unknown agent + variant -> input-variant resolution", () => {
  const r = resolveModelRouting({
    agentName: "build",
    modelID: "gpt-5.5",
    providerID: "openai",
    inputVariant: "high",
  })
  assert.equal(r!.source, "input-variant")
  assert.equal(r!.variant, "high")
})

test("unknown agent without variant -> null", () => {
  const r = resolveModelRouting({
    agentName: "totally-unknown",
    modelID: "totally-unknown-model",
    providerID: "openai",
  })
  assert.equal(r, null)
})

test("entryMatches does not reverse-prefix-match a shorter chain entry to a longer input", () => {
  // Two-entry chain: ['gpt-5.5', 'gpt-5']. Input 'gpt-5'.
  // Reverse-prefix (removed) would match entry 'gpt-5.5' to input 'gpt-5'
  // because 'gpt-5.5'.startsWith('gpt-5') is true. Forward-only (correct)
  // skips 'gpt-5.5' and matches 'gpt-5' exactly.
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5",
    providerID: "openai",
    agentsConfig: {
      reviewer: {
        model: "openai/gpt-5.5",
        fallbackModels: ["openai/gpt-5"],
      },
    },
  })
  assert.ok(r)
  assert.equal(r!.source, "user-config")
  assert.equal(r!.entry.model, "gpt-5", "should match the exact entry, not the reverse-prefix one")
})

test("entryMatches forward-prefix-matches versioned aliases", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5-20250101",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.entry.model, "gpt-5.5")
  assert.equal(r!.source, "agent-default")
})

test("entryMatches only accepts boundary-delimited version aliases", () => {
  const agentsConfig = {
    reviewer: {
      model: "openai/gpt-5.5",
      fallbackModels: ["openai/gpt-5.50"],
    },
  }
  const alias = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5-20260713",
    providerID: "openai",
    agentsConfig,
  })
  const distinctVersion = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.50",
    providerID: "openai",
    agentsConfig,
  })

  assert.equal(alias!.entry.model, "gpt-5.5")
  assert.equal(distinctVersion!.entry.model, "gpt-5.50")
})

test("routes supported GPT and GLM successors through synthesized actual entries", () => {
  const gpt = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.7-sol",
    providerID: "openai",
  })
  const glm = resolveModelRouting({
    agentName: "reviewer",
    modelID: "glm-5.2",
    providerID: "zhipu",
  })

  assert.deepEqual(gpt, {
    entry: {
      providers: ["openai"],
      model: "gpt-5.7-sol",
      variant: "xhigh",
    },
    variant: "xhigh",
    source: "agent-default",
  })
  assert.deepEqual(glm, {
    entry: {
      providers: ["zhipu"],
      model: "glm-5.2",
    },
    variant: "high",
    source: "agent-default",
  })
})

test("oracle routes Terra catalog successors through synthesized actual entries", () => {
  const result = resolveModelRouting({
    agentName: "oracle",
    modelID: "gpt-5.7-terra",
    providerID: "openai",
  })

  assert.deepEqual(result, {
    entry: {
      providers: ["openai"],
      model: "gpt-5.7-terra",
      variant: "xhigh",
    },
    variant: "xhigh",
    source: "agent-default",
  })
})

test("multi-hop aliases resolve the same effective requirement as direct config", () => {
  const result = resolveModelRouting({
    agentName: "oracle",
    modelID: "gpt-5.6-sol",
    providerID: "openai",
    agentsConfig: {
      oracle: { alias: "reviewer" },
      reviewer: { alias: "review-policy-a" },
      "review-policy-a": { alias: "review-policy-b" },
      "review-policy-b": { alias: "review-model" },
      "review-model": { model: "openai/gpt-5.6-sol", variant: "xhigh" },
    },
  })

  assert.equal(result?.source, "user-config")
  assert.equal(result?.entry.model, "gpt-5.6-sol")
  assert.equal(result?.variant, "xhigh")
})
