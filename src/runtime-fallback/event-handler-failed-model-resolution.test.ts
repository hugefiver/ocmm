import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import { makeMockClient, makeConfig, makeErrorEvent } from "./event-handler-test-fixtures.ts"
import { createEffectiveRouteRegistry, type EffectiveRouteRegistry } from "../routing/route-registry.ts"
import type { EffectiveModelRoute, ModelRequirement } from "../shared/types.ts"

function publishRoute(
  registry: EffectiveRouteRegistry,
  agent: string,
  model: string,
  fallbackChain: ModelRequirement["fallbackChain"],
): void {
  const generation = registry.beginBuild()
  registry.publish(generation, new Map<string, EffectiveModelRoute>([[agent, {
    model,
    requirement: { fallbackChain },
    requirementSource: "user-config",
    primarySource: "user-requirement",
  }]]))
}

test("published route supplies an omitted event model", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/route-fast", [
    { providers: ["provider"], model: "route-fast" },
    { providers: ["provider"], model: "route-original" },
    { providers: ["provider"], model: "route-later" },
  ])
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_published_omitted", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.providerID, "provider")
  assert.equal(calls[0]?.body.modelID, "route-original")
})

test("published route requirement wins contradictory raw configuration", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/route-primary", [
    { providers: ["provider"], model: "route-primary" },
    { providers: ["provider"], model: "route-winner" },
  ])
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_published_wins", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "route-winner")
})

test("published snapshot missing an agent does not recompute raw configuration", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  const generation = registry.beginBuild()
  registry.publish(generation, new Map())
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_published_missing", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
})

test("never-published registry preserves raw fallback resolution", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client,
    routeRegistry: createEffectiveRouteRegistry(),
  })

  await handler(makeErrorEvent("ses_unpublished", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
})

test("runtime consumes exactly one effective-route snapshot for each session.error", async () => {
  const { client } = makeMockClient()
  const cfg = makeConfig()
  const actual = createEffectiveRouteRegistry()
  publishRoute(actual, "orchestrator", "provider/route-primary", [
    { providers: ["provider"], model: "route-primary" },
    { providers: ["provider"], model: "route-next" },
  ])
  let snapshotCalls = 0
  const registry: EffectiveRouteRegistry = {
    beginBuild: actual.beginBuild,
    publish: actual.publish,
    snapshot: () => {
      snapshotCalls++
      return actual.snapshot()
    },
    isCurrentSnapshot: actual.isCurrentSnapshot,
  }
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_one_snapshot", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(snapshotCalls, 1)
})

test("successful new route snapshot restarts same-session fallback attempts", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ maxAttempts: 1 })
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/first-primary", [
    { providers: ["provider"], model: "first-primary" },
    { providers: ["provider"], model: "first-next" },
  ])
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_snapshot_restart", { status: 503 }, { agent: "orchestrator" }))
  publishRoute(registry, "orchestrator", "provider/second-primary", [
    { providers: ["provider"], model: "second-primary" },
    { providers: ["provider"], model: "second-next" },
  ])
  await handler(makeErrorEvent("ses_snapshot_restart", { status: 503 }, { agent: "orchestrator" }))

  assert.deepEqual(calls.map((call) => call.body.modelID), ["first-next", "second-next"])
})

test("runtime surface: A-fast retryable failure dispatches original A", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/A-fast", [
    { providers: ["provider"], model: "A-fast" },
    { providers: ["provider"], model: "A" },
    { providers: ["provider"], model: "later" },
  ])
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_fast_failure", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.providerID, "provider")
  assert.equal(calls[0]?.body.modelID, "A")
})

test("published route preserves an explicit event model as the failed chain entry", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/A-fast", [
    { providers: ["provider"], model: "A-fast" },
    { providers: ["provider"], model: "A" },
    { providers: ["provider"], model: "B" },
    { providers: ["provider"], model: "later" },
  ])
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_explicit_route_entry", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "provider", modelID: "B" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.providerID, "provider")
  assert.equal(calls[0]?.body.modelID, "later")
})

test("event without model uses agent's primary model as failed key (not agent name)", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // No model in event props - handler should derive the failed key from the
  // agent's requirement chain, not use the agent name "orchestrator" as key.
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
  // If the agent name were used as the failed key, the second error (below)
  // would NOT advance past fallback-a because the key wouldn't match.
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "fallback-a" },
  }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})

