import { isRecord, log } from "../shared/logger.ts"
import type { OcmmConfig } from "../config/schema.ts"

export type SessionIntentState = {
  prompts: string[]
}

const sessionState = new Map<string, SessionIntentState>()

export function clearSessionIntent(sessionID: string): void {
  sessionState.delete(sessionID)
}

function getOrInit(sessionID: string): SessionIntentState {
  let s = sessionState.get(sessionID)
  if (!s) {
    s = { prompts: [] }
    sessionState.set(sessionID, s)
  }
  return s
}

export function getSessionPrompt(sessionID: string): string | null {
  const s = sessionState.get(sessionID)
  if (!s || s.prompts.length === 0) return null
  return s.prompts.join("\n\n---\n\n")
}

export function createChatMessageHandler(args: {
  getConfig: () => OcmmConfig
  getV1Skills?: () => string
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, _rawOutput) => {
    if (!isRecord(rawInput)) return
    const cfg = args.getConfig()
    if (cfg.workflow !== "v1") return

    const sessionID = typeof rawInput.sessionID === "string" ? rawInput.sessionID : ""
    if (!sessionID) return

    const state = getOrInit(sessionID)
    if (state.prompts.length > 0) return

    const skills = args.getV1Skills ? args.getV1Skills() : ""
    if (!skills) return
    state.prompts.push(skills)

    log.info(
      `v1 skills queued: ${skills.length} chars (sessionID=${sessionID.slice(0, 16)}…)`,
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
