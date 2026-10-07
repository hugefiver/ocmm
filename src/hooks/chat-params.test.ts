import { test } from "node:test"
import assert from "node:assert/strict"

import { createChatParamsHandler as createProductionChatParamsHandler } from "./chat-params.ts"
import { normalizeDirectRequirement } from "../config/normalize.ts"
import { defaultConfig, OcmmConfigSchema } from "../config/schema.ts"
import { clearResolutions, recentResolutions } from "../routing/ledger.ts"
import { createEffectiveRouteRegistry, type EffectiveRouteRegistry } from "../routing/route-registry.ts"
import type { EffectiveModelRoute } from "../shared/types.ts"

function createChatParamsHandler(
  args: Omit<Parameters<typeof createProductionChatParamsHandler>[0], "routeRegistry"> & {
    routeRegistry?: EffectiveRouteRegistry
  },
) {
  return createProductionChatParamsHandler({
    ...args,
    routeRegistry: args.routeRegistry ?? createEffectiveRouteRegistry(),
  })
}

function publishRoutes(registry: EffectiveRouteRegistry, routes: ReadonlyMap<string, EffectiveModelRoute>): void {
  const generation = registry.beginBuild()
  assert.equal(registry.publish(generation, routes), true)
}

function makeInput(overrides?: Partial<{
  sessionID: string
  agentName: string
  providerID: string
  modelID: string
  sdk: string
  variant: string
}>) {
  return {
    sessionID: overrides?.sessionID ?? "sess-1",
    agent: { name: overrides?.agentName ?? "reviewer" },
    model: {
      providerID: overrides?.providerID ?? "openai",
      modelID: overrides?.modelID ?? "gpt-5.5",
      ...(overrides?.sdk ? { api: { npm: overrides.sdk } } : {}),
    },
    provider: { id: overrides?.providerID ?? "openai" },
    message: overrides?.variant ? { variant: overrides.variant } : {},
  }
}

test("chat.params applies reviewer's xhigh floor on gpt-5.5", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput(), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const log = recentResolutions()
  assert.ok(log.length >= 1)
  const last = log[log.length - 1]!
  assert.equal(last.applied.variant, "xhigh")
})

test("chat.params uses raw config while its route registry has never published", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: { model: "openai/gpt-5.4-mini", variant: "low" },
    },
  })
  const handler = createChatParamsHandler({
    getConfig: () => cfg,
    routeRegistry: createEffectiveRouteRegistry(),
  })
  const output: Record<string, unknown> = { options: {} }

  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini" }), output)

  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "low")
  assert.equal(recentResolutions().at(-1)!.source, "user-config")
})

test("chat.params uses a published route rather than contradictory raw config", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini", variant: "high" }],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "off" },
  }]]))
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: { model: "openai/gpt-5.4-mini", variant: "low" },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg, routeRegistry: registry })
  const output: Record<string, unknown> = { options: {} }

  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini" }), output)

  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "high")
  assert.equal(recentResolutions().at(-1)!.source, "agent-default")
})

test("chat.params retains the last published route until a later config publication replaces it", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  const cfg = OcmmConfigSchema.parse({
    agents: { builder: { model: "openai/gpt-5.4-mini", variant: "low" } },
  })
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini-fast",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini-fast", variant: "high" }],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "model", modelID: "gpt-5.4-mini-fast" },
  }]]))
  const handler = createChatParamsHandler({ getConfig: () => cfg, routeRegistry: registry })

  const initial = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini-fast" }), initial)
  assert.equal(initial.options.reasoningEffort, "high")

  const unchanged = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini-fast" }), unchanged)
  assert.equal(unchanged.options.reasoningEffort, "high")

  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini-v2-fast",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini-v2-fast", variant: "low" }],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "model", modelID: "gpt-5.4-mini-v2-fast" },
  }]]))
  const replaced = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini-v2-fast" }), replaced)
  assert.equal(replaced.options.reasoningEffort, "low")
})

test("chat.params treats a published user requirement as explicit regardless of primary provenance", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.5",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", variant: "minimal" }],
    },
    requirementSource: "user-config",
    primarySource: "existing-model",
    fastPath: { kind: "off" },
  }]]))
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: { model: "openai/gpt-5.5", variant: "max" },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg, routeRegistry: registry })
  const output: Record<string, unknown> = { options: {} }

  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.5" }), output)

  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "minimal")
  assert.equal(recentResolutions().at(-1)!.source, "user-config")
})

test("chat.params treats a published missing route as authoritative absence", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map())
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: { model: "openai/gpt-5.5", variant: "high" },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg, routeRegistry: registry })
  const output: Record<string, unknown> = { options: {} }

  await handler(makeInput({ agentName: "builder" }), output)

  assert.equal((output.options as Record<string, unknown>).reasoningEffort, undefined)
  assert.equal(recentResolutions().at(-1)!.source, "no-op")
})

test("chat.params applies an unmanaged request-local variant after a published route miss", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map())
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })
  const output: Record<string, unknown> = { options: {} }

  await handler(makeInput({ agentName: "unmanaged", modelID: "gpt-5.4-mini", variant: "low" }), output)

  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "low")
  assert.equal(recentResolutions().at(-1)!.source, "input-variant")
})

test("chat.params matches published fast, original, and later fallback controls against input.model", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini-fast",
    requirement: {
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.4-mini-fast", reasoningEffort: "low" },
        { providers: ["openai"], model: "gpt-5.4-mini", reasoningEffort: "medium" },
        { providers: ["openai"], model: "gpt-5.4-mini-later", reasoningEffort: "high" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "existing-model",
    fastPath: { kind: "model", modelID: "gpt-5.4-mini-fast" },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  for (const [modelID, reasoningEffort] of [
    ["gpt-5.4-mini-fast", "low"],
    ["gpt-5.4-mini", "medium"],
    ["gpt-5.4-mini-later", "high"],
  ] as const) {
    const output: Record<string, unknown> = { options: {} }
    await handler(makeInput({ agentName: "builder", modelID }), output)
    assert.equal((output.options as Record<string, unknown>).reasoningEffort, reasoningEffort, modelID)
    assert.equal(recentResolutions().at(-1)!.source, "agent-default", modelID)
  }
})

test("chat.params merges matching published fast option rules using the runtime SDK identity", async () => {
  const registry = createEffectiveRouteRegistry()
  const baseOptions = {
    serviceTier: "standard",
    nested: { base: true, conflict: "base" },
    replaceArray: ["base"],
    baseOnly: { preserved: true },
  }
  const rules = [
    {
      match: { provider: "openai", model: "gpt-5.6", sdk: "@ai-sdk/openai" },
      options: {
        serviceTier: "flex",
        nested: { firstRule: true, conflict: "first" },
        replaceArray: ["first"],
        nullValue: null,
      },
    },
    {
      match: { provider: "openai", model: "gpt-*", sdk: "@ai-sdk/openai" },
      options: {
        serviceTier: "priority",
        nested: { secondRule: true, conflict: "second" },
        replaceArray: ["second"],
      },
    },
    {
      match: { provider: "anthropic", model: "claude-*", sdk: "@ai-sdk/anthropic" },
      options: { shouldNotApply: true },
    },
  ]
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6" }],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", defaultRules: false, rules },
  }]]))
  const output = { options: baseOptions }

  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "builder", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }),
    output,
  )

  assert.deepEqual(output.options, {
    serviceTier: "priority",
    nested: { base: true, conflict: "second", firstRule: true, secondRule: true },
    replaceArray: ["second"],
    baseOnly: { preserved: true },
    nullValue: null,
  })
  ;(output.options.nested as { base: boolean }).base = false
  output.options.replaceArray.push("mutated")
  assert.deepEqual(baseOptions, {
    serviceTier: "standard",
    nested: { base: true, conflict: "base" },
    replaceArray: ["base"],
    baseOnly: { preserved: true },
  })
  assert.deepEqual(rules[0]!.options, {
    serviceTier: "flex",
    nested: { firstRule: true, conflict: "first" },
    replaceArray: ["first"],
    nullValue: null,
  })
})

