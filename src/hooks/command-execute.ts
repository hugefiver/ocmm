import { isIdleContinuationEnabled, type IdleContinuationState } from "../runtime-fallback/idle-state.ts"

const LOOP_COMMANDS = new Set(["ralph-loop", "audit-loop", "dwloop"])

type CommandExecuteInput = {
  command: string
  arguments?: string
  sessionID: string
}

type CommandPart = { type: string; text?: string }

type CommandExecuteOutput = {
  parts: CommandPart[]
}

export type CommandExecuteDeps = {
  idleState: IdleContinuationState
}

export function createCommandExecuteHandler(deps: CommandExecuteDeps) {
  return async (input: CommandExecuteInput, output: CommandExecuteOutput): Promise<void> => {
    const sid = input.sessionID

    if (LOOP_COMMANDS.has(input.command)) {
      deps.idleState.sessionOverrides.set(sid, true)
      return
    }

    if (input.command !== "idle-continuation") return

    const arg = (input.arguments ?? "").trim().toLowerCase() || "status"

    let message: string
    if (arg === "on") {
      deps.idleState.sessionOverrides.set(sid, true)
      message = "Idle auto-continuation enabled for this session."
    } else if (arg === "off") {
      deps.idleState.sessionOverrides.set(sid, false)
      message = "Idle auto-continuation disabled for this session."
    } else if (arg === "status") {
      const enabled = isIdleContinuationEnabled(deps.idleState, sid)
      const source = deps.idleState.sessionOverrides.has(sid) ? "session override" : "global config"
      message = `Idle auto-continuation: ${enabled ? "enabled" : "disabled"} (source: ${source}). Usage: /idle-continuation [on|off|status]`
    } else {
      message = `Unknown argument "${arg}". Usage: /idle-continuation [on|off|status]`
    }

    output.parts.length = 0
    output.parts.push({ type: "text", text: message })
  }
}
