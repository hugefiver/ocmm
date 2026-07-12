import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { loadBuiltinCommands, type CommandDefinition } from "../commands/builtin.ts"
import { getAgentPrompt, getCategoryPrompt, getDeepworkPrompt, isGpt56Model, pickDeepworkVariantForAgent } from "../intent/prompt-loader.ts"
import { buildSkillCommand, DEFAULT_SKILLS_ROOT, loadSharedSkills, loadV1SkillCommands } from "../intent/skill-loader.ts"
import { resolveMcpServers } from "../mcp/index.ts"
import type { Agent, Category, FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { normalizeShorthand, type NormalizedShorthand } from "../config/normalize.ts"
import type { OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

const COMPAT_AGENT_ALIASES = [
  { alias: "explore", target: "code-search" },
] as const

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
  /** Catalog-confirmed runtime upgrade; never overrides an explicit user model. */
  model?: string
}

const GPT_LANE_BY_AGENT = new Map<string, "sol" | "terra">([
  ["orchestrator", "sol"],
  ["builder", "sol"],
  ["reviewer", "sol"],
  ["planner", "sol"],
  ["clarifier", "sol"],
  ["plan-critic", "sol"],
  ["oracle", "terra"],
  ["hard-reasoning", "sol"],
  ["deep", "sol"],
  ["complex", "terra"],
  ["normal-task", "terra"],
])

type CatalogCandidate = {
  provider: string
  model: string
  version: [number, number, number]
}

function gptLaneCandidate(provider: string, model: string, lane: "sol" | "terra"): CatalogCandidate | null {
  const match = model.toLowerCase().match(/^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?-(sol|terra)(?:$|[-_.])/)
  if (!match || match[4] !== lane) return null
  return {
    provider,
    model,
    version: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
  }
}

function compareCatalogCandidates(a: CatalogCandidate, b: CatalogCandidate): number {
  for (let i = 0; i < a.version.length; i += 1) {
    const delta = b.version[i]! - a.version[i]!
    if (delta !== 0) return delta
  }
  return a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
}

/**
 * Upgrade only from an explicit OpenCode provider model catalog. With no catalog
 * (or no matching Sol/Terra model), preserve the built-in fallback head exactly.
 */
function catalogModelForAgent(target: Record<string, unknown>, agentName: string): string | undefined {
  const lane = GPT_LANE_BY_AGENT.get(agentName)
  const providers = isRecord(target.provider) ? target.provider : undefined
  if (!lane || !providers) return undefined

  const candidates: CatalogCandidate[] = []
  for (const [provider, rawProvider] of Object.entries(providers)) {
    if (provider !== "openai" && provider !== "github-copilot") continue
    if (!isRecord(rawProvider) || !isRecord(rawProvider.models)) continue
    for (const model of Object.keys(rawProvider.models)) {
      const candidate = gptLaneCandidate(provider, model, lane)
      if (candidate) candidates.push(candidate)
    }
  }
  candidates.sort(compareCatalogCandidates)
  const best = candidates[0]
  return best ? `${best.provider}/${best.model}` : undefined
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

function mergePermission(entry: Record<string, unknown>, permission: Record<string, string>, overwrite: boolean): void {
  const existing = isRecord(entry.permission) ? entry.permission : {}
  const merged = { ...existing }
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
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, _output) => {
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
      let norm = normalizeShorthand(cfg.agents?.[a.name], {
        resolveAlias: (target: string) => normalizeShorthand(cfg.agents?.[target]),
        selfName: a.name,
      })
      // Inject builtin defaultAlias when the user wrote an entry for this agent
      // but didn't specify a model (no requirement) and didn't set an explicit
      // alias. If there is no user entry at all, the builtin requirement stands.
      const userEntryForAgent = cfg.agents?.[a.name]
      if (userEntryForAgent !== undefined && !norm?.requirement?.fallbackChain?.length && a.defaultAlias && !userEntryForAgent.alias) {
        const aliasNorm = normalizeShorthand(cfg.agents?.[a.defaultAlias], {
          resolveAlias: (t: string) => normalizeShorthand(cfg.agents?.[t]),
          selfName: a.defaultAlias,
        })
        if (aliasNorm?.requirement?.fallbackChain?.length) {
          norm = { ...norm, requirement: aliasNorm.requirement }
        }
      }
      const catalogModel = !norm?.requirement?.fallbackChain?.length
        ? catalogModelForAgent(target, a.name)
        : undefined
      const prompt = promptForBuiltinAgent(a, norm, cfg.workflow, catalogModel)
      const mode = a.name === "orchestrator" || a.name === "builder"
        ? "primary"
        : a.name === "planner"
          ? "all"
          : "subagent"
      const extras: AgentExtras = {}
      if (prompt) extras.prompt = prompt
      extras.mode = mode
      extras.model = catalogModel
      if (mode === "primary" || mode === "all") {
        extras.promptPrefix = buildLocaleGuidance(cfg.locale)
      }
      applyAgentEntry(agentMap, a, norm, extras)
    }

    for (const c of BUILTIN_CATEGORIES) {
      if (disabled.has(c.name)) continue
      const agentOverride = normalizeShorthand(cfg.agents?.[c.name])
      const categoryOverride = normalizeShorthand(cfg.categories?.[c.name])

      const baseAgent = categoryAsAgent(c, categoryOverride?.requirement)
      const merged: NormalizedShorthand | undefined =
        agentOverride ?? categoryOverride

      const prompt = getCategoryPrompt(c.name)
      const extras: AgentExtras = { mode: "subagent" }
      if (prompt) extras.prompt = prompt
      if (!merged?.requirement?.fallbackChain?.length) {
        extras.model = catalogModelForAgent(target, c.name)
      }
      applyAgentEntry(agentMap, baseAgent, merged, extras)
    }

    if (cfg.agents) {
      for (const [name, entry] of Object.entries(cfg.agents)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((b) => b.name === name)) continue
        if (BUILTIN_CATEGORIES.some((c) => c.name === name)) continue
        const norm = normalizeShorthand(entry)
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

    log.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user), ${registered.skills} skills, ${registered.commands} commands, ${registeredMcps} MCPs`,
    )
  }
}

function registerDefaultPermissions(target: Record<string, unknown>, agentMap: Record<string, unknown>): void {
  const topLevel = isRecord(target.permission) ? target.permission : {}
  target.permission = topLevel
  mergePermission(target, { webfetch: "allow", external_directory: "allow", task: "deny" }, false)

  for (const name of ["orchestrator", "builder", "planner", "deep", "complex", "coding", "normal-task"]) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "allow", question: "allow", "task_*": "allow" }, false)
  }

  for (const name of ["reviewer", "oracle", "doc-search", "code-search", "explore", "media-reader", "clarifier", "plan-critic"]) {
    const entry = agentMap[name]
    if (isRecord(entry)) mergePermission(entry, { task: "deny" }, false)
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
