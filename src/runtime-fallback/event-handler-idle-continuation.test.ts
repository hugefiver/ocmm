import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import type { OcmmClient } from "./dispatcher.ts"
import { createIdleContinuationState, DEFAULT_CONTINUATION_PROMPT } from "./idle-state.ts"
import {
  deferred,
  FakeHandlerScheduler,
  makeControlledClient,
  makeCreatedEvent,
  makeMockClient,
  makeConfig,
  makeErrorEvent,
  makeIdleEvent,
  type PromptCall,
} from "./event-handler-test-fixtures.ts"

const unfinishedTodoMessages = {
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

const fallbackUserMessages = {
  data: [{
    role: "user",
    parts: [{ type: "text", text: "retry this" }],
  }],
}

function makeDeletedEvent(sessionID: string) {
  return { event: { type: "session.deleted", properties: { sessionID } } }
}

function continuationCalls(calls: PromptCall[]): PromptCall[] {
  return calls.filter((call) => call.body.modelID === undefined)
}

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

test("idle continuation: stops before reading todos for non-retryable 400 request errors", async () => {
  const mock = makeControlledClient([], { messagesResults: [Promise.resolve(unfinishedTodoMessages)] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_nonretry"

  await handler(makeErrorEvent(sessionID, { status: 400, isRetryable: false }, { agent: "orchestrator" }))
  await handler(makeIdleEvent(sessionID))

  assert.equal(mock.messages, 0)
  assert.equal(continuationCalls(mock.calls).length, 0)
  assert.equal(idleState.sessionData.get(sessionID)?.idleStoppedByNonRetryableRequest, true)
})

test("idle continuation: stops for nested non-retryable 422 request metadata", async () => {
  const mock = makeControlledClient([], { messagesResults: [Promise.resolve(unfinishedTodoMessages)] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_nonretry_nested"

  await handler(makeErrorEvent(sessionID, { status: 422, error: { isRetryable: false } }, { agent: "orchestrator" }))
  await handler(makeIdleEvent(sessionID))

  assert.equal(mock.messages, 0)
  assert.equal(continuationCalls(mock.calls).length, 0)
  assert.equal(idleState.sessionData.get(sessionID)?.idleStoppedByNonRetryableRequest, true)
})

test("idle continuation: disabled runtime fallback still marks non-retryable request errors terminal", async () => {
  const mock = makeControlledClient([], { messagesResults: [Promise.resolve(unfinishedTodoMessages)] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = {
    ...makeConfig({ enabled: false }),
    idleContinuation: { enabled: true, maxContinuations: 20 },
  }
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })

  for (const [sessionID, error] of [
    ["ses_nonretry_fallback_disabled_direct", { status: 400, isRetryable: false }],
    ["ses_nonretry_fallback_disabled_nested", { status: 422, cause: { isRetryable: false } }],
  ] as const) {
    await handler(makeErrorEvent(sessionID, error, { agent: "orchestrator" }))
    await handler(makeIdleEvent(sessionID))
    assert.equal(idleState.sessionData.get(sessionID)?.idleStoppedByNonRetryableRequest, true)
  }

  assert.equal(mock.messages, 0)
  assert.equal(continuationCalls(mock.calls).length, 0)
})

test("idle continuation: non-retryable 404 request errors do not set the stop marker", async () => {
  const mock = makeControlledClient([], { messagesResults: [Promise.resolve(unfinishedTodoMessages)] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_nonretry_404"

  await handler(makeErrorEvent(sessionID, { status: 404, isRetryable: false }, { agent: "orchestrator" }))
  await handler(makeIdleEvent(sessionID))

  assert.equal(mock.messages, 1)
  assert.equal(continuationCalls(mock.calls).length, 1)
  assert.notEqual(idleState.sessionData.get(sessionID)?.idleStoppedByNonRetryableRequest, true)
})

test("idle continuation: retryable 400 request errors do not set the stop marker", async () => {
  const { client } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true, dispatch: false })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  const sessionID = "ses_retryable_400"

  await handler(makeErrorEvent(sessionID, { status: 400, message: "rate limit", isRetryable: false }, { agent: "orchestrator" }))

  assert.notEqual(idleState.sessionData.get(sessionID)?.idleStoppedByNonRetryableRequest, true)
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
  const cfg = makeConfig({ enabled: true })
  const cfgWithMax = { ...cfg, idleContinuation: { ...cfg.idleContinuation, enabled: true, maxContinuations: 5 } }
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfgWithMax, client, idleState })
  await handler(makeCreatedEvent("ses_1"))
  idleState.sessionData.set("ses_1", { aborted: false, continuationCount: 5 })

  await handler(makeIdleEvent("ses_1"))

  assert.equal(calls.length, 0)
  assert.equal(idleState.sessionData.has("ses_1"), false)
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

test("idle continuation: completed background child without unfinished todos emits no prompt", async () => {
  const childSessionID = "ses_background_child"
  const parentSessionID = "ses_background_parent"
  const completedChildMessages = {
    data: [{
      role: "assistant",
      parts: [{
        type: "text",
        text: "Inspection complete.",
      }],
    }],
  }
  const mock = makeControlledClient([], {
    messagesResults: [Promise.resolve(completedChildMessages)],
  })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => makeConfig({ enabled: true }),
    client: mock.client,
    idleState,
  })

  await handler(makeCreatedEvent(childSessionID, { parentID: parentSessionID }))
  await handler(makeIdleEvent(childSessionID))

  assert.equal(mock.messages, 1)
  assert.equal(continuationCalls(mock.calls).length, 0)
  assert.equal(idleState.sessionData.has(childSessionID), false)
  assert.equal(idleState.activeLeases.has(childSessionID), false)
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
  assert.equal(idleState.sessionLifecycleKinds.get("ses_1"), "deleted")
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

test("idle continuation: overlapping idle and duplicate active create share one lease", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_overlap"
  await handler(makeCreatedEvent(sessionID))
  idleState.sessionOverrides.set(sessionID, true)
  const data = { aborted: false, continuationCount: 3 }
  idleState.sessionData.set(sessionID, data)
  const generation = idleState.sessionGenerations.get(sessionID)

  const firstIdle = handler(makeIdleEvent(sessionID))
  try {
    const activeLease = idleState.activeLeases.get(sessionID)
    await handler(makeCreatedEvent(sessionID))
    await handler(makeIdleEvent(sessionID))
    assert.equal(mock.messages, 1)
    assert.equal(mock.calls.length, 0)
    assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "observed")
    assert.equal(idleState.sessionGenerations.get(sessionID), generation)
    assert.equal(idleState.activeLeases.get(sessionID), activeLease)
    assert.equal(idleState.sessionData.get(sessionID), data)
    assert.equal(idleState.sessionOverrides.get(sessionID), true)
  } finally {
    messagesGate.resolve(unfinishedTodoMessages)
    await firstIdle
  }

  assert.equal(mock.messages, 1)
  assert.equal(mock.calls.length, 1)
  assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 4)
})

test("idle continuation: deletion during todo read neither prompts nor recreates state", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_delete_read"

  const pendingIdle = handler(makeIdleEvent(sessionID))
  await handler(makeDeletedEvent(sessionID))
  try {
    assert.equal(mock.messages, 1)
    assert.equal(mock.calls.length, 0)
    assert.equal(idleState.sessionGenerations.has(sessionID), false)
    assert.equal(idleState.activeLeases.has(sessionID), false)
    assert.equal(idleState.sessionData.has(sessionID), false)
    assert.equal(idleState.sessionOverrides.has(sessionID), false)
    assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "deleted")
  } finally {
    messagesGate.resolve(unfinishedTodoMessages)
    await pendingIdle
  }

  assert.equal(mock.calls.length, 0)
  assert.equal(idleState.sessionGenerations.has(sessionID), false)
  assert.equal(idleState.activeLeases.has(sessionID), false)
  assert.equal(idleState.sessionData.has(sessionID), false)
  assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "deleted")
})

