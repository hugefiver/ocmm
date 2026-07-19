import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadConfig, loadOpenCodePluginConfig } from "./load.ts"
import { OcmmConfigSchema, defaultConfig } from "./schema.ts"

const PLUGIN_ENV_KEYS = ["OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST", "OPENCODE_CONFIG_CONTENT"] as const
type PluginEnvKey = (typeof PLUGIN_ENV_KEYS)[number]

function makeTempXdg(): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-profile-test-"))
  mkdirSync(join(root, "opencode"), { recursive: true })
  return root
}

function writeConfig(xdg: string, raw: unknown): void {
  writeFileSync(join(xdg, "opencode", "ocmm.jsonc"), JSON.stringify(raw, null, 2))
}

function loadWithXdg(xdg: string, cwd?: string) {
  const prev = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    return loadConfig({ cwd: cwd ?? xdg })
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prev
  }
}

function withPluginEnv<T>(overrides: Partial<Record<PluginEnvKey, string | undefined>>, run: () => T): T {
  const previous = new Map<PluginEnvKey, string | undefined>()
  for (const key of PLUGIN_ENV_KEYS) {
    previous.set(key, process.env[key])
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(overrides) as [PluginEnvKey, string | undefined][]) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return run()
  } finally {
    for (const key of PLUGIN_ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function loadPluginWithXdg(
  xdg: string,
  cwd?: string,
  env: Partial<Record<PluginEnvKey, string | undefined>> = {},
) {
  const prev = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = xdg
  try {
    return withPluginEnv(env, () => loadOpenCodePluginConfig({ cwd: cwd ?? xdg }))
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = prev
  }
}

test("loadOpenCodePluginConfig discards an invalid base field while retaining valid disk-config siblings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      workflow: "unsupported",
      debug: true,
      agents: { orchestrator: { model: "openai/gpt-5.6-sol" } },
    })

    const loaded = loadPluginWithXdg(xdg)

    assert.equal(loaded.config.workflow, "v1")
    assert.equal(loaded.config.debug, true)
    assert.equal(loaded.config.agents?.orchestrator?.model, "openai/gpt-5.6-sol")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig discards an invalid selected inline profile field while retaining valid siblings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      workflow: "omo",
      locale: "en-US",
      agents: { orchestrator: { model: "BASE" } },
      profiles: {
        selected: {
          locale: "unsupported",
          debug: true,
          agents: { orchestrator: { model: "PROFILE" } },
        },
      },
      activeProfile: "selected",
    })

    const loaded = loadPluginWithXdg(xdg)

    assert.equal(loaded.activeProfile, "selected")
    assert.equal(loaded.config.workflow, "omo")
    assert.equal(loaded.config.locale, "en-US")
    assert.equal(loaded.config.debug, true)
    assert.equal(loaded.config.agents?.orchestrator?.model, "PROFILE")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig restores lower selected inline profile values after invalid project overrides", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-plugin-inline-profile-layers-"))
  try {
    writeConfig(xdg, {
      locale: "en-US",
      agents: { orchestrator: { model: "BASE" } },
      profiles: {
        selected: {
          locale: "zh-CN",
          agents: { orchestrator: { model: "LOWER" } },
        },
      },
      activeProfile: "selected",
    })
    mkdirSync(join(project, ".opencode"), { recursive: true })
    writeFileSync(join(project, ".opencode", "ocmm.jsonc"), JSON.stringify({
      profiles: {
        selected: {
          locale: "unsupported",
          debug: true,
          agents: { orchestrator: { model: 42, description: "PROJECT" } },
        },
      },
    }))

    const generic = withPluginEnv({}, () => loadWithXdg(xdg, project))
    const plugin = loadPluginWithXdg(xdg, project)

    assert.equal(generic.config.locale, "zh-CN")
    assert.equal(generic.config.debug, true)
    assert.equal(generic.config.agents?.orchestrator?.model, "LOWER")
    assert.equal(generic.config.agents?.orchestrator?.description, "PROJECT")

    assert.equal(plugin.config.locale, "zh-CN")
    assert.equal(plugin.config.debug, true)
    assert.equal(plugin.config.agents?.orchestrator?.model, "LOWER")
    assert.equal(plugin.config.agents?.orchestrator?.description, "PROJECT")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig does not inject profile defaults over omitted base fields", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      disabledHooks: ["custom-hook"],
      profiles: { selected: { debug: true } },
      activeProfile: "selected",
    })

    const generic = withPluginEnv({}, () => loadWithXdg(xdg))
    const plugin = loadPluginWithXdg(xdg)

    assert.deepEqual(generic.config.disabledHooks, ["custom-hook"])
    assert.deepEqual(plugin.config.disabledHooks, ["custom-hook"])
    assert.equal(plugin.config.debug, true)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig restores lower inline qualified-alias targets after invalid project overrides", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-plugin-inline-alias-layers-"))
  try {
    writeConfig(xdg, {
      agents: { source: { alias: "precision:reviewer" } },
      profiles: {
        precision: { agents: { reviewer: { model: "openai/LOWER" } } },
      },
    })
    mkdirSync(join(project, ".opencode"), { recursive: true })
    writeFileSync(join(project, ".opencode", "ocmm.jsonc"), JSON.stringify({
      profiles: {
        precision: {
          agents: { reviewer: { model: 42, description: "PROJECT" } },
        },
      },
    }))

    const generic = withPluginEnv({}, () => loadWithXdg(xdg, project))
    const plugin = loadPluginWithXdg(xdg, project)

    assert.equal(generic.config.agents?.source?.alias, "precision:reviewer")
    assert.equal(generic.config.agents?.source?.requirement, undefined)
    assert.equal(plugin.config.agents?.source?.alias, "precision:reviewer")
    assert.equal(plugin.config.agents?.source?.requirement?.fallbackChain[0]?.model, "LOWER")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig profile descriptors preserve inline < user dir < project dir precedence", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-plugin-profile-project-"))
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "BASE" } },
      profiles: {
        precision: { agents: { orchestrator: { model: "INLINE" } } },
      },
      activeProfile: "precision",
    })
    const userDir = join(xdg, "opencode", "ocmm-profiles")
    const projectDir = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(userDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(userDir, "precision.jsonc"), JSON.stringify({ agents: { orchestrator: { model: "USER" } } }))
    writeFileSync(join(projectDir, "precision.jsonc"), JSON.stringify({ agents: { orchestrator: { model: "PROJECT" } } }))

    const loaded = loadPluginWithXdg(xdg, project)

    assert.equal(loaded.activeProfile, "precision")
    assert.equal(loaded.config.agents?.orchestrator?.model, "PROJECT")
    assert.equal(loaded.config.profiles.precision?.agents?.orchestrator?.model, "INLINE")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig invalid active project descriptor shadows lower profiles and returns defaults", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-plugin-invalid-active-"))
  try {
    writeConfig(xdg, {
      agents: { "invalid-config": { model: "BASE" } },
      fastModels: { providers: ["base-provider"] },
      profiles: {
        precision: {
          agents: { "invalid-config": { model: "INLINE" } },
          fastModels: { providers: ["inline-provider"] },
        },
      },
      activeProfile: "precision",
    })
    const userDir = join(xdg, "opencode", "ocmm-profiles")
    const projectDir = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(userDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(userDir, "precision.jsonc"), JSON.stringify({ fastModels: { providers: ["user-provider"] } }))
    writeFileSync(join(projectDir, "precision.jsonc"), JSON.stringify({ activeProfile: "nested" }))

    const loaded = loadPluginWithXdg(xdg, project)

    assert.equal(loaded.activeProfile, "precision")
    assert.deepEqual(loaded.config.fastModels.providers, [])
    assert.equal(loaded.config.agents?.["invalid-config"], undefined)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig ignores invalid unreferenced directory descriptors and does not insert inactive directory profiles", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-plugin-inert-directory-"))
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "BASE" } },
      profiles: {
        active: { agents: { orchestrator: { model: "INLINE-ACTIVE" } } },
      },
      activeProfile: "active",
    })
    const projectDir = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, "active.jsonc"), JSON.stringify({ agents: { orchestrator: { model: "PROJECT-ACTIVE" } } }))
    writeFileSync(join(projectDir, "unused.jsonc"), JSON.stringify({ agents: { "reviewer-high": { model: "BAD" } } }))

    const loaded = loadPluginWithXdg(xdg, project)

    assert.equal(loaded.activeProfile, "active")
    assert.equal(loaded.config.agents?.orchestrator?.model, "PROJECT-ACTIVE")
    assert.equal(loaded.config.profiles.unused, undefined)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig uses exact ambient profile selection", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "BASE" } },
      profiles: {
        configured: { agents: { orchestrator: { model: "CONFIGURED" } } },
        env: { agents: { orchestrator: { model: "ENV" } } },
      },
      activeProfile: "configured",
    })

    const envWins = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "env", OCMM_NO_PROFILE: "false" })
    assert.equal(envWins.activeProfile, "env")
    assert.equal(envWins.config.agents?.orchestrator?.model, "ENV")

    const nonDisableValue = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "env", OCMM_NO_PROFILE: "yes" })
    assert.equal(nonDisableValue.activeProfile, "env")
    assert.equal(nonDisableValue.config.agents?.orchestrator?.model, "ENV")

    const disabledByTrue = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "env", OCMM_NO_PROFILE: "true" })
    assert.equal(disabledByTrue.activeProfile, undefined)
    assert.equal(disabledByTrue.config.agents?.orchestrator?.model, "BASE")

    const disabledByOne = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "env", OCMM_NO_PROFILE: "1" })
    assert.equal(disabledByOne.activeProfile, undefined)
    assert.equal(disabledByOne.config.agents?.orchestrator?.model, "BASE")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig missing active descriptor warns and preserves base config", () => {
  const xdg = makeTempXdg()
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: string[] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "BASE" } },
      fastModels: { providers: ["base-provider"] },
      activeProfile: "missing",
    })

    const loaded = loadPluginWithXdg(xdg)

    assert.equal(loaded.activeProfile, "missing")
    assert.equal(loaded.config.agents?.orchestrator?.model, "BASE")
    assert.deepEqual(loaded.config.fastModels.providers, ["base-provider"])
    assert.match(warnings.join("\n"), /active profile "missing" not found/i)
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig profile overlay replaces fast providers and deep-merges mappings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      fastModels: {
        providers: ["base-provider"],
        mappings: {
          "openai/gpt-5": "openai/gpt-5-mini",
          "anthropic/claude-opus": "anthropic/claude-haiku",
        },
      },
      profiles: {
        fast: {
          fastModels: {
            providers: ["profile-provider"],
            mappings: {
              "openai/gpt-5": "openai/gpt-5-nano",
              "google/gemini-pro": "google/gemini-flash",
            },
          },
        },
      },
      activeProfile: "fast",
    })

    const loaded = loadPluginWithXdg(xdg)

    assert.deepEqual(loaded.config.fastModels.providers, ["profile-provider"])
    assert.deepEqual(loaded.config.fastModels.mappings, {
      "openai/gpt-5": "openai/gpt-5-nano",
      "anthropic/claude-opus": "anthropic/claude-haiku",
      "google/gemini-pro": "google/gemini-flash",
    })
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig materializes qualified aliases using project descriptor precedence", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-qualified-precedence-"))
  try {
    writeConfig(xdg, {
      agents: { source: { alias: "precision:reviewer" } },
      profiles: { precision: { agents: { reviewer: { model: "openai/INLINE" } } } },
    })
    const userDir = join(xdg, "opencode", "ocmm-profiles")
    const projectDir = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(userDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(userDir, "precision.jsonc"), JSON.stringify({ agents: { reviewer: { model: "openai/USER" } } }))
    writeFileSync(join(projectDir, "precision.jsonc"), JSON.stringify({ agents: { reviewer: { model: "openai/PROJECT" } } }))

    const loaded = loadPluginWithXdg(xdg, project)
    assert.equal(loaded.config.agents?.source?.alias, "precision:reviewer")
    assert.equal(loaded.config.agents?.source?.requirement?.fallbackChain[0]?.model, "PROJECT")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig materializes a later Oracle qualified alias", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: {
        "oracle-3rd": {
          alias: "precision:reviewer",
          description: "Local third Oracle behavior",
          tools: { task: false },
        },
      },
      profiles: {
        precision: {
          agents: {
            reviewer: { model: "openai/TARGET" },
          },
        },
      },
    })

    const loaded = loadPluginWithXdg(xdg)
    const oracle = loaded.config.agents?.["oracle-3rd"]

    assert.equal(oracle?.alias, "precision:reviewer")
    assert.equal(oracle?.description, "Local third Oracle behavior")
    assert.deepEqual(oracle?.tools, { task: false })
    assert.equal(oracle?.requirement?.fallbackChain[0]?.model, "TARGET")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig materializes qualified aliases from canonicalized inactive directory profiles", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { source: { alias: "precision:oracle-2nd" } },
    })
    const profileDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, "precision.jsonc"), JSON.stringify({
      agents: { "oracle-high": { model: "openai/LEGACY" } },
    }))

    const loaded = loadPluginWithXdg(xdg)

    assert.equal(loaded.activeProfile, undefined)
    assert.equal(loaded.config.agents?.source?.requirement?.fallbackChain[0]?.model, "LEGACY")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig preserves active directory review-spelling conflict detection", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { "oracle-2nd": { model: "openai/BASE" } },
      activeProfile: "precision",
    })
    const profileDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, "precision.jsonc"), JSON.stringify({
      agents: { "oracle-high": { model: "openai/LEGACY" } },
    }))

    const loaded = loadPluginWithXdg(xdg)

    assert.deepEqual(loaded.config, defaultConfig())
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig returns defaults for referenced qualified-alias failures", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-qualified-failures-"))
  try {
    const projectDir = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(projectDir, { recursive: true })
    const cases = [
      { name: "invalid grammar", alias: "precision:", profile: { agents: { reviewer: { model: "TARGET" } } } },
      { name: "missing profile", alias: "missing:reviewer", profile: undefined },
      { name: "missing target", alias: "precision:reviewer", profile: { agents: {} } },
      { name: "no requirement", alias: "precision:reviewer", profile: { agents: { reviewer: { description: "only" } } } },
    ]
    for (const scenario of cases) {
      rmSync(projectDir, { recursive: true, force: true })
      mkdirSync(projectDir, { recursive: true })
      if (scenario.profile !== undefined) {
        writeFileSync(join(projectDir, "precision.jsonc"), JSON.stringify(scenario.profile))
      }
      writeConfig(xdg, { agents: { source: { alias: scenario.alias } } })

      const loaded = loadPluginWithXdg(xdg, project)
      assert.deepEqual(loaded.config, defaultConfig(), scenario.name)
    }

    writeConfig(xdg, {
      agents: { source: { alias: "precision:reviewer" } },
      profiles: { precision: { agents: { reviewer: { model: "INLINE" } } } },
    })
    writeFileSync(join(projectDir, "precision.jsonc"), "{ invalid")
    const invalidShadow = loadPluginWithXdg(xdg, project)
    assert.deepEqual(invalidShadow.config, defaultConfig(), "referenced invalid project shadow")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig scopes malformed qualified aliases, including later Oracle slots", () => {
  const xdg = makeTempXdg()
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: string[] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  try {
    for (const [name, expectedScope] of [
      ["source", "active:source"],
      ["oracle-3rd", "active:oracle-3rd"],
    ] as const) {
      writeConfig(xdg, { agents: { [name]: { alias: "precision:" } } })

      const loaded = loadPluginWithXdg(xdg)
      assert.deepEqual(loaded.config, defaultConfig(), name)
      assert.match(warnings.at(-1) ?? "", new RegExp(`invalid-qualified-alias: precision:: ${expectedScope}`))
    }
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig returns defaults for later Oracle qualified-alias failures", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-qualified-later-oracle-failures-"))
  try {
    const projectDir = join(project, ".opencode", "ocmm-profiles")
    const cases = [
      { name: "missing profile" },
      { name: "missing target", profiles: { precision: { agents: {} } } },
      {
        name: "target with no requirement",
        profiles: { precision: { agents: { reviewer: { description: "metadata only" } } } },
      },
      {
        name: "qualified cycle",
        profiles: { precision: { agents: { reviewer: { alias: "precision:reviewer" } } } },
      },
      {
        name: "invalid descriptor",
        profiles: { precision: { agents: { reviewer: { model: "INLINE" } } } },
        descriptor: "{ invalid",
      },
    ]
    for (const scenario of cases) {
      rmSync(projectDir, { recursive: true, force: true })
      mkdirSync(projectDir, { recursive: true })
      if (scenario.descriptor) writeFileSync(join(projectDir, "precision.jsonc"), scenario.descriptor)
      writeConfig(xdg, {
        agents: { "oracle-3rd": { alias: "precision:reviewer" } },
        ...(scenario.profiles ? { profiles: scenario.profiles } : {}),
      })

      const loaded = loadPluginWithXdg(xdg, project)
      assert.deepEqual(loaded.config, defaultConfig(), scenario.name)
    }
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("loadOpenCodePluginConfig logs the complete scoped path for qualified-alias cycles", () => {
  const xdg = makeTempXdg()
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: string[] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  try {
    writeConfig(xdg, {
      agents: { source: { alias: "first:same" } },
      profiles: {
        first: { agents: { same: { alias: "second:same" } } },
        second: { agents: { same: { alias: "first:same" } } },
      },
    })
    const loaded = loadPluginWithXdg(xdg)
    assert.deepEqual(loaded.config, defaultConfig())
    assert.match(
      warnings.join("\n"),
      /active:source -> profile:first:same -> profile:second:same -> profile:first:same/i,
    )
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("qualified aliases leave target profile root controls inactive and ignore invalid unreferenced profiles", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: {
        source: { alias: "precision:reviewer" },
        reviewer: { model: "BASE" },
      },
      runtimeFallback: { enabled: false },
      fastModels: { providers: ["base-provider"] },
      disabledAgents: ["base-disabled"],
      profiles: {
        active: { agents: { reviewer: { model: "ACTIVE" } } },
        precision: {
          agents: { reviewer: { model: "openai/TARGET" } },
          runtimeFallback: { enabled: true },
          fastModels: { providers: ["target-provider"] },
          disabledAgents: ["target-disabled"],
        },
      },
      activeProfile: "active",
    })
    const profileDir = join(xdg, "opencode", "ocmm-profiles")
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, "invalid.jsonc"), JSON.stringify({
      agents: { "reviewer-high": { model: "openai/BAD" } },
    }))

    const loaded = loadPluginWithXdg(xdg)
    assert.equal(loaded.config.agents?.source?.requirement?.fallbackChain[0]?.model, "TARGET")
    assert.equal(loaded.config.runtimeFallback.enabled, false)
    assert.deepEqual(loaded.config.fastModels.providers, ["base-provider"])
    assert.deepEqual(loaded.config.disabledAgents, ["base-disabled"])
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile overlay applies agent override from activeProfile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "hoo/glm-5.2" } },
      profiles: {
        gpu: { agents: { orchestrator: { model: "openai/gpt-5.5" } } },
      },
      activeProfile: "gpu",
    })
    const { config, activeProfile } = loadWithXdg(xdg)
    assert.equal(activeProfile, "gpu")
    const orch = config.agents?.orchestrator
    assert.ok(orch?.model)
    assert.equal(orch.model, "openai/gpt-5.5")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("OCMM_PROFILE env var overrides config activeProfile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "hoo/glm-5.2" } },
      profiles: {
        a: { agents: { orchestrator: { model: "openai/gpt-5.5" } } },
        b: { agents: { orchestrator: { model: "anthropic/claude-opus-4-7" } } },
      },
      activeProfile: "a",
    })
    const prev = process.env.OCMM_PROFILE
    process.env.OCMM_PROFILE = "b"
    try {
      const { config, activeProfile } = loadWithXdg(xdg)
      assert.equal(activeProfile, "b")
      assert.equal(config.agents?.orchestrator?.model, "anthropic/claude-opus-4-7")
    } finally {
      if (prev === undefined) delete process.env.OCMM_PROFILE
      else process.env.OCMM_PROFILE = prev
    }
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("missing activeProfile is silently ignored", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "hoo/glm-5.2" } },
      activeProfile: "nonexistent",
    })
    const { config, activeProfile } = loadWithXdg(xdg)
    assert.equal(activeProfile, "nonexistent")
    assert.equal(config.agents?.orchestrator?.model, "hoo/glm-5.2")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile overlay wins over both user and project config", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-proj-"))
  mkdirSync(join(project, ".opencode"), { recursive: true })
  try {
    writeConfig(xdg, {
      agents: {
        orchestrator: { model: "hoo/glm-5.2", variant: "max" },
      },
      profiles: {
        alt: { agents: { orchestrator: { model: "openai/gpt-5.5" } } },
      },
      activeProfile: "alt",
    })
    writeFileSync(
      join(project, ".opencode", "ocmm.jsonc"),
      JSON.stringify({
        agents: {
          orchestrator: { model: "anthropic/claude-opus-4-7" },
        },
      }),
    )
    const { config } = loadWithXdg(xdg, project)
    assert.equal(config.agents?.orchestrator?.model, "openai/gpt-5.5")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("profile overlay replaces generic arrays (not union) for non-accumulator fields", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      intent: { enabled: true, skipAgents: ["a", "b"] },
      profiles: {
        strict: { intent: { enabled: true, skipAgents: ["c"] } },
      },
      activeProfile: "strict",
    })
    const { config } = loadWithXdg(xdg)
    assert.deepEqual(config.intent.skipAgents, ["c"])
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile overlay REPLACES fallbackModels, disabledAgents, and feature gates", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      disabledAgents: ["code-search"],
      disabledHooks: ["base-hook"],
      disabledTools: ["base-tool"],
      disabledSkills: ["base-skill"],
      disabledCommands: ["base-command"],
      disabledMcps: ["base-mcp"],
      fallbackModels: ["openai/gpt-5.4-mini"],
      profiles: {
        extra: {
          disabledAgents: ["doc-search"],
          disabledHooks: ["profile-hook"],
          disabledTools: ["profile-tool"],
          disabledSkills: ["profile-skill"],
          disabledCommands: ["profile-command"],
          disabledMcps: ["profile-mcp"],
          fallbackModels: ["anthropic/claude-haiku-4-5"],
        },
      },
      activeProfile: "extra",
    })
    const { config } = loadWithXdg(xdg)
    // Profiles fully own these arrays — a profile is a mode switch, not a
    // patch. If you want accumulation, list the full set in the profile.
    assert.deepEqual(config.disabledAgents, ["doc-search"])
    assert.deepEqual(config.disabledHooks, ["profile-hook"])
    assert.deepEqual(config.disabledTools, ["profile-tool"])
    assert.deepEqual(config.disabledSkills, ["profile-skill"])
    assert.deepEqual(config.disabledCommands, ["profile-command"])
    assert.deepEqual(config.disabledMcps, ["profile-mcp"])
    assert.deepEqual(config.fallbackModels, ["anthropic/claude-haiku-4-5"])
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile overlay replaces shared skills namespace arrays", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      skills: {
        sources: ["./base-skills"],
        enable: ["git-master"],
        disable: ["debugging"],
      },
      profiles: {
        focused: {
          skills: {
            sources: [{ path: "./profile-skills", recursive: false }],
            enable: ["ast-grep"],
            disable: ["frontend"],
          },
        },
      },
      activeProfile: "focused",
    })
    const { config } = loadWithXdg(xdg)
    assert.deepEqual(config.skills.sources, [
      { path: "./profile-skills", recursive: false },
    ])
    assert.deepEqual(config.skills.enable, ["ast-grep"])
    assert.deepEqual(config.skills.disable, ["frontend"])
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can override runtimeFallback settings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      runtimeFallback: { maxAttempts: 3, cooldownSeconds: 60 },
      profiles: {
        aggressive: { runtimeFallback: { maxAttempts: 10, cooldownSeconds: 5 } },
      },
      activeProfile: "aggressive",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.runtimeFallback.maxAttempts, 10)
    assert.equal(config.runtimeFallback.cooldownSeconds, 5)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can override hashline settings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      hashline: { enabled: false },
      profiles: {
        editing: { hashline: { enabled: true } },
      },
      activeProfile: "editing",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.hashline.enabled, true)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can override rules settings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      rules: { enabled: false, skipClaudeUserRules: false },
      profiles: {
        strict: { rules: { enabled: true, skipClaudeUserRules: true } },
      },
      activeProfile: "strict",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.rules.enabled, true)
    assert.equal(config.rules.skipClaudeUserRules, true)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can override mcp settings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      mcp: {
        enabled: false,
        envAllowlist: ["BASE_KEY"],
        websearch: { provider: "exa" },
      },
      profiles: {
        remote: {
          mcp: {
            enabled: true,
            envAllowlist: ["PROFILE_KEY"],
            websearch: { provider: "tavily" },
          },
        },
      },
      activeProfile: "remote",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.mcp.enabled, true)
    assert.deepEqual(config.mcp.envAllowlist, ["PROFILE_KEY"])
    assert.equal(config.mcp.websearch.provider, "tavily")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can override subagent.maxDepth", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      subagent: { maxDepth: 3 },
      profiles: {
        deep: { subagent: { maxDepth: 5 } },
      },
      activeProfile: "deep",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.subagent.maxDepth, 5)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can partially override runtimeFallback.subagent429 settings", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      runtimeFallback: {
        subagent429: {
          enabled: true,
          maxRetries: 5,
          providerScopes: { openai: "model" },
        },
      },
      profiles: {
        strict: {
          runtimeFallback: {
            subagent429: {
              maxRetries: 0,
              providerScopes: { openai: "provider" },
            },
          },
        },
      },
      activeProfile: "strict",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.runtimeFallback.subagent429.enabled, true)
    assert.equal(config.runtimeFallback.subagent429.maxRetries, 0)
    assert.deepEqual(config.runtimeFallback.subagent429.providerScopes, { openai: "provider" })
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile can override locale", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      locale: "en-US",
      profiles: {
        chinese: { locale: "zh-CN" },
      },
      activeProfile: "chinese",
    })
    const { config } = loadWithXdg(xdg)
    assert.equal(config.locale, "zh-CN")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("profile with no activeProfile does not apply", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "hoo/glm-5.2" } },
      profiles: {
        alt: { agents: { orchestrator: { model: "openai/gpt-5.5" } } },
      },
    })
    const { config, activeProfile } = loadWithXdg(xdg)
    assert.equal(activeProfile, undefined)
    assert.equal(config.agents?.orchestrator?.model, "hoo/glm-5.2")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("OCMM_PROFILE set to empty string falls back to config activeProfile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "hoo/glm-5.2" } },
      profiles: {
        a: { agents: { orchestrator: { model: "openai/gpt-5.5" } } },
      },
      activeProfile: "a",
    })
    const prev = process.env.OCMM_PROFILE
    process.env.OCMM_PROFILE = ""
    try {
      const { activeProfile } = loadWithXdg(xdg)
      assert.equal(activeProfile, "a")
    } finally {
      if (prev === undefined) delete process.env.OCMM_PROFILE
      else process.env.OCMM_PROFILE = prev
    }
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("OCMM_NO_PROFILE ignores even an invalid active review profile", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "hoo/glm-5.2" } },
      profiles: {
        a: { agents: { "reviewer-high": { model: "openai/gpt-5.5" } } },
      },
      activeProfile: "a",
    })
    const prevNo = process.env.OCMM_NO_PROFILE
    const prevProf = process.env.OCMM_PROFILE
    process.env.OCMM_NO_PROFILE = "1"
    process.env.OCMM_PROFILE = "a"
    try {
      const { config, activeProfile } = loadWithXdg(xdg)
      assert.equal(activeProfile, undefined)
      // Base config loads unchanged — profile overlay NOT applied
      assert.equal(config.agents?.orchestrator?.model, "hoo/glm-5.2")
    } finally {
      if (prevNo === undefined) delete process.env.OCMM_NO_PROFILE
      else process.env.OCMM_NO_PROFILE = prevNo
      if (prevProf === undefined) delete process.env.OCMM_PROFILE
      else process.env.OCMM_PROFILE = prevProf
    }
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("ProfileEntrySchema strips nested profiles/activeProfile fields (tolerant)", () => {
  const result = OcmmConfigSchema.safeParse({
    profiles: {
      bad: {
        profiles: { nested: {} },
        activeProfile: "nested",
      },
    },
  })
  assert.equal(result.success, true)
  const badProfile = result.data?.profiles?.bad as Record<string, unknown> | undefined
  assert.ok(badProfile, "profile entry kept")
  assert.ok(!("profiles" in (badProfile ?? {})), "nested profiles stripped")
  assert.ok(!("activeProfile" in (badProfile ?? {})), "nested activeProfile stripped")
})

