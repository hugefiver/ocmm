/**
 * Config file loader.
 *
 * Reads ocmm.json / ocmm.jsonc from project + user locations, parses (with
 * minimal JSONC support - strip comments & trailing commas), validates with
 * Zod, then deep-merges (project wins). Missing files are silently tolerated.
 *
 * Before schema validation, every base layer's `agents` map and every
 * inline/directory profile's `agents` map is canonicalized through the
 * review-agent migration phase (`./review-agent-migration.ts`). Legacy
 * `agents.oracle-high` migrates to `agents.oracle-2nd` with a source-aware
 * deprecation warning; the `oracle-second` alias migrates silently. Different
 * spellings targeting `oracle-2nd` across active layers are conflicts: the pure
 * preparation APIs throw `ReviewConfigConflictError`, and `loadConfig()`
 * catches that and returns defaults.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { z } from "zod"
import { AgentEntrySchema, defaultConfig, OcmmConfigSchema, type OcmmConfig } from "./schema.ts"
import { tolerantParse, tolerantParseLayers, type TolerantParseLayer } from "./tolerant-parse.ts"
import { log } from "../shared/logger.ts"
import {
  assertSelectedReviewProfileCompatible,
  prepareConfigLayers,
  prepareReviewProfile,
  ReviewConfigConflictError,
  type PreparedReviewProfile,
} from "./review-agent-migration.ts"

const FILE_BASENAMES = ["ocmm.jsonc", "ocmm.json"]
const ProfileSelectionSchema = z.object({
  activeProfile: z.string().optional(),
})

export type ConfigHost = "opencode" | "codex"

function userConfigDir(host: ConfigHost): string {
  if (host === "codex") return process.env.CODEX_HOME ?? join(homedir(), ".codex")
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "opencode")
  return join(homedir(), ".config", "opencode")
}

function projectConfigDir(cwd: string, host: ConfigHost): string {
  return join(cwd, host === "codex" ? ".codex" : ".opencode")
}

/** Strip // line and /* block comments + trailing commas. Cheap, sufficient for our config. */
export function stripJsoncCommentsAndTrailingCommas(input: string): string {
  let out = ""
  let i = 0
  let inStr: '"' | "'" | null = null
  while (i < input.length) {
    const c = input[i]
    if (inStr) {
      out += c
      if (c === "\\" && i + 1 < input.length) {
        out += input[i + 1]
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'"
      out += c
      i++
      continue
    }
    if (c === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i + 2)
      i = nl < 0 ? input.length : nl
      continue
    }
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2)
      i = end < 0 ? input.length : end + 2
      continue
    }
    out += c
    i++
  }
  // Strip trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, "$1")
}

function readJsoncFile(path: string): unknown | null {
  try {
    const raw = readFileSync(path, "utf8")
    const stripped = stripJsoncCommentsAndTrailingCommas(raw)
    return JSON.parse(stripped)
  } catch (err) {
    log.warn(`failed to read/parse ${path}: ${(err as Error).message}`)
    return null
  }
}

function locateFile(dir: string): string | null {
  for (const name of FILE_BASENAMES) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Load profile entries from a directory of `<name>.jsonc` / `<name>.json` files.
 *
 * Each file is parsed (JSONC) and returned under its basename (extension
 * stripped) along with its absolute winning source path. Parse failures are
 * warned and skipped. `profiles` and `activeProfile` keys are defensively
 * stripped from each entry to prevent nested-profile leakage
 * (ProfileEntrySchema forbids them, but this function does not run schema
 * validation - the merge step would otherwise leak them).
 *
 * `.jsonc` is preferred when both `<name>.jsonc` and `<name>.json` exist.
 * Returns `{}` if the directory does not exist or is empty.
 */
export type ProfileFileEntry = { source: string; value: unknown }

export function loadProfileEntriesFromDir(dir: string): Record<string, ProfileFileEntry> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return {}
  }
  const out: Record<string, ProfileFileEntry> = {}
  const seen = new Set<string>()
  // Sort so .jsonc is processed after .json (later wins) for same basename.
  const files = entries.filter((n) => n.endsWith(".jsonc") || n.endsWith(".json")).sort()
  for (const name of files) {
    const baseName = name.replace(/\.(jsonc|json)$/, "")
    const ext = name.endsWith(".jsonc") ? "jsonc" : "json"
    // If we already have a .jsonc version, skip .json.
    if (ext === "json" && seen.has(baseName + ":jsonc")) continue
    const path = resolve(join(dir, name))
    const raw = readFileSync(path, "utf8")
    let parsed: unknown
    try {
      parsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
    } catch (err) {
      log.warn(`failed to parse profile ${path}: ${(err as Error).message}`)
      continue
    }
    if (!isPlainObject(parsed)) {
      log.warn(`profile ${path} is not a JSON object; skipped`)
      continue
    }
    // Defensive: strip forbidden keys.
    const cleaned: Record<string, unknown> = { ...parsed }
    let stripped = false
    if ("profiles" in cleaned) {
      delete cleaned.profiles
      stripped = true
    }
    if ("activeProfile" in cleaned) {
      delete cleaned.activeProfile
      stripped = true
    }
    if (stripped) {
      log.warn(`profile ${path} contained profiles/activeProfile; stripped`)
    }
    out[baseName] = { source: path, value: cleaned }
    seen.add(baseName + ":" + ext)
  }
  return out
}

