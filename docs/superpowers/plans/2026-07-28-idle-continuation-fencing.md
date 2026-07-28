# Idle Continuation Fencing and Duplicate-Event Coalescing Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that each idle-session lifecycle owns at most one continuation operation, that a deleted idle session remains tombstoned until a legal observed create, and that deleted, aborted, or replaced operations cannot mutate a current lifecycle after asynchronous work settles.

**Architecture:** Extend `IdleContinuationState` with a state-wide monotonic generation counter, per-session lifecycle kinds (`lazy`, `observed`, and `deleted`), active generations, and symbol-tokenized leases. Acquire one lease at idle-handler entry, fence every post-await side effect with `isCurrent()`, preserve a process-local deleted tombstone until an observed create, and mirror only create, delete, and explicit-abort boundaries from the existing runtime event handler without coupling idle continuation to fallback lifecycle state.

**Tech Stack:** TypeScript (strict ESM), Node.js 22 built-in `node:test` and `node:assert/strict`, pnpm, existing `OcmmClient` and runtime-fallback modules.

**Global Constraints:**
- Task-owned implementation scope is exactly `src/runtime-fallback/idle-state.ts`, `src/runtime-fallback/idle-state.test.ts`, `src/runtime-fallback/event-handler-idle-continuation.ts`, `src/runtime-fallback/event-handler-idle-continuation.test.ts`, and `src/runtime-fallback/event-handler.ts`; do not modify the shared fixture.
- Keep all generation and lease state process-local; add no task ledger, task IDs, persistence, or task-completion receipts.
- Do not change nearest-parent discovery, unified configuration, config/schema/defaults, prompt text, prompts, skills, Codex output, the Senpi engine, or generated files.
- Do not change `subagent-429-session/controller`, interruption correlation/output adaptation, fallback `sessionStates`, or the ordering in which `controller.onIdle()` suppresses ordinary idle continuation.
- Preserve the existing explicit-abort controller/suppression ordering in `event-handler.ts`; only strengthen `markSessionAborted` through its idle-state implementation.
- Accept the documented host boundary after the final pre-prompt current check; stale post-prompt settlements must still be observational only.
- Use PowerShell syntax for every shell command. Do not install software, terminate processes, or execute Git write commands.
- Preserve the approved uncommitted subproject 1 changes. This correction revises the two subproject 2 workflow documents; implementation scope remains the same five runtime-fallback files plus these two documents and the existing subproject 1 paths in the Scope Ledger.

---

## File Map

### Task-owned implementation and tests

- Modify `src/runtime-fallback/idle-state.ts`: own idle lifecycle generations, active lease identities, lifecycle reset/invalidation, and abort invalidation.
- Modify `src/runtime-fallback/idle-state.test.ts`: prove generation, cleanup, lazy acquisition, coalescing, abort, and identity-safe release semantics.
- Modify `src/runtime-fallback/event-handler-idle-continuation.ts`: acquire/release one lease and fence all asynchronous continuation effects.
- Modify `src/runtime-fallback/event-handler-idle-continuation.test.ts`: prove duplicate-idle and lifecycle race behavior with deterministic deferred promises.
- Modify `src/runtime-fallback/event-handler.ts`: mirror legitimate create/delete/abort boundaries into idle lifecycle state while preserving 429 ordering.

### Current correction status

The current Task 1 and Task 2 source changes are partially implemented, but the final review rejected them: deletion can be lazily revived by a late idle, and a first observed create can be skipped when an error already made the main fallback lifecycle appear present. Treat the existing implementation as rejected until the new RED tests in this plan fail for those cases and the corrections below make all listed tests pass. Do not treat the current working tree as a clean baseline.

### Workflow artifacts to preserve, not edit during implementation

- `docs/superpowers/specs/2026-07-28-idle-continuation-fencing-design.md`: authoritative approved subproject 2 design.
- `docs/superpowers/plans/2026-07-28-idle-continuation-fencing.md`: this implementation plan.

### Pre-existing dirty subproject 1 paths to preserve, not edit

- `src/config/merge.ts`
- `src/config/load.test.ts`
- `docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md`
- `docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md`

## Locked Internal State Shape

Use these exact lifecycle fields so later tasks and object-shape tests agree:

```ts
export type IdleContinuationState = {
  globalEnabled: boolean
  sessionOverrides: Map<string, boolean>
  sessionData: Map<string, IdleSessionData>
  nextGeneration: number
  sessionGenerations: Map<string, number>
  sessionLifecycleKinds: Map<string, "lazy" | "observed" | "deleted">
  activeLeases: Map<string, { generation: number; token: symbol }>
}

export type IdleContinuationLease = {
  isCurrent(): boolean
  release(): void
}
```

`nextGeneration` starts at `0` and increments before every allocation. `sessionGenerations` contains only lazy or observed lifecycle identities. `sessionLifecycleKinds` records every idle lifecycle state, including `deleted` tombstones. `activeLeases` contains at most one record per lazy or observed session. The token remains encapsulated by the returned lease; callers receive no token or generation. Tombstones are process-local, are bounded by IDs already tracked in this map, never expire on a timer, and clear only through the observed-create transition.

