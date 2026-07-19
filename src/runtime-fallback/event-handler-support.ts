import { entryExactlyMatchesModel, entryMatchesModel } from "../routing/resolver.ts"
import { matchRequirementSuccessor } from "../routing/model-upgrades.ts"
import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"
import type { Subagent429Target } from "./subagent-429-controller.ts"
import { isRecord } from "../shared/logger.ts"
import { resolveSessionLineageProperties } from "../shared/opencode-events.ts"
import { createFallbackState, modelKey, type FallbackState } from "./fallback-state.ts"
import type { OcmmClient } from "./dispatcher.ts"

export type ModelIdentity = { providerID: string; modelID: string }

const ABORT_NAMES = new Set(["AbortError", "DOMException"])

export function isExplicitRuntimeFallbackAbort(error: unknown): boolean {
  return isRecord(error) && error.isAbort === true
}

export function isRuntimeFallbackAbort(error: unknown): boolean {
  if (!isRecord(error)) return false
  const name = typeof error.name === "string" ? error.name : ""
  return ABORT_NAMES.has(name) || isExplicitRuntimeFallbackAbort(error)
}

export function resolveRuntimeFallbackSessionID(props: unknown): string {
  return resolveSessionLineageProperties(props)?.sessionID ?? ""
}

export function resolveRuntimeFallbackAgent(props: unknown): string | undefined {
  if (!isRecord(props)) return undefined
  if (typeof props.agent === "string") return props.agent
  if (isRecord(props.agent) && typeof props.agent.name === "string") return props.agent.name
  return undefined
}

export function resolveEventModelIdentity(props: unknown): ModelIdentity | null {
  if (!isRecord(props) || !isRecord(props.model)) return null
  const providerID = typeof props.model.providerID === "string" ? props.model.providerID : ""
  const modelID = typeof props.model.modelID === "string" ? props.model.modelID : ""
  return providerID && modelID ? { providerID, modelID } : null
}

export function parseModelIdentity(value: string | null | undefined): ModelIdentity | null {
  if (!value) return null
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) return null
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) }
}

export function resolveParentSessionID(props: unknown): string | undefined {
  return resolveSessionLineageProperties(props)?.parentSessionID
}

function matchingEntry(
  requirement: ModelRequirement | null | undefined,
  identity: ModelIdentity,
): FallbackEntry | undefined {
  if (!requirement) return undefined
  return requirement.fallbackChain.find((entry) =>
    entryExactlyMatchesModel(entry, identity.providerID, identity.modelID),
  )
    ?? matchRequirementSuccessor(requirement, identity.providerID, identity.modelID)
    ?? requirement.fallbackChain.find((entry) =>
      entryMatchesModel(entry, identity.providerID, identity.modelID),
    )
}

export function applyRequirementDefaults(
  requirement: ModelRequirement | null | undefined,
  entry: FallbackEntry,
): FallbackEntry {
  return entry.variant === undefined && requirement?.variant !== undefined
    ? { ...entry, variant: requirement.variant }
    : entry
}

/**
 * Build a retry target that retains the selected chain entry's inference
 * metadata while pinning dispatch to the provider/model that actually failed.
 */
export function resolveRetryTarget(
  requirement: ModelRequirement | null | undefined,
  identity: ModelIdentity,
): Subagent429Target {
  const template = matchingEntry(requirement, identity)
  const base = applyRequirementDefaults(
    requirement,
    template ?? { providers: [identity.providerID], model: identity.modelID },
  )
  const entry: FallbackEntry = { ...base, providers: [identity.providerID], model: identity.modelID }
  return { providerID: identity.providerID, modelID: identity.modelID, entry }
}

export function chainHeadIdentity(requirement: ModelRequirement | null): ModelIdentity | null {
  const head = requirement?.fallbackChain[0]
  const providerID = head?.providers[0]
  return head && providerID ? { providerID, modelID: head.model } : null
}

export function getOrCreateFallbackState(
  sessionStates: Map<string, FallbackState>,
  sessionID: string,
  requirement: ModelRequirement,
  identity: ModelIdentity,
): FallbackState {
  const existing = sessionStates.get(sessionID)
  if (existing) return existing

  const initialKey = modelKey(identity.providerID, identity.modelID)
  const state = createFallbackState(initialKey)
  state.activeModel = initialKey
  state.fallbackIndex = requirement.fallbackChain.findIndex((entry) =>
    entryExactlyMatchesModel(entry, identity.providerID, identity.modelID),
  )
  if (state.fallbackIndex < 0 && !matchRequirementSuccessor(
    requirement,
    identity.providerID,
    identity.modelID,
  )) {
    state.fallbackIndex = requirement.fallbackChain.findIndex((entry) =>
      entryMatchesModel(entry, identity.providerID, identity.modelID),
    )
  }
  sessionStates.set(sessionID, state)
  return state
}

