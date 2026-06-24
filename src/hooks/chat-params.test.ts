import { test } from "node:test"
import assert from "node:assert/strict"

import { createChatParamsHandler } from "./chat-params.ts"
import { defaultConfig } from "../config/schema.ts"
import { clearResolutions, recentResolutions } from "../routing/ledger.ts"

function makeInput(overrides?: Partial<{
  sessionID: string
  agentName: string
  providerID: string
  modelID: string
  variant: string
}>) {
  return {
    sessionID: overrides?.sessionID ?? "sess-1",
    agent: { name: overrides?.agentName ?? "reviewer" },
    model: {
      providerID: overrides?.providerID ?? "openai",
      modelID: overrides?.modelID ?? "gpt-5.5",
    },
    provider: { id: overrides?.providerID ?? "openai" },
    message: overrides?.variant ? { variant: overrides.variant } : {},
  }
}

test("chat.params applies reviewer's preferred variant on gpt-5.5", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput(), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "high")
  const log = recentResolutions()
  assert.ok(log.length >= 1)
  const last = log[log.length - 1]!
  assert.equal(last.applied.variant, "high")
})

test("chat.params respects explicit input.variant on non-mini GPT", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ variant: "minimal" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "minimal")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "minimal")
})

test("chat.params preserves below-high variants on GPT mini", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ modelID: "gpt-5.4-mini", variant: "minimal" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "minimal")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "minimal")
})

test("chat.params on claude-opus 4.7+ emits no thinking block", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "orchestrator",
      providerID: "anthropic",
      modelID: "claude-opus-4-7",
    }),
    output,
  )
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.thinking, undefined)
  assert.equal(opts.reasoningEffort, undefined)
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "max")
})

test("chat.params applies explicit GLM and DeepSeek reasoning controls", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const glmOutput: Record<string, unknown> = { options: {} }
  await handler(makeInput({ providerID: "zhipu", modelID: "glm-5.2", variant: "low" }), glmOutput)
  assert.deepEqual(glmOutput, { options: { reasoningEffort: "low", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "low")

  const deepseekOutput: Record<string, unknown> = { options: {} }
  await handler(makeInput({ providerID: "hoo", modelID: "deepseek-v4-pro", variant: "medium" }), deepseekOutput)
  assert.deepEqual(deepseekOutput, { options: { reasoningEffort: "medium" } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "medium")
})

test("chat.params records max for category work at or above coding", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "coding", modelID: "claude-sonnet-4-6" }), output)
  const opts = output.options as Record<string, unknown>
  assert.ok(opts.thinking)
  assert.equal(recentResolutions().at(-1)!.applied.variant, "max")
})

test("chat.params respects user-config below-high variants on non-mini GPT", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [
            { providers: ["openai"], model: "gpt-5.5", variant: "medium" as const },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput(), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "medium")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "medium")
})

test("chat.params preserves explicit user-config thinking on Opus 4.7+", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [
            {
              providers: ["anthropic"],
              model: "claude-opus-4-7",
              variant: "max" as const,
              reasoningEffort: "low",
              thinking: { type: "enabled" as const, budgetTokens: 1234 },
            },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ providerID: "anthropic", modelID: "claude-opus-4-7" }), output)
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.reasoningEffort, "low")
  assert.deepEqual(opts.thinking, { type: "enabled", budgetTokens: 1234 })
  const last = recentResolutions().at(-1)!
  assert.equal(last.source, "user-config")
  assert.equal(last.applied.variant, "max")
})

test("chat.params clamps built-in default below-high variants on non-mini GPT", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "high")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "high")
})

test("chat.params is a no-op for unknown agent + no variant", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "xyz", providerID: "openai", modelID: "foo" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, undefined)
  const log = recentResolutions()
  const last = log[log.length - 1]!
  assert.equal(last.source, "no-op")
})

test("chat.params tolerates malformed input without throwing", async () => {
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  await handler(null, { options: {} })
  await handler({}, { options: {} })
  await handler({ sessionID: "x" }, { options: {} })
})
