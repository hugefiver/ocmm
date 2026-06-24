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

const AGENT_ALIASES = new Map([
  ["oracle", "reviewer"],
  ["explore", "code-search"],
])

const MAX_REASONING_CATEGORIES = new Set([
  "frontend",
  "creative",
  "hard-reasoning",
  "research",
  "coding",
  "normal-task",
  "complex",
  "deep",
  "documenting",
])

function canonicalAgentName(name: string): string {
  return AGENT_ALIASES.get(name) ?? name
}

function entryMatches(entry: FallbackEntry, modelID: string): boolean {
  if (entry.model === modelID) return true
  // Forward prefix match: a chain entry "gpt-5.5" matches an input
  // "gpt-5.5-20250101" (versioned alias). We intentionally do NOT match the
  // reverse ("gpt-5" matching "gpt-5.5") because that would let a shorter
  // chain entry swallow newer model IDs it was never meant to cover.
  if (modelID.startsWith(entry.model)) return true
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

function applyCategoryVariantPolicy(
  resolution: Resolution,
  agentName: string | undefined,
  inputVariant: string | undefined,
): Resolution {
  if (!agentName || !MAX_REASONING_CATEGORIES.has(agentName)) return resolution
  if (resolution.source === "user-config" || resolution.source === "input-variant" || inputVariant) {
    return resolution
  }
  return { ...resolution, variant: "max" }
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
  const canonicalName = agentName ? canonicalAgentName(agentName) : undefined

  if (agentName) {
    const canonicalUserReq = canonicalName && canonicalName !== agentName
      ? userAgentRequirement(agentsConfig?.[canonicalName])
      : null
    const userReq =
      userAgentRequirement(agentsConfig?.[agentName]) ??
      canonicalUserReq
    if (userReq) {
      const r = resolveAgainstRequirement(userReq, modelID, inputVariant, "user-config")
      if (r) return applyCategoryVariantPolicy(r, agentName, inputVariant)
    }
  }

  if (canonicalName) {
    const builtin = BUILTIN_AGENT_INDEX.get(canonicalName)
    if (builtin) {
      const r = resolveAgainstRequirement(
        builtin.requirement,
        modelID,
        inputVariant,
        "agent-default",
      )
      if (r) return applyCategoryVariantPolicy(r, agentName, inputVariant)
    }
  }

  if (agentName) {
    const userCat = userCategoryRequirement(categoriesConfig?.[agentName])
    const builtinCat = BUILTIN_CATEGORY_INDEX.get(agentName)
    const req = userCat ?? builtinCat?.requirement ?? null
    if (req) {
      const r = resolveAgainstRequirement(
        req,
        modelID,
        inputVariant,
        userCat ? "user-config" : "category-default",
      )
      if (r) return applyCategoryVariantPolicy(r, agentName, inputVariant)
    }
  }

  if (inputVariant && isValidVariant(inputVariant)) {
    return applyCategoryVariantPolicy({
      entry: {
        providers: opts.providerID ? [opts.providerID] : [],
        model: modelID,
        variant: inputVariant,
      },
      variant: inputVariant,
      source: "input-variant",
    }, agentName, inputVariant)
  }

  return null
}
