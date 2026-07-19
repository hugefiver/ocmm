import assert from "node:assert/strict"
import { test } from "node:test"

import type { FallbackCandidateBlocker } from "./fallback-state.ts"
import { createSubagent429Controller } from "./subagent-429-controller.ts"
import {
  createHarness,
  deferred,
  errorInput,
  flush,
  FakeScheduler,
  runtimeConfig,
  target,
} from "./subagent-429-controller-fixture.ts"

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

test("uses cooldown when an exhausted retry deadline has already elapsed", async () => {
  let clock = 1_000
  const scheduler = new FakeScheduler()
  const first = deferred<boolean>()
  const controller = createSubagent429Controller({
    isCurrentSnapshot: () => true,
    scheduler,
    clock: () => clock,
    random: () => 0,
    dispatchRetry: async () => first.promise,
  })
  const config = runtimeConfig({ subagent429: { enabled: true, maxRetries: 1, providerScopes: {} } })
  controller.onSessionCreated("child", true, 0)
  controller.on429(errorInput("child", { config, recoveryDelayMs: 100 }))
  controller.onIdle("child", 0)
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

test("keeps the real long-hint deadline when blocking an exhausted provider scope", async () => {
  let clock = 1_000
  const scheduler = new FakeScheduler()
  const first = deferred<boolean>()
  const controller = createSubagent429Controller({
    isCurrentSnapshot: () => true,
    scheduler,
    clock: () => clock,
    random: () => 0,
    dispatchRetry: async () => first.promise,
  })
  const config = runtimeConfig({
    cooldownSeconds: 60,
    subagent429: { enabled: true, maxRetries: 1, providerScopes: { "provider-a": "provider" } },
  })
  controller.onSessionCreated("child", true, 0)
  controller.on429(errorInput("child", { config, recoveryDelayMs: 900_000 }))
  assert.equal(scheduler.tasks[0]?.delayMs, 0)
  controller.onIdle("child", 0)
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

test("keeps the full bounded hint after a zero-delay probe and tracks exact missing-hint delays across eight retries", async () => {
  const probe = createHarness({ dispatchRetry: async () => true })
  probe.controller.onSessionCreated("probe", true)
  probe.controller.on429(errorInput("probe", { recoveryDelayMs: 900_000 }))
  assert.equal(probe.scheduler.tasks[0]?.delayMs, 0, "900_000ms hint triggers a zero-delay probe")
  probe.controller.onIdle("probe")
  await probe.scheduler.run(0)
  await flush()
  assert.equal(probe.dispatches.length, 1, "the zero-delay probe actually completed a request")

  probe.controller.on429(errorInput("probe", { recoveryDelayMs: 600_000 }))
  assert.equal(
    probe.scheduler.tasks[1]?.delayMs,
    600_000,
    "a 600_000ms hint is not above the probe threshold and must be waited in full",
  )

  const seq = createHarness({ random: 0.5, dispatchRetry: async () => true })
  const seqConfig = runtimeConfig({ subagent429: { enabled: true, maxRetries: 8, providerScopes: {} } })
  seq.controller.onSessionCreated("seq", true)
  const expected = [750, 1_500, 3_000, 6_000, 12_000, 22_500, 22_500, 22_500]
  for (let i = 0; i < 8; i++) {
    const decision = seq.controller.on429(errorInput("seq", { config: seqConfig }))
    assert.equal(decision.handled, true, `retry ${i} must be handled`)
    if (i === 0) {
      if (!decision.handled || decision.action !== "retry-gated") {
        assert.fail(`retry 0 was not retry-gated`)
      }
      assert.equal(decision.delayMs, expected[0], "retry 0 delay")
      assert.equal(decision.retryOrdinal, 1, "retry 0 ordinal starts at 1")
    }
    seq.controller.onIdle("seq")
    await seq.scheduler.run(i)
    await flush()
    assert.equal(seq.dispatches.length, i + 1, `retry ${i} completed a request`)
    assert.equal(seq.scheduler.tasks[i]?.delayMs, expected[i], `retry ${i} gate delay`)
  }
  // Delay is a pure function of retriesUsed (= ordinal - 1), so the full
  // delay sequence also proves the ordinal advanced 1 through 8.
  assert.deepEqual(
    seq.scheduler.tasks.slice(0, 8).map((t) => t.delayMs),
    expected,
  )
})
