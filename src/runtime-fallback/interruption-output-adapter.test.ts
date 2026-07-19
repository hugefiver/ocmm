import { test } from "node:test"
import assert from "node:assert/strict"

import { OcmmConfigSchema, defaultConfig } from "../config/schema.ts"
import {
  createSubagentInterruptionOutputAdapter,
  SUBAGENT_CONTINUATION_NOTICE_PREFIX,
} from "./interruption-output-adapter.ts"
import { createSubagent429Controller } from "./subagent-429-controller.ts"

function controller(overrides: {
  explicitlyAborted?: boolean
  taskID?: string
  correlated?: boolean
} = {}) {
  let claimed = false
  return {
    getInterruptionCorrelation() {
      if (overrides.correlated === false) return undefined
      return {
        childSessionID: "child",
        parentSessionID: "parent",
        ...(overrides.taskID === undefined ? { taskID: "tsk_resume_1" } : { taskID: overrides.taskID }),
        terminalTaskErrorObserved: true,
        retryableChildErrorObserved: false,
        explicitlyAborted: overrides.explicitlyAborted ?? false,
      }
    },
    claimInterruptionNotice() {
      if (claimed || overrides.correlated === false) return false
      claimed = true
      return true
    },
  }
}

test("appends one manual continuation notice for explicit correlated task ID and is idempotent", async () => {
  const output = {
    output: "Tool execution aborted",
    metadata: { sessionId: "child", interrupted: true },
  }
  const adapter = createSubagentInterruptionOutputAdapter({
    getConfig: () => defaultConfig(),
    controller: controller(),
  })
  await adapter({ tool: "task", sessionID: "parent", callID: "part-1", args: { task_id: "tsk_resume_1" } }, output)
  assert.match(output.output, new RegExp(SUBAGENT_CONTINUATION_NOTICE_PREFIX))
  assert.match(output.output, /resumable task identifier "tsk_resume_1"/)
  assert.match(output.output, /task_id field/)
  assert.doesNotMatch(output.output, /task\s*\(/)

  await adapter({ tool: "task", sessionID: "parent", callID: "part-1", args: { task_id: "tsk_resume_1" } }, output)
  assert.equal(output.output.split(SUBAGENT_CONTINUATION_NOTICE_PREFIX).length - 1, 1)
})

test("preserves exclusions and ordinary empty output", async () => {
  for (const scenario of [
    { text: "", child: "child", ctl: controller() },
    { text: "Permission denied", child: "child", ctl: controller() },
    { text: "Permission rejected", child: "child", ctl: controller() },
    { text: "Unknown agent type: missing", child: "child", ctl: controller() },
    { text: "Tool execution aborted", child: "child", ctl: controller({ taskID: "" }) },
    { text: "Tool execution aborted", child: "child", ctl: controller({ explicitlyAborted: true }) },
    { text: "Tool execution aborted", child: "deleted", ctl: controller({ correlated: false }) },
  ]) {
    const output: { output: string; metadata?: { sessionId: string } } = { output: scenario.text }
    if (scenario.child) output.metadata = { sessionId: scenario.child }
    await createSubagentInterruptionOutputAdapter({ getConfig: () => defaultConfig(), controller: scenario.ctl })(
      { tool: "task", sessionID: "parent", callID: "part" },
      output,
    )
    assert.equal(output.output, scenario.text)
  }
})

test("disabled hook leaves interrupted task output unchanged", async () => {
  const config = OcmmConfigSchema.parse({ disabledHooks: ["subagent-interruption-recovery"] })
  const output = { output: "Tool execution aborted", metadata: { sessionId: "child" } }
  await createSubagentInterruptionOutputAdapter({ getConfig: () => config, controller: controller() })(
    { tool: "task", sessionID: "parent", callID: "part" },
    output,
  )
  assert.equal(output.output, "Tool execution aborted")
})

test("real controller appends one notice from after-hook task evidence without a terminal parent part", async () => {
  let dispatches = 0
  const realController = createSubagent429Controller({
    dispatchRetry: async () => {
      dispatches += 1
      return true
    },
  })
  realController.onSessionCreated("child", true)
  realController.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  const adapter = createSubagentInterruptionOutputAdapter({
    getConfig: () => defaultConfig(),
    controller: realController,
  })
  const output = {
    output: "connection closed",
    metadata: { sessionId: "child", task_id: "task-from-after-hook" },
  }
  const input = {
    tool: "task",
    sessionID: "parent",
    callID: "provider-call-not-a-parent-part",
    args: { task_id: "task-from-after-hook" },
  }

  await adapter(input, output)
  assert.match(output.output, /resumable task identifier "task-from-after-hook"/)
  assert.equal(output.output.split(SUBAGENT_CONTINUATION_NOTICE_PREFIX).length - 1, 1)
  assert.equal(dispatches, 0, "the notice-only adapter has no dispatch path")
  assert.equal("dispatch" in realController, false, "controller exposes no dispatch surface to the adapter")
  assert.equal("prompt" in realController, false, "controller exposes no prompt surface to the adapter")

  await adapter(input, output)
  assert.equal(output.output.split(SUBAGENT_CONTINUATION_NOTICE_PREFIX).length - 1, 1)
  assert.equal(realController.getInterruptionCorrelation({ childSessionID: "child" })?.taskID, undefined)
})