### Task 1: Add idle lifecycle generations and tokenized leases

**Files:**
- Modify: `src/runtime-fallback/idle-state.test.ts:1-59`
- Modify: `src/runtime-fallback/idle-state.ts:1-43`

**Interfaces:**
- Consumes: existing `IdleSessionData`, `createIdleContinuationState(): IdleContinuationState`, `getSessionData(state, sessionID): IdleSessionData`, `isIdleContinuationEnabled(state, sessionID): boolean`, `markSessionAborted(state, sessionID): void`, and `clearSession(state, sessionID): void`.
- Produces: `IdleContinuationLease`; idempotent observed-create `beginIdleSession(state: IdleContinuationState, sessionID: string): void`; tombstoning `invalidateIdleSession(state: IdleContinuationState, sessionID: string): void`; `acquireIdleContinuationLease(state: IdleContinuationState, sessionID: string): IdleContinuationLease | undefined`; the locked lifecycle fields above; abort semantics that preserve a `deleted` tombstone; and unchanged `clearSession` data-plus-override cleanup that does not invalidate lifecycle identity.

- [ ] **Step 1: Replace the state-test import and extend the existing creation, abort, and cleanup tests**

Replace the import at the top of `src/runtime-fallback/idle-state.test.ts` with this exact import:

```ts
import {
  acquireIdleContinuationLease,
  beginIdleSession,
  clearSession,
  createIdleContinuationState,
  DEFAULT_CONTINUATION_PROMPT,
  getSessionData,
  invalidateIdleSession,
  isIdleContinuationEnabled,
  markSessionAborted,
} from "./idle-state.ts"
```

Extend the creation test with exact empty-lifecycle assertions:

```ts
test("createIdleContinuationState starts with empty maps and globalEnabled false", () => {
  const s = createIdleContinuationState()
  assert.equal(s.globalEnabled, false)
  assert.equal(s.sessionOverrides.size, 0)
  assert.equal(s.sessionData.size, 0)
  assert.equal(s.nextGeneration, 0)
  assert.equal(s.sessionGenerations.size, 0)
  assert.equal(s.sessionLifecycleKinds.size, 0)
  assert.equal(s.activeLeases.size, 0)
})
```

Replace the existing abort and `clearSession` tests with these exact versions:

```ts
test("markSessionAborted advances generation, invalidates the lease, and preserves aborted data", () => {
  const s = createIdleContinuationState()
  s.sessionOverrides.set("ses_1", true)
  const lease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(lease)
  const data = getSessionData(s, "ses_1")
  data.continuationCount = 3

  markSessionAborted(s, "ses_1")

  assert.equal(s.nextGeneration, 2)
  assert.equal(s.sessionGenerations.get("ses_1"), 2)
  assert.equal(lease.isCurrent(), false)
  assert.equal(s.sessionData.get("ses_1"), data)
  assert.deepEqual(s.sessionData.get("ses_1"), { aborted: true, continuationCount: 3 })
  assert.equal(s.sessionOverrides.get("ses_1"), true)
})

test("clearSession removes data and override without invalidating lifecycle", () => {
  const s = createIdleContinuationState()
  const lease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(lease)
  s.sessionOverrides.set("ses_1", true)
  s.sessionData.set("ses_1", { aborted: false, continuationCount: 3 })

  clearSession(s, "ses_1")

  assert.equal(s.sessionOverrides.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
  assert.equal(s.sessionGenerations.get("ses_1"), 1)
  assert.equal(lease.isCurrent(), true)
  lease.release()
})
```

- [ ] **Step 2: Append focused lifecycle and lease tests**

Append these tests before the existing prompt-constant test:

```ts
test("first observed beginIdleSession resets lazy state, while duplicate observed create preserves it", () => {
  const s = createIdleContinuationState()
  s.sessionOverrides.set("ses_1", true)
  const oldLease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(oldLease)
  getSessionData(s, "ses_1").continuationCount = 4

  beginIdleSession(s, "ses_1")

  assert.equal(s.nextGeneration, 2)
  assert.equal(s.sessionGenerations.get("ses_1"), 2)
  assert.equal(s.activeLeases.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
  assert.equal(s.sessionOverrides.get("ses_1"), true)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "observed")
  assert.equal(oldLease.isCurrent(), false)

  const observedLease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(observedLease)
  getSessionData(s, "ses_1").continuationCount = 4
  beginIdleSession(s, "ses_1")
  assert.equal(s.nextGeneration, 2)
  assert.equal(observedLease.isCurrent(), true)
  assert.equal(s.sessionData.get("ses_1")?.continuationCount, 4)
  assert.equal(s.sessionOverrides.get("ses_1"), true)
})

test("invalidateIdleSession removes active state and leaves a deleted tombstone", () => {
  const s = createIdleContinuationState()
  const lease = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(lease)
  s.sessionOverrides.set("ses_1", true)
  getSessionData(s, "ses_1").continuationCount = 2

  invalidateIdleSession(s, "ses_1")

  assert.equal(s.sessionGenerations.has("ses_1"), false)
  assert.equal(s.activeLeases.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)
  assert.equal(s.sessionOverrides.has("ses_1"), false)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "deleted")
  assert.equal(lease.isCurrent(), false)
  assert.equal(acquireIdleContinuationLease(s, "ses_1"), undefined)
})

test("acquireIdleContinuationLease lazily begins a lifecycle and coalesces overlap", () => {
  const s = createIdleContinuationState()

  const first = acquireIdleContinuationLease(s, "ses_1")

  assert.ok(first)
  assert.equal(s.nextGeneration, 1)
  assert.equal(s.sessionGenerations.get("ses_1"), 1)
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "lazy")
  assert.equal(typeof s.activeLeases.get("ses_1")?.token, "symbol")
  assert.equal(first.isCurrent(), true)
  assert.equal(acquireIdleContinuationLease(s, "ses_1"), undefined)
  first.release()

  const second = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(second)
  assert.equal(second.isCurrent(), true)
  second.release()
})

test("an observed create clears a deleted tombstone and a late abort leaves it intact", () => {
  const s = createIdleContinuationState()
  invalidateIdleSession(s, "ses_1")
  markSessionAborted(s, "ses_1")
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "deleted")
  assert.equal(s.sessionGenerations.has("ses_1"), false)
  assert.equal(s.sessionData.has("ses_1"), false)

  beginIdleSession(s, "ses_1")
  assert.equal(s.sessionLifecycleKinds.get("ses_1"), "observed")
  assert.ok(acquireIdleContinuationLease(s, "ses_1"))
})

test("old releases cannot remove newer same-generation or replacement-generation leases", () => {
  const s = createIdleContinuationState()
  const oldSameGeneration = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(oldSameGeneration)
  oldSameGeneration.release()

  const newerSameGeneration = acquireIdleContinuationLease(s, "ses_1")
  assert.ok(newerSameGeneration)
  oldSameGeneration.release()

  assert.equal(newerSameGeneration.isCurrent(), true)
  assert.equal(acquireIdleContinuationLease(s, "ses_1"), undefined)
  newerSameGeneration.release()

  const oldGeneration = acquireIdleContinuationLease(s, "ses_2")
  assert.ok(oldGeneration)
  beginIdleSession(s, "ses_2")
  const replacementGeneration = acquireIdleContinuationLease(s, "ses_2")
  assert.ok(replacementGeneration)
  oldGeneration.release()

  assert.equal(replacementGeneration.isCurrent(), true)
  assert.equal(acquireIdleContinuationLease(s, "ses_2"), undefined)
  replacementGeneration.release()
})
```

- [ ] **Step 3: Run the state unit tests and capture the RED evidence**

Run:

```powershell
node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts
```

Expected RED evidence against the current partial implementation: non-zero exit from lifecycle-kind assertions, deleted lease acquisition, first-observed-create reset, or late-abort tombstone preservation. Do not weaken the tests to obtain this failure.

- [ ] **Step 4: Implement the exact generation and lease state machine**

In `src/runtime-fallback/idle-state.ts`, keep `IdleSessionData`, enabled-state behavior, `getSessionData`, `clearSession`, and `DEFAULT_CONTINUATION_PROMPT`; replace the state type and lifecycle-related implementation with this code:

