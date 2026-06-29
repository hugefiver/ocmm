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

test("list shows profiles with * on active and [inline] source", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      profiles: { light: {}, heavy: {} },
      activeProfile: "heavy",
    })
    const { stdout, exitCode } = runCli(xdg, ["list"])
    assert.equal(exitCode, 0)
    const lines = stdout.trim().split("\n")
    // File-based list shows [inline] source marker and * for active.
    assert.ok(lines.some((l) => l.includes("light") && l.includes("[inline]") && !l.includes("*")))
    assert.ok(lines.some((l) => l.includes("heavy") && l.includes("[inline]") && l.includes("*")))
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

test("show prints active profile by default with source", () => {
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
    assert.equal(parsed.source, "inline")
    assert.equal(parsed.config.debug, true)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("show prints named profile with source", () => {
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
    assert.equal(parsed.source, "inline")
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
    assert.ok(stdout.includes(`profile "gpu" added`))
    // File-based: profile goes to ocmm-profiles/ dir, not inline.
    const target = join(xdg, "opencode", "ocmm-profiles", "gpu.jsonc")
    assert.ok(existsSync(target))
    const content = readFileSync(target, "utf8")
    const parsed = JSON.parse(content) as Record<string, unknown>
    assert.deepEqual(parsed.agents, { orchestrator: { model: "hoo/glm-5.2" } })
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
    writeConfig(xdg, {})
    // Pre-create profile file in directory
    const profDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profDir, { recursive: true })
    writeFileSync(join(profDir, "a.jsonc"), JSON.stringify({ debug: true }))
    writeFileSync(join(profDir, "b.jsonc"), JSON.stringify({ debug: false }))
    const { exitCode, stdout } = runCli(xdg, ["rm", "a"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('removed profile "a"'))
    assert.ok(!existsSync(join(profDir, "a.jsonc")))
    assert.ok(existsSync(join(profDir, "b.jsonc")))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("rm notes stale activeProfile when deleting the active one", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { activeProfile: "a" })
    // Pre-create profile file in directory
    const profDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profDir, { recursive: true })
    writeFileSync(join(profDir, "a.jsonc"), JSON.stringify({ debug: true }))
    const { exitCode, stdout } = runCli(xdg, ["rm", "a"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('removed profile "a" (file)'))
    assert.ok(stdout.includes("activeProfile in ocmm.jsonc is now stale"))
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

// ---- Task 4: file-based add/rm/list/show tests ----

test("add copies source file to profiles dir as <name>.jsonc", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "src.jsonc")
  writeFileSync(
    srcFile,
    `// my profile comment\n{ "agents": { "orchestrator": { "model": "gpt-5" } } }`,
  )
  try {
    const { exitCode, stdout } = runCli(xdg, ["add", "co", srcFile])
    assert.equal(exitCode, 0)
    const target = join(xdg, "opencode", "ocmm-profiles", "co.jsonc")
    assert.ok(existsSync(target))
    // Raw copy preserves comments
    const content = readFileSync(target, "utf8")
    assert.ok(content.includes("// my profile comment"))
    assert.ok(stdout.includes(`profile "co" added`))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add rejects invalid JSONC source", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "bad.jsonc")
  writeFileSync(srcFile, `{ this is not valid`)
  try {
    const { exitCode, stderr } = runCli(xdg, ["add", "co", srcFile])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes("invalid JSONC"))
    assert.ok(!existsSync(join(xdg, "opencode", "ocmm-profiles", "co.jsonc")))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add rejects schema-violating source (nested profiles)", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "bad-schema.jsonc")
  writeFileSync(srcFile, JSON.stringify({ profiles: { nested: {} } }))
  try {
    const { exitCode, stderr } = runCli(xdg, ["add", "co", srcFile])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes("profile JSON invalid"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add creates profiles dir if missing", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "src.jsonc")
  writeFileSync(srcFile, `{ "agents": {} }`)
  try {
    runCli(xdg, ["add", "co", srcFile])
    assert.ok(existsSync(join(xdg, "opencode", "ocmm-profiles")))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("add overwrites existing profile", () => {
  const xdg = makeTempXdg()
  const src1 = join(xdg, "s1.jsonc")
  const src2 = join(xdg, "s2.jsonc")
  writeFileSync(src1, `{ "agents": { "orchestrator": { "model": "a" } } }`)
  writeFileSync(src2, `{ "agents": { "orchestrator": { "model": "b" } } }`)
  try {
    runCli(xdg, ["add", "co", src1])
    runCli(xdg, ["add", "co", src2])
    const target = join(xdg, "opencode", "ocmm-profiles", "co.jsonc")
    const content = readFileSync(target, "utf8")
    assert.ok(content.includes(`"b"`))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

// ---- File-based rm tests ----

test("rm on inline-only profile prints informative message", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { inlineOnly: { debug: true } } })
    const { exitCode, stdout } = runCli(xdg, ["rm", "inlineOnly"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("exists only inline"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("rm on nonexistent profile fails", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const { exitCode, stderr } = runCli(xdg, ["rm", "nonexistent"])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes("not found"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

// ---- File-based list tests ----

test("list shows [file] source for directory profiles", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const profDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profDir, { recursive: true })
    writeFileSync(join(profDir, "co.jsonc"), JSON.stringify({ agents: {} }))
    const { stdout, exitCode } = runCli(xdg, ["list"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("co [file]"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("list shows [file (shadows inline)] when both exist", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { profiles: { co: { debug: true } } })
    const profDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profDir, { recursive: true })
    writeFileSync(join(profDir, "co.jsonc"), JSON.stringify({ agents: {} }))
    const { stdout, exitCode } = runCli(xdg, ["list"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("co [file (shadows inline)]"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

// ---- File-based show tests ----

test("show reads from directory profile file", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { activeProfile: "co" })
    const profDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profDir, { recursive: true })
    writeFileSync(
      join(profDir, "co.jsonc"),
      `// comment\n{ "agents": { "orchestrator": { "model": "dir-gpt" } } }`,
    )
    const { stdout, exitCode } = runCli(xdg, ["show", "co"])
    assert.equal(exitCode, 0)
    const parsed = JSON.parse(stdout)
    assert.equal(parsed.name, "co")
    assert.equal(parsed.source, "file")
    const agents = parsed.config.agents as Record<string, { model: string }>
    assert.equal(agents.orchestrator.model, "dir-gpt")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

// ---- use with directory profiles ----

test("use accepts a directory profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const profDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profDir, { recursive: true })
    writeFileSync(join(profDir, "co.jsonc"), JSON.stringify({ agents: {} }))
    const { exitCode, stdout } = runCli(xdg, ["use", "co"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('active profile set to "co"'))
    const cfg = readConfig(xdg)
    assert.equal(cfg.activeProfile, "co")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("use rejects invalid profile names", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {})
    const { exitCode, stderr } = runCli(xdg, ["use", "../escape"])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes("invalid profile name"))
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

// ---- Task 5: comment-preservation tests ----

/** Write raw JSONC content (with comments) to the config file. */
function writeConfigRaw(xdg: string, content: string): void {
  mkdirSync(join(xdg, "opencode"), { recursive: true })
  writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), content)
}

/** Read raw content (string, not parsed) from the config file. */
function readConfigRaw(xdg: string): string {
  return readFileSync(join(xdg, "opencode", "ocmm.jsonc"), "utf8")
}

test("use sets activeProfile preserving comments in ocmm.jsonc", () => {
  const xdg = makeTempXdg()
  try {
    writeConfigRaw(xdg, `{
  // top comment
  "profiles": {
    "co": { "agents": {} }
  },
  "activeProfile": "old",
  // trailing comment
  "other": true
}
`)
    const { exitCode, stdout } = runCli(xdg, ["use", "co"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('active profile set to "co"'))
    const raw = readConfigRaw(xdg)
    assert.ok(raw.includes("// top comment"), "top comment should survive")
    assert.ok(raw.includes("// trailing comment"), "trailing comment should survive")
    assert.ok(raw.includes('"activeProfile": "co"'), "activeProfile should be co")
    assert.ok(!raw.includes('"old"'), "old value should be gone")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("clear removes activeProfile preserving comments", () => {
  const xdg = makeTempXdg()
  try {
    writeConfigRaw(xdg, `{
  // top comment
  "activeProfile": "old",
  // middle comment
  "other": true
}
`)
    const { exitCode, stdout } = runCli(xdg, ["clear"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes("cleared active profile"))
    const raw = readConfigRaw(xdg)
    assert.ok(raw.includes("// top comment"), "top comment should survive")
    assert.ok(raw.includes("// middle comment"), "middle comment should survive")
    assert.ok(!raw.includes("activeProfile"), "activeProfile key should be removed")
    assert.ok(raw.includes('"other": true'), "other key should survive")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("use inserts activeProfile when field absent", () => {
  const xdg = makeTempXdg()
  try {
    writeConfigRaw(xdg, `{
  // config comment
  "profiles": {
    "co": { "agents": {} }
  }
}
`)
    const { exitCode, stdout } = runCli(xdg, ["use", "co"])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('active profile set to "co"'))
    const raw = readConfigRaw(xdg)
    assert.ok(raw.includes("// config comment"), "comment should survive")
    assert.ok(raw.includes('"activeProfile": "co"'), "activeProfile should be inserted")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})
