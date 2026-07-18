import { test } from "node:test"
import assert from "node:assert/strict"

import {
  AgentEntrySchema,
  defaultConfig,
  OcmmConfigSchema,
  ReviewVariantOverrideSchema,
  SkillSourceEntrySchema,
  Subagent429ConfigSchema,
} from "./schema.ts"
import { tolerantParse } from "./tolerant-parse.ts"

test("Subagent429ConfigSchema applies defaults", () => {
  assert.deepEqual(Subagent429ConfigSchema.parse({}), {
    enabled: true,
    maxRetries: 5,
    providerScopes: {},
  })
})

test("defaultConfig applies subagent429 defaults", () => {
  assert.deepEqual(defaultConfig().runtimeFallback.subagent429, {
    enabled: true,
    maxRetries: 5,
    providerScopes: {},
  })
})

test("Subagent429ConfigSchema accepts zero retries and model/provider scopes", () => {
  assert.deepEqual(
    Subagent429ConfigSchema.parse({
      maxRetries: 0,
      providerScopes: {
        openai: "model",
        anthropic: "provider",
      },
    }),
    {
      enabled: true,
      maxRetries: 0,
      providerScopes: {
        openai: "model",
        anthropic: "provider",
      },
    },
  )
})

test("Subagent429ConfigSchema rejects invalid declared values", () => {
  for (const input of [
    { maxRetries: -1 },
    { maxRetries: 1.5 },
    { providerScopes: { openai: "account" } },
  ]) {
    assert.throws(() => Subagent429ConfigSchema.parse(input))
  }
})

test("runtime object schemas strip unknown leaf fields", () => {
  const parsed = Subagent429ConfigSchema.parse({
    maxRetries: 1,
    recoveryThresholdMinutes: 10,
  } as Record<string, unknown>)
  assert.deepEqual(parsed, {
    enabled: true,
    maxRetries: 1,
    providerScopes: {},
  })
  assert.ok(!("recoveryThresholdMinutes" in parsed))
})

test("tolerantParse preserves a skill source when an invalid union branch field can use a default", () => {
  const result = tolerantParse(SkillSourceEntrySchema, {
    path: "./kept",
    recursive: "bad",
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, {
    path: "./kept",
    recursive: true,
  })
})

test("tolerantParse preserves a review variant model when its union variant is invalid", () => {
  const result = tolerantParse(ReviewVariantOverrideSchema, {
    model: "override/model",
    variant: "bad",
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, { model: "override/model" })
})

test("tolerantParse preserves an agent fallback entry when its union object has an invalid field", () => {
  const result = tolerantParse(AgentEntrySchema, {
    fallbackModels: [{ providers: ["openai"], model: "gpt-5.6", temperature: "bad" }],
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data.fallbackModels, [{ providers: ["openai"], model: "gpt-5.6" }])
})

test("review variants accept native strings and non-empty objects", () => {
  const parsed = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        model: "openai/gpt-5.6-terra",
        variants: {
          low: "low",
          high: { variant: "max" },
          max: { model: "openai/gpt-5.6-sol", variant: "max" },
        },
      },
      reviewer: { model: "google/gemini-3.1-pro", variants: { high: "xhigh" } },
    },
  })
  assert.equal(parsed.agents?.oracle?.variants?.max && typeof parsed.agents.oracle.variants.max, "object")
})

test("review variants: invalid fields are dropped while canonical agents remain", () => {
  // variants on non-review agents (e.g. planner) is stripped, entry kept.
  const nonReviewResult = OcmmConfigSchema.safeParse({
    agents: { planner: { model: "openai/gpt-5.6-sol", variants: { high: "max" } } },
  })
  assert.equal(nonReviewResult.success, true, "planner entry kept, variants stripped")
  assert.equal(nonReviewResult.success && nonReviewResult.data.agents?.planner?.variants, undefined)

  // Invalid variant overrides (empty object, unsupported tier) lose only the
  // invalid field. Unknown keys are stripped by the runtime object schema.
  for (const { agents, expectedHigh } of [
    { agents: { oracle: { model: "openai/gpt-5.6-terra", variants: { high: {} } } }, expectedHigh: undefined },
    { agents: { oracle: { model: "openai/gpt-5.6-terra", variants: { normal: "high" } } }, expectedHigh: undefined },
    {
      agents: { oracle: { model: "openai/gpt-5.6-terra", variants: { high: { model: "x/y", extra: true } } } },
      expectedHigh: { model: "x/y" },
    },
  ]) {
    const result = OcmmConfigSchema.safeParse({ agents })
    assert.equal(result.success, true, `parse succeeds: ${JSON.stringify(agents)}`)
    assert.equal(result.success && result.data.agents?.oracle?.model, "openai/gpt-5.6-terra", `oracle kept: ${JSON.stringify(agents)}`)
    assert.deepEqual(result.success && result.data.agents?.oracle?.variants?.high, expectedHigh, `field recovered: ${JSON.stringify(agents)}`)
  }
})

