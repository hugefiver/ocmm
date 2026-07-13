import { test } from "node:test"
import assert from "node:assert/strict"

import { createChatParamsHandler } from "./chat-params.ts"
import { defaultConfig, OcmmConfigSchema } from "../config/schema.ts"
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

test("chat.params applies reviewer's xhigh floor on gpt-5.5", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput(), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const log = recentResolutions()
  assert.ok(log.length >= 1)
  const last = log[log.length - 1]!
  assert.equal(last.applied.variant, "xhigh")
})

test("chat.params raises explicit reviewer input.variant on non-mini GPT", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ variant: "minimal" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
})

test("chat.params preserves below-high variants on GPT mini", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.4-mini", variant: "minimal" }), output)
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

test("chat.params raises user-config below-xhigh variants for GPT reviewers", async () => {
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
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")
})

test("chat.params enforces reviewer and oracle GPT/Codex xhigh floors after every override", async () => {
  const cases = [
    { name: "absent", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "minimal", variant: "minimal", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "medium", variant: "medium", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "xhigh", variant: "xhigh", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "max", variant: "max", expectedVariant: "max", expectedEffort: "xhigh" },
    { name: "direct low", reasoningEffort: "low", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "direct max", reasoningEffort: "max", expectedVariant: "xhigh", expectedEffort: "max" },
  ] as const

  for (const agentName of ["reviewer", "oracle"] as const) {
    for (const family of ["gpt", "codex"] as const) {
      const modelID = family === "codex"
        ? agentName === "reviewer" ? "gpt-5.5-codex" : "gpt-5-codex"
        : agentName === "reviewer" ? "gpt-5.5" : "gpt-5"
      for (const testCase of cases) {
        clearResolutions()
        const entry = {
          providers: ["openai"],
          model: modelID,
          ...("reasoningEffort" in testCase
            ? { reasoningEffort: testCase.reasoningEffort }
            : {}),
        }
        const cfg = OcmmConfigSchema.parse({
          agents: {
            [agentName]: { requirement: { fallbackChain: [entry] } },
          },
        })
        const handler = createChatParamsHandler({ getConfig: () => cfg })
        const output: Record<string, unknown> = { options: {} }
        await handler(
          makeInput({
            agentName,
            modelID,
            ...(testCase.variant ? { variant: testCase.variant } : {}),
          }),
          output,
        )

        const label = `${agentName} ${family} ${testCase.name}`
        assert.equal(
          (output.options as Record<string, unknown>).reasoningEffort,
          testCase.expectedEffort,
          `${label} final effort`,
        )
        assert.equal(
          recentResolutions().at(-1)!.applied.variant,
          testCase.expectedVariant,
          `${label} applied variant`,
        )
      }
    }
  }
})

test("chat.params leaves non-GPT reviewer and oracle variants unchanged", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({})
  const handler = createChatParamsHandler({ getConfig: () => cfg })

  const reviewerOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "reviewer",
      providerID: "google",
      modelID: "gemini-3.1-pro",
      variant: "minimal",
    }),
    reviewerOutput,
  )
  assert.equal((reviewerOutput.options as Record<string, unknown>).reasoningEffort, "minimal")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "minimal")

  const oracleOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "oracle",
      providerID: "anthropic",
      modelID: "claude-opus-4-6",
      variant: "minimal",
    }),
    oracleOutput,
  )
  assert.deepEqual((oracleOutput.options as Record<string, unknown>).thinking, { type: "disabled" })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "minimal")
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

test("chat.params records sessionID → agentName in sessionAgentMap", async () => {
  clearResolutions()
  const sessionAgentMap = new Map<string, string>()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg, sessionAgentMap })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ sessionID: "ses_test_agent_map", agentName: "coding" }), output)
  assert.equal(sessionAgentMap.get("ses_test_agent_map"), "coding")
})
