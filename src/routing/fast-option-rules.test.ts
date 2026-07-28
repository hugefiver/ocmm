import assert from "node:assert/strict"
import { test } from "node:test"

import type { FastOptionRule } from "../config/schema.ts"
import {
  matchesFastOptionRule,
  mergeFastOptions,
  mergeFastOptionRules,
  resolveDefaultFastOptions,
} from "./fast-option-rules.ts"

function rule(match: FastOptionRule["match"], options: Record<string, unknown> = {}): FastOptionRule {
  return { match, options }
}

test("glob matching is whole-string, case-sensitive, and treats metacharacters literally", () => {
  assert.equal(
    matchesFastOptionRule(rule({ provider: "openai/*" }), { provider: "openai/compat/v1", model: "gpt-5" }),
    true,
  )
  assert.equal(matchesFastOptionRule(rule({ model: "gpt-?" }), { provider: "openai", model: "gpt-5" }), true)
  assert.equal(matchesFastOptionRule(rule({ model: "gpt-?" }), { provider: "openai", model: "gpt-55" }), false)
  assert.equal(matchesFastOptionRule(rule({ model: "?" }), { provider: "openai", model: "😀" }), true)
  assert.equal(matchesFastOptionRule(rule({ model: "??" }), { provider: "openai", model: "😀" }), false)
  assert.equal(matchesFastOptionRule(rule({ model: "gpt" }), { provider: "openai", model: "gpt-5" }), false)
  assert.equal(matchesFastOptionRule(rule({ model: "gpt-5" }), { provider: "openai", model: "gpt-5\n" }), false)
  assert.equal(matchesFastOptionRule(rule({ model: "gpt-5" }), { provider: "openai", model: "GPT-5" }), false)
  assert.equal(
    matchesFastOptionRule(rule({ model: "gpt-[5].(mini)" }), { provider: "openai", model: "gpt-[5].(mini)" }),
    true,
  )
})

test("all declared fast option match fields must match", () => {
  const constrained = rule({ provider: "openai", model: "gpt-*", sdk: "openai-sdk" })

  assert.equal(
    matchesFastOptionRule(constrained, { provider: "openai", model: "gpt-5", sdk: "openai-sdk" }),
    true,
  )
  assert.equal(
    matchesFastOptionRule(constrained, { provider: "anthropic", model: "gpt-5", sdk: "openai-sdk" }),
    false,
  )
  assert.equal(matchesFastOptionRule(constrained, { provider: "openai", model: "gpt-5" }), false)
})

test("matching rules merge in declaration order and report their indexes", () => {
  const base = {
    nested: { base: true, shared: "base" },
    array: ["base"],
    scalar: "base",
    becomesNull: "base",
    nullBase: null,
  }
  const rules = [
    rule(
      { provider: "openai" },
      {
        nested: { first: true, shared: "first" },
        array: ["first"],
        scalar: "first",
        becomesNull: null,
        nullBase: { first: true },
      },
    ),
    rule(
      { model: "gpt-*" },
      {
        nested: { second: true, shared: "second" },
        array: ["second"],
        scalar: "second",
        nullBase: "second",
      },
    ),
    rule({ provider: "anthropic" }, { nested: { ignored: true }, scalar: "ignored" }),
  ]

  const result = mergeFastOptionRules(base, rules, { provider: "openai", model: "gpt-5" })

  assert.deepEqual(result, {
    options: {
      nested: { base: true, first: true, second: true, shared: "second" },
      array: ["second"],
      scalar: "second",
      becomesNull: null,
      nullBase: "second",
    },
    matchedRuleIndexes: [0, 1],
  })
})

test("mergeFastOptions merges nested objects and replaces arrays", () => {
  const merged = mergeFastOptions(
    { nested: { base: true, shared: "base" }, array: ["base"] },
    { nested: { override: true, shared: "override" }, array: ["override"] },
  )

  assert.deepEqual(merged, {
    nested: { base: true, override: true, shared: "override" },
    array: ["override"],
  })
})

