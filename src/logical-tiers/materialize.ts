import { normalizeAgentShorthand, parseModelString, type PermissionValue } from "../config/normalize.ts"
import type {
  AgentEntry,
  LogicalTierVariantOverride,
  LogicalTierVariants,
} from "../config/schema.ts"
import type { Agent, FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"
import {
  LOGICAL_TIER_ORDER,
  logicalTierProfileName,
  type LogicalTier,
} from "./names.ts"

export type AgentProfileRegistrationOverrides = {
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

export type ResolvedLogicalTierBase = {
  requirement: ModelRequirement
  registration: AgentProfileRegistrationOverrides
  resolutionSource: "user-config" | "agent-default"
  suppressCatalogUpgrade: boolean
}

export type MaterializedLogicalTierProfile = ResolvedLogicalTierBase & {
  name: string
  logicalTier: LogicalTier
}

function cloneFallbackEntry(entry: FallbackEntry): FallbackEntry {
  return {
    ...entry,
    providers: [...entry.providers],
    ...(entry.thinking ? { thinking: { ...entry.thinking } } : {}),
  }
}

function cloneRequirement(requirement: ModelRequirement): ModelRequirement {
  return {
    ...requirement,
    fallbackChain: requirement.fallbackChain.map(cloneFallbackEntry),
    ...(requirement.requiresProvider ? { requiresProvider: [...requirement.requiresProvider] } : {}),
  }
}

function cloneRegistration(registration: AgentProfileRegistrationOverrides): AgentProfileRegistrationOverrides {
  return structuredClone(registration)
}

function cloneResolvedBase(base: ResolvedLogicalTierBase): ResolvedLogicalTierBase {
  return {
    ...base,
    requirement: cloneRequirement(base.requirement),
    registration: cloneRegistration(base.registration),
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
  if (!primary) throw new Error("logical tier profile has no primary fallback entry")
  cloned.fallbackChain[0] = { ...primary, providers: [...parsed.providers], model: parsed.model }
  if (cloned.requiresModel !== undefined) cloned.requiresModel = parsed.model
  if (cloned.requiresProvider !== undefined) {
    if (parsed.providers.length === 0) delete cloned.requiresProvider
    else cloned.requiresProvider = [...new Set(cloned.fallbackChain.flatMap((entry) => entry.providers))]
  }
  return cloned
}

function applyLogicalTierOverride(
  requirement: ModelRequirement,
  override: LogicalTierVariantOverride,
): ModelRequirement {
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

function registrationFrom(
  entry: AgentEntry | undefined,
  fallbackDescription?: string,
): AgentProfileRegistrationOverrides {
  const registration: AgentProfileRegistrationOverrides = {}
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
  return !!entry && ["model", "fallbackModels", "requirement", "alias"]
    .some((key) => entry[key as keyof AgentEntry] !== undefined)
}

export function resolveLogicalTierBase(args: {
  baseName: string
  agents?: Record<string, AgentEntry>
  builtin?: Agent
}): ResolvedLogicalTierBase | null {
  const configured = args.agents?.[args.baseName]
  if (!configured && !args.builtin) return null

  const normalized = normalizeAgentShorthand(args.baseName, args.agents)
  if (configured?.disabled || normalized?.disabled) return null

  const registration = registrationFrom(
    configured,
    configured?.description ?? args.builtin?.description,
  )
  if (normalized?.requirement) {
    return {
      requirement: cloneRequirement(normalized.requirement),
      registration,
      resolutionSource: "user-config",
      suppressCatalogUpgrade: hasExplicitModelSelection(configured),
    }
  }
  if (configured && args.builtin?.defaultAlias && !configured.alias) {
    const alias = normalizeAgentShorthand(args.builtin.defaultAlias, args.agents)
    if (alias?.requirement) {
      return {
        requirement: cloneRequirement(alias.requirement),
        registration,
        resolutionSource: "user-config",
        suppressCatalogUpgrade: true,
      }
    }
  }
  if (args.builtin) {
    return {
      requirement: cloneRequirement(args.builtin.requirement),
      registration,
      resolutionSource: "agent-default",
      suppressCatalogUpgrade: false,
    }
  }
  throw new Error(`logical tier base ${args.baseName} must resolve a normal model requirement before registration`)
}

export function materializeLogicalTierProfiles(args: {
  baseName: string
  base: ResolvedLogicalTierBase
  variants?: LogicalTierVariants
  isDisabled(profileName: string): boolean
}): MaterializedLogicalTierProfile[] {
  const output: MaterializedLogicalTierProfile[] = []
  for (const logicalTier of LOGICAL_TIER_ORDER) {
    const name = logicalTierProfileName(args.baseName, logicalTier)
    if (args.isDisabled(name)) continue
    if (logicalTier === "normal") {
      output.push({ name, logicalTier, ...cloneResolvedBase(args.base) })
      continue
    }
    const override = args.variants?.[logicalTier]
    if (override === undefined) continue
    output.push({
      name,
      logicalTier,
      requirement: applyLogicalTierOverride(args.base.requirement, override),
      registration: cloneRegistration(args.base.registration),
      resolutionSource: "user-config",
      suppressCatalogUpgrade:
        args.base.suppressCatalogUpgrade || (typeof override === "object" && "model" in override),
    })
  }
  return output
}
