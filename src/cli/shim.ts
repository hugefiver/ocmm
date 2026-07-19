#!/usr/bin/env node
/**
 * ocmm — shim that launches opencode with isolated config.
 *
 * Prevents collision with a globally-installed omo setup by injecting
 * or isolating the opencode config. Merges provider config from the
 * global opencode.json so you don't redefine providers.
 *
 * USAGE:
 *   ocmm [-p <name>] [-n] [--fast] [--mode <m>] [--no-providers] [--no-plugins] [--ocmm-only]
 *        [--config-dir <path>] [--opencode <path-or-name>]
 *        [--keep-omo] [--reset] [-- <opencode args...>]
 *   ocmm --help
 *
 * ISOLATION MODES (--mode, mutually exclusive):
 *   none         No isolation. Injects config via OPENCODE_CONFIG_CONTENT.
 *                Default. Plugins additive — omo cannot be stripped.
 *   inline       Same as none (explicit). OPENCODE_CONFIG_CONTENT env var.
 *   config-file  OPENCODE_CONFIG env var (path to JSON file, uses --config-file)
 *   config-dir   OPENCODE_CONFIG_DIR env var (redirects config dir, uses --config-dir)
 *   xdg          XDG_CONFIG_HOME env var (full isolation, uses --config-dir, can strip plugins)
 *
 * All flags except -p/--profile, --fast, --reset, and --help can also be set in
 * the \`shim\` section of ocmm.json[c]. CLI flags override config values.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { stripJsoncCommentsAndTrailingCommas } from "../config/load.ts"
import type { ShimConfig, IsolationMode } from "../config/schema.ts"

// --- types ---

interface ShimArgs {
  profile?: string
  noProfile: boolean
  fast: boolean
  mode?: IsolationMode
  noProviders: boolean
  noPlugins: boolean
  configDir?: string
  configFile?: string
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

/** Global opencode config dir. Matches opencode's own resolution:
 *  $XDG_CONFIG_HOME/opencode -> ~/.config/opencode on all platforms
 *  (including Windows, per opencode's convention). */
function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return join(xdg, "opencode")
  return join(homedir(), ".config", "opencode")
}

/** Isolated config dir for ocmm-managed opencode. Only config is isolated;
 *  data/state/cache remain at their global opencode locations.
 *  XDG_CONFIG_HOME is set to this dir at spawn time, so opencode resolves
 *  its config path to <isoDir>/opencode/opencode.json. */
