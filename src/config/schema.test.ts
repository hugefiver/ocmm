import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  AgentEntrySchema,
  defaultConfig,
  OcmmConfigSchema,
  ReviewVariantOverrideSchema,
  ShimConfigSchema,
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

test("fast model policy applies root defaults", async () => {
  const mod = await import("./schema.ts")
  assert.equal(typeof mod.FastModelsConfigSchema?.parse, "function")
  assert.deepEqual(mod.FastModelsConfigSchema.parse({}), {
    providers: [],
    mappings: {},
  })
  assert.deepEqual(defaultConfig().fastModels, {
    providers: [],
    mappings: {},
  })
  assert.deepEqual(OcmmConfigSchema.parse({}).fastModels, {
    providers: [],
    mappings: {},
  })
})

test("fast model policy validates root provider mappings", () => {
  assert.deepEqual(
    OcmmConfigSchema.parse({
      fastModels: {
        providers: ["openai"],
        mappings: {
          "openai/gpt-5.6-sol": "gpt-5.6-sol-fast",
          "openai/gpt-5.6-codex": "openai/gpt-5.6-codex-fast",
        },
      },
    }).fastModels,
    {
      providers: ["openai"],
      mappings: {
        "openai/gpt-5.6-sol": "gpt-5.6-sol-fast",
        "openai/gpt-5.6-codex": "openai/gpt-5.6-codex-fast",
      },
    },
  )

  for (const fastModels of [
    { providers: [""] },
    { mappings: { openai: "openai/gpt-5.6-flash" } },
    { mappings: { "/gpt-5.6-sol": "openai/gpt-5.6-flash" } },
    { mappings: { "openai/gpt-5.6-sol": "" } },
    { mappings: { "openai/gpt-5.6-sol": "   " } },
    { providers: [], mappings: {}, extra: true },
  ]) {
    assert.equal(OcmmConfigSchema.safeParse({ fastModels }).success, false, JSON.stringify(fastModels))
  }
})

test("fast model policy profile form is strict and partial without child defaults", () => {
  const parsed = OcmmConfigSchema.parse({
    profiles: {
      fast: {
        fastModels: {
          mappings: {
            "openai/gpt-5.6-sol": "openai/gpt-5.6-flash",
          },
        },
      },
      empty: {},
    },
  })

  assert.deepEqual(parsed.profiles.fast?.fastModels, {
    mappings: {
      "openai/gpt-5.6-sol": "openai/gpt-5.6-flash",
    },
  })
  assert.equal("providers" in (parsed.profiles.fast?.fastModels ?? {}), false)
  assert.equal("fastModels" in (parsed.profiles.empty ?? {}), false)
  assert.deepEqual(parsed.profiles.fast?.disabledHooks, ["directory-readme-injector"])

  assert.equal(
    OcmmConfigSchema.safeParse({
      profiles: {
        bad: {
          fastModels: {
            providers: [],
            mappings: {},
            extra: true,
          },
        },
      },
    }).success,
    false,
  )

  assert.equal(
    OcmmConfigSchema.safeParse({
      profiles: {
        bad: {
          fastModels: {
            providers: [""],
          },
        },
      },
    }).success,
    false,
  )
})

