import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { execFileSync } from "node:child_process"

function makeTempXdg(): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-cli-test-"))
  mkdirSync(join(root, "opencode"), { recursive: true })
  return root
}

function writeConfig(xdg: string, raw: unknown): void {
  writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), JSON.stringify(raw, null, 2))
}

function readConfig(xdg: string): Record<string, unknown> {
  const text = readFileSync(join(xdg, "opencode", "ocmm.jsonc"), "utf8")
  return JSON.parse(text) as Record<string, unknown>
}

function runCli(xdg: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", join(process.cwd(), "src", "cli", "profiles.ts"), ...args],
      {
        env: { ...process.env, XDG_CONFIG_HOME: xdg },
        encoding: "utf8",
      },
    )
    return { stdout, stderr: "", exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? 1 }
  }
}

test("list shows profiles with * on active", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      profiles: { light: {}, heavy: {} },
      activeProfile: "heavy",
    })
    const { stdout, exitCode } = runCli(xdg, ["list"])
    assert.equal(exitCode, 0)
    const lines = stdout.trim().split("\n")
    assert.ok(lines.some((l) => l.includes("light") && !l.includes("*")))
    assert.ok(lines.some((l) => l.includes("heavy") && l.includes("*")))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("list with no profiles prints placeholder", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const { stdout, exitCode } = runCli(xdg, ["list"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("(no profiles defined)"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("use sets activeProfile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { a: {}, b: {} }, activeProfile: "a" })
    const { exitCode, stdout } = runCli(xdg, ["use", "b"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('active profile set to "b"'))
    const cfg = readConfig(xdg)
    assert.equal(cfg.activeProfile, "b")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("use fails on nonexistent profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { a: {} } })
    const { exitCode, stderr } = runCli(xdg, ["use", "nonexistent"])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes('does not exist'))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("show prints active profile by default", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      profiles: { a: { debug: true } },
      activeProfile: "a",
    })
    const { stdout, exitCode } = runCli(xdg, ["show"])
    assert.equal(exitCode, 0)
    const parsed = JSON.parse(stdout)
    assert.equal(parsed.name, "a")
    assert.equal(parsed.active, true)
    assert.equal(parsed.config.debug, true)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("show prints named profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      profiles: { a: { debug: true }, b: { debug: false } },
      activeProfile: "a",
    })
    const { stdout, exitCode } = runCli(xdg, ["show", "b"])
    assert.equal(exitCode, 0)
    const parsed = JSON.parse(stdout)
    assert.equal(parsed.name, "b")
    assert.equal(parsed.active, false)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add creates a new profile from JSON file", () => {
  const xdg = makeTempXdg()
  const jsonFile = join(xdg, "profile.json")
  try {
    writeFileSync(jsonFile, JSON.stringify({ agents: { orchestrator: { model: "hoo/glm-5.2" } } }))
    // No existing config — add should create one.
    const { exitCode, stdout } = runCli(xdg, ["add", "gpu", jsonFile])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('profile "gpu" added'))
    const cfg = readConfig(xdg)
    assert.ok(cfg.profiles && typeof cfg.profiles === "object")
    const gpuProfile = (cfg.profiles as Record<string, unknown>).gpu as Record<string, unknown>
    assert.deepEqual(gpuProfile.agents, { orchestrator: { model: "hoo/glm-5.2" } })
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add validates profile schema and rejects invalid", () => {
  const xdg = makeTempXdg()
  const jsonFile = join(xdg, "bad.json")
  try {
    writeConfig(xdg, {})
    // Invalid: profiles and activeProfile are not allowed in a profile entry.
    writeFileSync(jsonFile, JSON.stringify({ profiles: { nested: {} }, activeProfile: "nested" }))
    const { exitCode, stderr } = runCli(xdg, ["add", "bad", jsonFile])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes("profile JSON invalid"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("rm deletes a profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { a: {}, b: {} } })
    const { exitCode, stdout } = runCli(xdg, ["rm", "a"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('removed profile "a"'))
    const cfg = readConfig(xdg)
    assert.ok(!((cfg.profiles as Record<string, unknown>).a))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("rm clears activeProfile if it was the active one", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { a: {} }, activeProfile: "a" })
    const { exitCode, stdout } = runCli(xdg, ["rm", "a"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("activeProfile cleared"))
    const cfg = readConfig(xdg)
    assert.equal(cfg.activeProfile, undefined)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("clear removes activeProfile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { a: {} }, activeProfile: "a" })
    const { exitCode, stdout } = runCli(xdg, ["clear"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('cleared active profile'))
    const cfg = readConfig(xdg)
    assert.equal(cfg.activeProfile, undefined)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("clear is a no-op when no active profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const { exitCode, stdout } = runCli(xdg, ["clear"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("no active profile set"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("current prints active profile name", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { a: {} }, activeProfile: "a" })
    const { stdout, exitCode } = runCli(xdg, ["current"])
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), "a")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("current prints empty when no active profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const { stdout, exitCode } = runCli(xdg, ["current"])
    assert.equal(exitCode, 0)
    assert.equal(stdout.trim(), "")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("help prints usage", () => {
  const { stdout, exitCode } = runCli(makeTempXdg(), ["help"])
  assert.equal(exitCode, 0)
  assert.ok(stdout.includes("USAGE:"))
  assert.ok(stdout.includes("ocmm-profiles list"))
})

test("no command prints help", () => {
  const { stdout, exitCode } = runCli(makeTempXdg(), [])
  assert.equal(exitCode, 0)
  assert.ok(stdout.includes("USAGE:"))
})

test("commands requiring existing config fail gracefully when none exists", () => {
  const xdg = makeTempXdg()
  try {
    const { exitCode, stderr } = runCli(xdg, ["list"])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes("no ocmm config found"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add creates config file when none exists", () => {
  const xdg = makeTempXdg()
  const jsonFile = join(xdg, "p.json")
  try {
    writeFileSync(jsonFile, JSON.stringify({ debug: true }))
    runCli(xdg, ["add", "first", jsonFile])
    assert.ok(existsSync(join(xdg, "opencode", "ocmm.jsonc")))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})
