/**
 * Intent keyword detector.
 *
 * Mirrors omo's IntentGate. Detects four trigger keywords inside the *user* part
 * of a chat message (we never inspect system / tool messages) and produces a
 * normalized IntentHit describing what to inject:
 *
 *     ultrawork / ulw  -> attach ultrawork mode prompt (variant per model family)
 *     team             -> attach team-mode prompt
 *     hyperplan / hpp  -> attach hyperplan mode prompt
 *     hyperplan ultrawork (or reverse) -> hyperplan + ultrawork together
 *
 * Detection rules:
 *   - Strip <SYSTEM_REMINDER> blocks first; never trigger from auto-injected text.
 *   - Match against word boundaries; case-insensitive.
 *   - Skip if an explicit `disabled` flag is set in the input (e.g. via config).
 */

export type IntentType =
  | "ultrawork"
  | "team"
  | "hyperplan"
  | "hyperplan-ultrawork"

export type IntentHit = {
  type: IntentType
  /** The raw matched substring, useful for debug. */
  match: string
}

const HYPERPLAN_ULTRAWORK_RE = /\b(?:hpp|hyperplan)\s+(?:ulw|ultrawork)\b|\b(?:ulw|ultrawork)\s+(?:hpp|hyperplan)\b/i
const ULTRAWORK_RE = /\b(?:ultrawork|ulw)\b/i
const HYPERPLAN_RE = /\b(?:hyperplan|hpp)\b/i
const TEAM_RE = /\b(?:team[\s-]?mode|teammate|teamwork)\b/i

const SYSTEM_REMINDER_RE = /<SYSTEM_REMINDER>[\s\S]*?<\/SYSTEM_REMINDER>/gi
const DCP_REMINDER_RE = /<dcp-system-reminder>[\s\S]*?<\/dcp-system-reminder>/gi

/** Strip injected reminder blocks before pattern matching. */
export function stripSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_RE, "").replace(DCP_REMINDER_RE, "")
}

/** Run detection. Order matters: composite keyword wins over its parts. */
export function detectIntent(rawText: string): IntentHit | null {
  if (!rawText) return null
  const text = stripSystemReminders(rawText)

  let m = HYPERPLAN_ULTRAWORK_RE.exec(text)
  if (m) return { type: "hyperplan-ultrawork", match: m[0] }

  m = ULTRAWORK_RE.exec(text)
  if (m) return { type: "ultrawork", match: m[0] }

  m = HYPERPLAN_RE.exec(text)
  if (m) return { type: "hyperplan", match: m[0] }

  m = TEAM_RE.exec(text)
  if (m) return { type: "team", match: m[0] }

  return null
}

/** True if the agent should be excluded from intent injection. */
export function isPlannerAgent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  const n = agentName.toLowerCase()
  return n === "plan" || n === "prometheus"
}
