import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { getCategoryPrompt, getDeepworkPrompt, pickDeepworkVariantForAgent } from "../intent/prompt-loader.ts"
import type { Agent, Category, FallbackEntry, ModelRequirement } from "../shared/types.ts"
import { normalizeShorthand, type NormalizedShorthand } from "../config/normalize.ts"
import type { OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

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

function categoryAsAgent(c: Category, override?: ModelRequirement): Agent {
  return {
    name: c.name,
    description: c.description,
    requirement: override ?? c.requirement,
  }
}

export function createConfigHandler(args: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, _output) => {
    const cfg = args.getConfig()
    if (!cfg.registerBuiltinAgents) return
    if (!isRecord(rawInput)) return

    const target = isRecord(rawInput.config) ? rawInput.config : rawInput
    if (!isRecord(target.agent)) target.agent = {}
    const agentMap = target.agent as Record<string, unknown>

    const disabled = new Set(cfg.disabledAgents ?? [])

    for (const a of BUILTIN_AGENTS) {
      if (disabled.has(a.name)) continue
      const norm = normalizeShorthand(cfg.agents?.[a.name])
      const prompt = deepworkPromptForAgent(a, norm)
      const extras: { prompt?: string } = {}
      if (prompt) extras.prompt = prompt
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

    log.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user)`,
    )
  }
}
