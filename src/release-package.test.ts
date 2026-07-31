import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { normalizeOcmmPackage } from "../scripts/normalize-ocmm-package.ts"

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const CODING_AGENT_RUNTIME_FILES = [
  "SKILL.md",
  "LICENSE-UPSTREAM.md",
  "NOTICE.md",
  "agents/openai.yaml",
  "references/all-platforms.md",
  "references/claude.md",
  "references/codex.md",
  "references/opencode.md",
  "references/senpi.md",
  "scripts/find-agent-sessions.py",
  "scripts/agent_sessions/__init__.py",
  "scripts/agent_sessions/aside_scanner.py",
  "scripts/agent_sessions/claude.py",
  "scripts/agent_sessions/cli.py",
  "scripts/agent_sessions/codex.py",
  "scripts/agent_sessions/file_scanners.py",
  "scripts/agent_sessions/jsonio.py",
  "scripts/agent_sessions/kiro_scanner.py",
  "scripts/agent_sessions/opencode.py",
  "scripts/agent_sessions/pi_family.py",
  "scripts/agent_sessions/scanners.py",
  "scripts/agent_sessions/sqlite_optional_scanners.py",
  "scripts/agent_sessions/sqlite_scanners.py",
  "scripts/agent_sessions/timeparse.py",
  "scripts/agent_sessions/transcript.py",
  "scripts/agent_sessions/types.py",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}

