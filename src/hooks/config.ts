import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { loadBuiltinCommands, type CommandDefinition } from "../commands/builtin.ts"
import { getAgentPrompt, getCategoryPrompt, getDeepworkPrompt, isGpt56Model, pickDeepworkVariantForAgent } from "../intent/prompt-loader.ts"
import { buildSkillCommand, DEFAULT_SKILLS_ROOT, loadSharedSkills, loadV1SkillCommands } from "../intent/skill-loader.ts"
import { resolveMcpServers } from "../mcp/index.ts"
import type { Agent, Category, FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { normalizeAgentShorthand, normalizeShorthand, type NormalizedShorthand } from "../config/normalize.ts"
import type { OcmmConfig } from "../config/schema.ts"
import { selectCatalogModel } from "../routing/model-upgrades.ts"
import { isRecord, log } from "../shared/logger.ts"

const COMPAT_AGENT_ALIASES = [
  { alias: "explore", target: "code-search" },
] as const

type PermissionAction = "ask" | "allow" | "deny"
type GranularPermission = Record<string, PermissionAction>
type PermissionDefault = PermissionAction | GranularPermission
type PermissionDefaults = Record<string, PermissionDefault>

const PRIMARY_COORDINATORS = ["orchestrator", "builder"] as const
const UTILITY_LEAF_AGENTS = [
  "quick",
  "code-search",
  "explore",
  "doc-search",
  "research",
  "media-reader",
] as const
const READ_ONLY_UTILITY_AGENTS = [
  "code-search",
  "explore",
  "doc-search",
  "research",
  "media-reader",
] as const
const STANDARD_WORKFLOW_SUBAGENTS = [
  "coding",
  "normal-task",
  "frontend",
  "creative",
  "hard-reasoning",
  "documenting",
] as const
const READ_ONLY_WORKFLOW_AGENTS = [
  "planner",
  "reviewer",
  "oracle",
  "oracle-high",
  "clarifier",
  "plan-critic",
] as const
const LOCAL_COORDINATORS = ["deep", "complex"] as const
const SPECIALIST_EXECUTION_AGENTS = [
  "coding",
  "frontend",
  "hard-reasoning",
  "creative",
  "documenting",
] as const
const QUESTION_ENABLED_WORKFLOW_AGENTS = ["planner", "deep", "complex", "coding", "normal-task"] as const

function taskAllowlist(allowed: readonly string[]): GranularPermission {
  const rules: GranularPermission = { "*": "deny" }
  for (const name of allowed) rules[name] = "allow"
  return rules
}

const LOCALE_GUIDANCE_TAG = "ocmm-locale-guidance"
const LOCALE_GUIDANCE_BLOCK = new RegExp(
  `<${LOCALE_GUIDANCE_TAG}>[\\s\\S]*?<\\/${LOCALE_GUIDANCE_TAG}>\\s*(?:---\\s*)?`,
  "g",
)

function fmtModel(entry: FallbackEntry): string {
  const provider = entry.providers[0] ?? ""
  return provider ? `${provider}/${entry.model}` : entry.model
}

type AgentExtras = {
  mode?: string
  prompt?: string
  promptPrefix?: string
  promptSuffix?: string
  /** Catalog-confirmed runtime upgrade; never overrides an explicit user model. */
  model?: string
}

function hasExplicitModelSelection(entry: unknown): boolean {
  if (typeof entry === "string") return true
  if (!isRecord(entry)) return false
  return ["model", "fallbackModels", "requirement", "alias"].some((key) => entry[key] !== undefined)
}

function rawAgentModel(agentMap: Record<string, unknown>, name: string): string | undefined {
  const entry = agentMap[name]
  return isRecord(entry) && typeof entry.model === "string" ? entry.model : undefined
}

function applyAgentEntry(
  agentMap: Record<string, unknown>,
  agent: Agent,
  override: NormalizedShorthand | undefined,
  extras?: AgentExtras,
): void {
  if (override?.disabled) return

  let chain: FallbackEntry[] = agent.requirement.fallbackChain
  const description = override?.description ?? agent.description

  if (override?.requirement?.fallbackChain?.length) {
    chain = override.requirement.fallbackChain
  }
  if (!chain.length) return
  const head = chain[0]!
  const modelStr = extras?.model ?? fmtModel(head)

  const existing = isRecord(agentMap[agent.name])
    ? (agentMap[agent.name] as Record<string, unknown>)
    : {}

  if (typeof existing.model !== "string") existing.model = modelStr
  if (description && typeof existing.description !== "string") {
    existing.description = description
  }
  if (extras?.mode && typeof existing.mode !== "string") existing.mode = extras.mode
  if (extras?.prompt && typeof existing.prompt !== "string") existing.prompt = extras.prompt
  if (extras?.promptPrefix && typeof existing.prompt === "string") {
    existing.prompt = prependPromptPrefix(existing.prompt, extras.promptPrefix)
  }
  if (extras?.promptSuffix) {
    const basePrompt = typeof existing.prompt === "string" ? existing.prompt : ""
    existing.prompt = appendPromptSuffix(basePrompt, extras.promptSuffix)
  }
  if (override?.permission) mergePermission(existing, override.permission, true)

  agentMap[agent.name] = existing
}

function buildLocaleGuidance(locale?: string): string {
  const configuredLocale = locale?.trim()
  const guidance = configuredLocale
    ? [
        `Configured locale: ${configuredLocale}.`,
        "Prefer this language/locale for your thinking process, visible planning, and conversation with the user.",
      ]
    : [
        "No locale is configured.",
        "Infer the user's preferred language from their latest message and conversation context, then prefer that language for your thinking process, visible planning, and conversation.",
        "If the user mixes languages, use the language that best matches the current request.",
      ]

  return [
    `<${LOCALE_GUIDANCE_TAG}>`,
    "Language and locale:",
    ...guidance.map((line) => `- ${line}`),
    "- Preserve code, identifiers, file paths, commands, protocol names, quotes, and user-requested wording in their original language when accuracy requires it.",
    "- If the user explicitly asks for a different output language for a specific answer, follow that local request unless it conflicts with higher-priority instructions.",
    `</${LOCALE_GUIDANCE_TAG}>`,
  ].join("\n")
}

function prependPromptPrefix(prompt: string, prefix: string): string {
  const body = prompt.replace(LOCALE_GUIDANCE_BLOCK, "").trim()
  const cleanPrefix = prefix.trim()
  return body ? `${cleanPrefix}\n\n---\n\n${body}` : cleanPrefix
}

const DELEGATION_CONTRACT_TAG = "ocmm-delegation-contract"
const DELEGATION_CONTRACT_BLOCK = new RegExp(
  `(?:\\n\\n---\\n\\n)?<${DELEGATION_CONTRACT_TAG}>[\\s\\S]*?<\\/${DELEGATION_CONTRACT_TAG}>\\s*`,
  "g",
)

function appendPromptSuffix(prompt: string, suffix: string): string {
  const body = prompt.replace(DELEGATION_CONTRACT_BLOCK, "").trim()
  const cleanSuffix = suffix.trim()
  return body ? `${body}\n\n---\n\n${cleanSuffix}` : cleanSuffix
}

const UTILITY_LEAF_AGENT_SET: ReadonlySet<string> = new Set(UTILITY_LEAF_AGENTS)
const STANDARD_WORKFLOW_SUBAGENT_SET: ReadonlySet<string> = new Set(STANDARD_WORKFLOW_SUBAGENTS)
const READ_ONLY_WORKFLOW_AGENT_SET: ReadonlySet<string> = new Set(READ_ONLY_WORKFLOW_AGENTS)
const LOCAL_COORDINATOR_SET: ReadonlySet<string> = new Set(LOCAL_COORDINATORS)

function formatTargets(names: readonly string[]): string {
  return names.map((name) => `\`${name}\``).join(", ")
}

function wrapDelegationContract(lines: readonly string[]): string {
  return [
    `<${DELEGATION_CONTRACT_TAG}>`,
    "## Delegation Contract (Authoritative)",
    ...lines,
    "This contract overrides any skill, model calibration, generated-adapter compatibility text, or other prompt layer that suggests broader delegation.",
    `</${DELEGATION_CONTRACT_TAG}>`,
  ].join("\n")
}

function delegationContractFor(name: string): string {
  if (UTILITY_LEAF_AGENT_SET.has(name)) {
    return wrapDelegationContract([
      "This role is a utility leaf agent. Do not dispatch any subagent.",
      "Complete the bounded assignment with direct tools and return the result to the caller.",
    ])
  }

  if (READ_ONLY_WORKFLOW_AGENT_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient and a separate bounded research result materially improves completion.",
      `Allowed utility targets: ${formatTargets(READ_ONLY_UTILITY_AGENTS)}.`,
      "`quick` is forbidden because this read-only role must not modify work by proxy. Planning, review, coordination, and implementation workflow agents are also forbidden.",
      "Return the completed plan or findings to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (STANDARD_WORKFLOW_SUBAGENT_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when direct tools are insufficient or a separate bounded utility result materially improves completion.",
      `Allowed utility targets: ${formatTargets(UTILITY_LEAF_AGENTS)}.`,
      "Do not dispatch planning, review, coordination, or implementation workflow agents.",
      "After local verification, return status and evidence to the caller. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  if (LOCAL_COORDINATOR_SET.has(name)) {
    return wrapDelegationContract([
      "Use direct tools first. Delegate only when the child owns a distinct bounded deliverable that materially improves completion.",
      "Multiple steps, routine confirmation, or wanting another opinion are not sufficient.",
      `Allowed utility targets: ${formatTargets(UTILITY_LEAF_AGENTS)}.`,
      `Allowed specialist targets: ${formatTargets(SPECIALIST_EXECUTION_AGENTS)}.`,
      "Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, `reviewer`, `oracle`, `oracle-high`, `normal-task`, `deep`, or `complex`.",
      "Integrate and verify child results, then return to the parent. Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review are orchestrator-owned.",
    ])
  }

  return ""
}

function mergePermission(entry: Record<string, unknown>, permission: PermissionDefaults, overwrite: boolean): void {
  const existing = isRecord(entry.permission) ? entry.permission : {}
  const merged: Record<string, unknown> = { ...existing }
  for (const [name, value] of Object.entries(permission)) {
    if (overwrite || merged[name] === undefined) merged[name] = value
  }
  entry.permission = merged
}

function deepworkPromptForAgent(
  agent: Agent,
  override: NormalizedShorthand | undefined,
  workflow: string,
  selectedModel?: string,
): string {
  const chain =
    override?.requirement?.fallbackChain?.length
      ? override.requirement.fallbackChain
      : agent.requirement.fallbackChain
  const prefModel = selectedModel ?? chain[0]?.model ?? ""
  const gpt56Specialization = isGpt56Model(prefModel) ? getDeepworkPrompt("gpt-5.6") : ""
  // Codex profiles are generated ahead of runtime model overrides. Carry the
  // separately guarded GPT-5.6 layer in every Codex profile so a later Sol or
  // Terra override can apply it; non-5.6 models are explicitly told to ignore it.
  if (workflow === "codex") {
    const base = getDeepworkPrompt("gpt")
    const specialization = getDeepworkPrompt("gpt-5.6")
    return specialization ? `${base}\n\n---\n\n${specialization}` : base
  }
  const variant = pickDeepworkVariantForAgent({
    agentName: agent.name,
    preferenceModel: prefModel,
  })
  if (variant === "gpt-5.6") {
    return `${getDeepworkPrompt("gpt")}\n\n---\n\n${getDeepworkPrompt("gpt-5.6")}`
  }
  const base = getDeepworkPrompt(variant)
  return gpt56Specialization ? `${base}\n\n---\n\n${gpt56Specialization}` : base
}

function promptForBuiltinAgent(
  agent: Agent,
  override: NormalizedShorthand | undefined,
  workflow: string,
  selectedModel?: string,
): string {
  const promptName = agent.promptSource ?? agent.name
  const rolePrompt = getAgentPrompt(promptName).trim()
  const modelPrompt = deepworkPromptForAgent(agent, override, workflow, selectedModel).trim()
  if (!rolePrompt) return modelPrompt
  if (!modelPrompt) return rolePrompt
  return `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\nThe role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the workflow/model guidance below only for reliability, model-family calibration, and general execution discipline when it does not conflict with the role prompt.\n\n${modelPrompt}\n</workflow-model-calibration>`
}

function promptForBuiltinCategory(
  categoryName: string,
  workflow: string,
  selectedModel: string,
): string {
  const rolePrompt = getCategoryPrompt(categoryName).trim()
  const needsGpt56Calibration = workflow === "codex" || isGpt56Model(selectedModel)
  const modelPrompt = needsGpt56Calibration ? getDeepworkPrompt("gpt-5.6").trim() : ""
  if (!rolePrompt) return modelPrompt
  if (!modelPrompt) return rolePrompt
  return `${rolePrompt}\n\n---\n\n<workflow-model-calibration>\nThe category role prompt above is authoritative for this agent's scope, permissions, and output contract. Use the workflow/model guidance below only for GPT-5.6 calibration when it does not conflict with the category role prompt.\n\n${modelPrompt}\n</workflow-model-calibration>`
}

function categoryAsAgent(c: Category, override?: ModelRequirement): Agent {
  return {
    name: c.name,
    description: c.description,
    requirement: override ?? c.requirement,
  }
}

export function createConfigHandler(args: {
  getConfig: () => OcmmConfig
  skillsRoot?: string
  cwd?: string
  registeredAgentModels?: Map<string, string>
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, _output) => {
    args.registeredAgentModels?.clear()
    const cfg = args.getConfig()
    if (!isRecord(rawInput)) return

    const target = isRecord(rawInput.config) ? rawInput.config : rawInput
    const registered = registerSkillsAndCommands(target, cfg, args.skillsRoot)
    const registeredMcps = registerMcps(target, cfg, args.cwd)

    if (!cfg.registerBuiltinAgents) {
      log.info(`config: registered ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`)
      return
    }

    if (!isRecord(target.agent)) target.agent = {}
    const agentMap = target.agent as Record<string, unknown>

    const disabled = new Set(cfg.disabledAgents ?? [])

    if (cfg.disableOpenCodeBuiltinAgents) {
      for (const name of ["build", "plan"]) {
        if (!isRecord(agentMap[name])) agentMap[name] = {}
        const entry = agentMap[name] as Record<string, unknown>
        if (entry.disable === undefined) entry.disable = true
      }
    }

    if (cfg.defaultAgent !== false) {
      const desired = typeof cfg.defaultAgent === "string" ? cfg.defaultAgent : "orchestrator"
      if (!disabled.has(desired) && typeof target.default_agent !== "string") {
        target.default_agent = desired
      }
    }

    for (const a of BUILTIN_AGENTS) {
      if (disabled.has(a.name)) continue
      let norm = normalizeAgentShorthand(a.name, cfg.agents)
      // Inject builtin defaultAlias when the user wrote an entry for this agent
      // but didn't specify a model (no requirement) and didn't set an explicit
      // alias. If there is no user entry at all, the builtin requirement stands.
      const userEntryForAgent = cfg.agents?.[a.name]
      let inheritedDefaultAlias = false
      if (userEntryForAgent !== undefined && !norm?.requirement?.fallbackChain?.length && a.defaultAlias && !userEntryForAgent.alias) {
        const aliasNorm = normalizeAgentShorthand(a.defaultAlias, cfg.agents)
        if (aliasNorm?.requirement?.fallbackChain?.length) {
          norm = { ...norm, requirement: aliasNorm.requirement }
          inheritedDefaultAlias = true
        }
      }
      const existingModel = rawAgentModel(agentMap, a.name)
      const configuredRequirement = norm?.requirement?.fallbackChain?.length
        ? norm.requirement
        : undefined
      const suppressCatalog = hasExplicitModelSelection(userEntryForAgent) || inheritedDefaultAlias
      const catalogModel = !existingModel && !suppressCatalog
        ? selectCatalogModel(target, a.name, a.requirement)
        : undefined
      const finalModel = existingModel
        ?? (configuredRequirement ? fmtModel(configuredRequirement.fallbackChain[0]!) : undefined)
        ?? catalogModel
        ?? fmtModel(a.requirement.fallbackChain[0]!)
      const prompt = promptForBuiltinAgent(a, norm, cfg.workflow, finalModel)
      const mode = a.name === "orchestrator" || a.name === "builder"
        ? "primary"
        : a.name === "planner"
          ? "all"
          : "subagent"
      const extras: AgentExtras = {}
      if (prompt) extras.prompt = prompt
      extras.mode = mode
      extras.model = finalModel
      if (mode === "primary" || mode === "all") {
        extras.promptPrefix = buildLocaleGuidance(cfg.locale)
      }
      const contract = delegationContractFor(a.name)
      if (contract) extras.promptSuffix = contract
      applyAgentEntry(agentMap, a, norm, extras)
    }

    for (const c of BUILTIN_CATEGORIES) {
      if (disabled.has(c.name)) continue
      const agentOverride = normalizeAgentShorthand(c.name, cfg.agents)
      const categoryOverride = normalizeShorthand(cfg.categories?.[c.name])

      const baseAgent = categoryAsAgent(c, categoryOverride?.requirement)
      const merged: NormalizedShorthand | undefined =
        agentOverride ?? categoryOverride

      const extras: AgentExtras = { mode: "subagent" }
      const hasUserSelection = hasExplicitModelSelection(cfg.agents?.[c.name]) || hasExplicitModelSelection(cfg.categories?.[c.name])
      const existingModel = rawAgentModel(agentMap, c.name)
      const configuredRequirement = agentOverride?.requirement ?? categoryOverride?.requirement
      const catalogModel = !hasUserSelection && !existingModel
        ? selectCatalogModel(target, c.name, baseAgent.requirement)
        : undefined
      const finalModel = existingModel
        ?? (configuredRequirement ? fmtModel(configuredRequirement.fallbackChain[0]!) : undefined)
        ?? catalogModel
        ?? fmtModel(baseAgent.requirement.fallbackChain[0]!)
      const prompt = promptForBuiltinCategory(c.name, cfg.workflow, finalModel)
      if (prompt) extras.prompt = prompt
      extras.model = finalModel
      const contract = delegationContractFor(c.name)
      if (contract) extras.promptSuffix = contract
      applyAgentEntry(agentMap, baseAgent, merged, extras)
    }

    if (cfg.agents) {
      for (const name of Object.keys(cfg.agents)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((b) => b.name === name)) continue
        if (BUILTIN_CATEGORIES.some((c) => c.name === name)) continue
        const norm = normalizeAgentShorthand(name, cfg.agents)
        if (!norm?.requirement?.fallbackChain?.length) continue
        const synthetic: Agent = {
          name,
          ...(norm.description ? { description: norm.description } : {}),
          requirement: norm.requirement,
        }
        applyAgentEntry(agentMap, synthetic, norm)
      }
    }

    registerCompatAgentAliases(agentMap, disabled)
    registerDefaultPermissions(target, agentMap)

    for (const [name, raw] of Object.entries(agentMap)) {
      if (isRecord(raw) && typeof raw.model === "string") {
        args.registeredAgentModels?.set(name, raw.model)
      }
    }

    log.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user), ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`,
    )
  }
}

function registerDefaultPermissions(target: Record<string, unknown>, agentMap: Record<string, unknown>): void {
  const topLevel = isRecord(target.permission) ? target.permission : {}
  target.permission = topLevel
  mergePermission(target, { webfetch: "allow", external_directory: "allow", task: "deny" }, false)

  for (const name of PRIMARY_COORDINATORS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "allow", question: "allow", "task_*": "allow" }, false)
  }

  for (const name of STANDARD_WORKFLOW_SUBAGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(UTILITY_LEAF_AGENTS) }, false)
  }

  for (const name of READ_ONLY_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: taskAllowlist(READ_ONLY_UTILITY_AGENTS) }, false)
  }

  for (const name of LOCAL_COORDINATORS) {
    const entry = agentMap[name]
    if (isRecord(entry)) {
      mergePermission(entry, {
        task: taskAllowlist([...UTILITY_LEAF_AGENTS, ...SPECIALIST_EXECUTION_AGENTS]),
      }, false)
    }
  }

  for (const name of UTILITY_LEAF_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "deny" }, false)
  }

  for (const name of QUESTION_ENABLED_WORKFLOW_AGENTS) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { question: "allow" }, false)
  }

  const docSearch = agentMap["doc-search"]
  if (isRecord(docSearch)) mergePermission(docSearch, { "grep_app_*": "allow" }, false)
}

function registerCompatAgentAliases(
  agentMap: Record<string, unknown>,
  disabled: Set<string>,
): void {
  for (const { alias, target } of COMPAT_AGENT_ALIASES) {
    if (disabled.has(alias) || disabled.has(target)) continue
    const source = agentMap[target]
    if (!isRecord(source)) continue

    const existing = isRecord(agentMap[alias]) ? (agentMap[alias] as Record<string, unknown>) : {}
    const aliasEntry = { ...source, ...existing }
    if (typeof aliasEntry.description !== "string") {
      aliasEntry.description = `Compatibility alias for @${target}.`
    }
    const contract = delegationContractFor(alias)
    if (contract) {
      const basePrompt = typeof aliasEntry.prompt === "string" ? aliasEntry.prompt : ""
      aliasEntry.prompt = appendPromptSuffix(basePrompt, contract)
    }
    agentMap[alias] = aliasEntry
  }
}

function registerSkillsAndCommands(
  target: Record<string, unknown>,
  cfg: OcmmConfig,
  skillsRoot: string = DEFAULT_SKILLS_ROOT,
): { skills: number; commands: number } {
  const disabledSkills = [...cfg.skills.disable, ...(cfg.disabledSkills ?? [])]
  const selected = loadSharedSkills({
    rootDir: skillsRoot,
    sources: cfg.skills.sources,
    enable: cfg.skills.enable,
    disable: disabledSkills,
  })

  const parentDirs = new Set<string>()
  for (const skill of selected) {
    parentDirs.add(dirname(skill.path))
  }
  if (cfg.workflow === "v1") {
    const v1SkillRoot = join(skillsRoot, "v1")
    if (existsSync(v1SkillRoot)) parentDirs.add(v1SkillRoot)
  }

  if (parentDirs.size > 0) {
    if (!isRecord(target.skills)) target.skills = {}
    const skillsConfig = target.skills as Record<string, unknown>
    if (!Array.isArray(skillsConfig.paths)) skillsConfig.paths = []
    const paths = skillsConfig.paths as unknown[]
    const seen = new Set(paths.filter((p): p is string => typeof p === "string"))

    for (const dir of parentDirs) {
      if (!seen.has(dir)) {
        paths.push(dir)
        seen.add(dir)
      }
    }
  }

  const skillCommands = selected
    .map((skill) => buildSkillCommand(skill, "ocmm"))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== null)

  const v1Commands =
    cfg.workflow === "v1"
      ? loadV1SkillCommands({ rootDir: skillsRoot, disable: disabledSkills })
      : []

  const commands = registerCommands(target, [
    ...loadBuiltinCommands(cfg.disabledCommands),
    ...skillCommands,
    ...v1Commands,
  ], new Set(cfg.disabledCommands ?? []))

  return { skills: selected.length, commands }
}

function registerCommands(
  target: Record<string, unknown>,
  definitions: readonly CommandDefinition[],
  disabled: ReadonlySet<string>,
): number {
  if (!definitions.length) return 0
  if (!isRecord(target.command)) target.command = {}
  const commandMap = target.command as Record<string, unknown>

  let registered = 0
  for (const definition of definitions) {
    if (disabled.has(definition.name)) continue
    if (commandMap[definition.name] !== undefined) continue
    const { name: _name, path: _path, ...entry } = definition as CommandDefinition & { path?: string }
    commandMap[definition.name] = entry
    registered++
  }
  return registered
}

function registerMcps(target: Record<string, unknown>, cfg: OcmmConfig, cwd?: string): number {
  const selected = resolveMcpServers(cfg.mcp, { disabledMcps: cfg.disabledMcps, ...(cwd ? { cwd } : {}) })
  if (!Object.keys(selected).length) return 0

  if (!isRecord(target.mcp)) target.mcp = {}
  const mcpConfig = target.mcp as Record<string, unknown>
  for (const [name, server] of Object.entries(selected)) {
    if (isRecord(mcpConfig[name]) && (mcpConfig[name] as Record<string, unknown>).enabled === false) {
      continue
    }
    mcpConfig[name] = server
  }
  return Object.keys(selected).length
}
