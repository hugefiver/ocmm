import assert from "node:assert/strict"
import { test } from "node:test"

import { createSubagent429Controller } from "./subagent-429-controller.ts"
import {
  createHarness,
  deferred,
  errorInput,
  flush,
  idle,
  runtimeConfig,
} from "./subagent-429-controller-fixture.ts"

test("requires both timer-first and idle-first gate signals, then dispatches exactly once", async () => {
  const timerFirst = deferred<boolean>()
  const first = createHarness({ dispatchRetry: async () => timerFirst.promise })
  first.controller.onSessionCreated("timer-first", true)
  const firstDecision = first.controller.on429(errorInput("timer-first", { recoveryDelayMs: 100 }))
  assert.deepEqual(firstDecision, {
    handled: true,
    action: "retry-gated",
    delayMs: 100,
    retryOrdinal: 1,
    scope: "model",
  })
  await first.scheduler.run(0)
  assert.equal(first.dispatches.length, 0)
  assert.deepEqual(first.controller.onIdle("timer-first"), idle("error-idle-observed", true))
  assert.equal(first.dispatches.length, 1)
  timerFirst.resolve(true)
  await flush()

  const idleFirst = deferred<boolean>()
  const second = createHarness({ dispatchRetry: async () => idleFirst.promise })
  second.controller.onSessionCreated("idle-first", true)
  second.controller.on429(errorInput("idle-first", { recoveryDelayMs: 100 }))
  assert.deepEqual(second.controller.onIdle("idle-first"), idle("error-idle-observed", true))
  assert.equal(second.dispatches.length, 0)
  await second.scheduler.run(0)
  assert.equal(second.dispatches.length, 1)
  await second.scheduler.run(0)
  assert.equal(second.dispatches.length, 1)
  idleFirst.resolve(true)
  await flush()
})

test("stops when dispatch is unavailable and observes only when runtime dispatch is disabled", () => {
  const unavailable = createHarness()
  unavailable.controller.onSessionCreated("unavailable", true)
  assert.deepEqual(unavailable.controller.on429(errorInput("unavailable")), {
    handled: true,
    action: "stopped",
    reason: "dispatch-unavailable",
  })
  assert.equal(unavailable.scheduler.tasks.length, 0)

  const observed = createHarness({ dispatchRetry: async () => true })
  observed.controller.onSessionCreated("observed", true)
  assert.deepEqual(observed.controller.on429(errorInput("observed", {
    config: runtimeConfig({ dispatch: false }),
  })), { handled: true, action: "observe-only" })
  assert.equal(observed.scheduler.tasks.length, 0)
  assert.deepEqual(observed.controller.onIdle("observed"), idle("untracked", false))
})

test("constructs with production defaults without scheduler, clock, or logger", () => {
  const controller = createSubagent429Controller({})
  controller.onSessionCreated("child", true)
  controller.onDeleted("child")
  assert.deepEqual(controller.onIdle("child"), idle("untracked", false))
})

test("disabled subagent and runtime fallback stop state and remain unhandled", () => {
  const subagentDisabled = createHarness({ dispatchRetry: async () => true })
  subagentDisabled.controller.onSessionCreated("subagent-disabled", true)
  assert.deepEqual(subagentDisabled.controller.on429(errorInput("subagent-disabled", {
    config: runtimeConfig({ subagent429: { enabled: false, maxRetries: 5, providerScopes: {} } }),
  })), { handled: false })
  assert.deepEqual(subagentDisabled.controller.onIdle("subagent-disabled"), idle("untracked", false))

  const runtimeDisabled = createHarness({ dispatchRetry: async () => true })
  runtimeDisabled.controller.onSessionCreated("runtime-disabled", true)
  assert.deepEqual(runtimeDisabled.controller.on429(errorInput("runtime-disabled", {
    config: runtimeConfig({ enabled: false }),
  })), { handled: false })
  assert.deepEqual(runtimeDisabled.controller.onIdle("runtime-disabled"), idle("untracked", false))
})

test("a pending duplicate 429 preserves the original delay and dispatches once", async () => {
  const { controller, scheduler, dispatches } = createHarness({ dispatchRetry: async () => true })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child", { recoveryDelayMs: 123 }))
  assert.deepEqual(controller.on429(errorInput("child", { recoveryDelayMs: 999 })), {
    handled: true,
    action: "duplicate-outcome",
    dispatchGeneration: 0,
  })
  assert.equal(scheduler.tasks.length, 1)
  assert.equal(scheduler.tasks[0]?.delayMs, 123)
  controller.onIdle("child")
  await scheduler.run(0)
  assert.equal(dispatches.length, 1)
})

test("does not schedule or prepare a queued 429 that becomes observe-only", async () => {
  const result = deferred<boolean>()
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => result.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onIdle("child")
  await scheduler.run(0)
  let prepares = 0
  controller.on429(errorInput("child", {
    config: runtimeConfig({ dispatch: false }),
    prepareSwitch: () => {
      prepares++
      return { ok: false, reason: "no-next-model" }
    },
  }))
  result.resolve(false)
  await flush()
  assert.equal(prepares, 0)
  assert.equal(scheduler.tasks.length, 1)
})
