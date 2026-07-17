import { candidateBlocker, blockedUntil, recoveryDeadline, scheduleDelay, scopeFor } from "./subagent-429-policy.ts"
import type { QueuedOutcome, Subagent429Decision, Subagent429DispatchInput, Subagent429ErrorInput, Subagent429IdleResult, Subagent429OtherErrorDecision, Subagent429OtherErrorInput, Subagent429PreparedSwitch, Subagent429Scheduler, Subagent429Scope, Subagent429Target } from "./subagent-429-controller.ts"

export type Session429Deps = {
  scheduler: Subagent429Scheduler
  clock: () => number
  random: () => number
  dispatchRetry?: (input: Subagent429DispatchInput) => Promise<boolean>
  logger: { debug(...args: unknown[]): void; info(...args: unknown[]): void; warn(...args: unknown[]): void }
}
type RetryDispatch = { kind: "retry"; target: Subagent429Target; agent?: string; reason: string; scope: Subagent429Scope; scopeKey: string; retriesUsed: number; retryOrdinal: number }
type SwitchDispatch = { kind: "switch"; target: Subagent429Target; agent?: string; reason: string; prepared: Subagent429PreparedSwitch }
type PreparedDispatch = RetryDispatch | SwitchDispatch
type PendingGate = {
  generation: number
  delayReady: boolean
  errorIdleObserved: boolean
  started: boolean
  dispatch: PreparedDispatch
  cancel?: () => void
}
type ActiveDispatch = {
  generation: number
  lifecycleGeneration: number
  dispatch: PreparedDispatch
  idleObserved: boolean
  queuedOutcome?: QueuedOutcome
  settled: boolean
  accounted: boolean
}

export class Session429State {
  private lifecycleGeneration = 0
  private timerGeneration = 0
  private nextDispatchGeneration = 0
  private initialPending = true
  private pending?: PendingGate
  private active?: ActiveDispatch
  private readonly retryCounts = new Map<string, number>()
  private readonly blocked = new Map<string, number>()
  private readonly lastRecoveryDeadlines = new Map<string, number>()
  private readonly sessionID: string
  private readonly deps: Session429Deps
  private readonly isLive: () => boolean
  private readonly remove: () => void

  constructor(sessionID: string, deps: Session429Deps, isLive: () => boolean, remove: () => void) {
    this.sessionID = sessionID
    this.deps = deps
    this.isLive = isLive
    this.remove = remove
  }

  activeTarget(): Subagent429Target | undefined { return this.active?.dispatch.target }

  stop(): void {
    if (!this.isLive()) return
    this.lifecycleGeneration++
    this.timerGeneration++
    this.nextDispatchGeneration++
    this.pending?.cancel?.()
    this.pending = undefined
    this.active = undefined
    this.remove()
  }

  on429(input: Subagent429ErrorInput): Subagent429Decision {
    const restricted = this.restriction(input)
    if (restricted) return restricted
    if (this.active) return this.queue429(input, this.active)
    if (this.pending) return { handled: true, action: "duplicate-outcome", dispatchGeneration: this.nextDispatchGeneration }
    return this.process429(input, false)
  }

  onOtherError(input: Subagent429OtherErrorInput): Subagent429OtherErrorDecision {
    const active = this.active
    if (!active) {
      this.stop()
      return { handled: false }
    }
    if (active.queuedOutcome) return { handled: true, action: "duplicate-outcome", dispatchGeneration: active.generation }
    active.queuedOutcome = { kind: "other", dispatchGeneration: active.generation, runGenericFallback: input.runGenericFallback }
    if (active.settled) this.processQueued(active)
    return { handled: true, action: "queued-other-error", dispatchGeneration: active.generation }
  }

