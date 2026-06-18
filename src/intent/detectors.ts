/**
 * Intent keyword detector.
 *
 * Three trigger keywords inside the *user* part of a chat message:
 *
 *     deepwork / dw    -> attach the deepwork mode prompt (variant per model family)
 *     team             -> attach team-mode prompt
 *     superplan / sp   -> attach superplan (adversarial planning) prompt
 *     superplan deepwork (any order) -> superplan + deepwork combined
 *
 * Detection rules:
 *   - Strip <SYSTEM_REMINDER>/<dcp-system-reminder> blocks first.
 *   - Match against word boundaries; case-insensitive.
 *   - The composite trigger wins over its parts.
 */

export type IntentType =
  | "deepwork"
  | "team"
  | "superplan"
  | "superplan-deepwork"

export type IntentHit = {
  type: IntentType
  match: string
}

const SUPERPLAN_DEEPWORK_RE = /\b(?:sp|superplan)\s+(?:dw|deepwork)\b|\b(?:dw|deepwork)\s+(?:sp|superplan)\b/i
const DEEPWORK_RE = /\b(?:deepwork|dw)\b/i
const SUPERPLAN_RE = /\b(?:superplan|sp)\b/i
const TEAM_RE = /\b(?:team[\s-]?mode|teammate|teamwork)\b/i

const SYSTEM_REMINDER_RE = /<SYSTEM_REMINDER>[\s\S]*?<\/SYSTEM_REMINDER>/gi
const DCP_REMINDER_RE = /<dcp-system-reminder>[\s\S]*?<\/dcp-system-reminder>/gi

export function stripSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_RE, "").replace(DCP_REMINDER_RE, "")
}

export function detectIntent(rawText: string): IntentHit | null {
  if (!rawText) return null
  const text = stripSystemReminders(rawText)

  let m = SUPERPLAN_DEEPWORK_RE.exec(text)
  if (m) return { type: "superplan-deepwork", match: m[0] }

  m = DEEPWORK_RE.exec(text)
  if (m) return { type: "deepwork", match: m[0] }

  m = SUPERPLAN_RE.exec(text)
  if (m) return { type: "superplan", match: m[0] }

  m = TEAM_RE.exec(text)
  if (m) return { type: "team", match: m[0] }

  return null
}

/** True when the agent is OpenCode's planning agent or our own `planner`. */
export function isPlannerAgent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  const n = agentName.toLowerCase()
  return n === "plan" || n === "planner"
}
