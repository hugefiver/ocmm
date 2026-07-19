import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import { runGenericFallback } from "./event-handler-generic-fallback.ts"
import { createRuntimeFallbackSessionLifecycle } from "./event-handler-support.ts"
import { createFallbackState } from "./fallback-state.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import {
  deferred,
  flushHandler,
  makeControlledClient,
  makeMockClient,
  makeConfig,
  makeErrorEvent,
  makeCreatedEvent,
  type PromptCall,
} from "./event-handler-test-fixtures.ts"
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

const snapshotChain = [
  { providers: ["provider"], model: "snapshot-primary" },
  { providers: ["provider"], model: "snapshot-next" },
]

test("generic fallback does no client work when its snapshot is stale before dispatch", async () => {
  const mock = makeControlledClient()
  const cfg = OcmmConfigSchema.parse({ runtimeFallback: { enabled: true } })
  const lifecycle = createRuntimeFallbackSessionLifecycle(mock.client)
  const state = createFallbackState("provider/snapshot-primary", 1)
  state.activeModel = "provider/snapshot-primary"
  const generation = lifecycle.beginSession("ses_stale_before_dispatch")

  await runGenericFallback({
    lifecycle,
    client: mock.client,
    clock: () => 1_000,
    isCurrentSnapshot: () => false,
  }, {
    sessionID: "ses_stale_before_dispatch",
    generation,
    snapshotId: 1,
    agent: "worker",
    classification: { retryable: true, reason: "test", message: "test" },
    requirement: { fallbackChain: snapshotChain },
    state,
    failedTarget: {
      providerID: "provider",
      modelID: "snapshot-primary",
      entry: snapshotChain[0]!,
    },
    runtimeConfig: cfg.runtimeFallback,
  })

  assert.equal(mock.aborts, 0)
  assert.equal(mock.messages, 0)
  assert.equal(mock.calls.length, 0)
  assert.equal(state.attempts, 0)
})

test("snapshot change while messages are pending prevents stale prompt and commit", async () => {
  const pendingMessages = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [pendingMessages.promise] })
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/snapshot-primary", snapshotChain)
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, routeRegistry: registry })

  const pending = handler(makeErrorEvent("ses_pending_messages", { status: 503 }, { agent: "orchestrator" }))
  await flushHandler()
  assert.equal(mock.aborts, 1)
  assert.equal(mock.messages, 1)
  publishRoute(registry, "orchestrator", "provider/replacement-primary", [
    { providers: ["provider"], model: "replacement-primary" },
    { providers: ["provider"], model: "replacement-next" },
  ])
  pendingMessages.resolve({ messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }] })
  await pending

  assert.equal(mock.calls.length, 0)
})

test("snapshot change after messages before prompt prevents stale prompt and commit", async () => {
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/snapshot-primary", snapshotChain)
  const mock = makeControlledClient([], {
    onMessagesResolved: () => publishRoute(registry, "orchestrator", "provider/replacement-primary", [
      { providers: ["provider"], model: "replacement-primary" },
      { providers: ["provider"], model: "replacement-next" },
    ]),
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_after_messages", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(mock.aborts, 1)
  assert.equal(mock.messages, 1)
  assert.equal(mock.calls.length, 0)
})

test("dispatches fallback on retryable 503 error", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, directory: "/wd" })

  await handler(makeErrorEvent("ses_1", { status: 503, message: "overloaded" }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
  assert.equal(calls[0]?.body.providerID, "hoo")
  assert.equal(calls[0]?.body.agent, "orchestrator")
  assert.deepEqual(calls[0]?.body.parts, [{ type: "text", text: "hello" }])
})

test("skips non-retryable errors without dispatching", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 404, message: "not found" }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
})

test("skips AbortError (likely our own abort)", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { name: "AbortError" }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
})

test("skips isAbort:true errors", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { isAbort: true, message: "aborted" }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
})

test("skips when runtimeFallback.enabled is false", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ enabled: false })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
})

test("observe-only mode classifies but does not dispatch", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ dispatch: false })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
})

test("advances fallback chain on consecutive errors", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator", model: { providerID: "hoo", modelID: "primary-model" } }))
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator", model: { providerID: "hoo", modelID: "fallback-a" } }))

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})

test("stops after maxAttempts reached", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ maxAttempts: 1 })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
})

test("clears session state on session.deleted", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ maxAttempts: 5 })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))
  await handler({ event: { type: "session.deleted", properties: { sessionID: "ses_1" } } })
  // Per runtime-safety spec: a deleted child must never auto-recover on a
  // later retryable session.error. A legitimate session.created with the same
  // ID clears the suppression tombstone so dispatch can resume normally.
  await handler(makeCreatedEvent("ses_1"))
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
  assert.equal(calls[1]?.body.modelID, "fallback-a")
})

test("no-op when agent has no fallback chain configured", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({})
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "unknown-agent" }))

  assert.equal(calls.length, 0)
})

test("disabled generated review tier does not receive a fallback requirement and does not dispatch", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        model: "openai/gpt-5.5",
        variants: { high: { model: "openai/gpt-5.6-sol", variant: "max" } },
      },
    },
    disabledAgents: ["oracle-high"],
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_disabled_review", { status: 503 }, {
    agent: "oracle-high",
    model: { providerID: "openai", modelID: "gpt-5.6-sol" },
  }))

  assert.equal(calls.length, 0, "disabled generated review tier must not dispatch")
})

test("uses builtin agent requirement when no user override", async () => {
  const { client, calls } = makeMockClient()
  const cfg = OcmmConfigSchema.parse({})
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.ok(calls.length >= 1, "should dispatch using builtin chain")
  const modelID = calls[0]?.body.modelID as string
  assert.ok(modelID && modelID.length > 0, "should pick a real model from builtin chain")
})

test("no client => logs and does not throw", async () => {
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg })

  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))

  assert.ok(true, "did not throw without client")
})

test("ignores events without sessionID", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler({ event: { type: "session.error", properties: { error: { status: 503 } } } })

  assert.equal(calls.length, 0)
})

test("ignores non-session.error events", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler({ event: { type: "message.updated", properties: { sessionID: "ses_1" } } })

  assert.equal(calls.length, 0)
})

test("handles flat event shape (no nested event wrapper)", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler({ type: "session.error", properties: { sessionID: "ses_1", error: { status: 503 }, agent: "orchestrator" } })

  assert.equal(calls.length, 1)
})

test("failed dispatch does not advance fallback state", async () => {
  // Mock client with messages that yield no user parts - dispatchFallbackRetry
  // returns false because parts.length === 0.
  const calls: PromptCall[] = []
  const emptyMessagesResp = { messages: [] }
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() { return emptyMessagesResp },
      async prompt(args: { path: { id: string }; body: Record<string, unknown> }) {
        calls.push({
          sessionID: args.path.id,
          body: args.body,
        })
        return undefined
      },
    },
  }
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // First error triggers peek -> dispatch returns false (no user parts)
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  // dispatch was called but returned false, so state was NOT committed
  // prompt should NOT have been called (dispatch failed before reaching it)
  assert.equal(calls.length, 0, "prompt should not be called when dispatch returns false")

  // Now give the mock real messages so the second error can dispatch
  client.session.messages = async () => ({
    messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
  })

  // Second error: state was not advanced, so it should still peek fallback-a
  // (the same model as before), not skip to fallback-b
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
})
