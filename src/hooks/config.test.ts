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
  const cfg: { agent: Record<string, unknown>; default_agent?: string } = { agent: {} }
  await handler(cfg, undefined)

  for (const a of BUILTIN_AGENTS) {
    const entry = cfg.agent[a.name] as Record<string, unknown> | undefined
    assert.ok(entry, `missing agent ${a.name}`)
    assert.equal(typeof entry!.model, "string")
    assert.match(entry!.model as string, /^[\w-]+\/[\w.-]+$/, `bad model for ${a.name}: ${entry!.model}`)
  }
})

test("config sets default_agent to orchestrator and disables OpenCode built-in primaries", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; default_agent?: string } = { agent: {} }
  await handler(cfg, undefined)
  assert.equal(cfg.default_agent, "orchestrator")
  assert.equal((cfg.agent.build as Record<string, unknown> | undefined)?.disable, true)
  assert.equal((cfg.agent.plan as Record<string, unknown> | undefined)?.disable, true)
  assert.equal((cfg.agent.orchestrator as Record<string, unknown> | undefined)?.mode, "primary")
})

test("builder is primary-only; planner can be both primary and delegated", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown> | undefined)?.mode, "primary")
  assert.equal((cfg.agent.builder as Record<string, unknown> | undefined)?.mode, "primary")
  assert.equal((cfg.agent.planner as Record<string, unknown> | undefined)?.mode, "all")
  assert.equal((cfg.agent.reviewer as Record<string, unknown> | undefined)?.mode, "subagent")
})

test("config injects configured locale guidance into primary-capable agents only", async () => {
  const c = { ...defaultConfig(), locale: "zh-CN" }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  for (const name of ["orchestrator", "builder", "planner"]) {
    const prompt = String((cfg.agent[name] as Record<string, unknown>).prompt)
    assert.match(prompt, /<ocmm-locale-guidance>/)
    assert.match(prompt, /Configured locale: zh-CN/)
    assert.match(prompt, /thinking process, visible planning, and conversation/)
  }

  const reviewerPrompt = String((cfg.agent.reviewer as Record<string, unknown>).prompt)
  assert.doesNotMatch(reviewerPrompt, /<ocmm-locale-guidance>/)
})

test("config injects user-language guidance when locale is unset", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  const prompt = String((cfg.agent.orchestrator as Record<string, unknown>).prompt)
  assert.match(prompt, /No locale is configured/)
  assert.match(prompt, /Infer the user's preferred language from their latest message/)
})

test("locale guidance preserves existing primary prompts", async () => {
  const c = { ...defaultConfig(), locale: "en-US" }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg = {
    agent: {
      orchestrator: { prompt: "Custom primary prompt." },
    },
  }
  await handler(cfg, undefined)

  const prompt = String((cfg.agent.orchestrator as Record<string, unknown>).prompt)
  assert.match(prompt, /Configured locale: en-US/)
  assert.match(prompt, /Custom primary prompt\./)
  assert.equal(prompt.match(/<ocmm-locale-guidance>/g)?.length, 1)
})

test("config respects user-set defaultAgent and disableOpenCodeBuiltinAgents=false", async () => {
  const cfg2 = { ...defaultConfig(), defaultAgent: "builder" as const, disableOpenCodeBuiltinAgents: false }
  const handler2 = createConfigHandler({ getConfig: () => cfg2 })
  const out: { agent: Record<string, unknown>; default_agent?: string } = { agent: {} }
  await handler2(out, undefined)
  assert.equal(out.default_agent, "builder")
  assert.notEqual((out.agent.build as Record<string, unknown> | undefined)?.disable, true)
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

test("orchestrator prompt requires intent verbalization", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  const prompt = String((cfg.agent.orchestrator as Record<string, unknown>).prompt)
  assert.match(prompt, /Intent Verbalization/)
  assert.match(prompt, /我读到这是/)
  assert.match(prompt, /I read this as/)
})

test("config registers OMO-compatible direct delegation aliases", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  // oracle is now an independent builtin with cross-gen requirement (not a reviewer alias).
  assert.notEqual(cfg.agent.oracle, cfg.agent.reviewer)
  // explore remains a compatibility alias for code-search.
  assert.deepEqual(cfg.agent.explore, cfg.agent["code-search"])
  assert.ok(cfg.agent.deep, "@deep should be available as category-subagent")
  assert.ok(cfg.agent.quick, "@quick should be available as category-subagent")
})

