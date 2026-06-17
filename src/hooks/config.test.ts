import { test } from "node:test"
import assert from "node:assert/strict"

import { createConfigHandler } from "./config.ts"
import { defaultConfig } from "../config/schema.ts"
import { BUILTIN_AGENTS } from "../data/agents.ts"

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

test("config does not clobber an existing user-set model", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg = {
    agent: {
      sisyphus: { model: "user/custom-model", description: "user-set" },
    },
  }
  await handler(cfg, undefined)
  const entry = cfg.agent.sisyphus as Record<string, unknown>
  assert.equal(entry.model, "user/custom-model")
  assert.equal(entry.description, "user-set")
})

test("disabledAgents skips registration", async () => {
  const c = { ...defaultConfig(), disabledAgents: ["oracle"] }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  assert.equal(cfg.agent.oracle, undefined)
  assert.ok(cfg.agent.sisyphus)
})

test("user agent override wins (model shorthand)", async () => {
  const c = {
    ...defaultConfig(),
    agents: {
      oracle: { model: "anthropic/claude-opus-4-7" },
    },
  }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)
  const e = cfg.agent.oracle as Record<string, unknown>
  assert.equal(e.model, "anthropic/claude-opus-4-7")
})

test("registerBuiltinAgents=false leaves agent map untouched", async () => {
  const c = { ...defaultConfig(), registerBuiltinAgents: false }
  const handler = createConfigHandler({ getConfig: () => c })
  const cfg = { agent: {} }
  await handler(cfg, undefined)
  assert.deepEqual(cfg.agent, {})
})
