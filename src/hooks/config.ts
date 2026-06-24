import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { getAgentPrompt, getCategoryPrompt, getDeepworkPrompt, pickDeepworkVariantForAgent } from "../intent/prompt-loader.ts"
import { DEFAULT_SKILLS_ROOT, loadSharedSkills } from "../intent/skill-loader.ts"
import { resolveMcpServers } from "../mcp/index.ts"
import type { Agent, Category, FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { normalizeShorthand, type NormalizedShorthand } from "../config/normalize.ts"
import type { OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

const COMPAT_AGENT_ALIASES = [
  { alias: "oracle", target: "reviewer" },
  { alias: "explore", target: "code-search" },
] as const

function fmtModel(entry: FallbackEntry): string {
  const provider = entry.providers[0] ?? ""
  return provider ? `${provider}/${entry.model}` : entry.model
}

function applyAgentEntry(
  agentMap: Record<string, unknown>,
  agent: Agent,
  override: NormalizedShorthand | undefined,
  extras?: { mode?: string; prompt?: string },
): void {
  if (override?.disabled) return

  let chain: FallbackEntry[] = agent.requirement.fallbackChain
  const description = override?.description ?? agent.description

  if (override?.requirement?.fallbackChain?.length) {
    chain = override.requirement.fallbackChain
  }
  if (!chain.length) return
  const head = chain[0]!
  const modelStr = fmtModel(head)

  const existing = isRecord(agentMap[agent.name])
    ? (agentMap[agent.name] as Record<string, unknown>)
    : {}

  if (typeof existing.model !== "string") existing.model = modelStr
  if (description && typeof existing.description !== "string") {
    existing.description = description
  }
  if (extras?.mode && typeof existing.mode !== "string") existing.mode = extras.mode
  if (extras?.prompt && typeof existing.prompt !== "string") existing.prompt = extras.prompt

  agentMap[agent.name] = existing
}

function deepworkPromptForAgent(
  agent: Agent,
  override?: NormalizedShorthand,
): string {
  const chain =
    override?.requirement?.fallbackChain?.length
      ? override.requirement.fallbackChain
      : agent.requirement.fallbackChain
  const prefModel = chain[0]?.model ?? ""
  const variant = pickDeepworkVariantForAgent({
    agentName: agent.name,
    preferenceModel: prefModel,
  })
  return getDeepworkPrompt(variant)
}

function promptForBuiltinAgent(agent: Agent, override?: NormalizedShorthand): string {
  const rolePrompt = getAgentPrompt(agent.name).trim()
  const modelPrompt = deepworkPromptForAgent(agent, override).trim()
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
    const registeredSkills = registerSharedSkills(target, cfg, args.skillsRoot)
    const registeredMcps = registerMcps(target, cfg, args.cwd)

    if (!cfg.registerBuiltinAgents) {
      log.info(`config: registered ${registeredSkills} skills, ${registeredMcps} MCPs`)
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
      const norm = normalizeShorthand(cfg.agents?.[a.name])
      const prompt = promptForBuiltinAgent(a, norm)
      const mode = a.name === "orchestrator" || a.name === "builder"
        ? "primary"
        : a.name === "planner"
          ? "all"
          : "subagent"
      const extras: { prompt?: string; mode?: string } = {}
      if (prompt) extras.prompt = prompt
      extras.mode = mode
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
      const extras: { mode?: string; prompt?: string } = { mode: "subagent" }
      if (prompt) extras.prompt = prompt
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

    log.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user), ${registeredSkills} skills, ${registeredMcps} MCPs`,
    )
  }
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

function registerSharedSkills(
  target: Record<string, unknown>,
  cfg: OcmmConfig,
  skillsRoot: string = DEFAULT_SKILLS_ROOT,
): number {
  const selected = loadSharedSkills({
    rootDir: skillsRoot,
    sources: cfg.skills.sources,
    enable: cfg.skills.enable,
    disable: [...cfg.skills.disable, ...(cfg.disabledSkills ?? [])],
  })
  if (!selected.length) return 0

  if (!isRecord(target.skills)) target.skills = {}
  const skillsConfig = target.skills as Record<string, unknown>
  if (!Array.isArray(skillsConfig.paths)) skillsConfig.paths = []
  const paths = skillsConfig.paths as unknown[]
  const seen = new Set(paths.filter((p): p is string => typeof p === "string"))
  for (const skill of selected) {
    if (seen.has(skill.path)) continue
    paths.push(skill.path)
    seen.add(skill.path)
  }
  return selected.length
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
