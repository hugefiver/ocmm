import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import { runGenericFallback } from "./event-handler-generic-fallback.ts"
import {
  createRuntimeFallbackDispatchReservations,
  createRuntimeFallbackSessionLifecycle,
} from "./event-handler-support.ts"
import { createFallbackState } from "./fallback-state.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import {
  FakeHandlerScheduler,
  deferred,
  flushHandler,
  makeControlledClient,
  makeMockClient,
  makeConfig,
  makeErrorEvent,
  makeCreatedEvent,
  makeIdleEvent,
  makeStatusEvent,
  type PromptCall,
} from "./event-handler-test-fixtures.ts"
import { createEffectiveRouteRegistry, type EffectiveRouteRegistry } from "../routing/route-registry.ts"
import type { EffectiveModelRoute, ModelRequirement } from "../shared/types.ts"

function publishRoute(
  registry: EffectiveRouteRegistry,
  agent: string,
  model: string,
  fallbackChain: ModelRequirement["fallbackChain"],
  requirementOptions: Omit<ModelRequirement, "fallbackChain"> = {},
): void {
  const generation = registry.beginBuild()
  registry.publish(generation, new Map<string, EffectiveModelRoute>([[agent, {
    model,
    requirement: { fallbackChain, ...requirementOptions },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastPath: { kind: "off" },
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
    reservations: createRuntimeFallbackDispatchReservations(),
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

test("pre-prompt stale rejection releases its exact generic reservation", async () => {
  const mock = makeControlledClient()
  const cfg = makeConfig()
  const lifecycle = createRuntimeFallbackSessionLifecycle(mock.client)
  const reservations = createRuntimeFallbackDispatchReservations()
  const state = createFallbackState("provider/snapshot-primary", 1)
  state.activeModel = "provider/snapshot-primary"
  const sessionID = "ses_stale_before_prompt"
  const generation = lifecycle.beginSession(sessionID)
  let snapshotChecks = 0

  await runGenericFallback({
    lifecycle,
    reservations,
    client: mock.client,
    clock: () => 1_000,
    // Current through abort/messages; stale at dispatcher's final pre-prompt check.
    isCurrentSnapshot: () => ++snapshotChecks < 7,
  }, {
    sessionID,
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

  assert.equal(mock.calls.length, 0)
  assert.equal(reservations.get(sessionID), undefined)
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

test("published canonical reasoning suppresses a lower-priority fallback variant in the prompt", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(
    registry,
    "builder",
    "openai/gpt-5.6-sol",
    [
      { providers: ["openai"], model: "gpt-5.6-sol" },
      { providers: ["anthropic"], model: "claude-opus-4-6", variant: "max" },
    ],
    { reasoning: "high" },
  )
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_published_reasoning", { status: 503 }, {
    agent: "builder",
    model: { providerID: "openai", modelID: "gpt-5.6-sol" },
  }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.providerID, "anthropic")
  assert.equal(calls[0]?.body.modelID, "claude-opus-4-6")
  assert.equal(calls[0]?.body.reasoning, undefined)
  assert.equal(calls[0]?.body.variant, undefined)
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

for (const name of ["AbortError", "DOMException"] as const) {
  test(`dispatches exactly once for a name-based ${name} with nested provider 402`, async () => {
    const { client, calls } = makeMockClient()
    const cfg = makeConfig()
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

    await handler(makeErrorEvent("ses_quota_abort", {
      name,
      error: { data: { statusCode: 402 } },
    }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    }))

    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.body.modelID, "fallback-a")
  })
}

test("name-based quota abort recovery preserves every final eligibility gate", async () => {
  const cases: Array<{
    name: string
    cfg: ReturnType<typeof makeConfig>
    event: unknown
    routeRegistry?: EffectiveRouteRegistry
  }> = [
    {
      name: "runtime fallback disabled",
      cfg: makeConfig({ enabled: false }),
      event: makeErrorEvent("ses_quota_disabled", { name: "AbortError", status: 402 }, { agent: "orchestrator" }),
    },
    {
      name: "402 not configured",
      cfg: makeConfig({ retryOnStatusCodes: [429, 500, 502, 503, 504] }),
      event: makeErrorEvent("ses_quota_unconfigured", { name: "AbortError", status: 402 }, { agent: "orchestrator" }),
    },
    {
      name: "missing session",
      cfg: makeConfig(),
      event: {
        event: {
          type: "session.error",
          properties: { error: { name: "AbortError", status: 402 }, agent: "orchestrator" },
        },
      },
    },
    {
      name: "missing effective agent requirement",
      cfg: makeConfig(),
      event: makeErrorEvent("ses_quota_no_agent", { name: "AbortError", status: 402 }, { agent: "unknown-agent" }),
    },
  ]

  const singleRouteRegistry = createEffectiveRouteRegistry()
  publishRoute(singleRouteRegistry, "orchestrator", "hoo/primary-model", [
    { providers: ["hoo"], model: "primary-model" },
  ])
  cases.push({
    name: "fallback chain has one entry",
    cfg: makeConfig(),
    event: makeErrorEvent("ses_quota_single", { name: "DOMException", status: 402 }, { agent: "orchestrator" }),
    routeRegistry: singleRouteRegistry,
  })

  for (const scenario of cases) {
    const { client, calls } = makeMockClient()
    const handler = createRuntimeFallbackEventHandler({
      getConfig: () => scenario.cfg,
      client,
      ...(scenario.routeRegistry === undefined ? {} : { routeRegistry: scenario.routeRegistry }),
    })
    await handler(scenario.event)
    assert.equal(calls.length, 0, scenario.name)
  }
})

test("concurrent eligible quota abort errors emit only one prompt", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client })
  const event = makeErrorEvent("ses_quota_concurrent", { name: "AbortError", status: 402 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  })

  const first = handler(event)
  await flushHandler()
  const second = handler(event)
  await flushHandler()
  assert.equal(mock.aborts, 1)
  assert.equal(mock.messages, 1)
  assert.equal(mock.calls.length, 0)

  messagesGate.resolve({ messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }] })
  await Promise.all([first, second])
  assert.equal(mock.calls.length, 1)
  assert.equal(mock.calls[0]?.body.modelID, "fallback-a")
})

test("messages rejection releases the generic reservation for a later retry", async () => {
  const mock = makeControlledClient([], {
    messagesResults: [
      Promise.reject(new Error("messages unavailable")),
      Promise.resolve({ messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }] }),
    ],
  })
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client })
  const event = makeErrorEvent("ses_messages_rejected", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  })

  await handler(event)
  await handler(event)

  assert.equal(mock.calls.length, 1)
  assert.equal(mock.calls[0]?.body.modelID, "fallback-a")
})

