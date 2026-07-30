import { test } from "node:test"
import assert from "node:assert/strict"

import {
  normalizeReasoningForModel,
  normalizeVariantForModel,
  translateReasoning,
  translateVariant,
} from "./variant-translator.ts"

test("non-mini gpt family clamps below-high variants to high", () => {
  assert.deepEqual(translateVariant("gpt", "low", { modelID: "gpt-5.5" }), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("gpt", "medium", { modelID: "gpt-5.5" }), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("gpt", "minimal", { modelID: "gpt-5.5" }), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("gpt", "none", { modelID: "gpt-5.5" }), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("gpt", "xhigh", { modelID: "gpt-5.5" }), { reasoningEffort: "xhigh" })
  assert.deepEqual(translateVariant("gpt", "max", { modelID: "gpt-5.5" }), { reasoningEffort: "xhigh" })
  assert.deepEqual(translateVariant("gpt", "max", { modelID: "gpt-5.6-sol" }), { reasoningEffort: "max" })
  assert.deepEqual(translateVariant("gpt", "max", { modelID: "gpt-5.7-sol" }), { reasoningEffort: "xhigh" })
})

test("mini gpt and codex models keep the full reasoning ladder", () => {
  assert.deepEqual(translateVariant("gpt", "low", { modelID: "gpt-5.4-mini" }), { reasoningEffort: "low" })
  assert.deepEqual(translateVariant("gpt", "none", { modelID: "gpt-5.4-mini" }), {})
  assert.deepEqual(translateVariant("codex", "minimal", { modelID: "codex-mini-latest" }), { reasoningEffort: "minimal" })
})

test("codex non-mini models clamp below-high variants to high", () => {
  assert.deepEqual(translateVariant("codex", "low", { modelID: "codex-1" }), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("codex", "max", { modelID: "codex-1" }), { reasoningEffort: "xhigh" })
  assert.deepEqual(translateVariant("codex", "max", { modelID: "gpt-5.6-codex" }), { reasoningEffort: "max" })
})

test("claude opus 4.7+ emits no thinking budget", () => {
  assert.deepEqual(translateVariant("claude-opus-47-plus", "max", { modelID: "claude-opus-4-7" }), {})
  assert.deepEqual(translateVariant("claude-opus-47-plus", "low", { modelID: "claude-opus-4-7" }), {})
})

test("older claude still uses thinking budgets", () => {
  const v = translateVariant("claude", "max", { modelID: "claude-sonnet-4-6" })
  assert.equal(v.thinking?.type, "enabled")
  assert.equal(v.thinking?.budgetTokens, 24_576)
})

test("gemini high enables thinking + reasoningEffort", () => {
  const v = translateVariant("gemini", "high")
  assert.equal(v.reasoningEffort, "high")
  assert.equal(v.thinking?.type, "enabled")
})

test("generic providers fall back to temperature shaping", () => {
  assert.deepEqual(translateVariant("kimi", "low"), { temperature: 0.2 })
  assert.deepEqual(translateVariant("minimax", "max"), { temperature: 1.0 })
  assert.deepEqual(translateVariant("unknown", "minimal"), { temperature: 0.0 })
})

test("latest glm uses thinking plus canonical reasoning effort", () => {
  assert.deepEqual(translateVariant("glm", "minimal", { modelID: "glm-5.2", respectExplicit: true }), {
    reasoningEffort: "minimal",
  })
  assert.deepEqual(translateVariant("glm", "max", { modelID: "glm-5.2" }), {
    reasoningEffort: "max",
    thinking: { type: "enabled" },
  })
  assert.deepEqual(translateVariant("glm", "low", { modelID: "glm-5.2" }), {
    reasoningEffort: "high",
    thinking: { type: "enabled" },
  })
})

test("latest deepseek uses canonical reasoning effort", () => {
  assert.deepEqual(translateVariant("deepseek", "medium", { modelID: "deepseek-v4-pro" }), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("deepseek", "xhigh", { modelID: "deepseek-v4-pro" }), { reasoningEffort: "max" })
})

