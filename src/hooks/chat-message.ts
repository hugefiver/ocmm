/**
 * `chat.message` hook handler.
 *
 * Detect intent keywords in the most recent user message; on hit, prepend the
 * composed mode-prompt to the system prompt OR push it as an extra system
 * message — whichever shape OpenCode hands us.
 *
 * Hook input shape (observed across OpenCode 1.4.x):
 *     {
 *       sessionID: string
 *       agent: { name?: string } | string
 *       model?: { providerID, modelID }
 *       message: { ... user-shaped ... }
 *     }
 *
 * Hook output shape varies; we tolerate either:
 *     output.system?: string     (single concatenated system prompt)
 *     output.messages?: Array<{ role: "system", content: string }>
 *     output.prepend?: string    (legacy; some versions)
 *
 * Strategy: never overwrite. Always APPEND or PREPEND so other plugins still
 * compose. We also track per-session "latched" intents so the same trigger
 * doesn't double-inject when the user follows up.
 */

import { detectIntent, isPlannerAgent } from "../intent/detectors.ts"
import { composeIntentPrompt } from "../intent/prompt-loader.ts"
import { isRecord, log } from "../shared/logger.ts"
import type { OcmmConfig } from "../config/schema.ts"

/** Per-session latched intents; cleared on session.deleted. */
const latched = new Map<string, Set<string>>()

export function clearSessionIntent(sessionID: string): void {
  latched.delete(sessionID)
}

function latch(sessionID: string, intent: string): boolean {
  let set = latched.get(sessionID)
  if (!set) {
    set = new Set()
    latched.set(sessionID, set)
  }
  if (set.has(intent)) return false
  set.add(intent)
  return true
}

function readUserText(message: unknown): string {
  if (typeof message === "string") return message
  if (!isRecord(message)) return ""
  if (typeof message.content === "string") return message.content
  if (Array.isArray(message.content)) {
    const parts: string[] = []
    for (const c of message.content) {
      if (typeof c === "string") parts.push(c)
      else if (isRecord(c) && typeof c.text === "string") parts.push(c.text)
    }
    return parts.join("\n")
  }
  if (typeof message.text === "string") return message.text
  if (typeof message.prompt === "string") return message.prompt
  return ""
}

function appendSystemPrompt(output: Record<string, unknown>, prompt: string): void {
  if (!prompt) return
  // shape A: single string field
  if (typeof output.system === "string") {
    output.system = `${output.system}\n\n${prompt}`
    return
  }
  // shape B: messages array
  if (Array.isArray(output.messages)) {
    output.messages.push({ role: "system", content: prompt })
    return
  }
  // shape C: prepend field
  if (typeof output.prepend === "string") {
    output.prepend = `${prompt}\n\n${output.prepend}`
    return
  }
  // shape D: nothing exists yet — initialise with a system string
  output.system = prompt
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

    const userText = readUserText(rawInput.message)
    const intent = detectIntent(userText)
    if (!intent) return

    // Skip standalone ultrawork on planner agents (planner.md handles that case
    // only when the user explicitly composes hyperplan + ultrawork).
    if (intent.type === "ultrawork" && isPlannerAgent(agentName)) return

    if (!latch(sessionID, intent.type)) return

    const prompt = composeIntentPrompt({
      intent: intent.type,
      ...(agentName !== undefined ? { agentName } : {}),
      ...(providerID !== undefined ? { providerID } : {}),
      modelID,
    })
    if (!prompt) return

    if (!isRecord(rawOutput)) {
      log.warn(`chat.message output is not an object; cannot inject for ${intent.type}`)
      return
    }
    appendSystemPrompt(rawOutput, prompt)
    log.info(
      `intent=${intent.type} agent=${agentName ?? "<none>"} -> injected ${prompt.length} chars`,
    )
  }
}
