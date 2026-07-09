import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, join, relative, resolve, sep } from "node:path"

import { normalizeShorthand } from "../config/normalize.ts"
import { type OcmmConfig } from "../config/schema.ts"
import { loadConfig, type ConfigHost } from "../config/load.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import { BUILTIN_CATEGORY_INDEX } from "../data/categories.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { classifyModelFamily } from "../intent/model-family.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { DEFAULT_SKILLS_ROOT, loadSharedSkills, loadV1Skills, V1_SKILL_DIRS } from "../intent/skill-loader.ts"
import { loadMcpJsonSync, resolveMcpServers } from "../mcp/index.ts"
import { translateVariant } from "../routing/variant-translator.ts"
import { isRecord } from "../shared/logger.ts"
import type { FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"

export const CODEX_PLUGIN_NAME = "deepwork"
export const CODEX_MARKETPLACE_NAME = "deepwork-local"
export const CODEX_PLUGIN_DIR = `plugins/deepwork`
export const CODEX_MARKETPLACE_FILE = ".agents/plugins/marketplace.json"
export const CODEX_AGENT_PREFIX = "dw"
export const CODEX_WORKFLOW_SKILL_NAME = "deepwork"
const CODEX_LSP_ENTRYPOINT = join("dist", "cli", "ocmm-lsp.js")
const CODEX_RUNTIME_DIRS = [
  join("dist", "cli"),
  join("dist", "shared"),
  join("dist", "bin"),
]

const CODEX_COMPATIBLE_PROVIDERS = new Set([
  "openai",
  "github-copilot",
  "opencode",
  "vercel",
  "codex",
])
const CODEX_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"])
const AGENT_ALIASES = new Map([
  ["explore", "code-search"],
])

export type CodexPluginGenerationResult = {
  pluginRoot: string
  marketplacePath: string
  configHost: ConfigHost | "provided"
  agentCount: number
  skillCount: number
  mcpCount: number
}

export type CodexAgentSpec = {
  name: string
  sourceName: string
  description: string
  model: string
  reasoningEffort: string
  preferredChain: string[]
  developerInstructions: string
}

type CodexMcpManifest = {
  mcpServers: Record<string, Record<string, unknown>>
}

type LoadedAdapterConfig = {
  config: OcmmConfig
  host: ConfigHost | "provided"
}

export async function generateCodexPlugin(options: {
  projectRoot?: string
  pluginRoot?: string
  marketplacePath?: string
  config?: OcmmConfig
  packageVersion?: string
} = {}): Promise<CodexPluginGenerationResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd())
  const pluginRoot = resolve(options.pluginRoot ?? join(projectRoot, CODEX_PLUGIN_DIR))
  const marketplacePath = resolve(options.marketplacePath ?? join(projectRoot, CODEX_MARKETPLACE_FILE))
  const version = options.packageVersion ?? readPackageVersion(projectRoot)
  const loaded = loadAdapterConfig(projectRoot, options.config)
  const skillsRoot = join(projectRoot, "skills")

  mkdirSync(pluginRoot, { recursive: true })
  writeJson(join(pluginRoot, ".codex-plugin", "plugin.json"), createPluginManifest(version))
  writeJson(join(pluginRoot, "package.json"), createPluginRuntimePackage(version))
  stageCodexRuntime(projectRoot, pluginRoot)
  const mcpManifest = createCodexMcpManifest(loaded.config, projectRoot, pluginRoot)
  writeJson(join(pluginRoot, ".mcp.json"), mcpManifest)

  const agents = await buildCodexAgents({
    config: loaded.config,
    cwd: projectRoot,
    skillsRoot,
  })
  writeCodexAgents(pluginRoot, agents)
  const skillCount = writeCodexSkills({
    config: loaded.config,
    projectRoot,
    pluginRoot,
    skillsRoot,
    agents,
  })
  writePluginReadme(pluginRoot, loaded.config, agents)
  writeJson(marketplacePath, createMarketplaceManifest())

  return {
    pluginRoot,
    marketplacePath,
    configHost: loaded.host,
    agentCount: agents.length,
    skillCount,
    mcpCount: Object.keys(mcpManifest.mcpServers).length,
  }
}

