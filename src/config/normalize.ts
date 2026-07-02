import type { FallbackEntry, ModelRequirement, Variant } from "../shared/types.ts"
import type {
  AgentEntry,
  CategoryEntry,
  FallbackEntryConfig,
  ModelRequirementConfig,
} from "./schema.ts"

export type PermissionValue = "ask" | "allow" | "deny"

export function parseModelString(
  modelStr: string,
  variant?: Variant,
): FallbackEntry {
  const slash = modelStr.indexOf("/")
  const provider = slash >= 0 ? modelStr.slice(0, slash) : ""
  const model = slash >= 0 ? modelStr.slice(slash + 1) : modelStr
  const entry: FallbackEntry = {
    providers: provider ? [provider] : [],
    model,
  }
  if (variant) entry.variant = variant
  return entry
}

function normalizeFallbackEntryConfig(
  raw: string | FallbackEntryConfig,
): FallbackEntry {
  if (typeof raw === "string") return parseModelString(raw)
  return raw as FallbackEntry
}

function normalizeRequirementConfig(
  req: ModelRequirementConfig,
): ModelRequirement {
  return req as ModelRequirement
}

export type NormalizedShorthand = {
  description?: string
  requirement?: ModelRequirement
  disabled?: boolean
  permission?: Record<string, PermissionValue>
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

  if (entry.requirement) {
    out.requirement = normalizeRequirementConfig(entry.requirement)
    return out
  }

  const chain: FallbackEntry[] = []
  if (entry.model) chain.push(parseModelString(entry.model, entry.variant))
  if (entry.fallbackModels) {
    for (const m of entry.fallbackModels) chain.push(normalizeFallbackEntryConfig(m))
  }
  if (chain.length > 0) {
    const req: ModelRequirement = { fallbackChain: chain }
    if (entry.variant) req.variant = entry.variant
    out.requirement = req
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
        out.requirement = target.requirement
      }
    }
  }

  return out
}