test("config applies default auto-approve permissions", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; permission?: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.deepEqual(cfg.permission, { webfetch: "allow", external_directory: "allow", task: "deny" })
  assert.equal(((cfg.agent.orchestrator as Record<string, unknown>).permission as Record<string, unknown>).task, "allow")
  assert.equal(((cfg.agent.builder as Record<string, unknown>).permission as Record<string, unknown>).question, "allow")
  assert.equal(((cfg.agent.planner as Record<string, unknown>).permission as Record<string, unknown>)["task_*"], "allow")
  assert.equal(((cfg.agent.reviewer as Record<string, unknown>).permission as Record<string, unknown>).task, "deny")
  assert.equal(((cfg.agent["doc-search"] as Record<string, unknown>).permission as Record<string, unknown>)["grep_app_*"], "allow")
})

test("config preserves explicit permission overrides", async () => {
  const c = {
    ...defaultConfig(),
    agents: {
      orchestrator: { permission: { task: "deny" as const, custom: "allow" as const } },
      reviewer: { tools: { task: true } },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown>; permission?: Record<string, unknown> } = {
    agent: {},
    permission: { webfetch: "deny" },
  }
  await handler(cfg, undefined)

  assert.equal(cfg.permission?.webfetch, "deny")
  assert.equal(cfg.permission?.external_directory, "allow")
  assert.equal(((cfg.agent.orchestrator as Record<string, unknown>).permission as Record<string, unknown>).task, "deny")
  assert.equal(((cfg.agent.orchestrator as Record<string, unknown>).permission as Record<string, unknown>).custom, "allow")
  assert.equal(((cfg.agent.reviewer as Record<string, unknown>).permission as Record<string, unknown>).task, "allow")
})

test("disabledAgents skips OMO-compatible aliases", async () => {
  const c = { ...defaultConfig(), disabledAgents: ["oracle", "explore", "deep"] }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.ok(cfg.agent.reviewer)
  assert.ok(cfg.agent["code-search"])
  assert.equal(cfg.agent.oracle, undefined)
  assert.equal(cfg.agent.explore, undefined)
  assert.equal(cfg.agent.deep, undefined)
})

test("user model override selects specialized deepwork prompt variant", async () => {
  const c = {
    ...defaultConfig(),
    agents: {
      orchestrator: { model: "zhipu/glm-5.1" },
      builder: { model: "openai/codex-mini-latest" },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.match(String((cfg.agent.orchestrator as Record<string, unknown>).prompt), /GLM 5\.2 CALIBRATION/)
  assert.match(String((cfg.agent.builder as Record<string, unknown>).prompt), /Expert coding agent/)
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

test("config upgrades only catalog-confirmed GPT Sol and Terra lanes", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: {
      openai: {
        models: {
          "gpt-5.6-sol": {},
          "gpt-5.7-sol": {},
          "gpt-5.6-terra": {},
          "gpt-5.7-terra": {},
        },
      },
    },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "openai/gpt-5.7-sol")
  assert.equal((cfg.agent.reviewer as Record<string, unknown>).model, "openai/gpt-5.7-sol")
  assert.equal((cfg.agent.oracle as Record<string, unknown>).model, "openai/gpt-5.7-terra")
  assert.equal((cfg.agent.deep as Record<string, unknown>).model, "openai/gpt-5.7-sol")
  assert.equal((cfg.agent.complex as Record<string, unknown>).model, "openai/gpt-5.7-terra")
  assert.equal((cfg.agent["normal-task"] as Record<string, unknown>).model, "openai/gpt-5.7-terra")
  assert.doesNotMatch(String((cfg.agent.orchestrator as Record<string, unknown>).prompt), /GPT-5\.6 EXECUTION CALIBRATION/)
})

test("config layers the GPT-5.6 specialization only for a GPT-5.6 model", async () => {
  const c = {
    ...defaultConfig(),
    agents: { builder: { model: "openai/gpt-5.6-sol" } },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  const prompt = String((cfg.agent.builder as Record<string, unknown>).prompt)
  assert.match(prompt, /GPT-5\.6 EXECUTION CALIBRATION/)
  assert.match(prompt, /Outcome-first/)
})

test("existing host models drive prompt calibration", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg = {
    agent: {
      builder: { model: "openai/gpt-5.6-sol" },
    },
  }
  await handler(cfg, undefined)

  const prompt = String((cfg.agent.builder as Record<string, unknown>).prompt)
  assert.match(prompt, /GPT-5\.6 EXECUTION CALIBRATION/)
})

test("description-only oracle inherits the explicit reviewer model before catalog promotion", async () => {
  const configured = {
    ...defaultConfig(),
    agents: {
      reviewer: { model: "anthropic/claude-opus-4-7" },
      oracle: { description: "custom oracle" },
    },
  }
  const registeredAgentModels = new Map<string, string>()
  const target = {
    agent: {},
    provider: { openai: { models: { "gpt-5.6-terra": {} } } },
  }
  await createConfigHandler({ getConfig: () => configured, registeredAgentModels })(target, undefined)

  assert.equal((target.agent.oracle as Record<string, unknown>).model, "anthropic/claude-opus-4-7")
  assert.equal(registeredAgentModels.get("oracle"), "anthropic/claude-opus-4-7")
})

test("multi-hop aliases preserve the effective model and prompt calibration", async () => {
  const configured = {
    ...defaultConfig(),
    agents: {
      reviewer: { alias: "review-policy-a" },
      "review-policy-a": { alias: "review-policy-b" },
      "review-policy-b": { alias: "review-model" },
      "review-model": { model: "openai/gpt-5.6-sol", variant: "xhigh" as const },
      oracle: { description: "custom oracle" },
    },
  }
  const registeredAgentModels = new Map<string, string>()
  const target = {
    agent: {},
    provider: {
      openai: { models: { "gpt-5.6-sol": {}, "gpt-5.7-sol": {}, "gpt-5.7-terra": {} } },
    },
  }

  await createConfigHandler({ getConfig: () => configured, registeredAgentModels })(target, undefined)

  for (const name of ["reviewer", "oracle"]) {
    const entry = target.agent[name as keyof typeof target.agent] as Record<string, unknown>
    assert.equal(entry.model, "openai/gpt-5.6-sol")
    assert.match(String(entry.prompt), /GPT-5\.6 EXECUTION CALIBRATION/)
    assert.equal(registeredAgentModels.get(name), "openai/gpt-5.6-sol")
  }
})

test("registeredAgentModels is rebuilt from final agents and compatibility aliases", async () => {
  const registeredAgentModels = new Map<string, string>([["stale", "stale/model"]])
  const handler = createConfigHandler({
    getConfig: () => defaultConfig(),
    registeredAgentModels,
  })
  const cfg: { agent: Record<string, unknown> } = {
    agent: { builder: { model: "openai/gpt-5.6-sol" } },
  }
  await handler(cfg, undefined)

  assert.equal(registeredAgentModels.has("stale"), false)
  assert.equal(registeredAgentModels.get("builder"), "openai/gpt-5.6-sol")
  assert.equal(
    registeredAgentModels.get("explore"),
    (cfg.agent.explore as Record<string, unknown>).model,
  )

  const disabled = { ...defaultConfig(), registerBuiltinAgents: false }
  await createConfigHandler({
    getConfig: () => disabled,
    registeredAgentModels,
  })({ agent: {} }, undefined)
  assert.equal(registeredAgentModels.size, 0)
})

test("config keeps existing defaults without a matching GPT-5.6 catalog entry", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: { openai: { models: { "gpt-5.5": {} } } },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "anthropic/claude-opus-4-7")
  assert.equal((cfg.agent.deep as Record<string, unknown>).model, "openai/gpt-5.5")
  assert.equal((cfg.agent.complex as Record<string, unknown>).model, "openai/gpt-5.5")
})

test("config upgrades GLM 5.1 fallbacks only from a catalog-confirmed GLM 5.2+ model", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: { zhipu: { models: { "glm-5.1": {}, "glm-5.2": {}, "glm-5.3": {} } } },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "zhipu/glm-5.3")
  assert.equal((cfg.agent.deep as Record<string, unknown>).model, "zhipu/glm-5.3")
  assert.notEqual((cfg.agent.builder as Record<string, unknown>).model, "zhipu/glm-5.3")
  assert.notEqual((cfg.agent.complex as Record<string, unknown>).model, "zhipu/glm-5.3")
})

