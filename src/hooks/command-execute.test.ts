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

test("ralph-loop enables idle continuation for the session", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  const output = makeOutput()
  await handler(makeInput("ralph-loop", "ship the fix", "ses_1"), output)
  assert.equal(state.sessionOverrides.get("ses_1"), true)
  assert.equal(output.parts.length, 0)
})

test("audit-loop enables idle continuation for the session", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  await handler(makeInput("audit-loop", "verify all", "ses_1"), makeOutput())
  assert.equal(state.sessionOverrides.get("ses_1"), true)
})

test("dwloop enables idle continuation for the session", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  await handler(makeInput("dwloop", "finish task", "ses_1"), makeOutput())
  assert.equal(state.sessionOverrides.get("ses_1"), true)
})

test("loop command overrides a prior explicit off", async () => {
  const state = createIdleContinuationState()
  state.sessionOverrides.set("ses_1", false)
  const handler = createCommandExecuteHandler({ idleState: state })
  await handler(makeInput("ralph-loop", "resume", "ses_1"), makeOutput())
  assert.equal(state.sessionOverrides.get("ses_1"), true)
})

test("explicit off after loop overrides the loop-enabled state", async () => {
  const state = createIdleContinuationState()
  const handler = createCommandExecuteHandler({ idleState: state })
  await handler(makeInput("ralph-loop", "start", "ses_1"), makeOutput())
  assert.equal(state.sessionOverrides.get("ses_1"), true)
  await handler(makeInput("idle-continuation", "off", "ses_1"), makeOutput())
  assert.equal(state.sessionOverrides.get("ses_1"), false)
})
