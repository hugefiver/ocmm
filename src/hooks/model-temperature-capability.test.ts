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
    { modelID: "o3-mini", supported: false },
    { modelID: "codex-mini-latest", supported: false },
    { modelID: "claude-opus-4-7", supported: false },
    { modelID: "gpt-4o", supported: true },
    { modelID: "claude-sonnet-4-6", supported: true },
  ] as const

  for (const testCase of cases) {
    assert.equal(supportsModelTemperature({
      providerID: "test-provider",
      modelID: testCase.modelID,
    }), testCase.supported, testCase.modelID)
  }
})