test("merged options do not retain nested mutable references from inputs", () => {
  const base = {
    nested: { base: { value: "base" } },
    array: [{ value: "base" }],
  }
  const rules = [
    rule({ provider: "openai" }, {
      nested: { rule: { value: "rule" } },
      array: [{ value: "rule" }],
    }),
  ]
  const result = mergeFastOptionRules(base, rules, { provider: "openai", model: "gpt-5" })
  const nested = result.options.nested as { base: { value: string }; rule: { value: string } }
  const array = result.options.array as Array<{ value: string }>

  nested.base.value = "changed base"
  nested.rule.value = "changed rule"
  array[0]!.value = "changed array"

  assert.deepEqual(base, {
    nested: { base: { value: "base" } },
    array: [{ value: "base" }],
  })
  assert.deepEqual(rules[0], rule({ provider: "openai" }, {
    nested: { rule: { value: "rule" } },
    array: [{ value: "rule" }],
  }))
})

test("own __proto__ option keys remain data properties without prototype pollution", () => {
  const parsedOptions = JSON.parse('{"nested":{"__proto__":{"polluted":true}}}') as Record<string, unknown>
  const result = mergeFastOptionRules(
    { nested: { safe: true } },
    [rule({ provider: "openai" }, parsedOptions)],
    { provider: "openai", model: "gpt-5" },
  )
  const nested = result.options.nested as Record<string, unknown>

  assert.equal(Object.getPrototypeOf(nested), Object.prototype)
  assert.equal(Object.hasOwn(nested, "__proto__"), true)
  assert.deepEqual(nested["__proto__"], { polluted: true })
  assert.equal(nested.safe, true)
  assert.equal(({} as { polluted?: boolean }).polluted, undefined)
})

test("default fast options use exact SDK settings for every eligible GPT model", () => {
  const eligibleModels = [
    "gpt-4",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-5",
    "gpt-5.6-sol",
    "gpt-5.6-sol-2026-07-28",
    "gpt-42.3-2099-01-01",
  ]
  const sdkOptions = [
    ["@ai-sdk/openai", { serviceTier: "priority" }],
    ["@ai-sdk/openai-compatible", { service_tier: "priority" }],
  ] as const

  for (const [sdk, expected] of sdkOptions) {
    for (const model of eligibleModels) {
      assert.deepEqual(
        resolveDefaultFastOptions({ provider: "unrelated-provider", model, sdk }),
        expected,
        `${sdk} should match ${model}`,
      )
    }
  }
})

test("default fast options return fresh mutable objects and ignore the provider", () => {
  const sdkOptions = [
    ["@ai-sdk/openai", { serviceTier: "priority" }],
    ["@ai-sdk/openai-compatible", { service_tier: "priority" }],
  ] as const

  for (const [sdk, expected] of sdkOptions) {
    const first = resolveDefaultFastOptions({ provider: "first-provider", model: "gpt-5", sdk })
    const second = resolveDefaultFastOptions({ provider: "second-provider", model: "gpt-5", sdk })

    assert.notEqual(first, undefined)
    assert.notEqual(second, undefined)
    assert.notStrictEqual(first, second)
    first.mutated = true
    assert.deepEqual(second, expected)
  }
})

test("default fast options reject non-exact SDKs and ineligible models", () => {
  const invalidSdks = [
    undefined,
    "@ai-sdk/OpenAI",
    "@AI-SDK/OPENAI",
    "@ai-sdk/OpenAI-Compatible",
    "@ai-sdk/openai-compatiblex",
    "@ai-sdk/anthropic",
    "openai",
  ]
  for (const sdk of invalidSdks) {
    assert.equal(resolveDefaultFastOptions({ provider: "openai", model: "gpt-5", sdk }), undefined)
  }

  const excludedTokens = [
    "nano",
    "pro",
    "realtime",
    "audio",
    "transcribe",
    "image",
    "search",
    "tts",
    "vision",
    "codex",
  ]
  const rejectedModels = [
    "gpt-3.5-turbo",
    "claude-4",
    "ft:gpt-5:tenant:model",
    "GPT-5",
    ...excludedTokens.map((token) => `gpt-5-${token}`),
  ]
  for (const model of rejectedModels) {
    assert.equal(
      resolveDefaultFastOptions({ provider: "openai", model, sdk: "@ai-sdk/openai" }),
      undefined,
      `${model} should not receive default fast options`,
    )
  }
})