test("stale pre-prompt rejection releases the reservation for the replacement route", async () => {
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/snapshot-primary", snapshotChain)
  let replaceRoute = true
  const mock = makeControlledClient([], {
    onMessagesResolved: () => {
      if (!replaceRoute) return
      replaceRoute = false
      publishRoute(registry, "orchestrator", "provider/replacement-primary", [
        { providers: ["provider"], model: "replacement-primary" },
        { providers: ["provider"], model: "replacement-next" },
      ])
    },
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, routeRegistry: registry })

  await handler(makeErrorEvent("ses_stale_release", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "provider", modelID: "snapshot-primary" },
  }))
  await handler(makeErrorEvent("ses_stale_release", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "provider", modelID: "replacement-primary" },
  }))

  assert.equal(mock.calls.length, 1)
  assert.equal(mock.calls[0]?.body.modelID, "replacement-next")
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
  // rejects with empty-parts because parts.length === 0.
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

  // First error triggers peek -> dispatch rejects before prompt (no user parts)
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  // dispatch was called but returned false, so state was NOT committed
  // prompt should NOT have been called (dispatch failed before reaching it)
  assert.equal(calls.length, 0, "prompt should not be called when dispatch is rejected")

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

test("possibly-accepted dispatch commits state but waits for explicit target evidence", async () => {
  const calls: PromptCall[] = []
  let rejectPrompt = true
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] }
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown> }) {
        calls.push({ sessionID: args.path.id, body: args.body })
        if (rejectPrompt) {
          rejectPrompt = false
          throw new Error("transport failed after prompt invocation")
        }
        return undefined
      },
    },
  }
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_possibly_accepted", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")

  await handler(makeErrorEvent("ses_possibly_accepted", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent("ses_possibly_accepted", { status: 503 }, {
    agent: "orchestrator",
  }))
  assert.equal(calls.length, 1, "old and model-less evidence must not repeat an ambiguous prompt")

  await handler(makeErrorEvent("ses_possibly_accepted", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "fallback-a" },
  }))

  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})

