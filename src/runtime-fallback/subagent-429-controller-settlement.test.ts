import assert from "node:assert/strict"
import { test } from "node:test"

import type { Subagent429Target } from "./subagent-429-controller.ts"
import {
  createHarness,
  deferred,
  errorInput,
  flush,
  idle,
  runtimeConfig,
  target,
} from "./subagent-429-controller-fixture.ts"

test("uses a switch immediately when maxRetries is zero and routes a post-settlement 429", async () => {
  const result = deferred<boolean>()
  const fallback = target("provider-b", "model-b")
  const successor = target("provider-c", "model-c")
  let commits = 0
  const config = runtimeConfig({ subagent429: { enabled: true, maxRetries: 0, providerScopes: {} } })
  const { controller, scheduler, dispatches } = createHarness({ dispatchRetry: async () => result.promise })
  controller.onSessionCreated("child", true)
  const decision = controller.on429(
    errorInput("child", {
      config,
      prepareSwitch: () => ({
        ok: true,
        prepared: { target: fallback, attempt: 1, commit: () => { commits++ } },
      }),
    }),
  )
  assert.deepEqual(decision, { handled: true, action: "switch-gated", attempt: 1, target: fallback })
  controller.onIdle("child")
  await scheduler.run(0)
  assert.deepEqual(dispatches[0]?.target, fallback)
  result.resolve(true)
  await flush()
  assert.equal(commits, 1)

  const next = controller.on429(errorInput("child", {
    target: fallback,
    config,
    prepareSwitch: (failed) => {
      assert.deepEqual(failed, fallback)
      return { ok: true, prepared: { target: successor, attempt: 2, commit: () => {} } }
    },
  }))
  assert.deepEqual(next, { handled: true, action: "queued-429", dispatchGeneration: 1 })
  await flush()
  assert.equal(scheduler.tasks[1]?.delayMs, 0)
  controller.onIdle("child")
  await scheduler.run(1)
  assert.deepEqual(dispatches[1]?.target, successor)
})

test("gives a switched target a fresh retry budget in its new scope", async () => {
  const primaryResult = deferred<boolean>()
  const fallbackResult = deferred<boolean>()
  const fallback = target("provider-b", "model-b")
  const config = runtimeConfig({ subagent429: { enabled: true, maxRetries: 1, providerScopes: {} } })
  let dispatchCount = 0
  const { controller, scheduler, dispatches } = createHarness({
    dispatchRetry: async () => {
      dispatchCount++
      return dispatchCount === 1 ? primaryResult.promise : fallbackResult.promise
    },
  })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child", { config }))
  controller.onIdle("child")
  await scheduler.run(0)
  primaryResult.resolve(true)
  await flush()

  controller.on429(errorInput("child", {
    config,
    prepareSwitch: () => ({ ok: true, prepared: { target: fallback, attempt: 1, commit: () => {} } }),
  }))
  controller.onIdle("child")
  await scheduler.run(1)
  assert.deepEqual(dispatches[1]?.target, fallback)
  fallbackResult.resolve(true)
  await flush()

  controller.on429(errorInput("child", { target: fallback, config }))
  await flush()
  assert.equal(scheduler.tasks[2]?.delayMs, 500)
})

