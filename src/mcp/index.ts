import { existsSync, readFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"

import type { McpConfig, McpServerConfig } from "../config/schema.ts"
import { isRecord } from "../shared/logger.ts"

export type McpServerMap = Record<string, McpServerConfig>

export interface SkillMcpConfig {
  servers: McpServerMap
}

export interface McpOperationRequest {
  mcpName: string
  toolName?: string
  resourceName?: string
  promptName?: string
  arguments?: unknown
  grep?: string
  cdpUrl?: string
}

export interface McpOperationResult {
  content: string
}

export interface McpManager {
  servers(): McpServerMap
  invoke(request: McpOperationRequest): Promise<McpOperationResult>
}

export function createBuiltinMcps(config: McpConfig, disabledMcps: readonly string[] = []): McpServerMap {
  const disabled = new Set(disabledMcps)
  const servers: McpServerMap = {}

  if (!disabled.has("websearch")) {
    const websearch = createWebsearchConfig(config.websearch.provider)
    if (websearch) servers.websearch = websearch
  }
  if (!disabled.has("context7")) servers.context7 = remote("https://mcp.context7.com/mcp", context7Headers())
  if (!disabled.has("grep_app")) servers.grep_app = remote("https://mcp.grep.app")
  if (!disabled.has("lsp")) servers.lsp = local(["lsp-tools-mcp", "mcp"], { enabled: false })
  if (!disabled.has("codegraph")) servers.codegraph = local(["codegraph", "serve", "--mcp"], { enabled: false })
  return servers
}

export function resolveMcpServers(config: McpConfig, options?: {
  disabledMcps?: readonly string[]
  cwd?: string
}): McpServerMap {
  const disabled = new Set(options?.disabledMcps ?? [])
  const explicit: McpServerMap = {}
  for (const [name, server] of Object.entries(config.servers)) {
    if (!disabled.has(name)) explicit[name] = normalizeServerConfig(server)
  }
  const mcpJson = filterDisabled(loadMcpJsonSync(options?.cwd ?? process.cwd()), disabled)
  return mergeMcpServers(
    config.enabled ? createBuiltinMcps(config, [...disabled]) : {},
    mcpJson,
    explicit,
  )
}

export function mergeMcpServers(...maps: readonly McpServerMap[]): McpServerMap {
  const merged: McpServerMap = {}
  for (const map of maps) {
    for (const [name, server] of Object.entries(map)) merged[name] = normalizeServerConfig(server)
  }
  return merged
}

export function createConfiguredMcpManager(servers: McpServerMap): McpManager {
  const normalized = mergeMcpServers(servers)
  return {
    servers: () => ({ ...normalized }),
    async invoke(request) {
      const server = normalized[request.mcpName]
      if (!server) return { content: `Error: MCP server not configured: ${request.mcpName}` }
      if (server.enabled === false) return { content: `Error: MCP server disabled: ${request.mcpName}` }
      const operation = operationName(request)
      return {
        content: JSON.stringify(
          {
            mcp: request.mcpName,
            operation,
            status: "configured",
            message: "MCP client transport is not active in this dependency-free build.",
          },
          null,
          2,
        ),
      }
    },
  }
}

export async function loadSkillMcpConfigs(skillsRoot: string): Promise<McpServerMap> {
  const merged: McpServerMap = {}
  let entries: string[]
  try {
    entries = await readdir(skillsRoot)
  } catch {
    return merged
  }

  for (const entry of entries) {
    if (entry === "v1") continue
    const skillDir = join(skillsRoot, entry)
    const config = await loadSkillMcpConfig(skillDir)
    Object.assign(merged, config.servers)
  }
  return merged
}

export async function loadSkillMcpConfig(skillDir: string): Promise<SkillMcpConfig> {
  const companionPath = join(skillDir, "mcp.json")
  const companion = await readJsonMcpConfig(companionPath)
  if (companion) return companion

  const skillMdPath = join(skillDir, "SKILL.md")
  let text: string
  try {
    text = await readFile(skillMdPath, "utf8")
  } catch {
    return { servers: {} }
  }
  return parseSkillMcpFrontmatter(text)
}

export function parseSkillMcpFrontmatter(markdown: string): SkillMcpConfig {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return { servers: {} }
  return { servers: parseMcpBlock(frontmatter[1] ?? "") }
}

export function normalizeServerConfig(server: McpServerConfig): McpServerConfig {
  if (server.type === "local" && typeof server.command === "string") {
    return { ...server, command: [server.command, ...(server.args ?? [])] }
  }
  return { ...server }
}

function createWebsearchConfig(provider: "exa" | "tavily"): McpServerConfig | undefined {
  if (provider === "tavily") {
    const key = process.env.TAVILY_API_KEY
    if (!key) return undefined
    return remote("https://mcp.tavily.com/mcp/", { Authorization: `Bearer ${key}` })
  }
  return remote(
    "https://mcp.exa.ai/mcp?tools=web_search_exa",
    process.env.EXA_API_KEY ? { Authorization: `Bearer ${process.env.EXA_API_KEY}` } : undefined,
  )
}

function context7Headers(): Record<string, string> | undefined {
  return process.env.CONTEXT7_API_KEY
    ? { Authorization: `Bearer ${process.env.CONTEXT7_API_KEY}` }
    : undefined
}

function remote(url: string, headers?: Record<string, string>): McpServerConfig {
  return {
    type: "remote",
    url,
    enabled: true,
    oauth: false,
    ...(headers ? { headers } : {}),
  }
}

function local(command: string[], options?: { enabled?: boolean; environment?: Record<string, string> }): McpServerConfig {
  return {
    type: "local",
    command,
    enabled: options?.enabled ?? true,
    ...(options?.environment ? { environment: options.environment } : {}),
  }
}

async function readJsonMcpConfig(path: string): Promise<SkillMcpConfig | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown
    return mcpConfigFromUnknown(parsed)
  } catch {
    return undefined
  }
}

