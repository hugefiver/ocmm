import { test } from "node:test"
import assert from "node:assert/strict"

import { createRuntimeFallbackEventHandler, createRuntimeFallbackRuntime } from "./event-handler.ts"
import { OcmmConfigSchema } from "../config/schema.ts"
import {
  FakeHandlerScheduler,
  deferred,
  flushHandler,
  makeConfig,
  makeControlledClient,
  makeCreatedEvent,
  makeErrorEvent,
  makeIdleEvent,
  makeMockClient,
  modelFor,
  dispatchedModels,
} from "./event-handler-test-fixtures.ts"

function makeParentTaskErrorEvent(input: {
  parent: string
  child: string
  partID: string
  callID?: string
  taskID?: string
  agent?: string
  errorText?: string
  interrupted?: boolean
}) {
  return {
    event: {
      type: "message.part.updated",
      properties: {
        sessionID: input.parent,
        part: {
          id: input.partID,
          sessionID: input.parent,
          type: "tool",
          tool: "task",
          ...(input.callID === undefined ? {} : { callID: input.callID }),
          state: {
            status: "error",
            error: input.errorText ?? "Tool execution aborted",
            input: {
              ...(input.agent === undefined ? {} : { subagent_type: input.agent }),
              ...(input.taskID === undefined ? {} : { task_id: input.taskID }),
            },
            metadata: { sessionId: input.child, interrupted: input.interrupted ?? true },
          },
        },
      },
    },
  }
}

test("parent terminal task event never dispatches without retryable child error", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  await handler(makeCreatedEvent("child", { parentID: "parent" }))
  const event = makeParentTaskErrorEvent({ parent: "parent", child: "child", partID: "part", callID: "call", taskID: "task-1" })
  await handler(event)
  // Replay the same parent event - must remain idempotent, no dispatch.
  await handler(event)
  assert.deepEqual(calls, [])
})

test("parent task and retryable child error work in both arrival orders exactly once", async () => {
  for (const order of ["parent-first", "child-first"] as const) {
    const mock = makeControlledClient()
    const cfg = makeConfig({ subagent429: { maxRetries: 0 } })
    const scheduler = new FakeHandlerScheduler()
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler })
    await handler(makeCreatedEvent(`child-${order}`, { parentID: "parent" }))
    const parent = makeParentTaskErrorEvent({
      parent: "parent",
      child: `child-${order}`,
      partID: `part-${order}`,
      callID: `call-${order}`,
      taskID: `task-${order}`,
      agent: "orchestrator",
    })
    const child = makeErrorEvent(`child-${order}`, { status: 429 }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    })
    if (order === "parent-first") {
      await handler(parent)
      await handler(child)
    } else {
      await handler(child)
      await handler(parent)
    }
    await handler(makeIdleEvent(`child-${order}`))
    await scheduler.run(0)
    await flushHandler()
    assert.equal(mock.calls.length, 1, `${order} must dispatch exactly once`)
  }
})

test("abort permission denial unknown agent and deletion do not recover", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  // Explicit abort: session.error with isAbort before any task evidence.
  await handler(makeCreatedEvent("aborted", { parentID: "parent" }))
  await handler(makeErrorEvent("aborted", { name: "MessageAbortedError", isAbort: true }, { agent: "orchestrator" }))
  await handler(makeParentTaskErrorEvent({ parent: "parent", child: "aborted", partID: "aborted-part", taskID: "aborted-task" }))

  // Permission denied (non-abort text but not retryable either).
  await handler(makeCreatedEvent("denied", { parentID: "parent" }))
  await handler(makeParentTaskErrorEvent({
    parent: "parent",
    child: "denied",
    partID: "denied-part",
    taskID: "denied-task",
    errorText: "Permission denied",
  }))

  // Unknown agent: no effective requirement, so no dispatch.
  await handler(makeCreatedEvent("unknown", { parentID: "parent" }))
  await handler(makeErrorEvent("unknown", { status: 429 }, { agent: "missing-agent" }))
  // Delete the child and then deliver stale parent evidence - must not recover.
  await handler({ event: { type: "session.deleted", properties: { sessionID: "unknown" } } })
  await handler(makeParentTaskErrorEvent({
    parent: "parent",
    child: "unknown",
    partID: "late",
    callID: "late",
    taskID: "late-task",
  }))
  assert.deepEqual(dispatchedModels(calls), [])
})