test("config keeps GLM 5.1 baseline without a newer GLM catalog entry", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: { zhipu: { models: { "glm-5.1": {} } } },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "anthropic/claude-opus-4-7")
  assert.equal((cfg.agent.deep as Record<string, unknown>).model, "openai/gpt-5.5")
})

test("explicit and existing agent models suppress GLM catalog replacement and prompt specialization", async () => {
  const configured = {
    ...defaultConfig(),
    agents: { orchestrator: { model: "zhipu/glm-5.1" } },
  }
  const handler = createConfigHandler({ getConfig: () => configured })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: { builder: { model: "user/custom-model" } },
    provider: { zhipu: { models: { "glm-5.2": {} } } },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "zhipu/glm-5.1")
  assert.equal((cfg.agent.builder as Record<string, unknown>).model, "user/custom-model")
  assert.doesNotMatch(String((cfg.agent.builder as Record<string, unknown>).prompt), /GLM 5\.2 CALIBRATION/)
})

test("GPT catalog lanes take precedence over a GLM 5.2 catalog upgrade", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: {
      openai: { models: { "gpt-5.6-sol": {} } },
      zhipu: { models: { "glm-5.2": {} } },
    },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "openai/gpt-5.6-sol")
  assert.equal((cfg.agent.deep as Record<string, unknown>).model, "openai/gpt-5.6-sol")
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
    const cfg: {
      agent: Record<string, unknown>
      skills: { paths: string[]; urls: string[] }
      command?: Record<string, Record<string, unknown>>
    } = {
      agent: {},
      skills: { paths: [join(root, "existing")], urls: ["https://example.com/skills"] },
    }

    await handler(cfg, undefined)

    assert.deepEqual(cfg.skills.urls, ["https://example.com/skills"])
    assert.deepEqual(cfg.skills.paths.sort(), [root, join(root, "existing")].sort())
    assert.ok(cfg.command?.["git-master"], "enabled shared skill should be registered as slash command")
    assert.equal(cfg.command?.debugging, undefined, "disabled shared skill should not register command")
    assert.match(String(cfg.command?.["git-master"]?.template), /<skill-instruction>/)
    assert.match(String(cfg.command?.["git-master"]?.template), /Base directory for this skill:/)
    assert.doesNotMatch(String(cfg.command?.["git-master"]?.template), /^---/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("config registers v1 injected skills as slash commands in v1 workflow", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-hook-v1-skills-"))
  try {
    writeSkill(root, join("v1", "brainstorming"), "brainstorming", "Brainstorm")
    writeSkill(root, join("v1", "writing-plans"), "writing-plans", "Plans")
    writeSkill(root, join("v1", "subagent-driven-development"), "subagent-driven-development", "Subagents")
    writeSkill(root, join("v1", "requesting-code-review"), "requesting-code-review", "Request review")
    writeSkill(root, join("v1", "receiving-code-review"), "receiving-code-review", "Receive review")

    const c = { ...defaultConfig(), workflow: "v1" as const, disabledCommands: ["writing-plans"] }
    const handler = createConfigHandler({ getConfig: () => c, skillsRoot: root })
    const cfg: {
      agent: Record<string, unknown>
      command?: Record<string, Record<string, unknown>>
      skills?: { paths?: string[] }
    } = { agent: {} }

    await handler(cfg, undefined)

    assert.ok(cfg.skills?.paths?.includes(join(root, "v1")))
    assert.ok(cfg.command?.brainstorming)
    assert.match(String(cfg.command?.brainstorming?.template), /<user-request>\n\$ARGUMENTS\n<\/user-request>/)
    assert.equal(cfg.command?.["writing-plans"], undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("config registers builtin loop slash commands and honors disabledCommands", async () => {
  const c = { ...defaultConfig(), disabledCommands: ["dwloop"] }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown>; command?: Record<string, Record<string, unknown>> } = { agent: {} }

  await handler(cfg, undefined)

  assert.ok(cfg.command?.["ralph-loop"])
  assert.ok(cfg.command?.["audit-loop"])
  assert.equal(cfg.command?.dwloop, undefined)
  assert.equal(cfg.command?.["ulw-loop"], undefined)
  assert.match(String(cfg.command?.["ralph-loop"]?.template), /Idle auto-continuation: when `idleContinuation\.enabled` is true/)
  assert.match(String(cfg.command?.["audit-loop"]?.template), /audit\/deepwork loop protocol/)
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
