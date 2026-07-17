import assert from "node:assert/strict"

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

export type ScheduledTask = {
  delayMs: number
  run: () => Promise<void>
  cancelled: boolean
}

export class FakeScheduler implements Subagent429Scheduler {
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

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

export async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

export function target(providerID = "provider-a", modelID = "model-a"): Subagent429Target {
  return { providerID, modelID, entry: { providers: [providerID], model: modelID } }
}

export function runtimeConfig(overrides: Partial<RuntimeFallbackConfig> = {}): RuntimeFallbackConfig {
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

export function input(
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

export function errorInput(
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

export type Harness = {
  scheduler: FakeScheduler
  dispatches: Subagent429DispatchInput[]
  controller: ReturnType<typeof createSubagent429Controller>
}

export function createHarness(options: {
  now?: number
  random?: number
  dispatchRetry?: (dispatch: Subagent429DispatchInput) => Promise<boolean>
} = {}): Harness {
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

export function idle(kind: string, suppressIdleContinuation: boolean) {
  return { kind, suppressIdleContinuation }
}
