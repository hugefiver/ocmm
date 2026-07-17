import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import type { Subagent429Scheduler } from "./subagent-429-controller.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import { createIdleContinuationState, DEFAULT_CONTINUATION_PROMPT } from "./idle-state.ts"

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

test("idle continuation: continues for OpenCode todowrite tool-invocation todos", async () => {
  const calls: PromptCall[] = []
  const client: OcmmClient = {
    session: {
      async abort() { return undefined },
      async messages() {
        return {
          data: [
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-invocation",
                  toolInvocation: {
                    state: "result",
                    toolName: "todowrite",
                    args: { todos: [{ content: "continue", status: "pending" }] },
                    result: "ok",
                  },
                },
              ],
            },
          ],
        }
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown> }) {
        calls.push({ sessionID: args.path.id, body: args.body })
        return undefined
      },
    },
  }
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })

  await handler(makeIdleEvent("ses_1"))

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.sessionID, "ses_1")
  assert.deepEqual(calls[0]?.body.parts, [{ type: "text", text: DEFAULT_CONTINUATION_PROMPT }])
  assert.equal(idleState.sessionData.get("ses_1")?.continuationCount, 1)
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

type ScheduledHandlerTask = {
  delayMs: number
  run: () => Promise<void>
  cancelled: boolean
}

class FakeHandlerScheduler implements Subagent429Scheduler {
  readonly tasks: ScheduledHandlerTask[] = []

  schedule(delayMs: number, run: () => Promise<void>): () => void {
    const task: ScheduledHandlerTask = { delayMs, run, cancelled: false }
    this.tasks.push(task)
    return () => { task.cancelled = true }
  }

  async run(index: number): Promise<void> {
    const task = this.tasks[index]
    assert.ok(task, `missing scheduled task ${index}`)
    if (!task.cancelled) await task.run()
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushHandler(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await Promise.resolve()
}

function makeHandlerConfig(
  chain: Array<{ providers: string[]; model: string; variant?: "low" | "medium" | "high" }>,
  runtimeFallback: Record<string, unknown> = {},
  requirementOptions: Record<string, unknown> = {},
) {
  return OcmmConfigSchema.parse({
    agents: { worker: { requirement: { fallbackChain: chain, ...requirementOptions } } },
    runtimeFallback,
  })
}

function standardHandlerChain() {
  return [
    { providers: ["provider-a"], model: "primary", variant: "high" as const },
    { providers: ["provider-b"], model: "fallback-a", variant: "medium" as const },
    { providers: ["provider-c"], model: "fallback-b", variant: "low" as const },
  ]
}

function makeControlledClient(promptResults: Array<Promise<unknown>> = []) {
  const calls: PromptCall[] = []
  let aborts = 0
  let messagesResp: unknown = {
    messages: [{ role: "user", parts: [{ type: "text", text: "retry this" }] }],
  }
  const client: OcmmClient = {
    session: {
      async abort() { aborts++ },
      async messages() { return messagesResp },
      async prompt(args: { path: { id: string }; body: Record<string, unknown>; query?: { directory?: string } }) {
        calls.push({ sessionID: args.path.id, body: args.body })
        return promptResults.shift() ?? Promise.resolve()
      },
    },
  }
  return {
    client,
    calls,
    get aborts() { return aborts },
    setMessages(response: unknown) { messagesResp = response },
  }
}

function makeCreatedEvent(sessionID: string, parent: Record<string, string> = {}) {
  return { event: { type: "session.created", properties: { sessionID, ...parent } } }
}

function modelFor(modelID: string, providerID = "provider-a") {
  return { providerID, modelID }
}

function dispatchedModels(calls: PromptCall[]): string[] {
  return calls
    .filter((call) => typeof call.body.modelID === "string")
    .map((call) => `${call.body.providerID as string}/${call.body.modelID as string}`)
}

test("real event handler: all parent fields create child retries while a root 429 falls through to generic fallback", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: mock.client,
    scheduler,
    clock: () => 1_000,
    random: () => 0,
  })