test("invalid optional agent fields are dropped while the entry remains", () => {
  const result = OcmmConfigSchema.safeParse({
    agents: {
      orchestrator: {
        model: "openai/gpt-5.6-terra",
        temperature: 3,
      },
    },
  })
  assert.equal(result.success, true)
  assert.equal(result.success && result.data.agents?.orchestrator?.model, "openai/gpt-5.6-terra")
  assert.equal(result.success && result.data.agents?.orchestrator?.temperature, undefined)
})

test("reserved review namespace drops non-canonical config keys but parse succeeds", () => {
  for (const name of ["oracle-high", "oracle-2", "oracle-10th", "oracle-2nd-high", "reviewer-2nd", "reviewer-high", "oracle-second"]) {
    const result = OcmmConfigSchema.safeParse({ agents: { [name]: { model: "openai/gpt-5.6-sol" } } })
    assert.equal(result.success, true, `${name}: parse succeeds`)
    assert.equal(result.success && result.data.agents?.[name], undefined, `${name}: entry dropped`)
  }
  assert.equal(OcmmConfigSchema.safeParse({ agents: { "oracle-9th": { model: "openai/gpt-5.6-sol" } } }).success, true)
})

test("later Oracle slots without a resolved normal requirement are dropped (tolerant)", () => {
  const rejected = [
    { "oracle-3rd": { variants: { high: "max" } } },
    { "oracle-4th": { description: "metadata only" } },
    { "oracle-5th": { alias: "missing-model" } },
    { "oracle-7th": { model: "" } },
    { "oracle-8th": { fallbackModels: [] } },
    {
      "oracle-6th": { alias: "alias-a" },
      "alias-a": { alias: "alias-b" },
      "alias-b": { alias: "alias-a" },
    },
  ]
  for (const agents of rejected) {
    const result = OcmmConfigSchema.safeParse({ agents })
    assert.equal(result.success, true, `parse succeeds: ${JSON.stringify(agents)}`)
    // The later Oracle slot itself must be dropped.
    if (result.success && result.data.agents) {
      const laterSlots = Object.keys(agents).filter((name) => name.startsWith("oracle-"))
      for (const name of laterSlots) {
        assert.equal(result.data.agents[name], undefined, `${name} dropped: ${JSON.stringify(agents)}`)
      }
    }
  }

  for (const agents of [
    { "oracle-3rd": { model: "openai/gpt-5.6-sol" } },
    { "oracle-4th": { fallbackModels: ["openai/gpt-5.6-sol"] } },
    { "oracle-5th": { requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }] } } },
    {
      "oracle-6th": { alias: "review-model" },
      "review-model": { model: "openai/gpt-5.6-sol" },
    },
  ]) {
    assert.equal(OcmmConfigSchema.safeParse({ agents }).success, true, JSON.stringify(agents))
  }

  assert.equal(OcmmConfigSchema.safeParse({
    agents: { oracle: {}, "oracle-2nd": {}, reviewer: {} },
  }).success, true, "builtin review slots keep their default normal requirements")
})

test("regression: reviewer-high in a profile no longer fails the whole config", () => {
  // Reproduces the user-reported scenario: a profile carried a `reviewer-high`
  // agent key (a runtime tier name, not a valid config key). Before the
  // tolerant-schema hotfix, this made the entire OcmmConfigSchema parse fail
  // and loadConfig silently fell back to defaults (anthropic/claude-opus-4-7).
  // After the hotfix, the offending entry is dropped with a warning and the
  // rest of the config loads normally.
  const result = OcmmConfigSchema.safeParse({
    agents: { orchestrator: { model: "hoo/glm-5.2" } },
    profiles: {
      oa: {
        agents: {
          reviewer: { model: "hoo/glm-5.2", variant: "high" },
          "reviewer-high": { model: "apai/gpt-5.6-sol", variant: "max" },
        },
      },
    },
    activeProfile: "oa",
  })
  assert.equal(result.success, true, "config with reviewer-high in profile must parse")
  assert.equal(result.data.agents?.orchestrator?.model, "hoo/glm-5.2", "base agent kept")
  assert.equal(result.data.profiles?.oa?.agents?.reviewer?.model, "hoo/glm-5.2", "profile reviewer kept")
  assert.equal(result.data.profiles?.oa?.agents?.["reviewer-high"], undefined, "reviewer-high dropped from profile")
})

test("unknown top-level keys and unknown agent fields are stripped (tolerant)", () => {
  const result = OcmmConfigSchema.safeParse({
    // Unknown top-level key - should be stripped, not fail.
    futureField: { anything: true },
    // Unknown agent entry field - should be stripped, not fail.
    agents: {
      orchestrator: { model: "hoo/glm-5.2", mysteryOption: 42 } as Record<string, unknown>,
    },
  })
  assert.equal(result.success, true)
  assert.equal(result.data.agents?.orchestrator?.model, "hoo/glm-5.2")
  assert.ok(!("mysteryOption" in (result.data.agents?.orchestrator ?? {})), "unknown field stripped")
})

test("subagent-interruption-recovery is a valid default-enabled hook", () => {
  const defaults = defaultConfig()
  assert.equal(defaults.disabledHooks.includes("subagent-interruption-recovery"), false)
  const disabled = OcmmConfigSchema.parse({ disabledHooks: ["subagent-interruption-recovery"] })
  assert.deepEqual(disabled.disabledHooks, ["subagent-interruption-recovery"])
})
