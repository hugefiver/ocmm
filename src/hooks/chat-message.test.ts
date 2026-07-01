import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  clearSessionIntent,
  createChatMessageHandler,
  createSessionIntentStore,
  createSystemTransformHandler,
  getSessionPrompt,
} from "./chat-message.ts"
import { defaultConfig } from "../config/schema.ts"
import type { OcmmConfig } from "../config/schema.ts"

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
  const sysHandler = createSystemTransformHandler({ getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig })
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
  const sysHandler = createSystemTransformHandler({ getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig })
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
  const sysHandler = createSystemTransformHandler({ getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig })
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
  const sysHandler = createSystemTransformHandler({ getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig })
  clearSessionIntent("s6")
  await msgHandler(makeInput({ sessionID: "s6" }), makeOutput())
  const sysOutput: Record<string, unknown> = { system: "base" }
  await sysHandler({ sessionID: "s6" }, sysOutput)
  assert.equal(typeof sysOutput.system, "string")
  assert.ok((sysOutput.system as string).includes("base"))
  assert.ok((sysOutput.system as string).includes("SKILL TEXT"))
})

test("system.transform no-ops when no skills queued", async () => {
  const sysHandler = createSystemTransformHandler({ getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig })
  const sysOutput: Record<string, unknown> = { system: ["unchanged"] }
  await sysHandler({ sessionID: "no-such-session" }, sysOutput)
  assert.deepEqual(sysOutput.system, ["unchanged"])
})

test("system.transform appends commit guard to array system when enabled", async () => {
  const sessionID = "ses_test_guard_arr"
  clearSessionIntent(sessionID)
  const getConfig = () => ({ disabledHooks: [] }) as unknown as OcmmConfig
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: ["ORIGINAL"] }
  await handler(input, output)
  assert.ok(Array.isArray(output.system))
  assert.equal(output.system.length, 2)
  assert.equal(output.system[0], "ORIGINAL")
  assert.ok(typeof output.system[1] === "string")
  assert.ok((output.system[1] as string).includes("Commit Guard"))
  assert.ok((output.system[1] as string).includes("git commit"))
  assert.ok((output.system[1] as string).includes("OS temp directory"))
})

test("system.transform appends commit guard to string system when enabled", async () => {
  const sessionID = "ses_test_guard_str"
  clearSessionIntent(sessionID)
  const getConfig = () => ({ disabledHooks: [] }) as unknown as OcmmConfig
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: "ORIGINAL" }
  await handler(input, output)
  assert.equal(typeof output.system, "string")
  assert.ok((output.system as string).startsWith("ORIGINAL"))
  assert.ok((output.system as string).includes("Commit Guard"))
  assert.ok((output.system as string).includes("git commit"))
})

test("system.transform does not append commit guard when disabled", async () => {
  const sessionID = "ses_test_guard_off"
  clearSessionIntent(sessionID)
  const getConfig = () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: ["ORIGINAL"] }
  await handler(input, output)
  assert.ok(Array.isArray(output.system))
  assert.equal(output.system.length, 1)
  assert.equal(output.system[0], "ORIGINAL")
})

test("system.transform tolerates getConfig throwing", async () => {
  const sessionID = "ses_test_guard_err"
  clearSessionIntent(sessionID)
  const getConfig = () => { throw new Error("config unavailable") }
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: ["ORIGINAL"] }
  await handler(input, output)
  assert.equal(output.system.length, 1)
  assert.equal(output.system[0], "ORIGINAL")
})

// --- SessionIntentStore isolation tests ---

test("createSessionIntentStore returns isolated maps", () => {
  const storeA = createSessionIntentStore()
  const storeB = createSessionIntentStore()

  storeA.getOrInit("s1").prompts.push("from-a")
  storeB.getOrInit("s1").prompts.push("from-b")

  const promptA = storeA.getSessionPrompt("s1")
  const promptB = storeB.getSessionPrompt("s1")

  assert.ok(promptA!.includes("from-a"))
  assert.ok(!promptA!.includes("from-b"))
  assert.ok(promptB!.includes("from-b"))
  assert.ok(!promptB!.includes("from-a"))
})

