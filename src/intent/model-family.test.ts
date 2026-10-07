import { test } from "node:test"
import assert from "node:assert/strict"

import {
  classifyModelFamily,
  extractModelName,
  isClaudeOpus5Model,
  isClaudeOpus47OrLaterModel,
  isCodexModel,
  isDeepSeekModel,
  isGeminiModel,
  isGpt61OrLaterSolModel,
  isGpt6LunaModel,
  isGpt6SolModel,
  isGptModel,
  isMiniModel,
  isKimiK2CodePromptModel,
  isKimiK27Model,
  isKimiK28Model,
  isKimiK2Model,
  isSwe2Model,
  parseGptVersion,
  supportsNativeGptMaxReasoning,
} from "./model-family.ts"

test("extractModelName strips provider prefix", () => {
  assert.equal(extractModelName("google/gemini-3.1-pro"), "gemini-3.1-pro")
  assert.equal(extractModelName("github-copilot/gemini-3.5"), "gemini-3.5")
  assert.equal(extractModelName("plain-name"), "plain-name")
})

test("extractModelName strips known dotted vendor namespaces before model names", () => {
  assert.equal(extractModelName("amazon-bedrock/openai.gpt-5.6"), "gpt-5.6")
  assert.equal(extractModelName("amazon-bedrock/us.openai.gpt-5.4"), "gpt-5.4")
  assert.equal(extractModelName("amazon-bedrock/us.anthropic.claude-opus-4-7"), "claude-opus-4-7")
  assert.equal(extractModelName("unknown-vendor/openai.gpt-5.6"), "gpt-5.6")
  assert.equal(extractModelName("unknown-vendor/custom.gpt-5.6"), "custom.gpt-5.6")
  assert.equal(extractModelName("vendor/notgpt.openai.gpt-5.6"), "notgpt.openai.gpt-5.6")
})

test("isGptModel matches gpt family", () => {
  assert.equal(isGptModel("gpt-5.5"), true)
  assert.equal(isGptModel("openai/gpt-5.4-mini"), true)
  assert.equal(isGptModel("amazon-bedrock/us.openai.gpt-5.4"), true)
  assert.equal(isGptModel("claude-opus-4-7"), false)
})

test("GPT version parsing supports vendor-prefixed dotted Bedrock aliases", () => {
  assert.deepEqual(parseGptVersion("amazon-bedrock/openai.gpt-5.6"), [5, 6, 0])
  assert.deepEqual(parseGptVersion("amazon-bedrock/us.openai.gpt-5.4"), [5, 4, 0])
  assert.deepEqual(parseGptVersion("gpt-5_6-sol"), [5, 6, 0])
  assert.equal(supportsNativeGptMaxReasoning("amazon-bedrock/openai.gpt-5.6"), true)
})

test("isGpt6SolModel matches only Sol names and aliases across known provider prefixes", () => {
  for (const modelID of [
    "gpt-6-sol",
    "gpt-6-sol-fast",
    "OPENAI/GPT-6-SOL",
    "providers/openai/gpt-6-sol-fast",
    "amazon-bedrock/openai.gpt-6-sol",
    "amazon-bedrock/us.openai.gpt-6-sol.fast",
    "gpt-6-sol_preview",
  ]) {
    assert.equal(isGpt6SolModel(modelID), true, modelID)
  }
  for (const modelID of [
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6-solar",
    "gpt-6-solstice",
    "prefix-gpt-6-sol",
    "vendor/custom.gpt-6-sol",
    "unrelated",
  ]) {
    assert.equal(isGpt6SolModel(modelID), false, modelID)
  }
})

test("isGpt6LunaModel matches only Luna names and aliases across known provider prefixes", () => {
  for (const modelID of [
    "gpt-6-luna",
    "openai-codex/gpt-6-luna-fast",
    "OPENAI/GPT-6-LUNA",
    "amazon-bedrock/us.openai.gpt-6-luna.fast",
    "gpt-6-luna_preview",
  ]) {
    assert.equal(isGpt6LunaModel(modelID), true, modelID)
  }
  for (const modelID of ["gpt-6-lunar", "gpt-6-astra", "gpt-6-astral", "gpt-6-sol", "gpt-6-solar", "prefix-gpt-6-luna", "vendor/custom.gpt-6-luna"]) {
    assert.equal(isGpt6LunaModel(modelID), false, modelID)
  }
})

