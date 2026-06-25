import { classifyError, type ErrorClassification } from "./error-classifier.ts"
import {
  createFallbackState,
  markModelFailed,
  modelKey,
  prepareFallback,
  type FallbackState,
} from "./fallback-state.ts"
import { dispatchFallbackRetry, isDispatchInFlight, type OcmmClient } from "./dispatcher.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import { BUILTIN_CATEGORY_INDEX } from "../data/categories.ts"
import { normalizeShorthand } from "../config/normalize.ts"
import type { OcmmConfig } from "../config/schema.ts"
import type { FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { clearSessionIntent } from "../hooks/chat-message.ts"
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

function getRequirementForAgent(agent: string | undefined, cfg: OcmmConfig): ModelRequirement | null {
  if (!agent) return null
  const userEntry = cfg.agents?.[agent]
  const userNorm = normalizeShorthand(userEntry)
  if (userNorm?.requirement) return userNorm.requirement

  const userCat = cfg.categories?.[agent]
  const userCatNorm = normalizeShorthand(userCat)
  if (userCatNorm?.requirement) return userCatNorm.requirement

  const builtinAgent = BUILTIN_AGENT_INDEX.get(agent)
  if (builtinAgent) return builtinAgent.requirement

  const builtinCat = BUILTIN_CATEGORY_INDEX.get(agent)
  if (builtinCat) return builtinCat.requirement

  return null
}

export type RuntimeFallbackDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
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
        clearSessionIntent(sessionID)
        sessionStates.delete(sessionID)
        if (deps.idleState) clearSession(deps.idleState, sessionID)
      }
      return
    }

    if (eventType === "session.idle") {
      if (sessionID) {
        clearSessionIntent(sessionID)
        sessionStates.delete(sessionID)
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

    const requirement = getRequirementForAgent(agent, cfg)
    if (!requirement || requirement.fallbackChain.length <= 1) {
      log.info(`no fallback chain configured for agent=${agent ?? "<none>"}; skipping`)
      return
    }

    const eventModel = resolveEventModel(props)
    // Derive the failed-model key from the event when possible. When the
    // event lacks a model, fall back to the first entry of the agent's own
    // requirement chain rather than using the agent name itself (which is a
    // role label, not a model identifier, and would pollute failedModels).
    let justFailedKey: string | null = null
    if (eventModel) {
      justFailedKey = modelKey(eventModel.providerID, eventModel.modelID)
    } else if (requirement.fallbackChain[0]) {
      const primary: FallbackEntry = requirement.fallbackChain[0]
      const primaryProvider = primary.providers[0] ?? ""
      justFailedKey = modelKey(primaryProvider, primary.model)
    }
    if (!justFailedKey) {
      log.info(`could not determine failed model for agent=${agent ?? "<none>"}; skipping`)
      return
    }

    let state = sessionStates.get(sessionID)
    if (!state) {
      state = createFallbackState(justFailedKey)
      sessionStates.set(sessionID, state)
    }
    markModelFailed(state, justFailedKey)

    const prep = prepareFallback(
      state,
      requirement,
      justFailedKey,
      cfg.runtimeFallback.maxAttempts,
      cfg.runtimeFallback.cooldownSeconds,
    )
    if (!prep.ok) {
      log.warn(`fallback exhausted: ${prep.reason} (session=${sessionID.slice(0, 16)}…)`)
      return
    }

    log.info(
      `fallback attempt ${prep.attempts}/${cfg.runtimeFallback.maxAttempts}: ` +
        `model=${prep.entry.providers[0] ?? ""}/${prep.entry.model}`,
    )

    if (!cfg.runtimeFallback.dispatch) {
      log.info(`dispatch disabled; observe-only`)
      return
    }
    if (!deps.client) {
      log.warn(`no client available; cannot dispatch (observe-only)`)
      return
    }

    await dispatchFallbackRetry({
      client: deps.client,
      sessionID,
      ...(deps.directory !== undefined ? { directory: deps.directory } : {}),
      ...(agent !== undefined ? { agent } : {}),
      newEntry: prep.entry,
      reason: classification.reason,
    })
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
