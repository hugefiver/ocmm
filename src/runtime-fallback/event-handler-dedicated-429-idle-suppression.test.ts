import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import { createIdleContinuationState } from "./idle-state.ts"
import {
  FakeHandlerScheduler,
  deferred,
  flushHandler,
  makeHandlerConfig,
  standardHandlerChain,
  makeControlledClient,
  makeCreatedEvent,
  makeErrorEvent,
  makeIdleEvent,
  modelFor,
  dispatchedModels,
} from "./event-handler-test-fixtures.ts"

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