test("chat.params applies published fast option rules to the runtime fallback identity only", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6",
    requirement: {
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6" },
        { providers: ["anthropic"], model: "claude-4-6" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: {
      kind: "options",
      defaultRules: false,
      rules: [{
        match: { provider: "anthropic", model: "claude-*", sdk: "@ai-sdk/anthropic" },
        options: { appliedToFallback: true },
      }],
    },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const fallback = { options: {} as Record<string, unknown> }
  await handler(makeInput({
    agentName: "builder",
    providerID: "anthropic",
    modelID: "claude-4-6",
    sdk: "@ai-sdk/anthropic",
  }), fallback)
  assert.equal(fallback.options.appliedToFallback, true)

  const primary = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }), primary)
  assert.equal(primary.options.appliedToFallback, undefined)

  const noSdk = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", providerID: "anthropic", modelID: "claude-4-6" }), noSdk)
  assert.equal(noSdk.options.appliedToFallback, undefined)
})

test("chat.params applies default fast options from the runtime SDK identity", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6",
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6" }],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", defaultRules: true, rules: [] },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const official = { options: { serviceTier: "standard" } as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }), official)
  assert.equal(official.options.serviceTier, "priority")
  assert.equal(official.options.service_tier, undefined)

  const compatible = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6", sdk: "@ai-sdk/openai-compatible" }), compatible)
  assert.equal(compatible.options.service_tier, "priority")
  assert.equal(compatible.options.serviceTier, undefined)
})

test("chat.params applies user fast option rules after default fast options", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6",
    requirement: {
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6" },
        { providers: ["openai"], model: "gpt-5.7" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: {
      kind: "options",
      defaultRules: true,
      rules: [
        {
          match: { sdk: "@ai-sdk/openai" },
          options: { serviceTier: "flex", nested: { fromSdkRule: true, conflict: "sdk" } },
        },
        {
          match: { model: "gpt-5.6" },
          options: { serviceTier: "default", nested: { fromModelRule: true, conflict: "model" } },
        },
      ],
    },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const ordinaryOptions = { serviceTier: "standard", nested: { ordinary: true, conflict: "ordinary" } }
  const sdkMatch = { options: structuredClone(ordinaryOptions) as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.7", sdk: "@ai-sdk/openai" }), sdkMatch)
  assert.deepEqual(sdkMatch.options, {
    serviceTier: "flex",
    nested: { ordinary: true, conflict: "sdk", fromSdkRule: true },
  })

  const modelMatch = { options: structuredClone(ordinaryOptions) as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }), modelMatch)
  assert.deepEqual(modelMatch.options, {
    serviceTier: "default",
    nested: { ordinary: true, conflict: "model", fromSdkRule: true, fromModelRule: true },
  })
})

test("chat.params applies default fast options to eligible runtime fallbacks only", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6",
    requirement: {
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6" },
        { providers: ["openai"], model: "gpt-42.3-2099-01-01" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", defaultRules: true, rules: [] },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const compatibleFallback = { options: {} as Record<string, unknown> }
  await handler(makeInput({
    agentName: "builder",
    modelID: "gpt-42.3-2099-01-01",
    sdk: "@ai-sdk/openai-compatible",
  }), compatibleFallback)
  assert.equal(compatibleFallback.options.service_tier, "priority")
  assert.equal(compatibleFallback.options.serviceTier, undefined)

  for (const testCase of [
    { label: "excluded model", modelID: "gpt-5-codex", sdk: "@ai-sdk/openai" },
    { label: "missing SDK", modelID: "gpt-5.6" },
    { label: "Anthropic SDK", modelID: "gpt-5.6", sdk: "@ai-sdk/anthropic" },
  ]) {
    const unchanged = { options: { ordinary: testCase.label } as Record<string, unknown> }
    await handler(makeInput({ agentName: "builder", modelID: testCase.modelID, ...(testCase.sdk ? { sdk: testCase.sdk } : {}) }), unchanged)
    assert.deepEqual(unchanged.options, { ordinary: testCase.label }, testCase.label)
  }
})

test("chat.params never applies live fast option rules to off, model, or unmanaged snapshot routes", async () => {
  const cfg = OcmmConfigSchema.parse({
    fastModels: {
      defaultRules: true,
      rules: [{ match: { provider: "*" }, options: { fromLiveConfig: true } }],
    },
  })

  const offRegistry = createEffectiveRouteRegistry()
  publishRoutes(offRegistry, new Map([["off-route", {
    model: "openai/gpt-5.6",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6" }] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "off" },
  }]]))
  const offOutput = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => cfg, routeRegistry: offRegistry })(
    makeInput({ agentName: "off-route", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }),
    offOutput,
  )
  assert.equal(offOutput.options.fromLiveConfig, undefined)
  assert.equal(offOutput.options.serviceTier, undefined)

  const modelRegistry = createEffectiveRouteRegistry()
  publishRoutes(modelRegistry, new Map([["model-route", {
    model: "openai/gpt-5.6-fast",
    requirement: {
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6-fast" },
        { providers: ["openai"], model: "gpt-5.6" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "model", modelID: "gpt-5.6-fast" },
  }]]))
  const modelFallbackOutput = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => cfg, routeRegistry: modelRegistry })(
    makeInput({ agentName: "model-route", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }),
    modelFallbackOutput,
  )
  assert.equal(modelFallbackOutput.options.fromLiveConfig, undefined)
  assert.equal(modelFallbackOutput.options.serviceTier, undefined)

  const unmanagedRegistry = createEffectiveRouteRegistry()
  publishRoutes(unmanagedRegistry, new Map())
  const unmanagedOutput = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => cfg, routeRegistry: unmanagedRegistry })(
    makeInput({ agentName: "unmanaged", modelID: "gpt-5.6", sdk: "@ai-sdk/openai" }),
    unmanagedOutput,
  )
  assert.equal(unmanagedOutput.options.fromLiveConfig, undefined)
  assert.equal(unmanagedOutput.options.serviceTier, undefined)
})

test("chat.params restores review and plan-critic reasoning floors after fast options", async () => {
  const registry = createEffectiveRouteRegistry()
  const route = (): EffectiveModelRoute => ({
    model: "openai/gpt-5.5",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.5" }] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: {
      kind: "options",
      defaultRules: true,
      rules: [{
        match: { provider: "openai", model: "gpt-5.5" },
        options: { reasoningEffort: "low" },
      }],
    },
  })
  publishRoutes(registry, new Map([
    ["reviewer", route()],
    ["plan-critic", route()],
  ]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  for (const agentName of ["reviewer", "plan-critic"] as const) {
    const output = { options: {} as Record<string, unknown> }
    await handler(makeInput({ agentName, modelID: "gpt-5.5", sdk: "@ai-sdk/openai" }), output)
    assert.equal(output.options.serviceTier, "priority", `${agentName} service tier`)
    assert.equal(output.options.reasoningEffort, "xhigh", `${agentName} reasoning floor`)
  }
})

test("chat.params raises explicit reviewer input.variant on non-mini GPT", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ variant: "minimal" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
})