test("idle continuation: abort during todo read fences work and preserves the marker", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_abort_read"

  const pendingIdle = handler(makeIdleEvent(sessionID))
  await handler(makeErrorEvent(sessionID, { isAbort: true }, { agent: "orchestrator" }))
  try {
    assert.equal(mock.messages, 1)
    assert.equal(mock.calls.length, 0)
    assert.equal(idleState.sessionData.get(sessionID)?.aborted, true)
  } finally {
    messagesGate.resolve(unfinishedTodoMessages)
    await pendingIdle
  }

  assert.equal(mock.calls.length, 0)
  assert.equal(idleState.sessionData.get(sessionID)?.aborted, true)
  await handler(makeIdleEvent(sessionID))
  assert.equal(mock.messages, 1)
  assert.equal(mock.calls.length, 0)
  assert.equal(idleState.sessionData.get(sessionID)?.aborted, true)
})

test("idle continuation: delete and recreate isolates an old todo result from new work", async () => {
  const oldMessages = deferred<unknown>()
  const mock = makeControlledClient([], {
    messagesResults: [oldMessages.promise, Promise.resolve(unfinishedTodoMessages)],
  })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_recreate_read"
  await handler(makeCreatedEvent(sessionID))

  const oldIdle = handler(makeIdleEvent(sessionID))
  try {
    const oldGeneration = idleState.sessionGenerations.get(sessionID)
    await handler(makeDeletedEvent(sessionID))
    await handler(makeCreatedEvent(sessionID))
    const replacementGeneration = idleState.sessionGenerations.get(sessionID)
    assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "observed")
    await handler(makeIdleEvent(sessionID))
    oldMessages.resolve(unfinishedTodoMessages)
    await oldIdle

    assert.ok(oldGeneration !== undefined)
    assert.ok(replacementGeneration !== undefined)
    assert.ok(replacementGeneration > oldGeneration)
    assert.equal(mock.messages, 2)
    assert.equal(mock.calls.length, 1)
    assert.equal(idleState.sessionGenerations.get(sessionID), replacementGeneration)
    assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 1)
  } finally {
    oldMessages.resolve(unfinishedTodoMessages)
    await oldIdle
  }
})

