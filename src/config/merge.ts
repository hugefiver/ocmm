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
  if (override === undefined) return base
  if (Array.isArray(base) && Array.isArray(override)) {
    if (opts?.profileOverlay) return override
    if (parentKey && ACCUMULATING_ARRAY_KEYS.has(parentKey)) {
      const set = new Set<string>([...base, ...override].map((x) => String(x)))
      return Array.from(set)
    }
    return override
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base }
    for (const [k, v] of Object.entries(override)) {
      out[k] = deepMerge(base[k], v, k, opts)
    }
    return out
  }
  return override
}