test("Sol 6.1+ capability detection is versioned and rejects adjacent lanes and names", () => {
  for (const modelID of ["gpt-6.1-sol", "OPENAI/GPT-6.2-SOL-FAST", "amazon-bedrock/us.openai.gpt-6.1-sol.preview", "gpt-6.1.1-sol", "gpt-7-sol"]) {
    assert.equal(isGpt61OrLaterSolModel(modelID), true, modelID)
    assert.equal(supportsNativeGptMaxReasoning(modelID), true, modelID)
  }
  for (const modelID of ["gpt-5.6-sol", "gpt-6-sol", "gpt-6.0-sol", "gpt-6.1-solar", "gpt-6.1-solstice", "gpt-6.1-astra", "gpt-6.1-luna", "gpt-6.1", "prefix-gpt-6.1-sol", "vendor/custom.gpt-6.1-sol"]) {
    assert.equal(isGpt61OrLaterSolModel(modelID), false, modelID)
  }
})

test("isCodexModel matches codex family without catching generic GPT", () => {
  assert.equal(isCodexModel("codex-mini-latest"), true)
  assert.equal(isCodexModel("openai/codex-1"), true)
  assert.equal(isCodexModel("gpt-5.5"), false)
  assert.equal(isCodexModel("gpt-5.5", "github-copilot"), false)
})

test("isMiniModel matches mini model names", () => {
  assert.equal(isMiniModel("gpt-5.4-mini"), true)
  assert.equal(isMiniModel("codex-mini-latest"), true)
  assert.equal(isMiniModel("gpt-5.5"), false)
})

test("isClaudeOpus47OrLaterModel matches >= 4.7 and claude-fable", () => {
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-4-7"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-4-8"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-5-0"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-4-6"), false)
  assert.equal(isClaudeOpus47OrLaterModel("claude-fable-1"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-sonnet-4-6"), false)
})

test("isClaudeOpus5Model accepts only exact Opus 5/5.5, provider-prefixed, date, and named snapshots", () => {
  for (const modelID of [
    "claude-opus-5",
    "anthropic/claude-opus-5",
    "providers/anthropic/claude-opus-5",
    "claude-opus-5-5",
    "claude-opus-5.5",
    "anthropic/claude-opus-5-5",
    "providers/anthropic/claude-opus-5.5",
    "amazon-bedrock/us.anthropic.claude-opus-5-5",
    "claude-opus-5-5@default",
    "amazon-bedrock/global.anthropic.claude-opus-5-5",
    "amazon-bedrock/global.anthropic.claude-opus-5-5@default",
    "claude-opus-5@default",
    "claude-opus-5.5@default",
    "claude-opus-5-5-20260728",
    "claude-opus-5.5.latest",
    "claude-opus-5-20260728",
    "claude-opus-5.20260728",
    "claude-opus-5.20260728-beta.1",
    "claude-opus-5-latest",
    "claude-opus-5.preview",
  ]) {
    assert.equal(isClaudeOpus5Model(modelID), true, modelID)
  }

  for (const modelID of [
    "claude-opus-4-8",
    "claude-opus-5-50",
    "claude-opus-5.0",
    "claude-opus-50",
    "claude-sonnet-5",
    "prefix-claude-opus-5",
    "prefix-claude-opus-5-5",
    "claude-opus-5_20260728",
    "claude-opus-5-19990101",
    "claude-opus-5-5@other",
    "claude-opus-5-5@default-extra",
    "claude-opus-5-5@default@default",
    "claude-opus-5-50@default",
    "prefix-claude-opus-5-5@default",
    "amazon-bedrock/global.unknown.claude-opus-5-5",
    "amazon-bedrock/global.anthropic.anthropic.claude-opus-5-5",
    "amazon-bedrock/global.anthropic.claude-opus-5-50@default",
    "amazon-bedrock/global.openai.claude-opus-5-5",
    "amazon-bedrock/other.anthropic.claude-opus-5-5",
    "unrelated",
  ]) {
    assert.equal(isClaudeOpus5Model(modelID), false, modelID)
  }
})

test("isGeminiModel covers provider + name signals", () => {
  assert.equal(isGeminiModel("google/gemini-3.1-pro"), true)
  assert.equal(isGeminiModel("google-vertex/gemini-3-flash"), true)
  assert.equal(isGeminiModel("gemini-3-flash"), true)
  assert.equal(isGeminiModel("gemini-3", "github-copilot"), true)
  assert.equal(isGeminiModel("gpt-5.5"), false)
})

