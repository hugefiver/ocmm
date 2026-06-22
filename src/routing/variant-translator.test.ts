import { test } from "node:test"
import assert from "node:assert/strict"

import { translateVariant } from "./variant-translator.ts"

test("gpt family uses reasoningEffort", () => {
  assert.deepEqual(translateVariant("gpt", "low"), { reasoningEffort: "low" })
  assert.deepEqual(translateVariant("gpt", "medium"), { reasoningEffort: "medium" })
  assert.deepEqual(translateVariant("gpt", "xhigh"), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("gpt", "max"), { reasoningEffort: "high" })
  assert.deepEqual(translateVariant("gpt", "minimal"), { reasoningEffort: "minimal" })
})

test("claude opus 4.7+ uses larger thinking budgets than older claude", () => {
  const opusMax = translateVariant("claude-opus-47-plus", "max")
  const sonnetMax = translateVariant("claude", "max")
  assert.equal(opusMax.thinking?.type, "enabled")
  assert.equal(sonnetMax.thinking?.type, "enabled")
  assert.ok(opusMax.thinking?.budgetTokens! > sonnetMax.thinking?.budgetTokens!)
})

test("claude minimal disables thinking", () => {
  const v = translateVariant("claude-opus-47-plus", "minimal")
  assert.deepEqual(v.thinking, { type: "disabled" })
})

test("gemini high enables thinking + reasoningEffort", () => {
  const v = translateVariant("gemini", "high")
  assert.equal(v.reasoningEffort, "high")
  assert.equal(v.thinking?.type, "enabled")
})

test("generic providers fall back to temperature shaping", () => {
  assert.deepEqual(translateVariant("kimi", "low"), { temperature: 0.2 })
  assert.deepEqual(translateVariant("glm", "max"), { temperature: 1.0 })
  assert.deepEqual(translateVariant("unknown", "minimal"), { temperature: 0.0 })
})

test("none variant is a true no-op across all families", () => {
  assert.deepEqual(translateVariant("gpt", "none"), {})
  assert.deepEqual(translateVariant("claude-opus-47-plus", "none"), {})
  assert.deepEqual(translateVariant("claude", "none"), {})
  assert.deepEqual(translateVariant("gemini", "none"), {})
  assert.deepEqual(translateVariant("kimi", "none"), {})
  assert.deepEqual(translateVariant("glm", "none"), {})
  assert.deepEqual(translateVariant("unknown", "none"), {})
})
