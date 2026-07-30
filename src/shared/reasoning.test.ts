import assert from "node:assert/strict"
import { test } from "node:test"

import {
  REASONING_INPUT_VALUES,
  REASONING_VALUES,
  normalizeReasoning,
  reasoningToVariant,
  splitReasoningSuffix,
  variantToReasoningLevel,
} from "./reasoning.ts"

test("normalizes canonical reasoning inputs", () => {
  assert.deepEqual(REASONING_VALUES, ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"])
  assert.deepEqual(REASONING_INPUT_VALUES, ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"])
  assert.equal(normalizeReasoning("none"), "off")

  for (const reasoning of REASONING_VALUES) {
    assert.equal(normalizeReasoning(reasoning), reasoning)
  }

  assert.equal(normalizeReasoning(undefined), undefined)
})

test("splits recognized reasoning suffixes without corrupting model IDs", () => {
  assert.deepEqual(splitReasoningSuffix("openai/gpt-5.6-sol:high"), {
    model: "openai/gpt-5.6-sol",
    reasoning: "high",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:high"), {
    model: "gpt-5.6-sol",
    reasoning: "high",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:max"), { model: "gpt-5.6-sol:max" })
  assert.deepEqual(splitReasoningSuffix("openai/gpt-5.6-sol:max"), {
    model: "openai/gpt-5.6-sol",
    reasoning: "max",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:max", { providerContext: true }), {
    model: "gpt-5.6-sol",
    reasoning: "max",
  })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:unknown"), { model: "gpt-5.6-sol:unknown" })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:none"), { model: "gpt-5.6-sol:none" })
  assert.deepEqual(splitReasoningSuffix("gpt-5.6-sol:"), { model: "gpt-5.6-sol:" })
  assert.deepEqual(splitReasoningSuffix(":high"), { model: ":high" })
})

test("bridges only shared canonical reasoning and variants", () => {
  for (const sharedLevel of ["minimal", "low", "medium", "high", "xhigh", "max"] as const) {
    assert.equal(reasoningToVariant(sharedLevel), sharedLevel)
    assert.equal(variantToReasoningLevel(sharedLevel), sharedLevel)
  }

  assert.equal(reasoningToVariant("off"), undefined)
  assert.equal(reasoningToVariant("auto"), undefined)

  for (const legacyVariant of ["none", "auto", "thinking"] as const) {
    assert.equal(variantToReasoningLevel(legacyVariant), undefined)
  }
})
