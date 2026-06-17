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
  if (platform() === "win32") {
    const appData = process.env.APPDATA
    if (appData) return join(appData, "opencode")
  }
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "opencode")
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
 * Deep-merge two plain-object trees. Arrays are replaced (NOT concatenated)
 * for predictable override semantics — except for `fallbackModels` and
 * `disabledAgents` which we union de-duped.
 */
export function deepMerge(
  base: unknown,
  override: unknown,
  parentKey?: string,
): unknown {
  if (override === undefined) return base
  if (Array.isArray(base) && Array.isArray(override)) {
    if (parentKey === "fallbackModels" || parentKey === "disabledAgents") {
      const set = new Set<string>([...base, ...override].map((x) => String(x)))
      return Array.from(set)
    }
    return override
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base }
    for (const [k, v] of Object.entries(override)) {
      out[k] = deepMerge(base[k], v, k)
    }
    return out
  }
  return override
}

export type LoadedConfig = {
  config: OcmmConfig
  sources: { user?: string; project?: string }
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

  const parsed = OcmmConfigSchema.safeParse(merged)
  if (!parsed.success) {
    log.warn(
      `ocmm config validation failed; using defaults. issues:`,
      parsed.error.issues.slice(0, 5),
    )
    return { config: defaultConfig(), sources }
  }
  return { config: parsed.data, sources }
}