test("chat.params preserves below-high variants on GPT mini", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini", variant: "minimal" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "minimal")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "minimal")
})

test("chat.params on claude-opus 4.7+ emits no thinking block", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "orchestrator",
      providerID: "anthropic",
      modelID: "claude-opus-4-7",
    }),
    output,
  )
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.thinking, undefined)
  assert.equal(opts.reasoningEffort, undefined)
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "max")
})

test("chat.params applies explicit GLM and DeepSeek reasoning controls", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const glmOutput: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "coding", providerID: "zhipu", modelID: "glm-5.2", variant: "low" }), glmOutput)
  assert.deepEqual(glmOutput, { options: { reasoningEffort: "low", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "low")

  const deepseekOutput: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "coding", providerID: "hoo", modelID: "deepseek-v4-pro", variant: "medium" }), deepseekOutput)
  assert.deepEqual(deepseekOutput, { options: { reasoningEffort: "medium" } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "medium")
})

test("chat.params records max for category work at or above coding", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "coding", modelID: "claude-sonnet-4-6" }), output)
  const opts = output.options as Record<string, unknown>
  assert.ok(opts.thinking)
  assert.equal(recentResolutions().at(-1)!.applied.variant, "max")
})

test("chat.params raises user-config below-xhigh variants for GPT review and plan-review agents", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      "plan-critic": {
        requirement: {
          fallbackChain: [
            { providers: ["openai"], model: "gpt-5.5", variant: "medium" as const },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "plan-critic" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")
})

test("chat.params enforces review-agent GPT/Codex xhigh floors after every override", async () => {
  const cases = [
    { name: "absent", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "minimal", variant: "minimal", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "medium", variant: "medium", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "xhigh", variant: "xhigh", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "max", variant: "max", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "direct low", reasoningEffort: "low", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "direct max", reasoningEffort: "max", expectedVariant: "xhigh", expectedEffort: "xhigh" },
  ] as const

  for (const agentName of ["reviewer", "oracle", "plan-critic"] as const) {
    for (const family of ["gpt", "codex"] as const) {
      const modelID = family === "codex"
        ? agentName === "reviewer" ? "gpt-5.5-codex" : "gpt-5-codex"
        : agentName === "reviewer" ? "gpt-5.5" : "gpt-5"
      for (const testCase of cases) {
        clearResolutions()
        const entry = {
          providers: ["openai"],
          model: modelID,
          ...("reasoningEffort" in testCase
            ? { reasoningEffort: testCase.reasoningEffort }
            : {}),
        }
        const cfg = OcmmConfigSchema.parse({
          agents: {
            [agentName]: { requirement: { fallbackChain: [entry] } },
          },
        })
        const handler = createChatParamsHandler({ getConfig: () => cfg })
        const output: Record<string, unknown> = { options: {} }
        await handler(
          makeInput({
            agentName,
            modelID,
            ...("variant" in testCase ? { variant: testCase.variant } : {}),
          }),
          output,
        )

        const label = `${agentName} ${family} ${testCase.name}`
        assert.equal(
          (output.options as Record<string, unknown>).reasoningEffort,
          testCase.expectedEffort,
          `${label} final effort`,
        )
        assert.equal(
          recentResolutions().at(-1)!.applied.variant,
          testCase.expectedVariant,
          `${label} applied variant`,
        )
      }
    }
  }
})

test("chat.params preserves GPT-5.6 native max for review and plan-review agents", async () => {
  for (const agentName of ["reviewer", "oracle", "plan-critic"] as const) {
    clearResolutions()
    const cfg = OcmmConfigSchema.parse({
      agents: {
        [agentName]: {
          requirement: {
            fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol", variant: "max" }],
          },
        },
      },
    })
    const handler = createChatParamsHandler({ getConfig: () => cfg })
    const output: Record<string, unknown> = { options: {} }
    await handler(makeInput({ agentName, modelID: "gpt-5.6-sol" }), output)
    assert.equal((output.options as Record<string, unknown>).reasoningEffort, "max", `${agentName} final effort`)
    assert.equal(recentResolutions().at(-1)!.applied.variant, "max", `${agentName} applied variant`)
  }
})

test("chat.params preserves explicit GPT-5.6 direct max for review agents", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol", reasoningEffort: "max" }],
        },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer", modelID: "gpt-5.6-sol" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "max")
  assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, "max")
})

test("chat.params gates explicit GPT max to GPT-5.6-capable models", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", reasoningEffort: "max" }],
        },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.5" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, "xhigh")
})

test("chat.params applies review floors after explicit non-GPT high-effort controls", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [{ providers: ["google"], model: "gemini-3.1-pro", variant: "minimal", reasoningEffort: "low", thinking: { type: "disabled" } }],
        },
      },
      oracle: {
        requirement: {
          fallbackChain: [{ providers: ["anthropic"], model: "claude-opus-4-6", variant: "minimal", reasoningEffort: "low" }],
        },
        variants: {
          high: {
            model: "zhipu/glm-5.2",
            variant: "minimal",
          },
        },
      },
      "plan-critic": {
        requirement: {
          fallbackChain: [{ providers: ["hoo"], model: "deepseek-v4-pro", variant: "minimal", reasoningEffort: "low" }],
        },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })

  const reviewerOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "reviewer",
      providerID: "google",
      modelID: "gemini-3.1-pro",
      variant: "minimal",
    }),
    reviewerOutput,
  )
  assert.deepEqual(reviewerOutput, { options: { reasoningEffort: "high", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")

  const oracleOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "oracle",
      providerID: "anthropic",
      modelID: "claude-opus-4-6",
      variant: "minimal",
    }),
    oracleOutput,
  )
  assert.deepEqual((oracleOutput.options as Record<string, unknown>).thinking, {
    type: "enabled",
    budgetTokens: 16_384,
  })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")

  const oracleHighOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "oracle-high",
      providerID: "zhipu",
      modelID: "glm-5.2",
      variant: "minimal",
    }),
    oracleHighOutput,
  )
  assert.deepEqual(oracleHighOutput, { options: { reasoningEffort: "xhigh", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")

  const planCriticOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "plan-critic",
      providerID: "hoo",
      modelID: "deepseek-v4-pro",
      variant: "minimal",
    }),
    planCriticOutput,
  )
  assert.deepEqual(planCriticOutput, { options: { reasoningEffort: "xhigh" } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")
})

test("logical low review profiles retain the xhigh-equivalent safety floor", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      oracle: { model: "openai/gpt-5.6-terra", variants: { low: "low" as const } },
      "oracle-2nd": { model: "openai/gpt-5.6-sol", variants: { low: "minimal" as const } },
      reviewer: { model: "openai/gpt-5.6-sol", variants: { low: "low" as const } },
    },
  }
  for (const agentName of ["oracle-low", "oracle-2nd-low", "reviewer-low", "oracle-second"] as const) {
    const output = { options: {} as Record<string, unknown> }
    const modelID = agentName === "oracle-second" ? "gpt-5.6-sol" : agentName === "oracle-low" ? "gpt-5.6-terra" : "gpt-5.6-sol"
    await createChatParamsHandler({ getConfig: () => config })(makeInput({ agentName, modelID }), output)
    assert.equal(output.options.reasoningEffort, "xhigh", agentName)
  }
})