export function loadAdapterConfig(projectRoot: string, config?: OcmmConfig): LoadedAdapterConfig {
  if (config) return { config, host: "provided" }

  const codex = loadConfig({ cwd: projectRoot, host: "codex", includeUser: false })
  if (codex.sources.project || codex.sources.user) {
    // Force codex workflow for Codex plugin packaging (uses prompts/codex/).
    return { config: { ...codex.config, workflow: "codex" }, host: "codex" }
  }

  const opencode = loadConfig({ cwd: projectRoot, host: "opencode", includeUser: false })
  // Force codex workflow for Codex plugin packaging regardless of source config.
  return { config: { ...opencode.config, workflow: "codex" }, host: "opencode" }
}

export async function buildCodexAgents(args: {
  config: OcmmConfig
  cwd: string
  skillsRoot?: string
}): Promise<CodexAgentSpec[]> {
  loadAllPrompts(args.config.promptsRoot ?? join(args.cwd, "prompts"), args.config.workflow)
  // Load brainstorming skill for injection into agent TOML (Codex has no runtime
  // system message injection, so the HARD-GATE brainstorming skill is embedded
  // at packaging time).
  const brainstormingSkill = loadV1Skills(args.skillsRoot ?? DEFAULT_SKILLS_ROOT)
  const target: { agent: Record<string, unknown> } = { agent: {} }
  const handler = createConfigHandler({
    getConfig: () => args.config,
    cwd: args.cwd,
    skillsRoot: args.skillsRoot ?? DEFAULT_SKILLS_ROOT,
  })
  await handler(target, undefined)

  const agents: CodexAgentSpec[] = []
  for (const [sourceName, raw] of Object.entries(target.agent).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isRecord(raw) || raw.disable === true) continue
    const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : ""
    if (!prompt) continue
    const requirement = requirementForName(sourceName, args.config)
    const selected = selectCodexModel(requirement, args.config)
    const model = selected.entry?.model ?? args.config.systemDefaultModel ?? "gpt-5.5"
    const reasoningEffort = codexReasoningEffort({
      entry: selected.entry,
      model,
      variant: selected.variant,
    })
    const preferredChain = (requirement?.fallbackChain ?? [])
      .map((entry) => formatFallbackEntry(entry))
      .filter((entry) => entry.length > 0)
    const description = typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : `Deepwork ${sourceName} agent.`

    agents.push({
      name: `${CODEX_AGENT_PREFIX}-${sourceName}`,
      sourceName,
      description,
      model,
      reasoningEffort,
      preferredChain,
      developerInstructions: codexAgentInstructions({
        sourceName,
        prompt,
        workflow: args.config.workflow,
        preferredChain,
        brainstormingSkill,
      }),
    })
  }
  return agents
}

export function createCodexMcpManifest(config: OcmmConfig, cwd: string, pluginRoot = join(cwd, CODEX_PLUGIN_DIR)): CodexMcpManifest {
  const servers = resolveMcpServers(config.mcp, { disabledMcps: config.disabledMcps, cwd })
  const projectMcpServers = loadMcpJsonSync(cwd)
  const hasExplicitLsp = Boolean(config.mcp.servers.lsp ?? projectMcpServers.lsp)
  const mcpServers: CodexMcpManifest["mcpServers"] = {}
  for (const [name, server] of Object.entries(servers)) {
    if (name === "lsp" && !hasExplicitLsp) {
      mcpServers.lsp = createCodexPackageLspServer(cwd, pluginRoot)
      continue
    }
    if (server.enabled === false) continue
    if (server.type === "remote") {
      mcpServers[name] = {
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        ...(server.oauth !== undefined ? { oauth: server.oauth } : {}),
      }
      continue
    }

    const command = Array.isArray(server.command) ? server.command : [server.command, ...(server.args ?? [])]
    const [executable, ...args] = command
    if (!executable) continue
    mcpServers[name] = {
      command: executable,
      ...(args.length > 0 ? { args } : {}),
      ...(server.env ? { env: server.env } : {}),
      ...(server.environment ? { env: { ...(server.env ?? {}), ...server.environment } } : {}),
      cwd: ".",
    }
  }
  return { mcpServers }
}

