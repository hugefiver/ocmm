import assert from "node:assert/strict"
import { test } from "node:test"

import { supportsModelTemperature } from "./model-temperature-capability.ts"

test("prefers an explicit runtime temperature capability", () => {
  assert.equal(supportsModelTemperature({
    providerID: "openai",
    modelID: "gpt-5.6-codex:high",
    supportsTemperature: true,
  }), true)
  assert.equal(supportsModelTemperature({
    providerID: "openai",
    modelID: "gpt-5.6-codex:high",
    supportsTemperature: false,
  }), false)
})

test("keeps temperature capability inputs isolated by provider for the same model ID", () => {
  const modelID = "shared-model:high"

  assert.equal(supportsModelTemperature({
    providerID: "provider-with-temperature",
    modelID,
    supportsTemperature: true,
  }), true)
  assert.equal(supportsModelTemperature({
    providerID: "provider-without-temperature",
    modelID,
    supportsTemperature: false,
  }), false)
})

test("normalizes every recognized colon reasoning suffix without stripping hyphenated model segments", () => {
  for (const suffix of ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"] as const) {
    assert.equal(supportsModelTemperature({
      providerID: "openai",
      modelID: `gpt-4o-mini:${suffix}`,
    }), true, suffix)
  }
})

test("uses the existing heuristic when no capability metadata is available", () => {
  const cases = [
    { modelID: "gpt-5.5", supported: false },
    { modelID: "gpt-5.1foo", supported: false },
    { modelID: "o3-mini", supported: false },
    { modelID: "codex-mini-latest", supported: false },
    { modelID: "claude-opus-4-7", supported: false },
    { modelID: "claude-opus-5-5", supported: false },
    { modelID: "anthropic/claude-opus-5-5", supported: false },
    { modelID: "claude-opus-5.5", supported: false },
    { modelID: "anthropic/claude-opus-5.5", supported: false },
    { modelID: "gpt-4o", supported: true },
    { modelID: "gpt4o-gpt-5", supported: true },
    { modelID: "claude-sonnet-4-6", supported: true },
    { modelID: "auto-gpt/5.5/fast", supported: false },
    { modelID: "prefix-gpt-5.6-codex-fast", supported: false },
    { modelID: "custom.o3_mini", supported: false },
    { modelID: "auto-claude_opus_5_5-20261101", supported: false },
    { modelID: "gemini-4-pro-gpt-5.6-codex", supported: true },
    { modelID: "claude-sonnet-4-6-gpt-5", supported: true },
    { modelID: "auto-swe/2/high-gpt-5", supported: true },
    { modelID: "auto-gpt-6.1-sol", supported: true },
    { modelID: "gpt-6-sol/gpt-5", supported: true },
    { modelID: "notgpt-5", supported: true },
    { modelID: "gpt6.1sol", supported: true },
    { modelID: "6.1sol", supported: true },
    { modelID: "sol6.1-codex", supported: false },
    { modelID: "sol5.1foo", supported: false },
    { modelID: "gpt5.1foo", supported: false },
    { modelID: "opus4.7", supported: false },
    { modelID: "opus-4-7", supported: false },
    { modelID: "opus5.5-2m", supported: false },
    { modelID: "opus5.5foo", supported: true },
    { modelID: "sonnet5.5", supported: true },
    { modelID: "haiku5", supported: true },
    { modelID: "gpt4o-6.1sol-codex", supported: true },
  ] as const

  for (const testCase of cases) {
    assert.equal(supportsModelTemperature({
      providerID: "test-provider",
      modelID: testCase.modelID,
    }), testCase.supported, testCase.modelID)
  }
})

test("runtime metadata overrides compact series temperature rules", () => {
  assert.equal(supportsModelTemperature({ providerID: "google", modelID: "opus4.7:high", supportsTemperature: true }), true)
  assert.equal(supportsModelTemperature({ providerID: "anthropic", modelID: "sol6.1", supportsTemperature: false }), false)
})
