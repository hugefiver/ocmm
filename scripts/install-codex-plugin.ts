/**
 * Install the built ocmm Codex plugin into the local Codex home.
 *
 * Produces a versioned, self-contained snapshot under
 * `<CODEX_HOME>/ocmm-releases/v<version>/`, registers it as the
 * `deepwork-local` marketplace, installs `deepwork@deepwork-local`, and
 * writes the orchestrator developer instructions that `config.toml`'s
 * `model_instructions_file` points at.
 *
 * Usage: node --experimental-strip-types scripts/install-codex-plugin.ts [--dry-run]
 */

import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const projectRoot = resolve(import.meta.dirname, "..")
const codexHome = process.env.CODEX_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".codex")

/** Package-root entries copied into the snapshot. */
const SNAPSHOT_ENTRIES = [
  ".agents",
  ".codex",
  "dist",
  "plugins",
  "README.md",
  "LICENSE",
  "LICENSE.zh.md",
  "LICENSE.bilingual.md",
  "package.json",
] as const

/** Build-time staging directories that must not ship inside the snapshot. */
const EXCLUDED_DIST_DIRS = new Set(["installed-codex-plugin", "package", "release-assets"])

const CONFIG_FILE = join(codexHome, "config.toml")
const RELEASES_DIR = join(codexHome, "ocmm-releases")
const ORCHESTRATOR_TOML = join(".codex", "agents", "dw-orchestrator.toml")
const INSTRUCTIONS_FILE = "dw-orchestrator-system.md"

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as { version?: string }
  if (!pkg.version) throw new Error("package.json has no version")
  return pkg.version
}

function decodeTomlBasicString(raw: string): string {
  const out: string[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!
    if (ch !== "\\") {
      out.push(ch)
      continue
    }
    const next = raw[i + 1]
    i += 1
    switch (next) {
      case "n": out.push("\n"); break
      case "t": out.push("\t"); break
      case "r": out.push("\r"); break
      case "b": out.push("\b"); break
      case "f": out.push("\f"); break
      case '"': out.push('"'); break
      case "\\": out.push("\\"); break
      case "u": out.push(String.fromCharCode(Number.parseInt(raw.slice(i + 1, i + 5), 16))); i += 4; break
      case "U": out.push(String.fromCodePoint(Number.parseInt(raw.slice(i + 1, i + 9), 16))); i += 8; break
      default: throw new Error(`unsupported TOML escape \\${next}`)
    }
  }
  return out.join("")
}

/** Extract the TOML basic string assigned to `developer_instructions`. */
function extractDeveloperInstructions(tomlPath: string): string {
  const text = readFileSync(tomlPath, "utf8")
  const marker = 'developer_instructions = "'
  const start = text.indexOf(marker)
  if (start < 0) throw new Error(`no developer_instructions in ${tomlPath}`)
  const bodyStart = start + marker.length
  let i = bodyStart
  while (i < text.length) {
    if (text[i] === "\\") { i += 2; continue }
    if (text[i] === '"') break
    i += 1
  }
  if (i >= text.length) throw new Error(`unterminated developer_instructions in ${tomlPath}`)
  return decodeTomlBasicString(text.slice(bodyStart, i))
}

function buildSnapshot(version: string): string {
  const target = join(RELEASES_DIR, `v${version}`)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })

  for (const entry of SNAPSHOT_ENTRIES) {
    const source = join(projectRoot, entry)
    if (!existsSync(source)) throw new Error(`missing snapshot entry: ${entry} (run the build first)`)
    cpSync(source, join(target, entry), {
      recursive: true,
      filter: (src) => {
        const rel = src.slice(join(projectRoot, "dist").length).replaceAll("\\", "/")
        if (!src.startsWith(join(projectRoot, "dist"))) return true
        const head = rel.split("/").filter(Boolean)[0]
        return head === undefined || !EXCLUDED_DIST_DIRS.has(head)
      },
    })
  }

  const orchestratorToml = join(target, ORCHESTRATOR_TOML)
  if (!existsSync(orchestratorToml)) throw new Error(`generated bundle is missing ${ORCHESTRATOR_TOML}`)
  writeFileSync(join(target, INSTRUCTIONS_FILE), extractDeveloperInstructions(orchestratorToml), "utf8")
  return target
}

function run(command: string, args: string[], opts?: { allowFailure?: boolean }): void {
  // Inherited stdio keeps this usable under file sandboxes that block piped stdio.
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0 && !opts?.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`)
  }
}

const dryRun = process.argv.includes("--dry-run")
const version = readVersion()
const snapshot = join(RELEASES_DIR, `v${version}`)
console.log(`ocmm ${version} -> ${snapshot}`)

if (dryRun) {
  console.log("dry run: snapshot, marketplace registration, and install skipped")
  process.exit(0)
}

const built = buildSnapshot(version)
console.log(`snapshot built: ${built}`)

if (existsSync(CONFIG_FILE) && !existsSync(join(built, "config.before-install.toml"))) {
  cpSync(CONFIG_FILE, join(built, "config.before-install.toml"))
  console.log("backed up config.toml into the snapshot")
}

run("codex", ["plugin", "marketplace", "remove", "deepwork-local"], { allowFailure: true })
run("codex", ["plugin", "marketplace", "add", built, "--json"])
run("codex", ["plugin", "add", "deepwork@deepwork-local", "--json"])

const config = readFileSync(CONFIG_FILE, "utf8")
const instructionsPath = join(built, INSTRUCTIONS_FILE)
const next = /model_instructions_file\s*=\s*'[^']*'/.test(config)
  ? config.replace(/model_instructions_file\s*=\s*'[^']*'/, `model_instructions_file = '${instructionsPath}'`)
  : `${config.trimEnd()}\nmodel_instructions_file = '${instructionsPath}'\n`
if (next !== config) {
  writeFileSync(CONFIG_FILE, next, "utf8")
  console.log(`model_instructions_file -> ${instructionsPath}`)
}
console.log("done")
