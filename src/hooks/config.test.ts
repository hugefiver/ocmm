import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_AGENTS } from "../data/agents.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"

loadAllPrompts(join(process.cwd(), "prompts"), "omo")

const UTILITY_TASK_RULES = {
  "*": "deny",
  quick: "allow",
  "code-search": "allow",
  explore: "allow",
  "doc-search": "allow",
  research: "allow",
  "media-reader": "allow",
} as const

const READ_ONLY_TASK_RULES = {
  "*": "deny",
  "code-search": "allow",
  explore: "allow",
  "doc-search": "allow",
  research: "allow",
  "media-reader": "allow",
} as const

const PLANNER_TASK_RULES = {
  ...READ_ONLY_TASK_RULES,
  reviewer: "allow",
} as const

const LOCAL_COORDINATOR_TASK_RULES = {
  ...UTILITY_TASK_RULES,
  coding: "allow",
  frontend: "allow",
  "hard-reasoning": "allow",
  creative: "allow",
  documenting: "allow",
} as const

function agentPermission(agentMap: Record<string, unknown>, name: string): Record<string, unknown> {
  const entry = agentMap[name] as Record<string, unknown>
  const permission = entry.permission
  assert.ok(permission && typeof permission === "object" && !Array.isArray(permission), `missing permission for ${name}`)
  return permission as Record<string, unknown>
}

function assertExactTaskRules(actual: unknown, expected: Record<string, string>, label: string): void {
  assert.ok(actual && typeof actual === "object" && !Array.isArray(actual), `${label} task rules must be granular`)
  assert.deepEqual(Object.entries(actual as Record<string, unknown>), Object.entries(expected), `${label} task rule order`)
}

function delegationContract(agentMap: Record<string, unknown>, name: string): string {
  const prompt = String((agentMap[name] as Record<string, unknown>).prompt)
  const match = prompt.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
  assert.ok(match, `missing delegation contract for ${name}`)
  return match[1]!
}

const COMPRESSION_POLICY_TAG = "ocmm-subagent-compression-policy"
const REVIEW_SESSION_POLICY_TAG = "ocmm-review-session-efficiency-policy"

function taggedPolicy(agentMap: Record<string, unknown>, name: string, tag: string): string {
  const prompt = String((agentMap[name] as Record<string, unknown>).prompt)
  const openingTags = prompt.match(new RegExp(`<${tag}>`, "g")) ?? []
  const closingTags = prompt.match(new RegExp(`</${tag}>`, "g")) ?? []
  assert.equal(openingTags.length, 1, `expected exactly one ${tag} block for ${name}`)
  assert.equal(closingTags.length, 1, `expected exactly one closing ${tag} block for ${name}`)
  const match = prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  assert.ok(match, `missing ${tag} block for ${name}`)
  return match[1]!
}

function compressionPolicy(agentMap: Record<string, unknown>, name: string): string {
  return taggedPolicy(agentMap, name, COMPRESSION_POLICY_TAG)
}

function reviewSessionPolicy(agentMap: Record<string, unknown>, name: string): string {
  return taggedPolicy(agentMap, name, REVIEW_SESSION_POLICY_TAG)
}

function publishedRoute(
  registry: ReturnType<typeof createEffectiveRouteRegistry>,
  name: string,
) {
  const route = registry.snapshot().routes.get(name)
  assert.ok(route, `missing published route for ${name}`)
  return route
}

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
  assert.ok(cfg.agent["oracle-2nd"], "oracle-2nd should be registered as subagent")
  assertExactTaskRules(
    ((cfg.agent["oracle-2nd"] as Record<string, unknown>).permission as Record<string, unknown>).task,
    READ_ONLY_TASK_RULES,
    "oracle-2nd read-only allowlist",
  )
  // oracle-2nd reuses reviewer prompt/calibration.
  assert.match(String((cfg.agent["oracle-2nd"] as Record<string, unknown>).prompt), /Agent Role: reviewer|READ-ONLY REVIEWER/)
  // explore remains a compatibility alias for code-search.
  assert.deepEqual(cfg.agent.explore, cfg.agent["code-search"])
  assert.ok(cfg.agent.deep, "@deep should be available as category-subagent")
  assert.ok(cfg.agent.quick, "@quick should be available as category-subagent")
})

test("config applies the exact flat-workflow task permission graph", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; permission?: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.deepEqual(cfg.permission, { webfetch: "allow", external_directory: "allow", task: "deny" })
  for (const name of ["orchestrator", "builder"]) {
    assert.equal(agentPermission(cfg.agent, name).task, "allow", `${name} must remain primary-capable`)
  }
  for (const name of ["quick", "code-search", "explore", "doc-search", "research", "media-reader"]) {
    assert.equal(agentPermission(cfg.agent, name).task, "deny", `${name} must be a terminal leaf`)
  }
  for (const name of ["coding", "normal-task", "frontend", "creative", "hard-reasoning", "documenting"]) {
    assertExactTaskRules(agentPermission(cfg.agent, name).task, UTILITY_TASK_RULES, `${name} utility allowlist`)
  }
  assertExactTaskRules(agentPermission(cfg.agent, "planner").task, PLANNER_TASK_RULES, "planner reviewer exception")
  assert.equal(agentPermission(cfg.agent, "planner")["task_*"], undefined, "planner must not retain a broad task wildcard")
  assertExactTaskRules(agentPermission(cfg.agent, "clarifier").task, READ_ONLY_TASK_RULES, "clarifier read-only allowlist")
  assert.equal(agentPermission(cfg.agent, "clarifier")["task_*"], undefined, "clarifier must not retain a broad task wildcard")
  for (const name of ["reviewer", "oracle", "oracle-2nd", "plan-critic"]) {
    assertExactTaskRules(agentPermission(cfg.agent, name).task, READ_ONLY_TASK_RULES, `${name} read-only allowlist`)
  }
  for (const name of ["deep", "complex"]) {
    assertExactTaskRules(agentPermission(cfg.agent, name).task, LOCAL_COORDINATOR_TASK_RULES, `${name} local-coordinator allowlist`)
  }
  assert.equal(agentPermission(cfg.agent, "doc-search")["grep_app_*"], "allow")
})

