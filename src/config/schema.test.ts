import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  AgentEntrySchema,
  CanonicalModelEntrySchema,
  CanonicalModelEntryObjectSchema,
  CategoryEntrySchema,
  defaultConfig,
  FallbackEntrySchema,
  ModelRequirementSchema,
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

test("defaultConfig applies the complete bounded runtime fallback retry patterns", () => {
  assert.deepEqual(defaultConfig().runtimeFallback.retryOnPatterns, [
    "rate.?limit",
    "too.?many.?requests",
    "usage.?quota.{0,20}?(?:exceeded|exhausted|reached)",
    "quota.?exceeded",
    "(?:exceeded|exhausted|reached).{0,20}?quota",
    "free.?usage.{0,20}?(?:exceeded|exhausted|limit)",
    "usage.?exceeded",
    "(?:usage|quota)\\s+limit\\s+exhausted",
    "exhausted\\s+your\\s+capacity",
    "all\\s+credentials\\s+for\\s+model",
    "cool(?:ing)?\\s+down",
    "model.{0,20}?not.{0,10}?supported",
    "model_not_supported",
    "service.?unavailable",
    "temporarily.?unavailable",
    "overloaded",
    "internal server error",
    "gateway timeout",
    "bad gateway",
    "try\\s+again\\s+(?:later|shortly|in\\s+\\d+\\s*(?:seconds?|minutes?))",
    "\\b429\\b",
    "\\b503\\b",
    "\\b529\\b",
    "使用上限",
    "频率限制",
    "请求过于频繁",
    "暂时不可用",
    "服务不可用",
    "请稍后重试",
  ])
})

test("fast model policy applies root defaults", async () => {
  const mod = await import("./schema.ts")
  assert.equal(typeof mod.FastModelsConfigSchema?.parse, "function")
  assert.deepEqual(mod.FastModelsConfigSchema.parse({}), {
    defaultRules: false,
    providers: [],
    mappings: {},
    rules: [],
  })
  assert.deepEqual(defaultConfig().fastModels, {
    defaultRules: false,
    providers: [],
    mappings: {},
    rules: [],
  })
  assert.deepEqual(OcmmConfigSchema.parse({}).fastModels, {
    defaultRules: false,
    providers: [],
    mappings: {},
    rules: [],
  })
})

test("fast model policy validates root provider mappings and structured rules", () => {
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
      defaultRules: false,
      providers: ["openai"],
      mappings: {
        "openai/gpt-5.6-sol": "gpt-5.6-sol-fast",
        "openai/gpt-5.6-codex": "openai/gpt-5.6-codex-fast",
      },
      rules: [],
    },
  )

  assert.deepEqual(
    OcmmConfigSchema.parse({
      fastModels: {
        rules: [
          {
            match: {
              provider: "openai",
              model: "gpt-5.6.*",
              sdk: "openai-compatible",
            },
            options: {
              reasoning: { effort: "minimal", budget: 128 },
              fallback: ["gpt-5.6-mini", { retry: false }],
              temperature: 0.2,
              enabled: true,
              label: "fast",
              nullable: null,
            },
          },
        ],
      },
    }).fastModels.rules,
    [
      {
        match: {
          provider: "openai",
          model: "gpt-5.6.*",
          sdk: "openai-compatible",
        },
        options: {
          reasoning: { effort: "minimal", budget: 128 },
          fallback: ["gpt-5.6-mini", { retry: false }],
          temperature: 0.2,
          enabled: true,
          label: "fast",
          nullable: null,
        },
      },
    ],
  )

  for (const fastModels of [
    { defaultRules: 0 },
    { defaultRules: 1 },
    { defaultRules: "true" },
    { defaultRules: "false" },
    { defaultRules: null },
    { defaultRules: {} },
    { defaultRules: [] },
    { providers: [""] },
    { mappings: { openai: "openai/gpt-5.6-flash" } },
    { mappings: { "/gpt-5.6-sol": "openai/gpt-5.6-flash" } },
    { mappings: { "openai/gpt-5.6-sol": "" } },
    { mappings: { "openai/gpt-5.6-sol": "   " } },
    { providers: [], mappings: {}, extra: true },
    { rules: [{ match: {}, options: {} }] },
    { rules: [{ match: { provider: "" }, options: {} }] },
    { rules: [{ match: { model: "" }, options: {} }] },
    { rules: [{ match: { sdk: "" }, options: {} }] },
    { rules: [{ match: { provider: "openai", extra: true }, options: {} }] },
    { rules: [{ match: { provider: "openai" }, options: [] }] },
    { rules: [{ match: { provider: "openai" }, options: null }] },
    { rules: [{ match: { provider: "openai" }, options: "fast" }] },
    { rules: [{ match: { provider: "openai" }, options: {}, extra: true }] },
  ]) {
    assert.equal(OcmmConfigSchema.safeParse({ fastModels }).success, false, JSON.stringify(fastModels))
  }

  assert.equal(OcmmConfigSchema.parse({ fastModels: { defaultRules: true } }).fastModels.defaultRules, true)
  assert.equal(OcmmConfigSchema.parse({ fastModels: { defaultRules: false } }).fastModels.defaultRules, false)
})

