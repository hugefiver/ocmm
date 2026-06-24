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

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"
import { ProfileEntrySchema } from "../config/schema.ts"

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
  const profiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : undefined
  const names = Object.keys(profiles)
  if (names.length === 0) {
    console.log("(no profiles defined)")
    return
  }
  for (const name of names) {
    const marker = name === active ? " *" : "  "
    console.log(`${marker} ${name}`)
  }
  if (active && !profiles[active]) {
    console.log(`\n  note: active profile "${active}" is not defined`)
  }
}

function cmdUse(configPath: string, name: string): void {
  const cfg = readConfigRaw(configPath)
  const profiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  if (!isPlainObject(profiles[name])) {
    fail(`profile "${name}" does not exist. Available: ${Object.keys(profiles).join(", ") || "(none)"}`)
  }
  cfg.activeProfile = name
  writeConfigRaw(configPath, cfg)
  console.log(`active profile set to "${name}"`)
}

function cmdShow(configPath: string, name?: string): void {
  const cfg = readConfigRaw(configPath)
  const profiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : undefined
  const target = name ?? active
  if (!target) {
    fail("no profile name given and no active profile set")
  }
  const entry = profiles[target]
  if (!isPlainObject(entry)) {
    fail(`profile "${target}" does not exist`)
  }
  console.log(JSON.stringify({ name: target, active: target === active, config: entry }, null, 2))
}

function cmdAdd(configPath: string, name: string, jsonFile: string): void {
  if (!existsSync(jsonFile)) fail(`file not found: ${jsonFile}`)
  const raw = readFileSync(jsonFile, "utf8")
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
  } catch (err) {
    fail(`failed to parse ${jsonFile}: ${(err as Error).message}`)
  }
  // Validate the profile entry shape.
  const result = ProfileEntrySchema.safeParse(parsed)
  if (!result.success) {
    fail(
      `profile JSON invalid:\n${result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    )
  }
  const cfg = readConfigRaw(configPath)
  if (!isPlainObject(cfg.profiles)) cfg.profiles = {}
  ;(cfg.profiles as Record<string, unknown>)[name] = result.data
  writeConfigRaw(configPath, cfg)
  console.log(`profile "${name}" added`)
}

function cmdRm(configPath: string, name: string): void {
  const cfg = readConfigRaw(configPath)
  const profiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  if (!isPlainObject(profiles[name])) {
    fail(`profile "${name}" does not exist`)
  }
  delete profiles[name]
  if (cfg.activeProfile === name) {
    delete cfg.activeProfile
    console.log(`removed profile "${name}" (was active; activeProfile cleared)`)
  } else {
    console.log(`removed profile "${name}"`)
  }
  writeConfigRaw(configPath, cfg)
}

function cmdClear(configPath: string): void {
  const cfg = readConfigRaw(configPath)
  if (cfg.activeProfile === undefined) {
    console.log("no active profile set")
    return
  }
  const prev = cfg.activeProfile
  delete cfg.activeProfile
  writeConfigRaw(configPath, cfg)
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
  ocmm-profiles use <name>              Set the active profile
  ocmm-profiles show [name]             Print a profile (defaults to active)
  ocmm-profiles add <name> <json-file>  Add/replace a profile from a JSON file
  ocmm-profiles rm <name>               Delete a profile
  ocmm-profiles clear                   Clear activeProfile
  ocmm-profiles current                 Print the active profile name
  ocmm-profiles help                    Show this help

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
