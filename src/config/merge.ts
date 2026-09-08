const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"])

function isUnsafeObjectKey(key: string): boolean {
  return UNSAFE_OBJECT_KEYS.has(key)
}

function isPlainObjectValue(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export const isPlainObject = isPlainObjectValue

export const ACCUMULATING_ARRAY_KEYS = new Set([
  "fallbackModels",
  "disabledAgents",
  "disabledHooks",
  "disabledTools",
  "disabledSkills",
  "disabledCommands",
  "disabledMcps",
])

const INHERITED_ALIAS_REQUIREMENT_KEYS = [
  "model",
  "models",
  "fallbackModels",
  "requirement",
  "variant",
  "reasoning",
] as const

function hasDirectRequirementSelector(entry: Record<string, unknown>): boolean {
  return (typeof entry.model === "string" && entry.model.length > 0)
    || (Array.isArray(entry.models) && entry.models.length > 0)
    || (Array.isArray(entry.fallbackModels) && entry.fallbackModels.length > 0)
    || isPlainObjectValue(entry.requirement)
}

function withoutInheritedAliasRequirement(
  baseEntry: Record<string, unknown>,
  overlayEntry: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof overlayEntry.alias !== "string" || overlayEntry.alias.length === 0) return baseEntry
  if (hasDirectRequirementSelector(overlayEntry)) return baseEntry

  const cleaned = { ...baseEntry }
  for (const key of INHERITED_ALIAS_REQUIREMENT_KEYS) delete cleaned[key]
  return cleaned
}

function prepareAgentOverlayBase(
  baseAgents: Record<string, unknown>,
  overlayAgents: Record<string, unknown>,
): Record<string, unknown> {
  let prepared = baseAgents
  for (const [name, overlayEntry] of Object.entries(overlayAgents)) {
    const baseEntry = baseAgents[name]
    if (!isPlainObjectValue(baseEntry) || !isPlainObjectValue(overlayEntry)) continue
    const cleaned = withoutInheritedAliasRequirement(baseEntry, overlayEntry)
    if (cleaned === baseEntry) continue
    if (prepared === baseAgents) prepared = { ...baseAgents }
    prepared[name] = cleaned
  }
  return prepared
}

function sanitizeMergeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeMergeValue(item))
  if (!isPlainObjectValue(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isUnsafeObjectKey(key))
      .map(([key, nested]) => [key, sanitizeMergeValue(nested)] as const),
  )
}

function mergeSanitized(
  base: unknown,
  override: unknown,
  parentKey?: string,
  opts?: { profileOverlay?: boolean },
): unknown {
  if (override === undefined) return base
  if (Array.isArray(base) && Array.isArray(override)) {
    if (opts?.profileOverlay) return override
    if (parentKey && ACCUMULATING_ARRAY_KEYS.has(parentKey)) {
      const set = new Set<string>([...base, ...override].map((x) => String(x)))
      return Array.from(set)
    }
    return override
  }
  if (isPlainObjectValue(base) && isPlainObjectValue(override)) {
    const out: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      out[key] = mergeSanitized(base[key], value, key, opts)
    }
    return out
  }
  return override
}

/**
 * Deep-merge two plain-object trees.
 *
 * Default array policy: REPLACE (override wins) for predictable override
 * semantics. Model fallback and feature-disable arrays are UNIONED de-duped
 * instead - these accumulate across user+project layers so global/project
 * gates compose predictably.
 *
 * Pass `{ profileOverlay: true }` to force ALL arrays to replace (use when
 * overlaying a profile that should fully own a field rather than accumulate).
 */
export function deepMerge(
  base: unknown,
  override: unknown,
  parentKey?: string,
  opts?: { profileOverlay?: boolean },
): unknown {
  return mergeSanitized(
    sanitizeMergeValue(base),
    sanitizeMergeValue(override),
    parentKey,
    opts,
  )
}

/** Merge a profile overlay, replacing inherited model selection for alias-only agent entries. */
export function mergeProfileOverlay(
  base: unknown,
  override: unknown,
  opts: { agentMap?: boolean } = {},
): unknown {
  if (!isPlainObjectValue(base) || !isPlainObjectValue(override)) {
    return deepMerge(base, override, undefined, { profileOverlay: true })
  }

  if (opts.agentMap) {
    const prepared = prepareAgentOverlayBase(base, override)
    return deepMerge(prepared, override, undefined, { profileOverlay: true })
  }

  const baseAgents = base.agents
  const overlayAgents = override.agents
  if (!isPlainObjectValue(baseAgents) || !isPlainObjectValue(overlayAgents)) {
    return deepMerge(base, override, undefined, { profileOverlay: true })
  }
  const preparedAgents = prepareAgentOverlayBase(baseAgents, overlayAgents)
  const preparedBase = preparedAgents === baseAgents ? base : { ...base, agents: preparedAgents }
  return deepMerge(preparedBase, override, undefined, { profileOverlay: true })
}