test("ProfileEntrySchema accepts valid partial config fields", () => {
  const result = OcmmConfigSchema.safeParse({
    profiles: {
      light: {
        agents: {
          orchestrator: {
            model: "openai/gpt-5.4-mini",
            skills: ["git-master"],
            tools: { bash: false },
            promptAppend: "Keep answers brief.",
            temperature: 0.1,
            topP: 0.8,
            maxTokens: 8000,
            thinking: { type: "disabled" },
            reasoningEffort: "minimal",
          },
        },
        skills: {
          sources: ["./profile-skills"],
          enable: ["git-master"],
          disable: ["debugging"],
        },
        hashline: { enabled: true },
        rules: { enabled: true, skipClaudeUserRules: true },
        locale: "zh-Hans",
        mcp: {
          enabled: true,
          envAllowlist: ["EXA_API_KEY"],
          websearch: { provider: "exa" },
          servers: {
            docs: { type: "remote", url: "https://example.com/mcp" },
          },
        },
        debug: true,
        registerBuiltinAgents: true,
      },
    },
  })
  assert.equal(result.success, true)
})

test("loader migrates legacy base config before schema validation", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, { agents: { "oracle-high": { model: "openai/gpt-5.5" } } })
    const loaded = loadWithXdg(xdg)
    assert.equal(loaded.config.agents?.["oracle-high"], undefined)
    assert.equal(loaded.config.agents?.["oracle-2nd"]?.model, "openai/gpt-5.5")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("loader logs an active base-profile spelling conflict and returns defaults", () => {
  const xdg = makeTempXdg()
  const previousDebug = process.env.OCMM_DEBUG
  const originalWarn = console.warn
  const warnings: string[] = []
  process.env.OCMM_DEBUG = "1"
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")) }
  try {
    writeConfig(xdg, {
      agents: { "oracle-2nd": { model: "openai/gpt-5.5" } },
      profiles: { selected: { agents: { "oracle-second": { model: "anthropic/claude-opus-4-7" } } } },
      activeProfile: "selected",
    })
    const loaded = loadWithXdg(xdg)
    assert.deepEqual(loaded.config, defaultConfig())
    assert.match(warnings.join("\n"), /config conflict.*using defaults.*oracle-2nd.*oracle-second/is)
  } finally {
    console.warn = originalWarn
    if (previousDebug === undefined) delete process.env.OCMM_DEBUG
    else process.env.OCMM_DEBUG = previousDebug
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("inactive profiles tolerate invalid review names and preserve valid legacy aliases canonically", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "openai/gpt-5.5" } },
      profiles: {
        invalid: { agents: { "reviewer-high": { model: "anthropic/claude-opus-4-7" } } },
        legacy: { agents: { "oracle-high": { model: "openai/gpt-5.6-terra" } } },
        alias: { agents: { "oracle-second": { model: "openai/gpt-5.5" } } },
      },
    })
    const loaded = loadWithXdg(xdg)
    assert.equal(loaded.config.agents?.orchestrator?.model, "openai/gpt-5.5")
    assert.deepEqual(loaded.config.profiles.invalid?.agents, {})
    assert.equal(loaded.config.profiles.legacy?.agents?.["oracle-high"], undefined)
    assert.equal(loaded.config.profiles.legacy?.agents?.["oracle-2nd"]?.model, "openai/gpt-5.6-terra")
    assert.equal(loaded.config.profiles.alias?.agents?.["oracle-second"], undefined)
    assert.equal(loaded.config.profiles.alias?.agents?.["oracle-2nd"]?.model, "openai/gpt-5.5")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("project directory profile shadows an invalid lower inline profile", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-review-profile-project-"))
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "openai/gpt-5.5" } },
      profiles: { selected: { agents: { "reviewer-high": { model: "google/gemini-3.1-pro" } } } },
      activeProfile: "selected",
    })
    const directory = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "selected.jsonc"), JSON.stringify({
      agents: { orchestrator: { model: "anthropic/claude-opus-4-7" } },
    }))
    const loaded = loadWithXdg(xdg, project)
    assert.equal(loaded.config.agents?.orchestrator?.model, "anthropic/claude-opus-4-7")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test("selected active profiles migrate valid review aliases and tolerate review violations", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { orchestrator: { model: "openai/gpt-5.5" } },
      profiles: {
        selected: { agents: { "oracle-high": { model: "anthropic/claude-opus-4-7" } } },
      },
      activeProfile: "selected",
    })
    const valid = loadWithXdg(xdg)
    assert.equal(valid.config.agents?.["oracle-2nd"]?.model, "anthropic/claude-opus-4-7")

    writeConfig(xdg, {
      agents: { orchestrator: { model: "openai/gpt-5.5" } },
      profiles: {
        selected: { agents: { reviewer: { variants: { high: {} } } } },
      },
      activeProfile: "selected",
    })
    const tolerant = loadWithXdg(xdg).config
    assert.equal(tolerant.agents?.orchestrator?.model, "openai/gpt-5.5")
    assert.equal(tolerant.agents?.reviewer?.variants?.high, undefined)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("selected inline review profile can alias a base-defined review model", () => {
  const xdg = makeTempXdg()
  try {
    writeConfig(xdg, {
      agents: { "review-model": { model: "openai/gpt-5.6-sol" } },
      profiles: {
        selected: { agents: { "oracle-3rd": { alias: "review-model" } } },
      },
      activeProfile: "selected",
    })

    const loaded = loadWithXdg(xdg)
    assert.equal(loaded.config.agents?.["oracle-3rd"]?.alias, "review-model")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})

test("selected directory review profile can alias a base-defined review model", () => {
  const xdg = makeTempXdg()
  const project = mkdtempSync(join(tmpdir(), "ocmm-review-profile-alias-"))
  try {
    writeConfig(xdg, {
      agents: { "review-model": { model: "openai/gpt-5.6-sol" } },
      activeProfile: "selected",
    })
    const directory = join(project, ".opencode", "ocmm-profiles")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "selected.jsonc"), JSON.stringify({
      agents: { "oracle-3rd": { alias: "review-model" } },
    }))

    const loaded = loadWithXdg(xdg, project)
    assert.equal(loaded.config.agents?.["oracle-3rd"]?.alias, "review-model")
  } finally {
    rmSync(xdg, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
