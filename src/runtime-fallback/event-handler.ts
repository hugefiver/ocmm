import { classifyError, type ErrorClassification } from "./error-classifier.ts"
import {
  createFallbackState,
  markModelFailed,
  modelKey,
  peekNextFallback,
  commitFallback,
  type FallbackState,
} from "./fallback-state.ts"
import { dispatchFallbackRetry, isDispatchInFlight, type OcmmClient } from "./dispatcher.ts"
import { entryExactlyMatchesModel, entryMatchesModel, resolveEffectiveRequirement } from "../routing/resolver.ts"
import { matchRequirementSuccessor } from "../routing/model-upgrades.ts"
import type { OcmmConfig } from "../config/schema.ts"
import type { FallbackEntry } from "../shared/types.ts"
import { clearSessionIntent as defaultClearSessionIntent } from "../hooks/chat-message.ts"
import {
  isIdleContinuationEnabled,
  markSessionAborted,
  getSessionData,
  clearSession,
  DEFAULT_CONTINUATION_PROMPT,
  type IdleContinuationState,
} from "./idle-state.ts"
import { hasUnfinishedTodos } from "./todo-reader.ts"
import { isRecord, log } from "../shared/logger.ts"

const ABORT_NAMES = new Set([
  "AbortError",
  "MessageAbortedError",
  "DOMException",
])

function isAbortError(error: unknown): boolean {
  if (!isRecord(error)) return false
  const name = typeof error.name === "string" ? error.name : ""
  if (ABORT_NAMES.has(name)) return true
  if (error.isAbort === true) return true
  return false
}

function resolveSessionID(props: unknown): string {
  if (!isRecord(props)) return ""
  if (typeof props.sessionID === "string") return props.sessionID
  if (isRecord(props.session) && typeof props.session.id === "string") {
    return props.session.id
  }
  return ""
}

function resolveAgent(props: unknown): string | undefined {
  if (!isRecord(props)) return undefined
  if (typeof props.agent === "string") return props.agent
  if (isRecord(props.agent) && typeof props.agent.name === "string") {
    return props.agent.name
  }
  return undefined
}

function resolveEventModel(props: unknown): { providerID: string; modelID: string } | null {
  if (!isRecord(props)) return null
  const model = props.model
  if (!isRecord(model)) return null
  const providerID = typeof model.providerID === "string" ? model.providerID : ""
  const modelID = typeof model.modelID === "string" ? model.modelID : ""
  if (!providerID || !modelID) return null
  return { providerID, modelID }
}

function parseRegisteredModel(value: string | undefined): { providerID: string; modelID: string } | null {
  if (!value) return null
  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) return null
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) }
}

export type RuntimeFallbackDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
  clearSessionIntent?: (sessionID: string) => void
  registeredAgentModels?: ReadonlyMap<string, string>
}

