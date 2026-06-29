#!/usr/bin/env node
/**
 * ocmm-profiles — CLI for managing ocmm config profiles.
 *
 * Commands:
 *   list                       List all profiles (* marks the active one)
 *   use <name>                 Set activeProfile
 *   show [name]                Print a profile (defaults to active)
 *   add <name> <json-file>     Add/replace a profile from a JSON file
 *   rm <name>                  Delete a profile
 *   clear                      Clear activeProfile (revert to base config)
 *   current                    Print the active profile name (or empty)
 *
 * Config target: the user config file at
 *   $XDG_CONFIG_HOME/opencode/ocmm.json[c]
 *   ~/.config/opencode/ocmm.json[c]         (all platforms, including Windows)
 *
 * The CLI reads, parses, mutates, and writes back. Comments are NOT
 * preserved on write (output is plain JSON with .jsonc extension, which is
 * valid JSONC). This is a known limitation — if you need comment
 * preservation, edit the file by hand.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"
import { ProfileEntrySchema } from "../config/schema.ts"
import { patchTopLevelScalar, PatchError } from "../config/jsonc-patch.ts"

type Command = "list" | "use" | "show" | "add" | "rm" | "clear" | "current" | "help"

function userConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "opencode")
  return join(homedir(), ".config", "opencode")
}

const FILE_BASENAMES = ["ocmm.jsonc", "ocmm.json"]

function locateConfig(): string | null {
  const dir = userConfigDir()
  for (const name of FILE_BASENAMES) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return null
}

/** Directory holding file-based profiles (<name>.jsonc). */
function profilesDir(): string {
  return join(userConfigDir(), "ocmm-profiles")
}

/** Full path for a profile file. Validates name (no separators/dots). */
function profilePath(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    fail(`invalid profile name: "${name}" (allowed: letters, digits, -, _)`)
  }
  return join(profilesDir(), `${name}.jsonc`)
}

/** Scan directory profiles. Returns Map<name, path>. */
function scanDirProfiles(): Map<string, string> {
  const dir = profilesDir()
  const out = new Map<string, string>()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  const files = entries.filter((n) => n.endsWith(".jsonc") || n.endsWith(".json")).sort()
  for (const name of files) {
    const baseName = name.replace(/\.(jsonc|json)$/, "")
    const ext = name.endsWith(".jsonc") ? "jsonc" : "json"
    if (ext === "json" && out.has(baseName)) continue // .jsonc already seen
    out.set(baseName, join(dir, name))
  }
  return out
}

function readConfigRaw(path: string): Record<string, unknown> {
  const text = readFileSync(path, "utf8")
  const stripped = stripJsoncCommentsAndTrailingCommas(text)
  return JSON.parse(stripped) as Record<string, unknown>
}

function writeConfigRaw(path: string, data: Record<string, unknown>): void {
  const out = JSON.stringify(data, null, 2) + "\n"
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, out, "utf8")
}

function ensureConfigFile(): string {
  const existing = locateConfig()
  if (existing) return existing
  // Create a new ocmm.jsonc in the user config dir.
  const dir = userConfigDir()
  mkdirSync(dir, { recursive: true })
  const p = join(dir, "ocmm.jsonc")
  writeConfigRaw(p, {})
  return p
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(msg: string): never {
  console.error(`ocmm-profiles: ${msg}`)
  process.exit(1)
}

function cmdList(configPath: string): void {
  const cfg = readConfigRaw(configPath)
  const inlineProfiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : undefined
  const dirProfiles = scanDirProfiles()
  // Merge names.
  const names = new Set<string>([...Object.keys(inlineProfiles), ...dirProfiles.keys()])
  if (names.size === 0) {
    console.log("(no profiles defined)")
    return
  }
  for (const name of [...names].sort()) {
    const marker = name === active ? " *" : "  "
    const inDir = dirProfiles.has(name)
    const inInline = isPlainObject(inlineProfiles[name])
    let source: string
    if (inDir && inInline) source = "file (shadows inline)"
    else if (inDir) source = "file"
    else source = "inline"
    console.log(`${marker} ${name} [${source}]`)
  }
  if (active && !names.has(active)) {
    console.log(`\n  note: active profile "${active}" is not defined`)
  }
}

function cmdUse(configPath: string, name: string): void {
  // Validate name format (consistent with add/rm).
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    fail(`invalid profile name: "${name}" (allowed: letters, digits, -, _)`)
  }
  // Verify the profile exists: dir first, then inline.
  const cfg = readConfigRaw(configPath)
  const inlineProfiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const dirProfiles = scanDirProfiles()
  if (!dirProfiles.has(name) && !isPlainObject(inlineProfiles[name])) {
    const avail = [...dirProfiles.keys(), ...Object.keys(inlineProfiles)].sort().join(", ") || "(none)"
    fail(`profile "${name}" does not exist. Available: ${avail}`)
  }
  const raw = readFileSync(configPath, "utf8")
  try {
    const patched = patchTopLevelScalar(raw, "activeProfile", name)
    writeFileSync(configPath, patched, "utf8")
  } catch (err) {
    if (err instanceof PatchError) {
      console.error(`ocmm-profiles: comment preservation failed (${err.message}); rewriting without comments`)
      cfg.activeProfile = name
      writeConfigRaw(configPath, cfg)
    } else {
      throw err
    }
  }
  console.log(`active profile set to "${name}"`)
}

