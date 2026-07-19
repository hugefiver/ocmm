import type { OcmmConfig } from "../config/schema.ts"
import { isRecord } from "../shared/logger.ts"
import type { Subagent429Controller } from "./subagent-429-controller.ts"

export const SUBAGENT_CONTINUATION_NOTICE_PREFIX = "[Subagent interruption recovery]"

const INTERRUPTION =
  /tool execution (?:was )?(?:aborted|interrupted)|transport (?:closed|interrupted)|connection (?:closed|reset)|request aborted|request interrupted/i
const EXCLUDED = /permission (?:denied|rejected)|unknown agent(?: type)?/i

function text(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) return undefined
  for (const key of keys) {
    const found = value[key]
    if (typeof found === "string" && found.length > 0) return found
  }
  return undefined
}

function bodyTaskID(outputText: string): string | undefined {
  const match = /\btask_id\s*(?::=|[:=])\s*["']?([A-Za-z0-9._:-]+)/i.exec(outputText)
  return match?.[1]
}

function toolName(input: unknown): string {
  if (!isRecord(input)) return ""
  const direct = text(input, ["tool", "toolName", "toolID", "toolId", "name"])
  if (direct) return direct.toLowerCase()
  if (isRecord(input.tool)) {
    const nested = text(input.tool, ["name", "id", "key"])
    if (nested) return nested.toLowerCase()
  }
  return ""
}

function taskEvidence(
  input: unknown,
  output: Record<string, unknown>,
): {
  childSessionID?: string
  taskID?: string
} {
  const metadata = isRecord(output.metadata) ? output.metadata : undefined
  const args = isRecord(input) && isRecord(input.args) ? input.args : undefined
  const outputText = typeof output.output === "string" ? output.output : ""

  const childSessionID = text(metadata, ["sessionId", "sessionID"])
  const taskID = text(metadata, ["task_id", "taskID", "taskId"])
    ?? text(output, ["task_id", "taskID", "taskId"])
    ?? text(args, ["task_id", "taskID", "taskId"])
    ?? bodyTaskID(outputText)

  return {
    ...(childSessionID ? { childSessionID } : {}),
    ...(taskID ? { taskID } : {}),
  }
}

export function createSubagentInterruptionOutputAdapter(args: {
  getConfig: () => OcmmConfig
  controller: Pick<Subagent429Controller, "getInterruptionCorrelation" | "claimInterruptionNotice">
}): (input: unknown, output: unknown) => Promise<void> {
  return async (input, rawOutput) => {
    const config = args.getConfig()
    if (config.disabledHooks?.includes("subagent-interruption-recovery")) return
    if (toolName(input) !== "task") return
    if (!isRecord(rawOutput) || typeof rawOutput.output !== "string") return

    const original = rawOutput.output
    if (!original.trim()) return
    if (!INTERRUPTION.test(original)) return
    if (EXCLUDED.test(original)) return
    if (original.includes(SUBAGENT_CONTINUATION_NOTICE_PREFIX)) return

    const evidence = taskEvidence(input, rawOutput)
    const parentSessionID = text(input, ["sessionID", "sessionId", "session_id"])
    const lookup = {
      ...(evidence.childSessionID ? { childSessionID: evidence.childSessionID } : {}),
      ...(parentSessionID ? { parentSessionID } : {}),
      ...(evidence.taskID ? { taskID: evidence.taskID } : {}),
    }
    const correlation = args.controller.getInterruptionCorrelation(lookup)
    if (!correlation) return
    if (correlation.explicitlyAborted) return

    const resumableTaskID = evidence.taskID ?? correlation.taskID
    if (!resumableTaskID) return

    if (!args.controller.claimInterruptionNotice({
      ...lookup,
      taskID: resumableTaskID,
    })) {
      return
    }

    rawOutput.output = `${original}\n\n${SUBAGENT_CONTINUATION_NOTICE_PREFIX}\n` +
      `The task output exposed resumable task identifier "${resumableTaskID}". ` +
      "Preserve that exact value for a manual continuation through the task tool's task_id field. " +
      "This output adapter did not dispatch, create a child, or prompt the parent session."
  }
}
