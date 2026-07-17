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