function sanitizedNpmFailure(error: Error | undefined, stderr: string): string {
  const details = [error?.message, stderr].filter((value): value is string => Boolean(value)).join("\n")
  const sanitized = details
    .replace(/\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/((?:["']?(?:credential|token|password|secret|authorization|api[-_]?key)["']?)\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
  return (sanitized || "(no executable error or stderr captured)").slice(0, 2048)
}

test("npm pack failure diagnostics redact credentials and cap output", () => {
  const failure = sanitizedNpmFailure(
    new Error("api-key=error-secret"),
    `authorization: Bearer stderr-secret\npassword: "password-secret"\n${"x".repeat(4096)}`,
  )
  assert.doesNotMatch(failure, /error-secret|stderr-secret|password-secret/i)
  assert.match(failure, /\[REDACTED\]/)
  assert.ok(failure.length <= 2048)
})

function npmPackDryRun(root: string): string[] {
  assert.notEqual(resolve(root), resolve(process.cwd()), "npm pack dry-run must run outside the source workspace")
  const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  assert.ok(isRecord(manifest), "npm pack fixture must have an object package manifest")
  for (const field of ["devEngines", "workspaces", "dependencies", "optionalDependencies"] as const) {
    assert.equal(field in manifest, false, `npm pack fixture manifest must omit ${field}`)
  }
  assert.equal(JSON.stringify(manifest).includes("workspace:"), false, "npm pack fixture manifest must omit workspace: specs")
  const artifactsBefore = packageArtifacts(root)
  const executable = process.platform === "win32" ? "npm.cmd" : "npm"
  const args = ["pack", "--dry-run", "--json", "--ignore-scripts"]
  const result = spawnSync(process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : executable, process.platform === "win32"
    ? ["/d", "/s", "/c", executable, ...args]
    : args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  })
  const stderr = result.stderr ?? ""
  const failure = sanitizedNpmFailure(result.error, stderr)
  assert.deepEqual(packageArtifacts(root), artifactsBefore, "npm pack dry-run must not create a tarball")
  assert.equal(result.error, undefined, `npm executable must be available:\n${failure}`)
  assert.equal(result.status, 0, `npm pack dry-run failed:\n${failure}`)

  let payload: unknown
  try {
    payload = JSON.parse(result.stdout)
  } catch {
    assert.fail("npm pack dry-run must return JSON")
  }
  assert.ok(Array.isArray(payload) && payload.length === 1, "npm pack dry-run must return one package result")
  const [pack] = payload
  assert.ok(isRecord(pack) && Array.isArray(pack.files), "package result must contain files")
  return pack.files.map((entry: unknown) => {
    assert.ok(isRecord(entry) && typeof entry.path === "string", "pack file must have a path")
    const path = entry.path
    return path.startsWith("package/") ? path.slice("package/".length) : path
  })
}

function packageArtifacts(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => entry.name)
    .sort()
}

function inventoryUnderPrefix(files: readonly string[], prefix: string): string[] {
  const start = `${prefix}/`
  return files.filter((path) => path.startsWith(start)).map((path) => path.slice(start.length)).sort()
}

function assertNoDevelopmentFiles(files: readonly string[], prefix: string): void {
  const developmentFiles = inventoryUnderPrefix(files, prefix).filter((path) =>
    path === ".gitignore"
    || path === ".npmignore"
    || path === "pyrightconfig.json"
    || path.startsWith("scripts/tests/")
    || /(?:^|\/)(?:__pycache__|\.mypy_cache|\.pytest_cache|\.ruff_cache)(?:\/|$)/.test(path)
    || /\.py[cod]$/i.test(path),
  )
  assert.deepEqual(developmentFiles, [], `${prefix} must exclude development-only files`)
}

test("normalizeOcmmPackage stages the deepwork Codex bundle and omits npm binaries", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-release-package-"))
  try {
    writeJson(join(root, "package.json"), {
      name: "ocmm",
      version: "9.9.9",
      type: "module",
      optionalDependencies: {},
      ocmm: { lspVersion: "1.2.3" },
      devEngines: { packageManager: { name: "pnpm" } },
    })
    mkdirSync(join(root, ".agents", "plugins"), { recursive: true })
    writeJson(join(root, ".agents", "plugins", "marketplace.json"), { name: "deepwork-local", plugins: [] })
    mkdirSync(join(root, ".codex", "agents"), { recursive: true })
    writeFileSync(join(root, ".codex", "agents", "dw-plan-critic.toml"), "name = \"dw-plan-critic\"\n")
    mkdirSync(join(root, "dist", "bin"), { recursive: true })
    writeFileSync(join(root, "dist", "index.js"), "export {}\n")
    writeFileSync(join(root, "dist", "bin", "ocmm-lsp-test"), "binary\n")
    mkdirSync(join(root, "plugins", "deepwork", ".codex-plugin"), { recursive: true })
    mkdirSync(join(root, "plugins", "deepwork", "dist", "bin"), { recursive: true })
    writeJson(join(root, "plugins", "deepwork", ".codex-plugin", "plugin.json"), {
      name: "deepwork",
      version: "9.9.9",
    })
    writeJson(join(root, "plugins", "deepwork", "package.json"), {
      name: "deepwork-codex-plugin-runtime",
      version: "9.9.9",
      type: "module",
    })
    writeFileSync(join(root, "plugins", "deepwork", "dist", "bin", "ocmm-lsp-test"), "binary\n")

    const result = normalizeOcmmPackage({ root, outputRoot: "out" })

    assert.equal(existsSync(join(result.githubPackageDir, "dist", "bin", "ocmm-lsp-test")), true)
    assert.equal(existsSync(join(result.githubPackageDir, ".codex", "agents", "dw-plan-critic.toml")), true)
    assert.equal(existsSync(join(result.codexPackageDir, "plugins", "deepwork", "dist", "bin", "ocmm-lsp-test")), true)
    assert.equal(existsSync(join(result.codexPackageDir, ".codex", "agents", "dw-plan-critic.toml")), true)
    assert.equal(existsSync(join(result.codexPackageDir, "plugins", "ocmm")), false)
    assert.equal(existsSync(join(result.npmPackageDir, "dist", "bin")), false)
    assert.equal(existsSync(join(result.npmPackageDir, "plugins", "deepwork", "dist", "bin")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("npm pack dry-run emits exact canonical coding-agent session inventories", () => {
  assert.equal(CODING_AGENT_RUNTIME_FILES.length, 26)
  const root = mkdtempSync(join(tmpdir(), "ocmm-coding-agent-sessions-pack-"))
  try {
    writeJson(join(root, "package.json"), {
      name: "ocmm-coding-agent-sessions-inventory-fixture",
      version: "0.0.0",
      private: true,
      files: ["skills", "plugins"],
    })
    for (const path of ["skills/coding-agent-sessions", "plugins/deepwork/skills/coding-agent-sessions"]) {
      cpSync(join(process.cwd(), path), join(root, path), { recursive: true })
    }

    const files = npmPackDryRun(root)
    const expected = [...CODING_AGENT_RUNTIME_FILES].sort()
    for (const prefix of ["skills/coding-agent-sessions", "plugins/deepwork/skills/coding-agent-sessions"]) {
      const inventory = inventoryUnderPrefix(files, prefix)
      assert.deepEqual(inventory, expected, `${prefix} exact runtime inventory`)
      assertNoDevelopmentFiles(files, prefix)
      for (const required of ["LICENSE-UPSTREAM.md", "NOTICE.md", "scripts/find-agent-sessions.py", "scripts/agent_sessions/cli.py"] as readonly string[]) {
        assert.ok((inventory as readonly string[]).includes(required), `${prefix} must include ${required}`)
      }
    }
    assert.deepEqual(packageArtifacts(root), [], "temporary pack fixture must not contain tarballs")
  } finally {
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false, "temporary pack fixture must be removed")
  }
})
