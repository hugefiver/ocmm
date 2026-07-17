import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import { makeMockClient, makeConfig, makeErrorEvent } from "./event-handler-test-fixtures.ts"

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

test("first error from a registered model outside the chain dispatches chain index 0", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registeredAgentModels = new Map([["orchestrator", "hoo/gpt-5.7-sol"]])
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client,
    registeredAgentModels,
  })

  await handler(makeErrorEvent("ses_registered_outside", { status: 503 }, {
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