function createCodexPackageLspServer(projectRoot: string, pluginRoot: string): Record<string, unknown> {
  return {
    command: "node",
    args: [
      relativeCodexPath(pluginRoot, join(pluginRoot, CODEX_LSP_ENTRYPOINT)),
      "mcp",
    ],
    cwd: ".",
  }
}

function relativeCodexPath(from: string, to: string): string {
  const value = relative(from, to).replace(/\\/g, "/")
  return value.startsWith(".") ? value : `./${value}`
}

export function createPluginManifest(version: string): Record<string, unknown> {
  return {
    name: CODEX_PLUGIN_NAME,
    version,
    description: "Codex adapter for deepwork workflows, Deepwork agents, skills, and MCP tool registrations.",
    author: { name: "Hugefiver" },
    license: "LicenseRef-AAAPL",
    keywords: ["codex", "codex-plugin", "deepwork", "workflow", "skills", "mcp"],
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Deepwork",
      shortDescription: "Deepwork workflows and tools for Codex",
      longDescription:
        "Deepwork exposes its OpenCode-proven deepwork workflow prompts, shared skills, generated dw-* agent profiles, and MCP tool registrations as a self-contained Codex plugin without changing the OpenCode plugin entrypoint.",
      developerName: "Hugefiver",
      category: "Developer Tools",
      capabilities: ["Skills", "MCP Tools", "Workflow", "Multi-Agent Guidance"],
      defaultPrompt: [
        "Use deepwork to plan and ship this change.",
        "Review this repo with deepwork reviewer discipline.",
        "Use deepwork research tools for current docs.",
      ],
      brandColor: "#0F766E",
      screenshots: [],
    },
  }
}

export function createPluginRuntimePackage(version: string): Record<string, unknown> {
  return {
    name: "deepwork-codex-plugin-runtime",
    version,
    private: true,
    type: "module",
  }
}

