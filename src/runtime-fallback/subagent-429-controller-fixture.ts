import assert from "node:assert/strict"

import { defaultConfig } from "../config/schema.ts"
import type { RuntimeFallbackConfig } from "../config/schema.ts"
import type { FallbackCandidateBlocker } from "./fallback-state.ts"
import {
  createSubagent429Controller,
  type Subagent429Controller,
  type Subagent429ControllerDeps,
  type Subagent429DispatchInput,
  type Subagent429PreparedSwitch,
  type Subagent429OtherErrorInput,
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
  options: Partial<Omit<Subagent429DispatchInput, "sessionID" | "target" | "reason" | "snapshotId">> & {
    target?: Subagent429Target
    reason?: string
    snapshotId?: number
  } = {},
) {
  return {
    sessionID,
    snapshotId: options.snapshotId ?? 0,
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
    snapshotId?: number
    prepareSwitch?: (
      failedTarget: Subagent429Target,
      blocker: FallbackCandidateBlocker,
    ) =>
      | { ok: true; prepared: Subagent429PreparedSwitch }
      | { ok: false; reason: "max-attempts" | "no-fallback-chain" | "no-next-model" | "dispatch-failed" }
  } = {},
) {
  const snapshotId = options.snapshotId ?? 0
  const prepareSwitch = options.prepareSwitch ??
    (() => ({ ok: false as const, reason: "no-next-model" as const }))
  return {
    ...input(sessionID, { target: options.target, snapshotId }),
    classification: {
      reason: "status 429",
      ...(options.recoveryDelayMs === undefined ? {} : { recoveryDelayMs: options.recoveryDelayMs }),
    },
    runtimeConfig: options.config ?? runtimeConfig(),
    prepareSwitch: (failedTarget: Subagent429Target, blocker: FallbackCandidateBlocker) => {
      const result = prepareSwitch(failedTarget, blocker)
      if (!result.ok) return result
      return {
        ok: true as const,
        prepared: {
          ...result.prepared,
          snapshotId: result.prepared.snapshotId ?? snapshotId,
        },
      }
    },
  }
}

type HarnessController = Omit<
  Subagent429Controller,
  "onSessionCreated" | "onIdle" | "getActiveDispatchTarget" | "onOtherError"
> & {
  onSessionCreated(sessionID: string, isChild: boolean, snapshotId?: number): void
  onIdle(sessionID: string, snapshotId?: number): ReturnType<Subagent429Controller["onIdle"]>
  getActiveDispatchTarget(sessionID: string, snapshotId?: number): ReturnType<Subagent429Controller["getActiveDispatchTarget"]>
  onOtherError(
    input: Omit<Subagent429OtherErrorInput, "snapshotId"> & { snapshotId?: number },
  ): ReturnType<Subagent429Controller["onOtherError"]>
}

export type Harness = {
  scheduler: FakeScheduler
  dispatches: Subagent429DispatchInput[]
  controller: HarnessController
  currentSnapshotId: number
  isCurrentSnapshot: (snapshotId: number) => boolean
}

export function createHarness(options: {
  now?: number
  random?: number
  currentSnapshotId?: number
  dispatchRetry?: (dispatch: Subagent429DispatchInput) => Promise<boolean>
} = {}): Harness {
  const scheduler = new FakeScheduler()
  const dispatches: Subagent429DispatchInput[] = []
  let currentSnapshotId = options.currentSnapshotId ?? 0
  const deps: Subagent429ControllerDeps = {
    scheduler,
    clock: () => options.now ?? 1_000_000,
    random: () => options.random ?? 0,
    isCurrentSnapshot: (snapshotId) => snapshotId === currentSnapshotId,
    ...(options.dispatchRetry === undefined
      ? {}
      : {
          dispatchRetry: async (dispatch) => {
            dispatches.push(dispatch)
            return options.dispatchRetry!(dispatch)
          },
        }),
  }
  const actualController = createSubagent429Controller(deps)
  const controller: HarnessController = {
    ...actualController,
    onSessionCreated: (sessionID, isChild, snapshotId = 0) =>
      actualController.onSessionCreated(sessionID, isChild, snapshotId),
    onIdle: (sessionID, snapshotId = 0) => actualController.onIdle(sessionID, snapshotId),
    getActiveDispatchTarget: (sessionID, snapshotId = 0) =>
      actualController.getActiveDispatchTarget(sessionID, snapshotId),
    onOtherError: (input) => actualController.onOtherError({ ...input, snapshotId: input.snapshotId ?? 0 }),
  }
  return {
    scheduler,
    dispatches,
    controller,
    get currentSnapshotId() { return currentSnapshotId },
    set currentSnapshotId(snapshotId: number) { currentSnapshotId = snapshotId },
    isCurrentSnapshot: (snapshotId) => snapshotId === currentSnapshotId,
  }
}

export function idle(kind: string, suppressIdleContinuation: boolean) {
  return { kind, suppressIdleContinuation }
}
