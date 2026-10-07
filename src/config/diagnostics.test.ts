import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createConfigDiagnostics } from "./diagnostics.ts"
import { loadConfig, loadOpenCodePluginConfig, loadProfileDescriptorsFromDir } from "./load.ts"

function captureConfigWarnings(run: () => void): unknown[][] {
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: unknown[][] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  try {
    run()
    return warnings
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
  }
}

function unknownKeyPayloads(warnings: readonly unknown[][]): Array<{
  code: string
  entries: Array<{ source: string; path: readonly (string | number)[] }>
  total: number
  omitted: number
  truncated: boolean
}> {
  return warnings
    .map((args) => args[1])
    .filter((value): value is {
      code: string
      entries: Array<{ source: string; path: readonly (string | number)[] }>
      total: number
      omitted: number
      truncated: boolean
    } => typeof value === "object" && value !== null && Reflect.get(value, "code") === "OCMM_CONFIG_UNKNOWN_KEYS")
}

test("config diagnostics cap entries, report omissions, deduplicate, and flush once", () => {
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: unknown[][] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args) }

  try {
    const diagnostics = createConfigDiagnostics()
    const unknownKeys = Array.from({ length: 25 }, (_, index) => ({ path: ["unknown", index] }))
    diagnostics.collect("C:/config/ocmm.jsonc", unknownKeys)
    diagnostics.collect("C:/config/ocmm.jsonc", unknownKeys)
    diagnostics.flush()
    diagnostics.collect("C:/config/late.jsonc", [{ path: ["late"] }])
    diagnostics.flush()

    assert.equal(warnings.length, 1)
    const payload = warnings[0]?.[1] as {
      code: string
      entries: unknown[]
      total: number
      omitted: number
      truncated: boolean
    }
    assert.equal(payload.code, "OCMM_CONFIG_UNKNOWN_KEYS")
    assert.equal(payload.entries.length, 20)
    assert.equal(payload.total, 25)
    assert.equal(payload.omitted, 5)
    assert.equal(payload.truncated, false)
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
  }
})

test("config diagnostics bound long source and path display representations", () => {
  const longSource = `C:/${"source/".repeat(2_000)}ocmm.jsonc`
  const commonLongSuffix = `${"unknown-key-".repeat(1_000)}tail`
  const longKeyA = `first-${commonLongSuffix}`
  const longKeyB = `second-${commonLongSuffix}`
  const warnings = captureConfigWarnings(() => {
    const diagnostics = createConfigDiagnostics()
    diagnostics.collect(longSource, [{ path: ["root", longKeyA] }, { path: ["root", longKeyB] }])
    diagnostics.flush()
  })

  const payload = unknownKeyPayloads(warnings)[0]!
  assert.equal(payload.total, 2)
  assert.equal(payload.omitted, 0)
  assert.equal(payload.truncated, false)
  assert.equal(payload.entries.length, 2)
  assert.deepEqual(payload.entries[0]!.path, payload.entries[1]!.path)
  for (const entry of payload.entries) {
    assert.ok(JSON.stringify(entry.source).length <= 240)
    assert.ok(JSON.stringify(entry.path).length <= 240)
    assert.equal(entry.source.startsWith("…"), true)
    assert.equal(entry.source.endsWith("ocmm.jsonc"), true)
    assert.equal(entry.path.some((segment) => typeof segment === "string" && segment.includes("…")), true)
    assert.equal(String(entry.path.at(-1)).endsWith("tail"), true)
  }
  assert.ok(JSON.stringify(payload).length < 1_400)
})

