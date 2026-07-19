import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import { BUILTIN_CATEGORY_INDEX } from "../data/categories.ts"
import { normalizeAgentShorthand, normalizeShorthand } from "../config/normalize.ts"
import { matchRequirementSuccessor } from "./model-upgrades.ts"
import { expandedReviewAgentMap } from "../review-agents/expand.ts"
import { parseReviewAgentName } from "../review-agents/names.ts"
import type { AgentEntry, CategoryEntry } from "../config/schema.ts"
import type { FallbackEntry, ModelRequirement, RequirementSource, Variant } from "../shared/types.ts"

export type EffectiveRequirementOverride = {
  requirement: ModelRequirement
  source: RequirementSource
}

export type ResolveOpts = {
  agentName?: string | undefined
  modelID: string
  providerID?: string | undefined
  inputVariant?: string | undefined
  effectiveRequirement?: EffectiveRequirementOverride | null
  agentsConfig?: Record<string, AgentEntry>
  categoriesConfig?: Record<string, CategoryEntry>
  disabledAgents?: readonly string[]
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

export function entryMatchesModel(
  entry: FallbackEntry,
  providerID: string | undefined,
  modelID: string,
): boolean {
  if (entryExactlyMatchesModel(entry, providerID, modelID)) return true
  if (providerID !== undefined && !entry.providers.includes(providerID)) return false
  if (!modelID.startsWith(entry.model)) return false
  const boundary = modelID[entry.model.length]
  return boundary === "-" || boundary === "_" || boundary === "."
}

export function entryExactlyMatchesModel(
  entry: FallbackEntry,
  providerID: string | undefined,
  modelID: string,
): boolean {
  return (providerID === undefined || entry.providers.includes(providerID)) && entry.model === modelID
}

function pickFromChain(
  req: ModelRequirement,
  providerID: string | undefined,
  modelID: string,
): { entry: FallbackEntry; effectiveVariant?: Variant } | null {
  for (const e of req.fallbackChain) {
    if (entryExactlyMatchesModel(e, providerID, modelID)) {
      const v = (e.variant ?? req.variant) as Variant | undefined
      const out: { entry: FallbackEntry; effectiveVariant?: Variant } = { entry: e }
      if (v) out.effectiveVariant = v
      return out
    }
  }
  const successor = matchRequirementSuccessor(req, providerID, modelID)
  if (successor) {
    const v = (successor.variant ?? req.variant) as Variant | undefined
    const out: { entry: FallbackEntry; effectiveVariant?: Variant } = { entry: successor }
    if (v) out.effectiveVariant = v
    return out
  }
  for (const e of req.fallbackChain) {
    if (entryMatchesModel(e, providerID, modelID)) {
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

function userAgentRequirementWithAlias(
  agentName: string,
  agentsConfig: Record<string, AgentEntry> | undefined,
): ModelRequirement | null {
  const norm = normalizeAgentShorthand(agentName, agentsConfig)
  if (!norm || norm.disabled) return null
  return norm.requirement ?? null
}

function defaultAliasRequirement(agentName: string, agentsConfig: Record<string, AgentEntry> | undefined): ModelRequirement | null {
  const builtin = BUILTIN_AGENT_INDEX.get(agentName)
  if (!builtin?.defaultAlias) return null
  // defaultAlias only applies when the user wrote an entry for this agent but
  // didn't specify a model (no requirement) and didn't set an explicit alias.
  // If there is no user entry at all, the builtin requirement stands.
  const userEntry = agentsConfig?.[agentName]
  if (userEntry === undefined) return null
  const userNorm = normalizeShorthand(userEntry)
  if (userNorm?.requirement) return null // user has direct model config
  if (userEntry.alias) return null // user has explicit alias
  return userAgentRequirementWithAlias(builtin.defaultAlias, agentsConfig)
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
  providerID: string | undefined,
  modelID: string,
  inputVariant: string | undefined,
  source: Resolution["source"],
): Resolution | null {
  const matched = pickFromChain(req, providerID, modelID)
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

export function resolveEffectiveRequirement(opts: {
  agentName: string
  agentsConfig?: Record<string, AgentEntry>
  categoriesConfig?: Record<string, CategoryEntry>
  disabledAgents?: readonly string[]
}): { requirement: ModelRequirement; source: Resolution["source"] } | null {
  const { agentName, agentsConfig, categoriesConfig, disabledAgents } = opts

  // Review agent names (oracle, oracle-2nd, oracle-2nd-low, reviewer-low,
  // runtime alias oracle-second, etc.) resolve exclusively from the expanded
  // profile map. Disabled profiles are filtered at expansion time, so a
  // disabled canonical name returns null here. Do not fall through to ordinary
  // built-in/category resolution for review names - those paths no longer
  // understand the canonical tier grammar.
  const reviewIdentity = parseReviewAgentName(agentName)
  if (reviewIdentity) {
    const profile = expandedReviewAgentMap({ agents: agentsConfig, disabledAgents }).get(reviewIdentity.canonicalName)
    if (!profile) return null
    return { requirement: profile.requirement, source: profile.resolutionSource }
  }

  const canonicalName = canonicalAgentName(agentName)
  const canonicalUserReq = canonicalName !== agentName
    ? userAgentRequirementWithAlias(canonicalName, agentsConfig)
    : null
  const userReq = userAgentRequirementWithAlias(agentName, agentsConfig) ?? canonicalUserReq
  if (userReq) return { requirement: userReq, source: "user-config" }

  const aliasReq = defaultAliasRequirement(agentName, agentsConfig)
  if (aliasReq) return { requirement: aliasReq, source: "user-config" }

  const builtin = BUILTIN_AGENT_INDEX.get(canonicalName)
  if (builtin) return { requirement: builtin.requirement, source: "agent-default" }

  const userCat = userCategoryRequirement(categoriesConfig?.[agentName])
  if (userCat) return { requirement: userCat, source: "user-config" }

  const builtinCat = BUILTIN_CATEGORY_INDEX.get(agentName)
  if (builtinCat) return { requirement: builtinCat.requirement, source: "category-default" }

  return null
}

export function resolveModelRouting(opts: ResolveOpts): Resolution | null {
  const { agentName, modelID, providerID, inputVariant } = opts

  const effective = opts.effectiveRequirement === undefined
    ? (opts.agentName ? resolveEffectiveRequirement({
        agentName: opts.agentName,
        agentsConfig: opts.agentsConfig,
        categoriesConfig: opts.categoriesConfig,
        disabledAgents: opts.disabledAgents,
      }) : null)
    : opts.effectiveRequirement
  if (effective) {
    const r = resolveAgainstRequirement(
      effective.requirement,
      providerID,
      modelID,
      inputVariant,
      effective.source,
    )
    if (r) return applyCategoryVariantPolicy(r, agentName, inputVariant)
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