function mcpConfigFromUnknown(value: unknown): SkillMcpConfig {
  const servers = isRecord(value) && isRecord(value.mcp) ? value.mcp : value
  if (!isRecord(servers)) return { servers: {} }
  return { servers: serversFromRecord(servers) }
}

function parseMcpBlock(frontmatter: string): McpServerMap {
  const lines = frontmatter.replace(/\r\n/g, "\n").split("\n")
  const mcpLine = lines.findIndex((line) => line.trim() === "mcp:")
  if (mcpLine < 0) return {}

  const servers: Record<string, Record<string, unknown>> = {}
  let current: string | undefined
  for (const rawLine of lines.slice(mcpLine + 1)) {
    if (rawLine.trim() === "") continue
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0
    if (indent === 0) break
    const trimmed = rawLine.trim()
    const serverMatch = trimmed.match(/^([A-Za-z0-9_-]+):\s*$/)
    if (indent <= 2 && serverMatch) {
      current = serverMatch[1]
      servers[current] = {}
      continue
    }
    if (!current) continue
    const fieldMatch = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!fieldMatch) continue
    servers[current]![fieldMatch[1]!] = parseYamlScalar(fieldMatch[2] ?? "")
  }

  return serversFromRecord(servers)
}

function serversFromRecord(record: Record<string, unknown>): McpServerMap {
  const servers: McpServerMap = {}
  for (const [name, raw] of Object.entries(record)) {
    const server = serverFromUnknown(raw)
    if (server) servers[name] = normalizeServerConfig(server)
  }
  return servers
}

function serverFromUnknown(value: unknown): McpServerConfig | undefined {
  if (!isRecord(value)) return undefined
  const type = value.type
  const enabled = typeof value.enabled === "boolean" ? value.enabled : true
  if (type === "remote" && typeof value.url === "string") {
    const headers = stringRecord(value.headers)
    return {
      type: "remote",
      url: value.url,
      enabled,
      oauth: typeof value.oauth === "boolean" ? value.oauth : undefined,
      ...(headers ? { headers } : {}),
    }
  }
  if (type === "local") {
    const command = commandValue(value.command)
    if (!command) return undefined
    const args = stringArray(value.args)
    const env = stringRecord(value.env)
    const environment = stringRecord(value.environment)
    return {
      type: "local",
      command,
      ...(args ? { args } : {}),
      ...(env ? { env } : {}),
      ...(environment ? { environment } : {}),
      enabled,
    }
  }
  return undefined
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(",").map((part) => unquote(part.trim()))
  }
  return unquote(trimmed)
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function commandValue(value: unknown): string | string[] | undefined {
  if (typeof value === "string" && value) return value
  const array = stringArray(value)
  return array && array.length > 0 ? array : undefined
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(value)) {
    if (typeof val !== "string") return undefined
    result[key] = val
  }
  return result
}

function operationName(request: McpOperationRequest): string {
  if (request.toolName) return `tool:${request.toolName}`
  if (request.resourceName) return `resource:${request.resourceName}`
  if (request.promptName) return `prompt:${request.promptName}`
  return "unknown"
}

function filterDisabled(map: McpServerMap, disabled: Set<string>): McpServerMap {
  const filtered: McpServerMap = {}
  for (const [name, server] of Object.entries(map)) {
    if (!disabled.has(name)) filtered[name] = server
  }
  return filtered
}

export function loadMcpJsonSync(cwd: string): McpServerMap {
  const path = resolve(cwd, ".mcp.json")
  if (!existsSync(path)) return {}
  try {
    return mcpConfigFromUnknown(JSON.parse(readFileSync(path, "utf8")) as unknown).servers
  } catch {
    return {}
  }
}

export function mcpJsonPathFor(cwd: string): string {
  return join(resolve(cwd), ".mcp.json")
}

export function skillNameFromDir(path: string): string {
  return basename(dirname(join(path, "SKILL.md")))
}
