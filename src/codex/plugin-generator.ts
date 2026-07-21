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

import { type OcmmConfig } from "../config/schema.ts"
import { loadConfig, type ConfigHost } from "../config/load.ts"
import { createConfigHandler } from "../hooks/config.ts"
import { classifyModelFamily, supportsNativeGptMaxReasoning } from "../intent/model-family.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { DEFAULT_SKILLS_ROOT, loadSharedSkills, loadV1Skills, V1_SKILL_DIRS } from "../intent/skill-loader.ts"
import { LOGICAL_TIER_ORDER } from "../logical-tiers/names.ts"
import { loadMcpJsonSync, resolveMcpServers } from "../mcp/index.ts"
import { PLANNING_AGENT_NAMES, parsePlanningAgentName } from "../planning-agents/names.ts"
import { parseReviewAgentName } from "../review-agents/names.ts"
import { resolveEffectiveRequirement } from "../routing/resolver.ts"
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
const CODEX_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"])

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
    const effective = resolveEffectiveRequirement({
      agentName: sourceName,
      agentsConfig: args.config.agents,
      categoriesConfig: args.config.categories,
      disabledAgents: args.config.disabledAgents,
    })
    const requirement = effective?.requirement ?? null
    const selected = selectCodexModel(requirement, args.config)
    const model = selected.entry?.model ?? args.config.systemDefaultModel ?? "gpt-5.5"
    const reasoningEffort = codexReasoningEffort({
      sourceName,
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
    `- Generated Codex agent profiles use the \`${CODEX_AGENT_PREFIX}-*\` prefix, including functional agents such as \`${CODEX_AGENT_PREFIX}-oracle\`, \`${CODEX_AGENT_PREFIX}-oracle-2nd\`, and \`${CODEX_AGENT_PREFIX}-creative\`.`,
    `- Logical Oracle/Reviewer tiers (for example \`${CODEX_AGENT_PREFIX}-oracle-high\`) are emitted only when explicitly configured.`,
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
  const comments = [
    "# Deepwork profile default; explicit user configuration and the available catalog decide runtime model selection.",
  ]
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

function renderOrderedOracleProfiles(agents: readonly CodexAgentSpec[]): string {
  const tierRank = { low: 0, normal: 1, high: 2, max: 3 } as const
  const slots = new Map<number, { slot: string; tiers: Set<string> }>()

  for (const agent of agents) {
    const identity = parseReviewAgentName(agent.sourceName)
    if (!identity || identity.role !== "oracle") continue
    const existing = slots.get(identity.ordinal)
    if (existing) {
      existing.tiers.add(identity.logicalTier)
      continue
    }
    slots.set(identity.ordinal, { slot: identity.canonicalSlot, tiers: new Set([identity.logicalTier]) })
  }

  if (slots.size === 0) return "- No Oracle profiles are currently generated."

  return [...slots.entries()]
    .sort(([leftOrdinal], [rightOrdinal]) => leftOrdinal - rightOrdinal)
    .map(([ordinal, value]) => {
      const tiers = [...value.tiers]
        .sort((left, right) => tierRank[left as keyof typeof tierRank] - tierRank[right as keyof typeof tierRank])
        .map((tier) => `\`${tier}\``)
        .join(", ")
      return `- Slot ${ordinal}: \`${CODEX_AGENT_PREFIX}-${value.slot}\` (logical tiers: ${tiers})`
    })
    .join("\n")
}

export function renderPlanningLogicalTierProfiles(agents: readonly CodexAgentSpec[]): string {
  const lines = PLANNING_AGENT_NAMES
    .flatMap((role) => {
      const profiles = agents
        .flatMap((agent) => {
          const identity = parsePlanningAgentName(agent.sourceName)
          return identity?.role === role ? [{ agent, logicalTier: identity.logicalTier }] : []
        })
        .sort((left, right) =>
          LOGICAL_TIER_ORDER.indexOf(left.logicalTier) - LOGICAL_TIER_ORDER.indexOf(right.logicalTier))
        .map(({ agent }) => `\`${agent.name}\``)
      return profiles.length > 0 ? [`- \`${role}\`: ${profiles.join(", ")}`] : []
    })
  return lines.length > 0
    ? lines.join("\n")
    : "- No planning logical-tier profiles are generated in this bundle."
}

function renderCodexGenericDelegationEnvelope(): string {
  return [
    "`GOAL:` State one imperative, bounded outcome, including the role, scope, constraints, and required work.",
    "`STOP WHEN:` State the exact completion condition and non-goal boundary.",
    "`EVIDENCE:` State the paths, commands, outputs, or observations that prove completion.",
  ].join("\n")
}

function renderCodexDispatchCompatibility(): string {
  return `### Callable Dispatch Contract

The current callable dispatch-tool schema is the only authority. Examples are not feature proof; omit hidden fields.

Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership. Only call \`create_goal\` when a user, system, or developer instruction explicitly requests runtime goal creation. Ordinary workflow, planning, delegation, or a \`GOAL:\` line does not qualify.

Use the first permitted route in this order:

1. **Exact profile** — use \`agent_type\`, \`agent_path\`, or \`agent_nickname\` only when the current callable schema explicitly guarantees it selects a generated \`${CODEX_AGENT_PREFIX}-*\` profile.
2. **Direct composition** — use only when the current callable schema exposes every model field required by the role, the schema-exact \`reasoning\` or \`reasoning_effort\` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this route as composition, not exact-profile selection.
3. **V1/V2 generic or flat dispatch** — use the canonical envelope below. The child keeps its default or inherited runtime model unless the callable schema exposes and receives a valid explicit override.
4. **Local execution** — when delegation is permitted, use only when no callable native dispatch tool is available. When delegation is not permitted, preserve the role contract and its workflow owner rather than routing around that restriction.

For generic or flat dispatch, put this canonical envelope in the task message:

${renderCodexGenericDelegationEnvelope()}

The generic envelope does not load a profile, select a model, attach a skill, or enable a missing feature.

When the planning logical-tier selector chooses the unsuffixed normal profile and the callable schema proves exact-profile selection is available, the V1 example is \`multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict.")\`. V1 may send \`model\` only when the current callable schema exposes \`model\`. V1 may send exactly the schema-named \`reasoning\` or \`reasoning_effort\` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add \`fork_context\` only when the callable V1 schema exposes it and an explicit inheritance decision requires it.

V2-style flat dispatch uses \`spawn_agent\` to create, \`wait_agent\` to await, \`followup_task\` to continue, and \`interrupt_agent\` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. No stable \`multi_agent_v2\` namespace is guaranteed. V2-style flat tools never receive \`fork_context\`. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.

Only when the callable schema exposes \`fork_turns\` may the agent use \`fork_turns: none\` to request no context. If \`fork_turns\` is hidden, omit it. Other \`fork_turns\` values are only for explicit branch exploration.

\`task_name\` is an identity, not a profile selector. Do not pass \`${CODEX_AGENT_PREFIX}-*.toml\` as a prompt, item, or skill attachment: generated TOML files are installation artifacts, not runtime skills.`
}

function renderCodexRuntimeCompatibility(): string {
  return `## Runtime Controls

${renderCodexDispatchCompatibility()}

### Generated profile references

- \`[@${CODEX_AGENT_PREFIX}-*](subagent://${CODEX_AGENT_PREFIX}-*)\` is a profile reference, not a spawn.
- Plan review normal-profile example, only when chosen by the planning selector and proven callable: \`[@${CODEX_AGENT_PREFIX}-plan-critic](subagent://${CODEX_AGENT_PREFIX}-plan-critic)\`.
- Code or work review: \`[@${CODEX_AGENT_PREFIX}-reviewer](subagent://${CODEX_AGENT_PREFIX}-reviewer)\`.
- Ordered Oracle review starts with \`[@${CODEX_AGENT_PREFIX}-oracle](subagent://${CODEX_AGENT_PREFIX}-oracle)\`; use \`[@${CODEX_AGENT_PREFIX}-oracle-2nd](subagent://${CODEX_AGENT_PREFIX}-oracle-2nd)\` through later configured slots only when explicit additional independent evidence is needed.
- If an exact profile returns \`unknown agent_type\`, continue with Direct composition, then V1/V2 generic or flat dispatch, then Local execution.`
}

function renderWorkflowSkill(config: OcmmConfig, agents: readonly CodexAgentSpec[]): string {
  const agentRows = agents
    .map((agent) => `| ${agent.name} | ${agent.reasoningEffort} | ${agent.sourceName} |`)
    .join("\n")
  const orderedOracleProfiles = renderOrderedOracleProfiles(agents)
  const planningLogicalTierProfiles = renderPlanningLogicalTierProfiles(agents)
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

${renderCodexRuntimeCompatibility()}

## Generated Agents

| Codex agent | Profile effort | Deepwork source |
|---|---|---|
${agentRows}

Generated profile defaults are installation metadata, not mandatory choices. Actual delegation must preserve explicit user configuration and select overrides only from the currently available model catalog.

## Runtime Model Selection

For an exact profile, omit \`model\` and \`reasoning_effort\` by default so Codex can apply the selected \`${CODEX_AGENT_PREFIX}-*\` profile. For direct composition, select the tier model below only when the current tool exposes \`model\`, preserve the profile's existing reasoning effort as the baseline, and load the selected role's developer instructions and required skills. For generic/flat dispatch with no model field, do not invent an override: the child inherits its native/default model while the role and skills are carried in \`message\`. An explicit user-selected model always wins.

### Runtime model upgrades (only when directly selectable)

Apply this section only when the current dispatch surface exposes a \`model\` field or an exact profile route that also accepts a model override. An explicit user-selected model always wins. Determine availability from the current callable surface or active model catalog; model names in examples are references only and never prove availability. When no suitable model in a lane is available, omit the override and preserve the generated profile's existing model and reasoning behavior unchanged.

| Role lane | Selection principle | Reasoning effort | Roles |
|---|---|---|---|
| Flagship | Best available primary reasoning model in the user's catalog | \`xhigh\` minimum for planning, deep implementation, hard reasoning, architecture, algorithmic, security, or high-risk work; use native \`max\` on GPT-5.6 when maximum reasoning is requested, and use the family-supported maximum elsewhere. \`high\` remains acceptable for coordination, implementation, or clarification roles below that threshold. | ${CODEX_AGENT_PREFIX}-orchestrator, ${CODEX_AGENT_PREFIX}-planner, ${CODEX_AGENT_PREFIX}-builder, ${CODEX_AGENT_PREFIX}-clarifier, ${CODEX_AGENT_PREFIX}-deep, ${CODEX_AGENT_PREFIX}-hard-reasoning |
| External review | Same primary reasoning lane as flagship work, selected from available models; Reviewer has logical tiers only and no ordinal slots | \`xhigh\` minimum; use native \`max\` on GPT-5.6 for complex, cross-module, security, performance, high-risk, or final-gate review | ${CODEX_AGENT_PREFIX}-reviewer |
| Ordered Oracle review | Oracle slots are model priority, not capability ranking (\`${CODEX_AGENT_PREFIX}-oracle\`, then \`${CODEX_AGENT_PREFIX}-oracle-2nd\` through configured later slots) | \`xhigh\` minimum for GPT/Codex review routes; preserve native \`max\` when explicitly selected and supported | ${CODEX_AGENT_PREFIX}-oracle*, ${CODEX_AGENT_PREFIX}-oracle-2nd*, ${CODEX_AGENT_PREFIX}-oracle-3rd*... |
| Plan review | Same primary reasoning lane when directly configurable | Every normal or suffixed profile has an xhigh minimum (the xhigh-equivalent floor); local \`max\` only by explicit local configuration | ${CODEX_AGENT_PREFIX}-plan-critic* |
| Mid | Best available mid-tier model; if none exists, use the primary reasoning model at a lower effort | Preserve the profile baseline unless task complexity requires more | ${CODEX_AGENT_PREFIX}-complex, ${CODEX_AGENT_PREFIX}-normal-task, ${CODEX_AGENT_PREFIX}-coding, ${CODEX_AGENT_PREFIX}-research, ${CODEX_AGENT_PREFIX}-frontend, ${CODEX_AGENT_PREFIX}-creative, ${CODEX_AGENT_PREFIX}-documenting, ${CODEX_AGENT_PREFIX}-media-reader, ${CODEX_AGENT_PREFIX}-doc-search |
| Mini | Best available lightweight model for mechanical, search, or fast lookup work | \`high\` for accuracy unless the user explicitly configures otherwise | ${CODEX_AGENT_PREFIX}-quick, ${CODEX_AGENT_PREFIX}-code-search, ${CODEX_AGENT_PREFIX}-explore |

When a newer family is explicitly available, select a demonstrably better model in the same capability lane instead of pinning an example name. Keep the role's high/xhigh/max complexity rule, never override an explicit user model, and fall back to the generated profile default when availability or capability evidence is absent.

Reviewer and Oracle routes use an \`xhigh\`-equivalent minimum when the selected model family exposes that control; otherwise they use the highest supported review effort for that family. GPT-5.6 supports native \`max\`, so complex or high-risk review/verification on a GPT-5.6 selected model may request \`max\` directly. Other families use \`max\` only when their cataloged controls support it.

Every \`${CODEX_AGENT_PREFIX}-plan-critic*\` profile uses an \`xhigh\`-equivalent minimum; raise it only through explicit local configuration.

### Ordered Oracle profiles in this bundle

${orderedOracleProfiles}

Slot ordering is always by Oracle ordinal (\`oracle\`, \`oracle-2nd\`, \`oracle-3rd\`, ...). Logical tier choice never reorders slots.

### Planning logical-tier profiles in this bundle

${planningLogicalTierProfiles}

This inventory describes generated installation output only. The current callable dispatch-tool schema is the final authority for profile availability; generated files and configuration examples are not proof that a profile can be called.

For base generated role \`${CODEX_AGENT_PREFIX}-R\` (\`${CODEX_AGENT_PREFIX}-planner\` or \`${CODEX_AGENT_PREFIX}-plan-critic\`), choose the first actually available candidate:

- An explicit user cost/latency request tries \`${CODEX_AGENT_PREFIX}-R-low\`, then \`${CODEX_AGENT_PREFIX}-R\`; select low only for that explicit cost/latency request.
- Small or clear work without that request uses the unsuffixed \`${CODEX_AGENT_PREFIX}-R\` normal profile.
- Complex, cross-module, or coordination-heavy work tries \`${CODEX_AGENT_PREFIX}-R-high\`, then unsuffixed normal.
- High-risk security, performance, data-loss, release-safety, runtime-safety, or critical-migration work tries \`${CODEX_AGENT_PREFIX}-R-max\`, then high, then unsuffixed normal.

Never invent or synthesize a missing profile. The tier changes only the configured model route, never the role, prompt, mode, permissions, or receipt semantics. \`${CODEX_AGENT_PREFIX}-plan-critic-low\` may select a lower-cost or lower-latency model, but it retains the xhigh-equivalent effort floor. Every \`${CODEX_AGENT_PREFIX}-plan-critic*\` suffix has the same minimum.

### Ordered Oracle review

- Oracle priority is ordered by slot: \`${CODEX_AGENT_PREFIX}-oracle\`, then \`${CODEX_AGENT_PREFIX}-oracle-2nd\` through later configured slots.
- Oracle slots are model priority, not capability ranking.
- The unsuffixed profile is logical \`normal\`; configured \`-low\`, \`-high\`, and \`-max\` profiles select task rigor independently of slot priority.
- Simple final acceptance selects the first available Oracle normal profile.
- Complex cross-module final acceptance selects the first available Oracle plus Reviewer; for each role choose configured \`high\`, falling back to unsuffixed \`normal\` when \`high\` is absent.
- Security, performance, data-loss, release, or runtime-safety review selects configured \`max\`, otherwise configured \`high\`, otherwise unsuffixed \`normal\`.
- Logical \`low\` is selected only by an explicit user/workflow cost-or-latency request and still receives the review-effort floor.
- Additional Oracle passes select later configured slots in order only when additional independent evidence is explicitly needed.
- Configuring multiple Oracle profiles does not fan-out automatically.
- Reviewer has logical tier variants only and has no ordinal profiles.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | ${CODEX_AGENT_PREFIX}-orchestrator, ${CODEX_AGENT_PREFIX}-planner, ${CODEX_AGENT_PREFIX}-builder, ${CODEX_AGENT_PREFIX}-clarifier, ${CODEX_AGENT_PREFIX}-deep, ${CODEX_AGENT_PREFIX}-hard-reasoning | Primary reasoning model from the user's available catalog | xhigh minimum for planner/deep/hard-reasoning; native max for GPT-5.6 maximum-reasoning work. high only for coordination, implementation, or clarification roles below that threshold |
| External review | ${CODEX_AGENT_PREFIX}-reviewer | Primary reasoning lane | xhigh-equivalent minimum when supported; native max for GPT-5.6 complex or high-risk review |
| Ordered Oracle review | ${CODEX_AGENT_PREFIX}-oracle, ${CODEX_AGENT_PREFIX}-oracle-2nd, later configured Oracle slots | Ordered by Oracle slot ordinal; tier choice does not reorder slots | xhigh-equivalent minimum when supported; native max for GPT-5.6 complex or high-risk verification |
| Plan review | ${CODEX_AGENT_PREFIX}-plan-critic* | Primary reasoning lane | xhigh-equivalent minimum for normal and every suffix unless local config raises it |
| Mid | ${CODEX_AGENT_PREFIX}-complex, ${CODEX_AGENT_PREFIX}-normal-task, ${CODEX_AGENT_PREFIX}-coding, ${CODEX_AGENT_PREFIX}-research, ${CODEX_AGENT_PREFIX}-frontend, ${CODEX_AGENT_PREFIX}-creative, ${CODEX_AGENT_PREFIX}-documenting, ${CODEX_AGENT_PREFIX}-media-reader, ${CODEX_AGENT_PREFIX}-doc-search | Available mid-tier model, else primary reasoning model at lower effort | max or high by task shape |
| Mini | ${CODEX_AGENT_PREFIX}-quick, ${CODEX_AGENT_PREFIX}-code-search, ${CODEX_AGENT_PREFIX}-explore | Available lightweight model | high |

### Model tier definitions

- **Flagship**: the most capable primary reasoning model available to the user.
- **Mid-tier**: a lighter-but-capable configured model. If no mid-tier lane is available, use the primary reasoning lane at \`high\` effort instead.
- **Mini**: the smallest/cheapest model available for fast mechanical or lookup tasks.

### Review dispatch guardrail

Oracle and Reviewer profiles are selectable options, not automatic fan-out. Choose exactly the profiles required by risk/complexity and dispatch only those selections.

${CODEX_AGENT_PREFIX}-plan-critic* provides receipt-focused plan review through the Plan review lane at an \`xhigh\`-equivalent minimum for every suffix.

Reviewer and Oracle routes use an \`xhigh\`-equivalent minimum when the selected model family exposes that control; otherwise they use the highest supported review effort for that family. GPT-5.6 supports native \`max\`; for other families, request \`max\` only when the selected model and catalog expose a maximum-effort control.

### Example names

Concrete model names in docs, tests, or generated profile comments are examples and compatibility references only. Select from the user's currently available model catalog and explicit local configuration; never require a specific example name or provider channel.
`
}

function codexAgentInstructions(args: {
  sourceName: string
  prompt: string
  workflow: OcmmConfig["workflow"]
  preferredChain: readonly string[]
  brainstormingSkill: string
}): string {
  return [
    `You are the deepwork Codex adapter for Deepwork agent "${args.sourceName}".`,
    `Deepwork workflow: ${args.workflow}.`,
    "Model defaults come from the generated profile. Runtime model selection must preserve explicit user configuration and use only models available in the current catalog.",
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
    renderCodexDispatchCompatibility(),
    "Ordered Oracle review semantics:",
    "- Oracle slots are model priority, not capability ranking: dw-oracle, then dw-oracle-2nd through configured later slots.",
    "- Unsuffixed profile is logical normal; -low/-high/-max tiers choose rigor independent of slot priority.",
    "- Simple final acceptance selects first available Oracle normal.",
    "- Complex cross-module final acceptance selects first available Oracle plus Reviewer; choose high then normal.",
    "- Security/performance/data-loss/release/runtime-safety selects max then high then normal.",
    "- Logical low is only for explicit cost/latency requests and still receives the review floor.",
    "- Additional Oracle passes use later configured slots in order only when additional independent evidence is explicitly needed.",
    "- Configuring multiple Oracle profiles does not fan-out automatically.",
    "- Reviewer has logical tiers only and no ordinal profiles.",
    "When a model override is directly supported, preserve an explicit user model and select only from the user's current available catalog. For GPT/Codex review routes (plan-critic and parsed review names), enforce at least xhigh unless the selected effort is already xhigh or native max. If no suitable model is available in a lane, keep the profile default; if a newer cataloged model is demonstrably better in the same lane, it may replace an example preference without changing the role contract.",
  ].join("\n")
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
  sourceName: string
  entry?: FallbackEntry
  model: string
  variant?: Variant
}): string {
  const direct = args.entry?.reasoningEffort
  const effort = direct ?? (args.variant
    ? translateVariant("codex", args.variant, { modelID: args.model }).reasoningEffort
    : undefined)
  const normalized = effort && CODEX_REASONING_EFFORTS.has(effort)
      ? effort
      : "high"
  const family = classifyModelFamily({
    providerID: args.entry?.providers[0],
    modelID: args.model,
  })
  const isGptCodex = family === "gpt" || family === "codex"
  const gated = isGptCodex && normalized === "max" && !supportsNativeGptMaxReasoning(args.model)
    ? "xhigh"
    : normalized
  const planningIdentity = parsePlanningAgentName(args.sourceName)
  if (planningIdentity?.role === "plan-critic") {
    return gated === "xhigh" || gated === "max" ? gated : "xhigh"
  }
  const protectedReview = parseReviewAgentName(args.sourceName) !== null
  if (protectedReview && isGptCodex) {
    return gated === "xhigh" || gated === "max" ? gated : "xhigh"
  }
  return gated
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
    text = `${text.trimEnd()}\n\n## Codex Compatibility\n\n- When this skill mentions TodoWrite, use Codex \`update_plan\`.\n- When this skill mentions OpenCode \`task(...)\`, preserve its task contract and use the current callable Codex dispatch route.\n- When this skill mentions OpenCode-specific tool names, choose the nearest callable Codex tool with the same intent and preserve the workflow contract.\n`
  }
  if (!text.includes("### Callable Dispatch Contract")) {
    text = `${text.trimEnd()}\n\n${renderCodexDispatchCompatibility()}\n`
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
