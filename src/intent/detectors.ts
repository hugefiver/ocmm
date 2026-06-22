/**
 * Helpers retained after keyword-based intent detection was removed.
 *
 * - `isPlannerAgent`: used at config time to pick the planner deepwork variant
 * - `stripSystemReminders`: cleans user messages of reminder blocks
 */

const SYSTEM_REMINDER_RE = /<SYSTEM_REMINDER>[\s\S]*?<\/SYSTEM_REMINDER>/gi
const DCP_REMINDER_RE = /<dcp-system-reminder>[\s\S]*?<\/dcp-system-reminder>/gi

export function stripSystemReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER_RE, "").replace(DCP_REMINDER_RE, "")
}

/** True when the agent is OpenCode's planning agent or our own `planner`. */
export function isPlannerAgent(agentName: string | undefined | null): boolean {
  if (!agentName) return false
  const n = agentName.toLowerCase()
  return n === "plan" || n === "planner"
}
