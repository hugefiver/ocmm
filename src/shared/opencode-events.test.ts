import { test } from "node:test"
import assert from "node:assert/strict"

import {
  resolveSessionLineage,
  resolveSessionLineageProperties,
  resolveTaskPartInterruption,
} from "./opencode-events.ts"

test("resolves current nested and legacy flat session lineage", () => {
  assert.deepEqual(resolveSessionLineage({
    event: { type: "session.created", properties: { info: { id: "child", parentID: "parent" } } },
  }), { sessionID: "child", parentSessionID: "parent" })
  for (const key of ["parentID", "parentId", "parentSessionID", "parentSessionId"] as const) {
    assert.deepEqual(resolveSessionLineage({
      event: { type: "session.created", properties: { sessionID: `child-${key}`, [key]: "parent" } },
    }), { sessionID: `child-${key}`, parentSessionID: "parent" })
  }
  assert.deepEqual(resolveSessionLineageProperties({ session: { id: "child" }, parentSessionId: "parent" }), {
    sessionID: "child",
    parentSessionID: "parent",
  })
})

test("decodes a terminal parent task part with child session identity", () => {
  assert.deepEqual(resolveTaskPartInterruption({
    event: {
      type: "message.part.updated",
      properties: {
        sessionID: "parent",
        part: {
          id: "prt_1",
          sessionID: "parent",
          type: "tool",
          tool: "task",
          callID: "call_provider_1",
          state: {
            status: "error",
            error: "Tool execution aborted",
            input: { subagent_type: "oracle-second", task_id: "tsk_resume_1" },
            metadata: { sessionId: "child", interrupted: true },
          },
        },
      },
    },
  }), {
    childSessionID: "child",
    parentSessionID: "parent",
    parentPartID: "prt_1",
    callID: "call_provider_1",
    agent: "oracle-second",
    taskID: "tsk_resume_1",
    terminalTaskErrorObserved: true,
    transportInterrupted: true,
    errorText: "Tool execution aborted",
  })
})

test("ignores completed non-task malformed and child-less task parts", () => {
  for (const raw of [
    null,
    {},
    { event: { type: "message.part.updated", properties: { part: { type: "tool", tool: "read", state: { status: "error" } } } } },
    { event: { type: "message.part.updated", properties: { sessionID: "p", part: { type: "tool", tool: "task", state: { status: "completed", metadata: { sessionId: "c" } } } } } },
    { event: { type: "message.part.updated", properties: { sessionID: "p", part: { type: "tool", tool: "task", state: { status: "error", metadata: {} } } } } },
  ]) assert.equal(resolveTaskPartInterruption(raw), null)
})

test("never fabricates taskID from childSessionID", () => {
  const evidence = resolveTaskPartInterruption({
    event: {
      type: "message.part.updated",
      properties: {
        sessionID: "parent",
        part: {
          id: "prt_2",
          type: "tool",
          tool: "task",
          state: { status: "error", error: "Tool execution aborted", input: {}, metadata: { sessionId: "child" } },
        },
      },
    },
  })
  assert.equal(evidence?.childSessionID, "child")
  assert.equal(evidence?.taskID, undefined)
})
