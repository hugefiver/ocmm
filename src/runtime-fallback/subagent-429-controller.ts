import { log as defaultLog } from "../shared/logger.ts"
import type { FallbackEntry } from "../shared/types.ts"
import type { FallbackCandidateBlocker, PeekResult } from "./fallback-state.ts"
import { Session429State, type Session429Deps } from "./subagent-429-session.ts"
import type { RuntimeFallbackConfig } from "../config/schema.ts"

export type Subagent429Scope = "model" | "provider"
export type Subagent429Target = { providerID: string; modelID: string; entry: FallbackEntry }
export type Subagent429Scheduler = { schedule(delayMs: number, run: () => Promise<void>): () => void }
export type Subagent429DispatchInput = {
  sessionID: string
  agent?: string
  target: Subagent429Target
  reason: string
}
export type Subagent429PreparedSwitch = { target: Subagent429Target; attempt: number; commit: () => void }
export type Subagent429PrepareFailure = Extract<PeekResult, { ok: false }>["reason"] | "dispatch-failed"
export type Subagent429PrepareResult =
  | { ok: true; prepared: Subagent429PreparedSwitch }
  | { ok: false; reason: Subagent429PrepareFailure }
export type Subagent429ErrorInput = {
  sessionID: string
  agent?: string
  target: Subagent429Target
  classification: { reason: string; recoveryDelayMs?: number }
  runtimeConfig: RuntimeFallbackConfig
  prepareSwitch: (
    failedTarget: Subagent429Target,
    isCandidateBlocked: FallbackCandidateBlocker,
  ) => Subagent429PrepareResult
}
export type Subagent429GenericHandoff = (activeTarget: Subagent429Target) => Promise<void>
export type Subagent429OtherErrorInput = {
  sessionID: string
  runGenericFallback: Subagent429GenericHandoff
}
export type Queued429 = {
  kind: "429"
  dispatchGeneration: number
  input: Subagent429ErrorInput
  errorIdleObserved: boolean
}
export type QueuedOtherError = {
  kind: "other"
  dispatchGeneration: number
  runGenericFallback: Subagent429GenericHandoff
}
export type QueuedOutcome = Queued429 | QueuedOtherError
export type Subagent429Decision =
  | { handled: false }
  | { handled: true; action: "retry-gated"; delayMs: number; retryOrdinal: number; scope: Subagent429Scope }
  | { handled: true; action: "switch-gated"; attempt: number; target: Subagent429Target }
  | { handled: true; action: "queued-429"; dispatchGeneration: number }
  | { handled: true; action: "duplicate-outcome"; dispatchGeneration: number }
  | { handled: true; action: "observe-only" }
  | { handled: true; action: "stopped"; reason: Subagent429PrepareFailure | "dispatch-unavailable" }
export type Subagent429OtherErrorDecision =
  | { handled: false }
  | { handled: true; action: "queued-other-error"; dispatchGeneration: number }
  | { handled: true; action: "duplicate-outcome"; dispatchGeneration: number }
export type Subagent429IdleResult = {
  kind:
    | "untracked"
    | "initial-succeeded"
    | "error-idle-observed"
    | "dispatch-idle-observed"
    | "queued-error-idle-observed"
    | "retry-succeeded"
  suppressIdleContinuation: boolean
}
export type Subagent429Controller = {
  onSessionCreated(sessionID: string, isChild: boolean): void
  on429(input: Subagent429ErrorInput): Subagent429Decision
  onOtherError(input: Subagent429OtherErrorInput): Subagent429OtherErrorDecision
  onIdle(sessionID: string): Subagent429IdleResult
  onDeleted(sessionID: string): void
  getActiveDispatchTarget(sessionID: string): Subagent429Target | undefined
}
export type Subagent429ControllerDeps = {
  scheduler?: Subagent429Scheduler
  clock?: () => number
  random?: () => number
  dispatchRetry?: (input: Subagent429DispatchInput) => Promise<boolean>
  logger?: Pick<typeof defaultLog, "debug" | "info" | "warn">
}

const defaultScheduler: Subagent429Scheduler = {
  schedule(delayMs, run) {
    const handle = setTimeout(() => { void run() }, delayMs)
    return () => clearTimeout(handle)
  },
}

export function createSubagent429Controller(deps: Subagent429ControllerDeps): Subagent429Controller {
  const sessions = new Map<string, Session429State>()
  const stateDeps: Session429Deps = {
    scheduler: deps.scheduler ?? defaultScheduler,
    clock: deps.clock ?? Date.now,
    random: deps.random ?? Math.random,
    ...(deps.dispatchRetry === undefined ? {} : { dispatchRetry: deps.dispatchRetry }),
    logger: deps.logger ?? defaultLog,
  }

  function createSession(sessionID: string): Session429State {
    let state!: Session429State
    state = new Session429State(sessionID, stateDeps, () => sessions.get(sessionID) === state, () => {
      if (sessions.get(sessionID) === state) sessions.delete(sessionID)
    })
    return state
  }

  return {
    onSessionCreated(sessionID, isChild) {
      sessions.get(sessionID)?.stop()
      if (!isChild) return
      sessions.set(sessionID, createSession(sessionID))
    },
    on429(input) {
      return sessions.get(input.sessionID)?.on429(input) ?? { handled: false }
    },
    onOtherError(input) {
      return sessions.get(input.sessionID)?.onOtherError(input) ?? { handled: false }
    },
    onIdle(sessionID) {
      return sessions.get(sessionID)?.onIdle() ?? { kind: "untracked", suppressIdleContinuation: false }
    },
    onDeleted(sessionID) {
      sessions.get(sessionID)?.stop()
    },
    getActiveDispatchTarget(sessionID) {
      return sessions.get(sessionID)?.activeTarget()
    },
  }
}