function cmdShow(configPath: string, name?: string): void {
  const cfg = readConfigRaw(configPath)
  const inlineProfiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : undefined
  const target = name ?? active
  if (!target) {
    fail("no profile name given and no active profile set")
  }
  const dirProfiles = scanDirProfiles()
  let source: "file" | "inline"
  let entry: unknown
  if (dirProfiles.has(target)) {
    source = "file"
    const raw = readFileSync(dirProfiles.get(target)!, "utf8")
    entry = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
  } else if (isPlainObject(inlineProfiles[target])) {
    source = "inline"
    entry = inlineProfiles[target]
  } else {
    fail(`profile "${target}" does not exist`)
  }
  console.log(JSON.stringify({ name: target, active: target === active, source, config: entry }, null, 2))
}

function cmdAdd(configPath: string, name: string, jsonFile: string): void {
  if (!existsSync(jsonFile)) fail(`file not found: ${jsonFile}`)
  const raw = readFileSync(jsonFile, "utf8")
  // 1. JSONC validity check
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
  } catch (err) {
    fail(`invalid JSONC in ${jsonFile}: ${(err as Error).message}`)
  }
  // 2. Schema validation
  const result = ProfileEntrySchema.safeParse(parsed)
  if (!result.success) {
    fail(
      `profile JSON invalid:\n${result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    )
  }
  // 3. Ensure dir exists + copy raw (preserves comments)
  const target = profilePath(name)
  mkdirSync(profilesDir(), { recursive: true })
  copyFileSync(jsonFile, target)
  // 4. Post-copy verification
  try {
    const back = readFileSync(target, "utf8")
    const reparsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(back))
    const revalid = ProfileEntrySchema.safeParse(reparsed)
    if (!revalid.success) throw new Error("schema validation failed on read-back")
  } catch (err) {
    unlinkSync(target)
    fail(`post-copy verification failed for ${target}: ${(err as Error).message}`)
  }
  console.log(`profile "${name}" added (file: ${target})`)
}

function cmdRm(configPath: string, name: string): void {
  const target = profilePath(name)
  if (existsSync(target)) {
    // Check if it was active, for the note.
    const cfg = readConfigRaw(configPath)
    const wasActive = cfg.activeProfile === name
    unlinkSync(target)
    if (wasActive) {
      console.log(`removed profile "${name}" (file)`)
      console.log(`note: "${name}" was active — activeProfile in ocmm.jsonc is now stale; run 'ocmm-profiles use <other>' to switch`)
    } else {
      console.log(`removed profile "${name}" (file)`)
    }
    return
  }
  // Not in dir — check inline.
  const cfg = readConfigRaw(configPath)
  const profiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  if (isPlainObject(profiles[name])) {
    console.log(`profile "${name}" exists only inline in ocmm.jsonc; directory-based rm cannot remove it. Edit ocmm.jsonc manually to delete the inline entry.`)
    return
  }
  fail(`profile "${name}" not found`)
}

function cmdClear(configPath: string): void {
  const cfg = readConfigRaw(configPath)
  if (cfg.activeProfile === undefined) {
    console.log("no active profile set")
    return
  }
  const prev = cfg.activeProfile
  const raw = readFileSync(configPath, "utf8")
  try {
    const patched = patchTopLevelScalar(raw, "activeProfile", null)
    writeFileSync(configPath, patched, "utf8")
  } catch (err) {
    if (err instanceof PatchError) {
      console.error(`ocmm-profiles: comment preservation failed (${err.message}); rewriting without comments`)
      delete cfg.activeProfile
      writeConfigRaw(configPath, cfg)
    } else {
      throw err
    }
  }
  console.log(`cleared active profile (was "${prev}")`)
}

function cmdCurrent(configPath: string): void {
  const cfg = readConfigRaw(configPath)
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : ""
  console.log(active)
}

function printHelp(): void {
  console.log(`ocmm-profiles — manage ocmm config profiles

USAGE:
  ocmm-profiles list                    List all profiles (* = active)
                                        Shows [file] and [inline] sources.
  ocmm-profiles use <name>              Set the active profile (comment-preserving)
  ocmm-profiles show [name]             Print a profile (defaults to active)
  ocmm-profiles add <name> <json-file>  Add/replace a profile from a JSONC file
                                        (copied to ~/.config/opencode/ocmm-profiles/<name>.jsonc)
  ocmm-profiles rm <name>               Delete a profile file
                                        (inline profiles in ocmm.jsonc are not removable via rm)
  ocmm-profiles clear                   Clear activeProfile (comment-preserving)
  ocmm-profiles current                 Print the active profile name
  ocmm-profiles help                    Show this help

FILE-BASED PROFILES:
  Directory profiles live in:
    ~/.config/opencode/ocmm-profiles/<name>.jsonc   (user)
    <cwd>/.opencode/ocmm-profiles/<name>.jsonc      (project, shadows user)
  Each file is a ProfileEntrySchema (partial overlay) with the same merge
  semantics as inline profiles. Directory profiles shadow inline profiles
  with the same name.

INLINE PROFILES:
  Profiles defined in ocmm.jsonc's "profiles" object are still loaded but
  cannot be managed via add/rm (edit ocmm.jsonc by hand). They are shown
  in list with an [inline] marker and shadowed by same-name directory files.

The OCMM_PROFILE env var overrides activeProfile at load time but is NOT
persisted by this CLI. Use 'ocmm-profiles use <name>' to persist a switch.

Config file: ${locateConfig() ?? "(none — will be created on first write)"}`)
}

function parseArgs(argv: string[]): { command: Command; args: string[] } {
  const [cmd, ...rest] = argv
  const valid: Command[] = ["list", "use", "show", "add", "rm", "clear", "current", "help"]
  if (!cmd || !valid.includes(cmd as Command)) {
    return { command: "help", args: [] }
  }
  return { command: cmd as Command, args: rest }
}

function main(argv: string[]): void {
  const { command, args } = parseArgs(argv)
  if (command === "help") {
    printHelp()
    return
  }
  // Commands that don't need an existing file: add (creates if missing).
  // Others require an existing config to operate on.
  const requiresExisting = command !== "add"
  let configPath: string
  if (requiresExisting) {
    const p = locateConfig()
    if (!p) fail("no ocmm config found. Run 'ocmm-profiles add <name> <json>' to create one.")
    configPath = p
  } else {
    configPath = ensureConfigFile()
  }

  switch (command) {
    case "list":
      cmdList(configPath)
      break
    case "use":
      if (!args[0]) fail("usage: ocmm-profiles use <name>")
      cmdUse(configPath, args[0]!)
      break
    case "show":
      cmdShow(configPath, args[0])
      break
    case "add":
      if (!args[0] || !args[1]) fail("usage: ocmm-profiles add <name> <json-file>")
      cmdAdd(configPath, args[0]!, args[1]!)
      break
    case "rm":
      if (!args[0]) fail("usage: ocmm-profiles rm <name>")
      cmdRm(configPath, args[0]!)
      break
    case "clear":
      cmdClear(configPath)
      break
    case "current":
      cmdCurrent(configPath)
      break
  }
}

main(process.argv.slice(2))
