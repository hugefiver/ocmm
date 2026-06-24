import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

function makeOutput(text = "hello") {
  return {
    message: { id: "msg-1", role: "user" },
    parts: [{ type: "text", text }],
  }
}

function writeSkill(root: string, dir: string, name: string, description: string) {
  const full = join(root, dir)
  mkdirSync(full, { recursive: true })
  writeFileSync(
    join(full, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nSkill body.`,
  )
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

test("chat.message expands builtin slash commands for noninteractive run input", async () => {
  const cfg = { ...defaultConfig(), workflow: "omo" as const }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  const sysHandler = createSystemTransformHandler()
  clearSessionIntent("cmd1")

  const output = makeOutput("/ralph-loop Ship the tiny fix")
  await handler(makeInput({ sessionID: "cmd1" }), output)

  const queued = getSessionPrompt("cmd1")
  assert.ok(queued)
  assert.match(queued, /Ralph Loop protocol/)
  assert.match(queued, /Ship the tiny fix/)
  assert.equal(output.parts[0]?.text, "Ship the tiny fix")

  const sysOutput: { system: string[] } = { system: ["base prompt"] }
  await sysHandler({ sessionID: "cmd1" }, sysOutput)
  assert.match(sysOutput.system[0] ?? "", /Ralph Loop protocol/)

  const titleSysOutput: { system: string[] } = { system: ["title prompt"] }
  await sysHandler({ sessionID: "cmd1" }, titleSysOutput)
  assert.match(titleSysOutput.system[0] ?? "", /Ralph Loop protocol/)

  await handler(makeInput({ sessionID: "cmd1" }), makeOutput("next turn"))
  assert.equal(getSessionPrompt("cmd1"), null)
})

test("chat.message expands slash commands wrapped by shell quotes", async () => {
  const cfg = { ...defaultConfig(), workflow: "omo" as const }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  clearSessionIntent("cmd-quoted")

  const output = makeOutput('"/ralph-loop Quoted command"')
  await handler(makeInput({ sessionID: "cmd-quoted" }), output)

  const queued = getSessionPrompt("cmd-quoted")
  assert.ok(queued)
  assert.match(queued, /Quoted command/)
  assert.equal(output.parts[0]?.text, "Quoted command")
})

test("chat.message expands dwloop as the deepwork loop alias", async () => {
  const cfg = { ...defaultConfig(), workflow: "omo" as const }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  clearSessionIntent("cmd-dwloop")

  const output = makeOutput("/dwloop Verify and finish")
  await handler(makeInput({ sessionID: "cmd-dwloop" }), output)

  const queued = getSessionPrompt("cmd-dwloop")
  assert.ok(queued)
  assert.match(queued, /audit\/deepwork loop protocol/)
  assert.match(queued, /Verify and finish/)
  assert.equal(output.parts[0]?.text, "Verify and finish")
})

test("chat.message respects disabledCommands for slash command compatibility", async () => {
  const cfg = { ...defaultConfig(), disabledCommands: ["ralph-loop"] }
  const handler = createChatMessageHandler({ getConfig: () => cfg })
  clearSessionIntent("cmd-disabled")

  const output = makeOutput("/ralph-loop should not expand")
  await handler(makeInput({ sessionID: "cmd-disabled" }), output)

  assert.equal(getSessionPrompt("cmd-disabled"), null)
  assert.equal(output.parts[0]?.text, "/ralph-loop should not expand")
})

test("chat.message expands shared skill slash commands", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-hook-command-skills-"))
  try {
    writeSkill(root, "local-skill", "local-skill", "Local skill")
    const cfg = { ...defaultConfig(), skills: { sources: [], enable: [], disable: [] } }
    const handler = createChatMessageHandler({ getConfig: () => cfg, skillsRoot: root })
    clearSessionIntent("cmd-shared-skill")

    const output = makeOutput("/local-skill Use the local skill")
    await handler(makeInput({ sessionID: "cmd-shared-skill" }), output)

    const queued = getSessionPrompt("cmd-shared-skill")
    assert.ok(queued)
    assert.match(queued, /<skill-instruction>/)
    assert.match(queued, /Use the local skill/)
    assert.equal(output.parts[0]?.text, "Use the local skill")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("v1 workflow queues skills plus one-shot slash command", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const handler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL TEXT",
  })
  const sysHandler = createSystemTransformHandler()
  clearSessionIntent("cmd-v1")

  const output = makeOutput("/audit-loop Verify everything")
  await handler(makeInput({ sessionID: "cmd-v1" }), output)

  const queued = getSessionPrompt("cmd-v1")
  assert.ok(queued)
  assert.match(queued, /SKILL TEXT/)
  assert.match(queued, /audit\/deepwork loop protocol/)

  const sysOutput: { system: string[] } = { system: ["base"] }
  await sysHandler({ sessionID: "cmd-v1" }, sysOutput)
  assert.match(sysOutput.system[0] ?? "", /SKILL TEXT/)
  assert.match(sysOutput.system[0] ?? "", /audit\/deepwork loop protocol/)

  const afterTransform = getSessionPrompt("cmd-v1")
  assert.ok(afterTransform)
  assert.match(afterTransform, /SKILL TEXT/)
  assert.match(afterTransform, /audit\/deepwork loop protocol/)

  await handler(makeInput({ sessionID: "cmd-v1" }), makeOutput("next turn"))
  const afterNextMessage = getSessionPrompt("cmd-v1")
  assert.ok(afterNextMessage)
  assert.match(afterNextMessage, /SKILL TEXT/)
  assert.doesNotMatch(afterNextMessage, /audit\/deepwork loop protocol/)
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