```ts
export type IdleContinuationState = {
  globalEnabled: boolean
  sessionOverrides: Map<string, boolean>
  sessionData: Map<string, IdleSessionData>
  nextGeneration: number
  sessionGenerations: Map<string, number>
  sessionLifecycleKinds: Map<string, "lazy" | "observed" | "deleted">
  activeLeases: Map<string, { generation: number; token: symbol }>
}

export type IdleContinuationLease = {
  isCurrent(): boolean
  release(): void
}

export function createIdleContinuationState(): IdleContinuationState {
  return {
    globalEnabled: false,
    sessionOverrides: new Map(),
    sessionData: new Map(),
    nextGeneration: 0,
    sessionGenerations: new Map(),
    sessionLifecycleKinds: new Map(),
    activeLeases: new Map(),
  }
}

function replaceIdleGeneration(state: IdleContinuationState, sessionID: string): number {
  const generation = state.nextGeneration + 1
  state.nextGeneration = generation
  state.sessionGenerations.set(sessionID, generation)
  state.activeLeases.delete(sessionID)
  return generation
}

export function beginIdleSession(state: IdleContinuationState, sessionID: string): void {
  if (state.sessionLifecycleKinds.get(sessionID) === "observed") return
  replaceIdleGeneration(state, sessionID)
  state.sessionData.delete(sessionID)
  state.sessionLifecycleKinds.set(sessionID, "observed")
}

export function invalidateIdleSession(state: IdleContinuationState, sessionID: string): void {
  state.sessionGenerations.delete(sessionID)
  state.activeLeases.delete(sessionID)
  state.sessionData.delete(sessionID)
  state.sessionOverrides.delete(sessionID)
  state.sessionLifecycleKinds.set(sessionID, "deleted")
}

export function acquireIdleContinuationLease(
  state: IdleContinuationState,
  sessionID: string,
): IdleContinuationLease | undefined {
  if (state.sessionLifecycleKinds.get(sessionID) === "deleted") return undefined
  let generation = state.sessionGenerations.get(sessionID)
  if (generation === undefined) {
    generation = replaceIdleGeneration(state, sessionID)
    state.sessionLifecycleKinds.set(sessionID, "lazy")
  }
  if (state.activeLeases.has(sessionID)) return undefined

  const token = Symbol(sessionID)
  state.activeLeases.set(sessionID, { generation, token })
  const ownsActiveLease = (): boolean => {
    const active = state.activeLeases.get(sessionID)
    return state.sessionGenerations.get(sessionID) === generation
      && active !== undefined
      && active.generation === generation
      && active.token === token
  }

  return {
    isCurrent: ownsActiveLease,
    release() {
      if (ownsActiveLease()) state.activeLeases.delete(sessionID)
    },
  }
}

export function markSessionAborted(state: IdleContinuationState, sessionID: string): void {
  if (state.sessionLifecycleKinds.get(sessionID) === "deleted") return
  replaceIdleGeneration(state, sessionID)
  if (!state.sessionLifecycleKinds.has(sessionID)) state.sessionLifecycleKinds.set(sessionID, "lazy")
  const data = getSessionData(state, sessionID)
  data.aborted = true
}

export function clearSession(state: IdleContinuationState, sessionID: string): void {
  state.sessionData.delete(sessionID)
  state.sessionOverrides.delete(sessionID)
}
```

The `symbol` is intentionally unique per acquisition. Generation equality alone is insufficient because a released lease and its replacement may share one lifecycle generation. `beginIdleSession` must not consult main fallback lifecycle state. Its only input is idle lifecycle kind: `observed` is a no-op; absent, `lazy`, and `deleted` reset into a newer observed lifecycle. `clearSession` deliberately retains kind, generation, and lease.

- [ ] **Step 5: Run the state unit tests and capture the GREEN evidence**

Run:

```powershell
node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts
```

Expected GREEN evidence: exit code `0`, zero failures, and every listed state-unit test passes. Do not hard-code a total unless it is derived from the actual test output after the additions.

### Task 2: Fence continuation races and integrate lifecycle events

**Files:**
- Modify: `src/runtime-fallback/event-handler-idle-continuation.test.ts:1-166`
- Modify: `src/runtime-fallback/event-handler-idle-continuation.ts:3-65`
- Modify: `src/runtime-fallback/event-handler.ts:14,156-217,270-284`

**Interfaces:**
- Consumes: Task 1's `beginIdleSession(state, sessionID): void`, `invalidateIdleSession(state, sessionID): void`, `acquireIdleContinuationLease(state, sessionID): IdleContinuationLease | undefined`, identity-safe `IdleContinuationLease`, `markSessionAborted`, and non-invalidating `clearSession`.
- Produces: unchanged `handleIdleContinuation(deps: IdleContinuationDeps, sessionID: string): Promise<void>` and `createRuntimeFallbackEventHandler(deps: RuntimeFallbackDeps): (input: unknown) => Promise<void>` signatures with duplicate-idle coalescing, post-await fencing, first-observed-create reset independent of main lifecycle state, deleted tombstoning, and abort preservation.

- [ ] **Step 1: Add deterministic deferred-race fixtures locally to the idle continuation test file**

Add `deferred` and `makeControlledClient` to the existing import from `event-handler-test-fixtures.ts`. Do not modify that fixture file because it already provides both helpers. Then add these exact local constants/helpers below the imports:

```ts
const unfinishedTodoMessages = {
  data: [{
    role: "assistant",
    parts: [{
      type: "tool-invocation",
      toolInvocation: {
        state: "result",
        toolName: "todowrite",
        args: { todos: [{ content: "continue", status: "pending" }] },
      },
    }],
  }],
}

function makeCreatedEvent(sessionID: string) {
  return {
    event: {
      type: "session.created",
      properties: { sessionID, parentID: "root" },
    },
  }
}

function makeDeletedEvent(sessionID: string) {
  return {
    event: {
      type: "session.deleted",
      properties: { sessionID },
    },
  }
}
```

The updated fixture import must retain every existing name and include these two names:

```ts
import {
  deferred,
  makeControlledClient,
  makeMockClient,
  makeConfig,
  makeErrorEvent,
  makeIdleEvent,
  type PromptCall,
} from "./event-handler-test-fixtures.ts"
```

The existing maximum-count test currently seeds `sessionData` before any observed lifecycle. Because lazy lease acquisition deliberately resets orphaned pre-lifecycle data, replace that test with this lifecycle-valid version so it continues to prove the configured maximum rather than passing through the no-todo path:

```ts
test("idle continuation: does not continue when maxContinuations reached", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const cfgWithMax = { ...cfg, idleContinuation: { ...cfg.idleContinuation, enabled: true, maxContinuations: 5 } }
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfgWithMax, client, idleState })
  await handler(makeCreatedEvent("ses_1"))
  idleState.sessionData.set("ses_1", { aborted: false, continuationCount: 5 })

  await handler(makeIdleEvent("ses_1"))

  assert.equal(calls.length, 0)
  assert.equal(idleState.sessionData.has("ses_1"), false)
})
```

- [ ] **Step 2: Append the overlapping-idle, delete, abort, recreate, prompt-settlement, tombstone, and first-observed-create race tests**

Append the following tests to `src/runtime-fallback/event-handler-idle-continuation.test.ts`. These use no sleeps: each deferred promise is released only after assertions establish the intended intermediate boundary.

```ts
test("idle continuation: overlapping idle and duplicate observed create share one lease", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_overlap"
  await handler(makeCreatedEvent(sessionID))

  const firstIdle = handler(makeIdleEvent(sessionID))
  try {
    await handler(makeCreatedEvent(sessionID))
    await handler(makeIdleEvent(sessionID))
    assert.equal(mock.messages, 1)
    assert.equal(mock.calls.length, 0)
  } finally {
    messagesGate.resolve(unfinishedTodoMessages)
    await firstIdle
  }

  assert.equal(mock.messages, 1)
  assert.equal(mock.calls.length, 1)
  assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 1)
})

test("idle continuation: deletion during todo read neither prompts nor recreates state", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_delete_read"

  const pendingIdle = handler(makeIdleEvent(sessionID))
  await handler(makeDeletedEvent(sessionID))
  try {
    assert.equal(mock.messages, 1)
    assert.equal(mock.calls.length, 0)
    assert.equal(idleState.sessionGenerations.has(sessionID), false)
    assert.equal(idleState.activeLeases.has(sessionID), false)
    assert.equal(idleState.sessionData.has(sessionID), false)
    assert.equal(idleState.sessionOverrides.has(sessionID), false)
  } finally {
    messagesGate.resolve(unfinishedTodoMessages)
    await pendingIdle
  }

  assert.equal(mock.calls.length, 0)
  assert.equal(idleState.sessionGenerations.has(sessionID), false)
  assert.equal(idleState.activeLeases.has(sessionID), false)
  assert.equal(idleState.sessionData.has(sessionID), false)
})

test("idle continuation: abort during todo read fences work and preserves the marker", async () => {
  const messagesGate = deferred<unknown>()
  const mock = makeControlledClient([], { messagesResults: [messagesGate.promise] })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_abort_read"

  const pendingIdle = handler(makeIdleEvent(sessionID))
  await handler(makeErrorEvent(sessionID, { isAbort: true }, { agent: "orchestrator" }))
  try {
    assert.equal(mock.messages, 1)
    assert.equal(mock.calls.length, 0)
    assert.equal(idleState.sessionData.get(sessionID)?.aborted, true)
  } finally {
    messagesGate.resolve(unfinishedTodoMessages)
    await pendingIdle
  }

  assert.equal(mock.calls.length, 0)
  assert.equal(idleState.sessionData.get(sessionID)?.aborted, true)
  await handler(makeIdleEvent(sessionID))
  assert.equal(mock.messages, 1)
  assert.equal(mock.calls.length, 0)
  assert.equal(idleState.sessionData.get(sessionID)?.aborted, true)
})

test("idle continuation: delete and recreate isolates an old todo result from new work", async () => {
  const oldMessages = deferred<unknown>()
  const mock = makeControlledClient([], {
    messagesResults: [oldMessages.promise, Promise.resolve(unfinishedTodoMessages)],
  })
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
  const sessionID = "ses_recreate_read"
  await handler(makeCreatedEvent(sessionID))

  const oldIdle = handler(makeIdleEvent(sessionID))
  const oldGeneration = idleState.sessionGenerations.get(sessionID)
  await handler(makeDeletedEvent(sessionID))
  await handler(makeCreatedEvent(sessionID))
  const replacementGeneration = idleState.sessionGenerations.get(sessionID)
  await handler(makeIdleEvent(sessionID))
  oldMessages.resolve(unfinishedTodoMessages)
  await oldIdle

  assert.ok(oldGeneration !== undefined)
  assert.ok(replacementGeneration !== undefined)
  assert.ok(replacementGeneration > oldGeneration)
  assert.equal(mock.messages, 2)
  assert.equal(mock.calls.length, 1)
  assert.equal(idleState.sessionGenerations.get(sessionID), replacementGeneration)
  assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 1)
})

for (const settlement of ["resolve", "reject"] as const) {
  test(`idle continuation: stale ${settlement} while prompt is pending preserves recreated state`, async () => {
    const oldPrompt = deferred<unknown>()
    const promptStarted = deferred<void>()
    const mock = makeControlledClient([oldPrompt.promise], {
      messagesResults: [Promise.resolve(unfinishedTodoMessages)],
    })
    const originalPrompt = mock.client.session.prompt
    mock.client.session.prompt = async (args) => {
      const result = originalPrompt(args)
      promptStarted.resolve(undefined)
      return result
    }
    const idleState = createIdleContinuationState()
    idleState.globalEnabled = true
    const cfg = makeConfig({ enabled: true })
    const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client: mock.client, idleState })
    const sessionID = `ses_prompt_${settlement}`
    await handler(makeCreatedEvent(sessionID))

    const oldIdle = handler(makeIdleEvent(sessionID))
    await promptStarted.promise
    await handler(makeDeletedEvent(sessionID))
    await handler(makeCreatedEvent(sessionID))
    const replacementGeneration = idleState.sessionGenerations.get(sessionID)
    idleState.sessionOverrides.set(sessionID, true)
    idleState.sessionData.set(sessionID, { aborted: false, continuationCount: 7 })

    assert.equal(mock.calls.length, 1)
    assert.ok(replacementGeneration !== undefined)
    assert.equal(idleState.sessionData.get(sessionID)?.continuationCount, 7)
    if (settlement === "resolve") oldPrompt.resolve(undefined)
    else oldPrompt.reject(new Error("stale prompt rejected"))
    await oldIdle

    assert.equal(idleState.sessionGenerations.get(sessionID), replacementGeneration)
    assert.deepEqual(idleState.sessionData.get(sessionID), { aborted: false, continuationCount: 7 })
    assert.equal(idleState.sessionOverrides.get(sessionID), true)
  })
}
```

