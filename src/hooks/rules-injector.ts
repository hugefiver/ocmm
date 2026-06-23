import { readFile } from "node:fs/promises"

import type { OcmmConfig } from "../config/schema.ts"
import { findRuleFiles, shouldApplyRule, type RuleFile } from "../rules/index.ts"
import { isRecord } from "../shared/logger.ts"

const HOOK_NAME = "rules-injector"
const RULE_OUTPUT_BUDGET = 12000
const SUPPORTED_TOOLS = new Set(["read", "write", "edit", "multiedit"])

type ToolOutput = {
  title?: unknown
  output?: unknown
  metadata?: unknown
}

export function createRulesInjector(args: {
  getConfig: () => OcmmConfig
  projectRoot: string
  homeDir?: string
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    const config = args.getConfig()
    if (!config.rules.enabled || config.disabledHooks?.includes(HOOK_NAME)) return
    if (!isRecord(rawOutput)) return
    if (!SUPPORTED_TOOLS.has(toolName(rawInput) ?? "")) return

    const output = rawOutput as ToolOutput
    if (typeof output.output !== "string") return

    const filePath = outputFilePath(rawInput, output)
    if (!filePath) return

    const blocks = await matchingRuleBlocks({
      filePath,
      projectRoot: args.projectRoot,
      homeDir: args.homeDir,
      skipClaudeUserRules: config.rules.skipClaudeUserRules,
    })
    if (blocks.length === 0) return
    output.output = `${output.output}${blocks.join("")}`
  }
}

export async function matchingRuleBlocks(args: {
  filePath: string
  projectRoot: string
  homeDir?: string
  skipClaudeUserRules?: boolean
}): Promise<string[]> {
  const rules = findRuleFiles({
    projectRoot: args.projectRoot,
    filePath: args.filePath,
    ...(args.homeDir !== undefined ? { homeDir: args.homeDir } : {}),
    skipClaudeUserRules: args.skipClaudeUserRules ?? false,
  })

  const blocks: string[] = []
  for (const rule of rules) {
    const match = shouldApplyRule(rule, args.filePath, args.projectRoot)
    if (!match.applies) continue
    blocks.push(formatRuleBlock(rule, match.reason ?? "matched"))
  }
  return blocks
}

function formatRuleBlock(rule: RuleFile, matchReason: string): string {
  const { text, truncated } = truncate(rule.content, RULE_OUTPUT_BUDGET)
  const notice = truncated ? `\n[Rule truncated: ${rule.relativePath}]` : ""
  return `\n\n[Rule: ${rule.relativePath}]\n[Match: ${matchReason}]\n${text}${notice}`
}

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function outputFilePath(rawInput: unknown, rawOutput: ToolOutput): string | null {
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

  if (typeof rawOutput.title === "string" && rawOutput.title.length > 0) return rawOutput.title
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

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}
