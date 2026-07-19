import { test } from "node:test"
import assert from "node:assert/strict"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { getCategoryPrompt, getDeepworkPrompt, loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"
import { createEffectiveRouteRegistry } from "../routing/route-registry.ts"

const PROMPTS_ROOT = join(process.cwd(), "prompts")

loadAllPrompts(PROMPTS_ROOT, "omo")

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

test("config registers all 10 categories as subagents", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  for (const c of BUILTIN_CATEGORIES) {
    const entry = cfg.agent[c.name] as Record<string, unknown> | undefined
    assert.ok(entry, `missing category-subagent ${c.name}`)
    assert.equal(typeof entry!.model, "string")
    assert.equal(entry!.mode, "subagent", `category ${c.name} should be subagent`)
    assert.equal(typeof entry!.prompt, "string", `category ${c.name} should have prompt`)
    assert.ok((entry!.prompt as string).length > 100, `category ${c.name} prompt too short`)
    assert.doesNotMatch(entry!.prompt as string, /Agent Role:/)
  }
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
  loadAllPrompts(PROMPTS_ROOT, "omo")
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

test("Codex generation gives every builtin category the guarded GPT-5.6 calibration", async () => {
  loadAllPrompts(PROMPTS_ROOT, "codex")
  try {
    const handler = createConfigHandler({
      getConfig: () => ({ ...defaultConfig(), workflow: "codex" }),
    })
    const cfg: { agent: Record<string, unknown> } = { agent: {} }
    await handler(cfg, undefined)
    const specialization = getDeepworkPrompt("gpt-5.6").trim()

    for (const category of BUILTIN_CATEGORIES) {
      const entry = cfg.agent[category.name] as Record<string, unknown>
      const prompt = entry.prompt as string
      assert.match(prompt, /<workflow-model-calibration>/, `${category.name}: missing calibration envelope`)
      assert.ok(prompt.includes(specialization), `${category.name}: missing GPT-5.6 calibration`)
      assert.match(
        prompt,
        /Codex profiles may carry this layer ahead of runtime model selection; models outside the GPT-5\.6 family ignore it/,
        `${category.name}: GPT-5.6 calibration must remain guarded`,
      )
    }
  } finally {
    loadAllPrompts(PROMPTS_ROOT, "omo")
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
  assert.match(deep, /Do not call `orchestrator`, `builder`, `planner`, `clarifier`, `plan-critic`, any Reviewer profile \(`reviewer`, `reviewer-low`, `reviewer-high`, `reviewer-max`\), any Oracle profile \(`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`\/`high`\/`max` tier variants\), `normal-task`, `deep`, or `complex`/)
})

test("every category receives only the common compression policy", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(cfg, undefined)

  for (const category of BUILTIN_CATEGORIES) {
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
  const target = {
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
