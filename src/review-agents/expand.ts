import { normalizeAgentShorthand, parseModelString, type PermissionValue } from "../config/normalize.ts"
import type { AgentEntry, ReviewVariantOverride } from "../config/schema.ts"
import { BUILTIN_AGENT_INDEX } from "../data/agents.ts"
import type { FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"
import {
  ORACLE_SLOT_NAMES,
  canonicalizeReviewAgentName,
  parseReviewAgentName,
  type OracleSlotName,
  type ReviewAgentIdentity,
  type ReviewLogicalTier,
} from "./names.ts"

export type ReviewAgentRegistrationOverrides = {
  description?: string
  permission?: Record<string, PermissionValue>
  tools?: Record<string, boolean>
  skills?: string[]
  promptAppend?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  thinking?: { type: "enabled" | "disabled"; budgetTokens?: number }
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
}

export type ExpandedReviewAgent = {
  name: string
  identity: ReviewAgentIdentity
  sourceSlot: OracleSlotName | "reviewer"
  promptSource: "reviewer"
  requirement: ModelRequirement
  registration: ReviewAgentRegistrationOverrides
  resolutionSource: "user-config" | "agent-default"
  suppressCatalogUpgrade: boolean
}

export type ReviewAgentExpansionInput = {
  agents?: Record<string, AgentEntry>
  disabledAgents?: readonly string[]
}

function cloneEntry(entry: FallbackEntry): FallbackEntry {
  return {
    ...entry,
    providers: [...entry.providers],
    ...(entry.thinking ? { thinking: { ...entry.thinking } } : {}),
  }
}

function cloneRequirement(requirement: ModelRequirement): ModelRequirement {
  return {
    ...requirement,
    fallbackChain: requirement.fallbackChain.map(cloneEntry),
    ...(requirement.requiresProvider ? { requiresProvider: [...requirement.requiresProvider] } : {}),
  }
}

function withNativeVariant(requirement: ModelRequirement, variant: Variant): ModelRequirement {
  const cloned = cloneRequirement(requirement)
  return {
    ...cloned,
    variant,
    fallbackChain: cloned.fallbackChain.map((entry) => ({ ...entry, variant })),
  }
}

function replacePrimaryModel(requirement: ModelRequirement, model: string): ModelRequirement {
  const cloned = cloneRequirement(requirement)
  const parsed = parseModelString(model)
  const primary = cloned.fallbackChain[0]
  if (!primary) throw new Error("review profile has no primary fallback entry")
  cloned.fallbackChain[0] = { ...primary, providers: [...parsed.providers], model: parsed.model }
  if (cloned.requiresModel !== undefined) cloned.requiresModel = parsed.model
  if (cloned.requiresProvider !== undefined) {
    if (parsed.providers.length === 0) delete cloned.requiresProvider
    else cloned.requiresProvider = [...new Set(cloned.fallbackChain.flatMap((entry) => entry.providers))]
  }
  return cloned
}

function applyTierOverride(requirement: ModelRequirement, override: ReviewVariantOverride): ModelRequirement {
  if (typeof override === "string") return withNativeVariant(requirement, override)
  const withModel = "model" in override && override.model
    ? replacePrimaryModel(requirement, override.model)
    : cloneRequirement(requirement)
  return override.variant ? withNativeVariant(withModel, override.variant) : withModel
}

const REGISTRATION_KEYS = [
  "description", "tools", "permission", "skills", "promptAppend",
  "temperature", "topP", "maxTokens", "thinking", "reasoningEffort",
] as const

function registrationFrom(entry: AgentEntry | undefined, fallbackDescription?: string): ReviewAgentRegistrationOverrides {
  const registration: ReviewAgentRegistrationOverrides = {}
  if (fallbackDescription) registration.description = fallbackDescription
  if (!entry) return registration
  for (const key of REGISTRATION_KEYS) {
    const value = entry[key]
    if (value === undefined) continue
    if (Array.isArray(value)) (registration as Record<string, unknown>)[key] = [...value]
    else if (typeof value === "object" && value !== null) (registration as Record<string, unknown>)[key] = structuredClone(value)
    else (registration as Record<string, unknown>)[key] = value
  }
  return registration
}

function hasExplicitModelSelection(entry: AgentEntry | undefined): boolean {
  return !!entry && ["model", "fallbackModels", "requirement", "alias"].some((key) => entry[key as keyof AgentEntry] !== undefined)
}

function disabledNames(input: ReviewAgentExpansionInput): Set<string> {
  return new Set((input.disabledAgents ?? []).map((name) => canonicalizeReviewAgentName(name) ?? name))
}

export function isExpandedReviewAgentDisabled(name: string, input: ReviewAgentExpansionInput): boolean {
  const identity = parseReviewAgentName(name)
  if (!identity) return false
  const disabled = disabledNames(input)
  if (disabled.has(identity.canonicalName) || disabled.has(identity.canonicalSlot)) return true
  const normalEntry = input.agents?.[identity.canonicalSlot]
  return normalEntry?.disabled === true
}

function normalRequirement(
  slot: OracleSlotName | "reviewer",
  input: ReviewAgentExpansionInput,
): { requirement: ModelRequirement; source: "user-config" | "agent-default"; suppressCatalogUpgrade: boolean } | null {
  const configured = input.agents?.[slot]
  const builtin = BUILTIN_AGENT_INDEX.get(slot)
  if (!configured && !builtin) return null
  const normalized = normalizeAgentShorthand(slot, input.agents)
  if (configured?.disabled || normalized?.disabled) return null
  if (normalized?.requirement) {
    return { requirement: cloneRequirement(normalized.requirement), source: "user-config", suppressCatalogUpgrade: hasExplicitModelSelection(configured) }
  }
  if (configured && builtin?.defaultAlias && !configured.alias) {
    const alias = normalizeAgentShorthand(builtin.defaultAlias, input.agents)
    if (alias?.requirement) return { requirement: cloneRequirement(alias.requirement), source: "user-config", suppressCatalogUpgrade: true }
  }
  if (builtin) return { requirement: cloneRequirement(builtin.requirement), source: "agent-default", suppressCatalogUpgrade: false }
  throw new Error(`review slot ${slot} must resolve a normal model requirement before registration`)
}

function pushProfile(
  output: ExpandedReviewAgent[],
  slot: OracleSlotName | "reviewer",
  tier: ReviewLogicalTier,
  requirement: ModelRequirement,
  registration: ReviewAgentRegistrationOverrides,
  resolutionSource: "user-config" | "agent-default",
  suppressCatalogUpgrade: boolean,
  input: ReviewAgentExpansionInput,
): void {
  const name = tier === "normal" ? slot : `${slot}-${tier}`
  const identity = parseReviewAgentName(name)
  if (!identity || isExpandedReviewAgentDisabled(name, input)) return
  output.push({
    name: identity.canonicalName,
    identity,
    sourceSlot: slot,
    promptSource: "reviewer",
    requirement: cloneRequirement(requirement),
    registration: structuredClone(registration),
    resolutionSource,
    suppressCatalogUpgrade,
  })
}

export function expandReviewAgents(input: ReviewAgentExpansionInput = {}): ExpandedReviewAgent[] {
  const output: ExpandedReviewAgent[] = []
  const normalSlots: Array<OracleSlotName | "reviewer"> = [...ORACLE_SLOT_NAMES, "reviewer"]
  for (const slot of normalSlots) {
    const resolved = normalRequirement(slot, input)
    if (!resolved) continue
    const configured = input.agents?.[slot]
    const builtin = BUILTIN_AGENT_INDEX.get(slot)
    const registration = registrationFrom(configured, configured?.description ?? builtin?.description)
    pushProfile(output, slot, "normal", resolved.requirement, registration, resolved.source, resolved.suppressCatalogUpgrade, input)
    for (const tier of ["low", "high", "max"] as const) {
      const override = configured?.variants?.[tier]
      if (override === undefined) continue
      pushProfile(
        output,
        slot,
        tier,
        applyTierOverride(resolved.requirement, override),
        registration,
        "user-config",
        resolved.suppressCatalogUpgrade || (typeof override === "object" && "model" in override),
        input,
      )
    }
  }
  output.sort((left, right) => {
    if (left.identity.role !== right.identity.role) return left.identity.role === "oracle" ? -1 : 1
    if (left.identity.ordinal !== right.identity.ordinal) return left.identity.ordinal - right.identity.ordinal
    const rank = { normal: 0, low: 1, high: 2, max: 3 } as const
    return rank[left.identity.logicalTier] - rank[right.identity.logicalTier]
  })
  return output
}

export function expandedReviewAgentMap(input: ReviewAgentExpansionInput = {}): ReadonlyMap<string, ExpandedReviewAgent> {
  return new Map(expandReviewAgents(input).map((profile) => [profile.name, profile]))
}