  onIdle(): Subagent429IdleResult {
    if (this.initialPending) {
      this.stop()
      return { kind: "initial-succeeded", suppressIdleContinuation: false }
    }
    if (this.pending) {
      this.pending.errorIdleObserved = true
      this.maybeStart(this.pending)
      return { kind: "error-idle-observed", suppressIdleContinuation: true }
    }
    const active = this.active
    if (!active) return { kind: "untracked", suppressIdleContinuation: false }
    if (active.queuedOutcome?.kind === "429") {
      active.queuedOutcome.errorIdleObserved = true
      return { kind: "queued-error-idle-observed", suppressIdleContinuation: true }
    }
    active.idleObserved = true
    if (active.settled && !active.queuedOutcome) {
      this.stop()
      return { kind: "retry-succeeded", suppressIdleContinuation: false }
    }
    return { kind: "dispatch-idle-observed", suppressIdleContinuation: true }
  }

  private restriction(input: Subagent429ErrorInput): Subagent429Decision | undefined {
    const config = input.runtimeConfig
    if (!config.subagent429.enabled || !config.enabled) {
      this.stop()
      return { handled: false }
    }
    if (!config.dispatch) {
      this.deps.logger.info("subagent429 observe-only", this.logTarget(input.target))
      this.stop()
      return { handled: true, action: "observe-only" }
    }
    if (this.deps.dispatchRetry) return undefined
    this.deps.logger.warn("subagent429 dispatch stopped", { ...this.logTarget(input.target), reason: "dispatch-unavailable" })
    this.stop()
    return { handled: true, action: "stopped", reason: "dispatch-unavailable" }
  }

  private process429(input: Subagent429ErrorInput, errorIdleObserved: boolean): Subagent429Decision {
    const restricted = this.restriction(input)
    if (restricted) return restricted
    this.initialPending = false
    const scope = scopeFor(input.target, input.runtimeConfig)
    const retriesUsed = this.retryCounts.get(scope.key) ?? 0
    const observedAt = this.deps.clock()
    const deadline = recoveryDeadline(observedAt, input.classification.recoveryDelayMs)
    if (deadline !== undefined) this.lastRecoveryDeadlines.set(scope.key, deadline)
    if (retriesUsed >= input.runtimeConfig.subagent429.maxRetries) {
      this.blocked.set(scope.key, blockedUntil(this.lastRecoveryDeadlines.get(scope.key), observedAt, input.runtimeConfig.cooldownSeconds))
      const prepared = input.prepareSwitch(input.target, candidateBlocker(this.blocked, input.runtimeConfig, this.deps.clock))
      if (!prepared.ok) {
        this.deps.logger.warn("subagent429 switch stopped", { ...this.logTarget(input.target), scope: scope.scope, reason: prepared.reason })
        this.stop()
        return { handled: true, action: "stopped", reason: prepared.reason }
      }
      const dispatch: SwitchDispatch = {
        kind: "switch",
        target: prepared.prepared.target,
        ...(input.agent === undefined ? {} : { agent: input.agent }),
        reason: input.classification.reason,
        prepared: prepared.prepared,
      }
      this.installGate(dispatch, 0, errorIdleObserved)
      this.deps.logger.info("subagent429 switch gated", { ...this.logTarget(dispatch.target), attempt: prepared.prepared.attempt, delayMs: 0, scope: scope.scope, reason: dispatch.reason })
      return { handled: true, action: "switch-gated", attempt: prepared.prepared.attempt, target: dispatch.target }
    }
    const delayMs = scheduleDelay(retriesUsed, input.classification.recoveryDelayMs, this.deps.random)
    const dispatch: RetryDispatch = {
      kind: "retry",
      target: input.target,
      ...(input.agent === undefined ? {} : { agent: input.agent }),
      reason: input.classification.reason,
      scope: scope.scope,
      scopeKey: scope.key,
      retriesUsed,
      retryOrdinal: retriesUsed + 1,
    }
    this.installGate(dispatch, delayMs, errorIdleObserved)
    this.deps.logger.info("subagent429 retry gated", { ...this.logTarget(dispatch.target), retryOrdinal: dispatch.retryOrdinal, delayMs, scope: dispatch.scope, reason: dispatch.reason })
    return { handled: true, action: "retry-gated", delayMs, retryOrdinal: dispatch.retryOrdinal, scope: dispatch.scope }
  }