for (const settlement of ["resolve", "reject"] as const) {
  test(`idle continuation: stale ${settlement} while prompt is pending preserves recreated state`, async () => {
    const oldPrompt = deferred<unknown>()
    const promptStarted = deferred<void>()
    const mock = makeControlledClient([oldPrompt.promise], {
      messagesResults: [Promise.resolve(unfinishedTodoMessages)],
    })
    const originalPrompt = mock.client.session.prompt
    mock.client.session.prompt = async (args) => {
      const result = originalPrompt(args)
      promptStarted.resolve(undefined)
      return result
    }
    const idleState = createIdleContinuationState()
    idleState.globalEnabled = true
    const cfg = makeConfig({ enabled: true })
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
    const sessionID = `ses_prompt_${settlement}`
    await handler(makeCreatedEvent(sessionID))

    const oldIdle = handler(makeIdleEvent(sessionID))
    try {
      await promptStarted.promise
      await handler(makeDeletedEvent(sessionID))
      await handler(makeCreatedEvent(sessionID))
      const replacementGeneration = idleState.sessionGenerations.get(sessionID)
      idleState.sessionOverrides.set(sessionID, true)
      idleState.sessionData.set(sessionID, { aborted: false, continuationCount: 7 })

      assert.equal(mock.calls.length, 1)
      assert.ok(replacementGeneration !== undefined)
      assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 7)
      if (settlement === "resolve") oldPrompt.resolve(undefined)
      else oldPrompt.reject(new Error("stale prompt rejected"))
      await oldIdle

      assert.equal(idleState.sessionGenerations.get(sessionID), replacementGeneration)
      assert.deepEqual(idleState.sessionData.get(sessionID), { aborted: false, continuationCount: 7 })
      assert.equal(idleState.sessionOverrides.get(sessionID), true)
    } finally {
      oldPrompt.resolve(undefined)
      await oldIdle
    }
  })
}

test("idle continuation: a deleted session cannot be revived by a delayed idle event", async () => {
  const mock = makeControlledClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_deleted_idle"

  await handler(makeCreatedEvent(sessionID))
  await handler(makeDeletedEvent(sessionID))
  await handler(makeIdleEvent(sessionID))

  assert.equal(mock.messages, 0)
  assert.equal(continuationCalls(mock.calls).length, 0)
  assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "deleted")
  assert.equal(idleState.sessionGenerations.has(sessionID), false)
  assert.equal(idleState.sessionData.has(sessionID), false)
  assert.equal(idleState.activeLeases.has(sessionID), false)
})

test("idle continuation: an observed recreate enables continuation after deletion", async () => {
  const mock = makeControlledClient([], { messagesResults: [Promise.resolve(unfinishedTodoMessages)] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_observed_recreate"

  await handler(makeCreatedEvent(sessionID))
  await handler(makeDeletedEvent(sessionID))
  await handler(makeCreatedEvent(sessionID))
  await handler(makeIdleEvent(sessionID))

  assert.equal(mock.messages, 1)
  assert.equal(continuationCalls(mock.calls).length, 1)
  assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "observed")
  assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 1)
})