/**
 * Backward-compatible wrapper returning the profile value only.
 */
export function loadProfilesFromDir(dir: string): Record<string, unknown> {
  const entries = loadProfileEntriesFromDir(dir)
  const out: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(entries)) {
    out[name] = entry.value
  }
  return out
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

const ACCUMULATING_ARRAY_KEYS = new Set([
  "fallbackModels",
  "disabledAgents",
  "disabledHooks",
  "disabledTools",
  "disabledSkills",
  "disabledCommands",
  "disabledMcps",
])

export type LoadedConfig = {
  config: OcmmConfig
  sources: { user?: string; project?: string }
  /** Name of the profile applied (from config or OCMM_PROFILE env), if any. */
  activeProfile?: string
}

function reviewWarn(message: string): void {
  log.warn(message)
}

export function loadConfig(opts: { cwd?: string; host?: ConfigHost; includeUser?: boolean } = {}): LoadedConfig {
  const cwd = resolve(opts.cwd ?? process.cwd())
  const host = opts.host ?? "opencode"
  const sources: { user?: string; project?: string } = {}

  const userPath = opts.includeUser === false ? null : locateFile(userConfigDir(host))
  const projectPath = locateFile(projectConfigDir(cwd, host))

  // Build the raw layer list. Apply stripProjectOnlyFields to project first.
  const rawLayers: { source: string; value: unknown }[] = []
  if (userPath) {
    const data = readJsoncFile(userPath)
    if (data !== null) {
      rawLayers.push({ source: userPath, value: data })
      sources.user = userPath
    }
  }
  if (projectPath) {
    const data = readJsoncFile(projectPath)
    if (data !== null) {
      rawLayers.push({ source: projectPath, value: stripProjectOnlyFields(data) })
      sources.project = projectPath
    }
  }

  try {
    const emittedReviewWarnings = new Set<string>()
    const warnReviewOnce = (message: string): void => {
      if (emittedReviewWarnings.has(message)) return
      emittedReviewWarnings.add(message)
      reviewWarn(message)
    }
    const prepared = prepareConfigLayers(rawLayers, warnReviewOnce)
    const baseLayers: TolerantParseLayer[] = prepared.layers.map((layer) => ({
      value: cleanAgentEntries(layer.value),
    }))

    const profileSelection = tolerantParseLayers(ProfileSelectionSchema, baseLayers, mergeConfigLayers)
    const selectedBaseLayers = profileSelection.success ? profileSelection.layers : baseLayers
    const selection = profileSelection.success ? profileSelection.data : {}

    const noProfile = process.env.OCMM_NO_PROFILE === "1" || process.env.OCMM_NO_PROFILE === "true"
    const envProfile = noProfile ? undefined : (process.env.OCMM_PROFILE || undefined)
    const activeProfileRaw = noProfile ? undefined : (envProfile ?? selection.activeProfile)
    const activeProfile =
      typeof activeProfileRaw === "string" && activeProfileRaw.length > 0
        ? activeProfileRaw
        : undefined

    const userDirEntries = loadProfileEntriesFromDir(join(userConfigDir(host), "ocmm-profiles"))
    const projectDirEntries = host === "opencode"
      ? loadProfileEntriesFromDir(join(projectConfigDir(cwd, host), "ocmm-profiles"))
      : {}

    let selectedContributions: readonly PreparedReviewProfile[] = []
    if (activeProfile) {
      const projectDirWinner = projectDirEntries[activeProfile]
      if (projectDirWinner) {
          selectedContributions = [prepareReviewProfile({
            name: activeProfile,
            source: projectDirWinner.source,
            value: projectDirWinner.value,
          }, warnReviewOnce)]
      } else {
        const userDirWinner = userDirEntries[activeProfile]
        if (userDirWinner) {
          selectedContributions = [prepareReviewProfile({
            name: activeProfile,
            source: userDirWinner.source,
            value: userDirWinner.value,
          }, warnReviewOnce)]
        } else {
          const activeSources = new Set(
            prepared.layers
              .filter((_, index) => selectedBaseLayers[index]?.value !== undefined)
              .map((layer) => layer.source),
          )
          selectedContributions = (prepared.inlineProfiles.get(activeProfile) ?? [])
            .filter((profile) => activeSources.has(profile.source))
        }
      }
    }

    assertSelectedReviewProfileCompatible(prepared.baseOrigins, selectedContributions)

    const profileLayers = selectedProfileLayers(selectedContributions)
    if (activeProfile && profileLayers.length === 0) {
      log.warn(`active profile "${activeProfile}" not found in profiles; ignored`)
    }

    const parsed = tolerantParseLayers(
      OcmmConfigSchema,
      [...selectedBaseLayers, ...profileLayers],
      mergeConfigLayers,
    )
    if (!parsed.success) {
      log.warn(
        `ocmm config validation failed; using defaults. issues:`,
        parsed.issues.slice(0, 5),
      )
      return { config: defaultConfig(), sources, ...(activeProfile ? { activeProfile } : {}) }
    }
    return { config: parsed.data, sources, ...(activeProfile ? { activeProfile } : {}) }
  } catch (err) {
    if (err instanceof ReviewConfigConflictError) {
      log.warn(`ocmm review-agent config conflict; using defaults: ${err.message}`)
      // Re-derive activeProfile from the raw layers without re-running migration,
      // so callers see what would have been selected.
      let mergedRaw: Record<string, unknown> = {}
      for (const layer of rawLayers) {
        if (isPlainObject(layer.value)) {
          mergedRaw = deepMerge(mergedRaw, layer.value) as Record<string, unknown>
        }
      }
      const noProfile = process.env.OCMM_NO_PROFILE === "1" || process.env.OCMM_NO_PROFILE === "true"
      const envProfile = noProfile ? undefined : (process.env.OCMM_PROFILE || undefined)
      const activeProfileRaw = noProfile ? undefined : (envProfile ?? mergedRaw.activeProfile)
      const activeProfile =
        typeof activeProfileRaw === "string" && activeProfileRaw.length > 0
          ? activeProfileRaw
          : undefined
      return { config: defaultConfig(), sources, ...(activeProfile ? { activeProfile } : {}) }
    }
    throw err
  }
}