Add the following correction acceptance tests. Keep the five existing deferred races above: overlapping idle, delete during todo read, abort during todo read, delete then recreate during todo read, and stale prompt settlement after recreate.

1. `created → deleted → delayed idle`: create `ses_deleted_idle`, delete it, then send idle with unfinished todos available. Assert zero messages calls, zero prompt calls, kind `deleted`, and no generation, lease, or data.
2. `deleted → created → idle`: delete `ses_recreated_idle`, send its legal decoded create, then idle with unfinished todos. Assert kind `observed`, a newer generation, and one continuation prompt.
3. First-observed-create reset: start direct idle for a session with a deferred todo read. Send `makeErrorEvent(sessionID, { status: 503, message: "overloaded" }, { agent: "orchestrator" })`, then repeat with `{ status: 400, message: "bad request" }`; each error path reaches main `lifecycle.currentGeneration()`. Send the first decoded create. Before resolving the old read, assert its idle generation advanced and old lease is stale even though main `hasSession` is true. Resolve it and assert zero old prompts, then send another idle and assert one new prompt.
4. Duplicate observed create: create the session, start idle with a deferred read, set an override and nonzero count, replay the same decoded create, and assert generation, active lease, data, count, and override are unchanged before settling the read.
5. Late explicit abort after delete: delete the session, send the existing explicit-abort error fixture, and assert kind remains `deleted` with no generation, lease, data, or override.

The tests must use real `makeErrorEvent` fixtures and assert each intermediate ownership boundary before releasing deferred work. They must fail against the current partial implementation for the two final-review findings.

- [ ] **Step 3: Run the idle event-handler suite and capture the RED evidence**

Run:

```powershell
node --test --experimental-strip-types src/runtime-fallback/event-handler-idle-continuation.test.ts
```

Expected RED evidence: non-zero exit. In addition to any legacy race failure, the deleted-late-idle test shows lazy state resurrection or a message/prompt, and the first-observed-create-after-error test shows that the old idle lease remains current. All deferred operations must settle or be released by their test; do not introduce timing sleeps.

- [ ] **Step 4: Fence `handleIdleContinuation` from entry through final release**

Replace the idle-state import in `src/runtime-fallback/event-handler-idle-continuation.ts` with:

```ts
import {
  acquireIdleContinuationLease,
  clearSession,
  DEFAULT_CONTINUATION_PROMPT,
  getSessionData,
  isIdleContinuationEnabled,
  type IdleContinuationState,
} from "./idle-state.ts"
```

Replace `handleIdleContinuation` with this exact control flow:

```ts
export async function handleIdleContinuation(deps: IdleContinuationDeps, sessionID: string): Promise<void> {
  const idleState = deps.idleState
  if (!idleState) return

  const lease = acquireIdleContinuationLease(idleState, sessionID)
  if (!lease) return

  try {
    const data = idleState.sessionData.get(sessionID)
    if (data?.aborted) return

    if (!isIdleContinuationEnabled(idleState, sessionID)) {
      if (lease.isCurrent()) clearSession(idleState, sessionID)
      return
    }

    const cfg = deps.getConfig()
    const idleCfg = cfg.idleContinuation
    const maxContinuations = idleCfg?.maxContinuations ?? 20
    const count = data?.continuationCount ?? 0
    if (count >= maxContinuations) {
      if (lease.isCurrent()) clearSession(idleState, sessionID)
      return
    }

    if (!deps.client) return

    const hasUnfinished = await hasUnfinishedTodos(deps.client, sessionID)
    if (!lease.isCurrent()) return
    if (!hasUnfinished) {
      clearSession(idleState, sessionID)
      return
    }

    const prompt = idleCfg?.prompt ?? DEFAULT_CONTINUATION_PROMPT
    try {
      await deps.client.session.prompt({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text: prompt }] },
      })
      if (!lease.isCurrent()) return
      const sessionData = getSessionData(idleState, sessionID)
      sessionData.continuationCount = count + 1
    } catch (err) {
      log.warn("idle continuation prompt failed", { sessionID, error: String(err) })
      if (lease.isCurrent()) clearSession(idleState, sessionID)
    }
  } finally {
    lease.release()
  }
}
```