test("accepted dispatch remains pending until current target evidence arrives", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })
  const sessionID = "ses_accepted_pending"

  await handler(makeErrorEvent(sessionID, { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent(sessionID, { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent(sessionID, { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")

  await handler(makeErrorEvent(sessionID, { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "fallback-a" },
  }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})

test("retry status target evidence advances an accepted session.error through the shared generic path", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })
  const sessionID = "ses_error_pending_status_target"

  await handler(makeErrorEvent(sessionID, { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeStatusEvent(sessionID, {
    type: "retry",
    model: { providerID: "hoo", modelID: "primary-model", variant: "high" },
    attempt: 2,
    message: "stale primary evidence",
  }, { agent: "orchestrator" }))
  await handler(makeStatusEvent(sessionID, {
    type: "retry",
    attempt: 2,
    message: "model-less evidence",
  }, { agent: "orchestrator" }))
  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a"])

  await handler(makeStatusEvent(sessionID, {
    type: "retry",
    model: { providerID: "hoo", modelID: "fallback-a", variant: "medium" },
    attempt: 2,
    message: "fallback target failed",
  }, { agent: "orchestrator" }))

  assert.deepEqual(calls.map((call) => call.body.modelID), ["fallback-a", "fallback-b"])
})

test("route replacement clears accepted pending ownership and dispatches from the replacement chain", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const registry = createEffectiveRouteRegistry()
  publishRoute(registry, "orchestrator", "provider/snapshot-primary", snapshotChain)
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, routeRegistry: registry })
  const sessionID = "ses_pending_route_replacement"

  await handler(makeErrorEvent(sessionID, { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "provider", modelID: "snapshot-primary" },
  }))
  publishRoute(registry, "orchestrator", "provider/replacement-primary", [
    { providers: ["provider"], model: "replacement-primary" },
    { providers: ["provider"], model: "replacement-next" },
  ])
  await handler(makeErrorEvent(sessionID, { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "provider", modelID: "replacement-primary" },
  }))

  assert.deepEqual(calls.map((call) => call.body.modelID), ["snapshot-next", "replacement-next"])
})

test("stale snapshot completion cannot commit or clear a newer reservation owner", async () => {
  const cfg = makeConfig()
  const reservations = createRuntimeFallbackDispatchReservations()
  let currentSnapshot = 1
  const sessionID = "ses_stale_owner_completion"
  let oldOwner!: { generation: number; routeSnapshotId: number; targetModel: string }
  let newOwner!: { generation: number; routeSnapshotId: number; targetModel: string }
  const state = createFallbackState("provider/snapshot-primary", 1)
  state.activeModel = "provider/snapshot-primary"
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }] }
      },
      async prompt() {
        assert.equal(reservations.clear(sessionID, oldOwner), true, "old owner must be acquired before prompt I/O")
        assert.equal(reservations.acquire(sessionID, newOwner), true)
        currentSnapshot = 2
        return undefined
      },
    },
  }
  const lifecycle = createRuntimeFallbackSessionLifecycle(client)
  const generation = lifecycle.beginSession(sessionID)
  oldOwner = {
    generation,
    routeSnapshotId: 1,
    targetModel: "provider/snapshot-next",
  }
  newOwner = {
    generation,
    routeSnapshotId: 2,
    targetModel: "provider/replacement-next",
  }

  await runGenericFallback({
    lifecycle,
    reservations,
    client,
    clock: () => 1_000,
    isCurrentSnapshot: (snapshotId) => snapshotId === currentSnapshot,
  }, {
    sessionID,
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

  assert.deepEqual(reservations.get(sessionID), { ...newOwner, state: "reserved" })
  assert.equal(state.attempts, 0)
  assert.equal(state.activeModel, "provider/snapshot-primary")
})

test("dedicated 429 treats possibly-accepted dispatch as successful", async () => {
  const calls: PromptCall[] = []
  let rejectPrompt = true
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] }
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown> }) {
        calls.push({ sessionID: args.path.id, body: args.body })
        if (rejectPrompt) {
          rejectPrompt = false
          throw new Error("transport failed after prompt invocation")
        }
        return undefined
      },
    },
  }
  const scheduler = new FakeHandlerScheduler()
  const cfg = makeConfig({ subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client,
    scheduler,
    clock: () => 1_000,
    random: () => 0,
  })

  await handler(makeCreatedEvent("ses_dedicated_possibly", { parentID: "root" }))
  await handler(makeErrorEvent("ses_dedicated_possibly", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeIdleEvent("ses_dedicated_possibly"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("ses_dedicated_possibly", { status: 503 }, {
    agent: "orchestrator",
  }))
  await flushHandler()

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})