test("shim config strips fast instead of treating it as a persistent default", () => {
  const parsed = ShimConfigSchema.parse({ fast: true } as Record<string, unknown>)
  assert.equal("fast" in parsed, false)
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

test("review variants fail closed in direct schema parsing", () => {
  for (const agents of [
    { planner: { model: "openai/gpt-5.6-sol", variants: { high: "max" } } },
    { oracle: { model: "openai/gpt-5.6-terra", variants: { high: {} } } },
    { oracle: { model: "openai/gpt-5.6-terra", variants: { normal: "high" } } },
    { oracle: { model: "openai/gpt-5.6-terra", variants: { high: { model: "x/y", extra: true } } } },
  ]) {
    assert.equal(OcmmConfigSchema.safeParse({ agents }).success, false, JSON.stringify(agents))
  }
})

test("direct schema rejects invalid ordinary agent fields while tolerant parsing preserves siblings", () => {
  const input = {
    agents: {
      orchestrator: {
        model: "openai/gpt-5.6-terra",
        temperature: 3,
      },
    },
  }
  assert.equal(OcmmConfigSchema.safeParse(input).success, false)

  const result = tolerantParse(OcmmConfigSchema, input)
  assert.equal(result.success, true)
  assert.equal(result.success && result.data.agents?.orchestrator?.model, "openai/gpt-5.6-terra")
  assert.equal(result.success && result.data.agents?.orchestrator?.temperature, undefined)
})

test("review variant object requires model or variant in the generated JSON Schema", () => {
  const asRecord = (value: unknown): Record<string, unknown> => {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>
  }
  const schema = asRecord(JSON.parse(readFileSync(join(process.cwd(), "schema.json"), "utf8")))
  const properties = asRecord(schema.properties)
  const agents = asRecord(properties.agents)
  const entry = asRecord(agents.additionalProperties)
  const variants = asRecord(asRecord(entry.properties).variants)
  const high = asRecord(asRecord(variants.properties).high)
  const branches = high.oneOf ?? high.anyOf
  assert.ok(Array.isArray(branches), "review variant must be a JSON-Schema union")
  const requiredSets = branches.map((branch) => asRecord(branch).required)
  assert.ok(requiredSets.some((required) => Array.isArray(required) && required.includes("model")))
  assert.ok(requiredSets.some((required) => Array.isArray(required) && required.includes("variant")))

  const objectBranches = branches.map(asRecord).filter((branch) => branch.type === "object")
  const matchesObjectBranch = (value: Record<string, unknown>, branch: Record<string, unknown>): boolean => {
    const branchProperties = asRecord(branch.properties)
    const required = Array.isArray(branch.required) ? branch.required : []
    if (!required.every((key) => typeof key === "string" && key in value)) return false
    if (branch.additionalProperties === false && Object.keys(value).some((key) => !(key in branchProperties))) return false
    return true
  }
  for (const [value, expected] of [
    [{ model: "openai/gpt-5.6-sol" }, 1],
    [{ variant: "max" }, 1],
    [{ model: "openai/gpt-5.6-sol", variant: "max" }, 1],
    [{}, 0],
  ] as const) {
    assert.equal(
      objectBranches.filter((branch) => matchesObjectBranch(value, branch)).length,
      expected,
      JSON.stringify(value),
    )
  }
})

test("direct schema rejects non-canonical reserved review keys", () => {
  for (const name of ["oracle-high", "oracle-2", "oracle-10th", "oracle-2nd-high", "reviewer-2nd", "reviewer-high", "oracle-second"]) {
    const result = OcmmConfigSchema.safeParse({ agents: { [name]: { model: "openai/gpt-5.6-sol" } } })
    assert.equal(result.success, false, `${name}: rejected`)
  }
  assert.equal(OcmmConfigSchema.safeParse({ agents: { "oracle-9th": { model: "openai/gpt-5.6-sol" } } }).success, true)
})

test("direct schema rejects later Oracle slots without a resolved normal requirement", () => {
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
    assert.equal(result.success, false, `rejected: ${JSON.stringify(agents)}`)
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

test("direct schema defers valid qualified aliases for later Oracle slots", () => {
  const result = OcmmConfigSchema.safeParse({
    agents: {
      "oracle-3rd": { alias: "precision:reviewer" },
    },
    profiles: {
      precision: {
        agents: {
          reviewer: { model: "openai/TARGET" },
        },
      },
    },
  })

  assert.equal(result.success, true)
})

test("direct schema treats colon aliases as opaque and defers them for later Oracle slots", () => {
  for (const alias of [
    ":reviewer",
    "precision:",
    "precision :reviewer",
    "precision!:reviewer",
    "precision/reviewer:target",
    "\tprecision:reviewer",
  ]) {
    const result = OcmmConfigSchema.safeParse({ agents: { source: { alias } } })
    assert.equal(result.success, true, alias)
    assert.equal(result.success && result.data.agents?.source?.alias, alias)
  }

  const laterOracle = OcmmConfigSchema.safeParse({
    agents: { "oracle-3rd": { alias: "precision:" } },
  })
  assert.equal(laterOracle.success, true)
  assert.equal(laterOracle.success && laterOracle.data.agents?.["oracle-3rd"]?.alias, "precision:")
})

test("direct schema rejects invalid review-agent entries in profiles", () => {
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
  assert.equal(result.success, false)
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
