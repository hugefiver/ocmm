import { test } from "node:test"
import assert from "node:assert/strict"

import {
  clearSessionIntent,
  createChatMessageHandler,
  createSystemTransformHandler,
  getSessionPrompt,
} from "./chat-message.ts"
import { defaultConfig } from "../config/schema.ts"
import { loadAllPrompts } from "../intent/prompt-loader.ts"
import { join } from "node:path"

loadAllPrompts(join(process.cwd(), "prompts"))

function makeInput(opts: {
  sessionID?: string
  agentName?: string
  providerID?: string
  modelID?: string
}) {
  return {
    sessionID: opts.sessionID ?? "s1",
    agent: opts.agentName ?? "orchestrator",
    model: {
      providerID: opts.providerID ?? "openai",
      modelID: opts.modelID ?? "gpt-5.5",
    },
    messageID: "msg-1",
  }
}

function makeOutput(text: string) {
  return {
    message: { id: "msg-1", role: "user" },
    parts: [{ type: "text", text }],
  }
}

async function detect(handler: ReturnType<typeof createChatMessageHandler>, opts: {
  sessionID: string
  agentName?: string
  providerID?: string
  modelID?: string
  text: string
}) {
  const input = makeInput(opts)
  await handler(input, makeOutput(opts.text))
  return input
}

test("chat.message latches deepwork intent on DW keyword and queues prompt", async () => {
  const handler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  clearSessionIntent("s1")
  await detect(handler, { sessionID: "s1", text: "please deepwork the refactor" })
  const queued = getSessionPrompt("s1")
  assert.ok(queued, "expected queued prompt")
  assert.ok(queued!.length > 100)
})

test("chat.message picks gpt variant when model is gpt", async () => {
  const handler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  clearSessionIntent("s2")
  await detect(handler, { sessionID: "s2", text: "dw plz", modelID: "gpt-5.5", providerID: "openai" })
  const queued = getSessionPrompt("s2")
  assert.ok(queued && queued.length > 0)
})

test("chat.message latches per session - same intent twice yields one queued prompt", async () => {
  const handler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  clearSessionIntent("s3")
  await detect(handler, { sessionID: "s3", text: "dw" })
  const after1 = getSessionPrompt("s3")
  await detect(handler, { sessionID: "s3", text: "dw again" })
  const after2 = getSessionPrompt("s3")
  assert.equal(after1, after2)
})

test("chat.message skips planner agent on standalone deepwork", async () => {
  const handler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  clearSessionIntent("s4")
  await detect(handler, {
    sessionID: "s4",
    agentName: "planner",
    text: "dw the plan",
  })
  assert.equal(getSessionPrompt("s4"), null)
})

test("chat.message respects intent.enabled=false", async () => {
  const cfg = { ...defaultConfig(), intent: { enabled: false, skipAgents: [] } }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  clearSessionIntent("s5")
  await detect(handler, { sessionID: "s5", text: "deepwork now" })
  assert.equal(getSessionPrompt("s5"), null)
})

test("chat.message detects composite superplan-deepwork", async () => {
  const handler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  clearSessionIntent("s6")
  await detect(handler, { sessionID: "s6", text: "sp dw please" })
  const queued = getSessionPrompt("s6")
  assert.ok(queued && queued.length > 100)
})

test("system.transform prepends queued prompt to system array", async () => {
  const msgHandler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  const sysHandler = createSystemTransformHandler()
  clearSessionIntent("s7")
  await detect(msgHandler, { sessionID: "s7", text: "dw" })
  const sysOutput: { system: string[] } = { system: ["base prompt"] }
  await sysHandler({ sessionID: "s7" }, sysOutput)
  assert.equal(sysOutput.system.length, 2)
  assert.ok(sysOutput.system[0]!.length > 100)
  assert.equal(sysOutput.system[1], "base prompt")
})

test("system.transform tolerates string system shape", async () => {
  const msgHandler = createChatMessageHandler({ getConfig: () => defaultConfig() })
  const sysHandler = createSystemTransformHandler()
  clearSessionIntent("s8")
  await detect(msgHandler, { sessionID: "s8", text: "dw" })
  const sysOutput: Record<string, unknown> = { system: "base" }
  await sysHandler({ sessionID: "s8" }, sysOutput)
  assert.equal(typeof sysOutput.system, "string")
  assert.ok((sysOutput.system as string).includes("base"))
  assert.ok((sysOutput.system as string).length > (4 + 100))
})

test("system.transform no-ops when no intent latched", async () => {
  const sysHandler = createSystemTransformHandler()
  const sysOutput: Record<string, unknown> = { system: ["unchanged"] }
  await sysHandler({ sessionID: "no-such-session" }, sysOutput)
  assert.deepEqual(sysOutput.system, ["unchanged"])
})
