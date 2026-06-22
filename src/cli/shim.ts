#!/usr/bin/env node
/**
 * ocmm — shim that launches opencode with isolated config/state dirs.
 *
 * Prevents collision with a globally-installed omo setup by redirecting
 * all XDG paths into a dedicated directory. Merges provider config from
 * the global opencode.json so you don't redefine providers.
 *
 * USAGE:
 *   ocmm [-p <name>] [--no-providers] [--no-plugins] [--ocmm-only]
 *        [--config-dir <path>] [--opencode <path-or-name>]
 *        [--keep-omo] [--reset] [-- <opencode args...>]
 *   ocmm --help
 *
 * OCMM FLAGS:
 *   -p, --profile <name> Select ocmm profile at startup (sets OCMM_PROFILE)
 *   --no-providers      Don't merge providers from global opencode config
 *   --no-plugins        Don't merge plugins from global opencode config (ocmm only)
 *   --ocmm-only         Shorthand for --no-providers --no-plugins
 *   --config-dir <path> Use a custom isolated dir instead of the default
 *   --opencode <path>   Path or name of the opencode binary to launch (default: "opencode")
 *   --keep-omo          Keep the oh-my-openagent plugin from global config (removed by default)
 *   --reset             Clear isolated dir before starting (fresh state)
 *   --help, -h          Show this help
 *   --                  Separator; everything after passes to opencode verbatim
 *
 * PASSTHROUGH:
 *   All args that are not ocmm flags pass through to opencode verbatim.
 *   This includes -c/--continue, -s/--session, --model, --agent, run, etc.
 *
 * ISOLATED DIR:
 *   $XDG_DATA_HOME/ocmm-opencode/   (or ~/.local/share/ocmm-opencode/)
 *   --config-dir overrides this location entirely.
 *     opencode/   <- opencode.json + ocmm.jsonc (copied from global)
 *     data/
 *     state/
 *     cache/
 *
 * PROVIDER MERGE:
 *   Reads the global opencode.json and merges these fields into the
 *   isolated opencode.json:
 *     - provider          (merged, user config wins)
 *     - disabled_providers (concatenated, deduped)
 *     - agent              (compaction/title models, shallow merge)
 *   Plugins from global config are kept unless --no-plugins is given.
 *   The oh-my-openagent plugin is removed by default to avoid collision
 *   with ocmm; use --keep-omo to retain it.
 *   The ocmm plugin is always added (resolved relative to this binary).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"
import type { ShimConfig } from "../config/schema.ts"

// --- types ---

interface ShimArgs {
  profile?: string
  noProviders: boolean
  noPlugins: boolean
  configDir?: string
  opencodeBin?: string
  keepOmo: boolean
  reset: boolean
  help: boolean
  passthrough: string[]
}

/** Plugin names that are stripped from the merged plugin list by default
 *  to avoid collision with ocmm. Currently just the omo extension. */
const DEFAULT_STRIPPED_PLUGINS = ["oh-my-openagent"]

interface OpencodeConfig {
  provider?: Record<string, unknown>
  disabled_providers?: string[]
  plugin?: string[]
  agent?: Record<string, unknown>
  compaction?: Record<string, unknown>
  [key: string]: unknown
}

// --- path helpers ---

function xdgDataHome(): string {
  const xdg = process.env.XDG_DATA_HOME
  if (xdg) return xdg
  if (platform() === "win32") {
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) return join(localAppData, "Data")
  }
  return join(homedir(), ".local", "share")
}

function isolatedDir(): string {
  return join(xdgDataHome(), "ocmm-opencode")
}

function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "opencode")
  if (platform() === "win32") {
    const appData = process.env.APPDATA
    if (appData) return join(appData, "opencode")
  }
  return join(homedir(), ".config", "opencode")
}

// --- config helpers ---