test("accounts a proven retry before queued-idle-settle and preserves its next retry ordinal", async () => {
  const first = deferred<boolean>()
  const { controller, scheduler, dispatches } = createHarness({ dispatchRetry: async () => first.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onIdle("child")
  await scheduler.run(0)
  assert.equal(dispatches.length, 1)
  assert.deepEqual(controller.on429(errorInput("child")), {
    handled: true,
    action: "queued-429",
    dispatchGeneration: 1,
  })
  assert.deepEqual(controller.onIdle("child"), idle("queued-error-idle-observed", true))
  first.resolve(false)
  await flush()
  assert.equal(scheduler.tasks[1]?.delayMs, 1_000)
  await scheduler.run(1)
  assert.equal(dispatches.length, 2)
})

test("accounts a proven retry when queued-settle precedes idle", async () => {
  const first = deferred<boolean>()
  const { controller, scheduler, dispatches } = createHarness({ dispatchRetry: async () => first.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onIdle("child")
  await scheduler.run(0)
  controller.on429(errorInput("child"))
  first.resolve(false)
  await flush()
  assert.equal(dispatches.length, 1)
  assert.deepEqual(controller.onIdle("child"), idle("error-idle-observed", true))
  await scheduler.run(1)
  assert.equal(dispatches.length, 2)
})

test("commits a proven switch exactly once and does not commit a bare false dispatch", async () => {
  const switched = target("provider-b", "model-b")
  const first = deferred<boolean>()
  let commits = 0
  const config = runtimeConfig({ subagent429: { enabled: true, maxRetries: 0, providerScopes: {} } })
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => first.promise })
  controller.onSessionCreated("switch", true)
  controller.on429(errorInput("switch", {
    config,
    prepareSwitch: () => ({ ok: true, prepared: { target: switched, attempt: 1, commit: () => { commits++ } } }),
  }))
  controller.onIdle("switch")
  await scheduler.run(0)
  controller.on429(errorInput("switch", { config }))
  first.resolve(false)
  await flush()
  assert.equal(commits, 1)

  const bare = createHarness({ dispatchRetry: async () => false })
  let bareCommits = 0
  bare.controller.onSessionCreated("bare", true)
  bare.controller.on429(errorInput("bare", {
    config,
    prepareSwitch: () => ({ ok: true, prepared: { target: switched, attempt: 2, commit: () => { bareCommits++ } } }),
  }))
  bare.controller.onIdle("bare")
  await bare.scheduler.run(0)
  await flush()
  assert.equal(bareCommits, 0)
  assert.equal(bare.controller.getActiveDispatchTarget("bare"), undefined)
})

test("gives queued 429 priority over idle and uses the active switch target", async () => {
  const first = deferred<boolean>()
  const fallback = target("provider-b", "model-b")
  const next = target("provider-c", "model-c")
  const config = runtimeConfig({ subagent429: { enabled: true, maxRetries: 0, providerScopes: {} } })
  const preparedFor: Subagent429Target[] = []
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => first.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child", {
    config,
    prepareSwitch: (failed) => {
      preparedFor.push(failed)
      return { ok: true, prepared: { target: fallback, attempt: 1, commit: () => {} } }
    },
  }))
  controller.onIdle("child")
  await scheduler.run(0)
  controller.on429(errorInput("child", {
    target: target("provider-a", "stale-model"),
    config,
    prepareSwitch: (failed) => {
      preparedFor.push(failed)
      return { ok: true, prepared: { target: next, attempt: 2, commit: () => {} } }
    },
  }))
  controller.onIdle("child")
  first.resolve(false)
  await flush()
  assert.deepEqual(preparedFor, [target(), fallback])
  assert.equal(scheduler.tasks.length, 2)
})

test("queues only the first active provider outcome and hands off other errors after either dispatch result", async () => {
  for (const dispatched of [true, false]) {
    const result = deferred<boolean>()
    const handoffs: Subagent429Target[] = []
    const { controller, scheduler } = createHarness({ dispatchRetry: async () => result.promise })
    controller.onSessionCreated(`child-${dispatched}`, true)
    controller.on429(errorInput(`child-${dispatched}`))
    controller.onIdle(`child-${dispatched}`)
    await scheduler.run(0)
    assert.deepEqual(controller.onOtherError({
      sessionID: `child-${dispatched}`,
      runGenericFallback: async (active) => { handoffs.push(active) },
    }), { handled: true, action: "queued-other-error", dispatchGeneration: 1 })
    assert.deepEqual(controller.on429(errorInput(`child-${dispatched}`)), {
      handled: true,
      action: "duplicate-outcome",
      dispatchGeneration: 1,
    })
    controller.onIdle(`child-${dispatched}`)
    result.resolve(dispatched)
    await flush()
    assert.deepEqual(handoffs, [target()])
  }
})

test("routes an other error immediately after a settled dispatch", async () => {
  const result = deferred<boolean>()
  const handoffs: Subagent429Target[] = []
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => result.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onIdle("child")
  await scheduler.run(0)
  result.resolve(true)
  await flush()

  const decision = controller.onOtherError({
    sessionID: "child",
    runGenericFallback: async (active) => { handoffs.push(active) },
  })
  assert.deepEqual(decision, { handled: true, action: "queued-other-error", dispatchGeneration: 1 })
  await flush()
  assert.deepEqual(handoffs, [target()])
})

test("returns retry-succeeded with idle continuation unsuppressed after a settled retry", async () => {
  const result = deferred<boolean>()
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => result.promise })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  controller.onIdle("child")
  await scheduler.run(0)
  result.resolve(true)
  await flush()
  assert.deepEqual(controller.onIdle("child"), idle("retry-succeeded", false))
})
