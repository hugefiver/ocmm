import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_AGENTS } from "../data/agents.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"

loadAllPrompts(join(process.cwd(), "prompts"), "omo")

test("config registers all built-in agents with provider/model strings", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  for (const a of BUILTIN_AGENTS) {
    const entry = cfg.agent[a.name] as Record<string, unknown> | undefined
    assert.ok(entry, `missing agent ${a.name}`)
    assert.equal(typeof entry!.model, "string")
    assert.match(entry!.model as string, /^[\w-]+\/[\w.-]+$/, `bad model for ${a.name}: ${entry!.model}`)
  }
})

test("config attaches deepwork prompt to built-in agents", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  for (const a of BUILTIN_AGENTS) {
    const entry = cfg.agent[a.name] as Record<string, unknown> | undefined
    assert.ok(entry, `missing agent ${a.name}`)
    assert.equal(typeof entry!.prompt, "string", `agent ${a.name} should have prompt`)
    assert.ok((entry!.prompt as string).length > 0, `agent ${a.name} prompt empty`)
  }
})

test("planner agent gets planner variant prompt", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  const entry = cfg.agent.planner as Record<string, unknown>
  assert.ok(typeof entry.prompt === "string")
})

test("functional agents compose role prompt with model-family deepwork prompt", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  const reviewerPrompt = String((cfg.agent.reviewer as Record<string, unknown>).prompt)
  assert.match(reviewerPrompt, /Agent Role: reviewer/)
  assert.match(reviewerPrompt, /strategic technical advisor/i)
  assert.match(reviewerPrompt, /workflow-model-calibration/)
  assert.match(reviewerPrompt, /DEEPWORK MODE ENABLED/)

  const clarifierPrompt = String((cfg.agent.clarifier as Record<string, unknown>).prompt)
  assert.match(clarifierPrompt, /Agent Role: clarifier/)
  assert.match(clarifierPrompt, /pre-planning consultant/i)
})

test("user model override selects specialized deepwork prompt variant", async () => {
  const c = {
    ...defaultConfig(),
    agents: {
      orchestrator: { model: "zhipu/glm-5.1" },
      worker: { model: "openai/codex-mini-latest" },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.match(String((cfg.agent.orchestrator as Record<string, unknown>).prompt), /GLM 5\.2 CALIBRATION/)
  assert.match(String((cfg.agent.worker as Record<string, unknown>).prompt), /Expert coding agent/)
})

test("config does not clobber an existing user-set model", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg = {
    agent: {
      orchestrator: { model: "user/custom-model", description: "user-set" },
    },
  }
  await handler(cfg, undefined)
  const entry = cfg.agent.orchestrator as Record<string, unknown>
  assert.equal(entry.model, "user/custom-model")
  assert.equal(entry.description, "user-set")
})

test("disabledAgents skips registration", async () => {
  const c = { ...defaultConfig(), disabledAgents: ["reviewer"] }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  assert.equal(cfg.agent.reviewer, undefined)
  assert.ok(cfg.agent.orchestrator)
})

test("user agent override wins (model shorthand)", async () => {
  const c = {
    ...defaultConfig(),
    agents: {
      reviewer: { model: "anthropic/claude-opus-4-7" },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  const e = cfg.agent.reviewer as Record<string, unknown>
  assert.equal(e.model, "anthropic/claude-opus-4-7")
})

test("registerBuiltinAgents=false leaves agent map untouched", async () => {
  const c = { ...defaultConfig(), registerBuiltinAgents: false }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg = { agent: {} }
  await handler(cfg, undefined)
  assert.deepEqual(cfg.agent, {})
})

test("config registers shared skill paths and preserves existing urls", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-hook-skills-"))
  try {
    writeSkill(root, "git-master", "git-master")
    writeSkill(root, "debugging", "debugging")
    writeSkill(root, "frontend", "frontend")

    const c = {
      ...defaultConfig(),
      skills: { sources: [], enable: ["git-master", "debugging"], disable: ["debugging"] },
    }
    const handler = createConfigHandler({ getConfig: () => c, skillsRoot: root })
    const cfg: { agent: Record<string, unknown>; skills: { paths: string[]; urls: string[] } } = {
      agent: {},
      skills: { paths: [join(root, "existing")], urls: ["https://example.com/skills"] },
    }

    await handler(cfg, undefined)

    assert.deepEqual(cfg.skills.urls, ["https://example.com/skills"])
    assert.deepEqual(cfg.skills.paths.sort(), [join(root, "existing"), join(root, "git-master")].sort())
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("config registers MCP servers and preserves user-disabled entries", async () => {
  const c = {
    ...defaultConfig(),
    disabledMcps: ["grep_app"],
    mcp: {
      enabled: true,
      envAllowlist: [],
      websearch: { provider: "exa" as const },
      servers: {
        local_docs: { type: "remote" as const, url: "https://docs.example/mcp", enabled: true },
      },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown>; mcp: Record<string, unknown> } = {
    agent: {},
    mcp: { context7: { enabled: false } },
  }

  await handler(cfg, undefined)

  assert.equal(cfg.mcp.websearch && typeof cfg.mcp.websearch === "object", true)
  assert.equal(cfg.mcp.grep_app, undefined)
  assert.deepEqual(cfg.mcp.context7, { enabled: false })
  assert.equal((cfg.mcp.local_docs as Record<string, unknown>).type, "remote")
})

function writeSkill(root: string, dir: string, name: string): void {
  const skillDir = join(root, dir)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n`,
  )
}