test("plan-critic floor remains independent of review-name parsing", async () => {
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => defaultConfig() })(makeInput({ agentName: "plan-critic", modelID: "gpt-5.5" }), output)
  assert.equal(output.options.reasoningEffort, "xhigh")
})

test("plan-critic logical low selects its cheaper route but retains the xhigh floor", async () => {
  const cfg = OcmmConfigSchema.parse({
    agents: {
      "plan-critic": {
        model: "openai/gpt-5.5",
        reasoningEffort: "low",
        variants: { low: { model: "openai/gpt-5.5", variant: "low" } },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })

  for (const variant of [undefined, "minimal", "low"] as const) {
    clearResolutions()
    const output = { options: { reasoningEffort: "low" } as Record<string, unknown> }
    await handler(makeInput({
      agentName: "plan-critic-low",
      modelID: "gpt-5.5",
      ...(variant ? { variant } : {}),
    }), output)

    assert.equal(output.options.reasoningEffort, "xhigh", String(variant))
    const resolution = recentResolutions().at(-1)!
    assert.equal(resolution.applied.variant, "xhigh", String(variant))
    assert.equal(resolution.applied.reasoningEffort, "xhigh", String(variant))
  }
})

test("plan-critic max keeps GPT-5.6 native max while planner tiers are not floored", async () => {
  const cfg = OcmmConfigSchema.parse({
    agents: {
      planner: { variants: { low: { model: "openai/gpt-5.5", variant: "low" } } },
      "plan-critic": { variants: { max: { model: "openai/gpt-5.6-sol", variant: "max" } } },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })

  const planner = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "planner-low", modelID: "gpt-5.5" }), planner)
  assert.equal(planner.options.reasoningEffort, "low")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "low")

  const critic = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "plan-critic-max", modelID: "gpt-5.6-sol" }), critic)
  assert.equal(critic.options.reasoningEffort, "max")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "max")
})

test("plan-critic max caps unsupported GPT max to xhigh", async () => {
  const cfg = OcmmConfigSchema.parse({
    agents: {
      "plan-critic": { variants: { max: { model: "openai/gpt-5.5", variant: "max" } } },
    },
  })
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => cfg })(
    makeInput({ agentName: "plan-critic-max", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal(output.options.reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")
})

test("host-provided planning suffixes floor only plan critics without inventing a route", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map())
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const critic = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "plan-critic-low", modelID: "gpt-5.5" }), critic)
  assert.equal(critic.options.reasoningEffort, "xhigh")
  const criticResolution = recentResolutions().at(-1)!
  assert.equal(criticResolution.source, "host-profile-floor")
  assert.equal(criticResolution.applied.variant, "xhigh")
  assert.equal(criticResolution.input.modelID, "gpt-5.5")

  const criticMax = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "plan-critic-max", modelID: "gpt-5.6-sol" }), criticMax)
  assert.equal(criticMax.options.reasoningEffort, "max")
  const criticMaxResolution = recentResolutions().at(-1)!
  assert.equal(criticMaxResolution.source, "host-profile-floor")
  assert.equal(criticMaxResolution.applied.variant, "max")

  const planner = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "planner-low", modelID: "gpt-5.5", variant: "low" }), planner)
  assert.equal(planner.options.reasoningEffort, "low")
  assert.equal(recentResolutions().at(-1)!.source, "input-variant")
})

test("plan-critic logical low receives the canonical family-specific review floors", async () => {
  const cases = [
    {
      label: "Gemini",
      providerID: "google",
      modelID: "gemini-3.1-pro",
      expected: { options: { reasoningEffort: "high", thinking: { type: "enabled" } } },
    },
    {
      label: "GLM",
      providerID: "zhipu",
      modelID: "glm-5.2",
      expected: { options: { reasoningEffort: "xhigh", thinking: { type: "enabled" } } },
    },
    {
      label: "Claude",
      providerID: "anthropic",
      modelID: "claude-opus-4-6",
      expected: { options: { thinking: { type: "enabled", budgetTokens: 16_384 } } },
    },
    {
      label: "DeepSeek",
      providerID: "hoo",
      modelID: "deepseek-v4-pro",
      expected: { options: { reasoningEffort: "xhigh" } },
    },
  ] as const

  for (const testCase of cases) {
    const cfg = OcmmConfigSchema.parse({
      agents: {
        "plan-critic": {
          model: `${testCase.providerID}/${testCase.modelID}`,
          variant: "minimal",
          variants: { low: "low" },
        },
      },
    })
    const handler = createChatParamsHandler({ getConfig: () => cfg })
    const canonical: Record<string, unknown> = { options: {} }
    await handler(makeInput({
      agentName: "plan-critic",
      providerID: testCase.providerID,
      modelID: testCase.modelID,
    }), canonical)
    assert.deepEqual(canonical, testCase.expected, `${testCase.label} canonical`)

    const logicalLow: Record<string, unknown> = { options: {} }
    await handler(makeInput({
      agentName: "plan-critic-low",
      providerID: testCase.providerID,
      modelID: testCase.modelID,
    }), logicalLow)
    assert.deepEqual(logicalLow, canonical, `${testCase.label} logical low`)
  }
})

test("generated non-GPT review tiers receive family-specific floors", async () => {
  const config = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        model: "anthropic/claude-opus-4-6",
        variant: "minimal",
        variants: { high: { model: "google/gemini-3.1-pro", variant: "minimal" } },
      },
      reviewer: {
        model: "google/gemini-3.1-pro",
        variants: { low: { model: "zhipu/glm-5.2", variant: "minimal" } },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => config })
  const gemini: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "oracle-high", providerID: "google", modelID: "gemini-3.1-pro" }), gemini)
  assert.deepEqual(gemini, { options: { reasoningEffort: "high", thinking: { type: "enabled" } } })

  const glm: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer-low", providerID: "zhipu", modelID: "glm-5.2" }), glm)
  assert.deepEqual(glm, { options: { reasoningEffort: "xhigh", thinking: { type: "enabled" } } })
})

test("chat.params floors review-agent explicit thinking on Opus 4.7+", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [
            {
              providers: ["anthropic"],
              model: "claude-opus-4-7",
              variant: "max" as const,
              reasoningEffort: "low",
              thinking: { type: "enabled" as const, budgetTokens: 1234 },
            },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ providerID: "anthropic", modelID: "claude-opus-4-7" }), output)
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.reasoningEffort, undefined)
  assert.deepEqual(opts.thinking, { type: "enabled", budgetTokens: 24_576 })
  const last = recentResolutions().at(-1)!
  assert.equal(last.source, "user-config")
  assert.equal(last.applied.variant, "max")
})

test("chat.params removes direct review-agent reasoningEffort on Opus 4.7+", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [
            {
              providers: ["anthropic"],
              model: "claude-opus-4-7",
              reasoningEffort: "max",
            },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer", providerID: "anthropic", modelID: "claude-opus-4-7" }), output)
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.reasoningEffort, undefined)
  assert.deepEqual(opts.thinking, { type: "enabled", budgetTokens: 24_576 })
  assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, undefined)
})

