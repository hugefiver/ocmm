import assert from "node:assert/strict"
import { test } from "node:test"

import {
  createHarness,
  deferred,
  errorInput,
  flush,
  idle,
} from "./subagent-429-controller-fixture.ts"
import { createSubagent429Controller } from "./subagent-429-controller.ts"

test("task part and retryable child error correlate in either order", () => {
  for (const order of ["part-first", "error-first"] as const) {
    const h = createHarness()
    h.controller.onSessionCreated(order, true)
    assert.equal(
      h.controller.recordSessionLineage({ childSessionID: order, parentSessionID: "parent", agent: "oracle" }),
      "recorded",
    )
    const part = {
      childSessionID: order,
      parentSessionID: "parent",
      parentPartID: `part-${order}`,
      callID: `call-${order}`,
      agent: "oracle",
      taskID: `task-${order}`,
      terminalTaskErrorObserved: true as const,
    }
    if (order === "part-first") {
      h.controller.recordTaskPart(part)
      h.controller.markRetryableChildError(order)
    } else {
      h.controller.markRetryableChildError(order)
      h.controller.recordTaskPart(part)
    }
    assert.deepEqual(h.controller.getInterruptionCorrelation({ childSessionID: order }), {
      childSessionID: order,
      parentSessionID: "parent",
      callID: `call-${order}`,
      agent: "oracle",
      taskID: `task-${order}`,
      terminalTaskErrorObserved: true,
      retryableChildErrorObserved: true,
      explicitlyAborted: false,
    })
  }
})

test("duplicate parent parts and repeated child errors are idempotent", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  const part = {
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part", callID: "call",
    taskID: "task-child", terminalTaskErrorObserved: true as const,
  }
  assert.equal(h.controller.recordTaskPart(part), "recorded")
  assert.equal(h.controller.recordTaskPart(part), "duplicate")
  // The parentPartID lookup must work via the stored evidence IDs.
  assert.ok(h.controller.getInterruptionCorrelation({ childSessionID: "child", parentSessionID: "parent", parentPartID: "call" }))
  h.controller.markRetryableChildError("child")
  h.controller.markRetryableChildError("child")
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.retryableChildErrorObserved, true)
})

test("retry-flow settlement retains correlation until deletion", async () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part",
    taskID: "task-child", terminalTaskErrorObserved: true,
  })
  h.controller.onIdle("child")
  assert.ok(h.controller.getInterruptionCorrelation({ childSessionID: "child" }))
  h.controller.onDeleted("child")
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" }), undefined)
})

test("explicit abort and deleted child cannot be recovered by stale task evidence", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.markExplicitAbort("child")
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.explicitlyAborted, true)
  h.controller.onDeleted("child")
  assert.equal(h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "late",
    taskID: "task-child", terminalTaskErrorObserved: true,
  }), "untracked")
})

test("explicit abort cancels a pending 429 gate while retaining abort evidence", async () => {
  const result = deferred<boolean>()
  const h = createHarness({ dispatchRetry: async () => result.promise })
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.on429(errorInput("child", { recoveryDelayMs: 100 }))
  assert.equal(h.scheduler.tasks[0]?.cancelled, false)
  h.controller.markExplicitAbort("child")
  assert.equal(h.scheduler.tasks[0]?.cancelled, true)
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.explicitlyAborted, true)
  assert.deepEqual(h.controller.onIdle("child"), { kind: "untracked", suppressIdleContinuation: false })
  await h.scheduler.run(0, true)
  await flush()
  assert.deepEqual(h.dispatches, [])
})

test("duplicate active creation preserves retry and correlation, while delete then recreate resets both", () => {
  const h = createHarness({ dispatchRetry: async () => true })
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent", agent: "oracle" })
  h.controller.recordTaskPart({
    childSessionID: "child",
    parentSessionID: "parent",
    parentPartID: "part",
    taskID: "task-original",
    terminalTaskErrorObserved: true,
  })
  h.controller.markRetryableChildError("child")
  h.controller.on429(errorInput("child", { recoveryDelayMs: 100 }))
  assert.equal(h.scheduler.tasks[0]?.cancelled, false)

  h.controller.onSessionCreated("child", true)

  assert.equal(h.scheduler.tasks[0]?.cancelled, false, "duplicate create must not cancel the active retry")
  assert.deepEqual(h.controller.getInterruptionCorrelation({ childSessionID: "child" }), {
    childSessionID: "child",
    parentSessionID: "parent",
    agent: "oracle",
    taskID: "task-original",
    terminalTaskErrorObserved: true,
    retryableChildErrorObserved: true,
    explicitlyAborted: false,
  })

  h.controller.onDeleted("child")
  assert.equal(h.scheduler.tasks[0]?.cancelled, true, "deletion cancels the old retry")
  h.controller.onSessionCreated("child", true)
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" }), undefined)
  assert.equal(
    h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "new-parent" }),
    "recorded",
  )
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.parentSessionID, "new-parent")
})

test("recordSessionLineage canonicalizes review agent aliases and ignores unknown children", () => {
  const h = createHarness()
  // Unknown child (no prior onSessionCreated) is untracked.
  assert.equal(
    h.controller.recordSessionLineage({ childSessionID: "unknown", parentSessionID: "parent", agent: "oracle-second" }),
    "untracked",
  )
  h.controller.onSessionCreated("child", true)
  // oracle-second is a runtime alias that canonicalizes to oracle-2nd.
  assert.equal(
    h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent", agent: "oracle-second" }),
    "recorded",
  )
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.agent, "oracle-2nd")
})