for (const scenario of [
  { status: 503, message: "overloaded", initialFallbackModels: ["fallback-a"], probedFallbackModels: ["fallback-a"] },
  { status: 400, message: "bad request", initialFallbackModels: [], probedFallbackModels: ["fallback-a"] },
] as const) {
  test(`idle continuation: first observed create resets lazy work after a ${scenario.status} error creates the main lifecycle`, async () => {
    const messagesGate = deferred<unknown>()
    const mock = makeControlledClient([], {
      messagesResults: [
        messagesGate.promise,
        Promise.resolve(fallbackUserMessages),
        Promise.resolve(unfinishedTodoMessages),
        Promise.resolve(unfinishedTodoMessages),
      ],
    })
    const idleState = createIdleContinuationState()
    const scheduler = new FakeHandlerScheduler()
    idleState.globalEnabled = true
    const cfg = makeConfig({ enabled: true })
    const handler = createRuntimeFallbackEventHandler({
      getConfig: () => cfg,
      client: mock.client,
      idleState,
      scheduler,
    })
    const sessionID = `ses_lazy_then_error_${scenario.status}`

    const oldIdle = handler(makeIdleEvent(sessionID))
    try {
      assert.equal(mock.messages, 1)
      const lazyGeneration = idleState.sessionGenerations.get(sessionID)
      const oldLease = idleState.activeLeases.get(sessionID)
      assert.ok(lazyGeneration !== undefined)
      assert.ok(oldLease)
      assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "lazy")

      await handler(makeErrorEvent(sessionID, { status: scenario.status, message: scenario.message }, {
        agent: "orchestrator",
        model: { providerID: "hoo", modelID: "primary-model" },
      }))
      assert.deepEqual(
        mock.calls.filter((call) => call.body.modelID !== undefined).map((call) => call.body.modelID),
        scenario.initialFallbackModels,
        `${scenario.status} error fallback dispatches`,
      )

      await handler(makeCreatedEvent(sessionID, { parentID: `parent_${scenario.status}` }))
      const observedGeneration = idleState.sessionGenerations.get(sessionID)
      assert.ok(observedGeneration !== undefined)
      assert.ok(observedGeneration > lazyGeneration)
      assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "observed")
      assert.equal(idleState.activeLeases.get(sessionID), undefined, "observed create removes the stale lazy lease")

      // The original error initialized the main lifecycle before the first create,
      // so this retry remains on the generic path rather than creating a child gate.
      await handler(makeErrorEvent(sessionID, { status: 429, message: "lifecycle probe" }, {
        agent: "orchestrator",
      }))
      assert.equal(scheduler.tasks.length, 0, `${scenario.status} error established the main lifecycle gate`)
      assert.deepEqual(
        mock.calls.filter((call) => call.body.modelID !== undefined).map((call) => call.body.modelID),
        scenario.probedFallbackModels,
        `${scenario.status} lifecycle probe fallback dispatches`,
      )

      messagesGate.resolve(unfinishedTodoMessages)
      await oldIdle
      assert.equal(continuationCalls(mock.calls).length, 0, "stale idle work must not prompt")

      const messagesBeforeFreshIdle = mock.messages
      await handler(makeIdleEvent(sessionID))
      assert.equal(mock.messages, messagesBeforeFreshIdle + 1)
      assert.equal(continuationCalls(mock.calls).length, 1, "fresh idle sends exactly one continuation prompt")
      assert.equal(idleState.sessionGenerations.get(sessionID), observedGeneration)
      assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 1)
    } finally {
      messagesGate.resolve(unfinishedTodoMessages)
      await oldIdle
    }
  })
}

test("idle continuation: a late explicit abort preserves a deleted tombstone", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  const sessionID = "ses_deleted_abort"

  await handler(makeCreatedEvent(sessionID))
  await handler(makeDeletedEvent(sessionID))
  await handler(makeErrorEvent(sessionID, { isAbort: true }, { agent: "orchestrator" }))

  assert.equal(calls.length, 0)
  assert.equal(idleState.sessionLifecycleKinds.get(sessionID), "deleted")
  assert.equal(idleState.sessionGenerations.has(sessionID), false)
  assert.equal(idleState.activeLeases.has(sessionID), false)
  assert.equal(idleState.sessionData.has(sessionID), false)
})
