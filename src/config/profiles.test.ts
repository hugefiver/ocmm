import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadConfig } from "./load.ts"
import { OcmmConfigSchema } from "./schema.ts"

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

test("ProfileEntrySchema rejects nested profiles/activeProfile fields", () => {
  const result = OcmmConfigSchema.safeParse({
    profiles: {
      bad: {
        profiles: { nested: {} },
        activeProfile: "nested",
      },
    },
  })
  assert.equal(result.success, false)
  const issuePaths = result.error!.issues.map((i) => i.path.join("."))
  assert.ok(
    issuePaths.some((p) => p === "profiles.bad"),
    `expected an issue at profiles.bad, got: ${JSON.stringify(issuePaths)}`,
  )
})

test("ProfileEntrySchema accepts valid partial config fields", () => {
  const result = OcmmConfigSchema.safeParse({
    profiles: {
      light: {
        agents: { orchestrator: { model: "openai/gpt-5.4-mini" } },
        debug: true,
        registerBuiltinAgents: true,
      },
    },
  })
  assert.equal(result.success, true)
})
