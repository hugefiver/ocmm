import { log as defaultLog } from "../shared/logger.ts"
import type { FallbackEntry } from "../shared/types.ts"
import type { FallbackCandidateBlocker, PeekResult } from "./fallback-state.ts"
import { Session429State, type Session429Deps } from "./subagent-429-session.ts"
import type { RuntimeFallbackConfig } from "../config/schema.ts"
import { canonicalizeReviewAgentName } from "../review-agents/names.ts"

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

// --- Durable interruption correlation types (additive) ---

export type SubagentInterruptionCorrelation = {
  childSessionID: string
  parentSessionID: string
  callID?: string
  agent?: string
  taskID?: string
  terminalTaskErrorObserved: boolean
  retryableChildErrorObserved: boolean
  explicitlyAborted: boolean
}

export type SubagentSessionLineageInput = {
  childSessionID: string
  parentSessionID: string
  agent?: string
}

export type SubagentTaskPartEvidence = {
  childSessionID: string
  parentSessionID: string
  parentPartID?: string
  callID?: string
  agent?: string
  taskID?: string
  terminalTaskErrorObserved: true
}

export type SubagentCorrelationLookup = {
  childSessionID?: string
  parentSessionID?: string
  parentPartID?: string
  taskID?: string
}

export type Subagent429Controller = {
  onSessionCreated(sessionID: string, isChild: boolean): void
  on429(input: Subagent429ErrorInput): Subagent429Decision
  onOtherError(input: Subagent429OtherErrorInput): Subagent429OtherErrorDecision
  onIdle(sessionID: string): Subagent429IdleResult
  onDeleted(sessionID: string): void
  getActiveDispatchTarget(sessionID: string): Subagent429Target | undefined
  recordSessionLineage(input: SubagentSessionLineageInput): "recorded" | "untracked"
  recordTaskPart(input: SubagentTaskPartEvidence): "recorded" | "duplicate" | "untracked"
  markRetryableChildError(childSessionID: string): void
  markExplicitAbort(childSessionID: string): void
  getInterruptionCorrelation(input: SubagentCorrelationLookup): Readonly<SubagentInterruptionCorrelation> | undefined
  claimInterruptionNotice(input: SubagentCorrelationLookup): boolean
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

export const INACTIVE_CORRELATION_GRACE_MS = 5 * 60_000
export const MAX_INACTIVE_CORRELATION_RECORDS = 256

type DurableChildRecord = {
  correlation?: SubagentInterruptionCorrelation
  retry?: Session429State
  inactiveSince?: number
  seenParentParts: Set<string>
  parentEvidenceIDs: Set<string>
  claimedNotices: Set<string>
}

export function createSubagent429Controller(deps: Subagent429ControllerDeps): Subagent429Controller {
  const sessions = new Map<string, DurableChildRecord>()
  const clock = deps.clock ?? Date.now
  const stateDeps: Session429Deps = {
    scheduler: deps.scheduler ?? defaultScheduler,
    clock,
    random: deps.random ?? Math.random,
    ...(deps.dispatchRetry === undefined ? {} : { dispatchRetry: deps.dispatchRetry }),
    logger: deps.logger ?? defaultLog,
  }

  function markInactive(record: DurableChildRecord): void {
    record.inactiveSince = clock()
  }

  function refreshInactiveGrace(record: DurableChildRecord): void {
    if (record.retry === undefined) markInactive(record)
  }

  function pruneInactiveRecords(): void {
    const now = clock()
    for (const [sessionID, record] of sessions) {
      if (record.retry !== undefined || record.inactiveSince === undefined) continue
      if (now - record.inactiveSince >= INACTIVE_CORRELATION_GRACE_MS) sessions.delete(sessionID)
    }

    const inactive = [...sessions.entries()]
      .filter(([, record]) => record.retry === undefined)
      .sort(([, left], [, right]) => (left.inactiveSince ?? now) - (right.inactiveSince ?? now))
    for (const [sessionID] of inactive.slice(0, Math.max(0, inactive.length - MAX_INACTIVE_CORRELATION_RECORDS))) {
      sessions.delete(sessionID)
    }
  }

  function createRetryState(sessionID: string, record: DurableChildRecord): Session429State {
    let retry!: Session429State
    retry = new Session429State(
      sessionID,
      stateDeps,
      () => {
        const current = sessions.get(sessionID)
        return current === record && current.retry === retry
      },
      () => {
        // Stop callback clears only retry state. Preserve durable correlation
        // for the bounded late-event grace window; lazy public-path pruning
        // removes it when OpenCode omits session.deleted.
        const current = sessions.get(sessionID)
        if (current === record && current.retry === retry) {
          current.retry = undefined
          markInactive(current)
        }
      },
    )
    return retry
  }

  function dedupKey(input: SubagentTaskPartEvidence): string {
    const identity = input.parentPartID ?? input.callID ?? input.taskID ?? input.childSessionID
    return `${input.parentSessionID}:${identity}`
  }

  return {
    onSessionCreated(sessionID, isChild) {
      pruneInactiveRecords()
      // OpenCode can replay session.created while the child remains active.
      // Preserve its retry state and durable correlation in that case. A
      // session.deleted call removes the record, so delete→recreate still
      // starts a fresh lifecycle below.
      if (sessions.has(sessionID)) return
      if (!isChild) return
      const record: DurableChildRecord = {
        seenParentParts: new Set(),
        parentEvidenceIDs: new Set(),
        claimedNotices: new Set(),
      }
      record.retry = createRetryState(sessionID, record)
      sessions.set(sessionID, record)
    },
    on429(input) {
      pruneInactiveRecords()
      const decision = sessions.get(input.sessionID)?.retry?.on429(input) ?? { handled: false }
      pruneInactiveRecords()
      return decision
    },
    onOtherError(input) {
      pruneInactiveRecords()
      const decision = sessions.get(input.sessionID)?.retry?.onOtherError(input) ?? { handled: false }
      pruneInactiveRecords()
      return decision
    },
    onIdle(sessionID) {
      pruneInactiveRecords()
      const result = sessions.get(sessionID)?.retry?.onIdle() ?? { kind: "untracked", suppressIdleContinuation: false }
      pruneInactiveRecords()
      return result
    },
    onDeleted(sessionID) {
      pruneInactiveRecords()
      const record = sessions.get(sessionID)
      record?.retry?.stop()
      sessions.delete(sessionID)
    },
    getActiveDispatchTarget(sessionID) {
      pruneInactiveRecords()
      return sessions.get(sessionID)?.retry?.activeTarget()
    },
    recordSessionLineage(input) {
      pruneInactiveRecords()
      const record = sessions.get(input.childSessionID)
      if (!record) return "untracked"
      // Canonicalize a supplied runtime review-agent alias (e.g.
      // oracle-second -> oracle-2nd). Other agent names are preserved.
      const canonicalAgent = input.agent === undefined
        ? undefined
        : (canonicalizeReviewAgentName(input.agent) ?? input.agent)
      record.correlation = {
        childSessionID: input.childSessionID,
        parentSessionID: input.parentSessionID,
        ...(canonicalAgent === undefined ? {} : { agent: canonicalAgent }),
        terminalTaskErrorObserved: false,
        retryableChildErrorObserved: false,
        explicitlyAborted: false,
      }
      return "recorded"
    },
    recordTaskPart(input) {
      pruneInactiveRecords()
      const record = sessions.get(input.childSessionID)
      if (!record) return "untracked"
      // Require matching child/parent lineage. The correlation must already
      // exist (recordSessionLineage ran first) OR this is the first evidence
      // for an already-tracked child - either way the child/parent must match.
      if (record.correlation) {
        if (record.correlation.childSessionID !== input.childSessionID
          || record.correlation.parentSessionID !== input.parentSessionID) {
          return "untracked"
        }
      } else {
        // No correlation yet - create one from the task part evidence. This
        // supports the "part-first" arrival order where recordSessionLineage
        // ran but the correlation was empty, OR (defensively) a child that
        // was tracked but had no lineage recorded. The child/parent match is
        // implicitly satisfied because the record exists for input.childSessionID.
        record.correlation = {
          childSessionID: input.childSessionID,
          parentSessionID: input.parentSessionID,
          ...(input.agent === undefined ? {} : {
            agent: canonicalizeReviewAgentName(input.agent) ?? input.agent,
          }),
          terminalTaskErrorObserved: false,
          retryableChildErrorObserved: false,
          explicitlyAborted: false,
        }
      }
      refreshInactiveGrace(record)
      const key = dedupKey(input)
      if (record.seenParentParts.has(key)) return "duplicate"
      record.seenParentParts.add(key)
      // Store parent evidence IDs for parentPartID and callID lookups. A
      // provider callID is never stored without the parent-session constraint
      // (the constraint is enforced by the correlation match above).
      if (input.parentPartID !== undefined) record.parentEvidenceIDs.add(input.parentPartID)
      if (input.callID !== undefined) record.parentEvidenceIDs.add(input.callID)
      // Copy taskID only when evidence supplied one - never fabricate from childSessionID.
      if (input.taskID !== undefined) record.correlation.taskID = input.taskID
      if (input.callID !== undefined && record.correlation.callID === undefined) {
        record.correlation.callID = input.callID
      }
      if (input.agent !== undefined && record.correlation.agent === undefined) {
        const canonical = canonicalizeReviewAgentName(input.agent) ?? input.agent
        record.correlation.agent = canonical
      }
      record.correlation.terminalTaskErrorObserved = true
      return "recorded"
    },
    markRetryableChildError(childSessionID) {
      pruneInactiveRecords()
      const record = sessions.get(childSessionID)
      if (!record?.correlation) return
      refreshInactiveGrace(record)
      record.correlation.retryableChildErrorObserved = true
    },
    markExplicitAbort(childSessionID) {
      pruneInactiveRecords()
      const record = sessions.get(childSessionID)
      if (!record) return
      if (record.correlation) record.correlation.explicitlyAborted = true
      // Stop retry/timers/generations but preserve durable correlation.
      // The identity-checked stop callback clears record.retry only.
      record.retry?.stop()
      if (record.retry === undefined) markInactive(record)
      pruneInactiveRecords()
    },
    getInterruptionCorrelation(input) {
      pruneInactiveRecords()
      // Resolve by childSessionID first.
      let record: DurableChildRecord | undefined
      if (input.childSessionID !== undefined) {
        record = sessions.get(input.childSessionID)
      }
      // taskID exact lookup scans existing records for a stored taskID.
      // childSessionID is NEVER treated as taskID.
      if (!record && input.taskID !== undefined) {
        for (const candidate of sessions.values()) {
          if (candidate.correlation?.taskID === input.taskID) {
            record = candidate
            break
          }
        }
      }
      if (!record?.correlation) return undefined
      const correlation = record.correlation
      // parentSessionID must match when supplied.
      if (input.parentSessionID !== undefined && correlation.parentSessionID !== input.parentSessionID) {
        return undefined
      }
      // parentPartID must be in evidence IDs when supplied.
      if (input.parentPartID !== undefined && !record.parentEvidenceIDs.has(input.parentPartID)) {
        return undefined
      }
      return correlation
    },
    claimInterruptionNotice(input) {
      pruneInactiveRecords()
      // Requires a resolved non-aborted correlation and an explicit lookup.taskID.
      if (input.taskID === undefined) return false
      let record: DurableChildRecord | undefined = input.childSessionID !== undefined
        ? sessions.get(input.childSessionID)
        : undefined
      // Fall back to taskID lookup if childSessionID was not supplied or did not match.
      if (!record && input.taskID !== undefined) {
        for (const candidate of sessions.values()) {
          if (candidate.correlation?.taskID === input.taskID) {
            // Still enforce parentSessionID/parentPartID when supplied.
            if (input.parentSessionID !== undefined
              && candidate.correlation.parentSessionID !== input.parentSessionID) {
              continue
            }
            if (input.parentPartID !== undefined
              && !candidate.parentEvidenceIDs.has(input.parentPartID)) {
              continue
            }
            record = candidate
            break
          }
        }
      }
      if (!record?.correlation) return false
      const correlation = record.correlation
      if (correlation.explicitlyAborted) return false
      // parentSessionID must match when supplied.
      if (input.parentSessionID !== undefined && correlation.parentSessionID !== input.parentSessionID) {
        return false
      }
      // parentPartID must be in evidence IDs when supplied.
      if (input.parentPartID !== undefined && !record.parentEvidenceIDs.has(input.parentPartID)) {
        return false
      }
      // When correlation already stores a task ID, the explicit value must match.
      if (correlation.taskID !== undefined && correlation.taskID !== input.taskID) {
        return false
      }
      // When correlation has no stored taskID, accept the explicit output-adapter
      // taskID without rewriting it as a child ID.
      const claimKey = `${correlation.parentSessionID}:${input.parentPartID ?? input.taskID}`
      if (record.claimedNotices.has(claimKey)) return false
      record.claimedNotices.add(claimKey)
      return true
    },
  }
}
