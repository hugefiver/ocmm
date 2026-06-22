import { test } from "node:test"
import assert from "node:assert/strict"

import {
  clearSessionIntent,
  createChatMessageHandler,
  createSystemTransformHandler,
  getSessionPrompt,
} from "./chat-message.ts"
import { defaultConfig } from "../config/schema.ts"

function makeInput(opts: {
  sessionID?: string
  agentName?: string
}) {
  return {
    sessionID: opts.sessionID ?? "s1",
    agent: opts.agentName ?? "orchestrator",
    messageID: "msg-1",
  }
}

function makeOutput() {
  return {
    message: { id: "msg-1", role: "user" },
    parts: [{ type: "text", text: "hello" }],
  }
}

test("omo workflow: chat.message is a no-op", async () => {
  const cfg = { ...defaultConfig(), workflow: "omo" as const }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  clearSessionIntent("s1")
  await handler(makeInput({ sessionID: "s1" }), makeOutput())
  assert.equal(getSessionPrompt("s1"), null)
})

test("v1 workflow: chat.message queues skills on first message", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const handler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL CONTENT HERE",
  })
  clearSessionIntent("s2")
  await handler(makeInput({ sessionID: "s2" }), makeOutput())
  const queued = getSessionPrompt("s2")
  assert.ok(queued, "expected queued skills")
  assert.ok(queued!.includes("SKILL CONTENT HERE"))
})

test("v1 workflow: second message does not re-queue (latching)", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const handler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "FIRST SKILL",
  })
  clearSessionIntent("s3")
  await handler(makeInput({ sessionID: "s3" }), makeOutput())
  const after1 = getSessionPrompt("s3")
  await handler(makeInput({ sessionID: "s3" }), makeOutput())
  const after2 = getSessionPrompt("s3")
  assert.equal(after1, after2)
})

test("v1 workflow: empty skills content is not queued", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const handler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "",
  })
  clearSessionIntent("s4")
  await handler(makeInput({ sessionID: "s4" }), makeOutput())
  assert.equal(getSessionPrompt("s4"), null)
})

test("system.transform prepends queued skills to system array", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const msgHandler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL TEXT",
  })
  const sysHandler = createSystemTransformHandler()
  clearSessionIntent("s5")
  await msgHandler(makeInput({ sessionID: "s5" }), makeOutput())
  const sysOutput: { system: string[] } = { system: ["base prompt"] }
  await sysHandler({ sessionID: "s5" }, sysOutput)
  assert.equal(sysOutput.system.length, 2)
  assert.ok(sysOutput.system[0]!.includes("SKILL TEXT"))
  assert.equal(sysOutput.system[1], "base prompt")
})

test("system.transform tolerates string system shape", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const msgHandler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL TEXT",
  })
  const sysHandler = createSystemTransformHandler()
  clearSessionIntent("s6")
  await msgHandler(makeInput({ sessionID: "s6" }), makeOutput())
  const sysOutput: Record<string, unknown> = { system: "base" }
  await sysHandler({ sessionID: "s6" }, sysOutput)
  assert.equal(typeof sysOutput.system, "string")
  assert.ok((sysOutput.system as string).includes("base"))
  assert.ok((sysOutput.system as string).includes("SKILL TEXT"))
})

test("system.transform no-ops when no skills queued", async () => {
  const sysHandler = createSystemTransformHandler()
  const sysOutput: Record<string, unknown> = { system: ["unchanged"] }
  await sysHandler({ sessionID: "no-such-session" }, sysOutput)
  assert.deepEqual(sysOutput.system, ["unchanged"])
})