test("independent stores do not share v1SkillsQueued state", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const storeA = createSessionIntentStore()
  const storeB = createSessionIntentStore()

  const handlerA = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL-A",
    store: storeA,
  })
  const handlerB = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL-B",
    store: storeB,
  })

  // Queue skills via handler A — should NOT set v1SkillsQueued in store B
  await handlerA(makeInput({ sessionID: "shared-session" }), makeOutput())
  assert.equal(storeA.getOrInit("shared-session").v1SkillsQueued, true)
  assert.equal(storeB.getOrInit("shared-session").v1SkillsQueued, false)

  // Handler B should now queue its own skills (first time for store B)
  await handlerB(makeInput({ sessionID: "shared-session" }), makeOutput())
  assert.equal(storeB.getOrInit("shared-session").v1SkillsQueued, true)

  const promptA = storeA.getSessionPrompt("shared-session")
  const promptB = storeB.getSessionPrompt("shared-session")
  assert.ok(promptA!.includes("SKILL-A"))
  assert.ok(!promptA!.includes("SKILL-B"))
  assert.ok(promptB!.includes("SKILL-B"))
  assert.ok(!promptB!.includes("SKILL-A"))
})

test("independent stores do not share once-prompts (slash commands)", async () => {
  const cfg = { ...defaultConfig(), workflow: "omo" as const }
  const storeA = createSessionIntentStore()
  const storeB = createSessionIntentStore()

  const handlerA = createChatMessageHandler({ getConfig: () => cfg, store: storeA })
  const handlerB = createChatMessageHandler({ getConfig: () => cfg, store: storeB })

  // Queue a slash command via handler A
  await handlerA(makeInput({ sessionID: "s-cmd" }), makeOutput("/ralph-loop Fix from A"))
  // Then queue a different slash command via handler B (should NOT clear A's once-prompt)
  await handlerB(makeInput({ sessionID: "s-cmd" }), makeOutput("/ralph-loop Fix from B"))

  // Both stores should have their respective commands queued
  const promptA = storeA.getSessionPrompt("s-cmd")
  const promptB = storeB.getSessionPrompt("s-cmd")

  assert.ok(promptA!.includes("Fix from A"))
  assert.ok(promptB!.includes("Fix from B"))
})

test("clearSessionIntent on store A does not affect store B", () => {
  const storeA = createSessionIntentStore()
  const storeB = createSessionIntentStore()

  storeA.getOrInit("s1").prompts.push("a-data")
  storeB.getOrInit("s1").prompts.push("b-data")

  storeA.clearSessionIntent("s1")

  assert.equal(storeA.getSessionPrompt("s1"), null)
  assert.ok(storeB.getSessionPrompt("s1")!.includes("b-data"))
})

test("default store (compatibility wrappers) is independent from created stores", () => {
  const custom = createSessionIntentStore()

  // Use the compatibility wrapper
  clearSessionIntent("compat-test")
  getSessionPrompt("compat-test") // initializes default store

  custom.getOrInit("compat-test").prompts.push("custom-data")

  // Default store should be empty
  assert.equal(getSessionPrompt("compat-test"), null)
  // Custom store should have its data
  assert.ok(custom.getSessionPrompt("compat-test")!.includes("custom-data"))
})

test("injected store: chat+transform share custom store, default transform is isolated", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const customStore = createSessionIntentStore()

  const chatHandler = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "CUSTOM SKILLS",
    store: customStore,
  })
  const customSysHandler = createSystemTransformHandler({
    getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig,
    store: customStore,
  })
  const defaultSysHandler = createSystemTransformHandler({
    getConfig: () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig,
  })

  // Queue v1 skills via the custom-store chat handler
  await chatHandler(makeInput({ sessionID: "store-share" }), makeOutput())

  // Custom-store transform should see the queued prompt
  const customSysOutput: { system: string[] } = { system: ["base"] }
  await customSysHandler({ sessionID: "store-share" }, customSysOutput)
  assert.ok(customSysOutput.system[0]!.includes("CUSTOM SKILLS"))

  // Default-store transform should NOT see the queued prompt
  const defaultSysOutput: { system: string[] } = { system: ["base"] }
  await defaultSysHandler({ sessionID: "store-share" }, defaultSysOutput)
  assert.equal(defaultSysOutput.system.length, 1)
  assert.equal(defaultSysOutput.system[0], "base")
})