test("config diagnostics count high-cardinality omissions without exposing them as entries", () => {
  const warnings = captureConfigWarnings(() => {
    const diagnostics = createConfigDiagnostics()
    for (let pass = 0; pass < 2; pass++) {
      for (let index = 0; index < 10_000; index++) {
        diagnostics.collect("project config", [{ path: ["unknown", index] }])
      }
    }
    diagnostics.flush()
  })

  const payload = unknownKeyPayloads(warnings)[0]!
  assert.equal(payload.entries.length, 20)
  assert.equal(payload.total, 4_096)
  assert.equal(payload.omitted, 4_076)
  assert.equal(payload.truncated, true)
  assert.deepEqual(Object.keys(payload).sort(), ["code", "entries", "omitted", "total", "truncated"])
  assert.equal(payload.entries.some((entry) => entry.path.includes(9_999)), false)
})

test("config diagnostics never include unknown field values", () => {
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: unknown[][] = []
  process.env.OCMM_DEBUG = "true"
  console.warn = (...args: unknown[]) => { warnings.push(args) }

  try {
    const diagnostics = createConfigDiagnostics()
    diagnostics.collect("project config", [{ path: ["credentials", "typo"] }])
    diagnostics.flush()

    assert.equal(JSON.stringify(warnings).includes("fake-secret-value"), false)
    assert.equal(JSON.stringify(warnings).includes("credentials"), true)
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
  }
})

test("loadConfig reports real unknown paths while preserving dynamic records and hiding values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-unknown-diagnostics-"))
  const configDir = join(cwd, ".opencode")
  const configPath = join(configDir, "ocmm.jsonc")
  const secret = "fake-secret-value"
  mkdirSync(configDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify({
    topTypo: secret,
    agents: {
      customAgent: { model: "provider/model", modle: secret },
    },
    mcp: {
      servers: {
        customServer: {
          type: "remote",
          url: "https://example.com/mcp",
          headers: { "X-Custom-Header": secret },
          serverTypo: secret,
        },
      },
    },
    fastModels: {
      rules: [{
        match: { provider: "example", matchTypo: secret },
        options: { arbitraryOption: { nested: secret } },
      }],
    },
  }))

  try {
    const warnings = captureConfigWarnings(() => {
      const loaded = loadConfig({ cwd, includeUser: false })
      assert.equal(loaded.config.agents?.customAgent?.model, "provider/model")
      assert.equal(loaded.config.mcp.servers.customServer?.type, "remote")
      assert.deepEqual(loaded.config.fastModels.rules[0]?.options, {
        arbitraryOption: { nested: secret },
      })
    })
    const payloads = unknownKeyPayloads(warnings)
    assert.equal(payloads.length, 1)
    const paths = payloads[0]!.entries.map((entry) => entry.path)
    assert.deepEqual(
      paths.map((path) => JSON.stringify(path)).sort(),
      [
        ["agents", "customAgent", "modle"],
        ["topTypo"],
        ["mcp", "servers", "customServer", "serverTypo"],
        ["fastModels", "rules", 0, "match", "matchTypo"],
      ].map((path) => JSON.stringify(path)).sort(),
    )
    assert.ok(payloads[0]!.entries.every((entry) => entry.source === configPath))
    assert.equal(JSON.stringify(warnings).includes(secret), false)
    assert.equal(paths.some((path) => path.includes("customAgent")), true)
    assert.equal(paths.some((path) => path.includes("customServer")), true)
    assert.equal(paths.some((path) => path.includes("X-Custom-Header")), false)
    assert.equal(paths.some((path) => path.includes("arbitraryOption")), false)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("loadConfig attributes layered and selected-profile unknowns to their real sources", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-unknown-user-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-unknown-project-"))
  const userDir = join(xdg, "opencode")
  const projectDir = join(cwd, ".opencode")
  const profileDir = join(projectDir, "ocmm-profiles")
  const userPath = join(userDir, "ocmm.jsonc")
  const projectPath = join(projectDir, "ocmm.jsonc")
  const profilePath = join(profileDir, "selected.jsonc")
  mkdirSync(userDir, { recursive: true })
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(userPath, JSON.stringify({ workflow: "v1", debug: true }))
  writeFileSync(projectPath, JSON.stringify({
    workflow: "invalid",
    activeProfile: "selected",
    projectTypo: true,
  }))
  writeFileSync(profilePath, JSON.stringify({
    locale: "zh-CN",
    agents: { profileAgent: { model: "provider/profile", modle: "not-logged" } },
    profileTypo: true,
  }))
  const saved = new Map<string, string | undefined>()
  for (const key of ["XDG_CONFIG_HOME", "OCMM_PROFILE", "OCMM_NO_PROFILE"]) {
    saved.set(key, process.env[key])
  }
  process.env.XDG_CONFIG_HOME = xdg
  delete process.env.OCMM_PROFILE
  delete process.env.OCMM_NO_PROFILE

  try {
    const warnings = captureConfigWarnings(() => {
      const loaded = loadConfig({ cwd })
      assert.equal(loaded.config.workflow, "v1")
      assert.equal(loaded.config.debug, true)
      assert.equal(loaded.config.locale, "zh-CN")
      assert.equal(loaded.config.agents?.profileAgent?.model, "provider/profile")
    })
    const payload = unknownKeyPayloads(warnings)[0]!
    assert.ok(payload)
    assert.deepEqual(
      payload.entries.map((entry) => ({ source: entry.source, path: entry.path })),
      [
        { source: profilePath, path: ["agents", "profileAgent", "modle"] },
        { source: projectPath, path: ["projectTypo"] },
        { source: profilePath, path: ["profileTypo"] },
      ],
    )
    assert.equal(JSON.stringify(warnings).includes("not-logged"), false)
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("projection parsing does not diagnose valid fields outside the projection", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-projection-diagnostics-"))
  const configDir = join(cwd, ".opencode")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, "ocmm.jsonc"), JSON.stringify({
    workflow: "v1",
    debug: true,
    agents: { custom: { model: "provider/model" } },
    profiles: { selected: { locale: "zh-CN" } },
    activeProfile: "selected",
  }))

  const previousProfile = process.env.OCMM_PROFILE
  const previousNoProfile = process.env.OCMM_NO_PROFILE
  delete process.env.OCMM_PROFILE
  delete process.env.OCMM_NO_PROFILE
  try {
    const warnings = captureConfigWarnings(() => {
      const loaded = loadConfig({ cwd, includeUser: false })
      assert.equal(loaded.config.debug, true)
      assert.equal(loaded.config.locale, "zh-CN")
    })
    assert.deepEqual(unknownKeyPayloads(warnings), [])
  } finally {
    if (previousProfile === undefined) delete process.env.OCMM_PROFILE
    else process.env.OCMM_PROFILE = previousProfile
    if (previousNoProfile === undefined) delete process.env.OCMM_NO_PROFILE
    else process.env.OCMM_NO_PROFILE = previousNoProfile
    rmSync(cwd, { recursive: true, force: true })
  }
})

