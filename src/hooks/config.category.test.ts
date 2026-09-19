import { test } from "node:test"
import assert from "node:assert/strict"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { getCategoryPrompt, getDeepworkPrompt, loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"

const PROMPTS_ROOT = join(process.cwd(), "prompts")

loadAllPrompts(PROMPTS_ROOT, "v1")

const UTILITY_TASK_RULES = {
  "*": "deny",
  quick: "allow",
  "code-search": "allow",
  explore: "allow",
  "doc-search": "allow",
  research: "allow",
  "media-reader": "allow",
} as const

const LOCAL_COORDINATOR_TASK_RULES = {
  ...UTILITY_TASK_RULES,
  coding: "allow",
  frontend: "allow",
  "hard-reasoning": "allow",
  creative: "allow",
  documenting: "allow",
} as const

const CLAUDE_OPUS_5_MARKER = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"
const GPT_56_MARKER = "# GPT-5.6 EXECUTION CALIBRATION"
const KIMI_K27_MARKER = "# KIMI K2.7/K2.8 CODE CALIBRATION"
const SWE_2_MARKER = "# SWE-2 EXECUTION CALIBRATION"

function countText(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function assertExactTaskRules(actual: unknown, expected: Record<string, string>, label: string): void {
  assert.ok(actual && typeof actual === "object" && !Array.isArray(actual), `${label} task rules must be granular`)
  assert.deepEqual(Object.entries(actual as Record<string, unknown>), Object.entries(expected), `${label} task rule order`)
}

function publishedCategoryRoute(
  registry: ReturnType<typeof createEffectiveRouteRegistry>,
  name: string,
) {
  const route = registry.snapshot().routes.get(name)
  assert.ok(route, `missing published route for ${name}`)
  return route
}

type CategoryDiagnosticLog = { level: "info" | "warn"; message: string }

function categoryDiagnosticLogger(logs: CategoryDiagnosticLog[]) {
  return {
    info(...args: unknown[]) {
      logs.push({ level: "info", message: String(args[0]) })
    },
    warn(...args: unknown[]) {
      logs.push({ level: "warn", message: String(args[0]) })
    },
  }
}

function categoryDiagnosticMessages(
  logs: readonly CategoryDiagnosticLog[],
  name: string,
): CategoryDiagnosticLog[] {
  return logs.filter(({ message }) =>
    message.startsWith(`category availability: name=${JSON.stringify(name)} `)
  )
}

test("config registers all 10 always-on categories as subagents", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  for (const c of BUILTIN_CATEGORIES) {
    if (c.optIn) {
      assert.equal(cfg.agent[c.name], undefined, `opt-in category ${c.name} must not register by default`)
      continue
    }
    const entry = cfg.agent[c.name] as Record<string, unknown> | undefined
    assert.ok(entry, `missing category-subagent ${c.name}`)
    assert.equal(typeof entry!.model, "string")
    assert.equal(entry!.mode, "subagent", `category ${c.name} should be subagent`)
    assert.equal(typeof entry!.prompt, "string", `category ${c.name} should have prompt`)
    assert.ok((entry!.prompt as string).length > 100, `category ${c.name} prompt too short`)
    assert.doesNotMatch(entry!.prompt as string, /Agent Role:/)
  }
})

test("cross-cutting registers only when explicitly configured and resolves the builtin default chain", async () => {
  const off = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(off, undefined)
  assert.equal(off.agent["cross-cutting"], undefined, "unconfigured cross-cutting must not register")

  const viaCategories = { agent: {} }
  await createConfigHandler({
    getConfig: () => ({ ...defaultConfig(), categories: { "cross-cutting": {} } }),
  })(viaCategories, undefined)
  const entry = viaCategories.agent["cross-cutting"] as Record<string, unknown>
  assert.ok(entry, "categories-key cross-cutting must register")
  assert.equal(entry.mode, "subagent")
  assert.equal(entry.model, "openai/gpt-6-astra")
  assert.match(String(entry.prompt), /# Category: cross-cutting/)

  const viaAgents = { agent: {} }
  await createConfigHandler({
    getConfig: () => ({ ...defaultConfig(), agents: { "cross-cutting": {} } }),
  })(viaAgents, undefined)
  assert.ok(viaAgents.agent["cross-cutting"], "agents-key cross-cutting must register")

  const withModel = { agent: {} }
  await createConfigHandler({
    getConfig: () => ({ ...defaultConfig(), categories: { "cross-cutting": { model: "anthropic/claude-sonnet-4-6" } } }),
  })(withModel, undefined)
  assert.equal(
    (withModel.agent["cross-cutting"] as Record<string, unknown>).model,
    "anthropic/claude-sonnet-4-6",
    "user model must win for activated cross-cutting",
  )
})

test("disabledAgents skips a category-subagent", async () => {
  const c = { ...defaultConfig(), disabledAgents: ["frontend", "documenting"] }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  assert.equal(cfg.agent.frontend, undefined)
  assert.equal(cfg.agent.documenting, undefined)
  assert.ok(cfg.agent["hard-reasoning"])
})

test("user override of a category-subagent's model wins (shorthand)", async () => {
  const c = {
    ...defaultConfig(),
    agents: { "hard-reasoning": { model: "openai/gpt-5.4-mini" } },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  const entry = cfg.agent["hard-reasoning"] as Record<string, unknown>
  assert.equal(entry.model, "openai/gpt-5.4-mini")
  assert.equal(entry.mode, "subagent")
})

test("user category override changes the model without disabling subagent mode", async () => {
  const c = {
    ...defaultConfig(),
    categories: {
      frontend: {
        variant: "low" as const,
        model: "openai/gpt-5.4-mini",
      },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  const entry = cfg.agent.frontend as Record<string, unknown>
  assert.equal(entry.model, "openai/gpt-5.4-mini")
  assert.equal(entry.mode, "subagent")
})

test("GPT-5.6 category selections append only the additive calibration after the authoritative role", async () => {
  loadAllPrompts(PROMPTS_ROOT, "v1")
  const rolePrompt = getCategoryPrompt("frontend").trim()
  const specialization = getDeepworkPrompt("gpt-5.6").trim()
  const genericGptPrompt = getDeepworkPrompt("gpt").trim()
  const cases = [
    {
      label: "host-selected model",
      config: defaultConfig(),
      target: { agent: { frontend: { model: "openai/gpt-5.6-terra" } } } as { agent: Record<string, unknown> },
    },
    {
      label: "category override",
      config: {
        ...defaultConfig(),
        categories: { frontend: { model: "openai/gpt-5.6-terra" } },
      },
      target: { agent: {} } as { agent: Record<string, unknown> },
    },
  ]

  for (const { label, config, target } of cases) {
    const handler = createConfigHandler({ getConfig: () => config })
    await handler(target, undefined)
    const entry = target.agent.frontend as Record<string, unknown>
    const prompt = entry.prompt as string

    assert.ok(prompt.startsWith(rolePrompt), `${label}: category role must remain first and authoritative`)
    assert.match(prompt, /<workflow-model-calibration>/, `${label}: missing calibration envelope`)
    assert.ok(prompt.includes(specialization), `${label}: missing additive GPT-5.6 calibration`)
    assert.ok(!prompt.includes(genericGptPrompt), `${label}: generic GPT prompt must not be appended`)
  }
})

test("Opus 5 category selections never attach the orchestrator calibration", async () => {
  loadAllPrompts(PROMPTS_ROOT, "v1")
  const configured = {
    ...defaultConfig(),
    categories: Object.fromEntries(
      BUILTIN_CATEGORIES.map(({ name }) => [name, { model: "anthropic/claude-opus-5" }]),
    ),
  }
  const target: {
    agent: Record<string, unknown>
    provider: Record<string, unknown>
  } = {
    agent: {},
    provider: { anthropic: { models: { "claude-opus-5": {} } } },
  }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)

  for (const category of BUILTIN_CATEGORIES) {
    const prompt = String((target.agent[category.name] as Record<string, unknown>).prompt)
    assert.equal(countText(prompt, CLAUDE_OPUS_5_MARKER), 0, category.name)
    assert.ok(prompt.startsWith(getCategoryPrompt(category.name).trim()), category.name)
  }
})

test("Kimi and SWE category selections preserve the category role and isolate calibrations", async () => {
  loadAllPrompts(PROMPTS_ROOT, "v1")
  const configured = {
    ...defaultConfig(),
    categories: {
      coding: { model: "kimi-for-coding/kimi-for-coding-highspeed" },
      research: { model: "devin/swe-2.max" },
      quick: { model: "devin/swe-20" },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)

  const coding = String((target.agent.coding as Record<string, unknown>).prompt)
  assert.ok(coding.startsWith(getCategoryPrompt("coding").trim()))
  assert.equal(countText(coding, KIMI_K27_MARKER), 1)
  assert.equal(countText(coding, SWE_2_MARKER), 0)

  const research = String((target.agent.research as Record<string, unknown>).prompt)
  assert.ok(research.startsWith(getCategoryPrompt("research").trim()))
  assert.equal(countText(research, SWE_2_MARKER), 1)
  assert.equal(countText(research, KIMI_K27_MARKER), 0)

  const adjacent = String((target.agent.quick as Record<string, unknown>).prompt)
  assert.equal(countText(adjacent, SWE_2_MARKER), 0)
  assert.equal(countText(adjacent, KIMI_K27_MARKER), 0)
})

test("Codex generation gives every builtin category the guarded GPT-5.6 calibration", async () => {
  loadAllPrompts(PROMPTS_ROOT, "codex")
  try {
    const handler = createConfigHandler({
      getConfig: () => ({ ...defaultConfig(), workflow: "codex" }),
    })
    const cfg: { agent: Record<string, unknown> } = { agent: {} }
    await handler(cfg, undefined)
    const specialization = getDeepworkPrompt("gpt-5.6").trim()
    const opus5 = getDeepworkPrompt("claude-opus-5").trim()
    const kimi = getDeepworkPrompt("kimi-k27").trim()
    const swe2 = getDeepworkPrompt("swe-2").trim()

    for (const category of BUILTIN_CATEGORIES) {
      if (category.optIn) {
        assert.equal(cfg.agent[category.name], undefined, `${category.name}: opt-in category must stay unregistered in Codex generation by default`)
        continue
      }
      const entry = cfg.agent[category.name] as Record<string, unknown>
      const prompt = entry.prompt as string
      assert.match(prompt, /<workflow-model-calibration>/, `${category.name}: missing calibration envelope`)
      assert.ok(prompt.includes(specialization), `${category.name}: missing GPT-5.6 calibration`)
      assert.equal(countText(prompt, GPT_56_MARKER), 1, `${category.name}: GPT-5.6 marker`)
      assert.ok(!prompt.includes(opus5), `${category.name}: Opus 5 calibration must remain excluded`)
      assert.equal(countText(prompt, CLAUDE_OPUS_5_MARKER), 0, category.name)
      assert.equal(countText(prompt, KIMI_K27_MARKER), 1, `${category.name}: Kimi carry-ahead`)
      assert.equal(countText(prompt, SWE_2_MARKER), 1, `${category.name}: SWE-2 carry-ahead`)
      assert.ok(prompt.includes(kimi), `${category.name}: exact Kimi calibration`)
      assert.ok(prompt.includes(swe2), `${category.name}: exact SWE-2 calibration`)
      assert.match(prompt, /every other runtime model must ignore it/, `${category.name}: runtime guard`)
    }
  } finally {
    loadAllPrompts(PROMPTS_ROOT, "v1")
  }
})

test("Codex carries the exact Astra category calibration behind its own runtime guard", async () => {
  loadAllPrompts(PROMPTS_ROOT, "codex")
  try {
    const config = {
      ...defaultConfig(),
      workflow: "codex" as const,
      categories: { deep: { model: "openai/gpt-5.6-sol" } },
    }
    const target: { agent: Record<string, unknown> } = { agent: {} }
    await createConfigHandler({ getConfig: () => config })(target, undefined)
    const deep = target.agent.deep as Record<string, unknown>
    const prompt = String(deep.prompt)

    assert.equal(deep.model, "openai/gpt-5.6-sol")
    assert.match(prompt, /Apply this section only when the selected runtime model is GPT-6 Astra/)
    assert.match(prompt, /every other runtime model must ignore it/)
    assert.doesNotMatch(getCategoryPrompt("deep"), /model-calibration|Astra/)
  } finally {
    loadAllPrompts(PROMPTS_ROOT, "v1")
  }
})

test("category task permissions distinguish leaves, workflow roles, and local coordinators", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  const taskFor = (name: string): unknown => {
    const entry = cfg.agent[name] as Record<string, unknown>
    const permission = entry.permission as Record<string, unknown> | undefined
    return permission?.task
  }

  assert.equal(taskFor("quick"), "deny")
  assert.equal(taskFor("research"), "deny")
  assertExactTaskRules(taskFor("frontend"), UTILITY_TASK_RULES, "frontend")
  assertExactTaskRules(taskFor("normal-task"), UTILITY_TASK_RULES, "normal-task")
  assertExactTaskRules(taskFor("deep"), LOCAL_COORDINATOR_TASK_RULES, "deep")
  assertExactTaskRules(taskFor("complex"), LOCAL_COORDINATOR_TASK_RULES, "complex")
})

test("category prompts receive role-specific terminal delegation contracts", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(cfg, undefined)

  const contractFor = (name: string): string => {
    const prompt = String((cfg.agent[name] as Record<string, unknown>).prompt)
    const match = prompt.match(/<ocmm-delegation-contract>([\s\S]*?)<\/ocmm-delegation-contract>/)
    assert.ok(match, `missing delegation contract for ${name}`)
    assert.match(prompt, /<\/ocmm-delegation-contract>\s*$/)
    return match[1]!
  }

  assert.match(contractFor("quick"), /utility leaf agent/i)
  assert.match(
    contractFor("coding"),
    /Allowed utility targets: `quick`, `code-search`, `explore`, `doc-search`, `research`, `media-reader`\./,
  )
  const deep = contractFor("deep")
  assert.match(deep, /Allowed specialist targets: `coding`, `frontend`, `hard-reasoning`, `creative`, `documenting`\./)
  assert.match(deep, /Multiple steps, routine confirmation, or wanting another opinion are not sufficient/)
  assert.match(deep, /Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, any Reviewer profile \(`reviewer`, `reviewer-low`, `reviewer-high`, `reviewer-max`\), any Oracle profile \(`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`\/`high`\/`max` tier variants\), `normal-task`, `deep`, `complex`, or `cross-cutting`/)
})

test("every category receives only the common compression policy", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(cfg, undefined)

  for (const category of BUILTIN_CATEGORIES) {
    if (category.optIn) {
      assert.equal(cfg.agent[category.name], undefined, `${category.name}: opt-in category must stay unregistered by default`)
      continue
    }
    const prompt = String((cfg.agent[category.name] as Record<string, unknown>).prompt)
    assert.equal(prompt.match(/<ocmm-subagent-compression-policy>/g)?.length, 1, category.name)
    assert.match(prompt, /only when the current execution is a subagent session/i, category.name)
    assert.match(prompt, /When no trustworthy capacity signal or size estimate exists, do not compress proactively/i, category.name)
    assert.match(prompt, /more than 100k tokens of source material/i, category.name)
    assert.match(prompt, /Never compress during an active exploration/i, category.name)
    assert.doesNotMatch(prompt, /Additional continued Reviewer\/Oracle proactive exception/i, category.name)
    assert.doesNotMatch(prompt, /<ocmm-review-session-efficiency-policy>/, category.name)
  }
})

test("registry-managed categories publish category provenance and write final route models", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const target: {
    agent: Record<string, unknown>
    provider: Record<string, unknown>
  } = {
    agent: {},
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }

  await createConfigHandler({
    getConfig: defaultConfig,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  const catalogRoute = publishedCategoryRoute(routeRegistry, "hard-reasoning")
  const headRoute = publishedCategoryRoute(routeRegistry, "quick")
  assert.deepEqual(
    { requirementSource: catalogRoute.requirementSource, primarySource: catalogRoute.primarySource },
    { requirementSource: "category-default", primarySource: "catalog-upgrade" },
  )
  assert.deepEqual(
    { requirementSource: headRoute.requirementSource, primarySource: headRoute.primarySource },
    { requirementSource: "category-default", primarySource: "builtin-requirement" },
  )
  assert.equal((target.agent["hard-reasoning"] as Record<string, unknown>).model, catalogRoute.model)
  assert.equal((target.agent.quick as Record<string, unknown>).model, headRoute.model)
})

test("registry-managed configured categories register non-builtins and give same-name agents priority", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    agents: {
      collision: { model: "openai/agent-wins" },
      frontend: { model: "openai/frontend-agent-wins" },
    },
    categories: {
      "custom-category": { model: "openai/custom-category" },
      collision: { model: "openai/category-loses" },
      frontend: { model: "openai/frontend-category-loses" },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  const custom = publishedCategoryRoute(routeRegistry, "custom-category")
  const collision = publishedCategoryRoute(routeRegistry, "collision")
  const frontend = publishedCategoryRoute(routeRegistry, "frontend")
  assert.equal((target.agent["custom-category"] as Record<string, unknown>).mode, "subagent")
  assert.equal((target.agent["custom-category"] as Record<string, unknown>).model, custom.model)
  assert.deepEqual(
    { requirementSource: custom.requirementSource, primarySource: custom.primarySource },
    { requirementSource: "user-config", primarySource: "user-requirement" },
  )
  assert.equal(collision.model, "openai/agent-wins")
  assert.equal(collision.requirement.fallbackChain[0]?.model, "agent-wins")
  assert.equal(frontend.model, "openai/frontend-agent-wins")
  assert.equal(frontend.requirement.fallbackChain[0]?.model, "frontend-agent-wins")
})

test("registry-managed same-name agent ownership suppresses category fallback without a usable requirement", async () => {
  for (const agents of [
    { collision: { disabled: true } },
    { collision: { description: "metadata only" } },
  ]) {
    const routeRegistry = createEffectiveRouteRegistry()
    const config = {
      ...defaultConfig(),
      agents,
      categories: { collision: { model: "openai/category-must-not-fallback" } },
    }
    const target: { agent: Record<string, unknown> } = { agent: {} }

    await createConfigHandler({
      getConfig: () => config,
      routeRegistry,
      getFastMode: () => false,
    })(target, undefined)

    assert.equal(target.agent.collision, undefined, JSON.stringify(agents))
    assert.equal(routeRegistry.snapshot().routes.has("collision"), false, JSON.stringify(agents))
  }
})

test("registry-managed host-disabled custom categories remain unpublished", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    categories: { "custom-category": { model: "openai/category-model" } },
  }
  const target = {
    agent: {
      "custom-category": {
        model: "host/category-model",
        disable: true,
        permission: { custom: "allow" },
      },
    },
  }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
  })(target, undefined)

  const category = target.agent["custom-category"]
  assert.equal(category.disable, true)
  assert.equal(category.model, "host/category-model")
  assert.deepEqual(category.permission, { custom: "allow" })
  assert.equal("mode" in category, false)
  assert.equal("prompt" in category, false)
  assert.equal(routeRegistry.snapshot().routes.has("custom-category"), false)
})