test("config preserves scalar and granular explicit permission overrides", async () => {
  const configured = {
    ...defaultConfig(),
    agents: {
      orchestrator: { permission: { task: "deny" as const, custom: "allow" as const } },
      reviewer: { tools: { task: true } },
      oracle: { variants: { high: "max" as const } },
    },
  }
  const hostTaskOverride = { "*": "allow" as const, planner: "allow" as const }
  const handler = createConfigHandler({ getConfig: () => configured })
  const cfg: { agent: Record<string, unknown>; permission?: Record<string, unknown> } = {
    agent: {
      coding: { permission: { task: hostTaskOverride } },
      "oracle-high": { permission: { task: hostTaskOverride } },
    },
    permission: { webfetch: "deny" },
  }
  await handler(cfg, undefined)

  assert.equal(cfg.permission?.webfetch, "deny")
  assert.equal(cfg.permission?.external_directory, "allow")
  assert.equal(agentPermission(cfg.agent, "orchestrator").task, "deny")
  assert.equal(agentPermission(cfg.agent, "orchestrator").custom, "allow")
  assert.equal(agentPermission(cfg.agent, "reviewer").task, "allow")
  assertExactTaskRules(agentPermission(cfg.agent, "coding").task, hostTaskOverride, "host granular override")
  assertExactTaskRules(agentPermission(cfg.agent, "oracle-high").task, hostTaskOverride, "host generated-review override")
})

test("config does not impose built-in task defaults on custom agents", async () => {
  const configured = {
    ...defaultConfig(),
    agents: { "custom-worker": { model: "openai/gpt-5.5" } },
  }
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => configured })(cfg, undefined)

  assert.ok(cfg.agent["custom-worker"])
  assert.equal((cfg.agent["custom-worker"] as Record<string, unknown>).permission, undefined)
})

test("config appends authoritative contracts to non-primary builtin agents", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  await handler(cfg, undefined)

  for (const name of ["orchestrator", "builder"]) {
    assert.doesNotMatch(String((cfg.agent[name] as Record<string, unknown>).prompt), /ocmm-delegation-contract/)
  }

  assert.match(delegationContract(cfg.agent, "code-search"), /utility leaf agent/i)
  assert.match(delegationContract(cfg.agent, "code-search"), /Do not dispatch any subagent/)

  const planner = delegationContract(cfg.agent, "planner")
  assert.match(planner, /Allowed utility targets: `code-search`, `explore`, `doc-search`, `research`, `media-reader`\./)
  assert.match(planner, /exactly the unsuffixed `reviewer` at most once/i)
  assert.match(planner, /concrete blocking architecture, security, or performance decision/i)
  assert.match(planner, /`quick` is forbidden/)
  assert.match(planner, /Return the completed plan to the caller/)
  assert.match(planner, /plan-critic.*orchestrator-owned/i)
})

test("config scopes conservative compression to managed subagent execution", async () => {
  const configured = {
    ...defaultConfig(),
    agents: { "custom-worker": { model: "openai/gpt-5.5" } },
  }
  const target: { agent: Record<string, unknown> } = {
    agent: { "custom-worker": { prompt: "Host custom prompt." } },
  }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)

  for (const name of ["orchestrator", "builder", "custom-worker"]) {
    const prompt = String((target.agent[name] as Record<string, unknown>).prompt)
    assert.doesNotMatch(prompt, /<ocmm-subagent-compression-policy>/, name)
  }
  assert.match(String((target.agent["custom-worker"] as Record<string, unknown>).prompt), /Host custom prompt\./)

  const ordinary = compressionPolicy(target.agent, "code-search")
  assert.match(ordinary, /only when the current execution is a subagent session and a `compress` tool is available/i)
  assert.match(ordinary, /If `compress` is unavailable, do not propose, simulate, or attempt compression/i)
  assert.match(ordinary, /long conversation, a high message count, one large tool result, or a stage boundary is not sufficient/i)
  assert.match(ordinary, /When no trustworthy capacity signal or size estimate exists, do not compress proactively/i)
  assert.match(ordinary, /next bounded task cannot fit/i)
  assert.match(ordinary, /smallest closed range needed to continue safely/i)
  assert.match(ordinary, /task goal, constraints, current state, pending work, decisions, paths, interfaces, and necessary evidence/i)
  assert.match(ordinary, /Never compress the active phase, unresolved errors, or source material/i)
  assert.match(ordinary, /Completed large-exploration recommendation/i)
  assert.match(ordinary, /exploration is completely finished/i)
  assert.match(ordinary, /more than 100k tokens of source material/i)
  assert.match(ordinary, /findings, paths, decisions, constraints, and exact evidence.*materialized/i)
  assert.match(ordinary, /same subagent will continue into a subsequent synthesis, planning, implementation, or review phase/i)
  assert.match(ordinary, /If exploration completes the assignment.*do not compress/i)
  assert.match(ordinary, /Never compress during an active exploration/i)
  assert.doesNotMatch(ordinary, /130k|50k|ten additional model turns/i)
  assert.doesNotMatch(ordinary, /Additional continued Reviewer\/Oracle proactive exception/i)

  const planner = compressionPolicy(target.agent, "planner")
  assert.match(planner, /subagent session/i)
  assert.doesNotMatch(planner, /Additional continued Reviewer\/Oracle proactive exception/i)
  assert.equal((target.agent.planner as Record<string, unknown>).mode, "all")
})

