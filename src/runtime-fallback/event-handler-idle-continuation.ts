import type { OcmmClient } from "./dispatcher.ts"
import type { OcmmConfig } from "../config/schema.ts"
import {
  isIdleContinuationEnabled,
  clearSession,
  getSessionData,
  DEFAULT_CONTINUATION_PROMPT,
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

  const data = idleState.sessionData.get(sessionID)
  // ESC abort - never continue
  if (data?.aborted) {
    clearSession(idleState, sessionID)
    return
  }

  // Not enabled - clean up
  if (!isIdleContinuationEnabled(idleState, sessionID)) {
    clearSession(idleState, sessionID)
    return
  }

  const cfg = deps.getConfig()
  const idleCfg = cfg.idleContinuation
  const maxContinuations = idleCfg?.maxContinuations ?? 20

  const count = data?.continuationCount ?? 0
  if (count >= maxContinuations) {
    clearSession(idleState, sessionID)
    return
  }

  if (!deps.client) return

  const hasUnfinished = await hasUnfinishedTodos(deps.client, sessionID)
  if (!hasUnfinished) {
    clearSession(idleState, sessionID)
    return
  }

  const prompt = idleCfg?.prompt ?? DEFAULT_CONTINUATION_PROMPT
  try {
    await deps.client.session.prompt({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: prompt }] },
    })
    const sessionData = getSessionData(idleState, sessionID)
    sessionData.continuationCount = count + 1
  } catch (err) {
    log.warn("idle continuation prompt failed", { sessionID, error: String(err) })
    clearSession(idleState, sessionID)
  }
}