test("getInterruptionCorrelation resolves by taskID exact lookup but never treats childSessionID as taskID", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part",
    taskID: "task-child", terminalTaskErrorObserved: true,
  })
  // taskID exact lookup finds the record.
  assert.ok(h.controller.getInterruptionCorrelation({ taskID: "task-child" }))
  // childSessionID is NOT a taskID - this must not match "child".
  assert.equal(h.controller.getInterruptionCorrelation({ taskID: "child" }), undefined)
  // parentSessionID mismatch rejects.
  assert.equal(
    h.controller.getInterruptionCorrelation({ childSessionID: "child", parentSessionID: "other" }),
    undefined,
  )
  // parentPartID must be in evidence IDs.
  assert.ok(h.controller.getInterruptionCorrelation({ childSessionID: "child", parentSessionID: "parent", parentPartID: "part" }))
  assert.equal(
    h.controller.getInterruptionCorrelation({ childSessionID: "child", parentSessionID: "parent", parentPartID: "unknown" }),
    undefined,
  )
})

test("claimInterruptionNotice returns true exactly once for the same parent/task identity", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part",
    taskID: "task-child", terminalTaskErrorObserved: true,
  })
  // Without an explicit lookup.taskID, claim is rejected.
  assert.equal(h.controller.claimInterruptionNotice({ childSessionID: "child" }), false)
  // With matching explicit taskID, claim succeeds exactly once.
  assert.equal(
    h.controller.claimInterruptionNotice({ childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "task-child" }),
    true,
  )
  assert.equal(
    h.controller.claimInterruptionNotice({ childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "task-child" }),
    false,
  )
})

test("claimInterruptionNotice accepts explicit output-adapter taskID when correlation has no stored taskID", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  // Record task part WITHOUT a taskID - only parentPartID + callID.
  h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part", callID: "call",
    terminalTaskErrorObserved: true,
  })
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.taskID, undefined)
  // Explicit taskID from output adapter is accepted without mutating correlation.
  assert.equal(
    h.controller.claimInterruptionNotice({ childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "output-adapter-task" }),
    true,
  )
  assert.equal(h.controller.getInterruptionCorrelation({ childSessionID: "child" })?.taskID, undefined)
  // Second claim with same identity fails.
  assert.equal(
    h.controller.claimInterruptionNotice({ childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "output-adapter-task" }),
    false,
  )
})

test("claimInterruptionNotice rejects explicit abort", () => {
  const h = createHarness()
  h.controller.onSessionCreated("child", true)
  h.controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  h.controller.recordTaskPart({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part",
    taskID: "task-child", terminalTaskErrorObserved: true,
  })
  h.controller.markExplicitAbort("child")
  assert.equal(
    h.controller.claimInterruptionNotice({ childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "task-child" }),
    false,
  )
})

test("inactive interruption correlations retain a refreshed grace window, then expire", () => {
  let now = 0
  const controller = createSubagent429Controller({ clock: () => now })
  controller.onSessionCreated("child", true)
  controller.recordSessionLineage({ childSessionID: "child", parentSessionID: "parent" })
  const taskEvidence = {
    childSessionID: "child",
    parentSessionID: "parent",
    parentPartID: "part",
    taskID: "task-child",
    terminalTaskErrorObserved: true as const,
  }
  assert.equal(controller.recordTaskPart(taskEvidence), "recorded")
  controller.onIdle("child")

  assert.equal(controller.claimInterruptionNotice({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "task-child",
  }), true, "claim remains available during inactive grace")
  assert.equal(controller.claimInterruptionNotice({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "task-child",
  }), false, "claim stays idempotent during inactive grace")

  now = 4 * 60_000
  assert.equal(controller.recordTaskPart(taskEvidence), "duplicate", "task evidence refreshes inactive grace")
  now = 9 * 60_000 - 1
  assert.ok(controller.getInterruptionCorrelation({ childSessionID: "child" }))
  now++
  assert.equal(controller.getInterruptionCorrelation({ childSessionID: "child" }), undefined)
  assert.equal(controller.claimInterruptionNotice({
    childSessionID: "child", parentSessionID: "parent", parentPartID: "part", taskID: "task-child",
  }), false)
})

test("lazy pruning keeps active records and caps inactive records", () => {
  let now = 0
  const controller = createSubagent429Controller({ clock: () => now })
  controller.onSessionCreated("active", true)
  controller.recordSessionLineage({ childSessionID: "active", parentSessionID: "parent" })
  now = 24 * 60 * 60_000
  assert.ok(controller.getInterruptionCorrelation({ childSessionID: "active" }), "active retry state is never expiry-pruned")

  for (let index = 0; index < 257; index++) {
    const childSessionID = `inactive-${index}`
    controller.onSessionCreated(childSessionID, true)
    controller.recordSessionLineage({ childSessionID, parentSessionID: "parent" })
    controller.onIdle(childSessionID)
  }
  assert.equal(controller.getInterruptionCorrelation({ childSessionID: "inactive-0" }), undefined)
  assert.ok(controller.getInterruptionCorrelation({ childSessionID: "inactive-256" }))
})
