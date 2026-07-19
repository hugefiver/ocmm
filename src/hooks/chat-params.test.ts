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
  await handler(makeInput({ agentName: "coding", providerID: "zhipu", modelID: "glm-5.2", variant: "low" }), glmOutput)
  assert.deepEqual(glmOutput, { options: { reasoningEffort: "low", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "low")

  const deepseekOutput: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "coding", providerID: "hoo", modelID: "deepseek-v4-pro", variant: "medium" }), deepseekOutput)
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

test("chat.params raises user-config below-xhigh variants for GPT review and plan-review agents", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      "plan-critic": {
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
  await handler(makeInput({ agentName: "plan-critic" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")
})

test("chat.params enforces review-agent GPT/Codex xhigh floors after every override", async () => {
  const cases = [
    { name: "absent", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "minimal", variant: "minimal", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "medium", variant: "medium", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "xhigh", variant: "xhigh", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "max", variant: "max", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "direct low", reasoningEffort: "low", expectedVariant: "xhigh", expectedEffort: "xhigh" },
    { name: "direct max", reasoningEffort: "max", expectedVariant: "xhigh", expectedEffort: "xhigh" },
  ] as const

  for (const agentName of ["reviewer", "oracle", "plan-critic"] as const) {
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

test("chat.params preserves GPT-5.6 native max for review and plan-review agents", async () => {
  for (const agentName of ["reviewer", "oracle", "plan-critic"] as const) {
    clearResolutions()
    const cfg = OcmmConfigSchema.parse({
      agents: {
        [agentName]: {
          requirement: {
            fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol", variant: "max" }],
          },
        },
      },
    })
    const handler = createChatParamsHandler({ getConfig: () => cfg })
    const output: Record<string, unknown> = { options: {} }
    await handler(makeInput({ agentName, modelID: "gpt-5.6-sol" }), output)
    assert.equal((output.options as Record<string, unknown>).reasoningEffort, "max", `${agentName} final effort`)
    assert.equal(recentResolutions().at(-1)!.applied.variant, "max", `${agentName} applied variant`)
  }
})

test("chat.params preserves explicit GPT-5.6 direct max for review agents", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol", reasoningEffort: "max" }],
        },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer", modelID: "gpt-5.6-sol" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "max")
  assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, "max")
})

test("chat.params gates explicit GPT max to GPT-5.6-capable models", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      builder: {
        requirement: {
          fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", reasoningEffort: "max" }],
        },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.5" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, "xhigh")
})

test("chat.params applies review floors after explicit non-GPT high-effort controls", async () => {
  clearResolutions()
  const cfg = OcmmConfigSchema.parse({
    agents: {
      reviewer: {
        requirement: {
          fallbackChain: [{ providers: ["google"], model: "gemini-3.1-pro", variant: "minimal", reasoningEffort: "low", thinking: { type: "disabled" } }],
        },
      },
      oracle: {
        requirement: {
          fallbackChain: [{ providers: ["anthropic"], model: "claude-opus-4-6", variant: "minimal", reasoningEffort: "low" }],
        },
        variants: {
          high: {
            model: "zhipu/glm-5.2",
            variant: "minimal",
          },
        },
      },
      "plan-critic": {
        requirement: {
          fallbackChain: [{ providers: ["hoo"], model: "deepseek-v4-pro", variant: "minimal", reasoningEffort: "low" }],
        },
      },
    },
  })
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
  assert.deepEqual(reviewerOutput, { options: { reasoningEffort: "high", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")

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
  assert.deepEqual((oracleOutput.options as Record<string, unknown>).thinking, {
    type: "enabled",
    budgetTokens: 16_384,
  })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")

  const oracleHighOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "oracle-high",
      providerID: "zhipu",
      modelID: "glm-5.2",
      variant: "minimal",
    }),
    oracleHighOutput,
  )
  assert.deepEqual(oracleHighOutput, { options: { reasoningEffort: "xhigh", thinking: { type: "enabled" } } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")

  const planCriticOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({
      agentName: "plan-critic",
      providerID: "hoo",
      modelID: "deepseek-v4-pro",
      variant: "minimal",
    }),
    planCriticOutput,
  )
  assert.deepEqual(planCriticOutput, { options: { reasoningEffort: "xhigh" } })
  assert.equal(recentResolutions().at(-1)!.applied.variant, "xhigh")
})

test("logical low review profiles retain the xhigh-equivalent safety floor", async () => {
  const config = {
    ...defaultConfig(),
    agents: {
      oracle: { model: "openai/gpt-5.6-terra", variants: { low: "low" as const } },
      "oracle-2nd": { model: "openai/gpt-5.6-sol", variants: { low: "minimal" as const } },
      reviewer: { model: "openai/gpt-5.6-sol", variants: { low: "low" as const } },
    },
  }
  for (const agentName of ["oracle-low", "oracle-2nd-low", "reviewer-low", "oracle-second"] as const) {
    const output = { options: {} as Record<string, unknown> }
    const modelID = agentName === "oracle-second" ? "gpt-5.6-sol" : agentName === "oracle-low" ? "gpt-5.6-terra" : "gpt-5.6-sol"
    await createChatParamsHandler({ getConfig: () => config })(makeInput({ agentName, modelID }), output)
    assert.equal(output.options.reasoningEffort, "xhigh", agentName)
  }
})

test("plan-critic floor remains independent of review-name parsing", async () => {
  const output = { options: {} as Record<string, unknown> }
  await createChatParamsHandler({ getConfig: () => defaultConfig() })(makeInput({ agentName: "plan-critic", modelID: "gpt-5.5" }), output)
  assert.equal(output.options.reasoningEffort, "xhigh")
})

test("generated non-GPT review tiers receive family-specific floors", async () => {
  const config = OcmmConfigSchema.parse({
    agents: {
      oracle: {
        model: "anthropic/claude-opus-4-6",
        variant: "minimal",
        variants: { high: { model: "google/gemini-3.1-pro", variant: "minimal" } },
      },
      reviewer: {
        model: "google/gemini-3.1-pro",
        variants: { low: { model: "zhipu/glm-5.2", variant: "minimal" } },
      },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => config })
  const gemini: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "oracle-high", providerID: "google", modelID: "gemini-3.1-pro" }), gemini)
  assert.deepEqual(gemini, { options: { reasoningEffort: "high", thinking: { type: "enabled" } } })

  const glm: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer-low", providerID: "zhipu", modelID: "glm-5.2" }), glm)
  assert.deepEqual(glm, { options: { reasoningEffort: "xhigh", thinking: { type: "enabled" } } })
})

test("chat.params floors review-agent explicit thinking on Opus 4.7+", async () => {
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
  assert.equal(opts.reasoningEffort, undefined)
  assert.deepEqual(opts.thinking, { type: "enabled", budgetTokens: 24_576 })
  const last = recentResolutions().at(-1)!
  assert.equal(last.source, "user-config")
  assert.equal(last.applied.variant, "max")
})

test("chat.params removes direct review-agent reasoningEffort on Opus 4.7+", async () => {
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
              reasoningEffort: "max",
            },
          ],
        },
      },
    },
  }
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ agentName: "reviewer", providerID: "anthropic", modelID: "claude-opus-4-7" }), output)
  const opts = output.options as Record<string, unknown>
  assert.equal(opts.reasoningEffort, undefined)
  assert.deepEqual(opts.thinking, { type: "enabled", budgetTokens: 24_576 })
  assert.equal(recentResolutions().at(-1)!.applied.reasoningEffort, undefined)
})

