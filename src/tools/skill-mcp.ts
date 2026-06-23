import { z } from "zod"

import type { McpManager, McpOperationRequest } from "../mcp/index.ts"

export interface SkillMcpArgs {
  mcp_name: string
  tool_name?: string
  resource_name?: string
  prompt_name?: string
  arguments?: unknown
  grep?: string
  cdp_url?: string
}

export type SkillMcpToolContext = Record<string, unknown>

export type SkillMcpToolDefinition = {
  description: string
  args: Record<string, z.ZodTypeAny>
  execute: (args: SkillMcpArgs, context: SkillMcpToolContext) => Promise<string>
}

export const SKILL_MCP_DESCRIPTION = `Invoke a configured MCP server for a skill.

Provide mcp_name and exactly one operation target:
- tool_name to call an MCP tool
- resource_name to read an MCP resource
- prompt_name to get an MCP prompt

arguments may be a JSON object or a JSON string. grep filters the returned text by matching lines.`

const ArgumentsSchema = z.union([z.record(z.string(), z.unknown()), z.string()])

function selectedOperationCount(args: SkillMcpArgs): number {
  return [args.tool_name, args.resource_name, args.prompt_name].filter((value) => typeof value === "string" && value.length > 0).length
}

function parseArguments(value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: true, value }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function applyGrep(content: string, pattern: string | undefined): string {
  if (!pattern) return content
  let regex: RegExp
  try {
    regex = new RegExp(pattern)
  } catch (error) {
    return `Error: invalid grep pattern - ${error instanceof Error ? error.message : String(error)}`
  }
  return content
    .split(/\r?\n/)
    .filter((line) => regex.test(line))
    .join("\n")
}

export async function executeSkillMcpTool(args: SkillMcpArgs, manager: McpManager): Promise<string> {
  if (selectedOperationCount(args) !== 1) {
    return "Error: provide exactly one of tool_name, resource_name, or prompt_name"
  }

  const parsedArguments = parseArguments(args.arguments)
  if (!parsedArguments.ok) {
    return `Error: arguments must be valid JSON when provided as a string - ${parsedArguments.error}`
  }

  const request: McpOperationRequest = {
    mcpName: args.mcp_name,
    ...(args.tool_name ? { toolName: args.tool_name } : {}),
    ...(args.resource_name ? { resourceName: args.resource_name } : {}),
    ...(args.prompt_name ? { promptName: args.prompt_name } : {}),
    ...(parsedArguments.value !== undefined ? { arguments: parsedArguments.value } : {}),
    ...(args.grep ? { grep: args.grep } : {}),
    ...(args.cdp_url ? { cdpUrl: args.cdp_url } : {}),
  }

  const result = await manager.invoke(request)
  return applyGrep(result.content, args.grep)
}

export function createSkillMcpTool(manager: McpManager): SkillMcpToolDefinition {
  return {
    description: SKILL_MCP_DESCRIPTION,
    args: {
      mcp_name: z.string().min(1).describe("Configured MCP server name"),
      tool_name: z.string().min(1).optional().describe("MCP tool name to call"),
      resource_name: z.string().min(1).optional().describe("MCP resource URI/name to read"),
      prompt_name: z.string().min(1).optional().describe("MCP prompt name to get"),
      arguments: ArgumentsSchema.optional().describe("Arguments as an object or JSON string"),
      grep: z.string().optional().describe("Regex pattern used to keep matching output lines only"),
      cdp_url: z.string().optional().describe("Optional browser CDP URL forwarded to MCP-capable tools"),
    },
    execute: (toolArgs) => executeSkillMcpTool(toolArgs, manager),
  }
}