test("chat.params preserves explicit non-review thinking on Opus 4.7+", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      builder: {
        requirement: {
          fallbackChain: [
            {
              providers: ["anthropic"],
              model: "claude-opus-4-7",
              variant: "max" as const,
              reasoningEffort: "low",
              thinking: { type: "enabled" as const, budgetTokens: 1234 },
            },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder", providerID: "anthropic", modelID: "claude-opus-4-7" }), output)
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.reasoningEffort, "low")
  assert.deepEqual(opts.thinking, { type: "enabled", budgetTokens: 1234 })
  const last = recentResolutions().at(-1)!
  assert.equal(last.source, "user-config")
  assert.equal(last.applied.variant, "max")
})

test("chat.params clamps built-in default below-high variants on non-mini GPT", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "high")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "high")
})

test("chat.params is a no-op for unknown agent + no variant", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "xyz", providerID: "openai", modelID: "foo" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, undefined)
  const log = recentResolutions()
  const last = log[log.length - 1]!
  assert.equal(last.source, "no-op")
})

test("chat.params tolerates malformed input without throwing", async () => {
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  await handler(null, { options: {} })
  await handler({}, { options: {} })
  await handler({ sessionID: "x" }, { options: {} })
})

test("chat.params records sessionID → agentName in sessionAgentMap", async () => {
  clearResolutions()
  const sessionAgentMap = new Map<string, string>()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg, sessionAgentMap })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ sessionID: "ses_test_agent_map", agentName: "coding" }), output)
  assert.equal(sessionAgentMap.get("ses_test_agent_map"), "coding")
})

test("chat.params applies the review floor to a host-provided reviewer-high profile absent from expandedReviewAgentMap (GPT)", async () => {
  clearResolutions()
  // No user config for reviewer.variants.high, so expandedReviewAgentMap has
  // no "reviewer-high" entry and resolveModelRouting returns null. The host
  // still routed a real reviewer-high chat, so the floor must apply.
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "xhigh")
  assert.equal(last.input.providerID, "openai")
  assert.equal(last.input.modelID, "gpt-5.5")
  assert.equal(last.agent, "reviewer-high")
})

test("chat.params applies the review floor to a host-provided reviewer-high profile absent from expandedReviewAgentMap (GLM)", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", providerID: "zhipu", modelID: "glm-5.2" }),
    output,
  )
  const opts = output.options as Record<string, unknown>
  // GLM translates non-explicit xhigh to its native max level (model-native
  // behavior preserved); the logical floor variant remains xhigh.
  assert.equal(opts.reasoningEffort, "max")
  assert.deepEqual(opts.thinking, { type: "enabled" })
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "max")
  assert.equal(last.input.providerID, "zhipu")
  assert.equal(last.input.modelID, "glm-5.2")
})

test("chat.params applies the review floor to a host-provided oracle-high profile absent from expandedReviewAgentMap", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "oracle-high", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "xhigh")
  assert.equal(last.agent, "oracle-high")
})

test("chat.params keeps host logical high at xhigh and preserves native max only for logical max", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const highOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", modelID: "gpt-5.6-sol" }),
    highOutput,
  )
  assert.equal((highOutput.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "xhigh")

  const maxOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-max", modelID: "gpt-5.6-sol" }),
    maxOutput,
  )
  assert.equal((maxOutput.options as Record<string, unknown>).reasoningEffort, "max")
  const maxResolution = recentResolutions().at(-1)!
  assert.equal(maxResolution.applied.variant, "max")
  assert.equal(maxResolution.applied.reasoningEffort, "max")
})

test("chat.params host-profile floor does not route through an unrelated configured model", async () => {
  clearResolutions()
  // The user configured an unrelated model for `coding`. The floor must be
  // enforced against the actual runtime provider/model (openai/gpt-5.5), not
  // the configured coding model (zhipu/glm-5.2).
  const cfg = OcmmConfigSchema.parse({
    agents: {
      coding: { model: "zhipu/glm-5.2" },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", providerID: "openai", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.input.providerID, "openai")
  assert.equal(last.input.modelID, "gpt-5.5")
  assert.equal((output.options as Record<string, unknown>).thinking, undefined)
})

test("chat.params host-profile floor preserves ordinary unknown-agent no-op", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "totally-unknown-agent", providerID: "openai", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, undefined)
  const last = recentResolutions().at(-1)!
  assert.equal(last.source, "no-op")
  assert.deepEqual(last.applied, {})
})

test("chat.params keeps canonical off and auto distinct from legacy none and auto on GPT mini", async () => {
  const cases = [
    {
      label: "canonical off",
      requirement: { reasoning: "off" as const },
      expectedOutput: { reasoningEffort: "none" },
      expectedApplied: { reasoning: "off", reasoningEffort: "none" },
    },
    {
      label: "canonical auto",
      requirement: { reasoning: "auto" as const },
      expectedOutput: {},
      expectedApplied: { reasoning: "auto" },
    },
    {
      label: "legacy none",
      requirement: { variant: "none" as const },
      expectedOutput: {},
      expectedApplied: { variant: "none" },
    },
    {
      label: "legacy auto",
      requirement: { variant: "auto" as const },
      expectedOutput: { reasoningEffort: "medium" },
      expectedApplied: { variant: "auto", reasoningEffort: "medium" },
    },
  ] as const

  for (const testCase of cases) {
    clearResolutions()
    const registry = createEffectiveRouteRegistry()
    publishRoutes(registry, new Map([["builder", {
      model: "openai/gpt-5.4-mini",
      requirement: {
        fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini" }],
        ...testCase.requirement,
      },
      requirementSource: "user-config",
      primarySource: "user-requirement",
      fastPath: { kind: "off" },
    }]]))
    const output = { options: {} as Record<string, unknown> }

    await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
      makeInput({ agentName: "builder", modelID: "gpt-5.4-mini" }),
      output,
    )

    assert.deepEqual(output.options, testCase.expectedOutput, testCase.label)
    assert.deepEqual(recentResolutions().at(-1)!.applied, testCase.expectedApplied, testCase.label)
  }
})

test("chat.params lets a request-local variant suppress configured canonical reasoning", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini",
    requirement: {
      reasoning: "off",
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini" }],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const output = { options: {} as Record<string, unknown> }

  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "builder", modelID: "gpt-5.4-mini", variant: "low" }),
    output,
  )

  assert.deepEqual(output.options, { reasoningEffort: "low" })
  assert.deepEqual(recentResolutions().at(-1)!.applied, { variant: "low", reasoningEffort: "low" })
})

test("chat.params lowers published canonical reasoning through each actual fallback family", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini",
    requirement: {
      reasoning: "high",
      fallbackChain: [
        { providers: ["openai"], model: "gpt-5.4-mini" },
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["google"], model: "gemini-3.1-pro" },
      ],
    },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "off" },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  for (const testCase of [
    {
      providerID: "openai",
      modelID: "gpt-5.4-mini",
      expectedOptions: { reasoningEffort: "high" },
    },
    {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
      expectedOptions: { thinking: { type: "enabled", budgetTokens: 12_288 } },
    },
    {
      providerID: "google",
      modelID: "gemini-3.1-pro",
      expectedOptions: { reasoningEffort: "high", thinking: { type: "enabled" } },
    },
  ] as const) {
    const output = { options: {} as Record<string, unknown> }
    await handler(makeInput({ agentName: "builder", ...testCase }), output)
    assert.deepEqual(output.options, testCase.expectedOptions, testCase.modelID)
    assert.deepEqual(recentResolutions().at(-1)!.applied, {
      reasoning: "high",
      ...testCase.expectedOptions,
    }, testCase.modelID)
  }
})