export function createMarketplaceManifest(): Record<string, unknown> {
  return {
    name: CODEX_MARKETPLACE_NAME,
    interface: { displayName: "Deepwork Local" },
    plugins: [
      {
        name: CODEX_PLUGIN_NAME,
        source: { source: "local", path: `./${CODEX_PLUGIN_DIR}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      },
    ],
  }
}

function writeCodexAgents(pluginRoot: string, agents: readonly CodexAgentSpec[]): void {
  const agentsDir = join(pluginRoot, "agents")
  resetGeneratedDir(agentsDir, pluginRoot)
  for (const agent of agents) {
    writeFileSync(join(agentsDir, `${agent.name}.toml`), renderAgentToml(agent), "utf8")
  }
}

function writeCodexSkills(args: {
  config: OcmmConfig
  projectRoot: string
  pluginRoot: string
  skillsRoot: string
  agents: readonly CodexAgentSpec[]
}): number {
  const outDir = join(args.pluginRoot, "skills")
  resetGeneratedDir(outDir, args.pluginRoot)
  let count = 0

  const sharedSkills = loadSharedSkills({
    rootDir: args.skillsRoot,
    sources: args.config.skills.sources,
    enable: args.config.skills.enable,
    disable: [...args.config.skills.disable, ...(args.config.disabledSkills ?? [])],
  })
  for (const skill of sharedSkills) {
    const target = join(outDir, basename(skill.path))
    copySkillDirectory(skill.path, target)
    normalizeSkillForCodex(target)
    count += 1
  }

  const disabled = new Set([...(args.config.skills.disable ?? []), ...(args.config.disabledSkills ?? [])])
  for (const name of V1_SKILL_DIRS) {
    const codexName = `deepwork-${name}`
    if (disabled.has(name) || disabled.has(codexName)) continue
    const source = join(args.skillsRoot, "v1", name)
    if (!existsSync(join(source, "SKILL.md"))) continue
    const target = join(outDir, codexName)
    copySkillDirectory(source, target)
    normalizeSkillForCodex(target, codexName)
    count += 1
  }

  const workflowSkillDir = join(outDir, CODEX_WORKFLOW_SKILL_NAME)
  mkdirSync(workflowSkillDir, { recursive: true })
  writeFileSync(
    join(workflowSkillDir, "SKILL.md"),
    renderWorkflowSkill(args.config, args.agents),
    "utf8",
  )
  return count + 1
}

function writePluginReadme(pluginRoot: string, config: OcmmConfig, agents: readonly CodexAgentSpec[]): void {
  const lines = [
    "# Deepwork Codex Plugin",
    "",
    "Generated from the Deepwork source tree. Do not edit generated files by hand; run `pnpm run gen:codex-plugin` from the repository root.",
    "",
    `- Workflow: \`${config.workflow}\``,
    `- Generated agents: ${agents.length}`,
    "- Skills are copied from `skills/` plus flattened `skills/v1/` deepwork skills.",
    "- MCP servers are generated from the Deepwork `mcp` config namespace.",
    "- The default `lsp` MCP uses the plugin-local `ocmm-lsp` wrapper and bundled GitHub Release binary.",
    `- Workflow skill: \`${CODEX_WORKFLOW_SKILL_NAME}\`.`,
    `- Generated Codex agent profiles use the \`${CODEX_AGENT_PREFIX}-*\` prefix, including functional agents such as \`${CODEX_AGENT_PREFIX}-oracle\` and \`${CODEX_AGENT_PREFIX}-creative\`.`,
    "",
    "The OpenCode plugin remains `dist/index.js`; this directory is the Codex adapter bundle.",
  ]
  writeFileSync(join(pluginRoot, "README.md"), `${lines.join("\n")}\n`, "utf8")
}

export function stageCodexRuntime(projectRoot: string, pluginRoot: string): void {
  const runtimeRoot = join(pluginRoot, "dist")
  resetGeneratedDir(runtimeRoot, pluginRoot)
  if (!existsSync(join(projectRoot, CODEX_LSP_ENTRYPOINT))) return

  for (const relativeDir of CODEX_RUNTIME_DIRS) {
    const source = join(projectRoot, relativeDir)
    if (!existsSync(source)) continue
    cpSync(source, join(pluginRoot, relativeDir), { recursive: true })
  }
}

function renderAgentToml(agent: CodexAgentSpec): string {
  const comments = agent.preferredChain.length
    ? [`# Deepwork preferred chain: ${agent.preferredChain.join(" -> ")}`]
    : ["# Deepwork preferred chain: <none>"]
  return [
    "# Generated by Deepwork. Do not edit by hand.",
    ...comments,
    `name = ${tomlString(agent.name)}`,
    `description = ${tomlString(agent.description)}`,
    `nickname_candidates = [${[agent.name, agent.sourceName].map(tomlString).join(", ")}]`,
    `model = ${tomlString(agent.model)}`,
    `model_reasoning_effort = ${tomlString(agent.reasoningEffort)}`,
    `developer_instructions = ${tomlString(agent.developerInstructions)}`,
    "",
  ].join("\n")
}

function renderWorkflowSkill(config: OcmmConfig, agents: readonly CodexAgentSpec[]): string {
  const agentRows = agents
    .map((agent) => `| ${agent.name} | ${agent.model} | ${agent.reasoningEffort} | ${agent.sourceName} |`)
    .join("\n")
  return `---
name: ${CODEX_WORKFLOW_SKILL_NAME}
description: "MUST USE when the user asks for deepwork-style planning, multi-agent execution, code review, research, or workflow routing inside Codex."
---

# Deepwork

This is the Codex adapter skill for deepwork. Use it to apply Deepwork's autonomous workflow semantics inside Codex while leaving the OpenCode plugin untouched.

## Runtime Mapping

- Use Codex \`update_plan\` for TodoWrite-style planning.
- Use Codex \`multi_agent_v1.spawn_agent\` when delegation is useful and available. Give each subagent a concrete, self-contained task and set \`fork_context=false\` unless the task genuinely needs inherited history.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex \`apply_patch\` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated \`${CODEX_AGENT_PREFIX}-*\` agent TOML files from this plugin bundle's \`agents/\` directory as installable profiles when you want Deepwork role prompts as Codex agents. Resolve the directory relative to the installed plugin root, not a source checkout path.

## Workflow

Configured workflow: \`${config.workflow}\`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching Deepwork role or generated \`${CODEX_AGENT_PREFIX}-*\` Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify with the repository's own commands before reporting completion.

## Generated Agents

| Codex agent | Model | Effort | Deepwork source |
|---|---|---|---|
${agentRows}

## Runtime Model Selection

When spawning a subagent via \`multi_agent_v1.spawn_agent\`, select the model and \`reasoning_effort\` based on the agent's tier. The static model in the agent's TOML is a fallback default; override it via the \`model\` and \`reasoning_effort\` parameters of \`spawn_agent\`.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | ${CODEX_AGENT_PREFIX}-orchestrator, ${CODEX_AGENT_PREFIX}-planner, ${CODEX_AGENT_PREFIX}-builder, ${CODEX_AGENT_PREFIX}-clarifier, ${CODEX_AGENT_PREFIX}-deep, ${CODEX_AGENT_PREFIX}-hard-reasoning, ${CODEX_AGENT_PREFIX}-reviewer | Latest-gen flagship | xhigh |
| Mid | ${CODEX_AGENT_PREFIX}-complex, ${CODEX_AGENT_PREFIX}-normal-task, ${CODEX_AGENT_PREFIX}-coding, ${CODEX_AGENT_PREFIX}-research, ${CODEX_AGENT_PREFIX}-frontend, ${CODEX_AGENT_PREFIX}-creative, ${CODEX_AGENT_PREFIX}-documenting, ${CODEX_AGENT_PREFIX}-media-reader, ${CODEX_AGENT_PREFIX}-doc-search | Latest-gen mid-tier at max, else flagship at high | max or high |
| Mini | ${CODEX_AGENT_PREFIX}-quick, ${CODEX_AGENT_PREFIX}-code-search, ${CODEX_AGENT_PREFIX}-explore | Latest-gen mini | high |
| Cross-gen review | ${CODEX_AGENT_PREFIX}-oracle, ${CODEX_AGENT_PREFIX}-plan-critic | Previous-gen flagship | xhigh |

### Model tier definitions

- **Flagship**: the most capable model of the latest generation (e.g., gpt-5.5 in the 5.x gen).
- **Mid-tier**: a lighter-but-capable model within the latest generation. If the latest gen has no mid-tier, use the flagship at \`high\` effort instead.
- **Mini**: the smallest/cheapest model of the latest generation (e.g., \`-mini\` variants).
- **Previous-gen flagship**: the flagship of the previous generation (e.g., gpt-5.4 when gpt-5.5 is current).

### Cross-generation review rule

${CODEX_AGENT_PREFIX}-oracle and ${CODEX_AGENT_PREFIX}-plan-critic should use a **different generation** from the planner/orchestrator to provide independent review perspective. Oracle reviews work the agent itself produced (self-supervision); reviewer reviews code not produced by the current agent (external review). If the main model is the latest flagship, the cross-gen reviewer uses the previous-gen flagship at xhigh. If only one generation is available, use the same flagship at xhigh.

### Example (gpt-5.x generation — verify against your available models)

| Tier | Example model | Effort |
|---|---|---|
| Flagship | gpt-5.5 | xhigh |
| Mid (with 5.4 available) | gpt-5.4 | max |
| Mid (no 5.4) | gpt-5.5 | high |
| Mini | gpt-5.4-mini | high |
| Cross-gen review | gpt-5.4 | xhigh |
`
}

function codexAgentInstructions(args: {
  sourceName: string
  prompt: string
  workflow: OcmmConfig["workflow"]
  preferredChain: readonly string[]
  brainstormingSkill: string
}): string {
  const chain = args.preferredChain.length ? args.preferredChain.join(" -> ") : "<none>"
  return [
    `You are the deepwork Codex adapter for Deepwork agent "${args.sourceName}".`,
    `Deepwork workflow: ${args.workflow}.`,
    `Preferred fallback chain: ${chain}.`,
    "",
    "Codex tool compatibility:",
    "- Use update_plan for TodoWrite-style planning.",
    "- Use multi_agent_v1.spawn_agent for subagent delegation when available; make delegated tasks self-contained.",
    "- Use apply_patch for manual code edits.",
    "- Use shell commands for inspection and verification, preferring rg for text search.",
    "- Treat AGENTS.md as native Codex project guidance.",
    "- The model and reasoning_effort in your profile are defaults. The main agent may override them via spawn_agent's model and reasoning_effort parameters when spawning you.",
    "",
    "## Injected Brainstorming Skill (HARD-GATE)",
    "The following skill is always loaded. It is mandatory for any new feature, component, or behavior change — present a design and get explicit user approval BEFORE any code.",
    "",
    args.brainstormingSkill,
    "",
    "Original Deepwork prompt:",
    args.prompt,
  ].join("\n")
}

function requirementForName(name: string, config: OcmmConfig): ModelRequirement | null {
  return resolveRequirementForName(name, config, new Set())
}

function resolveRequirementForName(name: string, config: OcmmConfig, visited: Set<string>): ModelRequirement | null {
  if (visited.has(name)) return null
  const canonical = AGENT_ALIASES.get(name) ?? name
  const rawAgentEntry = config.agents?.[name] ?? config.agents?.[canonical]
  const agentOverride = normalizeShorthand(rawAgentEntry, {
    resolveAlias: (target) => normalizeShorthand(config.agents?.[target], {
      resolveAlias: (t2) => normalizeShorthand(config.agents?.[t2]),
      visited: new Set([...visited, name]),
      selfName: name,
    }),
    visited: new Set([...visited, name]),
    selfName: name,
  })
  if (agentOverride?.disabled) return null
  if (agentOverride?.requirement) return agentOverride.requirement

  // If the user wrote an entry for this agent but didn't specify a model
  // (no requirement, no alias resolved), fall back to defaultAlias target's
  // requirement (model-config inheritance only). If there is no user entry,
  // the builtin requirement stands.
  const builtinAgent = BUILTIN_AGENT_INDEX.get(canonical)
  if (rawAgentEntry !== undefined && builtinAgent?.defaultAlias) {
    const aliasTarget = resolveRequirementForName(builtinAgent.defaultAlias, config, new Set([...visited, name]))
    if (aliasTarget) return aliasTarget
  }
  if (builtinAgent) return builtinAgent.requirement

  const categoryOverride = normalizeShorthand(config.categories?.[name])
  if (categoryOverride?.requirement) return categoryOverride.requirement

  return BUILTIN_CATEGORY_INDEX.get(name)?.requirement ?? null
}

function selectCodexModel(
  requirement: ModelRequirement | null,
  config: OcmmConfig,
): { entry?: FallbackEntry; variant?: Variant } {
  const chain = requirement?.fallbackChain ?? []
  const selected = chain.find(isCodexCompatibleEntry)
    ?? chain.find((entry) => classifyModelFamily({ modelID: entry.model, providerID: entry.providers[0] }) === "gpt")
    ?? chain.find((entry) => classifyModelFamily({ modelID: entry.model, providerID: entry.providers[0] }) === "codex")
  const fallback = selected ?? (config.systemDefaultModel ? { providers: ["codex"], model: config.systemDefaultModel } : undefined)
  return {
    ...(fallback ? { entry: fallback } : {}),
    ...(fallback?.variant ?? requirement?.variant ? { variant: (fallback?.variant ?? requirement?.variant) as Variant } : {}),
  }
}

function isCodexCompatibleEntry(entry: FallbackEntry): boolean {
  if (entry.providers.some((provider) => CODEX_COMPATIBLE_PROVIDERS.has(provider))) return true
  const family = classifyModelFamily({ providerID: entry.providers[0], modelID: entry.model })
  return family === "gpt" || family === "codex"
}

function codexReasoningEffort(args: {
  entry?: FallbackEntry
  model: string
  variant?: Variant
}): string {
  const direct = args.entry?.reasoningEffort
  const effort = direct ?? (args.variant
    ? translateVariant("codex", args.variant, { modelID: args.model }).reasoningEffort
    : undefined)
  if (effort === "max") return "xhigh"
  if (effort && CODEX_REASONING_EFFORTS.has(effort)) return effort
  return "high"
}

function formatFallbackEntry(entry: FallbackEntry): string {
  const provider = entry.providers[0] ?? ""
  return provider ? `${provider}/${entry.model}` : entry.model
}

function copySkillDirectory(source: string, target: string): void {
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true })
}

function normalizeSkillForCodex(skillDir: string, name?: string): void {
  const skillPath = join(skillDir, "SKILL.md")
  let text = readFileSync(skillPath, "utf8")
  text = text.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+(?=---\s*\r?\n)/, "")
  if (name) text = text.replace(/^name:\s*.+$/m, `name: ${name}`)
  if (!text.includes("## Codex Compatibility")) {
    text = `${text.trimEnd()}\n\n## Codex Compatibility\n\n- When this skill mentions TodoWrite, use Codex \`update_plan\`.\n- When this skill mentions OpenCode \`task(...)\`, use Codex \`multi_agent_v1.spawn_agent\` when available.\n- When this skill mentions OpenCode-specific tool names, choose the nearest Codex tool with the same intent and preserve the workflow contract.\n`
  }
  writeFileSync(
    skillPath,
    text,
    "utf8",
  )
  sanitizeSkillAgentMetadata(skillDir)
}

