/**
 * Resolve the FallbackEntry that best fits the active (agent, model).
 *
 * Phase 1 logic — the model is already locked by OpenCode before chat.params:
 *
 *   1. If the user config has an `agents.<name>` requirement, search its
 *      fallback chain for the entry whose `model` matches `input.model.modelID`
 *      (exact then prefix). If found -> return that entry.
 *   2. Else if the user config has the agent but no exact match in its chain,
 *      return the FIRST entry from the chain (it's our preferred shape).
 *   3. Else fall back to the built-in agent table (same logic).
 *   4. Else return null and let chat.params do nothing.
 *
 * The picked entry's `variant` (or its parent ModelRequirement.variant) is
 * what we feed the variant translator with.
 */

import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import type { AgentEntry, ModelRequirementConfig } from "../config/schema.ts"
import type { FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"

export type ResolveOpts = {
  agentName?: string | undefined
  modelID: string
  providerID?: string | undefined
  /** Optional explicit variant from `input.message.variant`; wins over everything when known. */
  inputVariant?: string | undefined
  /** User config view (already merged). */
  agentsConfig?: Record<string, AgentEntry>
  categoriesConfig?: Record<string, ModelRequirementConfig>
}

export type Resolution = {
  entry: FallbackEntry
  /** Effective variant: chosen variant from input/entry/parent (or undefined). */
  variant?: Variant
  source: "user-config" | "agent-default" | "input-variant"
}

function entryMatches(entry: FallbackEntry, modelID: string): boolean {
  if (entry.model === modelID) return true
  // permissive prefix match on the unqualified model name
  if (modelID.startsWith(entry.model)) return true
  if (entry.model.startsWith(modelID)) return true
  return false
}

function pickFromChain(
  req: ModelRequirement | ModelRequirementConfig,
  modelID: string,
): { entry: FallbackEntry; effectiveVariant?: Variant } | null {
  for (const e of req.fallbackChain) {
    if (entryMatches(e as FallbackEntry, modelID)) {
      const v = (e.variant ?? req.variant) as Variant | undefined
      const out: { entry: FallbackEntry; effectiveVariant?: Variant } = {
        entry: e as FallbackEntry,
      }
      if (v) out.effectiveVariant = v
      return out
    }
  }
  return null
}

function isValidVariant(v: string): v is Variant {
  return [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "minimal",
    "none",
    "auto",
    "thinking",
  ].includes(v)
}

/** Return the user's AgentEntry as a ModelRequirement, if usable. */
function userAgentRequirement(
  entry: AgentEntry | undefined,
): ModelRequirement | null {
  if (!entry) return null
  if (entry.disabled) return null
  if (entry.requirement) return entry.requirement as ModelRequirement
  // shorthand: { model: "provider/foo" } -> single-entry chain
  if (entry.model) {
    const providerID = entry.model.includes("/") ? entry.model.split("/", 1)[0] ?? "" : ""
    const modelID = entry.model.includes("/") ? entry.model.slice(entry.model.indexOf("/") + 1) : entry.model
    return {
      fallbackChain: [{ providers: providerID ? [providerID] : [], model: modelID }],
    }
  }
  return null
}

export function resolveModelRouting(opts: ResolveOpts): Resolution | null {
  const { agentName, modelID, inputVariant, agentsConfig } = opts

  // 1. user agent override
  if (agentName) {
    const userReq = userAgentRequirement(agentsConfig?.[agentName])
    if (userReq) {
      const matched = pickFromChain(userReq, modelID)
      if (matched) {
        let variant: Variant | undefined = matched.effectiveVariant
        if (inputVariant && isValidVariant(inputVariant)) variant = inputVariant
        const out: Resolution = { entry: matched.entry, source: "user-config" }
        if (variant) out.variant = variant
        return out
      }
      // fall through: prefer parent variant from user config even when chain has no model match
      const fallback = userReq.fallbackChain[0]
      if (fallback) {
        let variant: Variant | undefined = (fallback.variant ?? userReq.variant) as Variant | undefined
        if (inputVariant && isValidVariant(inputVariant)) variant = inputVariant
        const out: Resolution = { entry: fallback as FallbackEntry, source: "user-config" }
        if (variant) out.variant = variant
        return out
      }
    }
  }

  // 2. built-in agent table
  if (agentName) {
    const builtin = BUILTIN_AGENT_INDEX.get(agentName)
    if (builtin) {
      const matched = pickFromChain(builtin.requirement, modelID)
      if (matched) {
        let variant: Variant | undefined = matched.effectiveVariant
        if (inputVariant && isValidVariant(inputVariant)) variant = inputVariant
        const out: Resolution = { entry: matched.entry, source: "agent-default" }
        if (variant) out.variant = variant
        return out
      }
      const fallback = builtin.requirement.fallbackChain[0]
      if (fallback) {
        let variant: Variant | undefined = fallback.variant ?? builtin.requirement.variant
        if (inputVariant && isValidVariant(inputVariant)) variant = inputVariant
        const out: Resolution = { entry: fallback, source: "agent-default" }
        if (variant) out.variant = variant
        return out
      }
    }
  }

  // 3. variant-only resolution: user supplied variant on a model we don't otherwise know
  if (inputVariant && isValidVariant(inputVariant)) {
    return {
      entry: { providers: opts.providerID ? [opts.providerID] : [], model: modelID, variant: inputVariant },
      variant: inputVariant,
      source: "input-variant",
    }
  }

  return null
}
