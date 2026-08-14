import type { OcmmClient } from "./dispatcher.ts"
import type { OcmmConfig } from "../config/schema.ts"
import {
  acquireIdleContinuationLease,
  clearSession,
  DEFAULT_CONTINUATION_PROMPT,
  getSessionData,
  isIdleContinuationEnabled,
  type IdleContinuationState,
} from "./idle-state.ts"
import { hasUnfinishedTodos } from "./todo-reader.ts"
import { log } from "../shared/logger.ts"

export type IdleContinuationDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  idleState?: IdleContinuationState
}

export async function handleIdleContinuation(deps: IdleContinuationDeps, sessionID: string): Promise<void> {
  const idleState = deps.idleState
  if (!idleState) return

  const lease = acquireIdleContinuationLease(idleState, sessionID)
  if (!lease) return

  try {
    const data = idleState.sessionData.get(sessionID)
    // ESC abort - never continue
    if (data?.aborted) return
    // Explicit non-retryable request errors are terminal for idle continuation.
    if (data?.idleStoppedByNonRetryableRequest) return

    // Not enabled - clean up
    if (!isIdleContinuationEnabled(idleState, sessionID)) {
      if (lease.isCurrent()) clearSession(idleState, sessionID)
      return
    }

    const cfg = deps.getConfig()
    const idleCfg = cfg.idleContinuation
    const maxContinuations = idleCfg?.maxContinuations ?? 20
    const count = data?.continuationCount ?? 0
    if (count >= maxContinuations) {
      if (lease.isCurrent()) clearSession(idleState, sessionID)
      return
    }

    if (!deps.client) return

    const hasUnfinished = await hasUnfinishedTodos(deps.client, sessionID)
    if (!lease.isCurrent()) return
    if (!hasUnfinished) {
      clearSession(idleState, sessionID)
      return
    }

    const prompt = idleCfg?.prompt ?? DEFAULT_CONTINUATION_PROMPT
    if (!lease.isCurrent()) return
    try {
      await deps.client.session.prompt({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text: prompt }] },
      })
      if (!lease.isCurrent()) return
      const sessionData = getSessionData(idleState, sessionID)
      sessionData.continuationCount = count + 1
    } catch (err) {
      log.warn("idle continuation prompt failed", { sessionID, error: String(err) })
      if (lease.isCurrent()) clearSession(idleState, sessionID)
    }
  } finally {
    lease.release()
  }
}