test("only parsed Reviewer and Oracle identities receive proactive compression guardrails", async () => {
  const configured = {
    ...defaultConfig(),
    agents: {
      reviewer: { variants: { high: "max" as const } },
      "oracle-3rd": {
        model: "anthropic/claude-opus-4-7",
        variants: { max: "max" as const },
      },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)

  for (const name of ["reviewer", "reviewer-high", "oracle", "oracle-2nd", "oracle-3rd-max"]) {
    const policy = compressionPolicy(target.agent, name)
    assert.match(policy, /Completed large-exploration recommendation/i, name)
    assert.match(policy, /more than 100k tokens of source material/i, name)
    assert.match(policy, /common emergency and completed >100k exploration paths remain independently available/i, name)
    assert.match(policy, /Additional continued Reviewer\/Oracle proactive exception/i, name)
    assert.match(policy, /other closed review material/i, name)
    assert.match(policy, /continued this same review session inside the current review stage/i, name)
    assert.match(policy, /rather than starting a fresh consultation or crossing a stage boundary/i, name)
    assert.match(policy, /substantial phase has closed/i, name)
    assert.match(policy, /materialized in a response or durable note/i, name)
    assert.match(policy, /selected range is closed and is no longer needed verbatim/i, name)
    assert.match(policy, /stage-ending compression with no expected follow-up is forbidden/i, name)
    assert.match(policy, /approximately 130k or more current context/i, name)
    assert.match(policy, /at least 50k removable closed context/i, name)
    assert.match(policy, /about ten additional model turns/i, name)
    assert.match(policy, /If any estimate is unavailable, do not invent it/i, name)
    assert.match(policy, /single completed tool call is not a phase boundary/i, name)
  }

  for (const name of ["planner", "plan-critic", "clarifier", "code-search", "creative"]) {
    assert.doesNotMatch(compressionPolicy(target.agent, name), /Additional continued Reviewer\/Oracle proactive exception/i, name)
  }
})

test("only orchestrator receives deterministic review-session reuse guidance", async () => {
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(target, undefined)

  const policy = reviewSessionPolicy(target.agent, "orchestrator")
  assert.match(policy, /continue the same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage/i)
  assert.match(policy, /plan-critic rejection followed by a corrected version of the same plan remains the same stage/i)
  assert.match(policy, /reviewer findings followed by fixes to the same implementation review also remain the same stage/i)
  assert.match(policy, /start a fresh session at every stage boundary/i)
  assert.match(policy, /design review to plan review/i)
  assert.match(policy, /plan-critic approval to implementation/i)
  assert.match(policy, /implementation to final acceptance/i)
  assert.match(policy, /role, artifact, or review objective/i)
  assert.match(policy, /prior context is unavailable or invalid/i)
  assert.match(policy, /continuation fails/i)
  assert.match(policy, /intentionally independent evidence is required/i)
  assert.match(policy, /Do not fan out additional reviewers merely because profiles or tiers are configured/i)
  assert.match(policy, /current authoritative artifact path\/revision/i)
  assert.match(policy, /files changed since the previous pass/i)
  assert.match(policy, /changed plan sections when applicable/i)
  assert.match(policy, /new or updated evidence/i)
  assert.match(policy, /never excuses the reviewer or plan-critic from reading the current authoritative artifact/i)
  assert.match(policy, /Do not paste the whole accumulated conversation/i)
  assert.match(policy, /timeout, partial response, stale-revision receipt, or failed continuation is not approval/i)
  assert.doesNotMatch(policy, /ses_[A-Za-z0-9]+|Date\.now|\d{4}-\d{2}-\d{2}T/i)

  for (const name of ["builder", "planner", "reviewer", "plan-critic", "coding"]) {
    const prompt = String((target.agent[name] as Record<string, unknown>).prompt)
    assert.doesNotMatch(prompt, /<ocmm-review-session-efficiency-policy>/, name)
  }
})

test("compression policy is independent of workflow and model family", async () => {
  const cases = [
    { workflow: "omo" as const, model: "anthropic/claude-sonnet-4-6" },
    { workflow: "v1" as const, model: "zhipu/glm-5.1" },
  ]

  try {
    for (const { workflow, model } of cases) {
      loadAllPrompts(join(process.cwd(), "prompts"), workflow)
      const configured = {
        ...defaultConfig(),
        workflow,
        agents: { "code-search": { model } },
      }
      const target: { agent: Record<string, unknown> } = { agent: {} }
      await createConfigHandler({ getConfig: () => configured })(target, undefined)
      assert.match(
        compressionPolicy(target.agent, "code-search"),
        /subagent session/i,
        `${workflow}/${model}`,
      )
    }
  } finally {
    loadAllPrompts(join(process.cwd(), "prompts"), "omo")
  }
})

test("config preserves host text and keeps all owned terminal policies idempotent", async () => {
  const cfg = {
    agent: {
      orchestrator: {
        prompt: [
          "Host orchestrator prompt.",
          "<ocmm-review-session-efficiency-policy>",
          "stale review policy",
          "</ocmm-review-session-efficiency-policy>",
        ].join("\n"),
      },
      planner: {
        prompt: [
          "Host planner prompt.",
          "<ocmm-subagent-compression-policy>",
          "stale compression policy",
          "</ocmm-subagent-compression-policy>",
          "<ocmm-delegation-contract>",
          "stale delegation contract",
          "</ocmm-delegation-contract>",
        ].join("\n"),
      },
    },
  }
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  await handler(cfg, undefined)
  await handler(cfg, undefined)

  const orchestrator = String((cfg.agent.orchestrator as Record<string, unknown>).prompt)
  assert.match(orchestrator, /Host orchestrator prompt\./)
  assert.doesNotMatch(orchestrator, /stale review policy/)
  assert.equal(orchestrator.match(/<ocmm-review-session-efficiency-policy>/g)?.length, 1)

  const planner = String((cfg.agent.planner as Record<string, unknown>).prompt)
  assert.match(planner, /Host planner prompt\./)
  assert.doesNotMatch(planner, /stale compression policy|stale delegation contract/)
  assert.equal(planner.match(/<ocmm-subagent-compression-policy>/g)?.length, 1)
  assert.equal(planner.match(/<ocmm-delegation-contract>/g)?.length, 1)
  assert.ok(
    planner.indexOf("</ocmm-subagent-compression-policy>") < planner.indexOf("<ocmm-delegation-contract>"),
  )
  assert.match(planner, /<\/ocmm-delegation-contract>\s*$/)
})

test("config preserves a middle owned-tagged host example while replacing terminal policies", async () => {
  const middleHostExample = [
    "Host text before the quoted policy example.",
    "<ocmm-subagent-compression-policy>",
    "This complete tagged block is host documentation, not an ocmm-owned suffix.",
    "</ocmm-subagent-compression-policy>",
    "Host text after the quoted policy example.",
  ].join("\n")
  const staleTerminalPolicies = [
    "<ocmm-subagent-compression-policy>",
    "stale terminal compression policy",
    "</ocmm-subagent-compression-policy>",
    "<ocmm-review-session-efficiency-policy>",
    "stale terminal review-session policy",
    "</ocmm-review-session-efficiency-policy>",
    "<ocmm-delegation-contract>",
    "stale terminal delegation contract",
    "</ocmm-delegation-contract>",
  ].join("\n\n---\n\n")
  const cfg = {
    agent: {
      planner: { prompt: `${middleHostExample}\n\n---\n\n${staleTerminalPolicies}` },
    },
  }
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })

  const assertCurrentPrompt = (prompt: string): void => {
    assert.ok(prompt.includes(middleHostExample), "middle host example must remain byte-for-byte unchanged")
    assert.doesNotMatch(prompt, /stale terminal compression policy|stale terminal review-session policy|stale terminal delegation contract/)
    assert.equal(prompt.match(/<ocmm-subagent-compression-policy>/g)?.length, 2)
    assert.equal(prompt.match(/<ocmm-review-session-efficiency-policy>/g)?.length ?? 0, 0)
    assert.equal(prompt.match(/<ocmm-delegation-contract>/g)?.length, 1)

    const terminalPolicies = prompt.slice(prompt.lastIndexOf("<ocmm-subagent-compression-policy>"))
    assert.equal(terminalPolicies.match(/<ocmm-subagent-compression-policy>/g)?.length, 1)
    assert.equal(terminalPolicies.match(/<ocmm-review-session-efficiency-policy>/g)?.length ?? 0, 0)
    assert.equal(terminalPolicies.match(/<ocmm-delegation-contract>/g)?.length, 1)
    assert.ok(
      terminalPolicies.indexOf("</ocmm-subagent-compression-policy>") < terminalPolicies.indexOf("<ocmm-delegation-contract>"),
    )
    assert.match(terminalPolicies, /<\/ocmm-delegation-contract>\s*$/)
  }

  await handler(cfg, undefined)
  const firstPass = String((cfg.agent.planner as Record<string, unknown>).prompt)
  assertCurrentPrompt(firstPass)

  await handler(cfg, undefined)
  const secondPass = String((cfg.agent.planner as Record<string, unknown>).prompt)
  assertCurrentPrompt(secondPass)
  assert.equal(secondPass, firstPass, "terminal policy assembly must remain idempotent")
})

