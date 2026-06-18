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

test("chat.params input.variant overrides agent default", async () => {
  clearResolutions()
  const cfg = defaultConfig()
  const handler = createChatParamsHandler({ getConfig: () => cfg })
  const output: Record<string, unknown> = { options: {} }
  await handler(makeInput({ variant: "minimal" }), output)
  assert.equal((output.options as Record<string, unknown>).reasoningEffort, "minimal")
})

test("chat.params on claude-opus emits thinking block", async () => {
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
  assert.ok(opts.thinking, "expected thinking option")
  assert.equal((opts.thinking as { type: string }).type, "enabled")
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
