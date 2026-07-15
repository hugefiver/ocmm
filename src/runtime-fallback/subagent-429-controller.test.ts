import assert from "node:assert/strict"
import { test } from "node:test"

import { defaultConfig } from "../config/schema.ts"
import type { RuntimeFallbackConfig } from "../config/schema.ts"
import type { FallbackCandidateBlocker } from "./fallback-state.ts"
import {
  createSubagent429Controller,
  type Subagent429ControllerDeps,
  type Subagent429DispatchInput,
  type Subagent429PreparedSwitch,
  type Subagent429Scheduler,
  type Subagent429Target,
} from "./subagent-429-controller.ts"

type ScheduledTask = {
  delayMs: number
  run: () => Promise<void>
  cancelled: boolean
}

class FakeScheduler implements Subagent429Scheduler {
  readonly tasks: ScheduledTask[] = []

  schedule(delayMs: number, run: () => Promise<void>): () => void {
    const task: ScheduledTask = { delayMs, run, cancelled: false }
    this.tasks.push(task)
    return () => {
      task.cancelled = true
    }
  }

  async run(index: number, includeCancelled = false): Promise<void> {
    const task = this.tasks[index]
    assert.ok(task)
    if (!task.cancelled || includeCancelled) await task.run()
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

function target(providerID = "provider-a", modelID = "model-a"): Subagent429Target {
  return { providerID, modelID, entry: { providers: [providerID], model: modelID } }
}

function runtimeConfig(overrides: Partial<RuntimeFallbackConfig> = {}): RuntimeFallbackConfig {
  const base = defaultConfig().runtimeFallback
  return {
    ...base,
    ...overrides,
    subagent429: {
      ...base.subagent429,
      ...overrides.subagent429,
    },
  }
}

function input(
  sessionID: string,
  options: Partial<Omit<Subagent429DispatchInput, "sessionID" | "target" | "reason">> & {
    target?: Subagent429Target
    reason?: string
  } = {},
) {
  return {
    sessionID,
    target: options.target ?? target(),
    reason: options.reason ?? "status 429",
    ...(options.agent === undefined ? {} : { agent: options.agent }),
  }
}

function errorInput(
  sessionID: string,
  options: {
    target?: Subagent429Target
    config?: RuntimeFallbackConfig
    recoveryDelayMs?: number
    prepareSwitch?: (
      failedTarget: Subagent429Target,
      blocker: FallbackCandidateBlocker,
    ) =>
      | { ok: true; prepared: Subagent429PreparedSwitch }
      | { ok: false; reason: "max-attempts" | "no-fallback-chain" | "no-next-model" | "dispatch-failed" }
  } = {},
) {
  return {
    ...input(sessionID, { target: options.target }),
    classification: {
      reason: "status 429",
      ...(options.recoveryDelayMs === undefined ? {} : { recoveryDelayMs: options.recoveryDelayMs }),
    },
    runtimeConfig: options.config ?? runtimeConfig(),
    prepareSwitch:
      options.prepareSwitch ??
      (() => ({ ok: false as const, reason: "no-next-model" as const })),
  }
}

function createHarness(options: {
  now?: number
  random?: number
  dispatchRetry?: (dispatch: Subagent429DispatchInput) => Promise<boolean>
} = {}) {
  const scheduler = new FakeScheduler()
  const dispatches: Subagent429DispatchInput[] = []
  const deps: Subagent429ControllerDeps = {
    scheduler,
    clock: () => options.now ?? 1_000_000,
    random: () => options.random ?? 0,
    ...(options.dispatchRetry === undefined
      ? {}
      : {
          dispatchRetry: async (dispatch) => {
            dispatches.push(dispatch)
            return options.dispatchRetry!(dispatch)
          },
        }),
  }
  return { scheduler, dispatches, controller: createSubagent429Controller(deps) }
}

function idle(kind: string, suppressIdleContinuation: boolean) {
  return { kind, suppressIdleContinuation }
}

test("tracks only child sessions and clears an initial successful idle", () => {
  const { controller } = createHarness({ dispatchRetry: async () => true })

  controller.onSessionCreated("root", false)
  assert.deepEqual(controller.on429(errorInput("root")), { handled: false })
  assert.deepEqual(controller.onIdle("root"), idle("untracked", false))

  controller.onSessionCreated("child", true)
  assert.deepEqual(controller.onIdle("child"), idle("initial-succeeded", false))
  assert.deepEqual(controller.onIdle("child"), idle("untracked", false))
})

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

test("uses zero-delay probes for hints above ten minutes, full waits below it, and equal jitter without hints", () => {
  const long = createHarness({ dispatchRetry: async () => true })
  long.controller.onSessionCreated("long", true)
  long.controller.on429(errorInput("long", { recoveryDelayMs: 600_001 }))
  assert.equal(long.scheduler.tasks[0]?.delayMs, 0)

  const bounded = createHarness({ dispatchRetry: async () => true })
  bounded.controller.onSessionCreated("bounded", true)
  bounded.controller.on429(errorInput("bounded", { recoveryDelayMs: 600_000 }))
  assert.equal(bounded.scheduler.tasks[0]?.delayMs, 600_000)

  const jitter = createHarness({ random: 0.25, dispatchRetry: async () => true })
  jitter.controller.onSessionCreated("jitter", true)
  jitter.controller.on429(errorInput("jitter"))
  assert.equal(jitter.scheduler.tasks[0]?.delayMs, 625)

  const upper = createHarness({ random: 1, dispatchRetry: async () => true })
  upper.controller.onSessionCreated("upper", true)
  upper.controller.on429(errorInput("upper"))
  assert.equal(upper.scheduler.tasks[0]?.delayMs, 999)
})

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

test("filters blocked candidates by configured model or provider scope without cross-session leakage", () => {
  const candidateSameProvider = { providers: ["provider-a"], model: "other" }
  const candidateSameModel = { providers: ["provider-a"], model: "model-a" }
  const candidateOtherProvider = { providers: ["provider-b"], model: "other" }

  const model = createHarness({ dispatchRetry: async () => true })
  model.controller.onSessionCreated("model", true)
  let modelBlocker: FallbackCandidateBlocker | undefined
  const modelDecision = model.controller.on429(errorInput("model", {
    config: runtimeConfig({ subagent429: { enabled: true, maxRetries: 0, providerScopes: {} } }),
    prepareSwitch: (_failed, blocker) => {
      modelBlocker = blocker
      return { ok: false, reason: "no-next-model" }
    },
  }))
  assert.deepEqual(modelDecision, { handled: true, action: "stopped", reason: "no-next-model" })
  assert.equal(modelBlocker?.(candidateSameProvider), false)
  assert.equal(modelBlocker?.(candidateSameModel), true)

  const provider = createHarness({ dispatchRetry: async () => true })
  provider.controller.onSessionCreated("provider", true)
  let providerBlocker: FallbackCandidateBlocker | undefined
  provider.controller.on429(errorInput("provider", {
    config: runtimeConfig({
      subagent429: { enabled: true, maxRetries: 0, providerScopes: { "provider-a": "provider" } },
    }),
    prepareSwitch: (_failed, blocker) => {
      providerBlocker = blocker
      return { ok: false, reason: "no-next-model" }
    },
  }))
  assert.equal(providerBlocker?.(candidateSameProvider), true)
  assert.equal(providerBlocker?.(candidateOtherProvider), false)

  provider.controller.onSessionCreated("other-session", true)
  const isolated = provider.controller.on429(errorInput("other-session", {
    config: runtimeConfig({ subagent429: { enabled: true, maxRetries: 1, providerScopes: { "provider-a": "provider" } } }),
  }))
  assert.equal(isolated.action, "retry-gated")
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

test("uses cooldown when an exhausted retry deadline has already elapsed", async () => {
  let clock = 1_000
  const scheduler = new FakeScheduler()
  const first = deferred<boolean>()
  const controller = createSubagent429Controller({
    scheduler,
    clock: () => clock,
    random: () => 0,
    dispatchRetry: async () => first.promise,
  })
  const config = runtimeConfig({ subagent429: { enabled: true, maxRetries: 1, providerScopes: {} } })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child", { config, recoveryDelayMs: 100 }))
  controller.onIdle("child")
  await scheduler.run(0)
  first.resolve(true)
  await flush()

  clock = 1_101
  let blocker: FallbackCandidateBlocker | undefined
  controller.on429(errorInput("child", {
    config,
    prepareSwitch: (_failed, receivedBlocker) => {
      blocker = receivedBlocker
      return { ok: false, reason: "no-next-model" }
    },
  }))
  assert.equal(blocker?.(target().entry), true)
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

test("keeps the real long-hint deadline when blocking an exhausted provider scope", async () => {
  let clock = 1_000
  const scheduler = new FakeScheduler()
  const first = deferred<boolean>()
  const controller = createSubagent429Controller({
    scheduler,
    clock: () => clock,
    random: () => 0,
    dispatchRetry: async () => first.promise,
  })
  const config = runtimeConfig({
    cooldownSeconds: 60,
    subagent429: { enabled: true, maxRetries: 1, providerScopes: { "provider-a": "provider" } },
  })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child", { config, recoveryDelayMs: 900_000 }))
  assert.equal(scheduler.tasks[0]?.delayMs, 0)
  controller.onIdle("child")
  await scheduler.run(0)
  first.resolve(true)
  await flush()

  let blocker: FallbackCandidateBlocker | undefined
  controller.on429(errorInput("child", {
    config,
    recoveryDelayMs: 900_000,
    prepareSwitch: (_failed, receivedBlocker) => {
      blocker = receivedBlocker
      return { ok: false, reason: "no-next-model" }
    },
  }))
  clock += 61_000
  assert.equal(blocker?.({ providers: ["provider-a"], model: "another" }), true)
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

test("outside an active dispatch, other errors stop dedicated state and remain unhandled", () => {
  const { controller, scheduler } = createHarness({ dispatchRetry: async () => true })
  controller.onSessionCreated("child", true)
  controller.on429(errorInput("child"))
  assert.deepEqual(controller.onOtherError({ sessionID: "child", runGenericFallback: async () => {} }), {
    handled: false,
  })
  assert.equal(scheduler.tasks[0]?.cancelled, true)
})
