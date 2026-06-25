import { test } from "node:test"
import assert from "node:assert/strict"
import { createCommandExecuteHandler } from "./command-execute.ts"
import { createIdleContinuationState } from "../runtime-fallback/idle-state.ts"

function makeInput(command: string, args: string, sessionID: string) {
  return {
    command,
    arguments: args,
    sessionID,
  }
}

function makeOutput() {
  return { parts: [] as Array<{ type: string; text?: string }> }
}

test("ignores non-matching commands", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("other-cmd", "", "ses_1"), output)
  assert.equal(state.sessionOverrides.size, 0)
  assert.equal(output.parts.length, 0)
})

test("/idle-continuation on sets session override true", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "on", "ses_1"), output)
  assert.equal(state.sessionOverrides.get("ses_1"), true)
  assert.ok(output.parts.length > 0)
})

test("/idle-continuation off sets session override false", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "off", "ses_1"), output)
  assert.equal(state.sessionOverrides.get("ses_1"), false)
  assert.ok(output.parts.length > 0)
})

test("/idle-continuation status reports current state", async () => {
  const state = createIdleContinuationState()
  state.globalEnabled = true
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "status", "ses_1"), output)
  assert.ok(output.parts.length > 0)
  assert.ok(output.parts[0].text?.includes("enabled"))
})

test("/idle-continuation with no args defaults to status", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "", "ses_1"), output)
  assert.equal(state.sessionOverrides.size, 0)
  assert.ok(output.parts.length > 0)
})

test("/idle-continuation on overrides global false", async () => {
  const state = createIdleContinuationState()
  state.globalEnabled = false
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "on", "ses_1"), output)
  assert.equal(state.sessionOverrides.get("ses_1"), true)
})

test("status reports session override source when override exists", async () => {
  const state = createIdleContinuationState()
  state.globalEnabled = false
  state.sessionOverrides.set("ses_1", true)
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "status", "ses_1"), output)
  assert.ok(output.parts[0].text?.includes("session override"))
})

test("unknown argument produces usage message", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("idle-continuation", "banana", "ses_1"), output)
  assert.ok(output.parts[0].text?.includes("Unknown"))
  assert.ok(output.parts[0].text?.includes("on|off|status"))
})
