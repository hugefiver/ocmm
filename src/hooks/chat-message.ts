import { isRecord, log } from "../shared/logger.ts"
import type { OcmmConfig } from "../config/schema.ts"
import { loadBuiltinCommands, type CommandDefinition } from "../commands/builtin.ts"
import {
  buildSkillCommand,
  DEFAULT_SKILLS_ROOT,
  loadSharedSkills,
  loadV1SkillCommands,
  type SkillCommand,
} from "../intent/skill-loader.ts"

export type SessionIntentState = {
  prompts: string[]
  oncePrompts: string[]
  v1SkillsQueued: boolean
}

const sessionState = new Map<string, SessionIntentState>()

export function clearSessionIntent(sessionID: string): void {
  sessionState.delete(sessionID)
}

function getOrInit(sessionID: string): SessionIntentState {
  let s = sessionState.get(sessionID)
  if (!s) {
    s = { prompts: [], oncePrompts: [], v1SkillsQueued: false }
    sessionState.set(sessionID, s)
  }
  return s
}

export function getSessionPrompt(sessionID: string): string | null {
  const s = sessionState.get(sessionID)
  if (!s) return null
  const prompts = [...s.prompts, ...s.oncePrompts]
  if (prompts.length === 0) return null
  return prompts.join("\n\n---\n\n")
}

export function createChatMessageHandler(args: {
  getConfig: () => OcmmConfig
  getV1Skills?: () => string
  skillsRoot?: string
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    if (!isRecord(rawInput)) return
    const cfg = args.getConfig()

    const sessionID = typeof rawInput.sessionID === "string" ? rawInput.sessionID : ""
    if (!sessionID) return

    const state = getOrInit(sessionID)
    state.oncePrompts = []

    if (cfg.workflow === "v1" && !state.v1SkillsQueued) {
      const skills = args.getV1Skills ? args.getV1Skills() : ""
      if (skills) {
        state.prompts.push(skills)
        log.info(
          `v1 skills queued: ${skills.length} chars (sessionID=${sessionID.slice(0, 16)}…)`,
        )
      }
      state.v1SkillsQueued = true
    }

    const parsed = parseSlashCommandFromOutput(rawOutput)
    if (!parsed) return

    const command = findOcmmCommand(cfg, parsed.name, args.skillsRoot)
    if (!command) return

    const expanded = expandCommandTemplate(command.template, parsed.arguments)
    state.oncePrompts.push(
      `<ocmm-slash-command name="${command.name}">\n${expanded}\n</ocmm-slash-command>`,
    )
    parsed.part.text = parsed.arguments.trim() || `(no arguments for /${command.name})`
    log.info(
      `slash command queued: /${command.name} (${expanded.length} chars, sessionID=${sessionID.slice(0, 16)}…)`,
    )
  }
}

function parseSlashCommandFromOutput(rawOutput: unknown): {
  name: string
  arguments: string
  part: { text: string }
} | null {
  if (!isRecord(rawOutput) || !Array.isArray(rawOutput.parts)) return null
  const part = rawOutput.parts.find(
    (item): item is { type: "text"; text: string } =>
      isRecord(item) && item.type === "text" && typeof item.text === "string",
  )
  if (!part) return null

  const text = unwrapQuotedCommandText(part.text)
  if (!text.startsWith("/")) return null
  for (let i = 1; i < text.length; i++) {
    switch (text[i]) {
      case " ":
      case "\t":
      case "\n": {
        const name = text.slice(1, i)
        if (!name) return null
        return { name, arguments: text.slice(i + 1), part }
      }
    }
  }
  const name = text.slice(1)
  return name ? { name, arguments: "", part } : null
}

function unwrapQuotedCommandText(text: string): string {
  if (text.length < 2) return text
  const first = text[0]
  if (first !== `"` && first !== "'") return text
  if (text[text.length - 1] !== first) return text
  return text.slice(1, -1)
}

function findOcmmCommand(
  cfg: OcmmConfig,
  name: string,
  skillsRoot = DEFAULT_SKILLS_ROOT,
): CommandDefinition | SkillCommand | null {
  const disabledCommands = new Set(cfg.disabledCommands ?? [])
  if (disabledCommands.has(name)) return null

  const disabledSkills = [...cfg.skills.disable, ...(cfg.disabledSkills ?? [])]
  const sharedSkills = loadSharedSkills({
    rootDir: skillsRoot,
    sources: cfg.skills.sources,
    enable: cfg.skills.enable,
    disable: disabledSkills,
  })
  const sharedCommands = sharedSkills
    .map((skill) => buildSkillCommand(skill, "ocmm"))
    .filter((skill): skill is SkillCommand => skill !== null)
  const v1Commands =
    cfg.workflow === "v1"
      ? loadV1SkillCommands({ rootDir: skillsRoot, disable: disabledSkills })
      : []

  return (
    [
      ...loadBuiltinCommands(cfg.disabledCommands),
      ...sharedCommands,
      ...v1Commands,
    ].find((command) => command.name === name && !disabledCommands.has(command.name)) ?? null
  )
}

function expandCommandTemplate(template: string, inputArguments: string): string {
  const rawArgs = inputArguments.match(argsRegex) ?? []
  const args = rawArgs.map((arg) => arg.replace(quoteTrimRegex, ""))
  const placeholders = template.match(placeholderRegex) ?? []
  let last = 0
  for (const item of placeholders) {
    const value = Number(item.slice(1))
    if (value > last) last = value
  }

  const withNumberedArgs = template.replaceAll(placeholderRegex, (_, index: string) => {
    const position = Number(index)
    const argIndex = position - 1
    if (argIndex >= args.length) return ""
    if (position === last) return args.slice(argIndex).join(" ")
    return args[argIndex] ?? ""
  })
  const usesArgumentsPlaceholder = template.includes("$ARGUMENTS")
  let expanded = withNumberedArgs.replaceAll("$ARGUMENTS", inputArguments)

  if (placeholders.length === 0 && !usesArgumentsPlaceholder && inputArguments.trim()) {
    expanded = `${expanded}\n\n${inputArguments}`
  }
  return expanded.trim()
}

const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const placeholderRegex = /\$(\d+)/g
const quoteTrimRegex = /^["']|["']$/g

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