test("directory descriptor sanitization reports unknown paths at the profile-file boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "ocmm-descriptor-diagnostics-"))
  const profilePath = join(dir, "selected.jsonc")
  writeFileSync(profilePath, JSON.stringify({ debug: true, debgu: "fake-secret-value" }))

  try {
    const warnings = captureConfigWarnings(() => {
      const descriptor = loadProfileDescriptorsFromDir(dir, "project-directory").get("selected")
      assert.deepEqual(descriptor?.value, { debug: true, debgu: "fake-secret-value" })
    })
    const payload = unknownKeyPayloads(warnings)[0]!
    assert.equal(payload.total, 1)
    assert.deepEqual(payload.entries, [{ source: profilePath, path: ["debgu"] }])
    assert.equal(JSON.stringify(warnings).includes("fake-secret-value"), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("OpenCode loading deduplicates base, inline-descriptor, and selected-profile diagnostics", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-plugin-diagnostics-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-plugin-project-"))
  const configDir = join(xdg, "opencode")
  const configPath = join(configDir, "ocmm.jsonc")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify({
    baseTypo: true,
    profiles: {
      selected: {
        profileTypo: true,
        agents: { worker: { model: "provider/model", modle: "hidden-value" } },
      },
    },
    activeProfile: "selected",
  }))
  const saved = new Map<string, string | undefined>()
  for (const key of ["XDG_CONFIG_HOME", "OCMM_PROFILE", "OCMM_NO_PROFILE"]) saved.set(key, process.env[key])
  process.env.XDG_CONFIG_HOME = xdg
  delete process.env.OCMM_PROFILE
  delete process.env.OCMM_NO_PROFILE

  try {
    const warnings = captureConfigWarnings(() => {
      const loaded = loadOpenCodePluginConfig({ cwd })
      assert.equal(loaded.config.agents?.worker?.model, "provider/model")
    })
    const payload = unknownKeyPayloads(warnings)[0]!
    assert.equal(payload.total, 3)
    assert.deepEqual(
      payload.entries.map((entry) => JSON.stringify(entry.path)).sort(),
      [
        ["baseTypo"],
        ["profiles", "selected", "profileTypo"],
        ["profiles", "selected", "agents", "worker", "modle"],
      ].map((path) => JSON.stringify(path)).sort(),
    )
    assert.ok(payload.entries.every((entry) => entry.source === configPath))
    assert.equal(JSON.stringify(warnings).includes("hidden-value"), false)
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(xdg, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  }
})

for (const load of [loadConfig, loadOpenCodePluginConfig]) {
  for (const entry of ["root", "inline", "directory"] as const) {
    test(`${load.name}: project ${entry} allowlist filtering preserves sibling diagnostics and tolerant recovery`, () => {
      const root = mkdtempSync(join(tmpdir(), "ocmm-allowlist-diagnostics-"))
      const userDir = join(root, "user", "opencode")
      const cwd = join(root, "project")
      const projectDir = join(cwd, ".opencode")
      const projectPath = join(projectDir, "ocmm.jsonc")
      const profilePath = join(projectDir, "ocmm-profiles", "selected.jsonc")
      const saved = new Map<string, string | undefined>()
      for (const key of ["XDG_CONFIG_HOME", "OCMM_PROFILE", "OCMM_NO_PROFILE"]) saved.set(key, process.env[key])
      try {
        process.env.XDG_CONFIG_HOME = join(root, "user")
        delete process.env.OCMM_PROFILE
        delete process.env.OCMM_NO_PROFILE
        mkdirSync(userDir, { recursive: true })
        mkdirSync(join(projectDir, "ocmm-profiles"), { recursive: true })
        writeFileSync(join(userDir, "ocmm.jsonc"), JSON.stringify({
          mcp: { envAllowlist: ["USER_KEY"], websearch: { provider: "tavily" } },
        }))
        const value = {
          debug: true,
          mcp: { envAllowlist: ["PROJECT_KEY"], enabled: false, envAllowlst: "hidden-value", websearch: { provider: "invalid" } },
        }
        writeFileSync(projectPath, JSON.stringify(entry === "root"
          ? value
          : { activeProfile: "selected", ...(entry === "inline" ? { profiles: { selected: value } } : {}) }))
        if (entry === "directory") writeFileSync(profilePath, JSON.stringify(value))
        const warnings = captureConfigWarnings(() => {
          const config = load({ cwd }).config
          assert.deepEqual(config.mcp.envAllowlist, ["USER_KEY"])
          assert.equal(config.mcp.enabled, false)
          assert.equal(config.mcp.websearch.provider, "tavily")
          assert.equal(config.debug, true)
        })
        const payloads = unknownKeyPayloads(warnings)
        assert.equal(payloads.length, 1)
        assert.equal(payloads[0]!.total, 1)
        assert.deepEqual(payloads[0]!.entries, [{
          source: entry === "directory" ? profilePath : projectPath,
          path: [...(entry === "inline" ? ["profiles", "selected"] : []), "mcp", "envAllowlst"],
        }])
        assert.equal(JSON.stringify(warnings).includes("hidden-value"), false)
      } finally {
        for (const [key, value] of saved) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
}