test("chat.params preserves explicit non-review thinking on Opus 4.7+", async () => {
  clearResolutions()
  const cfg = {
    ...defaultConfig(),
    agents: {
      builder: {
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
  await handler(makeInput({ agentName: "builder", providerID: "anthropic", modelID: "claude-opus-4-7" }), output)
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

test("chat.params applies the review floor to a host-provided reviewer-high profile absent from expandedReviewAgentMap (GPT)", async () => {
  clearResolutions()
  // No user config for reviewer.variants.high, so expandedReviewAgentMap has
  // no "reviewer-high" entry and resolveModelRouting returns null. The host
  // still routed a real reviewer-high chat, so the floor must apply.
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "xhigh")
  assert.equal(last.input.providerID, "openai")
  assert.equal(last.input.modelID, "gpt-5.5")
  assert.equal(last.agent, "reviewer-high")
})

test("chat.params applies the review floor to a host-provided reviewer-high profile absent from expandedReviewAgentMap (GLM)", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", providerID: "zhipu", modelID: "glm-5.2" }),
    output,
  )
  const opts = output.options as Record<string, unknown>
  // GLM translates non-explicit xhigh to its native max level (model-native
  // behavior preserved); the logical floor variant remains xhigh.
  assert.equal(opts.reasoningEffort, "max")
  assert.deepEqual(opts.thinking, { type: "enabled" })
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "max")
  assert.equal(last.input.providerID, "zhipu")
  assert.equal(last.input.modelID, "glm-5.2")
})

test("chat.params applies the review floor to a host-provided oracle-high profile absent from expandedReviewAgentMap", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "oracle-high", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "xhigh")
  assert.equal(last.agent, "oracle-high")
})

test("chat.params keeps host logical high at xhigh and preserves native max only for logical max", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const highOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", modelID: "gpt-5.6-sol" }),
    highOutput,
  )
  assert.equal((highOutput.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.applied.variant, "xhigh")
  assert.equal(last.applied.reasoningEffort, "xhigh")

  const maxOutput: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-max", modelID: "gpt-5.6-sol" }),
    maxOutput,
  )
  assert.equal((maxOutput.options as Record<string, unknown>).reasoningEffort, "max")
  const maxResolution = recentResolutions().at(-1)!
  assert.equal(maxResolution.applied.variant, "max")
  assert.equal(maxResolution.applied.reasoningEffort, "max")
})

test("chat.params host-profile floor does not route through an unrelated configured model", async () => {
  clearResolutions()
  // The user configured an unrelated model for `coding`. The floor must be
  // enforced against the actual runtime provider/model (openai/gpt-5.5), not
  // the configured coding model (zhipu/glm-5.2).
  const cfg = OcmmConfigSchema.parse({
    agents: {
      coding: { model: "zhipu/glm-5.2" },
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "reviewer-high", providerID: "openai", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "xhigh")
  const last = recentResolutions().at(-1)!
  assert.equal(last.input.providerID, "openai")
  assert.equal(last.input.modelID, "gpt-5.5")
  assert.equal((output.options as Record<string, unknown>).thinking, undefined)
})

test("chat.params host-profile floor preserves ordinary unknown-agent no-op", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(
    makeInput({ agentName: "totally-unknown-agent", providerID: "openai", modelID: "gpt-5.5" }),
    output,
  )
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, undefined)
  const last = recentResolutions().at(-1)!
  assert.equal(last.source, "no-op")
  assert.deepEqual(last.applied, {})
})
