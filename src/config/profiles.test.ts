import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadConfig } from "./load.ts"
import { OcmmConfigSchema, defaultConfig } from "./schema.ts"

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
