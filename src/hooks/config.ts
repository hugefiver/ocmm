/**
 * `config` hook handler.
 *
 * Mutates OpenCode's `config.agent` map to:
 *   1. Register 10 built-in agents (orchestrator, worker, ...) with their
 *      preferred provider/model.
 *   2. Register 8 categories as subagents (frontend, creative, hard-reasoning,
 *      research, quick, low-effort, high-effort, writing). Each category-agent
 *      gets the category's preferred model PLUS the category prompt-append as
 *      its system prompt, and `mode: "subagent"` so it only appears as a
 *      delegation target, not in the main agent picker.
 *
 * Users can override any agent via the `agents` config map (full requirement
 * or shorthand `model` string). User-set fields are NEVER clobbered.
 */

import { BUILTIN_AGENTS } from "../data/agents.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { getCategoryPrompt } from "../intent/prompt-loader.ts"
import type { Agent, Category, FallbackEntry } from "../shared/types.ts"
import type { AgentEntry, ModelRequirementConfig, OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

function fmtModel(entry: FallbackEntry): string {
  const provider = entry.providers[0] ?? ""
  return provider ? `${provider}/${entry.model}` : entry.model
}

function applyAgentEntry(
  agentMap: Record<string, unknown>,
  agent: Agent,
  override: AgentEntry | undefined,
  extras?: { mode?: string; prompt?: string },
): void {
  if (override?.disabled) return

  let chain: FallbackEntry[] = agent.requirement.fallbackChain
  const description = override?.description ?? agent.description

  if (override?.requirement) {
    chain = override.requirement.fallbackChain as FallbackEntry[]
  } else if (override?.model) {
    const m = override.model
    const slash = m.indexOf("/")
    const provider = slash >= 0 ? m.slice(0, slash) : ""
    const model = slash >= 0 ? m.slice(slash + 1) : m
    chain = [{ providers: provider ? [provider] : [], model }]
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

function categoryAsAgent(c: Category): Agent {
  return {
    name: c.name,
    description: c.description,
    requirement: c.requirement,
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

    // 1. Built-in named agents (primary mode by default).
    for (const a of BUILTIN_AGENTS) {
      if (disabled.has(a.name)) continue
      applyAgentEntry(agentMap, a, cfg.agents?.[a.name])
    }

    // 2. Categories as subagents. Each category-agent ships with its prompt-append.
    for (const c of BUILTIN_CATEGORIES) {
      if (disabled.has(c.name)) continue
      const userOverride = cfg.agents?.[c.name]
      const userCategoryReq: ModelRequirementConfig | undefined = cfg.categories?.[c.name]
      const synthetic: Agent = userCategoryReq
        ? { ...categoryAsAgent(c), requirement: userCategoryReq as Agent["requirement"] }
        : categoryAsAgent(c)

      const prompt = getCategoryPrompt(c.name)
      const extras: { mode?: string; prompt?: string } = { mode: "subagent" }
      if (prompt) extras.prompt = prompt
      applyAgentEntry(agentMap, synthetic, userOverride, extras)
    }

    // 3. Pure-config-only agents (not built-in, not a category) - register if user supplied requirement.
    if (cfg.agents) {
      for (const [name, entry] of Object.entries(cfg.agents)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((b) => b.name === name)) continue
        if (BUILTIN_CATEGORIES.some((c) => c.name === name)) continue
        if (!entry.requirement && !entry.model) continue
        const synthetic: Agent = {
          name,
          ...(entry.description ? { description: entry.description } : {}),
          requirement: entry.requirement
            ? (entry.requirement as Agent["requirement"])
            : { fallbackChain: [{ providers: [], model: entry.model ?? "" }] },
        }
        applyAgentEntry(agentMap, synthetic, entry)
      }
    }

    log.info(
      `config: registered ${Object.keys(agentMap).length} agents (built-in + categories + user)`,
    )
  }
}
