import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import { BUILTIN_CATEGORY_INDEX } from "../data/categories.ts"
import { normalizeShorthand } from "../config/normalize.ts"
import type { AgentEntry, CategoryEntry } from "../config/schema.ts"
import type { FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"

export type ResolveOpts = {
  agentName?: string | undefined
  modelID: string
  providerID?: string | undefined
  inputVariant?: string | undefined
  agentsConfig?: Record<string, AgentEntry>
  categoriesConfig?: Record<string, CategoryEntry>
}

export type Resolution = {
  entry: FallbackEntry
  variant?: Variant
  source: "user-config" | "agent-default" | "category-default" | "input-variant"
}

const VARIANT_SET = new Set<Variant>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "minimal",
  "none",
  "auto",
  "thinking",
])

function entryMatches(entry: FallbackEntry, modelID: string): boolean {
  if (entry.model === modelID) return true
  if (modelID.startsWith(entry.model)) return true
  if (entry.model.startsWith(modelID)) return true
  return false
}

function pickFromChain(
  req: ModelRequirement,
  modelID: string,
): { entry: FallbackEntry; effectiveVariant?: Variant } | null {
  for (const e of req.fallbackChain) {
    if (entryMatches(e, modelID)) {
      const v = (e.variant ?? req.variant) as Variant | undefined
      const out: { entry: FallbackEntry; effectiveVariant?: Variant } = { entry: e }
      if (v) out.effectiveVariant = v
      return out
    }
  }
  return null
}

function isValidVariant(v: string): v is Variant {
  return VARIANT_SET.has(v as Variant)
}

function userAgentRequirement(entry: AgentEntry | undefined): ModelRequirement | null {
  const norm = normalizeShorthand(entry)
  if (!norm || norm.disabled) return null
  return norm.requirement ?? null
}

function userCategoryRequirement(
  entry: CategoryEntry | undefined,
): ModelRequirement | null {
  const norm = normalizeShorthand(entry)
  return norm?.requirement ?? null
}

function buildResolution(
  entry: FallbackEntry,
  effectiveVariant: Variant | undefined,
  inputVariant: string | undefined,
  source: Resolution["source"],
): Resolution {
  let variant: Variant | undefined = effectiveVariant
  if (inputVariant && isValidVariant(inputVariant)) variant = inputVariant
  const out: Resolution = { entry, source }
  if (variant) out.variant = variant
  return out
}

function resolveAgainstRequirement(
  req: ModelRequirement,
  modelID: string,
  inputVariant: string | undefined,
  source: Resolution["source"],
): Resolution | null {
  const matched = pickFromChain(req, modelID)
  if (matched) {
    return buildResolution(matched.entry, matched.effectiveVariant, inputVariant, source)
  }
  const fallback = req.fallbackChain[0]
  if (fallback) {
    const v = (fallback.variant ?? req.variant) as Variant | undefined
    return buildResolution(fallback, v, inputVariant, source)
  }
  return null
}

export function resolveModelRouting(opts: ResolveOpts): Resolution | null {
  const { agentName, modelID, inputVariant, agentsConfig, categoriesConfig } = opts

  if (agentName) {
    const userReq = userAgentRequirement(agentsConfig?.[agentName])
    if (userReq) {
      const r = resolveAgainstRequirement(userReq, modelID, inputVariant, "user-config")
      if (r) return r
    }
  }

  if (agentName) {
    const builtin = BUILTIN_AGENT_INDEX.get(agentName)
    if (builtin) {
      const r = resolveAgainstRequirement(
        builtin.requirement,
        modelID,
        inputVariant,
        "agent-default",
      )
      if (r) return r
    }
  }

  if (agentName) {
    const userCat = userCategoryRequirement(categoriesConfig?.[agentName])
    const builtinCat = BUILTIN_CATEGORY_INDEX.get(agentName)
    const req = userCat ?? builtinCat?.requirement ?? null
    if (req) {
      const r = resolveAgainstRequirement(req, modelID, inputVariant, "category-default")
      if (r) return r
    }
  }

  if (inputVariant && isValidVariant(inputVariant)) {
    return {
      entry: {
        providers: opts.providerID ? [opts.providerID] : [],
        model: modelID,
        variant: inputVariant,
      },
      variant: inputVariant,
      source: "input-variant",
    }
  }

  return null
}
