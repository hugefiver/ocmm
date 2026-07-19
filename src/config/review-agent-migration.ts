/**
 * Context-sensitive pre-schema migration for review-agent config keys.
 *
 * The runtime review-name grammar (`src/review-agents/names.ts`) understands
 * legacy aliases for *runtime* name resolution. Config migration is a separate
 * concern: it runs *before* schema validation, canonicalizes raw `agents`
 * map keys on every base layer and on the selected inline/directory profile,
 * and detects spelling conflicts across active layers.
 *
 * Only raw agent-map keys have migration semantics here:
 *   - `oracle-high`  -> `oracle-2nd`  (legacy config; emits a deprecation warning)
 *   - `oracle-second` -> `oracle-2nd`  (accepted config alias; silent)
 *
 * `oracle-second-high` and other suffixed aliases are left untouched and are
 * later rejected by the schema's reserved-name check. We never call
 * `parseReviewAgentName("oracle-high")` to interpret a raw config slot key,
 * because that parser treats `oracle-high` as the logical-high tier of slot 1
 * - a meaning this migration intentionally removes.
 *
 * The pure preparation APIs throw `ReviewConfigConflictError` on cross-layer
 * spelling conflicts because choosing either spelling would be ambiguous.
 * Ordinary schema mismatches are left for `loadConfig()`'s tolerant parser,
 * which discards only the invalid field or entry and preserves valid siblings.
 */

export type ReviewConfigSpelling = "canonical" | "legacy-oracle-high" | "oracle-second-alias"

export type ReviewConfigOrigin = {
  canonicalKey: "oracle-2nd"
  originalKey: "oracle-2nd" | "oracle-high" | "oracle-second"
  spelling: ReviewConfigSpelling
  source: string
}

export type ReviewConfigLayerInput = {
  source: string
  value: unknown
}

export type PreparedReviewProfile = {
  name: string
  source: string
  value: unknown
  origins: ReadonlyMap<string, ReviewConfigOrigin>
}

export type PreparedReviewConfigLayer = {
  source: string
  value: unknown
}

export type PreparedReviewConfigLayers = {
  layers: readonly PreparedReviewConfigLayer[]
  baseOrigins: ReadonlyMap<string, ReviewConfigOrigin>
  inlineProfiles: ReadonlyMap<string, readonly PreparedReviewProfile[]>
}

export class ReviewConfigConflictError extends Error {
  readonly code = "OCMM_REVIEW_CONFIG_CONFLICT" as const
  constructor(message: string) {
    super(message)
    this.name = "ReviewConfigConflictError"
  }
}

/** Canonical key produced by migrating `originalKey`. `null` if not a review-migration key. */
function migrationTarget(originalKey: string): "oracle-2nd" | null {
  if (originalKey === "oracle-2nd") return "oracle-2nd"
  if (originalKey === "oracle-high") return "oracle-2nd"
  if (originalKey === "oracle-second") return "oracle-2nd"
  return null
}

