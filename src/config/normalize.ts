import {
  normalizeReasoning,
  splitReasoningSuffix,
  type ReasoningInput,
} from "../shared/reasoning.ts"
import type { FallbackEntry, ModelRequirement, Reasoning, Variant } from "../shared/types.ts"
import type {
  AgentEntry,
  CanonicalModelEntryConfig,
  CategoryEntry,
  FallbackEntryConfig,
  ModelRequirementConfig,
} from "./schema.ts"

export type PermissionValue = "ask" | "allow" | "deny"

export function parseModelString(
  modelStr: string,
  variant?: Variant,
  reasoningInput?: ReasoningInput,
): FallbackEntry {
  const parsed = splitReasoningSuffix(modelStr)
  const slash = parsed.model.indexOf("/")
  const provider = slash >= 0 ? parsed.model.slice(0, slash) : ""
  const model = slash >= 0 ? parsed.model.slice(slash + 1) : parsed.model
  const reasoning = normalizeReasoning(reasoningInput) ?? parsed.reasoning
  const entry: FallbackEntry = {
    providers: provider ? [provider] : [],
    model,
  }
  if (reasoning !== undefined) entry.reasoning = reasoning
  if (variant !== undefined) entry.variant = variant
  return entry
}

function normalizeFallbackEntryConfig(
  raw: string | FallbackEntryConfig,
): FallbackEntry {
  if (typeof raw === "string") return parseModelString(raw)
  const {
    reasoning: reasoningInput,
    providers,
    model,
    thinking,
    variant,
    ...rest
  } = raw
  const parsed = splitReasoningSuffix(model, { providerContext: providers.length > 0 })
  const reasoning = normalizeReasoning(reasoningInput) ?? parsed.reasoning
  return {
    ...rest,
    providers: [...providers],
    model: parsed.model,
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(variant !== undefined ? { variant } : {}),
    ...(thinking ? { thinking: { ...thinking } } : {}),
  }
}

function normalizeCanonicalModelEntry(raw: CanonicalModelEntryConfig): FallbackEntry {
  if (typeof raw === "string") return parseModelString(raw)

  const entry = parseModelString(raw.model, undefined, raw.reasoning)
  if (raw.temperature !== undefined) entry.temperature = raw.temperature
  if (raw.top_p !== undefined) entry.topP = raw.top_p
  if (raw.max_tokens !== undefined) entry.maxTokens = raw.max_tokens
  return entry
}

function normalizeRequirementConfig(
  req: ModelRequirementConfig,
): ModelRequirement {
  const {
    fallbackChain,
    reasoning: reasoningInput,
    requiresProvider,
    variant,
    ...rest
  } = req
  const reasoning = normalizeReasoning(reasoningInput)
  return {
    ...rest,
    fallbackChain: fallbackChain.map(normalizeFallbackEntryConfig),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(variant !== undefined ? { variant } : {}),
    ...(requiresProvider !== undefined ? { requiresProvider: [...requiresProvider] } : {}),
  }
}

export type NormalizedShorthand = {
  description?: string
  requirement?: ModelRequirement
  disabled?: boolean
  permission?: Record<string, PermissionValue>
}

export function normalizeDirectRequirement(
  entry: AgentEntry | CategoryEntry | undefined,
): ModelRequirement | undefined {
  if (!entry) return undefined

  if (entry.models?.length) {
    const fallbackChain = entry.models.map(normalizeCanonicalModelEntry)
    const requirement: ModelRequirement = entry.requirement
      ? { ...normalizeRequirementConfig(entry.requirement), fallbackChain }
      : { fallbackChain }
    const reasoning: Reasoning | undefined = normalizeReasoning(entry.reasoning)
    if (reasoning !== undefined) requirement.reasoning = reasoning
    if (entry.variant !== undefined) requirement.variant = entry.variant
    return requirement
  }

  if (entry.requirement) return normalizeRequirementConfig(entry.requirement)

  const chain: FallbackEntry[] = []
  if (entry.model) chain.push(parseModelString(entry.model, entry.variant, entry.reasoning))
  if (entry.fallbackModels) {
    for (const model of entry.fallbackModels) chain.push(normalizeFallbackEntryConfig(model))
  }
  if (chain.length === 0) return undefined

  const requirement: ModelRequirement = { fallbackChain: chain }
  const reasoning: Reasoning | undefined = normalizeReasoning(entry.reasoning)
  if (reasoning !== undefined) requirement.reasoning = reasoning
  if (entry.variant !== undefined) requirement.variant = entry.variant
  return requirement
}

export function applyAliasRequirementIntensity(
  requirement: ModelRequirement,
  entry: Pick<AgentEntry | CategoryEntry, "reasoning" | "variant">,
): ModelRequirement {
  const reasoning = normalizeReasoning(entry.reasoning)
  if (reasoning !== undefined) {
    const overridden = { ...requirement, reasoning }
    delete overridden.variant
    return overridden
  }
  if (entry.variant !== undefined) {
    const overridden = { ...requirement, variant: entry.variant }
    delete overridden.reasoning
    return overridden
  }
  return requirement
}

export function normalizeShorthand(
  entry: AgentEntry | CategoryEntry | undefined,
  options?: {
    resolveAlias?: (name: string) => NormalizedShorthand | undefined
    visited?: Set<string>
    selfName?: string
  },
): NormalizedShorthand | undefined {
  if (!entry) return undefined
  const out: NormalizedShorthand = {}
  if (entry.description) out.description = entry.description
  if ("disabled" in entry && entry.disabled) out.disabled = true
  if ("tools" in entry && entry.tools) {
    out.permission = Object.fromEntries(
      Object.entries(entry.tools).map(([name, enabled]) => [name, enabled ? "allow" : "deny"]),
    ) as Record<string, PermissionValue>
  }
  if ("permission" in entry && entry.permission) {
    out.permission = { ...(out.permission ?? {}), ...entry.permission }
  }

  const directRequirement = normalizeDirectRequirement(entry)
  if (directRequirement) {
    out.requirement = directRequirement
    return out
  }

  // alias resolution (only when no direct model config)
  if ("alias" in entry && typeof entry.alias === "string" && entry.alias) {
    const visited = options?.visited ?? new Set<string>()
    const selfName = options?.selfName ?? entry.alias
    if (visited.has(entry.alias)) {
      const path = [...visited, entry.alias].join(" -> ")
      throw new Error(`circular alias: ${path}`)
    }
    // avoid unused var warning - selfName used for context/debugging
    void selfName
    const resolveAlias = options?.resolveAlias
    if (resolveAlias) {
      const target = resolveAlias(entry.alias)
      if (target?.requirement) {
        out.requirement = applyAliasRequirementIntensity(
          normalizeRequirementConfig(target.requirement),
          entry,
        )
      }
    }
  }

  return out
}

/** Resolve a user agent entry and its alias chain with one cycle-safe policy. */
export function normalizeAgentShorthand(
  name: string,
  entries: Record<string, AgentEntry> | undefined,
  visited: Set<string> = new Set(),
): NormalizedShorthand | undefined {
  const entry = entries?.[name]
  if (!entry) return undefined
  if (visited.has(name)) {
    const path = [...visited, name].join(" -> ")
    throw new Error(`circular alias: ${path}`)
  }

  const path = new Set(visited)
  path.add(name)
  return normalizeShorthand(entry, {
    selfName: name,
    visited: path,
    resolveAlias: (target) => normalizeAgentShorthand(target, entries, path),
  })
}