test("fast model policy profile form is strict and partial without child defaults", () => {
  const parsed = OcmmConfigSchema.parse({
    profiles: {
      fast: {
        fastModels: {
          defaultRules: true,
          mappings: {
            "openai/gpt-5.6-sol": "openai/gpt-5.6-flash",
          },
          rules: [
            {
              match: { model: "gpt-5.6.*" },
              options: { reasoning: { effort: "minimal" } },
            },
          ],
        },
      },
      empty: {},
      emptyFastModels: { fastModels: {} },
    },
  })

  assert.deepEqual(parsed.profiles.fast?.fastModels, {
    defaultRules: true,
    mappings: {
      "openai/gpt-5.6-sol": "openai/gpt-5.6-flash",
    },
    rules: [
      {
        match: { model: "gpt-5.6.*" },
        options: { reasoning: { effort: "minimal" } },
      },
    ],
  })
  assert.equal("providers" in (parsed.profiles.fast?.fastModels ?? {}), false)
  assert.equal("fastModels" in (parsed.profiles.empty ?? {}), false)
  assert.deepEqual(parsed.profiles.emptyFastModels?.fastModels, {})
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

test("tolerantParse preserves a logical tier model when its union variant is invalid", () => {
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

test("canonical reasoning is accepted at every declared configuration boundary", () => {
  const reasoningInputs = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"] as const

  for (const reasoning of reasoningInputs) {
    assert.equal(AgentEntrySchema.parse({ reasoning }).reasoning, reasoning)
    assert.equal(CategoryEntrySchema.parse({ reasoning }).reasoning, reasoning)
    assert.equal(
      ModelRequirementSchema.parse({
        fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
        reasoning,
      }).reasoning,
      reasoning,
    )
    assert.equal(
      FallbackEntrySchema.parse({ providers: ["openai"], model: "gpt-5.6-sol", reasoning }).reasoning,
      reasoning,
    )
  }
})

test("canonical models accept mixed string and object entries on agents and categories", () => {
  const models = [
    "openai/gpt-5.6-sol",
    {
      model: "anthropic/claude-sonnet-4",
      reasoning: "none",
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 1024,
    },
  ]

  assert.deepEqual(AgentEntrySchema.parse({ models }).models, models)
  assert.deepEqual(CategoryEntrySchema.parse({ models }).models, models)
})

test("canonical model entries strip provider options and other unknown fields", () => {
  const parsed = CanonicalModelEntryObjectSchema.parse({
    model: "openai/gpt-5.6-sol",
    provider_options: { cache_control: "ephemeral" },
    ignored: true,
  })

  assert.deepEqual(parsed, { model: "openai/gpt-5.6-sol" })
  assert.equal("provider_options" in parsed, false)
  assert.equal("ignored" in parsed, false)
})

test("canonical model entries reject invalid arrays and field values", () => {
  for (const schema of [AgentEntrySchema, CategoryEntrySchema]) {
    assert.equal(schema.safeParse({ models: [] }).success, false)
  }

  for (const entry of [
    "",
    { model: "" },
    { model: "openai/gpt-5.6-sol", reasoning: "extreme" },
    { model: "openai/gpt-5.6-sol", temperature: -0.01 },
    { model: "openai/gpt-5.6-sol", temperature: 2.01 },
    { model: "openai/gpt-5.6-sol", top_p: -0.01 },
    { model: "openai/gpt-5.6-sol", top_p: 1.01 },
    { model: "openai/gpt-5.6-sol", max_tokens: 0 },
    { model: "openai/gpt-5.6-sol", max_tokens: -1 },
    { model: "openai/gpt-5.6-sol", max_tokens: 1.5 },
  ]) {
    assert.equal(CanonicalModelEntrySchema.safeParse(entry).success, false, JSON.stringify(entry))
  }
})

test("canonical model entries accept every canonical reasoning input", () => {
  const reasoningInputs = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"] as const

  for (const reasoning of reasoningInputs) {
    assert.equal(
      CanonicalModelEntryObjectSchema.parse({ model: "openai/gpt-5.6-sol", reasoning }).reasoning,
      reasoning,
    )
  }
})

test("generated JSON Schema preserves canonical model boundaries", () => {
  const asRecord = (value: unknown): Record<string, unknown> => {
    assert.ok(value !== null && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>
  }
  const expectedProperties = ["max_tokens", "model", "reasoning", "temperature", "top_p"]
  const expectedReasoning = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto", "none"]
  const schema = asRecord(JSON.parse(readFileSync(join(process.cwd(), "schema.json"), "utf8")))
  const properties = asRecord(schema.properties)

  for (const boundary of ["agents", "categories"]) {
    const entry = asRecord(asRecord(properties[boundary]).additionalProperties)
    const models = asRecord(asRecord(entry.properties).models)
    const branches = asRecord(models.items).oneOf ?? asRecord(models.items).anyOf
    assert.equal(models.type, "array", `${boundary}: models must be an array`)
    assert.ok(Array.isArray(branches), `${boundary}: models items must be a union`)
    assert.ok(branches.some((branch) => asRecord(branch).type === "string"), `${boundary}: missing string branch`)

    const objectBranch = branches.find((branch) => asRecord(branch).type === "object")
    assert.ok(objectBranch, `${boundary}: missing object branch`)
    const objectSchema = asRecord(objectBranch)
    const objectProperties = asRecord(objectSchema.properties)
    assert.deepEqual(Object.keys(objectProperties).sort(), expectedProperties, `${boundary}: canonical object property names`)
    assert.deepEqual(objectSchema.required, ["model"], `${boundary}: canonical object requires model`)
    assert.deepEqual(asRecord(objectProperties.reasoning).enum, expectedReasoning, `${boundary}: canonical reasoning enum`)
    assert.equal("provider_options" in objectProperties, false, `${boundary}: provider_options must be absent`)
  }
})

test("invalid canonical reasoning is pruned while valid siblings survive tolerant parsing", () => {
  const result = tolerantParse(AgentEntrySchema, {
    model: "openai/gpt-5.6-sol",
    reasoning: "extreme",
    variant: "high",
  })
  assert.equal(result.success, true)
  assert.deepEqual(result.success && result.data, {
    model: "openai/gpt-5.6-sol",
    variant: "high",
  })
})

test("logical tier variants accept canonical review and planning roles", () => {
  const parsed = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        variants: {
          high: "max",
        },
      },
      reviewer: { variants: { low: "low" } },
      planner: { variants: { low: { model: "openai/gpt-5.5", variant: "high" }, high: "max" } },
      "plan-critic": {
        variants: { low: { model: "openai/gpt-5.5", variant: "low" }, max: "max" },
      },
    },
  })
  assert.equal(parsed.agents?.planner?.variants?.high, "max")
  assert.deepEqual(parsed.agents?.["plan-critic"]?.variants?.low, {
    model: "openai/gpt-5.5",
    variant: "low",
  })
})

test("logical tier variants reject noncanonical and ineligible agent entries", () => {
  for (const agents of [
    { builder: { variants: { high: "max" } } },
    { "planner-low": { model: "openai/gpt-5.6-sol" } },
    { "planner-high": { model: "openai/gpt-5.6-sol" } },
    { "plan-critic-low": { model: "openai/gpt-5.5" } },
    { "planner-normal": { model: "openai/gpt-5.5" } },
    { "plan-critic-2nd": { model: "openai/gpt-5.5" } },
    { "planner-fast": { model: "openai/gpt-5.5" } },
    { planner: { variants: { normal: "high" } } },
    { "plan-critic": { variants: { low: {} } } },
    { planner: { variants: { high: { model: "x/y", extra: true } } } },
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

test("logical tier variant object requires model or variant in the generated JSON Schema", () => {
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
  assert.ok(Array.isArray(branches), "logical tier variant must be a JSON-Schema union")
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
    { "oracle-9th": { models: [] } },
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
    { "oracle-9th": { models: ["openai/gpt-5.6-sol"] } },
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