function stripProjectOnlyFields(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  if (!isPlainObject(value.mcp) || !("envAllowlist" in value.mcp)) return value
  const mcp = { ...value.mcp }
  delete mcp.envAllowlist
  return { ...value, mcp }
}

function mergeConfigLayers(layers: readonly TolerantParseLayer[]): unknown {
  let base: unknown = {}
  let profile: unknown = {}
  let hasProfile = false
  for (const layer of layers) {
    if (layer.profileOverlay) {
      profile = deepMerge(profile, layer.value, undefined, { profileOverlay: true })
      hasProfile = true
    } else {
      base = deepMerge(base, layer.value)
    }
  }
  return hasProfile ? deepMerge(base, profile, undefined, { profileOverlay: true }) : base
}

function selectedProfileLayers(selectedProfiles: readonly PreparedReviewProfile[]): TolerantParseLayer[] {
  return selectedProfiles.map((profile) => ({
    value: cleanAgentEntries(profile.value),
    profileOverlay: true,
  }))
}

function cleanAgentEntries(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  const cleaned = { ...value }
  cleanAgentMap(cleaned)
  if (!isPlainObject(cleaned.profiles)) return cleaned

  const profiles: Record<string, unknown> = { ...cleaned.profiles }
  for (const [name, profile] of Object.entries(profiles)) {
    if (!isPlainObject(profile)) continue
    const profileCopy = { ...profile }
    cleanAgentMap(profileCopy)
    profiles[name] = profileCopy
  }
  cleaned.profiles = profiles
  return cleaned
}

function cleanAgentMap(value: Record<string, unknown>): void {
  if (!isPlainObject(value.agents)) return
  const agents: Record<string, unknown> = { ...value.agents }
  for (const [name, entry] of Object.entries(agents)) {
    const parsed = tolerantParse(AgentEntrySchema, entry)
    if (parsed.success) agents[name] = parsed.data
    else delete agents[name]
  }
  value.agents = agents
}