test("chat.params applies concrete controls after canonical reasoning", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini",
    requirement: {
      fallbackChain: [{
        providers: ["openai"],
        model: "gpt-5.4-mini",
        reasoning: "high",
        reasoningEffort: "low",
        thinking: { type: "disabled" },
        temperature: 0.2,
        topP: 0.8,
        maxTokens: 4096,
      }],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const output = { options: {} as Record<string, unknown> }

  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "builder", modelID: "gpt-5.4-mini" }),
    output,
  )

  assert.deepEqual(output, {
    options: { reasoningEffort: "low", thinking: { type: "disabled" } },
    topP: 0.8,
    maxOutputTokens: 4096,
  })
  assert.deepEqual(recentResolutions().at(-1)!.applied, {
    reasoning: "high",
    reasoningEffort: "low",
    thinking: { type: "disabled" },
    topP: 0.8,
    maxOutputTokens: 4096,
  })
})

test("chat.params lowers canonical models entry controls for each actual family", async () => {
  clearResolutions()
  const requirement = normalizeDirectRequirement({
    models: [
      {
        model: "openai/gpt-5.4-mini:high",
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 4_096,
      },
      {
        model: "anthropic/claude-sonnet-4-6:low",
        temperature: 0.4,
        top_p: 0.6,
        max_tokens: 2_048,
      },
    ],
  })!
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.4-mini",
    requirement,
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const gpt = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", providerID: "openai", modelID: "gpt-5.4-mini" }), gpt)
  assert.deepEqual(gpt, {
    options: { reasoningEffort: "high" },
    topP: 0.8,
    maxOutputTokens: 4_096,
  })

  const claude = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", providerID: "anthropic", modelID: "claude-sonnet-4-6" }), claude)
  assert.deepEqual(claude, {
    options: { thinking: { type: "enabled", budgetTokens: 2_048 } },
    temperature: 0.4,
    topP: 0.6,
    maxOutputTokens: 2_048,
  })
})

test("chat.params restores the canonical review floor after concrete and fast overrides", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["reviewer", {
    model: "openai/gpt-5.5",
    requirement: {
      fallbackChain: [{
        providers: ["openai"],
        model: "gpt-5.5",
        reasoning: "off",
        reasoningEffort: "low",
      }],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: {
      kind: "options",
      defaultRules: false,
      rules: [{
        match: { provider: "openai", model: "gpt-5.5" },
        options: { reasoningEffort: "minimal" },
      }],
    },
  }]]))
  const output = { options: {} as Record<string, unknown> }

  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "reviewer", modelID: "gpt-5.5" }),
    output,
  )

  assert.deepEqual(output.options, { reasoningEffort: "xhigh" })
  assert.deepEqual(recentResolutions().at(-1)!.applied, {
    reasoning: "xhigh",
    reasoningEffort: "xhigh",
  })
})

test("chat.params applies canonical minimums and GPT native-max caps by route source", async () => {
  const cases = [
    { label: "builtin GPT-5.5 low", source: "agent-default" as const, modelID: "gpt-5.5", reasoning: "low" as const, expected: "high" },
    { label: "user GPT-5.5 low", source: "user-config" as const, modelID: "gpt-5.5", reasoning: "low" as const, expected: "low" },
    { label: "user GPT-5.5 max", source: "user-config" as const, modelID: "gpt-5.5", reasoning: "max" as const, expected: "xhigh" },
    { label: "user GPT-5.6 max", source: "user-config" as const, modelID: "gpt-5.6-sol", reasoning: "max" as const, expected: "max" },
  ] as const

  for (const testCase of cases) {
    clearResolutions()
    const registry = createEffectiveRouteRegistry()
    publishRoutes(registry, new Map([["builder", {
      model: `openai/${testCase.modelID}`,
      requirement: {
        reasoning: testCase.reasoning,
        fallbackChain: [{ providers: ["openai"], model: testCase.modelID }],
      },
      requirementSource: testCase.source,
      primarySource: testCase.source === "user-config" ? "user-requirement" : "builtin-requirement",
      fastPath: { kind: "off" },
    }]]))
    const output = { options: {} as Record<string, unknown> }

    await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
      makeInput({ agentName: "builder", modelID: testCase.modelID }),
      output,
    )

    assert.deepEqual(output.options, { reasoningEffort: testCase.expected }, testCase.label)
    assert.deepEqual(recentResolutions().at(-1)!.applied, {
      reasoning: testCase.expected,
      reasoningEffort: testCase.expected,
    }, testCase.label)
  }
})