test("429 then explicit abort cancels the pending gate before idle or timer", async () => {
  const mock = makeControlledClient()
  const scheduler = new FakeHandlerScheduler()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client: mock.client, scheduler })
  await handler(makeCreatedEvent("aborted-429", { parentID: "parent" }))
  await handler(makeErrorEvent("aborted-429", { status: 429, retryAfter: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(scheduler.tasks[0]?.cancelled, false, "429 gate scheduled")
  // An explicit abort error must cancel the pending gate before idle.
  await handler(makeErrorEvent("aborted-429", { name: "MessageAbortedError", isAbort: true }, { agent: "orchestrator" }))
  assert.equal(scheduler.tasks[0]?.cancelled, true, "abort cancels the pending 429 gate")
  await handler(makeIdleEvent("aborted-429"))
  await scheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), [])
})

test("real event runtime preserves active duplicate creation and resets after delete then recreate", async () => {
  const mock = makeControlledClient()
  const scheduler = new FakeHandlerScheduler()
  const runtime = createRuntimeFallbackRuntime({ getConfig: () => makeConfig({ subagent429: { maxRetries: 0 } }), client: mock.client, scheduler })

  await runtime.event(makeCreatedEvent("child", { parentID: "parent" }))
  await runtime.event(makeParentTaskErrorEvent({
    parent: "parent",
    child: "child",
    partID: "part-original",
    taskID: "task-original",
    agent: "orchestrator",
  }))
  await runtime.event(makeErrorEvent("child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.equal(scheduler.tasks[0]?.cancelled, false)

  await runtime.event(makeCreatedEvent("child", { parentID: "unexpected-parent" }))
  assert.equal(scheduler.tasks[0]?.cancelled, false, "duplicate create must retain the retry gate")

  const preserved = { output: "Tool execution aborted", metadata: { sessionId: "child", task_id: "task-original" } }
  await runtime.afterTask({ tool: "task", sessionID: "parent", args: { task_id: "task-original" } }, preserved)
  assert.match(preserved.output, /resumable task identifier "task-original"/)

  await runtime.event({ event: { type: "session.deleted", properties: { sessionID: "child" } } })
  assert.equal(scheduler.tasks[0]?.cancelled, true)
  await runtime.event(makeCreatedEvent("child", { parentID: "new-parent" }))

  const recreated = { output: "Tool execution aborted", metadata: { sessionId: "child", task_id: "task-original" } }
  await runtime.afterTask({ tool: "task", sessionID: "parent", args: { task_id: "task-original" } }, recreated)
  assert.equal(recreated.output, "Tool execution aborted", "recreated session must not retain old parent correlation")
})

test("transport MessageAbortedError retries when configured, while explicit abort never dispatches", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ retryOnPatterns: ["connection closed"] })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeCreatedEvent("transport", { parentID: "parent" }))
  await handler(makeErrorEvent("transport", {
    name: "MessageAbortedError",
    message: "connection closed",
  }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(dispatchedModels(calls), ["hoo/fallback-a"])

  await handler(makeCreatedEvent("explicit-abort", { parentID: "parent" }))
  await handler(makeErrorEvent("explicit-abort", {
    name: "MessageAbortedError",
    message: "connection closed",
    isAbort: true,
  }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(dispatchedModels(calls), ["hoo/fallback-a"])
})

test("bare plugin AbortError and DOMException are ignored without suppressing later recovery", async () => {
  for (const name of ["AbortError", "DOMException"]) {
    const { client, calls } = makeMockClient()
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
    await handler(makeCreatedEvent(`bare-${name}`, { parentID: "parent" }))
    await handler(makeErrorEvent(`bare-${name}`, { status: 503, message: "overloaded" }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "primary-model" },
    }))
    await handler(makeErrorEvent(`bare-${name}`, { name }, { agent: "orchestrator" }))
    await handler(makeErrorEvent(`bare-${name}`, { status: 503, message: "overloaded" }, {
      agent: "orchestrator",
      model: { providerID: "hoo", modelID: "fallback-a" },
    }))
    assert.deepEqual(dispatchedModels(calls), ["hoo/fallback-a", "hoo/fallback-b"], name)
  }
})

