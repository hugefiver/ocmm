/**
 * `config` hook handler.
 *
 * This is THE place that actually routes models in OpenCode. We mutate the
 * config object's `agent` map to register every built-in (or user-overridden)
 * agent with a preferred provider/model. OpenCode reads `config.agent.<name>`
 * when starting a session, so the per-agent preference is what users actually
 * see.
 *
 * For each agent:
 *   - description from data/agents.ts (or user override)
 *   - model = "providerID/modelID" of the FIRST entry in the fallback chain
 *     whose provider is currently "available" (when we can detect availability).
 *     If we can't detect, we just use the first entry — that matches omo's
 *     "preferred shape" rule and lets users override globally.
 */

import { BUILTIN_AGENTS } from "../data/agents.ts"
import type { Agent, FallbackEntry } from "../shared/types.ts"
import type { AgentEntry, OcmmConfig } from "../config/schema.ts"
import { isRecord, log } from "../shared/logger.ts"

function fmtModel(entry: FallbackEntry): string {
  const provider = entry.providers[0] ?? ""
  return provider ? `${provider}/${entry.model}` : entry.model
}

function applyAgentEntry(
  agentMap: Record<string, unknown>,
  agent: Agent,
  override: AgentEntry | undefined,
): void {
  if (override?.disabled) return

  // Build effective requirement (override.requirement > override.model shorthand > builtin)
  let chain: FallbackEntry[] = agent.requirement.fallbackChain
  let description = override?.description ?? agent.description

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

  // Don't clobber a user-set model.
  if (typeof existing.model !== "string") {
    existing.model = modelStr
  }
  if (description && typeof existing.description !== "string") {
    existing.description = description
  }
  agentMap[agent.name] = existing
}

export function createConfigHandler(args: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, _output) => {
    const cfg = args.getConfig()
    if (!cfg.registerBuiltinAgents) return
    if (!isRecord(rawInput)) return

    // OpenCode passes a "config" object; tolerate either input.config or input itself.
    const target = isRecord(rawInput.config) ? rawInput.config : rawInput
    if (!isRecord(target.agent)) {
      target.agent = {}
    }
    const agentMap = target.agent as Record<string, unknown>

    const disabled = new Set(cfg.disabledAgents ?? [])

    // Built-in agents
    for (const a of BUILTIN_AGENTS) {
      if (disabled.has(a.name)) continue
      applyAgentEntry(agentMap, a, cfg.agents?.[a.name])
    }

    // Pure-config-only agents (not in our built-in list) — register if user supplied requirement.
    if (cfg.agents) {
      for (const [name, entry] of Object.entries(cfg.agents)) {
        if (disabled.has(name)) continue
        if (BUILTIN_AGENTS.some((b) => b.name === name)) continue // already handled
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
      `config: registered ${Object.keys(agentMap).length} agents (built-in + user)`,
    )
  }
}
