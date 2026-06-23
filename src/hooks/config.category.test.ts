import { test } from "node:test"
import assert from "node:assert/strict"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_CATEGORIES } from "../data/categories.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"

loadAllPrompts(join(process.cwd(), "prompts"), "omo")

test("config registers all 8 categories as subagents", async () => {
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
  const c = { ...defaultConfig(), disabledAgents: ["frontend", "writing"] }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  assert.equal(cfg.agent.frontend, undefined)
  assert.equal(cfg.agent.writing, undefined)
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