function readJsonc(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  const text = readFileSync(path, "utf8")
  try {
    return JSON.parse(stripJsoncCommentsAndTrailingCommas(text)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Resolve the ocmm plugin path relative to this binary.
 * In dev: dist/cli/shim.js -> ../../index.js (dist/index.js)
 * In published package: dist/cli/shim.js -> ../index.js (dist/index.js)
 */
export function resolvePluginPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, "..", "index.js"),          // dist/cli/ -> dist/
    resolve(here, "..", "..", "index.js"),     // dist/cli/ -> root -> dist/
    resolve(here, "..", "..", "dist", "index.js"), // src/cli/ -> root -> dist/
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return resolve(here, "..", "index.js")
}

/**
 * Read the global opencode.json and extract fields to merge.
 */
function readGlobalOpencodeConfig(): OpencodeConfig | null {
  const dir = globalConfigDir()
  for (const name of ["opencode.json", "opencode.jsonc"]) {
    const p = join(dir, name)
    const cfg = readJsonc(p)
    if (cfg) return cfg as unknown as OpencodeConfig
  }
  return null
}

/**
 * Build the isolated opencode.json by merging from global config.
 */
export function buildIsolatedConfig(opts: {
  mergeProviders: boolean
  mergePlugins: boolean
  keepOmo?: boolean
}): OpencodeConfig {
  const out: OpencodeConfig = {}
  const global = readGlobalOpencodeConfig()

  if (global) {
    if (opts.mergeProviders) {
      if (global.provider) out.provider = { ...global.provider }
      if (global.disabled_providers) out.disabled_providers = [...global.disabled_providers]
      if (global.agent) out.agent = { ...global.agent }
    }
    if (opts.mergePlugins && global.plugin) {
      let plugins = [...global.plugin]
      if (!opts.keepOmo) {
        plugins = plugins.filter((p) => !isStrippedPlugin(p))
      }
      out.plugin = plugins
    }
    // Always carry compaction settings (they're orthogonal to providers)
    if (global.compaction) out.compaction = { ...global.compaction }
  }

  // Always add the ocmm plugin
  const pluginPath = resolvePluginPath()
  if (!out.plugin) out.plugin = []
  if (!out.plugin.includes(pluginPath)) {
    out.plugin.push(pluginPath)
  }

  return out
}

/**
 * Check if a plugin entry matches a stripped plugin name.
 * Handles bare names, scoped names, and name@version specifiers.
 */
function isStrippedPlugin(pluginEntry: string): boolean {
  // Strip @version suffix: "oh-my-openagent@latest" -> "oh-my-openagent"
  const baseName = pluginEntry.replace(/@[^/]+$/, "").replace(/^@[^/]+\//, "")
  return DEFAULT_STRIPPED_PLUGINS.some((stripped) => {
    return baseName === stripped || pluginEntry.startsWith(stripped + "@")
  })
}

/**
 * Copy the global ocmm.json[c] into the isolated config dir so that
 * ocmm can read profile/agent settings. If none exists, create a minimal
 * one with workflow: "v1" as the default.
 */
function copyOcmmConfig(isolatedConfigDir: string): void {
  const globalDir = globalConfigDir()
  for (const name of ["ocmm.jsonc", "ocmm.json"]) {
    const src = join(globalDir, name)
    if (existsSync(src)) {
      copyFileSync(src, join(isolatedConfigDir, name))
      return
    }
  }
  // No global ocmm config — create a minimal default
  const defaultConfig = {
    workflow: "v1",
    agents: {},
    categories: {},
  }
  const dst = join(isolatedConfigDir, "ocmm.jsonc")
  writeFileSync(dst, JSON.stringify(defaultConfig, null, 2) + "\n", "utf8")
}

// --- arg parsing ---

export function parseArgs(argv: string[]): ShimArgs {
  const args: ShimArgs = {
    noProviders: false,
    noPlugins: false,
    keepOmo: false,
    reset: false,
    help: false,
    passthrough: [],
  }

  let i = 0
  let seenSeparator = false

  while (i < argv.length) {
    const arg = argv[i]!

    if (seenSeparator) {
      args.passthrough.push(arg)
      i++
      continue
    }

    switch (arg) {
      case "--":
        seenSeparator = true
        break
      case "--help":
      case "-h":
        args.help = true
        break
      case "--profile":
      case "-p":
        i++
        if (i >= argv.length) {
          console.error("ocmm: --profile requires a value")
          process.exit(1)
        }
        args.profile = argv[i]
        break
      case "--no-providers":
        args.noProviders = true
        break
      case "--no-plugins":
        args.noPlugins = true
        break
      case "--ocmm-only":
        args.noProviders = true
        args.noPlugins = true
        break
      case "--config-dir":
        i++
        if (i >= argv.length) {
          console.error("ocmm: --config-dir requires a value")
          process.exit(1)
        }
        args.configDir = argv[i]
        break
      case "--opencode":
        i++
        if (i >= argv.length) {
          console.error("ocmm: --opencode requires a value")
          process.exit(1)
        }
        args.opencodeBin = argv[i]
        break
      case "--keep-omo":
        args.keepOmo = true
        break
      case "--reset":
        args.reset = true
        break
      default:
        args.passthrough.push(arg)
        break
    }
    i++
  }

  return args
}

function printHelp(): void {
  console.log(`ocmm — launch opencode with isolated config

USAGE:
  ocmm [-p <name>] [--no-providers] [--no-plugins] [--ocmm-only]
        [--config-dir <path>] [--opencode <path-or-name>]
        [--keep-omo] [--reset] [-- <opencode args...>]
  ocmm --help

OCMM FLAGS:
  -p, --profile <name>  Select ocmm profile at startup (sets OCMM_PROFILE)
      --no-providers    Don't merge providers from global opencode config
      --no-plugins      Don't merge plugins from global opencode config (ocmm only)
      --ocmm-only       Shorthand for --no-providers --no-plugins
      --config-dir <p>  Use a custom isolated dir instead of the default
      --opencode <p>    Path or name of the opencode binary (default: "opencode")
      --keep-omo        Keep the oh-my-openagent plugin (removed by default)
      --reset           Clear isolated dir before starting (fresh state)
  -h, --help             Show this help
  --                     Separator; everything after passes to opencode verbatim

PASSTHROUGH:
  All args that are not ocmm flags are passed through to opencode verbatim.
  This includes -c/--continue, -s/--session, --model, --agent, run, etc.
  Use -- to explicitly separate ocmm flags from opencode args.

  Examples:
    ocmm -p work run "hello"           # profile=work, run with prompt
    ocmm -c run "continue this"        # continue last session
    ocmm -p work -c                    # profile + continue
    ocmm -- run --model hoo/glm-5.2   # explicit separator

ISOLATED DIR:
  ${isolatedDir()}/
    opencode/   opencode.json + ocmm.jsonc
    data/
    state/
    cache/

The oh-my-openagent (omo) plugin is stripped from the global config by default
to avoid collision with ocmm. Use --keep-omo to retain it.

All flags except -p/--profile, --reset, and --help can also be set in the \`shim\`
section of ocmm.json[c]. CLI flags override config values.`)
}

/**
 * Read the `shim` section from the global ocmm.json[c] to use as defaults.
 * CLI flags override these; config provides the baseline.
 */
export function readShimDefaults(): ShimConfig {
  const dir = globalConfigDir()
  for (const name of ["ocmm.jsonc", "ocmm.json"]) {
    const p = join(dir, name)
    const cfg = readJsonc(p)
    if (cfg && typeof cfg.shim === "object" && cfg.shim !== null) {
      return cfg.shim as ShimConfig
    }
  }
  return {}
}

// --- main ---

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    return
  }

  const defaults = readShimDefaults()

  const isoDir = args.configDir ?? defaults.configDir ?? isolatedDir()

  // --reset: wipe the isolated dir
  if (args.reset && existsSync(isoDir)) {
    rmSync(isoDir, { recursive: true, force: true })
  }

  // Create subdirs. XDG_CONFIG_HOME=isoDir so opencode finds isoDir/opencode/opencode.json
  const ocConfigDir = join(isoDir, "opencode")
  const dataDir = join(isoDir, "data")
  const stateDir = join(isoDir, "state")
  const cacheDir = join(isoDir, "cache")
  for (const d of [ocConfigDir, dataDir, stateDir, cacheDir]) {
    mkdirSync(d, { recursive: true })
  }

  const noProviders = args.noProviders || defaults.noProviders || false
  const noPlugins = args.noPlugins || defaults.noPlugins || false
  const keepOmo = args.keepOmo || defaults.keepOmo || false

  const config = buildIsolatedConfig({
    mergeProviders: !noProviders,
    mergePlugins: !noPlugins,
    keepOmo,
  })
  const configPath = join(ocConfigDir, "opencode.json")
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8")

  copyOcmmConfig(ocConfigDir)

  // Set XDG env vars
  const env = { ...process.env }
  env.XDG_CONFIG_HOME = isoDir
  env.XDG_DATA_HOME = dataDir
  env.XDG_STATE_HOME = stateDir
  env.XDG_CACHE_HOME = cacheDir

  // Set OCMM_PROFILE if given
  if (args.profile) {
    env.OCMM_PROFILE = args.profile
  }

  const opencodeBin = args.opencodeBin ?? defaults.opencode ?? "opencode"
  const child = spawn(opencodeBin, args.passthrough, {
    stdio: "inherit",
    env,
    shell: platform() === "win32",
  })

  child.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`ocmm: '${opencodeBin}' not found in PATH. Install opencode first.`)
      console.error("  https://opencode.ai/docs/")
      console.error("  Or use --opencode <path> to specify a custom location.")
    } else {
      console.error(`ocmm: ${err.message}`)
    }
    process.exit(1)
  })

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
    } else {
      process.exit(code ?? 1)
    }
  })
}

// Only run main() when executed directly, not when imported as a module.
const _entryUrl = fileURLToPath(import.meta.url)
const _isDirectRun =
  process.argv[1] === _entryUrl ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("dist/cli/shim.js") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("src/cli/shim.ts")

if (_isDirectRun) {
  main()
}