test("second error without model uses state.activeModel as failed key (chain advances)", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // First error: has an explicit model, dispatches fallback-a.
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")

  // Second error: NO model in event. The handler should use state.activeModel
  // ("hoo/fallback-a") as the just-failed key, not fall back to the primary
  // chain entry. This advances the chain to fallback-b.
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    // No model field - relies on activeModel tracking
  }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})

test("third error without model continues to advance using activeModel", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ maxAttempts: 5 })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // First error: explicit model -> fallback-a
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(calls[0]?.body.modelID, "fallback-a")

  // Second error: no model -> activeModel (fallback-a) -> fallback-b
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
  }))
  assert.equal(calls[1]?.body.modelID, "fallback-b")

  // Third error: no model -> activeModel (fallback-b) -> chain has only 2
  // fallbacks (a, b), so this should exhaust with "no-next-model"
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
  }))
  // Only 2 calls, chain exhausted after fallback-b
  assert.equal(calls.length, 2)
})

test("event without model on first error uses primary as failed key", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // No model in event, no prior state => falls back to primary chain entry.
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
})

test("first error from an event model outside the chain dispatches chain index 0", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_event_outside", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "gpt-5.7-sol" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "primary-model")
})

test("first error from a published route model outside the original chain dispatches chain index 0", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const routeRegistry = createEffectiveRouteRegistry()
  publishRoute(routeRegistry, "orchestrator", "hoo/gpt-5.7-sol", [
    { providers: ["hoo"], model: "primary-model" },
    { providers: ["hoo"], model: "fallback-a" },
    { providers: ["hoo"], model: "fallback-b" },
  ])
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client,
    routeRegistry,
  })

  await handler(makeErrorEvent("ses_published_outside", { status: 503 }, {
    agent: "orchestrator",
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "primary-model")
})

test("secondary providers match the same static chain entry and are not retried", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [
            { providers: ["openai", "github-copilot"], model: "gpt-5.5" },
            { providers: ["anthropic"], model: "claude-opus-4-7" },
          ],
        },
      },
    },
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_secondary_provider", { status: 503 }, {
    agent: "reviewer",
    model: { providerID: "github-copilot", modelID: "gpt-5.5" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.providerID, "anthropic")
  assert.equal(calls[0]?.body.modelID, "claude-opus-4-7")
})

test("fallback static matching accepts version aliases only at a delimiter boundary", async () => {
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [
            { providers: ["openai"], model: "gpt-5.5" },
            { providers: ["anthropic"], model: "claude-opus-4-7" },
          ],
        },
      },
    },
  })

  const aliasMock = makeMockClient()
  const aliasHandler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: aliasMock.client })
  await aliasHandler(makeErrorEvent("ses_alias", { status: 503 }, {
    agent: "reviewer",
    model: { providerID: "openai", modelID: "gpt-5.5-20260713" },
  }))
  assert.equal(aliasMock.calls[0]?.body.modelID, "claude-opus-4-7")

  const distinctMock = makeMockClient()
  const distinctHandler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: distinctMock.client })
  await distinctHandler(makeErrorEvent("ses_distinct", { status: 503 }, {
    agent: "reviewer",
    model: { providerID: "openai", modelID: "gpt-5.50" },
  }))
  assert.equal(distinctMock.calls[0]?.body.modelID, "gpt-5.5")
})

test("description-only oracle uses the explicit reviewer fallback chain", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        model: "hoo/primary-model",
        fallbackModels: ["hoo/fallback-a", "hoo/fallback-b"],
      },
      oracle: { description: "custom oracle" },
    },
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_oracle_alias", { status: 503 }, {
    agent: "oracle",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
})

test("oracle Terra successor restarts fallback from the chain head", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({})
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_oracle_terra", { status: 503 }, {
    agent: "oracle",
    model: { providerID: "openai", modelID: "gpt-5.7-terra" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.providerID, "anthropic")
  assert.equal(calls[0]?.body.modelID, "claude-opus-4-7")
})

test("multi-hop reviewer aliases provide oracle's inherited fallback chain", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: { alias: "review-policy-a" },
      "review-policy-a": { alias: "review-policy-b" },
      "review-policy-b": { alias: "review-model" },
      "review-model": {
        model: "hoo/primary-model",
        fallbackModels: ["hoo/fallback-a", "hoo/fallback-b"],
      },
      oracle: { description: "custom oracle" },
    },
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_oracle_multihop", { status: 503 }, {
    agent: "oracle",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
})