test("disabled interruption hook ignores correlation while preserving existing 429 fallback", async () => {
  const mock = makeControlledClient()
  const scheduler = new FakeHandlerScheduler()
  // Build a config with the new hook disabled - existing 429 fallback still works.
  const cfg = OcmmConfigSchema.parse({
    agents: {
      orchestrator: {
        model: "hoo/primary-model",
        fallbackModels: ["hoo/fallback-a", "hoo/fallback-b"],
      },
    },
    runtimeFallback: { subagent429: { maxRetries: 0 } },
    disabledHooks: ["subagent-interruption-recovery"],
  })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, scheduler })
  await handler(makeCreatedEvent("disabled-child", { parentID: "parent" }))
  // Parent task evidence arrives - hook is disabled, so it should be ignored.
  await handler(makeParentTaskErrorEvent({
    parent: "parent",
    child: "disabled-child",
    partID: "part",
    taskID: "task-disabled",
  }))
  // A 429 must still trigger the existing dedicated-429 fallback.
  await handler(makeErrorEvent("disabled-child", { status: 429 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeIdleEvent("disabled-child"))
  await scheduler.run(0)
  await flushHandler()
  assert.equal(mock.calls.length, 1, "existing 429 fallback must still dispatch when hook is disabled")
})

// --- TDD: lifecycle tombstone suppression (explicit abort / deleted child) ---

test("explicit abort suppresses later retryable non-429 session.error (zero dispatch)", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  await handler(makeCreatedEvent("aborted-late", { parentID: "parent" }))
  // First: explicit abort.
  await handler(makeErrorEvent("aborted-late", { name: "MessageAbortedError", isAbort: true }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  // Later: a retryable non-429 error arrives for the SAME session. Must NOT dispatch.
  await handler(makeErrorEvent("aborted-late", { status: 503, message: "overloaded" }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await flushHandler()
  assert.deepEqual(dispatchedModels(calls), [], "explicitly aborted session must not auto-recover on later retryable error")
})

test("explicit abort suppresses later 429 session.error (zero dispatch)", async () => {
  const mock = makeControlledClient()
  const scheduler = new FakeHandlerScheduler()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client: mock.client, scheduler })
  await handler(makeCreatedEvent("aborted-429-late", { parentID: "parent" }))
  // First: explicit abort.
  await handler(makeErrorEvent("aborted-429-late", { name: "MessageAbortedError", isAbort: true }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  // Later: a retryable 429 arrives for the SAME session. Must NOT dispatch.
  await handler(makeErrorEvent("aborted-429-late", { status: 429, retryAfter: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeIdleEvent("aborted-429-late"))
  if (scheduler.tasks.length > 0) await scheduler.run(0)
  await flushHandler()
  assert.deepEqual(dispatchedModels(mock.calls), [], "explicitly aborted session must not auto-recover on later 429")
})

test("session.deleted suppresses later retryable session.error (zero dispatch)", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  await handler(makeCreatedEvent("deleted-late", { parentID: "parent" }))
  await handler({ event: { type: "session.deleted", properties: { sessionID: "deleted-late" } } })
  // Later: a retryable error arrives for the SAME deleted session. Must NOT dispatch.
  await handler(makeErrorEvent("deleted-late", { status: 503, message: "overloaded" }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent("deleted-late", { status: 429, retryAfter: 1 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await flushHandler()
  assert.deepEqual(dispatchedModels(calls), [], "deleted child must never auto-recover on later retryable error")
})

test("delete -> recreate same session ID allows retryable error to dispatch normally", async () => {
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client })
  await handler(makeCreatedEvent("recreated", { parentID: "parent-1" }))
  await handler({ event: { type: "session.deleted", properties: { sessionID: "recreated" } } })
  // A legitimate recreate with the SAME ID must clear the tombstone and start fresh.
  await handler(makeCreatedEvent("recreated", { parentID: "parent-2" }))
  await handler(makeErrorEvent("recreated", { status: 503, message: "overloaded" }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await flushHandler()
  assert.deepEqual(dispatchedModels(calls), ["hoo/fallback-a"], "recreated session must dispatch normally")
})

test("suppression tombstones retain their grace window then expire without a timer", async () => {
  let now = 0
  const { client, calls } = makeMockClient()
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => makeConfig(), client, clock: () => now })
  await handler(makeCreatedEvent("expiring-tombstone", { parentID: "parent" }))
  await handler(makeErrorEvent("expiring-tombstone", { name: "MessageAbortedError", isAbort: true }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))

  await handler(makeErrorEvent("expiring-tombstone", { status: 503, message: "overloaded" }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  now = 5 * 60_000 - 1
  await handler(makeErrorEvent("expiring-tombstone", { status: 503, message: "overloaded" }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(dispatchedModels(calls), [], "immediate and in-grace late errors remain suppressed")

  now++
  await handler(makeErrorEvent("expiring-tombstone", { status: 503, message: "overloaded" }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  assert.deepEqual(dispatchedModels(calls), ["hoo/fallback-a"], "expired tombstone permits normal recovery")
})
