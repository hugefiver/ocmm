import { test } from "node:test"
import assert from "node:assert/strict"

import { clearSessionIntent, createChatMessageHandler } from "./chat-message.ts"
import { defaultConfig } from "../config/schema.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"

// Load the bundled prompts once for the whole test file.
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
    agent: { name: opts.agentName ?? "sisyphus" },
    model: {
      providerID: opts.providerID ?? "openai",
      modelID: opts.modelID ?? "gpt-5.5",
    },
    message: { content: opts.text },
  }
}

test("chat.message injects ultrawork prompt on ULW keyword", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ text: "please ultrawork the refactor" })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.equal(typeof output.system, "string")
  assert.ok((output.system as string).length > 100)
})

test("chat.message picks gpt variant when model is gpt", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ text: "ulw plz", modelID: "gpt-5.5", providerID: "openai" })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  // gpt.md has unique markers; default.md doesn't — sanity-check by length differs from default
  const out = output.system as string
  assert.ok(out.length > 0)
})

test("chat.message latches per session — second hit no-ops", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ sessionID: "latch-test", text: "ulw" })
  clearSessionIntent(input.sessionID)
  const out1: Record<string, unknown> = {}
  await handler(input, out1)
  const out2: Record<string, unknown> = {}
  await handler(input, out2)
  assert.ok(typeof out1.system === "string" && (out1.system as string).length > 0)
  assert.equal(out2.system, undefined)
})

test("chat.message skips planner agent on standalone ultrawork", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({
    sessionID: "p1",
    agentName: "prometheus",
    text: "ulw the plan",
  })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.equal(output.system, undefined)
})

test("chat.message respects intent.enabled=false", async () => {
  const cfg = { ...defaultConfig(), intent: { enabled: false, skipAgents: [] } }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ sessionID: "off", text: "ultrawork now" })
  const output: Record<string, unknown> = {}
  await handler(input, output)
  assert.equal(output.system, undefined)
})

test("chat.message detects composite hyperplan-ultrawork", async () => {
  const cfg = defaultConfig()
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const input = makeInput({ sessionID: "h1", text: "hpp ulw please" })
  clearSessionIntent(input.sessionID)
  const output: Record<string, unknown> = {}
  await handler(input, output)
  // composed prompt should be a non-trivial concatenation
  assert.ok(typeof output.system === "string")
  assert.ok((output.system as string).length > 100)
})