test("planner preserves an explicit host task permission override", async () => {
  const hostTaskOverride = { "*": "allow" as const, planner: "allow" as const }
  const cfg: { agent: Record<string, unknown> } = {
    agent: { planner: { permission: { task: hostTaskOverride } } },
  }
  await createConfigHandler({ getConfig: () => defaultConfig() })(cfg, undefined)
  assertExactTaskRules(agentPermission(cfg.agent, "planner").task, hostTaskOverride, "planner host override")
})

test("disabledAgents skips OMO-compatible aliases", async () => {
  const c = {
    ...defaultConfig(),
    agents: { oracle: { variants: { high: "max" as const } } },
    disabledAgents: ["oracle-2nd", "oracle-high", "explore", "deep"],
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.ok(cfg.agent.reviewer)
  assert.ok(cfg.agent["code-search"])
  assert.ok(cfg.agent.oracle)
  assert.equal(cfg.agent["oracle-2nd"], undefined)
  assert.equal(cfg.agent["oracle-high"], undefined)
  assert.equal(cfg.agent.explore, undefined)
  assert.equal(cfg.agent.deep, undefined)
})

test("default config registers only normal review built-ins", async () => {
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: defaultConfig })(target, undefined)
  assert.ok(target.agent.oracle)
  assert.ok(target.agent["oracle-2nd"])
  assert.ok(target.agent.reviewer)
  assert.equal(target.agent["oracle-high"], undefined)
  assert.equal(target.agent["oracle-2nd-high"], undefined)
})

