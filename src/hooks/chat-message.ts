import { detectIntent, isPlannerAgent } from "../intent/detectors.ts"
import { composeIntentPrompt } from "../intent/prompt-loader.ts"
import { isRecord, log } from "../shared/logger.ts"
import type { OcmmConfig } from "../config/schema.ts"

export type SessionIntentState = {
  intents: Set<string>
  prompts: string[]
}

const sessionState = new Map<string, SessionIntentState>()

export function clearSessionIntent(sessionID: string): void {
  sessionState.delete(sessionID)
}

function getOrInit(sessionID: string): SessionIntentState {
  let s = sessionState.get(sessionID)
  if (!s) {
    s = { intents: new Set(), prompts: [] }
    sessionState.set(sessionID, s)
  }
  return s
}

export function getSessionPrompt(sessionID: string): string | null {
  const s = sessionState.get(sessionID)
  if (!s || s.prompts.length === 0) return null
  return s.prompts.join("\n\n---\n\n")
}

function readUserTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  const out: string[] = []
  for (const p of parts) {
    if (typeof p === "string") {
      out.push(p)
      continue
    }
    if (!isRecord(p)) continue
    if (typeof p.text === "string") out.push(p.text)
    else if (typeof p.content === "string") out.push(p.content)
  }
  return out.join("\n")
}

export function createChatMessageHandler(args: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    if (!isRecord(rawInput)) return
    const cfg = args.getConfig()
    if (!cfg.intent.enabled) return

    const sessionID = typeof rawInput.sessionID === "string" ? rawInput.sessionID : ""
    if (!sessionID) return

    let agentName: string | undefined
    if (typeof rawInput.agent === "string") agentName = rawInput.agent
    else if (isRecord(rawInput.agent) && typeof rawInput.agent.name === "string") {
      agentName = rawInput.agent.name
    }
    if (cfg.intent.skipAgents.includes(agentName ?? "")) return

    let providerID: string | undefined
    let modelID: string | undefined
    if (isRecord(rawInput.model)) {
      providerID = typeof rawInput.model.providerID === "string" ? rawInput.model.providerID : undefined
      modelID = typeof rawInput.model.modelID === "string" ? rawInput.model.modelID : undefined
    }
    if (!modelID) return

    const parts = isRecord(rawOutput) ? rawOutput.parts : undefined
    const userText = readUserTextFromParts(parts)
    if (cfg.debug) {
      log.debug(
        `chat.message: agent=${agentName ?? "<none>"} model=${providerID}/${modelID} ` +
          `parts=${Array.isArray(parts) ? parts.length : 0} textLen=${userText.length}`,
      )
    }
    const intent = detectIntent(userText)
    if (!intent) return
    if (intent.type === "deepwork" && isPlannerAgent(agentName)) return

    const state = getOrInit(sessionID)
    if (state.intents.has(intent.type)) return
    state.intents.add(intent.type)

    const prompt = composeIntentPrompt({
      intent: intent.type,
      ...(agentName !== undefined ? { agentName } : {}),
      ...(providerID !== undefined ? { providerID } : {}),
      modelID,
    })
    if (!prompt) return
    state.prompts.push(prompt)

    log.info(
      `intent=${intent.type} agent=${agentName ?? "<none>"} -> queued ${prompt.length} chars for system injection`,
    )
  }
}

export function createSystemTransformHandler(): (
  input: unknown,
  output: unknown,
) => Promise<void> {
  return async (rawInput, rawOutput) => {
    if (!isRecord(rawInput)) return
    const sessionID = typeof rawInput.sessionID === "string" ? rawInput.sessionID : ""
    if (!sessionID) return
    const merged = getSessionPrompt(sessionID)
    if (!merged) return

    if (!isRecord(rawOutput)) return
    const sys = rawOutput.system
    if (Array.isArray(sys)) {
      sys.unshift(merged)
      log.info(
        `system.transform: prepended ${merged.length} chars (sessionID=${sessionID.slice(0, 16)}…)`,
      )
      return
    }
    if (typeof sys === "string") {
      rawOutput.system = `${merged}\n\n${sys}`
      log.info(
        `system.transform: prepended ${merged.length} chars to string system`,
      )
      return
    }
    rawOutput.system = [merged]
    log.info(
      `system.transform: initialized system with ${merged.length} chars`,
    )
  }
}
