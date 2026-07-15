import { test } from "node:test"
import assert from "node:assert/strict"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { getCategoryPrompt, getDeepworkPrompt, loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"

const PROMPTS_ROOT = join(process.cwd(), "prompts")

loadAllPrompts(PROMPTS_ROOT, "omo")

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
        /Apply this layer only when the selected model identifies as part of the GPT-5\.6 family/,
        `${category.name}: GPT-5.6 calibration must remain guarded`,
      )
    }
  } finally {
    loadAllPrompts(PROMPTS_ROOT, "omo")
  }
})
