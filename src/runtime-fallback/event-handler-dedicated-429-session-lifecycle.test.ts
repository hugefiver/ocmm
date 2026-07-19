import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler } from "./event-handler.ts"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"
import type { OcmmClient } from "./dispatcher.ts"
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
  type PromptCall,
  publishWorkerRouteSnapshot,
} from "./event-handler-test-fixtures.ts"

test("real event handler: route invalidation clears dedicated tracking without a delete or recreate", async () => {
  const registry = createEffectiveRouteRegistry()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient()
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: mock.client,
    scheduler,
    routeRegistry: registry,
    clock: () => 1_000,
  })

  await handler(makeCreatedEvent("route-invalidated", { parentID: "root" }))
  await handler(makeErrorEvent("route-invalidated", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  publishWorkerRouteSnapshot(registry)
  await handler(makeIdleEvent("route-invalidated"))
  await scheduler.run(0)
  assert.deepEqual(dispatchedModels(mock.calls), [])

  await handler(makeErrorEvent("route-invalidated", { status: 503 }, { agent: "worker", model: modelFor("primary") }))
  assert.deepEqual(dispatchedModels(mock.calls), ["provider-b/fallback-a"])
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

test("real event handler: replacement generic error is not swallowed by a stale in-flight lock from the old generation", async () => {
  const stalePrompt = deferred<unknown>()
  const scheduler = new FakeHandlerScheduler()
  const mock = makeControlledClient([stalePrompt.promise])
  const cfg = makeHandlerConfig(standardHandlerChain())
  const handler = createRuntimeFallbackEventHandler({
    getConfig: () => cfg,
    client: mock.client,
    scheduler,
    clock: () => 1_000,
    random: () => 0,
  })

  // Old child session has a dedicated 429 dispatch in flight (blocked in
  // prompt), holding the global inFlight lock on this sessionID.
  await handler(makeCreatedEvent("replaced-child", { parentID: "old-root" }))
  await handler(makeErrorEvent("replaced-child", { status: 429 }, { agent: "worker", model: modelFor("primary") }))
  await handler(makeIdleEvent("replaced-child"))
  await scheduler.run(0)
  await flushHandler()
  assert.equal(mock.calls.length, 1, "old dedicated dispatch started")
  assert.equal(mock.calls[0]?.body.modelID, "primary")

  // Fire-and-forget (no await between calls) so the stale in-flight lock is
  // still held when the replacement error arrives.
  void handler({ event: { type: "session.deleted", properties: { sessionID: "replaced-child" } } })
  void handler(makeCreatedEvent("replaced-child", { parentID: "new-root" }))
  const replacement = handler(makeErrorEvent("replaced-child", { status: 503 }, {
    agent: "worker",
    model: modelFor("primary"),
  }))

  await replacement
  await flushHandler()

  assert.deepEqual(
    dispatchedModels(mock.calls),
    ["provider-a/primary", "provider-b/fallback-a"],
    "replacement generic fallback must run after the stale dispatch settles",
  )
})