/**
 * Coordinates event lifecycles with dispatcher I/O. Invalidating a session
 * unblocks stale abort/messages/prompt calls and lets a replacement lifecycle
 * wait for that stale dispatcher ownership to leave its session-ID lock.
 */
export type RuntimeFallbackSessionLifecycle = {
  beginSession: (sessionID: string) => number
  hasSession: (sessionID: string) => boolean
  invalidateSession: (sessionID: string) => void
  currentGeneration: (sessionID: string) => number
  isCurrent: (sessionID: string, generation: number) => boolean
  trackDispatch: <T>(sessionID: string, generation: number, promise: Promise<T>) => Promise<T>
  waitForStaleDispatches: (sessionID: string, generation: number) => Promise<void>
  guardedClient: (sessionID: string, generation: number) => OcmmClient
}

export function createRuntimeFallbackSessionLifecycle(client: OcmmClient | undefined): RuntimeFallbackSessionLifecycle {
  const sessionGenerations = new Map<string, number>()
  const cancellationSignals = new Map<number, { promise: Promise<void>; cancel: () => void }>()
  const activeDispatches = new Map<string, Map<number, Set<Promise<unknown>>>>()
  let nextGeneration = 0

  const createCancellationSignal = () => {
    let cancel!: () => void
    const promise = new Promise<void>((resolve) => { cancel = resolve })
    return { promise, cancel }
  }
  const beginSession = (sessionID: string): number => {
    const previous = sessionGenerations.get(sessionID)
    if (previous !== undefined) {
      cancellationSignals.get(previous)?.cancel()
      cancellationSignals.delete(previous)
    }
    const generation = ++nextGeneration
    sessionGenerations.set(sessionID, generation)
    cancellationSignals.set(generation, createCancellationSignal())
    return generation
  }
  const hasSession = (sessionID: string): boolean => sessionGenerations.has(sessionID)
  const invalidateSession = (sessionID: string): void => {
    const generation = sessionGenerations.get(sessionID)
    if (generation !== undefined) {
      cancellationSignals.get(generation)?.cancel()
      cancellationSignals.delete(generation)
    }
    nextGeneration++
    sessionGenerations.delete(sessionID)
  }
  const currentGeneration = (sessionID: string): number =>
    sessionGenerations.get(sessionID) ?? beginSession(sessionID)
  const isCurrent = (sessionID: string, generation: number): boolean =>
    sessionGenerations.get(sessionID) === generation
  const trackDispatch = <T>(sessionID: string, generation: number, promise: Promise<T>): Promise<T> => {
    let byGeneration = activeDispatches.get(sessionID)
    if (!byGeneration) {
      byGeneration = new Map()
      activeDispatches.set(sessionID, byGeneration)
    }
    let dispatches = byGeneration.get(generation)
    if (!dispatches) {
      dispatches = new Set()
      byGeneration.set(generation, dispatches)
    }
    const tracked = promise as Promise<unknown>
    dispatches.add(tracked)
    const remove = () => {
      dispatches.delete(tracked)
      if (dispatches.size === 0) byGeneration.delete(generation)
      if (byGeneration.size === 0) activeDispatches.delete(sessionID)
    }
    void tracked.then(remove, remove)
    return promise
  }
  const waitForStaleDispatches = async (sessionID: string, generation: number): Promise<void> => {
    const byGeneration = activeDispatches.get(sessionID)
    if (!byGeneration) return
    const stale = [...byGeneration.entries()]
      .filter(([otherGeneration]) => otherGeneration !== generation)
      .flatMap(([, dispatches]) => [...dispatches])
    if (stale.length > 0) await Promise.allSettled(stale)
  }
  const guardedClient = (sessionID: string, generation: number): OcmmClient => ({
    session: {
      async abort(args) {
        if (!isCurrent(sessionID, generation) || !client) return undefined
        const cancelled = cancellationSignals.get(generation)?.promise ?? Promise.resolve()
        return Promise.race([client.session.abort(args), cancelled])
      },
      async messages(args) {
        if (!isCurrent(sessionID, generation) || !client) return { messages: [] }
        const cancelled = cancellationSignals.get(generation)?.promise ?? Promise.resolve()
        const response = await Promise.race([client.session.messages(args), cancelled])
        return isCurrent(sessionID, generation) ? response : { messages: [] }
      },
      async prompt(args) {
        if (!isCurrent(sessionID, generation) || !client) throw new Error("runtime fallback session is stale")
        const cancelled = cancellationSignals.get(generation)?.promise ?? Promise.resolve()
        const response = await Promise.race([client.session.prompt(args), cancelled])
        if (!isCurrent(sessionID, generation)) throw new Error("runtime fallback session became stale")
        return response
      },
    },
  })

  return {
    beginSession,
    hasSession,
    invalidateSession,
    currentGeneration,
    isCurrent,
    trackDispatch,
    waitForStaleDispatches,
    guardedClient,
  }
}
