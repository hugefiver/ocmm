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
import { AgentEntrySchema, defaultConfig, OcmmConfigSchema, ProfileEntrySchema, type OcmmConfig } from "./schema.ts"
import { tolerantParse, tolerantParseLayers, type TolerantParseLayer } from "./tolerant-parse.ts"
import { log } from "../shared/logger.ts"
import { deepMerge, isPlainObject } from "./merge.ts"
import { materializeQualifiedAgentAliases } from "./profile-aliases.ts"
import type { ProfileDescriptor, ProfileDescriptorError, ProfileDescriptorMap, ProfileSource } from "./profile-types.ts"
import {
  assertSelectedReviewProfileCompatible,
  prepareConfigLayers,
  prepareReviewProfile,
  ReviewConfigConflictError,
  type PreparedReviewProfile,
} from "./review-agent-migration.ts"

export { deepMerge } from "./merge.ts"

const FILE_BASENAMES = ["ocmm.jsonc", "ocmm.json"]
const rawDirectoryProfileValues = new WeakMap<ProfileDescriptor, unknown>()
const ProfileSelectionSchema = z.object({
  activeProfile: z.string().optional(),
})

export type ConfigHost = "opencode" | "codex"
export type LoadConfigOptions = { cwd?: string; host?: ConfigHost; includeUser?: boolean }

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

export function loadProfileDescriptorsFromDir(
  dir: string,
  source: Exclude<ProfileSource, "inline">,
): Map<string, ProfileDescriptor> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return new Map()
  }

  const grouped = new Map<string, { json?: string; jsonc?: string }>()
  for (const fileName of entries) {
    if (!fileName.endsWith(".jsonc") && !fileName.endsWith(".json")) continue
    const baseName = fileName.replace(/\.(jsonc|json)$/, "")
    const files = grouped.get(baseName) ?? {}
    if (fileName.endsWith(".jsonc")) files.jsonc = fileName
    else files.json = fileName
    grouped.set(baseName, files)
  }

  const descriptors = new Map<string, ProfileDescriptor>()
  for (const [name, files] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const fileName = files.jsonc ?? files.json
    if (!fileName) continue
    const path = resolve(join(dir, fileName))
    const descriptor: ProfileDescriptor = { name, source, path }
    let parsed: unknown
    try {
      parsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(readFileSync(path, "utf8")))
      descriptor.value = parsed
    } catch (err) {
      descriptor.error = { kind: "parse", message: (err as Error).message }
      descriptors.set(name, descriptor)
      continue
    }

    const prepared = prepareProfileDescriptorValue(name, path, parsed)
    descriptor.value = prepared.value
    if (prepared.error) descriptor.error = prepared.error
    else rawDirectoryProfileValues.set(descriptor, parsed)
    descriptors.set(name, descriptor)
  }
  return descriptors
}

function prepareProfileDescriptorValue(
  name: string,
  source: string,
  value: unknown,
): { value: unknown; error?: ProfileDescriptorError } {
  const structuralError = profileDescriptorStructuralError(name, source, value)
  if (structuralError) return { value, error: structuralError }
  let prepared: PreparedReviewProfile
  try {
    prepared = prepareReviewProfile({ name, source, value }, () => {})
  } catch (err) {
    return { value, error: { kind: "shape", message: (err as Error).message } }
  }
  return sanitizeProfileDescriptorLayers(name, source, selectedProfileLayers([prepared]))
}

function profileDescriptorStructuralError(
  name: string,
  source: string,
  value: unknown,
): ProfileDescriptorError | undefined {
  if (!isPlainObject(value)) {
    return { kind: "shape", message: `profile ${name} in ${source} is not a JSON object` }
  }
  if ("profiles" in value || "activeProfile" in value) {
    return { kind: "shape", message: `profile ${name} in ${source} cannot contain profiles or activeProfile` }
  }
  return undefined
}

function sanitizeProfileDescriptorLayers(
  name: string,
  source: string,
  layers: readonly TolerantParseLayer[],
): { value: unknown; error?: ProfileDescriptorError } {
  const result = tolerantParseLayers(ProfileEntrySchema, layers, mergeConfigLayers)
  if (result.success) return { value: mergeConfigLayers(result.layers) }
  return {
    value: mergeConfigLayers(layers),
    error: { kind: "shape", message: `profile ${name} in ${source} failed schema validation` },
  }
}

export type LoadedConfig = {
  config: OcmmConfig
  sources: { user?: string; project?: string }
  /** Name of the profile applied (from config or OCMM_PROFILE env), if any. */
  activeProfile?: string
}

function reviewWarn(message: string): void {
  log.warn(message)
}