test("config registers canonical review profiles and no runtime alias duplicate", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      oracle: { variants: { high: "max" as const } },
      "oracle-3rd": { model: "anthropic/claude-opus-4-7", variants: { max: "max" as const } },
      reviewer: { variants: { low: "high" as const } },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => config })(target, undefined)
  for (const name of ["oracle", "oracle-high", "oracle-2nd", "oracle-3rd", "oracle-3rd-max", "reviewer", "reviewer-low"]) {
    assert.ok(target.agent[name], name)
    assert.equal((target.agent[name] as Record<string, unknown>).mode, "subagent")
    assertExactTaskRules(
      ((target.agent[name] as Record<string, unknown>).permission as Record<string, unknown>).task,
      READ_ONLY_TASK_RULES,
      `${name} read-only allowlist`,
    )
  }
  assert.equal(target.agent["oracle-second"], undefined)
})

test("generated tiers inherit review registration overrides", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      reviewer: {
        model: "openai/gpt-5.6-sol",
        tools: { read: true, task: false },
        permission: { webfetch: "allow" as const },
        skills: ["requesting-code-review"],
        promptAppend: "Inspect the complete diff.",
        temperature: 0.25,
        variants: { high: "max" as const },
      },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => config })(target, undefined)
  const high = target.agent["reviewer-high"] as Record<string, unknown>
  assert.deepEqual(high.skills, ["requesting-code-review"])
  assert.equal(high.temperature, 0.25)
  assert.match(String(high.prompt), /Inspect the complete diff\./)
  assert.equal((high.permission as Record<string, unknown>).task, "deny")
  assert.equal((high.permission as Record<string, unknown>).webfetch, "allow")
})

test("slot disable cascades and disables pre-existing host profiles", async () => {
  const config = {
    ...defaultConfig(),
    agents: { oracle: { variants: { high: "max" as const } } },
    disabledAgents: ["oracle"],
  }
  const target = { agent: { oracle: { model: "host/model" }, "oracle-high": { model: "host/model" }, "oracle-2nd": { model: "host/second" } } }
  await createConfigHandler({ getConfig: () => config })(target, undefined)
  assert.equal((target.agent.oracle as Record<string, unknown>).disable, true)
  assert.equal((target.agent["oracle-high"] as Record<string, unknown>).disable, true)
  assert.notEqual((target.agent["oracle-2nd"] as Record<string, unknown>).disable, true)
})

test("unconfigured host review tiers stay enabled with their models and parser-based read-only permissions", async () => {
  const target = {
    agent: {
      "reviewer-high": { model: "host/reviewer-high" },
    },
  }
  await createConfigHandler({ getConfig: defaultConfig })(target, undefined)

  const hostTier = target.agent["reviewer-high"] as Record<string, unknown>
  assert.equal(hostTier.model, "host/reviewer-high")
  assert.notEqual(hostTier.disable, true)
  assertExactTaskRules(
    (hostTier.permission as Record<string, unknown>).task,
    READ_ONLY_TASK_RULES,
    "host reviewer-high read-only allowlist",
  )
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

test("oracle catalog promotion prefers GPT 5.4 and 5.5 cross-generation entries before Terra", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown>; provider: Record<string, unknown> } = {
    agent: {},
    provider: {
      openai: {
        models: {
          "gpt-5.4": {},
          "gpt-5.5": {},
          "gpt-5.6-terra": {},
        },
      },
    },
  }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.oracle as Record<string, unknown>).model, "openai/gpt-5.4")
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