The aborted-marker branch deliberately returns without clearing the marker. The todo read is followed immediately by a current check before cleanup or prompt. Prompt settlement is followed immediately by a current check before `getSessionData` or count mutation. The catch may log stale failure metadata but can clear only a current lifecycle. `finally` always calls the identity-safe release.

- [ ] **Step 5: Mirror only legitimate lifecycle transitions in `event-handler.ts`**

Replace the idle-state import with:

```ts
import {
  beginIdleSession,
  invalidateIdleSession,
  markSessionAborted,
  type IdleContinuationState,
} from "./idle-state.ts"
```

For each decodable `session.created`, call `beginIdleSession` before and outside the existing main `!lifecycle.hasSession(...)` gate. The idle helper is the idempotent observed-create transition, so it detects first observed create independently of main lifecycle state:

```ts
if (deps.idleState) beginIdleSession(deps.idleState, childSessionID)
if (!lifecycle.hasSession(childSessionID)) {
  lifecycle.beginSession(childSessionID)
  sessionStates.delete(childSessionID)
  // existing controller and lineage work remains byte-for-byte here
}
```

```ts
if (deps.idleState) beginIdleSession(deps.idleState, sessionID)
if (!lifecycle.hasSession(sessionID)) {
  lifecycle.beginSession(sessionID)
  sessionStates.delete(sessionID)
  // existing controller work remains byte-for-byte here
}
```

No controller, suppression, fallback state, or main lifecycle work may move. A first observed create must reset lazy idle state even if an earlier error caused `lifecycle.hasSession(sessionID)` to be true. A duplicate observed create is a no-op inside `beginIdleSession`, preserving the active lease, data, count, and override.

In the existing `session.deleted` branch, preserve the current main-lifecycle/controller/intent/fallback cleanup order and replace only the idle cleanup call:

```ts
lifecycle.invalidateSession(sessionID)
controller.onDeleted(sessionID);
(deps.clearSessionIntent ?? defaultClearSessionIntent)(sessionID)
sessionStates.delete(sessionID)
if (deps.idleState) invalidateIdleSession(deps.idleState, sessionID)
suppressSession(sessionID)
```

Leave `session.idle` ordering unchanged: `controller.onIdle(sessionID, routeSnapshot.snapshotId)` remains before ordinary continuation, and `handleIdleContinuation` runs only when `suppressIdleContinuation` is false.

Keep the explicit-abort block in its current order; do not move `markSessionAborted` across controller or suppression calls:

```ts
if (interruptionRecoveryEnabled()) {
  controller.markExplicitAbort(sessionID)
}
if (deps.idleState) {
  markSessionAborted(deps.idleState, sessionID)
}
suppressSession(sessionID)
```

- [ ] **Step 6: Run the state and idle event-handler suites and capture the GREEN evidence**

Run:

```powershell
node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts
```

Expected GREEN evidence: exit code `0`, zero failures, and every listed state and idle-handler test passes. Existing disabled, aborted, no-client, max-count, todo-recognition, deletion cleanup, intent cleanup, fallback-state preservation, the five original races, and the five correction acceptance tests remain green.

### Task 3: Run compiler, regression, and scope gates

**Files:**
- Verify only: the five task-owned files, the two subproject 2 workflow documents, and the four preserved subproject 1 paths in the Scope Ledger.

**Interfaces:**
- Consumes: all Task 1 and Task 2 interfaces and unchanged dedicated-429/event-handler behavior.
- Produces: reproducible targeted-test, compiler, full-suite, whitespace, and exact-working-tree-scope evidence; no source or Git-history changes.

- [ ] **Step 1: Attempt TypeScript LSP diagnostics without changing the environment**

Invoke `lsp_diagnostics` for each task-owned TypeScript file:

```text
src/runtime-fallback/idle-state.ts
src/runtime-fallback/idle-state.test.ts
src/runtime-fallback/event-handler-idle-continuation.ts
src/runtime-fallback/event-handler-idle-continuation.test.ts
src/runtime-fallback/event-handler.ts
```

Expected: no error diagnostics. If the tool reports `typescript-language-server` is unavailable, record that exact limitation, do not install it, and continue to the mandatory `pnpm run typecheck` compiler gate below.

- [ ] **Step 2: Run all three targeted suites together**

Run:

```powershell
node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts src/runtime-fallback/event-handler-dedicated-429-idle-suppression.test.ts
```