type ConfigSources = LoadedConfig["sources"]
type RawConfigLayer = { source: string; value: unknown }
type LocatedConfigLayers = {
  cwd: string
  host: ConfigHost
  includeUser: boolean
  sources: ConfigSources
  rawLayers: RawConfigLayer[]
}

function locateConfigLayers(opts: LoadConfigOptions = {}): LocatedConfigLayers {
  const cwd = resolve(opts.cwd ?? process.cwd())
  const host = opts.host ?? "opencode"
  const sources: ConfigSources = {}

  const userPath = opts.includeUser === false ? null : locateFile(userConfigDir(host))
  const projectPath = locateFile(projectConfigDir(cwd, host))

  // Build the raw layer list. Apply stripProjectOnlyFields to project first.
  const rawLayers: RawConfigLayer[] = []
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
  return { cwd, host, includeUser: opts.includeUser !== false, sources, rawLayers }
}

function selectActiveProfile(selection: { activeProfile?: unknown }): string | undefined {
  const noProfile = process.env.OCMM_NO_PROFILE === "1" || process.env.OCMM_NO_PROFILE === "true"
  const envProfile = noProfile ? undefined : (process.env.OCMM_PROFILE || undefined)
  const activeProfileRaw = noProfile ? undefined : (envProfile ?? selection.activeProfile)
  return typeof activeProfileRaw === "string" && activeProfileRaw.length > 0
    ? activeProfileRaw
    : undefined
}

function deriveActiveProfileFromRawLayers(rawLayers: readonly RawConfigLayer[]): string | undefined {
  let mergedRaw: Record<string, unknown> = {}
  for (const layer of rawLayers) {
    if (isPlainObject(layer.value)) {
      mergedRaw = deepMerge(mergedRaw, layer.value) as Record<string, unknown>
    }
  }
  return selectActiveProfile(mergedRaw)
}

export function loadConfig(opts: LoadConfigOptions = {}): LoadedConfig {
  const { cwd, host, sources, rawLayers } = locateConfigLayers(opts)

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

    const activeProfile = selectActiveProfile(selection)

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
      const activeProfile = deriveActiveProfileFromRawLayers(rawLayers)
      return { config: defaultConfig(), sources, ...(activeProfile ? { activeProfile } : {}) }
    }
    throw err
  }
}

class PluginProfilePipelineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PluginProfilePipelineError"
  }
}

export function loadOpenCodePluginConfig(
  options: Omit<LoadConfigOptions, "host"> = {},
): LoadedConfig {
  const located = locateConfigLayers({ ...options, host: "opencode" })
  try {
    return loadOpenCodePluginConfigStrict(located)
  } catch (err) {
    if (!(err instanceof PluginProfilePipelineError) && !(err instanceof ReviewConfigConflictError)) {
      throw err
    }
    const activeProfile = deriveActiveProfileFromRawLayers(located.rawLayers)
    log.warn(`ocmm opencode plugin config validation failed; using defaults: ${(err as Error).message}`)
    return { config: defaultConfig(), sources: located.sources, ...(activeProfile ? { activeProfile } : {}) }
  }
}