test("normalization records protected model minimum variant", () => {
  assert.equal(normalizeVariantForModel({ family: "gpt", modelID: "gpt-5.5", variant: "medium" }), "high")
  assert.equal(normalizeVariantForModel({ family: "gpt", modelID: "gpt-5.4-mini", variant: "medium" }), "medium")
  assert.equal(normalizeVariantForModel({ family: "glm", modelID: "glm-5.2", variant: "low" }), "high")
  assert.equal(normalizeVariantForModel({ family: "deepseek", modelID: "deepseek-v4-pro", variant: "none" }), "high")
})

test("none variant is a true no-op across all families", () => {
  assert.deepEqual(translateVariant("gpt", "none", { modelID: "gpt-5.4-mini" }), {})
  assert.deepEqual(translateVariant("codex", "none", { modelID: "codex-mini-latest" }), {})
  assert.deepEqual(translateVariant("claude", "none", { modelID: "claude-sonnet-4-6" }), {})
  assert.deepEqual(translateVariant("gemini", "none", { modelID: "gemini-3.1-pro" }), {})
  assert.deepEqual(translateVariant("kimi", "none", { modelID: "kimi-k2.6" }), {})
  assert.deepEqual(translateVariant("unknown", "none", { modelID: "totally-unknown" }), {})
})

test("canonical off actively disables only supported family controls", () => {
  assert.deepEqual(translateReasoning("gpt", "off"), { reasoningEffort: "none" })
  assert.deepEqual(translateReasoning("codex", "off"), { reasoningEffort: "none" })
  assert.deepEqual(translateReasoning("deepseek", "off"), { reasoningEffort: "none" })
  assert.deepEqual(translateReasoning("claude", "off"), { thinking: { type: "disabled" } })
  assert.deepEqual(translateReasoning("claude-opus-47-plus", "off"), {})
  assert.deepEqual(translateReasoning("gemini", "off"), {
    reasoningEffort: "none",
    thinking: { type: "disabled" },
  })
  assert.deepEqual(translateReasoning("glm", "off"), {
    reasoningEffort: "none",
    thinking: { type: "disabled" },
  })
  assert.deepEqual(translateReasoning("kimi", "off"), {})
  assert.deepEqual(translateReasoning("kimi-k27", "off"), {})
  assert.deepEqual(translateReasoning("minimax", "off"), {})
  assert.deepEqual(translateReasoning("unknown", "off"), {})
})

test("canonical auto injects no reasoning controls", () => {
  for (const family of [
    "gpt",
    "codex",
    "claude",
    "claude-opus-47-plus",
    "gemini",
    "glm",
    "deepseek",
    "unknown",
  ] as const) {
    assert.deepEqual(translateReasoning(family, "auto", { modelID: "test-model" }), {}, family)
  }
})

test("canonical normalization bridges the ladder through model minimums and caps", () => {
  const normalizeGpt55 = (reasoning: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "off" | "auto") =>
    normalizeReasoningForModel({ family: "gpt", modelID: "gpt-5.5", reasoning })

  assert.equal(normalizeGpt55("minimal"), "high")
  assert.equal(normalizeGpt55("low"), "high")
  assert.equal(normalizeGpt55("medium"), "high")
  assert.equal(normalizeGpt55("high"), "high")
  assert.equal(normalizeGpt55("xhigh"), "xhigh")
  assert.equal(normalizeGpt55("max"), "xhigh")
  assert.equal(normalizeGpt55("off"), "high")
  assert.equal(normalizeGpt55("auto"), "auto")
})

test("canonical reasoning respects explicit user values while retaining GPT max caps", () => {
  assert.deepEqual(translateReasoning("gpt", "low", {
    modelID: "gpt-5.5",
    respectExplicit: true,
  }), { reasoningEffort: "low" })
  assert.deepEqual(translateReasoning("gpt", "max", {
    modelID: "gpt-5.5",
    respectExplicit: true,
  }), { reasoningEffort: "xhigh" })
  assert.deepEqual(translateReasoning("gpt", "max", {
    modelID: "gpt-5.6-sol",
    respectExplicit: true,
  }), { reasoningEffort: "max" })
})