  private queue429(input: Subagent429ErrorInput, active: ActiveDispatch): Subagent429Decision {
    if (active.queuedOutcome) return { handled: true, action: "duplicate-outcome", dispatchGeneration: active.generation }
    active.queuedOutcome = { kind: "429", dispatchGeneration: active.generation, input, errorIdleObserved: false }
    if (active.settled) this.processQueued(active)
    return { handled: true, action: "queued-429", dispatchGeneration: active.generation }
  }

  private installGate(dispatch: PreparedDispatch, delayMs: number, errorIdleObserved: boolean): void {
    this.pending?.cancel?.()
    const generation = ++this.timerGeneration
    const gate: PendingGate = { generation, delayReady: false, errorIdleObserved, started: false, dispatch }
    this.pending = gate
    gate.cancel = this.deps.scheduler.schedule(delayMs, async () => {
      if (!this.isLive() || this.pending !== gate || this.timerGeneration !== generation) return
      gate.delayReady = true
      this.maybeStart(gate)
    })
    this.maybeStart(gate)
  }

  private maybeStart(gate: PendingGate): void {
    if (!this.isLive() || this.pending !== gate || gate.started || !gate.delayReady || !gate.errorIdleObserved) return
    gate.started = true
    gate.cancel?.()
    this.pending = undefined
    const active: ActiveDispatch = {
      generation: ++this.nextDispatchGeneration,
      lifecycleGeneration: this.lifecycleGeneration,
      dispatch: gate.dispatch,
      idleObserved: false,
      settled: false,
      accounted: false,
    }
    this.active = active
    void this.settle(active)
  }

  private async settle(active: ActiveDispatch): Promise<void> {
    let dispatched = false
    try {
      dispatched = await this.deps.dispatchRetry!({
        sessionID: this.sessionID,
        ...(active.dispatch.agent === undefined ? {} : { agent: active.dispatch.agent }),
        target: active.dispatch.target,
        reason: active.dispatch.reason,
      })
    } catch {
      dispatched = false
    }
    if (!this.isCurrent(active)) return
    active.settled = true
    const requestProven = dispatched || active.queuedOutcome !== undefined
    if (requestProven && !active.accounted) this.account(active)
    if (active.queuedOutcome) return this.processQueued(active)
    if (active.idleObserved) return this.stop()
    if (!dispatched) {
      this.deps.logger.warn("subagent429 dispatch stopped", { ...this.logTarget(active.dispatch.target), reason: "bare-false" })
      return this.stop()
    }
  }

  private processQueued(active: ActiveDispatch): void {
    if (!this.isCurrent(active) || !active.queuedOutcome) return
    const outcome = active.queuedOutcome
    this.active = undefined
    if (outcome.kind === "other") {
      this.stop()
      void outcome.runGenericFallback(active.dispatch.target).catch(() => {
        this.deps.logger.warn("subagent429 generic handoff failed", { ...this.logTarget(active.dispatch.target), reason: "handoff-threw" })
      })
      return
    }
    this.process429({ ...outcome.input, target: active.dispatch.target }, outcome.errorIdleObserved)
  }

  private account(active: ActiveDispatch): void {
    active.accounted = true
    if (active.dispatch.kind === "retry") this.retryCounts.set(active.dispatch.scopeKey, active.dispatch.retriesUsed + 1)
    else active.dispatch.prepared.commit()
  }

  private isCurrent(active: ActiveDispatch): boolean {
    return this.isLive() && this.active === active && this.lifecycleGeneration === active.lifecycleGeneration
  }

  private logTarget(target: Subagent429Target): { sessionID: string; providerID: string; modelID: string } {
    return { sessionID: this.sessionID, providerID: target.providerID, modelID: target.modelID }
  }
}