test("category diagnostics report built-in and custom registrations once per handler", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    categories: {
      "custom-observed": { models: ["qa/custom-model"] },
    },
  }
  const logs: CategoryDiagnosticLog[] = []
  const handler = createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
    logger: categoryDiagnosticLogger(logs),
  })
  const createTarget = () => ({
    agent: {},
    provider: {
      openai: { models: { "gpt-5.7-sol": {} } },
      qa: { models: { "custom-model": {} } },
    },
  })

  const firstTarget = createTarget()
  await handler(firstTarget, undefined)
  await handler(createTarget(), undefined)

  const builtin = categoryDiagnosticMessages(logs, "hard-reasoning")
  const custom = categoryDiagnosticMessages(logs, "custom-observed")
  assert.equal(builtin.length, 1)
  assert.equal(custom.length, 1)
  assert.equal(builtin[0]?.level, "info")
  assert.equal(custom[0]?.level, "info")
  assert.match(builtin[0]!.message, /status=available .*primarySource=catalog-upgrade .*routePreserved=true/)
  assert.match(custom[0]!.message, /status=available .*primarySource=user-requirement .*routePreserved=true/)
  assert.equal(publishedCategoryRoute(routeRegistry, "hard-reasoning").model, "openai/gpt-5.7-sol")
  assert.equal(publishedCategoryRoute(routeRegistry, "custom-observed").model, "qa/custom-model")
})