test("registry-managed registration publishes orthogonal route provenance for selected primaries", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: {
      reviewer: { model: "openai/user-reviewer" },
      builder: { model: "openai/user-builder" },
    },
  }
  const target = {
    agent: {
      reviewer: { model: "openai/host-reviewer" },
      orchestrator: { model: "openai/host-orchestrator" },
    },
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  const snapshot = routeRegistry.snapshot()
  assert.equal(snapshot.published, true)
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "reviewer").requirementSource,
      primarySource: publishedRoute(routeRegistry, "reviewer").primarySource,
    },
    { requirementSource: "user-config", primarySource: "existing-model" },
  )
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "builder").requirementSource,
      primarySource: publishedRoute(routeRegistry, "builder").primarySource,
    },
    { requirementSource: "user-config", primarySource: "user-requirement" },
  )
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "orchestrator").requirementSource,
      primarySource: publishedRoute(routeRegistry, "orchestrator").primarySource,
    },
    { requirementSource: "agent-default", primarySource: "existing-model" },
  )
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "planner").requirementSource,
      primarySource: publishedRoute(routeRegistry, "planner").primarySource,
    },
    { requirementSource: "agent-default", primarySource: "catalog-upgrade" },
  )
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "doc-search").requirementSource,
      primarySource: publishedRoute(routeRegistry, "doc-search").primarySource,
    },
    { requirementSource: "agent-default", primarySource: "builtin-requirement" },
  )
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "hard-reasoning").requirementSource,
      primarySource: publishedRoute(routeRegistry, "hard-reasoning").primarySource,
    },
    { requirementSource: "category-default", primarySource: "catalog-upgrade" },
  )
  assert.deepEqual(
    {
      requirementSource: publishedRoute(routeRegistry, "quick").requirementSource,
      primarySource: publishedRoute(routeRegistry, "quick").primarySource,
    },
    { requirementSource: "category-default", primarySource: "builtin-requirement" },
  )
  for (const route of snapshot.routes.values()) {
    assert.notEqual(route.requirementSource, "input-variant")
    assert.notEqual(route.requirementSource, "no-op")
    assert.notEqual(route.requirementSource, "host-profile-floor")
  }
})

test("registry-managed registration covers managed surfaces, preserves unmanaged entries, and honors agent precedence", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    fastModels: {
      providers: ["openai"],
      mappings: { "openai/custom-agent": "custom-agent-fast" },
    },
    agents: {
      "custom-agent": { model: "openai/custom-agent" },
      collision: { model: "openai/agent-wins" },
    },
    categories: {
      "custom-category": { model: "openai/custom-category" },
      collision: { model: "openai/category-loses" },
    },
  }
  const unrelated = { model: "unrelated/model", permission: { task: "deny" }, nested: { untouched: true } }
  const target = {
    agent: { unrelated: structuredClone(unrelated) },
    provider: { openai: { models: {} } },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => true,
  })(target, undefined)

  for (const name of ["reviewer", "custom-agent", "quick", "custom-category", "collision"]) {
    const route = publishedRoute(routeRegistry, name)
    assert.equal((target.agent[name as keyof typeof target.agent] as Record<string, unknown>).model, route.model)
  }
  assert.equal(publishedRoute(routeRegistry, "custom-agent").model, "openai/custom-agent-fast")
  assert.equal(publishedRoute(routeRegistry, "custom-category").model, "openai/custom-category")
  assert.equal(publishedRoute(routeRegistry, "collision").model, "openai/agent-wins")
  assert.equal(publishedRoute(routeRegistry, "collision").requirement.fallbackChain[0]?.model, "agent-wins")
  assert.deepEqual(target.agent.unrelated, unrelated)
  assert.equal(routeRegistry.snapshot().routes.has("unrelated"), false)
})

test("registry-managed automatic fast promotion needs the selected provider catalog and an allowlist", async () => {
  const automaticConfig = {
    ...defaultConfig(),
    fastModels: { providers: ["openai"], mappings: {} },
    agents: { "automatic-worker": { model: "openai/automatic" } },
  }
  const registryWithoutCandidate = createEffectiveRouteRegistry()
  await createConfigHandler({
    getConfig: () => automaticConfig,
    routeRegistry: registryWithoutCandidate,
    getFastMode: () => true,
  })({
    agent: {},
    provider: {
      openai: { models: {} },
      anthropic: { models: { "automatic-fast": {} } },
    },
  }, undefined)
  assert.equal(publishedRoute(registryWithoutCandidate, "automatic-worker").model, "openai/automatic")

  const registryWithCandidate = createEffectiveRouteRegistry()
  await createConfigHandler({
    getConfig: () => automaticConfig,
    routeRegistry: registryWithCandidate,
    getFastMode: () => true,
  })({
    agent: {},
    provider: { openai: { models: { "automatic-fast": {} } } },
  }, undefined)
  assert.equal(publishedRoute(registryWithCandidate, "automatic-worker").model, "openai/automatic-fast")

  const noAllowlistConfig = {
    ...automaticConfig,
    fastModels: { providers: [], mappings: { "openai/automatic": "automatic-fast" } },
  }
  const noAllowlistRegistry = createEffectiveRouteRegistry()
  await createConfigHandler({
    getConfig: () => noAllowlistConfig,
    routeRegistry: noAllowlistRegistry,
    getFastMode: () => true,
  })({
    agent: {},
    provider: { openai: { models: { "automatic-fast": {} } } },
  }, undefined)
  const originalRoute = publishedRoute(noAllowlistRegistry, "automatic-worker")
  assert.equal(originalRoute.model, "openai/automatic")
  assert.equal(originalRoute.requirement.fallbackChain[0]?.model, "automatic")
})

