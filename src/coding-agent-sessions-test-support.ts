import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { basename, delimiter, dirname, isAbsolute, join, relative } from "node:path"

const SOURCE_SKILL_ROOT = join(process.cwd(), "skills", "coding-agent-sessions")
const FINDER = join(SOURCE_SKILL_ROOT, "scripts", "find-agent-sessions.py")
const FIXTURE_SENTINEL = "OCMM_FIXTURE_SENTINEL_MUST_NOT_LEAK"
const CREDENTIAL_ENV = /API_KEY|TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL/i
const SANDBOX_ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_CACHE_HOME",
  "CODEX_HOME",
  "OPENCODE_HOME",
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_DIR",
] as const

export type JsonMap = Record<string, unknown>

function resolvePythonExecutable(): string {
  if (process.platform !== "win32") return "python"
  const pathDirectories = (process.env.PATH ?? "").split(delimiter).filter((value) => value !== "")
  const direct = pathDirectories.map((directory) => join(directory, "python.exe")).find(existsSync)
  if (direct) return direct
  for (const shim of pathDirectories) {
    if (basename(shim).toLowerCase() !== "shims" || !existsSync(join(shim, "python.bat"))) continue
    const versions = join(dirname(shim), "versions")
    if (!existsSync(versions)) continue
    for (const entry of readdirSync(versions, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const executable = join(versions, entry.name, "python.exe")
      if (entry.isDirectory() && existsSync(executable)) return executable
    }
  }
  throw new Error("A direct Python executable is required; Windows batch shims cannot be spawned without a shell")
}

const PYTHON = resolvePythonExecutable()

export function assertSandboxedChildEnv(sandbox: string, env: NodeJS.ProcessEnv): void {
  assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined)
  for (const [key, value] of Object.entries(env)) {
    assert.equal(CREDENTIAL_ENV.test(key), false, `${key} must not reach a child process`)
    assert.notEqual(value, undefined)
  }
  for (const key of SANDBOX_ENV_KEYS) {
    const value = env[key]
    assert.ok(value, `${key} must be set`)
    const delta = relative(sandbox, value)
    assert.equal(delta === "" || (!delta.startsWith("..") && !isAbsolute(delta)), true, `${key} escaped sandbox`)
  }
}

export function sanitizedChildEnv(sandbox: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (key.toUpperCase() !== "OPENCODE_CONFIG_CONTENT" && value !== undefined && !CREDENTIAL_ENV.test(key)) {
      env[key] = value
    }
  }
  for (const key of SANDBOX_ENV_KEYS) {
    const value = key === "OPENCODE_CONFIG" ? join(sandbox, "opencode.json") : join(sandbox, key.toLowerCase())
    if (key !== "OPENCODE_CONFIG") mkdirSync(value, { recursive: true })
    env[key] = value
  }
  const processTemp = join(sandbox, "process-temp")
  mkdirSync(processTemp, { recursive: true })
  env.TEMP = processTemp
  env.TMP = processTemp
  env.OCMM_TEST_FIXTURE_SENTINEL = FIXTURE_SENTINEL
  env.PYTHONDONTWRITEBYTECODE = "1"
  env.PYTHONNOUSERSITE = "1"
  env.PYTHONUTF8 = "1"
  env.TZ = "UTC"
  delete env.OPENCODE_CONFIG_CONTENT
  assertSandboxedChildEnv(sandbox, env)
  return env
}

export function cleanupSandbox(sandbox: string): void {
  rmSync(sandbox, { recursive: true, force: true })
  assert.equal(existsSync(sandbox), false, "sandbox must be removed")
}

function parsePayload(stdout: string): JsonMap {
  const value: unknown = JSON.parse(stdout)
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as JsonMap
}

function assertSafeChildOutput(stdout: string, stderr: string): void {
  const output = `${stdout}\n${stderr}`
  assert.doesNotMatch(output, new RegExp(FIXTURE_SENTINEL))
  assert.doesNotMatch(output, /api[_-]?key|bearer\s|password|credential/i)
}

export function runPythonInline(sandbox: string, script: string, args: string[]): void {
  const result = spawnSync(PYTHON, ["-B", "-c", script, ...args], {
    env: sanitizedChildEnv(sandbox),
    encoding: "utf8",
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "")
  assertSafeChildOutput(result.stdout, result.stderr)
}

export function runFinder(sandbox: string, root: string, platform: string, args: string[]): JsonMap {
  const result = spawnSync(PYTHON, ["-B", FINDER, ...args, "--root", root, "--platform", platform], {
    cwd: SOURCE_SKILL_ROOT,
    env: sanitizedChildEnv(sandbox),
    encoding: "utf8",
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assertSafeChildOutput(result.stdout, result.stderr)
  return parsePayload(result.stdout)
}

export function runFinderFailure(sandbox: string, root: string, platform: string, args: string[]): { status: number; stderr: string } {
  const result = spawnSync(PYTHON, ["-B", FINDER, ...args, "--root", root, "--platform", platform], {
    cwd: SOURCE_SKILL_ROOT,
    env: sanitizedChildEnv(sandbox),
    encoding: "utf8",
    windowsHide: true,
  })
  assert.notEqual(result.status, 0)
  assertSafeChildOutput(result.stdout, result.stderr)
  return { status: result.status ?? -1, stderr: result.stderr }
}

export function jsonMap(value: unknown): JsonMap {
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return value as JsonMap
}

export function rows(payload: JsonMap, key = "results"): JsonMap[] {
  const value = payload[key]
  assert.ok(Array.isArray(value), `${key} must be an array`)
  return value.map(jsonMap)
}

export function writeJsonl(path: string, values: JsonMap[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`)
}

export function writeJson(path: string, value: JsonMap): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

export const ASIDE_DB_SCRIPT = [
  "import sqlite3, sys",
  "db, parent, child = sys.argv[1:4]",
  "model = '{\"provider\":\"fixture-provider\",\"modelId\":\"fixture-model\"}'",
  "with sqlite3.connect(db) as conn:",
  " conn.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT NOT NULL, cwd TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)')",
  " conn.executemany('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)', [(parent, None, 'Ambassador research', 'C:/fixture/aside', model, 1785295598, 1785377046), (child, parent, 'Check settings context', 'C:/fixture/aside', model, 1785295600, 1785295700)])",
].join("\n")
