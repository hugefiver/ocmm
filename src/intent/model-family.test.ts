import { test } from "node:test"
import assert from "node:assert/strict"

import {
  classifyModelFamily,
  extractModelName,
  isClaudeOpus47OrLaterModel,
  isCodexModel,
  isGeminiModel,
  isGptModel,
  isKimiK27Model,
  isKimiK2Model,
} from "./model-family.ts"

test("extractModelName strips provider prefix", () => {
  assert.equal(extractModelName("google/gemini-3.1-pro"), "gemini-3.1-pro")
  assert.equal(extractModelName("github-copilot/gemini-3.5"), "gemini-3.5")
  assert.equal(extractModelName("plain-name"), "plain-name")
})

test("isGptModel matches gpt family", () => {
  assert.equal(isGptModel("gpt-5.5"), true)
  assert.equal(isGptModel("openai/gpt-5.4-mini"), true)
  assert.equal(isGptModel("claude-opus-4-7"), false)
})

test("isCodexModel matches codex family without catching generic GPT", () => {
  assert.equal(isCodexModel("codex-mini-latest"), true)
  assert.equal(isCodexModel("openai/codex-1"), true)
  assert.equal(isCodexModel("gpt-5.5"), false)
  assert.equal(isCodexModel("gpt-5.5", "github-copilot"), false)
})

test("isClaudeOpus47OrLaterModel matches >= 4.7 and claude-fable", () => {
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-4-7"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-4-8"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-5-0"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-opus-4-6"), false)
  assert.equal(isClaudeOpus47OrLaterModel("claude-fable-1"), true)
  assert.equal(isClaudeOpus47OrLaterModel("claude-sonnet-4-6"), false)
})

test("isGeminiModel covers provider + name signals", () => {
  assert.equal(isGeminiModel("google/gemini-3.1-pro"), true)
  assert.equal(isGeminiModel("google-vertex/gemini-3-flash"), true)
  assert.equal(isGeminiModel("gemini-3-flash"), true)
  assert.equal(isGeminiModel("gemini-3", "github-copilot"), true)
  assert.equal(isGeminiModel("gpt-5.5"), false)
})

test("kimi family detection", () => {
  assert.equal(isKimiK2Model("kimi-k2.6"), true)
  assert.equal(isKimiK2Model("k2p5"), true)
  assert.equal(isKimiK2Model("k2-p7"), true)
  assert.equal(isKimiK2Model("gpt-5"), false)
  assert.equal(isKimiK27Model("kimi-k2.7"), true)
  assert.equal(isKimiK27Model("k2p7"), true)
  assert.equal(isKimiK27Model("kimi-k2.6"), false)
})

test("classifyModelFamily picks the highest-priority match", () => {
  assert.equal(classifyModelFamily({ modelID: "codex-mini-latest" }), "codex")
  assert.equal(classifyModelFamily({ modelID: "gpt-5.5" }), "gpt")
  assert.equal(classifyModelFamily({ modelID: "claude-opus-4-7" }), "claude-opus-47-plus")
  assert.equal(classifyModelFamily({ modelID: "claude-sonnet-4-6" }), "claude")
  assert.equal(
    classifyModelFamily({ modelID: "gemini-3.1-pro", providerID: "google" }),
    "gemini",
  )
  assert.equal(classifyModelFamily({ modelID: "kimi-k2.7" }), "kimi-k27")
  assert.equal(classifyModelFamily({ modelID: "kimi-k2.6" }), "kimi")
  assert.equal(classifyModelFamily({ modelID: "minimax-m3" }), "minimax")
  assert.equal(classifyModelFamily({ modelID: "glm-5.1" }), "glm")
  assert.equal(classifyModelFamily({ modelID: "totally-unknown" }), "unknown")
})
