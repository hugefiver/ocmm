import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import { createIdleContinuationState } from "./idle-state.ts"

type PromptCall = {
  sessionID: string
  body: Record<string, unknown>
  directory?: string
}

function makeMockClient(): { client: OcmmClient; calls: PromptCall[]; messagesResp: unknown } {
  const calls: PromptCall[] = []
  const messagesResp: unknown = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ],
  }
  const client: OcmmClient = {
    session: {
      async abort() {
        return undefined
      },
      async messages() {
        return messagesResp
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown>; query?: { directory?: string } }) {
        calls.push({
          sessionID: args.path.id,
          body: args.body,
          ...(args.query?.directory !== undefined ? { directory: args.query.directory } : {}),
        })
        return undefined
      },
    },
  }
  return { client, calls, messagesResp }
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return OcmmConfigSchema.parse({
    agents: {
      orchestrator: {
        model: "hoo/primary-model",
        fallbackModels: ["hoo/fallback-a", "hoo/fallback-b"],
      },
    },
    runtimeFallback: overrides,
  })
}

function makeErrorEvent(
  sessionID: string,
  error: unknown,
  extras: Record<string, unknown> = {},
) {
  return {
    event: {
      type: "session.error",
      properties: { sessionID, error, ...extras },
    },
  }
}

function makeIdleEvent(sessionID: string) {
  return { event: { type: "session.idle", properties: { sessionID } } }
}

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

test("event without model uses agent's primary model as failed key (not agent name)", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // No model in event props — handler should derive the failed key from the
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
    // No model field — relies on activeModel tracking
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

test("idle continuation: does not continue when disabled", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = false
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  await handler(makeIdleEvent("ses_1"))
  assert.equal(calls.length, 0)
})

test("idle continuation: does not continue when aborted", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  // First: abort error marks the session
  await handler(makeErrorEvent("ses_1", { isAbort: true }, { agent: "orchestrator" }))
  // Then: idle should not continue
  await handler(makeIdleEvent("ses_1"))
  assert.equal(calls.length, 0)
})

test("idle continuation: does not continue when no client", async () => {
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, idleState })
  await handler(makeIdleEvent("ses_1"))
  // Should not throw
})

test("idle continuation: does not continue when maxContinuations reached", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  idleState.sessionData.set("ses_1", { aborted: false, continuationCount: 5 })
  const cfg = makeConfig({ enabled: true })
  const cfgWithMax = { ...cfg, idleContinuation: { ...cfg.idleContinuation, enabled: true, maxContinuations: 5 } }
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfgWithMax, client, idleState })
  await handler(makeIdleEvent("ses_1"))
  assert.equal(calls.length, 0)
})

test("idle continuation: session.deleted clears idle state", async () => {
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  idleState.sessionOverrides.set("ses_1", true)
  idleState.sessionData.set("ses_1", { aborted: false, continuationCount: 2 })
  const cfg = makeConfig({ enabled: true })
  const { client } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  await handler({ event: { type: "session.deleted", properties: { sessionID: "ses_1" } } })
  assert.equal(idleState.sessionOverrides.has("ses_1"), false)
  assert.equal(idleState.sessionData.has("ses_1"), false)
})

test("session.deleted calls injected clearSessionIntent", async () => {
  const { client } = makeMockClient()
  const cfg = makeConfig()
  const cleared: string[] = []
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client,
    clearSessionIntent: (id) => { cleared.push(id) },
  })
  await handler({ event: { type: "session.deleted", properties: { sessionID: "ses_clear" } } })
  assert.deepEqual(cleared, ["ses_clear"])
})

test("session.idle calls injected clearSessionIntent", async () => {
  const { client } = makeMockClient()
  const cfg = makeConfig({ enabled: true })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = false // disabled => handleIdleContinuation is a no-op
  const cleared: string[] = []
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client,
    idleState,
    clearSessionIntent: (id) => { cleared.push(id) },
  })
  await handler(makeIdleEvent("ses_idle"))
  assert.deepEqual(cleared, ["ses_idle"])
})

test("session.idle preserves fallback state for later session.error", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  // First error: primary-model fails -> dispatches fallback-a
  await handler(makeErrorEvent("ses_1", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.body.modelID, "fallback-a")

  // session.idle — must NOT delete fallback state
  await handler(makeIdleEvent("ses_1"))

  // Second error: no model in event — should use activeModel (hoo/fallback-a)
  // as the failed key and advance to fallback-b, NOT restart from primary.
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})

test("failed dispatch does not advance fallback state", async () => {
  // Mock client with messages that yield no user parts — dispatchFallbackRetry
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
