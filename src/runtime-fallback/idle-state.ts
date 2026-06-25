export type IdleSessionData = {
  aborted: boolean
  continuationCount: number
}

export type IdleContinuationState = {
  globalEnabled: boolean
  sessionOverrides: Map<string, boolean>
  sessionData: Map<string, IdleSessionData>
}

export function createIdleContinuationState(): IdleContinuationState {
  return {
    globalEnabled: false,
    sessionOverrides: new Map(),
    sessionData: new Map(),
  }
}

export function isIdleContinuationEnabled(state: IdleContinuationState, sessionID: string): boolean {
  const override = state.sessionOverrides.get(sessionID)
  if (override !== undefined) return override
  return state.globalEnabled
}

export function getSessionData(state: IdleContinuationState, sessionID: string): IdleSessionData {
  let data = state.sessionData.get(sessionID)
  if (!data) {
    data = { aborted: false, continuationCount: 0 }
    state.sessionData.set(sessionID, data)
  }
  return data
}

export function markSessionAborted(state: IdleContinuationState, sessionID: string): void {
  const data = getSessionData(state, sessionID)
  data.aborted = true
}

export function clearSession(state: IdleContinuationState, sessionID: string): void {
  state.sessionData.delete(sessionID)
  state.sessionOverrides.delete(sessionID)
}

export const DEFAULT_CONTINUATION_PROMPT =
  "Your todo list has unfinished items. Continue with the next pending or in-progress task. Do not ask for confirmation — proceed."
