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
  assert.equal(r!.variant, "max")
})

test("category-default: hard-reasoning + gpt-5.5 -> max variant", () => {
  const r = resolveModelRouting({
    agentName: "hard-reasoning",
    modelID: "gpt-5.5",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "max")
})

test("published category-default route retains the category max-variant policy", () => {
  const r = resolveModelRouting({
    agentName: "hard-reasoning",
    modelID: "gpt-5.4-mini",
    providerID: "openai",
    effectiveRequirement: {
      requirement: {
        fallbackChain: [{ providers: ["openai"], model: "gpt-5.4-mini", variant: "low" }],
      },
      source: "category-default",
    },
    categoriesConfig: {
      "hard-reasoning": { model: "openai/gpt-5.4-mini", variant: "minimal" },
    },
  })

  assert.ok(r)
  assert.equal(r.source, "category-default")
  assert.equal(r.variant, "max")
})

test("category-default: documenting uses max variant for complex-task policy", () => {
  const r = resolveModelRouting({
    agentName: "documenting",
    modelID: "k2p5",
    providerID: "kimi-for-coding",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.entry.model, "k2p5")
  assert.equal(r!.variant, "max")
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
  assert.equal(r!.source, "user-config")
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

test("explicit input variant is respected for category work", () => {
  const r = resolveModelRouting({
    agentName: "research",
    modelID: "gpt-5.5",
    providerID: "openai",
    inputVariant: "minimal",
  })
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "minimal")
})

test("quick remains lightweight and can accept explicit low variant", () => {
  const r = resolveModelRouting({
    agentName: "quick",
    modelID: "gpt-5.4-mini",
    providerID: "openai",
    inputVariant: "low",
  })
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "low")
})

test("category-default: coding resolves bounded code-edit category", () => {
  const r = resolveModelRouting({
    agentName: "coding",
    modelID: "claude-sonnet-4-6",
    providerID: "anthropic",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.entry.model, "claude-sonnet-4-6")
  assert.equal(r!.variant, "max")
})

test("category-default: deep resolves autonomous delivery category", () => {
  const r = resolveModelRouting({
    agentName: "deep",
    modelID: "claude-opus-4-7",
    providerID: "anthropic",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "max")
})

test("category-default: normal-task resolves ordinary bounded task category", () => {
  const r = resolveModelRouting({
    agentName: "normal-task",
    modelID: "claude-sonnet-4-6",
    providerID: "anthropic",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.entry.model, "claude-sonnet-4-6")
  assert.equal(r!.variant, "max")
})

test("category-default: complex resolves coordinated ordinary task category", () => {
  const r = resolveModelRouting({
    agentName: "complex",
    modelID: "gpt-5.5",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.source, "category-default")
  assert.equal(r!.variant, "max")
})