test("chat.params resolves GPT-6 effort from canonical, legacy, request-local, direct, and fast inputs", async () => {
  const cases = [
    { label: "builtin Sol off", modelID: "gpt-6-sol", reasoning: "off", expected: "none" },
    { label: "builtin Luna off through codex", providerID: "openai-codex", modelID: "gpt-6-luna", reasoning: "off", expected: "none" },
    { label: "builtin Astra off", modelID: "gpt-6-astra", reasoning: "off", expected: "low" },
    { label: "user prefixed Sol-fast off", modelID: "openai/gpt-6-sol-fast", source: "user-config", reasoning: "off", expected: "none" },
    { label: "user Astra off through codex", providerID: "openai-codex", modelID: "gpt-6-astra-fast", source: "user-config", reasoning: "off", expected: "low" },
    { label: "builtin Sol canonical minimal", modelID: "gpt-6-sol", reasoning: "minimal", expected: "low" },
    { label: "builtin Luna canonical minimal through codex", providerID: "openai-codex", modelID: "gpt-6-luna", reasoning: "minimal", expected: "low" },
    { label: "user Luna canonical minimal", modelID: "gpt-6-luna", source: "user-config", reasoning: "minimal", expected: "low" },
    { label: "builtin Luna legacy minimal", modelID: "gpt-6-luna", variant: "minimal", expected: "low" },
    { label: "builtin Sol legacy minimal through codex", providerID: "openai-codex", modelID: "gpt-6-sol", variant: "minimal", expected: "low" },
    { label: "builtin Astra legacy minimal through codex", providerID: "openai-codex", modelID: "gpt-6-astra", variant: "minimal", expected: "low" },
    { label: "builtin Astra legacy minimal", modelID: "gpt-6-astra", variant: "minimal", expected: "low" },
    { label: "request-local Sol minimal", modelID: "gpt-6-sol-fast", variant: "high", requestVariant: "minimal", expected: "low" },
    { label: "request-local Astra minimal through codex", providerID: "openai-codex", modelID: "gpt-6-astra", requestVariant: "minimal", expected: "low" },
    { label: "builtin Sol direct none", modelID: "gpt-6-sol", direct: "none", expected: "none" },
    { label: "builtin Astra direct none", modelID: "gpt-6-astra", direct: "none", expected: "low" },
    { label: "builtin Luna direct minimal", modelID: "gpt-6-luna", direct: "minimal", expected: "low" },
    { label: "user Astra direct minimal", modelID: "gpt-6-astra", source: "user-config", direct: "minimal", expected: "low" },
    { label: "fast Sol none overrides high", modelID: "gpt-6-sol", variant: "high", fast: "none", expected: "none" },
    { label: "fast Luna minimal overrides high through codex", providerID: "openai-codex", modelID: "gpt-6-luna-fast", variant: "high", fast: "minimal", expected: "low" },
    { label: "fast Astra none overrides high", modelID: "gpt-6-astra-fast", variant: "high", fast: "none", expected: "low" },
    { label: "builtin Sol raw low stays high", modelID: "gpt-6-sol", variant: "low", expected: "high" },
    { label: "builtin Luna raw medium through codex stays high", providerID: "openai-codex", modelID: "gpt-6-luna", variant: "medium", expected: "high" },
    { label: "builtin Astra raw low stays high", modelID: "gpt-6-astra", variant: "low", expected: "high" },
    { label: "builtin Sol raw medium stays high", modelID: "gpt-6-sol", variant: "medium", expected: "high" },
    { label: "builtin Luna raw low stays high", modelID: "gpt-6-luna", variant: "low", expected: "high" },
    { label: "builtin Astra raw medium stays high", modelID: "gpt-6-astra", variant: "medium", expected: "high" },
    { label: "older GPT builtin low", modelID: "gpt-5.5", variant: "low", expected: "high" },
    { label: "older GPT builtin high", modelID: "gpt-5.5", variant: "high", expected: "high" },
    { label: "older GPT explicit low", modelID: "gpt-5.5", source: "user-config", variant: "low", expected: "low" },
    { label: "Sol builtin legacy none keeps old below-high policy", modelID: "gpt-6-sol", variant: "none", expected: "high" },
    { label: "Sol explicit legacy none stays no-op", modelID: "gpt-6-sol", source: "user-config", variant: "none" },
    { label: "Astra explicit legacy none stays no-op", modelID: "gpt-6-astra", source: "user-config", variant: "none" },
    { label: "Luna canonical auto stays no-op", modelID: "gpt-6-luna", reasoning: "auto" },
    { label: "lunar off remains old builtin policy", modelID: "gpt-6-lunar", reasoning: "off", expected: "high" },
    { label: "solar minimal remains old builtin policy", modelID: "gpt-6-solar", variant: "minimal", expected: "high" },
    { label: "astral fast none is unchanged", modelID: "gpt-6-astral", variant: "high", fast: "none", expected: "none" },
  ] as const

  for (const c of cases) {
    clearResolutions()
    const providerID = "providerID" in c ? c.providerID : "openai"
    const registry = createEffectiveRouteRegistry()
    publishRoutes(registry, new Map([["builder", {
      model: `${providerID}/${c.modelID}`,
      requirement: {
        fallbackChain: [{ providers: [providerID], model: c.modelID, ...("direct" in c ? { reasoningEffort: c.direct } : {}) }],
        ...("reasoning" in c ? { reasoning: c.reasoning } : {}),
        ...("variant" in c ? { variant: c.variant } : {}),
      },
      requirementSource: "source" in c ? c.source : "agent-default",
      primarySource: "source" in c ? "user-requirement" : "builtin-requirement",
      fastPath: "fast" in c
        ? { kind: "options", defaultRules: false, rules: [{ match: { provider: providerID, model: c.modelID }, options: { reasoningEffort: c.fast } }] }
        : { kind: "off" },
    }]]))
    const output = { options: {} as Record<string, unknown> }
    await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
      makeInput({ agentName: "builder", providerID, modelID: c.modelID, ...("requestVariant" in c ? { variant: c.requestVariant } : {}) }),
      output,
    )
    assert.equal(output.options.reasoningEffort, "expected" in c ? c.expected : undefined, c.label)
    assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, output.options.reasoningEffort, c.label)
  }
})

test("chat.params constrains a published fast route even if its empty requirement has no resolution", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-6-astra-fast",
    requirement: { fallbackChain: [] },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: {
      kind: "options", defaultRules: false,
      rules: [{ match: { provider: "openai", model: "gpt-6-astra-fast" }, options: { reasoningEffort: "none" } }],
    },
  }]]))
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "builder", modelID: "gpt-6-astra-fast" }), output,
  )
  assert.equal(output.options.reasoningEffort, "low")
  assert.equal(recentResolutions().at(-1)!.source, "no-op")

  const unmanaged = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "unmanaged", modelID: "gpt-6-astra-fast" }), unmanaged,
  )
  assert.deepEqual(unmanaged.options, {})
  assert.equal(recentResolutions().at(-1)!.source, "no-op")
})

test("chat.params keeps GPT-6 reviewer and plan-critic floors over none/minimal and legal max", async () => {
  for (const [agentName, modelID, inputEffort, expected] of [
    ["reviewer", "gpt-6-sol", "none", "xhigh"],
    ["plan-critic", "gpt-6-astra", "minimal", "xhigh"],
    ["reviewer", "gpt-6-luna", "max", "max"],
    ["plan-critic", "gpt-6-sol", "max", "max"],
  ] as const) {
    const registry = createEffectiveRouteRegistry()
    publishRoutes(registry, new Map([[agentName, {
      model: `openai/${modelID}`,
      requirement: { fallbackChain: [{ providers: ["openai"], model: modelID, reasoningEffort: inputEffort }] },
      requirementSource: "user-config",
      primarySource: "user-requirement",
      fastPath: { kind: "options", defaultRules: false, rules: [{ match: { model: modelID }, options: { reasoningEffort: inputEffort } }] },
    }]]))
    const output = { options: {} as Record<string, unknown> }
    await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
      makeInput({ agentName, modelID }), output,
    )
    assert.equal(output.options.reasoningEffort, expected, `${agentName}/${modelID}`)
  }
})

test("chat.params strips temperature for known unsupported reasoning models only", async () => {
  const cases = [
    {
      label: "GPT-5 reasoning model",
      providerID: "openai",
      modelID: "gpt-5.5",
      expectTemperature: false,
    },
    {
      label: "OpenAI o-series reasoning model",
      providerID: "openai",
      modelID: "o3-mini",
      expectTemperature: false,
    },
    {
      label: "Codex reasoning model",
      providerID: "openai",
      modelID: "codex-mini-latest",
      expectTemperature: false,
    },
    {
      label: "Claude Opus 4.7+",
      providerID: "anthropic",
      modelID: "claude-opus-4-7",
      expectTemperature: false,
    },
    {
      label: "ordinary GPT model",
      providerID: "openai",
      modelID: "gpt-4o",
      expectTemperature: true,
    },
    {
      label: "ordinary Claude model",
      providerID: "anthropic",
      modelID: "claude-sonnet-4-6",
      expectTemperature: true,
    },
  ] as const

  for (const testCase of cases) {
    clearResolutions()
    const registry = createEffectiveRouteRegistry()
    publishRoutes(registry, new Map([["builder", {
      model: `${testCase.providerID}/${testCase.modelID}`,
      requirement: {
        fallbackChain: [{
          providers: [testCase.providerID],
          model: testCase.modelID,
          temperature: 0.2,
          topP: 0.8,
          maxTokens: 1024,
        }],
      },
      requirementSource: "user-config",
      primarySource: "user-requirement",
      fastPath: { kind: "off" },
    }]]))
    const output = { options: {} as Record<string, unknown> }

    await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
      makeInput({ agentName: "builder", providerID: testCase.providerID, modelID: testCase.modelID }),
      output,
    )

    assert.equal(output.temperature, testCase.expectTemperature ? 0.2 : undefined, testCase.label)
    assert.equal(output.topP, 0.8, testCase.label)
    assert.equal(output.maxOutputTokens, 1024, testCase.label)
  }
})