function spellingOf(originalKey: string): ReviewConfigSpelling {
  if (originalKey === "oracle-high") return "legacy-oracle-high"
  if (originalKey === "oracle-second") return "oracle-second-alias"
  return "canonical"
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Canonicalize one `agents` map in place (shallow-copying the enclosing map
 * only when a key must be replaced). Emits a deprecation warning for each
 * `oracle-high` -> `oracle-2nd` migration. Returns the origin map recorded
 * for this agents map.
 *
 * Throws `ReviewConfigConflictError` if two different spellings inside the
 * SAME agents map target `oracle-2nd` (e.g. `oracle-high` and `oracle-2nd`
 * both present). Identical spellings are impossible inside one object.
 */
function canonicalizeAgentsMap(
  agents: Record<string, unknown>,
  source: string,
  warn: (message: string) => void,
): { value: Record<string, unknown>; origins: Map<string, ReviewConfigOrigin> } {
  const origins = new Map<string, ReviewConfigOrigin>()
  let rewritten: Record<string, unknown> | null = null
  for (const [originalKey, entry] of Object.entries(agents)) {
    const canonicalKey = migrationTarget(originalKey)
    if (canonicalKey === null) {
      if (rewritten) rewritten[originalKey] = entry
      continue
    }
    if (origins.has(canonicalKey)) {
      const existing = origins.get(canonicalKey)!
      if (existing.originalKey !== originalKey) {
        throw new ReviewConfigConflictError(
          `review-agent spelling conflict in ${source}: agents.${existing.originalKey} and agents.${originalKey} both target agents.${canonicalKey}`,
        )
      }
      // Same spelling twice is impossible in a single object; skip defensively.
      continue
    }
    if (rewritten === null) {
      // Lazily shallow-copy the enclosing map so we never mutate input.
      rewritten = { ...agents }
    }
    if (canonicalKey !== originalKey) delete (rewritten as Record<string, unknown>)[originalKey]
    rewritten[canonicalKey] = entry
    origins.set(canonicalKey, {
      canonicalKey,
      originalKey: originalKey as ReviewConfigOrigin["originalKey"],
      spelling: spellingOf(originalKey),
      source,
    })
    if (originalKey === "oracle-high") {
      warn(
        `deprecated agents.oracle-high in ${source}; migrated to agents.oracle-2nd. Configure logical high with agents.oracle.variants.high.`,
      )
    }
  }
  return { value: rewritten ?? agents, origins }
}

/**
 * Canonicalize one base config layer's `agents` map. Returns the new layer
 * value (shallow-copied only if `agents` was rewritten) and the recorded
 * origins. Does NOT compare with other layers.
 */
function canonicalizeBaseLayer(
  value: unknown,
  source: string,
  warn: (message: string) => void,
): { value: unknown; origins: Map<string, ReviewConfigOrigin> } {
  if (!isPlainObject(value)) return { value, origins: new Map() }
  if (!isPlainObject(value.agents)) return { value, origins: new Map() }
  const { value: agents, origins } = canonicalizeAgentsMap(value.agents, source, warn)
  if (agents === value.agents) return { value, origins }
  return { value: { ...value, agents }, origins }
}

/**
 * Prepare all base layers for schema parsing.
 *
 * - Canonicalizes `agents` on every base layer before merge.
 * - Compares base origins across layers: identical original spellings may
 *   override by normal precedence; different spellings targeting `oracle-2nd`
 *   throw `ReviewConfigConflictError` naming both keys and both sources.
 * - Canonicalizes every inline profile independently before schema parsing and
 *   retains each contribution's spelling origins for selection-time checks.
 * - Does not compare inline profiles with base until profile precedence selects
 *   the active contribution(s).
 */
export function prepareConfigLayers(
  layers: readonly ReviewConfigLayerInput[],
  warn: (message: string) => void,
): PreparedReviewConfigLayers {
  const preparedLayers: PreparedReviewConfigLayer[] = []
  const baseOrigins = new Map<string, ReviewConfigOrigin>()
  const inlineProfiles = new Map<string, PreparedReviewProfile[]>()

  for (const layer of layers) {
    const baseRes = canonicalizeBaseLayer(layer.value, layer.source, warn)
    const inlineRes = canonicalizeInlineProfiles(baseRes.value, layer.source, warn)

    // Cross-layer base-origin conflict check.
    for (const [canonicalKey, origin] of baseRes.origins) {
      const existing = baseOrigins.get(canonicalKey)
      if (existing === undefined) {
        baseOrigins.set(canonicalKey, origin)
        continue
      }
      if (existing.spelling !== origin.spelling) {
        throw new ReviewConfigConflictError(
          `review-agent spelling conflict: agents.${existing.originalKey} in ${existing.source} and agents.${origin.originalKey} in ${origin.source} both target agents.${canonicalKey}`,
        )
      }
      // Same spelling overrides by normal precedence (later layer wins).
      baseOrigins.set(canonicalKey, origin)
    }

    for (const profile of inlineRes.profiles) {
      const contributions = inlineProfiles.get(profile.name) ?? []
      contributions.push(profile)
      inlineProfiles.set(profile.name, contributions)
    }

    preparedLayers.push({ source: layer.source, value: inlineRes.value })
  }

  return { layers: preparedLayers, baseOrigins, inlineProfiles }
}

function canonicalizeInlineProfiles(
  value: unknown,
  source: string,
  warn: (message: string) => void,
): { value: unknown; profiles: PreparedReviewProfile[] } {
  if (!isPlainObject(value) || !isPlainObject(value.profiles)) {
    return { value, profiles: [] }
  }

  const contributions: PreparedReviewProfile[] = []
  let rewrittenProfiles: Record<string, unknown> | null = null
  for (const [name, profileValue] of Object.entries(value.profiles)) {
    const prepared = prepareReviewProfile({ name, source, value: profileValue }, warn)
    contributions.push(prepared)
    if (prepared.value === profileValue) continue
    rewrittenProfiles ??= { ...value.profiles }
    rewrittenProfiles[name] = prepared.value
  }

  if (rewrittenProfiles === null) return { value, profiles: contributions }
  return {
    value: { ...value, profiles: rewrittenProfiles },
    profiles: contributions,
  }
}

/**
 * Canonicalize one directory profile's `agents` map and record its file path.
 * Does NOT compare with base. Throws on within-profile spelling collisions.
 */
export function prepareReviewProfile(
  input: { name: string; source: string; value: unknown },
  _warn: (message: string) => void,
): PreparedReviewProfile {
  if (!isPlainObject(input.value) || !isPlainObject(input.value.agents)) {
    return { name: input.name, source: input.source, value: input.value, origins: new Map() }
  }
  const { value: agents, origins } = canonicalizeAgentsMap(input.value.agents, input.source, _warn)
  if (agents === input.value.agents) {
    return { name: input.name, source: input.source, value: input.value, origins }
  }
  return {
    name: input.name,
    source: input.source,
    value: { ...input.value, agents },
    origins,
  }
}

/**
 * Check that the selected profile contribution(s) are compatible with base.
 *
 * Receives ONLY the profile contribution(s) that actually won precedence:
 *   - project-directory winner is a single prepared profile, OR
 *   - user-directory winner is a single prepared profile, OR
 *   - all inline contributions for that name in user->project order.
 *
 * First checks different spellings across those selected contributions, then
 * checks the winning origin per canonical key against `baseOrigins`. Does
 * NOT inspect shadowed directory or inactive profiles.
 */
export function assertSelectedReviewProfileCompatible(
  baseOrigins: ReadonlyMap<string, ReviewConfigOrigin>,
  selectedProfiles: readonly PreparedReviewProfile[],
): void {
  if (selectedProfiles.length === 0) return

  // Across selected contributions, later contributions override earlier ones
  // by precedence. Track the winning origin per canonical key and detect
  // cross-contribution spelling conflicts.
  const winningOrigins = new Map<string, ReviewConfigOrigin>()
  for (const profile of selectedProfiles) {
    for (const [canonicalKey, origin] of profile.origins) {
      const existing = winningOrigins.get(canonicalKey)
      if (existing === undefined) {
        winningOrigins.set(canonicalKey, origin)
        continue
      }
      if (existing.spelling !== origin.spelling) {
        throw new ReviewConfigConflictError(
          `review-agent spelling conflict in profile ${profile.name}: agents.${existing.originalKey} in ${existing.source} and agents.${origin.originalKey} in ${origin.source} both target agents.${canonicalKey}`,
        )
      }
      winningOrigins.set(canonicalKey, origin)
    }
  }

  // Compare winning origins against base origins.
  for (const [canonicalKey, profileOrigin] of winningOrigins) {
    const baseOrigin = baseOrigins.get(canonicalKey)
    if (baseOrigin === undefined) continue
    if (baseOrigin.spelling !== profileOrigin.spelling) {
      throw new ReviewConfigConflictError(
        `review-agent spelling conflict: agents.${baseOrigin.originalKey} in ${baseOrigin.source} and agents.${profileOrigin.originalKey} in ${profileOrigin.source} both target agents.${canonicalKey}`,
      )
    }
  }
}
