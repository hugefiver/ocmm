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
  isGemini4PromptModel,
  isGpt61OrLaterSolModel,
  isGpt6LunaModel,
  isGpt6SolModel,
  isGptModel,
  isMiniModel,
  isKimiPromptModel,
  isKimiK31OrLaterPromptModel,
  isKimiK27Model,
  isKimiK2Model,
  isSwe2Model,
  parseGptVersion,
  recognizeModelName,
  supportsNativeGptMaxReasoning,
} from "./model-family.ts"

test("extractModelName strips provider prefix", () => {
  assert.equal(extractModelName("google/gemini-3.1-pro"), "gemini-3.1-pro")
  assert.equal(extractModelName("github-copilot/gemini-3.5"), "gemini-3.5")
  assert.equal(extractModelName("plain-name"), "plain-name")
  assert.equal(extractModelName("gateway/gpt/6.1/sol"), "sol")
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
    "prefix-gpt-6-sol",
    "vendor/custom.gpt-6-sol",
  ]) {
    assert.equal(isGpt6SolModel(modelID), true, modelID)
  }
  for (const modelID of [
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6-solar",
    "gpt-6-solstice",
    "unrelated",
  ]) {
    assert.equal(isGpt6SolModel(modelID), false, modelID)
  }
})

test("isGpt6LunaModel matches only Luna names and aliases across known provider prefixes", () => {
  for (const modelID of [
    "gpt-6-luna",
    "auto-gpt/6/luna-fast",
    "OPENAI/GPT-6-LUNA",
    "amazon-bedrock/us.openai.gpt-6-luna.fast",
    "gpt-6-luna_preview",
    "prefix-gpt-6-luna",
    "vendor/custom.gpt-6-luna",
  ]) {
    assert.equal(isGpt6LunaModel(modelID), true, modelID)
  }
  for (const modelID of ["gpt-6-lunar", "gpt-6-astra", "gpt-6-astral", "gpt-6-sol", "gpt-6-solar"]) {
    assert.equal(isGpt6LunaModel(modelID), false, modelID)
  }
})