function sanitizeSkillAgentMetadata(skillDir: string): void {
  const agentsDir = join(skillDir, "agents")
  if (!existsSync(agentsDir)) return
  for (const path of listFiles(agentsDir)) {
    if (!/\.(ya?ml)$/i.test(path)) continue
    const original = readFileSync(path, "utf8")
    const sanitized = removeYamlBlock(original, "search_terms")
    if (sanitized !== original) writeFileSync(path, sanitized, "utf8")
  }
}

function listFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) out.push(...listFiles(path))
    else out.push(path)
  }
  return out
}

function removeYamlBlock(text: string, key: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*$/)
    if (!match || match[2] !== key) {
      out.push(line)
      continue
    }
    const indent = match[1].length
    i += 1
    while (i < lines.length) {
      const next = lines[i]
      if (next.trim() && leadingSpaces(next) <= indent) {
        i -= 1
        break
      }
      i += 1
    }
  }
  return out.join("\n")
}

function leadingSpaces(value: string): number {
  const match = value.match(/^ */)
  return match ? match[0].length : 0
}

function resetGeneratedDir(path: string, pluginRoot: string): void {
  const resolvedPath = resolve(path)
  const resolvedPluginRoot = resolve(pluginRoot)
  if (!resolvedPath.startsWith(`${resolvedPluginRoot}${sep}`)) {
    throw new Error(`refusing to remove path outside plugin root: ${resolvedPath}`)
  }
  rmSync(resolvedPath, { recursive: true, force: true })
  mkdirSync(resolvedPath, { recursive: true })
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function readPackageVersion(projectRoot: string): string {
  const parsed = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as unknown
  if (isRecord(parsed) && typeof parsed.version === "string") return parsed.version
  return "0.0.0"
}

function tomlString(value: string): string {
  return JSON.stringify(value.replace(/\r\n/g, "\n"))
}
