import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import {
  makeMockClient,
  makeConfig,
  makeErrorEvent,
  type PromptCall,
} from "./event-handler-test-fixtures.ts"

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
