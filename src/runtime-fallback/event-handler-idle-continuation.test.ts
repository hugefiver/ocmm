import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import { createIdleContinuationState, DEFAULT_CONTINUATION_PROMPT } from "./idle-state.ts"
import {
  makeMockClient,
  makeConfig,
  makeErrorEvent,
  makeIdleEvent,
  type PromptCall,
} from "./event-handler-test-fixtures.ts"

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

  // session.idle - must NOT delete fallback state
  await handler(makeIdleEvent("ses_1"))

  // Second error: no model in event - should use activeModel (hoo/fallback-a)
  // as the failed key and advance to fallback-b, NOT restart from primary.
  await handler(makeErrorEvent("ses_1", { status: 503 }, { agent: "orchestrator" }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})