Expected: exit code `0` and zero failures across all listed tests. The dedicated-429 suite must continue proving that waiting, active, and queued dedicated work suppress ordinary continuation, completed dedicated work restores it, and generic fallback still allows ordinary continuation.

- [ ] **Step 3: Run the strict TypeScript compiler gate**

Run:

```powershell
pnpm run typecheck
```

Expected: exit code `0` from `tsc -p tsconfig.json --noEmit` with no TypeScript diagnostics. This gate is mandatory even when LSP diagnostics are unavailable.

- [ ] **Step 4: Run the complete TypeScript and Rust regression suite**

Run:

```powershell
pnpm test
```

Expected: exit code `0`; the Node test run reports zero failures and `cargo test -p ocmm-lsp` reports all test results `ok`.

- [ ] **Step 5: Check whitespace and patch validity**

Run:

```powershell
git diff --check
```

Expected: exit code `0` and no output.

- [ ] **Step 6: Enforce the exact dirty-worktree scope**

Run this PowerShell scope assertion from the repository root:

```powershell
$expected = @(
  "docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md"
  "docs/superpowers/plans/2026-07-28-idle-continuation-fencing.md"
  "docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md"
  "docs/superpowers/specs/2026-07-28-idle-continuation-fencing-design.md"
  "src/config/load.test.ts"
  "src/config/merge.ts"
  "src/runtime-fallback/event-handler-idle-continuation.test.ts"
  "src/runtime-fallback/event-handler-idle-continuation.ts"
  "src/runtime-fallback/event-handler.ts"
  "src/runtime-fallback/idle-state.test.ts"
  "src/runtime-fallback/idle-state.ts"
) | Sort-Object
$actual = @(
  git diff --name-only
  git ls-files --others --exclude-standard
) | Where-Object { $_ } | Sort-Object -Unique
$scopeDiff = Compare-Object -ReferenceObject $expected -DifferenceObject $actual
if ($scopeDiff) {
  $scopeDiff
  throw "Unexpected working-tree scope"
}
"scope clean: $($actual.Count) paths"
git status --short
```

Expected: `scope clean: 11 paths`, followed by only the five task-owned implementation/test files, the two subproject 2 spec/plan artifacts, and the four pre-existing subproject 1 paths. Any shared fixture, config/schema, prompt/skill, generated, controller, interruption, or unrelated path is a hard scope failure.

- [ ] **Step 7: Report execution evidence without committing**

Report:

```text
Implementation tasks: 2, followed by 1 final verification task; execution order is Task 1 -> Task 2 -> Task 3.
Interfaces: IdleContinuationLease; `sessionLifecycleKinds`; idempotent observed-create beginIdleSession; tombstoning invalidateIdleSession; deleted-aware acquireIdleContinuationLease; deleted-preserving markSessionAborted; non-invalidating clearSession; unchanged handler signatures.
RED: lifecycle-kind/tombstone and first-observed-create-after-error tests fail against the current partial implementation, then event-handler race assertions fail.
GREEN: all listed state, idle-handler, and dedicated-429 tests pass with zero failures; typecheck and full tests exit 0.
Scope: exactly 5 task-owned files + 2 subproject 2 workflow artifacts + 4 preserved subproject 1 paths.
LSP: clean, or unavailable without installation and covered by the successful compiler gate.
Self-review: spec coverage, interface consistency, incomplete-marker scan, serial dependency order, and scope ledger all passed.
Receipt: waiting for renewed receipt; the prior plan-critic receipt is invalidated by this correction.
```

Do not add a commit step and do not execute `git add`, `git commit`, `git push`, `git tag`, or any other Git write command.

## Plan Self-Review Record

- **Spec coverage:** Task 1 covers monotonic lifecycle generation, lifecycle kinds, lazy establishment, observed-create idempotence, deleted tombstones, token identity, exact release ownership, abort preservation, and normal cleanup. Task 2 retains all five asynchronous races and adds deleted-late-idle, delete-create-idle, first-observed-create-after-retryable/nonretryable-error, duplicate observed-create preservation, and late-abort-after-delete coverage. It preserves handler checks after both awaits, stale catch behavior, deletion integration, abort integration, and unchanged 429 suppression. Task 3 covers the three required focused suites, compiler, full regression, patch validity, and exact scope.
- **Interface consistency:** All tasks use `IdleContinuationLease`, `sessionLifecycleKinds`, `beginIdleSession`, `invalidateIdleSession`, and `acquireIdleContinuationLease` with the exact signatures and lifecycle semantics declared in Task 1. No token or generation is exposed through the lease API.
- **Completeness scan:** Every code-changing step contains concrete code; every command has expected evidence; no deferred design choices or incomplete sections remain.
- **Scope check:** The work is one bounded subproject with two serial TDD implementation tasks and one final verification task. The five implementation/test files, two subproject 2 workflow documents, and four preserved subproject 1 paths are the full scope. No fixture modification is allowed.
- **Receipt status:** `waiting for renewed receipt`; this document correction invalidates the prior plan-critic receipt.
