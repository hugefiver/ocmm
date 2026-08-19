import { test } from "node:test"
import assert from "node:assert/strict"

import { defaultConfig, type OcmmConfig } from "../config/schema.ts"
import { createHistoryCacheMitigationHandler, truncateHistoricalToolOutputs } from "./history-cache-mitigation.ts"

function config(overrides: Partial<OcmmConfig> = {}): OcmmConfig {
  return { ...defaultConfig(), ...overrides }
}

function toolOutput(output: string) {
  return {
    type: "tool",
    tool: "read",
    state: { status: "completed", output, time: { start: 1, end: 2 } },
  }
}

test("history cache mitigation truncates old completed tool outputs and preserves recent ones", async () => {
  const oldOutput = "0123456789abcdefghijklmnopqrstuvwxyz"
  const recentOutput = "recent-0123456789abcdefghijklmnopqrstuvwxyz"
  const output = {
    messages: [
      { info: { role: "user", model: { modelID: "gpt-5.6-sol" } }, parts: [] },
      { info: { role: "assistant", modelID: "gpt-5.6-sol" }, parts: [toolOutput(oldOutput)] },
      { info: { role: "assistant", modelID: "gpt-5.6-sol" }, parts: [toolOutput(recentOutput)] },
    ],
  }
  const handler = createHistoryCacheMitigationHandler({
    getConfig: () => config({
      historyCacheMitigation: {
        enabled: true,
        models: ["gpt-5.6-*"],
        maxToolOutputChars: 10,
        preserveRecentToolResults: 1,
      },
    }),
  })

  await handler({ model: { modelID: "gpt-5.6-sol" } }, output)

  const first = output.messages[1]!.parts[0]!.state.output
  const second = output.messages[2]!.parts[0]!.state.output
  assert.match(first, /^0123456789\n\n\[ocmm cache mitigation:/)
  assert.match(first, /omitted 26 chars/)
  assert.equal(second, recentOutput)
})

test("history cache mitigation uses the current input model instead of historical messages", async () => {
  const original = "0123456789abcdefghijklmnopqrstuvwxyz"
  const output = {
    messages: [
      { info: { role: "assistant", modelID: "gpt-5.6-sol" }, parts: [toolOutput(original)] },
    ],
  }
  const handler = createHistoryCacheMitigationHandler({
    getConfig: () => config({
      historyCacheMitigation: {
        enabled: true,
        models: ["gpt-5.6-sol"],
        maxToolOutputChars: 1000,
        preserveRecentToolResults: 0,
      },
    }),
  })

  await handler({ model: { modelID: "gpt-5.5" } }, output)

  assert.equal(output.messages[0]!.parts[0]!.state.output, original)
})

test("history cache mitigation applies to a current target model even with non-target history", async () => {
  const original = "0123456789abcdefghijklmnopqrstuvwxyz"
  const output = {
    messages: [
      { info: { role: "assistant", modelID: "gpt-5.5" }, parts: [toolOutput(original)] },
    ],
  }
  const handler = createHistoryCacheMitigationHandler({
    getConfig: () => config({
      historyCacheMitigation: {
        enabled: true,
        models: ["gpt-5.6-sol"],
        maxToolOutputChars: 10,
        preserveRecentToolResults: 0,
      },
    }),
  })

  await handler({ properties: { model: { modelID: "gpt-5.6-sol" } } }, output)

  assert.match(output.messages[0]!.parts[0]!.state.output, /^0123456789\n\n\[ocmm cache mitigation:/)
})

test("history cache mitigation fails closed when current model is unavailable", async () => {
  const original = "0123456789abcdefghijklmnopqrstuvwxyz"
  const output = {
    messages: [
      { info: { role: "assistant", modelID: "gpt-5.6-sol" }, parts: [toolOutput(original)] },
    ],
  }
  const handler = createHistoryCacheMitigationHandler({
    getConfig: () => config({
      historyCacheMitigation: {
        enabled: true,
        models: ["gpt-5.6-sol"],
        maxToolOutputChars: 1000,
        preserveRecentToolResults: 0,
      },
    }),
  })

  await handler({}, output)

  assert.equal(output.messages[0]!.parts[0]!.state.output, original)
})

test("truncateHistoricalToolOutputs is idempotent", () => {
  const output = "0123456789abcdefghijklmnopqrstuvwxyz"
  const messages = [
    { info: { role: "assistant" }, parts: [toolOutput(output), toolOutput("recent output that stays intact")] },
  ]

  const first = truncateHistoricalToolOutputs(messages, { maxToolOutputChars: 10, preserveRecentToolResults: 1 })
  const second = truncateHistoricalToolOutputs(messages, { maxToolOutputChars: 10, preserveRecentToolResults: 1 })

  assert.equal(first.truncated, 1)
  assert.equal(second.truncated, 0)
})

test("history cache mitigation respects disabled hook", async () => {
  const original = "0123456789abcdefghijklmnopqrstuvwxyz"
  const output = {
    messages: [
      { info: { role: "assistant", modelID: "gpt-5.6-sol" }, parts: [toolOutput(original)] },
    ],
  }
  const handler = createHistoryCacheMitigationHandler({
    getConfig: () => config({
      disabledHooks: ["history-cache-mitigation"],
      historyCacheMitigation: {
        enabled: true,
        models: ["gpt-5.6-sol"],
        maxToolOutputChars: 1000,
        preserveRecentToolResults: 0,
      },
    }),
  })

  await handler({ model: { modelID: "gpt-5.6-sol" } }, output)

  assert.equal(output.messages[0]!.parts[0]!.state.output, original)
})
