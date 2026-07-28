export type IdleSessionData = {
  aborted: boolean
  continuationCount: number
}

export type IdleContinuationState = {
  globalEnabled: boolean
  sessionOverrides: Map<string, boolean>
  sessionData: Map<string, IdleSessionData>
  nextGeneration: number
  sessionGenerations: Map<string, number>
  activeLeases: Map<string, { generation: number; token: symbol }>
  sessionLifecycleKinds: Map<string, "lazy" | "observed" | "deleted">
}

export type IdleContinuationLease = {
  isCurrent(): boolean
  release(): void
}

export function createIdleContinuationState(): IdleContinuationState {
  return {
    globalEnabled: false,
    sessionOverrides: new Map(),
    sessionData: new Map(),
    nextGeneration: 0,
    sessionGenerations: new Map(),
    activeLeases: new Map(),
    sessionLifecycleKinds: new Map(),
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

function allocateGeneration(state: IdleContinuationState, sessionID: string): number {
  const generation = state.nextGeneration + 1
  state.nextGeneration = generation
  state.sessionGenerations.set(sessionID, generation)
  state.activeLeases.delete(sessionID)
  return generation
}

export function beginIdleSession(state: IdleContinuationState, sessionID: string): void {
  if (state.sessionLifecycleKinds.get(sessionID) === "observed") return
  allocateGeneration(state, sessionID)
  state.sessionData.delete(sessionID)
  state.sessionLifecycleKinds.set(sessionID, "observed")
}

export function invalidateIdleSession(state: IdleContinuationState, sessionID: string): void {
  state.sessionGenerations.delete(sessionID)
  state.activeLeases.delete(sessionID)
  state.sessionData.delete(sessionID)
  state.sessionOverrides.delete(sessionID)
  state.sessionLifecycleKinds.set(sessionID, "deleted")
}

export function acquireIdleContinuationLease(
  state: IdleContinuationState,
  sessionID: string,
): IdleContinuationLease | undefined {
  const kind = state.sessionLifecycleKinds.get(sessionID)
  if (kind === "deleted") return undefined

  let generation = state.sessionGenerations.get(sessionID)
  if (generation === undefined || kind === undefined) {
    generation = allocateGeneration(state, sessionID)
    state.sessionLifecycleKinds.set(sessionID, "lazy")
  }
  if (state.activeLeases.has(sessionID)) return undefined

  const token = Symbol(sessionID)
  state.activeLeases.set(sessionID, { generation, token })
  const ownsActiveLease = (): boolean => {
    const active = state.activeLeases.get(sessionID)
    return state.sessionGenerations.get(sessionID) === generation
      && active !== undefined
      && active.generation === generation
      && active.token === token
  }

  return {
    isCurrent: ownsActiveLease,
    release() {
      if (ownsActiveLease()) state.activeLeases.delete(sessionID)
    },
  }
}

export function markSessionAborted(state: IdleContinuationState, sessionID: string): void {
  const kind = state.sessionLifecycleKinds.get(sessionID)
  if (kind === "deleted") return
  allocateGeneration(state, sessionID)
  if (kind === undefined) state.sessionLifecycleKinds.set(sessionID, "lazy")
  const data = getSessionData(state, sessionID)
  data.aborted = true
}

export function clearSession(state: IdleContinuationState, sessionID: string): void {
  state.sessionData.delete(sessionID)
  state.sessionOverrides.delete(sessionID)
}

export const DEFAULT_CONTINUATION_PROMPT =
  "Your todo list has unfinished items. Continue with the next pending or in-progress task. Do not ask for confirmation — proceed."