test("registry-managed registration samples fast activation once for each config hook", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  let fastModeReads = 0
  const handler = createConfigHandler({
    getConfig: () => ({
      ...defaultConfig(),
      fastModels: { providers: ["openai"], mappings: {} },
      agents: { worker: { model: "openai/gpt-5.4-mini" } },
    }),
    routeRegistry,
    getFastMode: () => {
      fastModeReads++
      return fastModeReads === 1
    },
  })
  const target = () => ({ agent: {}, provider: { openai: { models: { "gpt-5.4-mini-fast": {} } } } })

  await handler(target(), undefined)
  assert.equal(publishedRoute(routeRegistry, "worker").model, "openai/gpt-5.4-mini-fast")
  await handler(target(), undefined)
  assert.equal(publishedRoute(routeRegistry, "worker").model, "openai/gpt-5.4-mini")
  assert.equal(fastModeReads, 2)
})

test("registry rebuilds atomically, materializes selected primaries, and retains a prior snapshot on failure", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  let config = {
    ...defaultConfig(),
    agents: { "deleted-worker": { model: "openai/deleted-worker" } },
  }
  const handler = createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })
  const target = {
    agent: { reviewer: { model: "openai/host-reviewer" } },
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }

  await handler(target, undefined)
  assert.equal(publishedRoute(routeRegistry, "deleted-worker").requirement.fallbackChain[0]?.model, "deleted-worker")
  assert.equal(publishedRoute(routeRegistry, "reviewer").requirement.fallbackChain[0]?.model, "host-reviewer")
  assert.equal(publishedRoute(routeRegistry, "planner").requirement.fallbackChain[0]?.model, "gpt-5.7-sol")

  config = defaultConfig()
  await handler(target, undefined)
  const rebuiltSnapshot = routeRegistry.snapshot()
  assert.equal(rebuiltSnapshot.routes.has("deleted-worker"), false)

  const failedHandler = createConfigHandler({
    getConfig: () => {
      throw new Error("registration failed")
    },
    routeRegistry,
    getFastMode: () => false,
  })
  await assert.rejects(failedHandler({ agent: {} }, undefined), /registration failed/)
  assert.equal(routeRegistry.snapshot(), rebuiltSnapshot)

  await handler(null, undefined)
  assert.equal(routeRegistry.snapshot(), rebuiltSnapshot)
})

test("registry mode publishes an intentional empty route map when builtin agents are disabled", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = { ...defaultConfig(), registerBuiltinAgents: false }
  const target: { agent: Record<string, unknown>; command?: Record<string, unknown> } = { agent: {} }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  assert.equal(routeRegistry.snapshot().published, true)
  assert.equal(routeRegistry.snapshot().routes.size, 0)
  assert.ok(target.command?.["ralph-loop"])
})

test("compatibility mode stays non-fast and rebuilds only registeredAgentModels", async () => {
  const registeredAgentModels = new Map<string, string>([["stale", "stale/model"]])
  const config = {
    ...defaultConfig(),
    fastModels: {
      providers: ["openai"],
      mappings: { "openai/compat-worker": "compat-worker-fast" },
    },
    agents: { "compat-worker": { model: "openai/compat-worker" } },
  }
  const target = { agent: {}, provider: { openai: { models: {} } } }

  await createConfigHandler({
    getConfig: () => config,
    registeredAgentModels,
  })(target, undefined)

  assert.equal((target.agent["compat-worker"] as Record<string, unknown>).model, "openai/compat-worker")
  assert.equal(registeredAgentModels.has("stale"), false)
  assert.equal(registeredAgentModels.get("compat-worker"), "openai/compat-worker")
})

test("compatibility mode registers a same-name custom agent over its category", async () => {
  const registeredAgentModels = new Map<string, string>()
  const config = {
    ...defaultConfig(),
    fastModels: {
      providers: ["openai"],
      mappings: { "openai/agent-wins": "agent-wins-fast" },
    },
    agents: { collision: { model: "openai/agent-wins" } },
    categories: { collision: { model: "openai/category-loses" } },
  }
  const target = { agent: {}, provider: { openai: { models: { "agent-wins-fast": {} } } } }

  await createConfigHandler({ getConfig: () => config, registeredAgentModels })(target, undefined)

  assert.equal((target.agent.collision as Record<string, unknown>).model, "openai/agent-wins")
  assert.equal(registeredAgentModels.get("collision"), "openai/agent-wins")
})

test("registry mode omits routes when disabled overrides skip registration", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: {
      builder: { disabled: true },
      frontend: { disabled: true },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  assert.equal(target.agent.builder, undefined)
  assert.equal(target.agent.frontend, undefined)
  assert.equal(routeRegistry.snapshot().routes.has("builder"), false)
  assert.equal(routeRegistry.snapshot().routes.has("frontend"), false)
})