export function createRuntimeFallbackEventHandler(deps: RuntimeFallbackDeps): (
  input: unknown,
) => Promise<void> {
  const sessionStates = new Map<string, FallbackState>()

  return async (raw) => {
    if (!isRecord(raw)) return
    const event = isRecord(raw.event) ? raw.event : raw
    const eventType = typeof event.type === "string" ? event.type : ""
    if (!eventType) return

    const props = isRecord(event.properties) ? event.properties : event
    const sessionID = resolveSessionID(props)

    if (eventType === "session.created") {
      if (sessionID) sessionStates.delete(sessionID)
      return
    }

    if (eventType === "session.deleted") {
      if (sessionID) {
        (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
        sessionStates.delete(sessionID)
        if (deps.idleState) clearSession(deps.idleState, sessionID)
      }
      return
    }

    if (eventType === "session.idle") {
      if (sessionID) {
        (deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
        // Do NOT delete sessionStates here — the session may still be live
        // and a later session.error must continue from existing fallback
        // state (fallbackIndex, activeModel, attempts). Only session.deleted
        // and session.created reset fallback state.
        await handleIdleContinuation(deps, sessionID)
      }
      return
    }

    if (eventType !== "session.error") return

    const cfg = deps.getConfig()
    if (!cfg.runtimeFallback.enabled) return
    if (!sessionID) {
      log.debug("session.error without sessionID; skipping")
      return
    }

    const error = props.error
    if (isAbortError(error)) {
      if (deps.idleState) {
        markSessionAborted(deps.idleState, sessionID)
      }
      log.debug(`session.error abort (likely our own); skipping`)
      return
    }
    if (isDispatchInFlight(sessionID)) {
      log.debug(`session.error while retry in flight; skipping`)
      return
    }

    const classification: ErrorClassification = classifyError(error, cfg.runtimeFallback)
    const agent = resolveAgent(props)
    log.info(
      `session.error: session=${sessionID.slice(0, 16)}… agent=${agent ?? "<none>"} ` +
        `retryable=${classification.retryable} reason=${classification.reason}`,
    )
    if (!classification.retryable) return

    const effective = agent
      ? resolveEffectiveRequirement({
          agentName: agent,
          agentsConfig: cfg.agents,
          categoriesConfig: cfg.categories,
        })
      : null
    const requirement = effective?.requirement ?? null
    if (!requirement || requirement.fallbackChain.length <= 1) {
      log.info(`no fallback chain configured for agent=${agent ?? "<none>"}; skipping`)
      return
    }

    const eventModel = resolveEventModel(props)

    // Initialize from the actual failed model. Models outside the static chain
    // start at -1 so chain index 0 remains eligible.
    let state = sessionStates.get(sessionID)
    if (!state) {
      const head = requirement.fallbackChain[0]
      const chainHeadModel = head
        ? { providerID: head.providers[0] ?? "", modelID: head.model }
        : null
      const registeredModel = agent
        ? parseRegisteredModel(deps.registeredAgentModels?.get(agent))
        : null
      const initialModel = eventModel ?? registeredModel ?? chainHeadModel
      if (!initialModel) {
        log.info(`could not determine initial model for agent=${agent ?? "<none>"}; skipping`)
        return
      }
      const initialKey = modelKey(initialModel.providerID, initialModel.modelID)
      state = createFallbackState(initialKey)
      state.activeModel = initialKey
      state.fallbackIndex = requirement.fallbackChain.findIndex((entry) =>
        entryExactlyMatchesModel(entry, initialModel.providerID, initialModel.modelID),
      )
      if (state.fallbackIndex < 0 && !matchRequirementSuccessor(
        requirement,
        initialModel.providerID,
        initialModel.modelID,
      )) {
        state.fallbackIndex = requirement.fallbackChain.findIndex((entry) =>
          entryMatchesModel(entry, initialModel.providerID, initialModel.modelID),
        )
      }
      sessionStates.set(sessionID, state)
    }

    // Priority order for the failed-model key:
    // 1. Explicit model from the event payload.
    // 2. The state's activeModel (previously dispatched fallback model).
    // 3. The agent's primary fallback-chain entry (first entry).
    let justFailedKey: string | null = null
    if (eventModel) {
      justFailedKey = modelKey(eventModel.providerID, eventModel.modelID)
    } else if (state.activeModel) {
      justFailedKey = state.activeModel
    } else if (requirement.fallbackChain[0]) {
      const primary: FallbackEntry = requirement.fallbackChain[0]
      const primaryProvider = primary.providers[0] ?? ""
      justFailedKey = modelKey(primaryProvider, primary.model)
    }
    if (!justFailedKey) {
      log.info(`could not determine failed model for agent=${agent ?? "<none>"}; skipping`)
      return
    }

    markModelFailed(state, justFailedKey)

    const peek = peekNextFallback(
      state,
      requirement,
      justFailedKey,
      cfg.runtimeFallback.maxAttempts,
      cfg.runtimeFallback.cooldownSeconds,
    )
    if (!peek.ok) {
      log.warn(`fallback exhausted: ${peek.reason} (session=${sessionID.slice(0, 16)}…)`)
      return
    }

    log.info(
      `fallback attempt ${peek.nextAttempts}/${cfg.runtimeFallback.maxAttempts}: ` +
        `model=${peek.entry.providers[0] ?? ""}/${peek.entry.model}`,
    )

    if (!cfg.runtimeFallback.dispatch) {
      log.info(`dispatch disabled; observe-only`)
      return
    }
    if (!deps.client) {
      log.warn(`no client available; cannot dispatch (observe-only)`)
      return
    }

    const dispatched = await dispatchFallbackRetry({
      client: deps.client,
      sessionID,
      ...(deps.directory !== undefined ? { directory: deps.directory } : {}),
      ...(agent !== undefined ? { agent } : {}),
      newEntry: peek.entry,
      reason: classification.reason,
    })
    if (dispatched) {
      commitFallback(state, peek.entry, peek.index)
    }
  }
}

async function handleIdleContinuation(deps: RuntimeFallbackDeps, sessionID: string): Promise<void> {
  const idleState = deps.idleState
  if (!idleState) return

  const data = idleState.sessionData.get(sessionID)
  // ESC abort — never continue
  if (data?.aborted) {
    clearSession(idleState, sessionID)
    return
  }

  // Not enabled — clean up
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
