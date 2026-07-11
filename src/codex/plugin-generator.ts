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
import { basename, dirname, join, relative, resolve, sep } from "node:path"

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
export const CODEX_PROJECT_AGENTS_DIR = ".codex/agents"
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
  projectAgentsRoot?: string
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
  projectAgentsRoot?: string | false
  config?: OcmmConfig
  packageVersion?: string
} = {}): Promise<CodexPluginGenerationResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd())
  const pluginRoot = resolve(options.pluginRoot ?? join(projectRoot, CODEX_PLUGIN_DIR))
  const marketplacePath = resolve(options.marketplacePath ?? join(projectRoot, CODEX_MARKETPLACE_FILE))
  const projectAgentsRoot = options.projectAgentsRoot === false
    ? null
    : resolve(options.projectAgentsRoot ?? join(projectRoot, CODEX_PROJECT_AGENTS_DIR))
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
  if (projectAgentsRoot) {
    writeProjectCodexAgents(projectRoot, projectAgentsRoot, agents)
  }
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
    ...(projectAgentsRoot ? { projectAgentsRoot } : {}),
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
  writeAgentFiles(agentsDir, agents)
}

function writeProjectCodexAgents(projectRoot: string, agentsRoot: string, agents: readonly CodexAgentSpec[]): void {
  const safetyRoot = resolve(agentsRoot).startsWith(`${resolve(projectRoot)}${sep}`)
    ? projectRoot
    : dirname(dirname(agentsRoot))
  resetGeneratedDir(agentsRoot, safetyRoot)
  writeAgentFiles(agentsRoot, agents)
}

