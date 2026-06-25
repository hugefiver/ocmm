import { readFile } from "node:fs/promises"
import { dirname } from "node:path"

import type { OcmmConfig } from "../config/schema.ts"
import { findAgentsMdUp } from "../rules/index.ts"
import { isRecord } from "../shared/logger.ts"

const HOOK_NAME = "directory-agents-injector"
const AGENTS_OUTPUT_BUDGET = 12000

type ToolOutput = {
  output?: unknown
  metadata?: unknown
}

export function createDirectoryAgentsInjector(args: {
  getConfig: () => OcmmConfig
  projectRoot: string
  sessionCache?: Map<string, Set<string>>
}): (input: unknown, output: unknown) => Promise<void> {
  const sessionCache = args.sessionCache ?? new Map<string, Set<string>>()
  return async (rawInput, rawOutput) => {
    const config = args.getConfig()
    if (!config.rules.enabled || config.disabledHooks?.includes(HOOK_NAME)) return
    if (!isRecord(rawOutput)) return
    if (toolName(rawInput) !== "read") return

    const output = rawOutput as ToolOutput
    if (typeof output.output !== "string") return
    const filePath = inputFilePath(rawInput, output)
    if (!filePath) return

    const session = sessionId(rawInput) ?? "default"
    let injected = sessionCache.get(session)
    if (!injected) {
      injected = new Set<string>()
      sessionCache.set(session, injected)
    }

    const blocks = await agentsBlocks({ filePath, projectRoot: args.projectRoot, sessionCache: injected })
    if (blocks.length === 0) return
    output.output = `${output.output}${blocks.join("")}`
  }
}

export async function agentsBlocks(args: {
  filePath: string
  projectRoot: string
  sessionCache?: Set<string>
}): Promise<string[]> {
  const sessionCache = args.sessionCache ?? new Set<string>()
  const paths = findAgentsMdUp({ startDir: args.filePath, rootDir: args.projectRoot })
  const blocks: string[] = []
  for (const agentsPath of paths) {
    const agentsDir = dirname(agentsPath)
    if (sessionCache.has(agentsDir)) continue
    const content = await readAgentsFile(agentsPath)
    if (content === null) continue
    sessionCache.add(agentsDir)
    blocks.push(formatAgentsBlock(agentsPath, content))
  }
  return blocks
}

function formatAgentsBlock(agentsPath: string, content: string): string {
  const { text, truncated } = truncate(content, AGENTS_OUTPUT_BUDGET)
  const notice = truncated ? `\n[Directory context truncated: ${agentsPath}]` : ""
  return `\n\n[Directory Context: ${agentsPath}]\n${text}${notice}`
}

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function inputFilePath(rawInput: unknown, rawOutput: ToolOutput): string | null {
  if (isRecord(rawOutput.metadata)) {
    for (const key of ["filePath", "path", "file"]) {
      const value = rawOutput.metadata[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }

  if (isRecord(rawInput) && isRecord(rawInput.args)) {
    for (const key of ["filePath", "path", "file"]) {
      const value = rawInput.args[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }

  return null
}

function toolName(rawInput: unknown): string | null {
  if (!isRecord(rawInput)) return null
  const tool = rawInput.tool
  if (typeof tool === "string") return tool.toLowerCase()
  if (isRecord(tool)) {
    for (const key of ["name", "id", "key"]) {
      const value = tool[key]
      if (typeof value === "string" && value.length > 0) return value.toLowerCase()
    }
  }
  return null
}

function sessionId(rawInput: unknown): string | null {
  if (!isRecord(rawInput)) return null
  for (const key of ["sessionID", "sessionId", "session_id"]) {
    const value = rawInput[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return null
}

async function readAgentsFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}
