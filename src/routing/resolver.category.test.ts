import { test } from "node:test"
import assert from "node:assert/strict"

import { resolveModelRouting } from "./resolver.ts"

test("category-default: matches frontend's preferred chain on gemini-3.1-pro", () => {
  const r = resolveModelRouting({
    agentName: "frontend",
    modelID: "gemini-3.1-pro",
    providerID: "google",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.entry.model, "gemini-3.1-pro")
  assert.equal(r!.variant, "high")
})

test("category-default: hard-reasoning + gpt-5.5 -> xhigh variant", () => {
  const r = resolveModelRouting({
    agentName: "hard-reasoning",
    modelID: "gpt-5.5",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "xhigh")
})

test("category-default: writing has no variant when chain entry has none", () => {
  const r = resolveModelRouting({
    agentName: "writing",
    modelID: "k2p5",
    providerID: "kimi-for-coding",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.entry.model, "k2p5")
  assert.equal(r!.variant, undefined)
})

test("user category override beats built-in category", () => {
  const r = resolveModelRouting({
    agentName: "frontend",
    modelID: "gpt-5.5",
    providerID: "openai",
    categoriesConfig: {
      frontend: {
        variant: "low",
        model: "openai/gpt-5.5",
      },
    },
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "low")
})

test("agent name takes priority over category lookup when both exist", () => {
  // 'planner' is a built-in agent name, not a category. Should hit agent-default.
  const r = resolveModelRouting({
    agentName: "planner",
    modelID: "claude-opus-4-7",
    providerID: "anthropic",
  })
  assert.ok(r)
  assert.equal(r!.source, "agent-default")
  assert.equal(r!.variant, "max")
})

test("input variant overrides category variant", () => {
  const r = resolveModelRouting({
    agentName: "research",
    modelID: "gpt-5.5",
    providerID: "openai",
    inputVariant: "minimal",
  })
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "minimal")
})
