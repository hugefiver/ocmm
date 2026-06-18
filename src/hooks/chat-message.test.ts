import { test } from "node:test"
import assert from "node:assert/strict"

import { clearSessionIntent, createChatMessageHandler } from "./chat-message.ts"
import { defaultConfig } from "../config/schema.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"

loadAllPrompts(join(process.cwd(), "prompts"))

function makeInput(opts: {
  sessionID?: string
  agentName?: string
  providerID?: string
  modelID?: string
  text: string
}) {
  return {
    sessionID: opts.sessionID ?? "s1",
    agent: { name: opts.agentName ?? "orchestrator" },
    model: {
      providerID: opts.providerID ?? "openai",
      modelID: opts.modelID ?? "gpt-5.5",
    },
    message: { content: opts.text },
  }
}

test("chat.message injects deepwork prompt on DW keyword", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ text: "please deepwork the refactor" })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.equal(typeof output.system, "string")
  assert.ok((output.system as string).length > 100)
})

test("chat.message picks gpt variant when model is gpt", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ text: "dw plz", modelID: "gpt-5.5", providerID: "openai" })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  const out = output.system as string
  assert.ok(out.length > 0)
})

test("chat.message latches per session - second hit no-ops", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ sessionID: "latch-test", text: "dw" })
  clearSessionIntent(input.sessionID)
  const out1: Record<string, unknown> = {}
  await handler(input, out1)
  const out2: Record<string, unknown> = {}
  await handler(input, out2)
  assert.ok(typeof out1.system === "string" && (out1.system as string).length > 0)
  assert.equal(out2.system, undefined)
})

test("chat.message skips planner agent on standalone deepwork", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({
    sessionID: "p1",
    agentName: "planner",
    text: "dw the plan",
  })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.equal(output.system, undefined)
})

test("chat.message respects intent.enabled=false", async () => {
  const cfg = { ...defaultConfig(), intent: { enabled: false, skipAgents: [] } }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ sessionID: "off", text: "deepwork now" })
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.equal(output.system, undefined)
})

test("chat.message detects composite superplan-deepwork", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ sessionID: "h1", text: "sp dw please" })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.ok(typeof output.system === "string")
  assert.ok((output.system as string).length > 100)
})