function isolatedConfigDir(): string {
  return join(globalConfigDir(), "ocmm-opencode")
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
    resolve(here, "..", "index.ts"),          // src/cli/ -> src/ for node --experimental-strip-types tests
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
    noProfile: false,
    fast: false,
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
      case "--no-profile":
      case "-n":
        args.noProfile = true
        break
      case "--fast":
        args.fast = true
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
      case "--config-file":
        i++
        if (i >= argv.length) {
          console.error("ocmm: --config-file requires a value")
          process.exit(1)
        }
        args.configFile = argv[i]
        break
      case "--mode":
        i++
        if (i >= argv.length) {
          console.error("ocmm: --mode requires a value (none|inline|config-file|config-dir|xdg)")
          process.exit(1)
        }
        {
          const m = argv[i] as IsolationMode
          if (!["none", "inline", "config-file", "config-dir", "xdg"].includes(m)) {
            console.error(`ocmm: invalid --mode '${m}'. Use: none|inline|config-file|config-dir|xdg`)
            process.exit(1)
          }
          args.mode = m
        }
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

export function buildChildEnv(parent: NodeJS.ProcessEnv, args: ShimArgs): NodeJS.ProcessEnv {
  const env = { ...parent }

  if (args.profile) {
    env.OCMM_PROFILE = args.profile
  }
  if (args.noProfile) {
    env.OCMM_NO_PROFILE = "1"
  }
  if (args.fast) {
    env.OCMM_FAST = "1"
  } else {
    delete env.OCMM_FAST
  }

  return env
}

function printHelp(): void {
  console.log(`ocmm — launch opencode with isolated config

USAGE:
  ocmm [-p <name>] [-n] [--fast] [--mode <m>] [--no-providers] [--no-plugins] [--ocmm-only]
        [--config-dir <path>] [--opencode <path-or-name>]
        [--keep-omo] [--reset] [-- <opencode args...>]
  ocmm --help

OCMM FLAGS:
  -p, --profile <name>  Select ocmm profile at startup (sets OCMM_PROFILE)
  -n, --no-profile      Start without loading any profile (overrides activeProfile)
      --fast            Enable fast model routing (requires an allowlisted provider)
      --mode <m>         Isolation method: none|inline|config-file|config-dir|xdg
                         (default: none, or 'shim.mode' in ocmm.jsonc)
      --no-providers     Don't merge providers from global opencode config
      --no-plugins       Don't merge plugins from global opencode config
      --ocmm-only        Shorthand for --no-providers --no-plugins
      --config-dir <p>   Target dir for config-dir/xdg modes
                         (default: ~/.config/opencode/ocmm-opencode/)
      --config-file <p>  Target file for config-file mode
                         (default: <config-dir>/opencode.json)
      --opencode <p>     Path or name of the opencode binary (default: "opencode")
      --keep-omo         Keep the oh-my-openagent plugin (removed by default in xdg mode)
      --reset            Clear isolated dir before starting
  -h, --help             Show this help
  --                     Separator; everything after passes to opencode verbatim

ISOLATION MODES:
  none         No isolation. Injects config via OPENCODE_CONFIG_CONTENT (inline JSON).
               Default. Plugins are additive — omo cannot be stripped.
  inline       Same as none (explicit). OPENCODE_CONFIG_CONTENT env var.
  config-file  OPENCODE_CONFIG env var (path to JSON file, lower merge priority
               than project config). Uses --config-file path.
  config-dir   OPENCODE_CONFIG_DIR env var (redirects config dir, configs additive).
               Uses --config-dir path.
  xdg          XDG_CONFIG_HOME env var (full config isolation, can strip plugins).
               Uses --config-dir path.

PASSTHROUGH:
  All args that are not ocmm flags pass through to opencode verbatim.
  This includes -c/--continue, -s/--session, --model, --agent, run, etc.

  Examples:
    ocmm -p work run "hello"            # profile=work, run with prompt
    ocmm --mode inline run "hello"      # inline config injection
    ocmm --mode config-file -c run "x"  # config-file mode + continue

All flags except -p/--profile, --fast, --reset, and --help can also be set in the \`shim\`
section of ocmm.json[c]. CLI flags override config values.`)
}

/**
 * Read the `shim` section from the global ocmm.json[c] to use as defaults.
 * CLI flags override these; config provides the baseline.
 */
export function readShimDefaults(): Partial<ShimConfig> {
  const dir = globalConfigDir()
  for (const name of ["ocmm.jsonc", "ocmm.json"]) {
    const p = join(dir, name)
    const cfg = readJsonc(p)
    if (cfg && typeof cfg.shim === "object" && cfg.shim !== null) {
      return cfg.shim as Partial<ShimConfig>
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
  const mode: IsolationMode = args.mode ?? defaults.mode ?? "none"
  const isoDir = args.configDir ?? defaults.configDir ?? isolatedConfigDir()
  const isoFile = args.configFile ?? defaults.configFile ?? join(isoDir, "opencode.json")
  const noProviders = args.noProviders || defaults.noProviders || false
  const noPlugins = args.noPlugins || defaults.noPlugins || false
  const keepOmo = args.keepOmo || defaults.keepOmo || false

  if (args.reset && existsSync(isoDir)) {
    rmSync(isoDir, { recursive: true, force: true })
  }

  const config = buildIsolatedConfig({
    mergeProviders: !noProviders,
    mergePlugins: !noPlugins,
    keepOmo,
  })

  const env = buildChildEnv(process.env, args)

  switch (mode) {
    case "none": {
      env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
      break
    }
    case "inline": {
      // OPENCODE_CONFIG_CONTENT: inline JSON, highest merge priority.
      // Plugins are additive — omo cannot be stripped via this method.
      if (!keepOmo) {
        console.error("ocmm: --mode=inline cannot strip oh-my-openagent (plugins are additive). Use --keep-omo or --mode=xdg.")
      }
      env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
      break
    }
    case "config-file": {
      mkdirSync(dirname(isoFile), { recursive: true })
      writeFileSync(isoFile, JSON.stringify(config, null, 2) + "\n", "utf8")
      env.OPENCODE_CONFIG = isoFile
      break
    }
    case "config-dir": {
      // OPENCODE_CONFIG_DIR: redirect config dir, configs are additive.
      mkdirSync(join(isoDir, "opencode"), { recursive: true })
      const configPath = join(isoDir, "opencode", "opencode.json")
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8")
      copyOcmmConfig(join(isoDir, "opencode"))
      env.OPENCODE_CONFIG_DIR = isoDir
      break
    }
    case "xdg": {
      // XDG_CONFIG_HOME: full config isolation, can strip plugins.
      mkdirSync(join(isoDir, "opencode"), { recursive: true })
      const configPath = join(isoDir, "opencode", "opencode.json")
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8")
      copyOcmmConfig(join(isoDir, "opencode"))
      env.XDG_CONFIG_HOME = isoDir
      break
    }
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
