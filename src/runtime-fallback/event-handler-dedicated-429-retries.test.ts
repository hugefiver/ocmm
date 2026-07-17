import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
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

  // fallback-a's dedicated budget is now exhausted (retry ordinal reached
  // maxRetries). The next 429 would try to switch, but maxAttempts:1 has
  // already been consumed by the fallback-a switch - so the second switch
  // must be blocked, leaving the model sequence unchanged and starting no
  // new scheduler task or prompt call.
  const schedulerTaskCount = scheduler.tasks.length
  const promptCallCount = mock.calls.length
  await handler(makeErrorEvent("fresh-budget", { status: 429 }, { agent: "worker" }))
  await handler(makeIdleEvent("fresh-budget"))
  await flushHandler()
  assert.equal(scheduler.tasks.length, schedulerTaskCount, "maxAttempts:1 must block the second switch gate")
  assert.equal(mock.calls.length, promptCallCount, "maxAttempts:1 must not dispatch another prompt")
  assert.deepEqual(dispatchedModels(mock.calls), [
    "provider-a/primary",
    "provider-b/fallback-a",
    "provider-b/fallback-a",
  ], "model sequence stays primary retry -> fallback-a switch -> fallback-a retry")
})
