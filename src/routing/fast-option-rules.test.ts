import assert from "node:assert/strict"
import { test } from "node:test"

import type { FastOptionRule } from "../config/schema.ts"
import { matchesFastOptionRule, mergeFastOptionRules } from "./fast-option-rules.ts"

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
