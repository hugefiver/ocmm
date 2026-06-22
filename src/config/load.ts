/**
 * Config file loader.
 *
 * Reads ocmm.json / ocmm.jsonc from project + user locations, parses (with
 * minimal JSONC support — strip comments & trailing commas), validates with
 * Zod, then deep-merges (project wins). Missing files are silently tolerated.
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join, resolve } from "node:path"
import { defaultConfig, OcmmConfigSchema, type OcmmConfig } from "./schema.ts"
import { log } from "../shared/logger.ts"

const FILE_BASENAMES = ["ocmm.jsonc", "ocmm.json"]

function userConfigDir(): string {
  // Honor XDG_CONFIG_HOME first when explicitly set (sandbox-friendly,
  // matches OpenCode's own resolution order). Fall back to platform default.
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "opencode")
  if (platform() === "win32") {
    const appData = process.env.APPDATA
    if (appData) return join(appData, "opencode")
  }
  return join(homedir(), ".config", "opencode")
}

function projectConfigDir(cwd: string): string {
  return join(cwd, ".opencode")
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
 * Deep-merge two plain-object trees.
 *
 * Default array policy: REPLACE (override wins) for predictable override
 * semantics. Model fallback and feature-disable arrays are UNIONED de-duped
 * instead — these accumulate across user+project layers so global/project
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

export function loadConfig(opts: { cwd?: string } = {}): LoadedConfig {
  const cwd = resolve(opts.cwd ?? process.cwd())
  const sources: { user?: string; project?: string } = {}

  const userPath = locateFile(userConfigDir())
  const projectPath = locateFile(projectConfigDir(cwd))

  let merged: unknown = {}
  if (userPath) {
    const data = readJsoncFile(userPath)
    if (data !== null) {
      merged = deepMerge(merged, data)
      sources.user = userPath
    }
  }
  if (projectPath) {
    const data = readJsoncFile(projectPath)
    if (data !== null) {
      merged = deepMerge(merged, data)
      sources.project = projectPath
    }
  }

  // Profile selection: OCMM_PROFILE env var wins over config's activeProfile.
  // Empty string is treated as unset so `OCMM_PROFILE= opencode ...` falls
  // back to the config's activeProfile rather than selecting a "" profile.
  const envProfile = process.env.OCMM_PROFILE || undefined
  const mergedRecord = isPlainObject(merged) ? (merged as Record<string, unknown>) : {}
  const activeProfileRaw = envProfile ?? mergedRecord.activeProfile
  const activeProfile =
    typeof activeProfileRaw === "string" && activeProfileRaw.length > 0
      ? activeProfileRaw
      : undefined

  // If an active profile is named, deep-merge it over the base. A missing
  // profile is silently ignored so a stale activeProfile/OCMM_PROFILE value
  // never breaks the plugin — base config loads unchanged.
  if (activeProfile && isPlainObject(mergedRecord.profiles)) {
    const profiles = mergedRecord.profiles as Record<string, unknown>
    const profile = profiles[activeProfile]
    if (isPlainObject(profile)) {
      merged = deepMerge(merged, profile, undefined, { profileOverlay: true })
    } else {
      log.warn(`active profile "${activeProfile}" not found in profiles; ignored`)
    }
  }

  const parsed = OcmmConfigSchema.safeParse(merged)
  if (!parsed.success) {
    log.warn(
      `ocmm config validation failed; using defaults. issues:`,
      parsed.error.issues.slice(0, 5),
    )
    return { config: defaultConfig(), sources, ...(activeProfile ? { activeProfile } : {}) }
  }
  return { config: parsed.data, sources, ...(activeProfile ? { activeProfile } : {}) }
}
