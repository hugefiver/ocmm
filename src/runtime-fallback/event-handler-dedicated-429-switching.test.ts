import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"
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
  publishWorkerRouteSnapshot,
} from "./event-handler-test-fixtures.ts"

test("real event handler: a stale prepared switch neither commits nor accounts before the current route handles the next error", async () => {
  const registry = createEffectiveRouteRegistry()
  publishWorkerRouteSnapshot(registry)
  const firstPrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([firstPrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain(), { subagent429: { maxRetries: 0 } })
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: mock.client,
    scheduler,
    routeRegistry: registry,
    clock: () => 1_000,
  })

  await handler(makeCreatedEvent("stale-prepared", { parentID: "root" }))
  await handler(makeErrorEvent("stale-prepared", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("stale-prepared"))
  await scheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a"])

  const currentChain = [
    { providers: ["provider-a"], model: "primary" },
    { providers: ["provider-d"], model: "current-fallback" },
  ]
  publishWorkerRouteSnapshot(registry, currentChain)
  firstPrompt.resolve(undefined)
  await flushHandler()
  await flushHandler()

  await handler(makeErrorEvent("stale-prepared", { status: 503 }, { agent: "worker", model: modelFor("primary") }))
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a", "provider-d/current-fallback"])
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