  await handler(makeCreatedEvent("child-parent-id", { parentID: "root" }))
  await handler(makeErrorEvent("child-parent-id", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeCreatedEvent("child-parent-id-lower", { parentId: "root" }))
  await handler(makeErrorEvent("child-parent-id-lower", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeCreatedEvent("child-parent-session-id", { parentSessionID: "root" }))
  await handler(makeErrorEvent("child-parent-session-id", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeCreatedEvent("child-parent-session-id-lower", { parentSessionId: "root" }))
  await handler(makeErrorEvent("child-parent-session-id-lower", { status: 429 }, { agent: "worker", model: modelFor("primary") }))

  assert.equal(scheduler.tasks.length, 4)
  await handler(makeIdleEvent("child-parent-id"))
  await handler(makeIdleEvent("child-parent-id-lower"))
  await handler(makeIdleEvent("child-parent-session-id"))
  await handler(makeIdleEvent("child-parent-session-id-lower"))
  await scheduler.run(0)
  await scheduler.run(1)
  await scheduler.run(2)
  await scheduler.run(3)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), [
    "provider-a/primary",
    "provider-a/primary",
    "provider-a/primary",
    "provider-a/primary",
  ])
  assert.equal(mock.aborts, 0, "dedicated retries must not abort before dispatch")

  await handler(makeCreatedEvent("root"))
  await handler(makeErrorEvent("root", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(scheduler.tasks.length, 4, "a root session is not controller-tracked")
  assert.deepEqual(dispatchedModels(mock.calls).at(-1), "provider-b/fallback-a")
  assert.equal(mock.aborts, 1, "root fallback keeps generic abort behavior")
})

test("real event handler: the retry gate needs both timer and error idle, and a known retry idle does not cancel dispatch", async () => {
  const firstPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([firstPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("timer-first", { parentID: "root" }))
  await handler(makeErrorEvent("timer-first", { status: 429, retryAfterMs: 100 }, { agent: "worker", model: modelFor("primary") }))
  await scheduler.run(0)
  await flushHandler()
  assert.equal(mock.calls.length, 0, "timer alone may not start a retry")
  await handler(makeIdleEvent("timer-first"))
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-a/primary"])
  await handler(makeIdleEvent("timer-first"))
  assert.equal(mock.calls.length, 1, "idle while the known retry is active must not cancel or duplicate it")
  firstPrompt.resolve(undefined)
  await flushHandler()

  const idleFirstPrompt = deferred<unknown>()
  const idleFirstScheduler = new FakeHandlerScheduler()
  const idleFirstMock = makeControlledClient([idleFirstPrompt.promise])
  const idleFirstHandler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: idleFirstMock.client,
    scheduler: idleFirstScheduler,
    clock: () => 1_000,
    random: () => 0,
  })
  await idleFirstHandler(makeCreatedEvent("idle-first", { parentID: "root" }))
  await idleFirstHandler(makeErrorEvent("idle-first", { status: 429, retryAfterMs: 100 }, { agent: "worker", model: modelFor("primary") }))
  await idleFirstHandler(makeIdleEvent("idle-first"))
  assert.equal(idleFirstMock.calls.length, 0, "idle alone may not start a retry")
  await idleFirstScheduler.run(0)
  await idleFirstScheduler.run(0)
  await flushHandler()
  assert.equal(idleFirstMock.calls.length, 1, "both gate orders dispatch exactly once")
  idleFirstPrompt.resolve(undefined)
  await flushHandler()
})

test("real event handler: an initial successful child idle clears dedicated tracking and a later 429 is generic", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000 })

  await handler(makeCreatedEvent("single-success", { parentID: "root" }))
  await handler(makeIdleEvent("single-success"))
  await handler(makeErrorEvent("single-success", { status: 429 }, { agent: "worker", model: modelFor("primary") }))

  assert.equal(scheduler.tasks.length, 0)
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a"])
})

test("real event handler: five long recovery probes retain the real deadline and then switch", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("long-hint", { parentID: "root" }))
  await handler(makeErrorEvent("long-hint", { status: 429, retryAfterMs: 600_001 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("long-hint"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("long-hint", { status: 429, retryAfterMs: 600_001 }, { agent: "worker" }))
  await handler(makeIdleEvent("long-hint"))
  await scheduler.run(1)
  await flushHandler()
  await handler(makeErrorEvent("long-hint", { status: 429, retryAfterMs: 600_001 }, { agent: "worker" }))
  await handler(makeIdleEvent("long-hint"))
  await scheduler.run(2)
  await flushHandler()
  await handler(makeErrorEvent("long-hint", { status: 429, retryAfterMs: 600_001 }, { agent: "worker" }))
  await handler(makeIdleEvent("long-hint"))
  await scheduler.run(3)
  await flushHandler()
  await handler(makeErrorEvent("long-hint", { status: 429, retryAfterMs: 600_001 }, { agent: "worker" }))
  await handler(makeIdleEvent("long-hint"))
  await scheduler.run(4)
  await flushHandler()

  assert.deepEqual(scheduler.tasks.slice(0, 5).map((task) => task.delayMs), [0, 0, 0, 0, 0])
  assert.deepEqual(dispatchedModels(mock.calls), Array(5).fill("provider-a/primary"))

  await handler(makeErrorEvent("long-hint", { status: 429, retryAfterMs: 600_001 }, { agent: "worker" }))
  await handler(makeIdleEvent("long-hint"))
  assert.equal(scheduler.tasks[5]?.delayMs, 0)
  await scheduler.run(5)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls).at(-1), "provider-b/fallback-a")
})

