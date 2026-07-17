import assert from "node:assert/strict"
import { test } from "node:test"

import type { Subagent429Target } from "./subagent-429-controller.ts"
import {
  createHarness,
  deferred,
  errorInput,
  flush,
  idle,
  target,
} from "./subagent-429-controller-fixture.ts"

test("tracks only child sessions and clears an initial successful idle", () => {
  const { controller } = createHarness({ dispatchRetry: async () => true })

  controller.onSessionCreated("root", false)
  assert.deepEqual(controller.on429(errorInput("root")), { handled: false })
  assert.deepEqual(controller.onIdle("root"), idle("untracked", false))

  controller.onSessionCreated("child", true)
  assert.deepEqual(controller.onIdle("child"), idle("initial-succeeded", false))
  assert.deepEqual(controller.onIdle("child"), idle("untracked", false))
})

test("known error idle does not cancel a dispatch and an early successful idle cleans up", async () => {
  const result = deferred<boolean>()
  const { controller, scheduler, dispatches } = createHarness({ dispatchRetry: async () => result.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child", { recoveryDelayMs: 50 }))
  controller.onIdle("child")
  await scheduler.run(0)
  assert.equal(dispatches.length, 1)
  assert.deepEqual(controller.getActiveDispatchTarget("child"), target())
  assert.deepEqual(controller.onIdle("child"), idle("dispatch-idle-observed", true))
  assert.deepEqual(controller.getActiveDispatchTarget("child"), target())
  result.resolve(true)
  await flush()
  assert.equal(controller.getActiveDispatchTarget("child"), undefined)
})

test("delete and recreate invalidate stale timers, completions, and queued handoffs", async () => {
  const result = deferred<boolean>()
  const handoffs: Subagent429Target[] = []
  const { controller, scheduler, dispatches } = createHarness({ dispatchRetry: async () => result.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onDeleted("child")
  await scheduler.run(0, true)
  assert.equal(dispatches.length, 0)

  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onIdle("child")
  await scheduler.run(1)
  controller.onOtherError({ sessionID: "child", runGenericFallback: async (active) => { handoffs.push(active) } })
  controller.onDeleted("child")
  controller.onSessionCreated("child", true)
  result.resolve(true)
  await flush()
  assert.deepEqual(handoffs, [])
  assert.deepEqual(controller.onIdle("child"), idle("initial-succeeded", false))
})

test("outside an active dispatch, other errors stop dedicated state and remain unhandled", () => {
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => true })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  assert.deepEqual(controller.onOtherError({ sessionID: "child", runGenericFallback: async () => {} }), {
    handled: false,
  })
  assert.equal(scheduler.tasks[0]?.cancelled, true)
})