test("category diagnostics omit disabled, host-disabled, and category-shadowed registrations", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    disabledAgents: ["frontend"],
    agents: {
      "agent-owned": { model: "qa/agent-model" },
    },
    categories: {
      "host-disabled": { model: "qa/category-model" },
      "metadata-only": { description: "no route requirement" },
      "agent-owned": { model: "qa/category-must-not-own" },
    },
  }
  const target: { agent: Record<string, unknown> } = {
    agent: {
      "host-disabled": { model: "host/existing", disable: true },
    },
  }
  const logs: CategoryDiagnosticLog[] = []

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
    logger: categoryDiagnosticLogger(logs),
  })(target, undefined)

  for (const name of ["frontend", "host-disabled", "metadata-only", "agent-owned"]) {
    assert.deepEqual(categoryDiagnosticMessages(logs, name), [], name)
  }
  assert.equal(routeRegistry.snapshot().routes.has("frontend"), false)
  assert.equal(routeRegistry.snapshot().routes.has("host-disabled"), false)
  assert.equal(routeRegistry.snapshot().routes.has("metadata-only"), false)
  assert.equal(publishedCategoryRoute(routeRegistry, "agent-owned").model, "qa/agent-model")
})

test("diagnostics preserve canonical, legacy, and structurally dead explicit routes and snapshots", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    categories: {
      "canonical-route": { models: ["qa/observed", "missing/fallback"] },
      "legacy-route": { model: "missing/legacy" },
      "dead-route": {
        requirement: {
          requiresProvider: ["qa"],
          fallbackChain: [{ providers: ["blocked"], model: "conflict" }],
        },
      },
    },
  }
  const target: {
    agent: Record<string, unknown>
    provider: Record<string, unknown>
  } = {
    agent: {},
    provider: { qa: { models: { observed: {} } } },
  }
  const providerBefore = structuredClone(target.provider)
  const logs: CategoryDiagnosticLog[] = []

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
    logger: categoryDiagnosticLogger(logs),
  })(target, undefined)

  assert.match(categoryDiagnosticMessages(logs, "canonical-route")[0]!.message, /status=available/)
  assert.match(categoryDiagnosticMessages(logs, "legacy-route")[0]!.message, /status=unknown/)
  assert.match(categoryDiagnosticMessages(logs, "dead-route")[0]!.message, /status=dead/)
  assert.equal(categoryDiagnosticMessages(logs, "dead-route")[0]?.level, "warn")

  const canonical = publishedCategoryRoute(routeRegistry, "canonical-route")
  const legacy = publishedCategoryRoute(routeRegistry, "legacy-route")
  const dead = publishedCategoryRoute(routeRegistry, "dead-route")
  assert.equal((target.agent["canonical-route"] as Record<string, unknown>).model, "qa/observed")
  assert.equal((target.agent["legacy-route"] as Record<string, unknown>).model, "missing/legacy")
  assert.equal((target.agent["dead-route"] as Record<string, unknown>).model, "blocked/conflict")
  assert.deepEqual(canonical.requirement.fallbackChain, [
    { providers: ["qa"], model: "observed" },
    { providers: ["missing"], model: "fallback" },
  ])
  assert.deepEqual(legacy.requirement.fallbackChain, [
    { providers: ["missing"], model: "legacy" },
  ])
  assert.deepEqual(dead.requirement, {
    requiresProvider: ["qa"],
    fallbackChain: [{ providers: ["blocked"], model: "conflict" }],
  })
  for (const route of [canonical, legacy, dead]) {
    assert.deepEqual(
      Object.keys(route).sort(),
      ["fastPath", "model", "primarySource", "requirement", "requirementSource"],
    )
    assert.equal(route.requirementSource, "user-config")
    assert.equal(route.primarySource, "user-requirement")
    assert.deepEqual(route.fastPath, { kind: "off" })
    assert.equal(Object.hasOwn(route, "availability"), false)
    assert.equal(Object.hasOwn(route, "diagnostic"), false)
  }
  assert.deepEqual(target.provider, providerBefore)
})
