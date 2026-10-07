import assert from "node:assert/strict"
import { test } from "node:test"

import { defaultConfig, OcmmConfigSchema, type OcmmConfig } from "../config/schema.ts"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"
import { createChatParamsHandler } from "./chat-params.ts"
import { createConfigHandler } from "./config.ts"

async function register(config: OcmmConfig, provider: Record<string, unknown>) {
  const routeRegistry = createEffectiveRouteRegistry()
  const target = { agent: {} as Record<string, unknown>, provider }
  await createConfigHandler({
    getConfig: () => config,
    cwd: process.cwd(),
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)
  assert.equal(routeRegistry.snapshot().published, true)
  return { target, routeRegistry }
}

function registeredModel(target: { agent: Record<string, unknown> }, name: string): string | undefined {
  return (target.agent[name] as { model?: string }).model
}

test("GPT migration mixed-provider registration keeps coding on available Claude Sonnet", async () => {
  const { target, routeRegistry } = await register(defaultConfig(), {
    anthropic: { models: { "claude-sonnet-4-6": {} } },
    openai: { models: { "gpt-6.1-sol": {} } },
  })
  assert.equal(registeredModel(target, "coding"), "anthropic/claude-sonnet-4-6")
  const route = routeRegistry.snapshot().routes.get("coding")!
  assert.equal(route.model, "anthropic/claude-sonnet-4-6")
  assert.equal(route.primarySource, "builtin-requirement")
  assert.equal(route.requirement.fallbackChain[0]!.model, "claude-sonnet-4-6")
})

test("GPT migration registration falls through unavailable Claude to a cataloged Sol successor", async () => {
  for (const anthropic of [undefined, { models: { "claude-opus-5": {} } }]) {
    const { target, routeRegistry } = await register(defaultConfig(), {
      anthropic,
      openai: { models: { "gpt-6.2-sol": {} } },
    })
    assert.equal(registeredModel(target, "coding"), "openai/gpt-6.2-sol")
    assert.equal(routeRegistry.snapshot().routes.get("coding")!.requirement.fallbackChain[0]!.model, "gpt-6.2-sol")
  }
})

test("GPT migration registration retains the available non-GPT fallback when its head is unavailable", async () => {
  const { target, routeRegistry } = await register(defaultConfig(), {
    anthropic: { models: { "claude-opus-5": {} } },
    openai: { models: { "gpt-6.2-astra": {} } },
  })
  for (const name of ["frontend", "creative"]) {
    assert.equal(registeredModel(target, name), "anthropic/claude-opus-5")
    const route = routeRegistry.snapshot().routes.get(name)!
    assert.equal(route.model, "anthropic/claude-opus-5")
    assert.equal(route.primarySource, "catalog-upgrade")
    assert.equal(route.requirement.fallbackChain[0]!.model, "claude-opus-5")
    assert.equal(route.requirement.fallbackChain[0]!.variant, "max")
  }
})

test("GPT migration mixed-provider registration retains legacy promotions and GPT-first Astra upgrades", async () => {
  const { target, routeRegistry } = await register(defaultConfig(), {
    anthropic: { models: { "claude-sonnet-4-6": {}, "claude-opus-5": {}, "claude-opus-4-7": {} } },
    "github-copilot": { models: { "gpt-6.2-sol": {}, "gpt-6.2-astra": {} } },
    openai: { models: { "gpt-6.1-sol": {}, "gpt-6.2-sol": {}, "gpt-6-astra": {}, "gpt-6.2-astra": {} } },
  })
  for (const [name, model] of [
    ["coding", "anthropic/claude-sonnet-4-6"],
    ["orchestrator", "openai/gpt-6.2-sol"],
    ["builder", "openai/gpt-6.2-sol"],
    ["reviewer", "openai/gpt-6.2-sol"],
    ["planner", "openai/gpt-6.2-astra"],
    ["plan-critic", "openai/gpt-6.2-astra"],
    ["hard-reasoning", "openai/gpt-6.2-astra"],
  ] as const) {
    assert.equal(registeredModel(target, name), model, name)
    assert.equal(routeRegistry.snapshot().routes.get(name)!.model, model, name)
  }
})

test("GPT migration registration retains the available provider identity of a non-GPT head", async () => {
  for (const bothProviders of [false, true]) {
    const { target, routeRegistry } = await register(defaultConfig(), {
      google: bothProviders ? { models: { "gemini-3.1-pro": {} } } : undefined,
      "google-vertex": { models: { "gemini-3.1-pro": {} } },
      openai: { models: { "gpt-6.2-astra": {} } },
    })
    const provider = bothProviders ? "google" : "google-vertex"
    for (const name of ["frontend", "creative"]) {
      const model = `${provider}/gemini-3.1-pro`
      assert.equal(registeredModel(target, name), model)
      const route = routeRegistry.snapshot().routes.get(name)!
      assert.equal(route.model, model)
      assert.equal(route.primarySource, bothProviders ? "builtin-requirement" : "catalog-upgrade")
      assert.equal(route.requirement.fallbackChain[0]!.model, "gemini-3.1-pro")
      assert.equal(route.requirement.fallbackChain[0]!.providers[0], provider)
      assert.equal(route.requirement.fallbackChain[0]!.variant, "high")
    }
  }
})

for (const testCase of [
  { label: "variant minimal", control: { variant: "minimal" }, expected: { reasoningEffort: "low" } },
  { label: "direct minimal", control: { reasoningEffort: "minimal" }, expected: { reasoningEffort: "low" } },
  { label: "direct none", control: { reasoningEffort: "none" }, expected: { reasoningEffort: "low" } },
  { label: "neutral variant none", control: { variant: "none" }, expected: {} },
] as const) {
  test(`GPT migration registered handler applies ${testCase.label} on GPT-6.1 Sol`, async () => {
    const config = OcmmConfigSchema.parse({ agents: {
      builder: "reasoningEffort" in testCase.control
        ? { requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-6.1-sol", reasoningEffort: testCase.control.reasoningEffort }] } }
        : { model: "openai/gpt-6.1-sol", ...testCase.control },
    } })
    const { target, routeRegistry } = await register(config, {
      anthropic: { models: { "claude-sonnet-4-6": {} } },
      openai: { models: { "gpt-6.1-sol": {}, "gpt-6.2-sol": {} } },
    })
    assert.equal(registeredModel(target, "builder"), "openai/gpt-6.1-sol")
    const output = { options: {} as Record<string, unknown> }
    await createChatParamsHandler({ getConfig: () => config, routeRegistry })(
      {
        sessionID: "gpt-migration",
        agent: { name: "builder" },
        model: { providerID: "openai", modelID: "gpt-6.1-sol" },
        provider: { id: "openai" },
        message: {},
      },
      output,
    )
    assert.deepEqual(output.options, testCase.expected)
  })
}
