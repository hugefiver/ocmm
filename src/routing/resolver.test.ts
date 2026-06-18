import { test } from "node:test"
import assert from "node:assert/strict"

import { resolveModelRouting } from "./resolver.ts"

test("matches an entry in the built-in agent chain", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.entry.model, "gpt-5.5")
  assert.equal(r!.variant, "high")
  assert.equal(r!.source, "agent-default")
})

test("falls back to first chain entry when current model isn't in the chain", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "totally-foreign-model",
    providerID: "openai",
  })
  assert.ok(r)
  assert.equal(r!.entry.model, "gpt-5.5")
  assert.equal(r!.source, "agent-default")
})

test("input variant overrides chain variant", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
    inputVariant: "low",
  })
  assert.equal(r!.variant, "low")
})

test("user agent override beats built-in", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
    agentsConfig: {
      reviewer: {
        requirement: {
          variant: "minimal",
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", variant: "minimal" }],
        },
      },
    },
  })
  assert.equal(r!.source, "user-config")
  assert.equal(r!.variant, "minimal")
})

test("user shorthand `model` produces a one-entry chain", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "claude-opus-4-7",
    providerID: "anthropic",
    agentsConfig: {
      reviewer: { model: "anthropic/claude-opus-4-7" },
    },
  })
  assert.equal(r!.source, "user-config")
  assert.equal(r!.entry.model, "claude-opus-4-7")
})

test("disabled agent override drops to built-in", () => {
  const r = resolveModelRouting({
    agentName: "reviewer",
    modelID: "gpt-5.5",
    providerID: "openai",
    agentsConfig: { reviewer: { disabled: true } },
  })
  assert.ok(r)
  assert.equal(r!.source, "agent-default")
})

test("unknown agent + variant -> input-variant resolution", () => {
  const r = resolveModelRouting({
    agentName: "build",
    modelID: "gpt-5.5",
    providerID: "openai",
    inputVariant: "high",
  })
  assert.equal(r!.source, "input-variant")
  assert.equal(r!.variant, "high")
})

test("unknown agent without variant -> null", () => {
  const r = resolveModelRouting({
    agentName: "totally-unknown",
    modelID: "totally-unknown-model",
    providerID: "openai",
  })
  assert.equal(r, null)
})