function writeAgentFiles(agentsDir: string, agents: readonly CodexAgentSpec[]): void {
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
- Use the current callable Codex subagent-dispatch tool when delegation is useful and available. Match its actual schema: prefer exact profile selection, then complete model-plus-role composition, then generic/flat dispatch with a self-contained role-and-skills message.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex \`apply_patch\` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated \`${CODEX_AGENT_PREFIX}-*\` agent TOML files from this plugin bundle's \`agents/\` directory as installable profiles when you want Deepwork role prompts as Codex agents. Resolve the directory relative to the installed plugin root, not a source checkout path.

## Workflow

Configured workflow: \`${config.workflow}\`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching Deepwork role or generated \`${CODEX_AGENT_PREFIX}-*\` Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify with the repository's own commands before reporting completion.

## Delegation

When a Deepwork role maps to a generated agent, use the exact Codex agent type when the current dispatch tool can select it. A generic or flat subagent does not load the generated profile; when that is the only callable route, follow the generic fallback below and state the role, skills, and task explicitly in its message.

- Plan review: \`[@${CODEX_AGENT_PREFIX}-plan-critic](subagent://${CODEX_AGENT_PREFIX}-plan-critic)\` or \`multi_agent_v1.spawn_agent(agent_type="${CODEX_AGENT_PREFIX}-plan-critic", fork_context=false, message="Review the plan at <path>.")\`
- Code/work review: \`[@${CODEX_AGENT_PREFIX}-reviewer](subagent://${CODEX_AGENT_PREFIX}-reviewer)\` or \`multi_agent_v1.spawn_agent(agent_type="${CODEX_AGENT_PREFIX}-reviewer", fork_context=false, message="<bounded review task>")\`
- Self-supervision: \`[@${CODEX_AGENT_PREFIX}-oracle](subagent://${CODEX_AGENT_PREFIX}-oracle)\` or \`multi_agent_v1.spawn_agent(agent_type="${CODEX_AGENT_PREFIX}-oracle", fork_context=false, message="<specific verification task>")\`

The \`${CODEX_AGENT_PREFIX}-*\` agent profile is the preferred selector. When a current native dispatch tool can select that profile directly, use it before any generic route.

Do not pass \`${CODEX_AGENT_PREFIX}-*.toml\` files as \`items\`, \`skill\` attachments, or prompt context to a generic subagent. TOML files are installation artifacts for Codex's agent registry, not runtime skills.

The current callable dispatch-tool schema is the only availability signal. MultiAgent V1/V2 names are useful hints but not a contract: use any current or future native dispatch surface only according to the parameters it actually exposes. Do not inspect unrelated or deferred tools for a hidden profile selector. An \`[@${CODEX_AGENT_PREFIX}-*](subagent://${CODEX_AGENT_PREFIX}-*)\` link does not spawn an agent, and a \`task_name\` does not select a profile.

Use the first available native route in this order:

1. **Exact profile** — a tool field such as \`agent_type\`, \`agent_path\`, or \`agent_nickname\` that selects the generated \`${CODEX_AGENT_PREFIX}-*\` profile.
2. **Direct composition** — a native dispatch tool that can choose the required model and supply the role's actual system or developer instructions plus skills. Select the matching model from the role tier below, supply the selected role's generated developer-instruction content (not its TOML wrapper), and attach or load the workflow skill and task-relevant \`SKILL.md\` artifacts through the fields the tool actually exposes. State that this is a generic fallback, not an exact-profile invocation.
3. **Generic or flat dispatch** — when a callable subagent tool can only accept a task identity and message (for example \`task_name\`, \`message\`, and \`fork_turns\`), still delegate. Put a self-contained role envelope in \`message\`: the Deepwork role name and purpose, the bounded task, relevant files and constraints, acceptance criteria, and a \`Required skills:\` list naming the workflow skill and task-relevant skills. Use any real skill-loading field only when it is exposed. Do not claim that this loaded the \`${CODEX_AGENT_PREFIX}-*\` profile; the child uses its inherited/default model and follows the role and skill guidance in the message.
4. **Local execution** — use only when no callable native subagent-dispatch route is available.

If an exact \`${CODEX_AGENT_PREFIX}-*\` invocation returns \`unknown agent_type\`, continue at route 2 when it is complete enough, otherwise use route 3. A tool limited to \`task_name\`, \`message\`, and \`fork_turns\` cannot select a model or load the profile payload, but it is still a valid generic/flat dispatch route. Install the generated TOML files into project \`.codex/agents/\` or personal \`~/.codex/agents/\` and restart or refresh the Codex thread only when restoring exact-profile delegation is itself in scope.

## Generated Agents

| Codex agent | Model | Effort | Deepwork source |
|---|---|---|---|
${agentRows}

## Runtime Model Selection

For an exact profile, omit \`model\` and \`reasoning_effort\` by default so Codex can apply the selected \`${CODEX_AGENT_PREFIX}-*\` profile. For direct composition, select the tier model below only when the current tool exposes \`model\`, preserve the profile's existing reasoning effort as the baseline, and load the selected role's developer instructions and required skills. For generic/flat dispatch with no model field, do not invent an override: the child inherits its native/default model while the role and skills are carried in \`message\`. An explicit user-selected model always wins.

### GPT runtime upgrades (only when directly selectable)

Apply this section only when the current dispatch surface exposes a \`model\` field or an exact profile route that also accepts a model override. An explicit user-selected model always wins. Determine availability from the current callable surface or active model catalog; do not assume a model exists from its name. When no GPT-5.6 model is available, omit the override and preserve the generated profile's existing model and reasoning behavior unchanged.

| Role lane | Preferred GPT-5.6 model | Reasoning effort | Roles |
|---|---|---|---|
| Flagship | \`gpt-5.6-sol\` | \`high\` by default; \`xhigh\` for deep, architecture, algorithmic, security, or high-risk reasoning | ${CODEX_AGENT_PREFIX}-orchestrator, ${CODEX_AGENT_PREFIX}-planner, ${CODEX_AGENT_PREFIX}-builder, ${CODEX_AGENT_PREFIX}-clarifier, ${CODEX_AGENT_PREFIX}-deep, ${CODEX_AGENT_PREFIX}-hard-reasoning |
| External review | \`gpt-5.6-sol\` | \`high\` for bounded review; \`xhigh\` for complex, cross-module, security, performance, or final-gate review | ${CODEX_AGENT_PREFIX}-reviewer, ${CODEX_AGENT_PREFIX}-plan-critic |
| Cross-check | \`gpt-5.6-terra\` | \`high\` for focused self-supervision; \`xhigh\` for complex or high-risk verification | ${CODEX_AGENT_PREFIX}-oracle |
| Mid | \`gpt-5.6-terra\` | Preserve the profile baseline unless task complexity requires more | ${CODEX_AGENT_PREFIX}-complex, ${CODEX_AGENT_PREFIX}-normal-task, ${CODEX_AGENT_PREFIX}-coding, ${CODEX_AGENT_PREFIX}-research, ${CODEX_AGENT_PREFIX}-frontend, ${CODEX_AGENT_PREFIX}-creative, ${CODEX_AGENT_PREFIX}-documenting, ${CODEX_AGENT_PREFIX}-media-reader, ${CODEX_AGENT_PREFIX}-doc-search |
| Mini | \`gpt-5.6-luna\` | \`high\` | ${CODEX_AGENT_PREFIX}-quick, ${CODEX_AGENT_PREFIX}-code-search, ${CODEX_AGENT_PREFIX}-explore |

When a newer GPT family is explicitly available, select a demonstrably better model in the same capability lane instead of pinning the 5.6 name: newest flagship for Flagship and External review, and a strong non-identical mid-tier or flagship for Cross-check. Keep the role's high/xhigh complexity rule, never override an explicit user model, and fall back to the generated profile default when availability or capability evidence is absent.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | ${CODEX_AGENT_PREFIX}-orchestrator, ${CODEX_AGENT_PREFIX}-planner, ${CODEX_AGENT_PREFIX}-builder, ${CODEX_AGENT_PREFIX}-clarifier, ${CODEX_AGENT_PREFIX}-deep, ${CODEX_AGENT_PREFIX}-hard-reasoning | Latest-gen flagship | high or xhigh by complexity |
| External review | ${CODEX_AGENT_PREFIX}-reviewer, ${CODEX_AGENT_PREFIX}-plan-critic | Latest-gen flagship | high or xhigh by review risk |
| Cross-check | ${CODEX_AGENT_PREFIX}-oracle | Strong non-identical mid-tier or flagship | high or xhigh by verification risk |
| Mid | ${CODEX_AGENT_PREFIX}-complex, ${CODEX_AGENT_PREFIX}-normal-task, ${CODEX_AGENT_PREFIX}-coding, ${CODEX_AGENT_PREFIX}-research, ${CODEX_AGENT_PREFIX}-frontend, ${CODEX_AGENT_PREFIX}-creative, ${CODEX_AGENT_PREFIX}-documenting, ${CODEX_AGENT_PREFIX}-media-reader, ${CODEX_AGENT_PREFIX}-doc-search | Latest-gen mid-tier at max, else flagship at high | max or high |
| Mini | ${CODEX_AGENT_PREFIX}-quick, ${CODEX_AGENT_PREFIX}-code-search, ${CODEX_AGENT_PREFIX}-explore | Latest-gen mini | high |

### Model tier definitions

- **Flagship**: the most capable model of the latest generation (e.g., gpt-5.5 in the 5.x gen).
- **Mid-tier**: a lighter-but-capable model within the latest generation. If the latest gen has no mid-tier, use the flagship at \`high\` effort instead.
- **Mini**: the smallest/cheapest model of the latest generation (e.g., \`-mini\` variants).
- **Strong non-identical cross-check**: a capable available model that differs from the primary lane when possible; model diversity is useful, but not a reason to bypass the newer-model policy.

### Independent review rule

${CODEX_AGENT_PREFIX}-oracle provides self-supervision and should prefer the Cross-check lane, while ${CODEX_AGENT_PREFIX}-reviewer and ${CODEX_AGENT_PREFIX}-plan-critic provide external review through the External review lane. Preserve an independent review perspective by selecting a non-identical capable model for oracle when available, but prefer the newer-model policy over forced generation downgrades. If only one capable model is available, use it at the lane's complexity-appropriate effort.

### Example (GPT-5.6 generation — verify against your available models)

| Tier | Example model | Effort |
|---|---|---|
| Flagship | gpt-5.6-sol | high or xhigh |
| External review | gpt-5.6-sol | high or xhigh |
| Cross-check | gpt-5.6-terra | high or xhigh |
| Mid | gpt-5.6-terra | high or max |
| Mini | gpt-5.6-luna | high |
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
    "- Use the current callable Codex subagent-dispatch tool when available; make delegated tasks self-contained and follow its actual parameter schema.",
    "- Use apply_patch for manual code edits.",
    "- Use shell commands for inspection and verification, preferring rg for text search.",
    "- Treat AGENTS.md as native Codex project guidance.",
    "- The model and reasoning_effort in your profile are defaults. The main agent may override them only when its current dispatch tool exposes those parameters.",
    "",
    "## Injected Brainstorming Skill (HARD-GATE)",
    "The following skill is always loaded. It is mandatory for any new feature, component, or behavior change — present a design and get explicit user approval BEFORE any code.",
    "",
    args.brainstormingSkill,
    "",
    "Original Deepwork prompt:",
    args.prompt,
    "",
    "## Subagent Dispatch Compatibility (HARD-GATE)",
    "The current callable dispatch-tool schema is authoritative; MultiAgent V1/V2 names and examples elsewhere are lower-priority compatibility examples.",
    "When delegating, first use an exact profile selector (agent_type, agent_path, or agent_nickname) when exposed. Otherwise use direct composition only when the tool can select the model and carry system/developer instructions plus skills. Otherwise, if a generic or flat dispatch tool is callable, still delegate with a self-contained message containing TASK, ROLE, REQUIRED SKILLS, CONTEXT, CONSTRAINTS, and EXPECTED OUTCOME. Do not claim that a generic message loaded a dw-* profile, and do not pass a dw-*.toml installation artifact as a skill or prompt attachment. Use local execution only when no native dispatch tool is callable.",
    "When a model override is directly supported, preserve an explicit user model. Otherwise prefer GPT-5.6 Sol for flagship and external-review work, GPT-5.6 Terra for oracle cross-checks, and choose high versus xhigh from task complexity. If GPT-5.6 is absent, keep the profile default; if a newer cataloged GPT model is demonstrably better in the same lane, it may replace the 5.6 preference without changing the role contract.",
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
    text = `${text.trimEnd()}\n\n## Codex Compatibility\n\n- When this skill mentions TodoWrite, use Codex \`update_plan\`.\n- When this skill mentions OpenCode \`task(...)\`, use the current callable Codex subagent-dispatch tool and preserve the task contract; prefer an exact profile selector, then complete direct composition, then generic/flat dispatch with role and required skills in the message.\n- When this skill mentions OpenCode-specific tool names, choose the nearest Codex tool with the same intent and preserve the workflow contract.\n`
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
