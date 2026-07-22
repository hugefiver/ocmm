export type CommandConfigEntry = {
  template: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
}

export type CommandDefinition = CommandConfigEntry & {
  name: string
}

const RALPH_LOOP_TEMPLATE = `You are starting an ocmm Ralph Loop protocol.

Idle auto-continuation: when \`idleContinuation.enabled\` is true in ocmm config (or toggled on via \`/idle-continuation on\`), the plugin will automatically re-prompt you after idle if the todo list has unfinished items.

## Loop Contract

1. Parse the user's task from the command arguments.
2. Work continuously through explore, plan, implement, verify, and cleanup.
3. Use OpenCode task delegation where useful, preferring blocking task calls when you need the result before deciding the next step.
4. If the work is fully complete, output the completion promise tag: <promise>{{COMPLETION_PROMISE}}</promise>
5. If blocked, state the blocker, the evidence, and the next required external input.

## Defaults

- Completion promise: DONE
- Maximum intended iterations: 100
- Strategy: continue

Accepted argument shape:
"task description" [--completion-promise=TEXT] [--max-iterations=N] [--strategy=reset|continue]`

const AUDIT_LOOP_TEMPLATE = `You are starting an ocmm audit/deepwork loop protocol for verified completion.

Idle auto-continuation: when \`idleContinuation.enabled\` is true in ocmm config (or toggled on via \`/idle-continuation on\`), the plugin will automatically re-prompt you after idle if the todo list has unfinished items.

## Verified Loop Contract

1. Parse the user's task from the command arguments.
2. Work continuously through explore, plan, implement, verify, and cleanup.
3. Before declaring completion, run an explicit verification pass. For implemented software, apply the authoritative final-acceptance selection rules for Reviewer/Oracle profiles; for every other deliverable, verify directly against the original request and available evidence without using review profiles.
4. If the verifier finds issues, fix them and verify again.
5. Only when implementation and verification both pass, output: <promise>{{COMPLETION_PROMISE}}</promise>
6. If blocked, state the blocker, the evidence, and the next required external input.

## Defaults

- Completion promise: DONE
- Maximum intended iterations: 500
- Strategy: continue

Accepted argument shape:
"task description" [--completion-promise=TEXT] [--strategy=reset|continue]`

function wrapCommandInstruction(template: string): string {
  return `<command-instruction>\n${template}\n</command-instruction>\n\n<user-task>\n$ARGUMENTS\n</user-task>`
}

export function loadBuiltinCommands(disabledCommands?: readonly string[]): CommandDefinition[] {
  const disabled = new Set(disabledCommands ?? [])
  const definitions: CommandDefinition[] = [
    {
      name: "ralph-loop",
      description: "(ocmm builtin) Start a Ralph-style completion loop protocol",
      template: wrapCommandInstruction(RALPH_LOOP_TEMPLATE),
    },
    {
      name: "audit-loop",
      description: "(ocmm builtin) Start an audit-style verified completion loop protocol",
      template: wrapCommandInstruction(AUDIT_LOOP_TEMPLATE),
    },
    {
      name: "dwloop",
      description: "(ocmm builtin) Alias for the deepwork verified completion loop protocol",
      template: wrapCommandInstruction(AUDIT_LOOP_TEMPLATE),
    },
    {
      name: "idle-continuation",
      description: "Toggle idle auto-continuation for this session. Usage: /idle-continuation [on|off|status]",
      template: "",
    },
  ]
  return definitions.filter((definition) => !disabled.has(definition.name))
}