test("Kimi K2.7 and K2.8 coding aliases share one precise prompt calibration", () => {
  assert.equal(isKimiK2Model("kimi-k2.6"), true)
  assert.equal(isKimiK2Model("k2p5"), true)
  assert.equal(isKimiK2Model("k2-p7"), true)
  assert.equal(isKimiK2Model("k2p8"), false)
  assert.equal(isKimiK2Model("gpt-5"), false)

  for (const modelID of [
    "kimi-k2.7",
    "MOONSHOT/KIMI-K2-7-PREVIEW",
    "kimi-for-coding/k2p7-fast",
  ]) {
    assert.equal(isKimiK27Model(modelID), true, modelID)
    assert.equal(isKimiK2CodePromptModel(modelID), true, modelID)
  }
  assert.equal(isKimiK2CodePromptModel("kimi-for-coding/kimi-for-coding-highspeed"), true)
  for (const modelID of [
    "kimi-k2.8",
    "MOONSHOT/KIMI-K2-8-PREVIEW",
    "kimi-for-coding/k2.p8-fast",
    "kimi-for-coding/kimi-for-coding",
  ]) {
    assert.equal(isKimiK28Model(modelID), true, modelID)
    assert.equal(isKimiK2CodePromptModel(modelID), true, modelID)
  }
  for (const modelID of ["kimi-k2.6", "kimi-k2.70", "kimi-k2.80", "xkimi-k2.8", "provider-kimi-for-coding/model"]) {
    assert.equal(isKimiK2CodePromptModel(modelID), false, modelID)
  }
  assert.equal(isKimiK27Model("prefix-kimi-k2.7-snapshot"), true, "legacy K2.7 matcher remains compatible")
  assert.equal(isKimiK27Model("kimi-for-coding/kimi-for-coding-highspeed"), false)
  assert.equal(isKimiK27Model("kimi-for-coding/kimi-for-coding"), false)
  assert.equal(isKimiK28Model("kimi-for-coding/kimi-for-coding-highspeed"), false)
})

test("SWE-2 detection is provider-safe and does not absorb adjacent model names", () => {
  for (const modelID of ["swe-2", "devin/swe-2-low", "DEVIN/SWE-2.HIGH", "providers/devin/swe-2-max-preview"]) {
    assert.equal(isSwe2Model(modelID), true, modelID)
  }
  for (const modelID of ["swe-20", "swe-21-low", "xswe-2", "swe/2", "swe-2-provider/unrelated"]) {
    assert.equal(isSwe2Model(modelID), false, modelID)
  }
})

test("deepseek family detection", () => {
  assert.equal(isDeepSeekModel("deepseek-v4-pro"), true)
  assert.equal(isDeepSeekModel("moonshot-v1", "deepseek"), true)
  assert.equal(isDeepSeekModel("glm-5.2"), false)
})

test("classifyModelFamily picks the highest-priority match", () => {
  assert.equal(classifyModelFamily({ modelID: "codex-mini-latest" }), "codex")
  assert.equal(classifyModelFamily({ modelID: "gpt-5.5" }), "gpt")
  assert.equal(classifyModelFamily({ modelID: "amazon-bedrock/us.openai.gpt-5.4" }), "gpt")
  assert.equal(classifyModelFamily({ modelID: "claude-opus-4-7" }), "claude-opus-47-plus")
  assert.equal(classifyModelFamily({ modelID: "anthropic/claude-opus-5" }), "claude-opus-47-plus")
  assert.equal(classifyModelFamily({ modelID: "claude-opus-5.5" }), "claude-opus-47-plus")
  assert.equal(classifyModelFamily({ modelID: "claude-sonnet-4-6" }), "claude")
  assert.equal(
    classifyModelFamily({ modelID: "gemini-3.1-pro", providerID: "google" }),
    "gemini",
  )
  assert.equal(classifyModelFamily({ modelID: "kimi-k2.7" }), "kimi-k27")
  assert.equal(classifyModelFamily({ modelID: "kimi-k2.6" }), "kimi")
  assert.equal(classifyModelFamily({ modelID: "minimax-m3" }), "minimax")
  assert.equal(classifyModelFamily({ modelID: "glm-5.1" }), "glm")
  assert.equal(classifyModelFamily({ modelID: "deepseek-v4-pro" }), "deepseek")
  assert.equal(classifyModelFamily({ modelID: "totally-unknown" }), "unknown")
})

test("additive prompt routing does not change reasoning-family classification", () => {
  const cases = [
    ["kimi-k2.7", "kimi-k27"],
    ["kimi-k2.8", "kimi"],
    ["kimi-for-coding/kimi-for-coding", "kimi"],
    ["kimi-for-coding/kimi-for-coding-highspeed", "kimi"],
    ["kimi-for-coding/k2p8", "unknown"],
    ["devin/swe-2-high", "unknown"],
  ] as const

  for (const [modelID, family] of cases) {
    assert.equal(classifyModelFamily({ modelID }), family, modelID)
  }
})