test("chat.params ignores an unproven raw model temperature capability field", async () => {
  clearResolutions()
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.5",
    requirement: {
      fallbackChain: [{
        providers: ["openai"],
        model: "gpt-5.5",
        temperature: 0.2,
      }],
    },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
  }]]))
  const rawInput = makeInput({ agentName: "builder", modelID: "gpt-5.5" })
  Object.assign(rawInput.model, { supportsTemperature: true })
  const output = { options: {} as Record<string, unknown> }

  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(rawInput, output)

  assert.equal(output.temperature, undefined)
})

for (const reasoningEffort of ["minimal", "none"] as const) {
  test(`chat.params caps explicit direct ${reasoningEffort} on GPT-6.1+ Sol`, async () => {
    for (const providerID of ["openai", "openai-codex"]) {
      for (const modelID of ["gpt-6.1-sol", "openai/gpt-6.2-sol-fast", "gpt-7-sol"]) {
        const cfg = OcmmConfigSchema.parse({ agents: {
          builder: { requirement: { fallbackChain: [{ providers: [providerID], model: modelID, reasoningEffort }] } },
        } })
        const output = { options: {} as Record<string, unknown> }
        await createChatParamsHandler({ getConfig: () => cfg })(
          makeInput({ agentName: "builder", providerID, modelID }), output,
        )
        assert.equal(output.options.reasoningEffort, "low", `${providerID}/${modelID}`)
        assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, "low")
      }
    }
  })
}

test("chat.params preserves builtin GPT-6.1+ Sol direct low and medium while capping unsupported levels", async () => {
  for (const providerID of ["openai", "openai-codex"]) {
    for (const reasoningEffort of ["low", "medium", "minimal", "none"]) {
      const registry = createEffectiveRouteRegistry()
      publishRoutes(registry, new Map([["builder", {
        model: `${providerID}/gpt-6.1-sol`,
        requirement: { fallbackChain: [{ providers: [providerID], model: "gpt-6.1-sol", reasoningEffort }] },
        requirementSource: "agent-default",
        primarySource: "builtin-requirement",
        fastPath: { kind: "off" },
      }]]))
      const output = { options: {} as Record<string, unknown> }
      await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
        makeInput({ agentName: "builder", providerID, modelID: "gpt-6.1-sol" }), output,
      )
      const expected = reasoningEffort === "medium" ? "medium" : "low"
      assert.equal(output.options.reasoningEffort, expected, `${providerID} direct ${reasoningEffort}`)
    }
  }
})

test("chat.params caps GPT-6.1+ Sol final fast options with and without a resolved requirement", async () => {
  for (const providerID of ["openai", "openai-codex"]) {
    for (const effort of ["minimal", "none"]) {
      for (const resolved of [true, false]) {
        const registry = createEffectiveRouteRegistry()
        publishRoutes(registry, new Map([["builder", {
          model: `${providerID}/gpt-6.1-sol`,
          requirement: { fallbackChain: resolved ? [{ providers: [providerID], model: "gpt-6.1-sol", variant: "high" }] : [] },
          requirementSource: "agent-default",
          primarySource: "builtin-requirement",
          fastPath: {
            kind: "options", defaultRules: false,
            rules: [{ match: { provider: providerID, model: "gpt-6.1-sol" }, options: { reasoningEffort: effort } }],
          },
        }]]))
        const output = { options: {} as Record<string, unknown> }
        await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
          makeInput({ agentName: "builder", providerID, modelID: "gpt-6.1-sol" }), output,
        )
        assert.equal(output.options.reasoningEffort, "low", `${providerID} ${effort} resolved=${resolved}`)
      }
    }
  }
})

test("chat.params retains GPT-6.1+ Sol variant and canonical migration semantics", async () => {
  for (const providerID of ["openai", "openai-codex"]) {
    for (const source of ["user-config", "agent-default"] as const) {
      for (const control of ["variant", "reasoning"] as const) {
        for (const level of ["minimal", "low", "medium", "high", "xhigh", "max"] as const) {
          const registry = createEffectiveRouteRegistry()
          publishRoutes(registry, new Map([["builder", {
            model: `${providerID}/gpt-6.1-sol`,
            requirement: { fallbackChain: [{ providers: [providerID], model: "gpt-6.1-sol" }], [control]: level },
            requirementSource: source,
            primarySource: source === "user-config" ? "user-requirement" : "builtin-requirement",
            fastPath: { kind: "off" },
          }]]))
          const output = { options: {} as Record<string, unknown> }
          await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
            makeInput({ agentName: "builder", providerID, modelID: "gpt-6.1-sol" }), output,
          )
          assert.equal(output.options.reasoningEffort, level === "minimal" ? "low" : level, `${providerID} ${source} ${control}=${level}`)
        }
      }
    }
  }
})

test("chat.params keeps GPT-6.1+ Sol neutral variant none separate from canonical off", async () => {
  for (const providerID of ["openai", "openai-codex"]) {
    for (const control of [{ variant: "none" }, { reasoning: "off" }] as const) {
      const cfg = OcmmConfigSchema.parse({ agents: { builder: { model: `${providerID}/gpt-6.1-sol`, ...control } } })
      const handler = createChatParamsHandler({ getConfig: () => cfg })
      const output = { options: {} as Record<string, unknown> }
      await handler(makeInput({ agentName: "builder", providerID, modelID: "gpt-6.1-sol" }), output)
      assert.deepEqual(output.options, "variant" in control ? {} : { reasoningEffort: "low" }, `${providerID} ${JSON.stringify(control)}`)
      const neutralRequest = { options: {} as Record<string, unknown> }
      await handler(makeInput({ agentName: "builder", providerID, modelID: "gpt-6.1-sol", variant: "none" }), neutralRequest)
      assert.deepEqual(neutralRequest.options, {})
    }
  }
})

test("chat.params retains GPT-6.1+ Sol review and critic floors after direct and fast overrides", async () => {
  for (const agentName of ["reviewer", "plan-critic", "reviewer-low", "plan-critic-low"]) {
    for (const effort of ["minimal", "none", "low", "medium", "max"]) {
      const registry = createEffectiveRouteRegistry()
      publishRoutes(registry, new Map([[agentName, {
        model: "openai/gpt-6.1-sol",
        requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-6.1-sol", reasoningEffort: effort }] },
        requirementSource: "user-config",
        primarySource: "user-requirement",
        fastPath: {
          kind: "options", defaultRules: false,
          rules: [{ match: { model: "gpt-6.1-sol" }, options: { reasoningEffort: effort } }],
        },
      }]]))
      const output = { options: {} as Record<string, unknown> }
      await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
        makeInput({ agentName, modelID: "gpt-6.1-sol" }), output,
      )
      assert.equal(output.options.reasoningEffort, effort === "max" ? "max" : "xhigh", `${agentName} ${effort}`)
    }
  }
})