function loadOpenCodePluginConfigStrict(located: LocatedConfigLayers): LoadedConfig {
  const emittedReviewWarnings = new Set<string>()
  const warnReviewOnce = (message: string): void => {
    if (emittedReviewWarnings.has(message)) return
    emittedReviewWarnings.add(message)
    reviewWarn(message)
  }

  const prepared = prepareConfigLayers(located.rawLayers, warnReviewOnce)
  const baseLayers: TolerantParseLayer[] = prepared.layers.map((layer) => ({ value: layer.value }))
  // Runtime loading is intentionally tolerant even though OcmmConfigSchema/schema.json are strict.
  // Do not replace this with safeParse: one invalid field must be discarded without erasing valid
  // siblings or lower layers. Only structural/semantic plugin-pipeline failures below are atomic.
  const baseParsed = tolerantParseLayers(OcmmConfigSchema, baseLayers, mergeConfigLayers)
  if (!baseParsed.success) {
    throw new PluginProfilePipelineError("base config validation could not be recovered")
  }

  const descriptors = composeProfileDescriptors(
    inlineProfileDescriptorsFromPreparedProfiles(prepared.inlineProfiles),
    located.includeUser
      ? loadProfileDescriptorsFromDir(join(userConfigDir("opencode"), "ocmm-profiles"), "user-directory")
      : new Map(),
    loadProfileDescriptorsFromDir(join(projectConfigDir(located.cwd, "opencode"), "ocmm-profiles"), "project-directory"),
  )
  const activeProfile = selectActiveProfile({ activeProfile: baseParsed.data.activeProfile })
  let config = baseParsed.data

  if (activeProfile) {
    const descriptor = descriptors.get(activeProfile)
    if (!descriptor) {
      log.warn(`active profile "${activeProfile}" not found in profiles; ignored`)
    } else if (descriptor.error) {
      throw new PluginProfilePipelineError(
        `active profile "${activeProfile}" from ${profileDescriptorLocation(descriptor)} is invalid (${descriptor.error.kind}): ${descriptor.error.message}`,
      )
    } else if (descriptor.value === undefined) {
      throw new PluginProfilePipelineError(
        `active profile "${activeProfile}" from ${profileDescriptorLocation(descriptor)} has no materialized value`,
      )
    } else {
      const selectedContributions = selectedPluginProfileContributions(activeProfile, descriptor, prepared, warnReviewOnce)
      assertSelectedReviewProfileCompatible(prepared.baseOrigins, selectedContributions)
      const selectedProfile = tolerantParseLayers(
        ProfileEntrySchema,
        selectedProfileLayers(selectedContributions),
        mergeConfigLayers,
      )
      if (!selectedProfile.success) {
        throw new PluginProfilePipelineError("selected profile validation could not be recovered")
      }
      const finalRaw = mergeConfigLayers([
        { value: baseParsed.data },
        { value: mergeConfigLayers(selectedProfile.layers), profileOverlay: true },
      ])
      const finalParsed = OcmmConfigSchema.safeParse(finalRaw)
      if (!finalParsed.success) {
        throw new PluginProfilePipelineError(`profiled config validation failed: ${formatZodIssues(finalParsed.error.issues)}`)
      }
      config = finalParsed.data
    }
  }

  let materialized: OcmmConfig
  try {
    materialized = materializeQualifiedAgentAliases({
      config,
      baseAgents: baseParsed.data.agents ?? {},
      profiles: descriptors,
    })
  } catch (err) {
    throw new PluginProfilePipelineError(`qualified alias materialization failed: ${(err as Error).message}`)
  }
  const materializedParsed = OcmmConfigSchema.safeParse(materialized)
  if (!materializedParsed.success) {
    throw new PluginProfilePipelineError(
      `materialized config validation failed: ${formatZodIssues(materializedParsed.error.issues)}`,
    )
  }

  return { config: materializedParsed.data, sources: located.sources, ...(activeProfile ? { activeProfile } : {}) }
}

function composeProfileDescriptors(
  inlineDescriptors: ProfileDescriptorMap,
  userDescriptors: ProfileDescriptorMap,
  projectDescriptors: ProfileDescriptorMap,
): Map<string, ProfileDescriptor> {
  const out = new Map<string, ProfileDescriptor>()
  for (const descriptors of [inlineDescriptors, userDescriptors, projectDescriptors]) {
    for (const [name, descriptor] of descriptors) out.set(name, descriptor)
  }
  return out
}

function inlineProfileDescriptorsFromPreparedProfiles(
  profiles: ReadonlyMap<string, readonly PreparedReviewProfile[]>,
): Map<string, ProfileDescriptor> {
  const descriptors = new Map<string, ProfileDescriptor>()
  for (const [name, contributions] of profiles) {
    const layers = selectedProfileLayers(contributions)
    const rawValue = mergeConfigLayers(layers)
    const structuralError = profileDescriptorStructuralError(name, "inline profile", rawValue)
    const prepared = structuralError
      ? { value: rawValue, error: structuralError }
      : sanitizeProfileDescriptorLayers(name, "inline profile", layers)
    const descriptor: ProfileDescriptor = { name, source: "inline", value: prepared.value }
    if (prepared.error) descriptor.error = prepared.error
    descriptors.set(name, descriptor)
  }
  return descriptors
}

function selectedPluginProfileContributions(
  name: string,
  descriptor: ProfileDescriptor,
  prepared: ReturnType<typeof prepareConfigLayers>,
  warn: (message: string) => void,
): readonly PreparedReviewProfile[] {
  if (descriptor.source === "inline") return prepared.inlineProfiles.get(name) ?? []
  if (rawDirectoryProfileValues.has(descriptor)) {
    return [prepareReviewProfile({
      name,
      source: descriptor.path ?? descriptor.source,
      value: rawDirectoryProfileValues.get(descriptor),
    }, warn)]
  }
  return [prepareReviewProfile({ name, source: descriptor.path ?? descriptor.source, value: descriptor.value }, warn)]
}

function profileDescriptorLocation(descriptor: ProfileDescriptor): string {
  return descriptor.path ?? descriptor.source
}

function formatZodIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "<root>"
      return `${path}: ${issue.message}`
    })
    .join("; ")
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