test("Sol 6.1+ capability detection is versioned and rejects adjacent lanes and names", () => {
  for (const modelID of ["gpt-6.1-sol", "OPENAI/GPT-6.2-SOL-FAST", "amazon-bedrock/us.openai.gpt-6.1-sol.preview", "gpt-6.1.1-sol", "gpt-7-sol", "prefix-gpt-6.1-sol", "vendor/custom.gpt-6.1-sol"]) {
    assert.equal(isGpt61OrLaterSolModel(modelID), true, modelID)
    assert.equal(supportsNativeGptMaxReasoning(modelID), true, modelID)
  }
  for (const modelID of ["gpt-5.6-sol", "gpt-6-sol", "gpt-6.0-sol", "gpt-6.1-solar", "gpt-6.1-solstice", "gpt-6.1-astra", "gpt-6.1-luna", "gpt-6.1"]) {
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
    "prefix-claude-opus-5",
    "prefix-claude-opus-5-5",
    "claude-opus-5_20260728",
    "claude-opus-5-19990101",
    "claude-opus-5-5@other",
    "claude-opus-5-5@default-extra",
    "claude-opus-5-5@default@default",
    "prefix-claude-opus-5-5@default",
    "amazon-bedrock/global.unknown.claude-opus-5-5",
    "amazon-bedrock/global.anthropic.anthropic.claude-opus-5-5",
    "amazon-bedrock/global.openai.claude-opus-5-5",
    "amazon-bedrock/other.anthropic.claude-opus-5-5",
  ]) {
    assert.equal(isClaudeOpus5Model(modelID), true, modelID)
  }

  for (const modelID of [
    "claude-opus-4-8",
    "claude-opus-5-50",
    "claude-opus-5.0",
    "claude-opus-50",
    "claude-sonnet-5",
    "claude-opus-5-50@default",
    "amazon-bedrock/global.anthropic.claude-opus-5-50@default",
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

test("Kimi prompt selection scans complete names with generations and coding aliases", () => {
  assert.equal(isKimiK2Model("kimi-k2.6"), true)
  assert.equal(isKimiK2Model("k2p5"), true)
  assert.equal(isKimiK2Model("k2-p7"), true)
  assert.equal(isKimiK2Model("k2p8"), false)
  assert.equal(isKimiK2Model("gpt-5"), false)

  for (const modelID of [
    "kimi-k2", "kimi-k2.5", "kimi-k2.6", "kimi-k2.7",
    "MOONSHOT/KIMI-K2-7-PREVIEW", "kimi-for-coding/k2p7-fast",
    "kimi-k2.8",
    "MOONSHOT/KIMI-K2-8-PREVIEW",
    "kimi-for-coding/k2.p8-fast",
    "kimi-for-coding/kimi-for-coding",
    "kimi-for-coding/kimi-for-coding-highspeed",
    "moonshot/kimi-k3", "moonshot/kimi-k3.1-preview", "MOONSHOT/KIMI-K3-1",
    "k2-p5", "k2.p6", "k2p7", "k2p8",
    "provider-kimi-for-coding/model", "kimi-provider/gpt-6", "prefix-kimi-k3.1",
  ]) {
    assert.equal(isKimiPromptModel(modelID), true, modelID)
  }
  for (const modelID of ["xkimi-k2.8", "xkimi-k3", "xkimi-k3.1", "xkimi-k3p1", "k2p80", "k2p9"]) {
    assert.equal(isKimiPromptModel(modelID), false, modelID)
  }
  assert.equal(isKimiK27Model("prefix-kimi-k2.7-snapshot"), true, "legacy K2.7 matcher remains compatible")
  assert.equal(isKimiK27Model("kimi-for-coding/kimi-for-coding-highspeed"), false)
  assert.equal(isKimiK27Model("kimi-for-coding/kimi-for-coding"), false)
})

test("Kimi K3.1+ prompt matching uses the first identity and its local numeric version", () => {
  for (const modelID of [
    "kimi-k3.1", "kimi-k3-1", "kimi-k3p1", "MOONSHOT/KIMI-K3.1-PREVIEW",
    "k3p1", "k3.1", "k3-1", "gateway/k3/1", "prefix/k3p1-fast",
    "kimi-k3.2", "kimi-k3.10", "kimi-k4", "kimi-k10.0", "k4", "k3p2", "k10.1",
    "gateway/kimi/k3/1/preview", "kimi-k3.1-kimi-k3", "k3p1-gpt-6",
  ]) {
    assert.equal(isKimiPromptModel(modelID), true, modelID)
    assert.equal(isKimiK31OrLaterPromptModel(modelID), true, modelID)
  }
  for (const modelID of ["k3", "k3.0", "k3-k3.1"]) {
    assert.equal(isKimiPromptModel(modelID), true, modelID)
    assert.equal(isKimiK31OrLaterPromptModel(modelID), false, modelID)
  }
  for (const modelID of [
    "kimi", "kimi-for-coding/kimi-for-coding-highspeed", "kimi-k2.7", "k2p5", "k2-p7", "k2p8",
    "kimi-k3", "kimi-k3.0", "kimi-k3.0.9", "kimi-k3.1foo", "kimi-k3p1foo", "kimi-k3.1.2.3",
    "gpt-6-kimi-k3.1", "claude-opus-5-k3p1", "kimi-k3-kimi-k3.1", "kimi-k3/kimi-k4",
    "kimi-k3@1", "kimi-k3:1", "xk3p1", "unknown/model",
  ]) {
    assert.equal(isKimiK31OrLaterPromptModel(modelID), false, modelID)
  }
})

test("Kimi prompt aliases leave reasoning identity and effort-family matching unchanged", () => {
  for (const modelID of ["k3", "k3.0", "k3-k3.1", "k3p1", "k3.1", "k3-1", "k4", "gateway/k3/1"]) {
    assert.equal(recognizeModelName(modelID), null, modelID)
    assert.equal(classifyModelFamily({ modelID, providerID: "kimi-k3.1" }), "unknown", modelID)
    assert.equal(isKimiK2Model(modelID), false, modelID)
    assert.equal(isKimiK27Model(modelID), false, modelID)
  }
  for (const modelID of ["kimi-k3.1", "kimi-k3p1", "kimi-k4", "kimi-k3-kimi-k3.1"]) {
    assert.equal(classifyModelFamily({ modelID }), "kimi", modelID)
    assert.equal(recognizeModelName(modelID)?.version, null, modelID)
    assert.equal(isKimiK2Model(modelID), true, modelID)
    assert.equal(isKimiK27Model(modelID), false, modelID)
  }
  assert.equal(classifyModelFamily({ modelID: "k3p1-gpt-6" }), "gpt")
  for (const modelID of ["kimi-k27", "auto-kimi-k27", "kimi-k27/preview", "kimi-k27.1"]) {
    assert.equal(classifyModelFamily({ modelID }), "kimi-k27", modelID)
    assert.equal(isKimiK27Model(modelID), true, modelID)
    assert.equal(isKimiPromptModel(modelID), true, modelID)
    assert.equal(isKimiK31OrLaterPromptModel(modelID), false, modelID)
  }
})

test("Gemini 4 prompt matching respects numeric boundaries across wrappers", () => {
  for (const modelID of ["gemini-4", "gemini-4-argon", "GEMINI-4.1-PRO", "google/gemini-4.0-flash", "providers/google/gemini-4.2-preview", "bedrock/google.gemini-4-argon", "bedrock/us.google.gemini-4.1-pro", "prefix-gemini-4", "provider/custom.gemini-4", "gemini-4.", "gemini4.x-pro", "gemini5.x:latest", "gemini-5-pro", "gemini-40-pro"]) {
    assert.equal(isGemini4PromptModel(modelID), true, modelID)
  }
  for (const modelID of ["gemini-3.1-pro", "gemini-3-gemini-5", "gemini-4argon", "gemini-4.1foo", "gemini-5.1.2.3", "gemini-4.x.1", "gemini-5.9007199254740992", "gemini-provider/model", "google/gpt-6"]) {
    assert.equal(isGemini4PromptModel(modelID), false, modelID)
  }
})

test("SWE-2 detection scans full names and does not absorb adjacent generations", () => {
  for (const modelID of ["swe-2", "devin/swe-2-low", "DEVIN/SWE-2.HIGH", "providers/devin/swe-2-max-preview", "swe/2", "swe-2-provider/unrelated"]) {
    assert.equal(isSwe2Model(modelID), true, modelID)
  }
  for (const modelID of ["swe-20", "swe-21-low", "xswe-2"]) {
    assert.equal(isSwe2Model(modelID), false, modelID)
  }
})

test("deepseek family detection", () => {
  assert.equal(isDeepSeekModel("deepseek-v4-pro"), true)
  assert.equal(isDeepSeekModel("moonshot-v1", "deepseek"), true)
  assert.equal(isDeepSeekModel("glm-5.2"), false)
})

test("classifyModelFamily projects the recognized identifier", () => {
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
    ["kimi-for-coding/k2p8", "kimi"],
    ["auto-k2p8", "unknown"],
    ["moonshot/kimi-k3.1", "kimi"],
    ["google/gemini-4-argon", "gemini"],
    ["devin/swe-2-high", "unknown"],
  ] as const

  for (const [modelID, family] of cases) {
    assert.equal(classifyModelFamily({ modelID }), family, modelID)
  }
})

test("complete model fields select the leftmost identifier and bound its attributes", () => {
  for (const [modelID, family] of [
    ["claude-opus-5-gpt-6.1-sol", "claude-opus-47-plus"],
    ["gemini-4-pro-gpt-6-codex", "gemini"],
    ["prefix-gpt-5.6-codex-fast", "codex"],
    ["gpt-5.5-claude-opus-5-codex", "gpt"],
    ["gpt-6-sol/gemini-4-pro", "gpt"],
    ["not-kimi-k3", "kimi"],
    ["auto-deepseek-v41", "deepseek"],
    ["auto-swe/2/high-gpt-6", "unknown"],
    ["auto-k2p8-gpt-6", "unknown"],
    ["xkimi-k3", "unknown"], ["notgpt-6", "unknown"],
    ["kimish", "unknown"], ["codexish", "unknown"],
  ] as const) {
    assert.equal(classifyModelFamily({ modelID }), family, modelID)
  }
  assert.equal(parseGptVersion("claude-opus-5-gpt-6.1-sol"), null)
  assert.deepEqual(parseGptVersion("gpt-5.5-gpt-6.1-sol"), [5, 5, 0])
  assert.equal(isGpt61OrLaterSolModel("gpt-5.5-gpt-6.1-sol"), false)
  assert.equal(isCodexModel("gpt-5.5-claude-opus-5-codex"), false)
  assert.equal(isMiniModel("mini-gpt-5.5-claude-opus-5-mini"), false)
  assert.equal(isMiniModel("auto-gpt-5.5-mini-gemini-4"), true)
  assert.equal(recognizeModelName("auto-deepseek-v41")?.version, null)
})

test("version and lane parsing accepts mixed separators without borrowing suffix numbers", () => {
  for (const modelID of ["auto-gpt-6.1-sol", "auto-gpt/6.1/sol", "GPT_6_1_SOL", "gpt 6.1 sol", "custom.chatgpt-6_1-sol"]) {
    assert.deepEqual(parseGptVersion(modelID), [6, 1, 0], modelID)
    assert.equal(isGpt61OrLaterSolModel(modelID), true, modelID)
    assert.equal(isGpt6SolModel(modelID), false, modelID)
  }
  for (const [modelID, version] of [
    ["gpt-5-20261101", [5, 0, 0]],
    ["gpt-5.5-1m", [5, 5, 0]],
    ["gpt-5.5-fast-6", [5, 5, 0]],
    ["gpt-5.5-2fast", [5, 5, 0]],
    ["gpt-5.5-gpt-6.1-sol", [5, 5, 0]],
  ] as const) {
    assert.deepEqual(parseGptVersion(modelID), version, modelID)
    assert.equal(supportsNativeGptMaxReasoning(modelID), false, modelID)
  }
  for (const modelID of ["auto gemini/4/pro", "CUSTOM.GEMINI_4_1_PRO"]) {
    assert.equal(isGemini4PromptModel(modelID), true, modelID)
  }
  assert.equal(isClaudeOpus5Model("auto-claude_opus_5_5-20261101"), true)
  assert.equal(isClaudeOpus47OrLaterModel("auto-claude.opus.4.7"), true)
  assert.equal(isKimiK27Model("auto-kimi-k27"), true)
  assert.equal(isKimiK27Model("auto-kimi-k2-p7"), true)
  assert.equal(isKimiK27Model("k2p5-k2p7"), false)
  assert.equal(isKimiK27Model("kimi-kimi-k2.7"), false)
})

test("provider hints cannot override any recognized identifier or supply version facts", () => {
  for (const [providerID, modelID, family] of [
    ["codex", "gpt-5.6", "gpt"],
    ["google", "auto-gpt-6.1-sol", "gpt"],
    ["deepseek", "gemini-4-pro", "gemini"],
    ["codex", "auto-k2p8-gpt-6", "unknown"],
    ["google", "swe/2/high", "unknown"],
    ["GOOGLE-VERTEX", "custom-model", "gemini"],
    ["Custom-CODEX", "custom-model", "codex"],
    ["DEEPSEEK", "custom-model", "deepseek"],
    ["gateway", "gpt-6-sol/gemini-4-pro", "gpt"],
    ["kimi", "kimi/k2p8", "kimi"],
  ] as const) {
    const route = Object.freeze({ providerID, modelID })
    assert.equal(classifyModelFamily(route), family, `${providerID}/${modelID}`)
  }
  assert.equal(isCodexModel("gpt-5.6", "codex"), false)
  assert.equal(isGeminiModel("gpt-6-sol", "GOOGLE"), false)
  assert.equal(isDeepSeekModel("glm-5.3", "deepseek"), false)
})

test("compact family aliases select and terminate identifiers without implying a version", () => {
  for (const [modelID, family] of [
    ["gpt4o", "gpt"], ["auto-chatgpt4o", "gpt"], ["custom.glm4", "glm"],
    ["gpt4o-gemini-4-pro", "gpt"], ["glm4-gpt-6.1-sol", "glm"],
  ] as const) {
    assert.equal(classifyModelFamily({ modelID }), family, modelID)
    assert.equal(recognizeModelName(modelID)?.version, null, modelID)
  }
  assert.equal(parseGptVersion("gpt4o-6.1-sol"), null)
  assert.equal(supportsNativeGptMaxReasoning("gpt4o-6.1-sol"), false)
  assert.equal(isGpt61OrLaterSolModel("gpt4o-6.1-sol"), false)
  assert.equal(isMiniModel("gpt-5.5-gpt4o-mini"), false)
  assert.equal(isGemini4PromptModel("gpt4o-gemini-4-pro"), false)
  for (const modelID of ["notgpt4o", "notchatgpt4o", "xglm4", "codexish"]) {
    assert.equal(classifyModelFamily({ modelID }), "unknown", modelID)
  }
})

test("long numeric version components remain distinct from exact versions and snapshot dates", () => {
  for (const modelID of ["claude-opus-5.5000", "auto-claude_opus_5_5000-20261101", "claude-opus-5000", "claude-opus-5.20000000"]) {
    assert.equal(isClaudeOpus5Model(modelID), false, modelID)
  }
  assert.deepEqual(recognizeModelName("glm-5.1.1000")?.version, [5, 1, 1000])
  assert.deepEqual(recognizeModelName("glm-5.1.20000000")?.version, [5, 1, 20000000])
  assert.deepEqual(parseGptVersion("gpt-5.6000"), [5, 6000, 0])
  assert.deepEqual(parseGptVersion("gpt-5.5-20261101"), [5, 5, 0])
  assert.deepEqual(parseGptVersion("gpt-5.5-1m"), [5, 5, 0])
  assert.equal(isClaudeOpus5Model("claude-opus-5-19990101"), true)
  assert.equal(isClaudeOpus5Model("claude-opus-5.5-20261101"), true)
})

test("seven exact series share compact, series-first, and numeric-first grammar", () => {
  for (const [series, kind, major, minor] of [
    ["sol", "gpt", 6, 1], ["terra", "gpt", 6, 2], ["astra", "gpt", 6, 0], ["luna", "gpt", 6, 0],
    ["opus", "claude", 4, 7], ["sonnet", "claude", 4, 6], ["haiku", "claude", 4, 5],
  ] as const) {
    for (const modelID of [
      `${series}${major}.${minor}`, `${series}-${major}-${minor}`, `${major}.${minor}${series}`,
      `${major}-${minor}-${series}`, `${kind}-${series}${major}.${minor}`, `${kind}-${major}.${minor}${series}`,
    ]) {
      const model = recognizeModelName(modelID)
      assert.equal(model?.kind, kind, modelID)
      assert.equal(model?.series, series, modelID)
      assert.deepEqual(model?.version, [major, minor, 0], modelID)
      assert.equal(model?.versionParts, 2, modelID)
      assert.equal(model?.opus, series === "opus", modelID)
      assert.equal(model?.lane, kind === "gpt" ? series : undefined, modelID)
    }
  }
  for (const modelID of ["gpt6.1sol", "gpt6.1-sol", "chatgpt6.1sol", "auto/SOL_6_1", "Group/6.2Sol-128k"]) {
    assert.equal(isGpt61OrLaterSolModel(modelID), true, modelID)
  }
  assert.deepEqual(parseGptVersion("gpt6.1"), [6, 1, 0])
  assert.equal(isGpt6SolModel("6sol"), true)
  assert.equal(isGpt6LunaModel("luna-6"), true)
  assert.equal(isGpt61OrLaterSolModel("gpt6.1sol-2m"), true)
  assert.equal(isGpt61OrLaterSolModel("GPT_6_2_SOL-128k"), true)
  assert.equal(isGpt61OrLaterSolModel("gpt-6.1-sol-20261101"), true)
  assert.equal(recognizeModelName("6/astra")?.lane, "astra")
})

test("compact identifiers own their version and stop at later independent series", () => {
  for (const modelID of ["6.1sol-opus5", "6.1sol/gemini-4-pro", "gpt6.1sol", "gpt-sol6.1"]) {
    assert.equal(classifyModelFamily({ modelID }), "gpt", modelID)
    assert.deepEqual(parseGptVersion(modelID), [6, 1, 0], modelID)
  }
  assert.equal(classifyModelFamily({ modelID: "opus4.7-gpt6.1sol" }), "claude-opus-47-plus")
  for (const modelID of ["gpt-5.5-sol6.1-mini", "gpt-5.5-sol-6.1-mini", "gpt-5.5-fast-6.1sol-mini", "gpt-5.5-opus4.7-codex"]) {
    assert.deepEqual(parseGptVersion(modelID), [5, 5, 0], modelID)
    assert.equal(recognizeModelName(modelID)?.lane, undefined, modelID)
    assert.equal(isMiniModel(modelID), false, modelID)
    assert.equal(isCodexModel(modelID), false, modelID)
    assert.equal(supportsNativeGptMaxReasoning(modelID), false, modelID)
  }
  for (const modelID of ["gpt4o-6.1sol-mini", "chatgpt4o-6.1sol"]) {
    assert.equal(classifyModelFamily({ modelID }), "gpt", modelID)
    assert.equal(parseGptVersion(modelID), null, modelID)
    assert.equal(isGpt61OrLaterSolModel(modelID), false, modelID)
    assert.equal(isMiniModel(modelID), false, modelID)
  }
  for (const modelID of ["gpt6.1sol-codex", "sol6.1-codex"]) {
    assert.equal(classifyModelFamily({ modelID }), "codex", modelID)
    assert.deepEqual(parseGptVersion(modelID), [6, 1, 0], modelID)
    assert.equal(isGpt61OrLaterSolModel(modelID), true, modelID)
  }
})

test("series evidence never guesses partial, overlong, or borrowed numeric versions", () => {
  for (const modelID of ["gpt6.1foo", "gpt-6.1foo-sol", "sol6.1foo", "opus5.5foo", "gpt6.1.2.3sol", "sol6.1.2.3", "opus5.5.0.1"]) {
    assert.equal(recognizeModelName(modelID)?.version, null, modelID)
    assert.equal(supportsNativeGptMaxReasoning(modelID), false, modelID)
    assert.equal(isClaudeOpus5Model(modelID), false, modelID)
  }
  for (const modelID of ["4.7", "6.1", "xsol6.1", "notgpt6.1sol", "6.1solar", "astral6", "lunar6", "sonnetish4.6", "6.1.2.3sol", "6.1foo.2sol", "6.128k-sol", "sol"]) {
    assert.equal(classifyModelFamily({ modelID }), "unknown", modelID)
  }
  for (const [modelID, version] of [
    ["sol6.1-128k", [6, 1, 0]], ["gpt6.1sol-2m", [6, 1, 0]], ["opus5.5-20261101", [5, 5, 0]],
    ["sol5.6000", [5, 6000, 0]], ["sol5.1.1000", [5, 1, 1000]],
  ] as const) assert.deepEqual(recognizeModelName(modelID)?.version, version, modelID)
  assert.equal(classifyModelFamily({ providerID: "google", modelID: "sol6.1" }), "gpt")
  assert.equal(classifyModelFamily({ providerID: "codex", modelID: "opus5.5foo-gpt6.1sol" }), "claude")
  for (const modelID of ["opus5", "opus5.5-2m"]) assert.equal(isClaudeOpus5Model(modelID), true, modelID)
  for (const modelID of ["opus5.0", "opus5.50", "opus50", "sonnet5.5", "haiku5"]) assert.equal(isClaudeOpus5Model(modelID), false, modelID)
})

test("adjacent series terminate a numeric version only for their own family", () => {
  for (const [modelID, kind] of [
    ["gpt6.1opus", "gpt"], ["gpt-6.1sonnet", "gpt"], ["gpt6haiku", "gpt"],
    ["claude-opus-5.5sol", "claude"], ["opus5.5terra", "claude"],
    ["gemini-4.1sol", "gemini"], ["glm-5.3sol", "glm"], ["deepseek-4.1opus", "deepseek"],
  ] as const) {
    const model = recognizeModelName(modelID)
    assert.equal(model?.kind, kind, modelID)
    assert.equal(model?.version, null, modelID)
    assert.equal(supportsNativeGptMaxReasoning(modelID), false, modelID)
    assert.equal(isGemini4PromptModel(modelID), false, modelID)
    assert.equal(isClaudeOpus5Model(modelID), false, modelID)
  }
  for (const [modelID, version] of [
    ["gpt6.1sol", [6, 1, 0]], ["claude-4.7opus", [4, 7, 0]],
    ["gemini-4.1-sol", [4, 1, 0]], ["glm-5.3-sol", [5, 3, 0]],
  ] as const) assert.deepEqual(recognizeModelName(modelID)?.version, version, modelID)
})