test("real event handler: bounded recovery uses its complete delay and maxRetries zero switches behind the idle barrier", async () => {
  const boundedScheduler = new FakeHandlerScheduler()
  const boundedMock = makeControlledClient()
  const boundedCfg = makeHandlerConfig(standardHandlerChain())
  const bounded = createRuntimeFallbackEventHandler({ getConfig: () => boundedCfg, client: boundedMock.client, scheduler: boundedScheduler, clock: () => 1_000 })
  await bounded(makeCreatedEvent("bounded", { parentID: "root" }))
  await bounded(makeErrorEvent("bounded", { status: 429, retryAfterMs: 600_000 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(boundedScheduler.tasks[0]?.delayMs, 600_000)

  const switchScheduler = new FakeHandlerScheduler()
  const switchMock = makeControlledClient()
  const switchCfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const switchHandler = createRuntimeFallbackEventHandler({ getConfig: () => switchCfg, client: switchMock.client, scheduler: switchScheduler, clock: () => 1_000 })
  await switchHandler(makeCreatedEvent("immediate-switch", { parentID: "root" }))
  await switchHandler(makeErrorEvent("immediate-switch", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(switchScheduler.tasks[0]?.delayMs, 0)
  await switchScheduler.run(0)
  await flushHandler()
  assert.equal(switchMock.calls.length, 0, "even a zero-delay switch waits for error-owned idle")
  await switchHandler(makeIdleEvent("immediate-switch"))
  await flushHandler()
  assert.deepEqual(dispatchedModels(switchMock.calls), ["provider-b/fallback-a"])
})

test("real event handler: a one-entry chain retries the same model, then stops without a generic candidate", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig([{ providers: ["provider-a"], model: "only" }], { subagent429: { maxRetries: 1 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("one-entry", { parentID: "root" }))
  await handler(makeErrorEvent("one-entry", { status: 429 }, { agent: "worker", model: modelFor("only") }))
  await handler(makeIdleEvent("one-entry"))
  await scheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-a/only"])

  await handler(makeErrorEvent("one-entry", { status: 429 }, { agent: "worker" }))
  await handler(makeIdleEvent("one-entry"))
  assert.equal(scheduler.tasks.length, 1)
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-a/only"])
})

test("real event handler: switched models get a fresh dedicated budget and only switches consume generic attempts", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain(), { maxAttempts: 1, subagent429: { maxRetries: 1 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("fresh-budget", { parentID: "root" }))
  await handler(makeErrorEvent("fresh-budget", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("fresh-budget"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("fresh-budget", { status: 429 }, { agent: "worker" }))
  await handler(makeIdleEvent("fresh-budget"))
  await scheduler.run(1)
  await flushHandler()
  await handler(makeErrorEvent("fresh-budget", { status: 429 }, { agent: "worker" }))
  await handler(makeIdleEvent("fresh-budget"))
  await scheduler.run(2)
  await flushHandler()

  assert.deepEqual(dispatchedModels(mock.calls), [
    "provider-a/primary",
    "provider-b/fallback-a",
    "provider-b/fallback-a",
  ])
})

test("real event handler: model scope allows a same-provider switch while provider scope skips it", async () => {
  const chain = [
    { providers: ["provider-a"], model: "primary" },
    { providers: ["provider-a"], model: "same-provider" },
    { providers: ["provider-b"], model: "other-provider" },
  ]
  const modelScheduler = new FakeHandlerScheduler()
  const modelMock = makeControlledClient()
  const modelCfg = makeHandlerConfig(chain, { subagent429: { maxRetries: 0 } })
  const modelHandler = createRuntimeFallbackEventHandler({ getConfig: () => modelCfg, client: modelMock.client, scheduler: modelScheduler, clock: () => 1_000 })
  await modelHandler(makeCreatedEvent("model-scope", { parentID: "root" }))
  await modelHandler(makeErrorEvent("model-scope", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await modelHandler(makeIdleEvent("model-scope"))
  await modelScheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(modelMock.calls), ["provider-a/same-provider"])

  const providerScheduler = new FakeHandlerScheduler()
  const providerMock = makeControlledClient()
  const providerCfg = makeHandlerConfig(chain, { subagent429: { maxRetries: 0, providerScopes: { "provider-a": "provider" } } })
  const providerHandler = createRuntimeFallbackEventHandler({ getConfig: () => providerCfg, client: providerMock.client, scheduler: providerScheduler, clock: () => 1_000 })
  await providerHandler(makeCreatedEvent("provider-scope", { parentID: "root" }))
  await providerHandler(makeErrorEvent("provider-scope", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await providerHandler(makeIdleEvent("provider-scope"))
  await providerScheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(providerMock.calls), ["provider-b/other-provider"])
})

test("real event handler: a secondary provider retry stays on the actual provider and preserves entry metadata", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig([
    { providers: ["provider-a", "provider-secondary"], model: "shared-model", variant: "high" },
    { providers: ["provider-b"], model: "fallback" },
  ])
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("secondary-provider", { parentID: "root" }))
  await handler(makeErrorEvent("secondary-provider", { status: 429 }, {
    agent: "worker",
    model: modelFor("shared-model", "provider-secondary"),
  }))
  await handler(makeIdleEvent("secondary-provider"))
  await scheduler.run(0)
  await flushHandler()

  assert.deepEqual(dispatchedModels(mock.calls), ["provider-secondary/shared-model"])
  assert.equal(mock.calls[0]?.body.variant, "high")
  assert.equal(mock.aborts, 0)
})

test("real event handler: an active 429 outcome with a successful first dispatch uses the active target and commits once", async () => {
  const firstPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([firstPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("queued-429-success", { parentID: "root" }))
  await handler(makeErrorEvent("queued-429-success", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("queued-429-success"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("queued-429-success", { status: 429 }, { agent: "worker" }))
  await handler(makeIdleEvent("queued-429-success"))
  firstPrompt.resolve(undefined)
  await flushHandler()

  assert.equal(scheduler.tasks.length, 2, "the queued outcome produces exactly one next gate")
  await scheduler.run(1)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])
  assert.equal(mock.aborts, 0)
})

test("real event handler: an active 429 outcome after a failed first dispatch still commits the proven switch once", async () => {
  const firstPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([firstPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("queued-429-failure", { parentID: "root" }))
  await handler(makeErrorEvent("queued-429-failure", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("queued-429-failure"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("queued-429-failure", { status: 429 }, { agent: "worker" }))
  await handler(makeIdleEvent("queued-429-failure"))
  firstPrompt.reject(new Error("first dispatch failed"))
  await flushHandler()

  assert.equal(scheduler.tasks.length, 2)
  await scheduler.run(1)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])
  assert.equal(mock.aborts, 0)
})

test("real event handler: active non-429 after a successful dispatch hands off generic fallback exactly once using the active target", async () => {
  const firstPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([firstPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("queued-other-success", { parentID: "root" }))
  await handler(makeErrorEvent("queued-other-success", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("queued-other-success"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("queued-other-success", { status: 503 }, { agent: "worker" }))
  firstPrompt.resolve(undefined)
  await flushHandler()
  await flushHandler()

  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])
  assert.equal(mock.aborts, 1, "the deferred generic handoff keeps default abort behavior")
})

test("real event handler: active non-429 after a failed dispatch hands off generic fallback exactly once", async () => {
  const firstPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([firstPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("queued-other-failure", { parentID: "root" }))
  await handler(makeErrorEvent("queued-other-failure", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("queued-other-failure"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("queued-other-failure", { status: 503 }, { agent: "worker" }))
  firstPrompt.reject(new Error("first dispatch failed"))
  await flushHandler()
  await flushHandler()

  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])
  assert.equal(mock.aborts, 1)
})

test("real event handler: non-429 during a waiting gate falls back immediately and delete/recreate prevents stale handoff", async () => {
  const waitingScheduler = new FakeHandlerScheduler()
  const waitingMock = makeControlledClient()
  const waitingCfg = makeHandlerConfig(standardHandlerChain())
  const waiting = createRuntimeFallbackEventHandler({ getConfig: () => waitingCfg, client: waitingMock.client, scheduler: waitingScheduler, clock: () => 1_000, random: () => 0 })
  await waiting(makeCreatedEvent("waiting-other", { parentID: "root" }))
  await waiting(makeErrorEvent("waiting-other", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await waiting(makeErrorEvent("waiting-other", { status: 503 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(waitingScheduler.tasks[0]?.cancelled, true)
  assert.deepEqual(dispatchedModels(waitingMock.calls), ["provider-b/fallback-a"])
  assert.equal(waitingMock.aborts, 1)

  const stalePrompt = deferred<unknown>()
  const staleScheduler = new FakeHandlerScheduler()
  const staleMock = makeControlledClient([stalePrompt.promise])
  const staleCfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const stale = createRuntimeFallbackEventHandler({ getConfig: () => staleCfg, client: staleMock.client, scheduler: staleScheduler, clock: () => 1_000 })
  await stale(makeCreatedEvent("stale-handoff", { parentID: "root" }))
  await stale(makeErrorEvent("stale-handoff", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await stale(makeIdleEvent("stale-handoff"))
  await staleScheduler.run(0)
  await flushHandler()
  await stale(makeErrorEvent("stale-handoff", { status: 503 }, { agent: "worker" }))
  await stale({ event: { type: "session.deleted", properties: { sessionID: "stale-handoff" } } })
  await stale(makeCreatedEvent("stale-handoff", { parentID: "new-root" }))
  stalePrompt.resolve(undefined)
  await flushHandler()
  await flushHandler()
  assert.deepEqual(dispatchedModels(staleMock.calls), ["provider-b/fallback-a"])
})

test("real event handler: the first active provider outcome wins whether it is 429 or another error", async () => {
  const otherFirst = deferred<unknown>()
  const otherScheduler = new FakeHandlerScheduler()
  const otherMock = makeControlledClient([otherFirst.promise])
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const otherHandler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: otherMock.client, scheduler: otherScheduler, clock: () => 1_000 })
  await otherHandler(makeCreatedEvent("other-first", { parentID: "root" }))
  await otherHandler(makeErrorEvent("other-first", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await otherHandler(makeIdleEvent("other-first"))
  await otherScheduler.run(0)
  await flushHandler()
  await otherHandler(makeErrorEvent("other-first", { status: 503 }, { agent: "worker" }))
  await otherHandler(makeErrorEvent("other-first", { status: 429 }, { agent: "worker" }))
  otherFirst.resolve(undefined)
  await flushHandler()
  await flushHandler()
  assert.deepEqual(dispatchedModels(otherMock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])
  assert.equal(otherMock.aborts, 1)

  const rateFirst = deferred<unknown>()
  const rateScheduler = new FakeHandlerScheduler()
  const rateMock = makeControlledClient([rateFirst.promise])
  const rateHandler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: rateMock.client, scheduler: rateScheduler, clock: () => 1_000 })
  await rateHandler(makeCreatedEvent("rate-first", { parentID: "root" }))
  await rateHandler(makeErrorEvent("rate-first", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await rateHandler(makeIdleEvent("rate-first"))
  await rateScheduler.run(0)
  await flushHandler()
  await rateHandler(makeErrorEvent("rate-first", { status: 429 }, { agent: "worker" }))
  await rateHandler(makeErrorEvent("rate-first", { status: 503 }, { agent: "worker" }))
  await rateHandler(makeIdleEvent("rate-first"))
  rateFirst.resolve(undefined)
  await flushHandler()
  await rateScheduler.run(1)
  await flushHandler()
  assert.deepEqual(dispatchedModels(rateMock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])
  assert.equal(rateMock.aborts, 0)
})

test("real event handler: a child non-429 or initial idle consumes dedicated tracking so later 429 is generic", async () => {
  const non429Scheduler = new FakeHandlerScheduler()
  const non429Mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const non429 = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: non429Mock.client, scheduler: non429Scheduler, clock: () => 1_000 })
  await non429(makeCreatedEvent("non429-first", { parentID: "root" }))
  await non429(makeErrorEvent("non429-first", { status: 503 }, { agent: "worker", model: modelFor("primary") }))
  await non429(makeErrorEvent("non429-first", { status: 429 }, { agent: "worker", model: modelFor("fallback-a", "provider-b") }))
  assert.equal(non429Scheduler.tasks.length, 0)
  assert.deepEqual(dispatchedModels(non429Mock.calls), ["provider-b/fallback-a", "provider-c/fallback-b"])

  const idleScheduler = new FakeHandlerScheduler()
  const idleMock = makeControlledClient()
  const afterIdle = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: idleMock.client, scheduler: idleScheduler, clock: () => 1_000 })
  await afterIdle(makeCreatedEvent("idle-first-generic", { parentID: "root" }))
  await afterIdle(makeIdleEvent("idle-first-generic"))
  await afterIdle(makeErrorEvent("idle-first-generic", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(idleScheduler.tasks.length, 0)
  assert.deepEqual(dispatchedModels(idleMock.calls), ["provider-b/fallback-a"])
})

test("real event handler: regex-only errors and disabled subagent 429 use generic fallback, while dispatch false creates no work", async () => {
  const regexScheduler = new FakeHandlerScheduler()
  const regexMock = makeControlledClient()
  const regexCfg = makeHandlerConfig(standardHandlerChain(), { retryOnStatusCodes: [], retryOnPatterns: ["custom transient"] })
  const regex = createRuntimeFallbackEventHandler({ getConfig: () => regexCfg, client: regexMock.client, scheduler: regexScheduler, clock: () => 1_000 })
  await regex(makeErrorEvent("regex-only", { message: "custom transient condition" }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(regexScheduler.tasks.length, 0)
  assert.deepEqual(dispatchedModels(regexMock.calls), ["provider-b/fallback-a"])

  const disabledScheduler = new FakeHandlerScheduler()
  const disabledMock = makeControlledClient()
  const disabledCfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { enabled: false } })
  const disabled = createRuntimeFallbackEventHandler({ getConfig: () => disabledCfg, client: disabledMock.client, scheduler: disabledScheduler, clock: () => 1_000 })
  await disabled(makeCreatedEvent("disabled-subagent", { parentID: "root" }))
  await disabled(makeErrorEvent("disabled-subagent", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(disabledScheduler.tasks.length, 0)
  assert.deepEqual(dispatchedModels(disabledMock.calls), ["provider-b/fallback-a"])

  const observeScheduler = new FakeHandlerScheduler()
  const observeMock = makeControlledClient()
  const observeCfg = makeHandlerConfig(standardHandlerChain(), { dispatch: false })
  const observe = createRuntimeFallbackEventHandler({ getConfig: () => observeCfg, client: observeMock.client, scheduler: observeScheduler, clock: () => 1_000 })
  await observe(makeCreatedEvent("observe-only", { parentID: "root" }))
  await observe(makeErrorEvent("observe-only", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(observeScheduler.tasks.length, 0)
  assert.equal(observeMock.calls.length, 0)
})

test("real event handler: failed same-model and switch dispatches stop without retry loops", async () => {
  const samePrompt = deferred<unknown>()
  const sameScheduler = new FakeHandlerScheduler()
  const sameMock = makeControlledClient([samePrompt.promise])
  const sameCfg = makeHandlerConfig([{ providers: ["provider-a"], model: "only" }])
  const same = createRuntimeFallbackEventHandler({ getConfig: () => sameCfg, client: sameMock.client, scheduler: sameScheduler, clock: () => 1_000, random: () => 0 })
  await same(makeCreatedEvent("same-failure", { parentID: "root" }))
  await same(makeErrorEvent("same-failure", { status: 429 }, { agent: "worker", model: modelFor("only") }))
  await same(makeIdleEvent("same-failure"))
  await sameScheduler.run(0)
  await flushHandler()
  samePrompt.reject(new Error("same model rejected"))
  await flushHandler()
  assert.equal(sameScheduler.tasks.length, 1)
  assert.deepEqual(dispatchedModels(sameMock.calls), ["provider-a/only"])

  const switchPrompt = deferred<unknown>()
  const switchScheduler = new FakeHandlerScheduler()
  const switchMock = makeControlledClient([switchPrompt.promise])
  const switchCfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const switched = createRuntimeFallbackEventHandler({ getConfig: () => switchCfg, client: switchMock.client, scheduler: switchScheduler, clock: () => 1_000 })
  await switched(makeCreatedEvent("switch-failure", { parentID: "root" }))
  await switched(makeErrorEvent("switch-failure", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await switched(makeIdleEvent("switch-failure"))
  await switchScheduler.run(0)
  await flushHandler()
  switchPrompt.reject(new Error("fallback rejected"))
  await flushHandler()
  assert.equal(switchScheduler.tasks.length, 1)
  assert.deepEqual(dispatchedModels(switchMock.calls), ["provider-b/fallback-a"])
})

test("real event handler: idle continuation is suppressed only while dedicated work is waiting, active, or queued", async () => {
  const todoMessages = {
    data: [{
      role: "assistant",
      parts: [{
        type: "tool-invocation",
        toolInvocation: {
          state: "result",
          toolName: "todowrite",
          args: { todos: [{ content: "continue", status: "pending" }] },
        },
      }],
    }],
  }
  const cfg = makeHandlerConfig(standardHandlerChain())

  const waitingScheduler = new FakeHandlerScheduler()
  const waitingMock = makeControlledClient()
  const waitingIdle = createIdleContinuationState()
  waitingIdle.globalEnabled = true
  waitingMock.setMessages(todoMessages)
  const waiting = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: waitingMock.client, scheduler: waitingScheduler, idleState: waitingIdle, clock: () => 1_000 })
  await waiting(makeCreatedEvent("idle-waiting", { parentID: "root" }))
  await waiting(makeErrorEvent("idle-waiting", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await waiting(makeIdleEvent("idle-waiting"))
  assert.equal(waitingMock.calls.length, 0, "a pending dedicated retry suppresses continuation")
  await waiting({ event: { type: "session.deleted", properties: { sessionID: "idle-waiting" } } })

  const activePrompt = deferred<unknown>()
  const activeScheduler = new FakeHandlerScheduler()
  const activeMock = makeControlledClient([activePrompt.promise])
  const activeIdle = createIdleContinuationState()
  activeIdle.globalEnabled = true
  const active = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: activeMock.client, scheduler: activeScheduler, idleState: activeIdle, clock: () => 1_000, random: () => 0 })
  await active(makeCreatedEvent("idle-active", { parentID: "root" }))
  await active(makeErrorEvent("idle-active", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await active(makeIdleEvent("idle-active"))
  await activeScheduler.run(0)
  await flushHandler()
  activeMock.setMessages(todoMessages)
  await active(makeIdleEvent("idle-active"))
  assert.equal(activeMock.calls.length, 1, "an active dedicated dispatch suppresses continuation")
  activePrompt.resolve(undefined)
  await flushHandler()
  await active(makeIdleEvent("idle-active"))
  assert.equal(activeMock.calls.length, 2, "a completed retry restores the original continuation")
  assert.equal(activeMock.calls[1]?.body.modelID, undefined)

  const queuedPrompt = deferred<unknown>()
  const queuedScheduler = new FakeHandlerScheduler()
  const queuedMock = makeControlledClient([queuedPrompt.promise])
  const queuedIdle = createIdleContinuationState()
  queuedIdle.globalEnabled = true
  const queued = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: queuedMock.client, scheduler: queuedScheduler, idleState: queuedIdle, clock: () => 1_000, random: () => 0 })
  await queued(makeCreatedEvent("idle-queued", { parentID: "root" }))
  await queued(makeErrorEvent("idle-queued", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await queued(makeIdleEvent("idle-queued"))
  await queuedScheduler.run(0)
  await flushHandler()
  queuedMock.setMessages(todoMessages)
  await queued(makeErrorEvent("idle-queued", { status: 429 }, { agent: "worker" }))
  await queued(makeIdleEvent("idle-queued"))
  assert.equal(queuedMock.calls.length, 1, "a queued dedicated outcome suppresses continuation")
  queuedPrompt.resolve(undefined)
  await flushHandler()
  await queued({ event: { type: "session.deleted", properties: { sessionID: "idle-queued" } } })

  const genericScheduler = new FakeHandlerScheduler()
  const genericMock = makeControlledClient()
  const genericIdle = createIdleContinuationState()
  genericIdle.globalEnabled = true
  const generic = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: genericMock.client, scheduler: genericScheduler, idleState: genericIdle, clock: () => 1_000 })
  await generic(makeCreatedEvent("idle-generic", { parentID: "root" }))
  await generic(makeErrorEvent("idle-generic", { status: 503 }, { agent: "worker", model: modelFor("primary") }))
  genericMock.setMessages(todoMessages)
  await generic(makeIdleEvent("idle-generic"))
  assert.equal(genericMock.calls.length, 2, "generic fallback keeps the original idle continuation")
  assert.equal(genericMock.calls[1]?.body.modelID, undefined)
})

test("real event handler: non-retryable errors do not seed fallback state for a later model-less retry", async () => {
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, clock: () => 1_000 })

  await handler(makeErrorEvent("nonretryable-state", { status: 404 }, {
    agent: "worker",
    model: modelFor("fallback-a", "provider-b"),
  }))
  await handler(makeErrorEvent("nonretryable-state", { status: 503 }, { agent: "worker" }))

  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a"])
})

test("real event handler: requirement-level variants carry through same-model retries and switches", async () => {
  const chain = [
    { providers: ["provider-a"], model: "primary" },
    { providers: ["provider-b"], model: "fallback" },
  ]
  const retryScheduler = new FakeHandlerScheduler()
  const retryMock = makeControlledClient()
  const retryCfg = makeHandlerConfig(chain, {}, { variant: "high" })
  const retry = createRuntimeFallbackEventHandler({ getConfig: () => retryCfg, client: retryMock.client, scheduler: retryScheduler, clock: () => 1_000, random: () => 0 })
  await retry(makeCreatedEvent("requirement-variant-retry", { parentID: "root" }))
  await retry(makeErrorEvent("requirement-variant-retry", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await retry(makeIdleEvent("requirement-variant-retry"))
  await retryScheduler.run(0)
  await flushHandler()
  assert.equal(retryMock.calls[0]?.body.variant, "high")

  const switchScheduler = new FakeHandlerScheduler()
  const switchMock = makeControlledClient()
  const switchCfg = makeHandlerConfig(chain, { subagent429: { maxRetries: 0 } }, { variant: "high" })
  const switched = createRuntimeFallbackEventHandler({ getConfig: () => switchCfg, client: switchMock.client, scheduler: switchScheduler, clock: () => 1_000 })
  await switched(makeCreatedEvent("requirement-variant-switch", { parentID: "root" }))
  await switched(makeErrorEvent("requirement-variant-switch", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await switched(makeIdleEvent("requirement-variant-switch"))
  await switchScheduler.run(0)
  await flushHandler()
  assert.equal(switchMock.calls[0]?.body.variant, "high")

  const unmatchedScheduler = new FakeHandlerScheduler()
  const unmatchedMock = makeControlledClient()
  const unmatched = createRuntimeFallbackEventHandler({ getConfig: () => retryCfg, client: unmatchedMock.client, scheduler: unmatchedScheduler, clock: () => 1_000, random: () => 0 })
  await unmatched(makeCreatedEvent("requirement-variant-unmatched", { parentID: "root" }))
  await unmatched(makeErrorEvent("requirement-variant-unmatched", { status: 429 }, { agent: "worker", model: modelFor("outside-chain") }))
  await unmatched(makeIdleEvent("requirement-variant-unmatched"))
  await unmatchedScheduler.run(0)
  await flushHandler()
  assert.equal(unmatchedMock.calls[0]?.body.variant, "high")

  const genericMock = makeControlledClient()
  const generic = createRuntimeFallbackEventHandler({ getConfig: () => retryCfg, client: genericMock.client, clock: () => 1_000 })
  await generic(makeErrorEvent("requirement-variant-generic", { status: 503 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(genericMock.calls[0]?.body.variant, "high")
})

test("real event handler: delete/recreate cancels a generic handoff in abort without blocking the replacement lifecycle", async () => {
  const dedicatedPrompt = deferred<unknown>()
  const genericAbort = deferred<unknown>()
  const calls: PromptCall[] = []
  let abortCalls = 0
  const client: OcmmClient = {
    session: {
      async abort() {
        abortCalls++
        return genericAbort.promise
      },
      async messages() {
        return { messages: [{ role: "user", parts: [{ type: "text", text: "retry" }] }] }
      },
      async prompt(args: { path: { id: string }; body: Record<string, unknown> }) {
        calls.push({ sessionID: args.path.id, body: args.body })
        if (calls.length === 1) return dedicatedPrompt.promise
        return undefined
      },
    },
  }
  const scheduler = new FakeHandlerScheduler()
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, scheduler, clock: () => 1_000 })

  await handler(makeCreatedEvent("started-handoff", { parentID: "root" }))
  await handler(makeErrorEvent("started-handoff", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("started-handoff"))
  await scheduler.run(0)
  await flushHandler()
  await handler(makeErrorEvent("started-handoff", { status: 503 }, { agent: "worker" }))
  dedicatedPrompt.resolve(undefined)
  await flushHandler()
  assert.equal(abortCalls, 1, "generic handoff has started and is blocked in abort")

  await handler({ event: { type: "session.deleted", properties: { sessionID: "started-handoff" } } })
  await handler(makeCreatedEvent("started-handoff", { parentID: "new-root" }))
  await handler(makeErrorEvent("started-handoff", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("started-handoff"))
  await scheduler.run(1)
  await flushHandler()
  await flushHandler()
  assert.deepEqual(dispatchedModels(calls), ["provider-b/fallback-a", "provider-b/fallback-a"])

  genericAbort.resolve(undefined)
  await flushHandler()
  await flushHandler()
  assert.deepEqual(dispatchedModels(calls), ["provider-b/fallback-a", "provider-b/fallback-a"])
})

test("real event handler: deleting one child does not cancel another child's pending retry gate", async () => {
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler, clock: () => 1_000, random: () => 0 })

  await handler(makeCreatedEvent("child-a", { parentID: "root" }))
  await handler(makeCreatedEvent("child-b", { parentID: "root" }))
  await handler(makeErrorEvent("child-a", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeErrorEvent("child-b", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  assert.equal(scheduler.tasks.length, 2)

  await handler({ event: { type: "session.deleted", properties: { sessionID: "child-a" } } })
  assert.equal(scheduler.tasks[0]?.cancelled, true)
  assert.equal(scheduler.tasks[1]?.cancelled, false)
  await handler(makeIdleEvent("child-b"))
  await scheduler.run(1)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-a/primary"])
})

test("real event handler: single pre-resolution success idle clears dedicated tracking before a later 429", async () => {
  const retryPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([retryPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: mock.client,
    scheduler,
    clock: () => 1_000,
    random: () => 0,
  })

  await handler(makeCreatedEvent("single-pre-resolution-idle", { parentID: "root" }))
  await handler(makeErrorEvent("single-pre-resolution-idle", { status: 429 }, {
    agent: "worker",
    model: modelFor("primary"),
  }))
  await handler(makeIdleEvent("single-pre-resolution-idle"))
  await scheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-a/primary"])

  await handler(makeIdleEvent("single-pre-resolution-idle"))
  const schedulerTaskCount = scheduler.tasks.length
  retryPrompt.resolve(undefined)
  await flushHandler()

  await handler(makeErrorEvent("single-pre-resolution-idle", { status: 429 }, {
    agent: "worker",
    model: modelFor("primary"),
  }))
  assert.equal(scheduler.tasks.length, schedulerTaskCount, "the later 429 must not create a dedicated retry gate")
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-a/primary", "provider-b/fallback-a"])
  assert.equal(mock.aborts, 1, "the later 429 uses generic fallback's default abort")
})