test("registry mode keeps host-disabled builtin agents unregistered and unpublished", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const target = {
    agent: {
      builder: {
        model: "host/model",
        disable: true,
        permission: { custom: "allow" },
      },
    },
  }

  await createConfigHandler({
    getConfig: defaultConfig,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  const builder = target.agent.builder
  assert.equal(builder.disable, true)
  assert.equal(builder.model, "host/model")
  assert.deepEqual(builder.permission, { custom: "allow", task: "allow", question: "allow", "task_*": "allow" })
  assert.equal("mode" in builder, false)
  assert.equal("prompt" in builder, false)
  assert.equal(routeRegistry.snapshot().routes.has("builder"), false)
})

test("compatibility mode suppresses catalog upgrades for unresolved qualified aliases", async () => {
  const config = {
    ...defaultConfig(),
    agents: { reviewer: { alias: "precision:reviewer" } },
  }
  const target = {
    agent: {},
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }

  await createConfigHandler({ getConfig: () => config })(target, undefined)

  assert.equal((target.agent.reviewer as Record<string, unknown>).model, "openai/gpt-5.5")
})

test("compatibility mode suppresses category catalog upgrades for unresolved qualified aliases", async () => {
  const config = {
    ...defaultConfig(),
    categories: { "hard-reasoning": { alias: "precision:hard-reasoning" } },
  }
  const target = {
    agent: {},
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }

  await createConfigHandler({ getConfig: () => config })(target, undefined)

  assert.equal((target.agent["hard-reasoning"] as Record<string, unknown>).model, "openai/gpt-5.5")
})

test("a malformed registry-managed invocation invalidates an older in-progress generation", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  let invalidateWithMalformedInput = false
  let handler: ReturnType<typeof createConfigHandler>
  const config = defaultConfig()
  handler = createConfigHandler({
    getConfig: () => {
      if (invalidateWithMalformedInput) {
        invalidateWithMalformedInput = false
        void handler(null, undefined)
      }
      return config
    },
    routeRegistry,
    getFastMode: () => false,
  })

  const target = {
    agent: {
      host: { model: "host/model", nested: { preserved: true } },
    },
  }
  await handler(target, undefined)
  const published = routeRegistry.snapshot()
  assert.equal(published.published, true)
  const priorAgentMap = target.agent
  const priorAgentContents = structuredClone(priorAgentMap)

  invalidateWithMalformedInput = true
  await handler(target, undefined)
  assert.equal(routeRegistry.snapshot(), published)
  assert.equal(target.agent, priorAgentMap)
  assert.deepEqual(target.agent, priorAgentContents)

  await handler(target, undefined)
  assert.notEqual(routeRegistry.snapshot(), published)
  assert.notEqual(target.agent, priorAgentMap)
  assert.deepEqual(target.agent.host, priorAgentContents.host)
})

test("compatibility aliases receive independently materialized final routes", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    fastModels: { providers: ["openai"], mappings: {} },
    agents: { "code-search": { model: "openai/code-search-original" } },
  }
  const target = {
    agent: { explore: { model: "openai/explore-original" } },
    provider: {
      openai: {
        models: {
          "code-search-original-fast": {},
          "explore-original-fast": {},
        },
      },
    },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => true,
  })(target, undefined)

  const codeSearch = publishedRoute(routeRegistry, "code-search")
  const explore = publishedRoute(routeRegistry, "explore")
  assert.notEqual(explore, codeSearch)
  assert.notEqual(explore.requirement, codeSearch.requirement)
  assert.deepEqual(explore.requirement.fallbackChain.slice(0, 2).map((entry) => entry.model), [
    "explore-original-fast",
    "explore-original",
  ])
  assert.deepEqual(codeSearch.requirement.fallbackChain.slice(0, 2).map((entry) => entry.model), [
    "code-search-original-fast",
    "code-search-original",
  ])
  assert.equal((target.agent.explore as Record<string, unknown>).model, explore.model)
  assert.equal((target.agent["code-search"] as Record<string, unknown>).model, codeSearch.model)
})

test("registry mode does not resurrect a compatibility alias disabled in agents config", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: { explore: { disabled: true } },
  }
  const target = {
    agent: {
      explore: { model: "host/stale-explore" },
    },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  assert.ok(target.agent["code-search"])
  assert.equal(target.agent.explore, undefined)
  assert.equal(routeRegistry.snapshot().routes.has("explore"), false)
})

test("registry mode does not resurrect a compatibility alias when its target is disabled in agents config", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: { "code-search": { disabled: true } },
  }
  const target = {
    agent: {
      "code-search": { model: "host/code-search", permission: { custom: "allow" } },
      explore: { model: "host/stale-explore" },
    },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  assert.deepEqual(target.agent["code-search"], {
    model: "host/code-search",
    permission: { custom: "allow", task: "deny" },
  })
  assert.equal(target.agent.explore, undefined)
  assert.equal(routeRegistry.snapshot().routes.has("code-search"), false)
  assert.equal(routeRegistry.snapshot().routes.has("explore"), false)
})

test("registry mode removes a stale compatibility alias when its host target is disabled", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const target = {
    agent: {
      "code-search": { model: "host/code-search", disable: true, permission: { custom: "allow" } },
      explore: { model: "host/stale-explore" },
    },
  }

  await createConfigHandler({
    getConfig: defaultConfig,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  assert.deepEqual(target.agent["code-search"], {
    model: "host/code-search",
    disable: true,
    permission: { custom: "allow", task: "deny" },
  })
  assert.equal(target.agent.explore, undefined)
  assert.equal(routeRegistry.snapshot().routes.has("code-search"), false)
  assert.equal(routeRegistry.snapshot().routes.has("explore"), false)
})

function writeSkill(root: string, dir: string, name: string): void {
  const skillDir = join(root, dir)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n`,
  )
}
