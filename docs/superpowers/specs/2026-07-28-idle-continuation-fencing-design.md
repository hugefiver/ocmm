# Idle Continuation Fencing and Duplicate-Event Coalescing Design

**Date:** 2026-07-28
**Status:** Approved
**Upstream reference:** `./omo@79a15710a4a637d7958ba8f54d8070cf8e8a883d`

## Goal

Make idle continuation safe when OpenCode lifecycle events are delayed, duplicated, or overlap. A session may have at most one active idle-continuation operation. An operation that belongs to a deleted, aborted, or replaced lifecycle must not prompt, create state, clear replacement state, or increment a replacement continuation count after its asynchronous work settles.

The change preserves the present continuation decision: continuation remains controlled by the existing enabled flag, per-session override, maximum count, todo result, configured prompt, and client availability. It also preserves the ordering in which the dedicated 429 controller can suppress ordinary idle continuation.

## Scope

This subproject changes only these implementation and direct-test files:

- `src/runtime-fallback/idle-state.ts`
- `src/runtime-fallback/idle-state.test.ts`
- `src/runtime-fallback/event-handler-idle-continuation.ts`
- `src/runtime-fallback/event-handler-idle-continuation.test.ts`
- `src/runtime-fallback/event-handler.ts`

Existing event-handler test fixtures may change only if the direct tests cannot express the required deferred-message and deferred-prompt races without them. The preferred implementation adds local test helpers instead.

No persistent storage is introduced. Generation and lease data are process-local maps owned by `IdleContinuationState`.

## Non-goals

- Do not add a task-completion receipt or ledger.
- Do not allocate, persist, or correlate task IDs.
- Do not migrate or replace the Senpi engine.
- Do not change nearest-parent discovery, unified configuration, schema, generated schema, prompts, or configuration defaults.
- Do not change `subagent-429-session/controller`, the interruption output adapter, task correlation, fallback `sessionStates`, or the continuation prompt text.
- Do not claim that the host serializes events or prevents parallel dispatch. The design treats host events as independently delayed, duplicated, and overlapping.

## Architecture

### Considered approaches

1. **A single boolean, such as `inFlight`, per session.** This blocks a duplicate idle while the first operation is running, but cannot distinguish a stale completion from a newly created session that reused the same ID. It is rejected.
2. **Use only the runtime-fallback lifecycle generation.** That lifecycle already fences fallback dispatches, but idle continuation owns independent state, supports direct idle events that have no observed `session.created`, and needs identity-safe lease release. Coupling it to the fallback lifecycle would enlarge the change surface and make direct compatibility harder. It is rejected.
3. **Give idle state its own lifecycle generation plus a tokenized lease.** Every continuation captures both values. This fences replacement lifecycles and allows exact coalescing without changing 429 or interruption ownership. This is the selected approach.

### State contract

`IdleContinuationState` retains `globalEnabled`, `sessionOverrides`, and `sessionData`. It gains `sessionLifecycleKinds: Map<string, "lazy" | "observed" | "deleted">`, plus in-memory lifecycle bookkeeping that provides:

- a monotonically increasing generation for each newly established idle lifecycle;
- the current generation for a lazy or observed session ID, if any;
- at most one active continuation lease for a session ID;
- a unique lease token for every successful acquisition.

A private state-wide `nextGeneration` counter allocates every generation. It never decreases or reuses a value, so a legal create receives a generation newer than its prior lifecycle. Deletion removes the active generation but retains a process-local `deleted` tombstone. There is no persistent or timed tombstone: the tombstone is bounded by the session IDs already tracked in this state and only a legal create clears it.

The state module exposes lifecycle helpers with these responsibilities:

- **Begin observed lifecycle:** `beginIdleSession` is the idempotent observed-create transition. If the kind is `observed`, it is a no-op that preserves generation, data, override, and lease. If the kind is absent, `lazy`, or `deleted`, it stales the old lease, allocates a newer generation, clears old `sessionData`, preserves the session override, and stores `observed`.
- **Invalidate lifecycle:** remove the active generation and lease, clear `sessionData` and the session override, and store `deleted`. Every prior lease then fails `isCurrent()`.
- **Mark explicit abort:** when the kind is `deleted`, leave the tombstone unchanged and do not create a generation or data. Otherwise stale the active lease by moving to a newer generation, preserve the existing kind (`observed` or `lazy`, with absent becoming `lazy`), preserve `continuationCount`, and set `sessionData.aborted = true`. The marker remains until a legal observed-create reset or deletion.
- **Acquire continuation lease:** return `undefined` for a `deleted` tombstone, with no messages request, prompt, or state resurrection. For an absent kind or generation, privately establish a `lazy` generation. For an active `lazy` or `observed` lifecycle, coalesce an active lease; otherwise return a lease containing the session ID, generation, unique token, `isCurrent()`, and `release()`.

`isCurrent()` succeeds only when both the lease generation is the active generation and the exact token is still the active lease. `release()` removes the lease only when the stored identity still matches its own generation and token. An old completion therefore cannot remove a newer lease that happens to use the same session ID.

The existing data-cleanup helper remains available for normal current-lifecycle cleanup, such as disabled continuation, exhausted count, or no unfinished todo. It removes only data and override; it retains lifecycle kind, generation, and lease. It does not let a stale caller erase a replacement lifecycle because callers must first prove their lease is current. Lifecycle invalidation is the deletion path that removes active identity and records the `deleted` tombstone.

### Event-handler integration

The existing runtime-fallback lifecycle remains authoritative for fallback dispatches. The idle state lifecycle mirrors only the event boundaries it needs:

1. For every decodable `session.created`, call `beginIdleSession` when `idleState` exists before and outside the existing `if (!lifecycle.hasSession(...))` gate. The helper, not the main lifecycle gate, distinguishes a first observed create from a duplicate observed create.
2. Keep all existing main lifecycle and controller work inside the current gate, byte-for-byte except for this idle-helper relocation. A prior `session.error` may have lazily created main fallback lifecycle state, so the gate cannot define whether this is the first observed create for idle continuation.
3. On `session.deleted`, retain the current order that invalidates the main lifecycle and calls `controller.onDeleted()` before idle cleanup. Replace ordinary idle cleanup with idle lifecycle invalidation so data, override, and lease are removed together.
4. On an explicit abort, retain the current 429-controller and suppression behavior, then mark the idle session aborted. That operation invalidates any active continuation lease and preserves the abort marker.
5. On `session.idle`, leave `controller.onIdle()` first. If it reports `suppressIdleContinuation`, do not acquire or run an ordinary continuation lease. Otherwise call the fenced continuation handler.

An idle event can arrive without a preceding observed `session.created`. Lease acquisition creates an idle lifecycle lazily, so this compatibility case still performs the existing continuation flow. If a retryable or nonretryable error has already lazily established main fallback lifecycle state, the first later observed create still resets the lazy idle lifecycle. A duplicate observed create preserves its active lease, count, data, and override. An idle arriving after deletion does nothing until a legal observed create resets the tombstone.

## State/Data Flow

```text
session.idle
    |
    v
429 controller observes idle and may suppress ordinary continuation
    |
    +-- suppressed --> return
    |
    v
acquire one idle lease for the current or lazily created generation
    |
    +-- existing lease --> return
    |
    v
check abort, enabled state, maximum count, and client
    |
    v
await messages through hasUnfinishedTodos()
    |
    v
lease still current?
    |
    +-- no --> return without state access or cleanup
    |
    v
unfinished todo? --> no: current-only cleanup and return
    |
    yes
    v
issue one prompt request
    |
    v
await prompt settlement
    |
    v
lease still current? --> yes: increment the captured lifecycle's count
                         no: return without mutation
    |
    v
identity-safe release in finally
```

`handleIdleContinuation` acquires once at entry, after confirming that idle state exists. A failed acquisition is a no-op. Its pre-await checks retain their present meaning: an abort marker prevents continuation, disabled continuation cleans up only while current, a count at the configured limit cleans up only while current, and a missing client returns without a prompt.

After `hasUnfinishedTodos()` settles, the handler checks `lease.isCurrent()` before every next side effect. It must not call a lazy state getter, clear state, or issue a prompt when the lease is stale. Before `client.session.prompt()` is issued, the current check is the final cancellable fence. After the prompt settles, only a current lease may fetch data and set `continuationCount` to the pre-prompt count plus one. The `finally` block always invokes identity-safe `release()`.

## Lifecycle Semantics

| Event or condition | Required idle-state result |
| --- | --- |
| First observed `session.created` | For absent, lazy, or deleted kind, stale an old lease, allocate a newer generation, clear old data, preserve the override, and set kind to `observed`, even if main fallback lifecycle state already exists. |
| Duplicate observed `session.created` | Do nothing to idle state. It preserves active lease, data, count, override, and generation. |
| Direct `session.idle` with no observed creation | Lazily establish a generation with kind `lazy`, then run the ordinary fenced flow. |
| Duplicate or overlapping `session.idle` | The first acquisition owns the lease. Every other acquisition for that session returns no lease and causes no messages or prompt request. |
| Explicit abort | Unless the kind is `deleted`, stale the active lease, retain the current kind, preserve the count, and set an aborted marker. Repeated idle events see the marker and do not prompt. A late abort after delete leaves the tombstone untouched. |
| `session.deleted` | Remove generation, lease, data, and override; store kind `deleted`; leave every old lease stale. |
| Delayed `session.idle` after delete | Return no lease. It sends no messages request or prompt and cannot recreate state. |
| Delete then recreate with the same ID | The legal observed create clears the tombstone and establishes a newer `observed` generation. Old asynchronous completions cannot touch it, and a new idle event can acquire its own lease. |

Normal completion cleanup does not itself create a new lifecycle. A later idle can reuse the current lifecycle and create fresh ordinary session data as today. Only an observed-create transition, explicit abort, deletion, or lazy establishment changes lifecycle identity.

## Race Boundary

Deletion or explicit abort during the todo read makes the lease stale. When the read resolves, the handler returns without prompting and without recreating state.

There is one unavoidable host boundary: deletion can occur after the final current check and immediately before the host receives `client.session.prompt()`. The plugin cannot retract a request that was already issued to the host. This design does not pretend otherwise. It requires that a stale post-prompt completion cannot increment a count, clear state, release a newer lease, or otherwise mutate a replacement lifecycle.

The same rule covers deletion while the prompt promise is pending. A delete followed by a recreate may establish a new generation and run a new continuation before the old promise settles. The old settlement is observational only.

## Error Handling

`hasUnfinishedTodos()` keeps its existing failure behavior: an unreadable message history is treated as having no unfinished todo. If that result is still current, ordinary cleanup is permitted; if the lease is stale, the handler returns without cleanup.

Prompt failures continue to log the session ID and stringified error without logging prompt contents or provider payloads. A catch block may clear ordinary idle state only after verifying that its lease is current. A stale catch may log but must not call a getter, clear state, or alter a lease. `release()` runs in `finally` regardless of prompt success or failure and only removes its own identity.

No errors are persisted, retried, converted into fallback work, or sent to the interruption output adapter. The dedicated 429 controller remains responsible for its existing retry and idle-suppression decisions.

## Testing

Work test-first. Add the focused tests in a red state, implement the smallest state and handler changes that make them green, then run the regression suites.

The direct tests must prove these binary conditions:

1. Two same-session idle events overlapping during a deferred todo read produce exactly one messages call and exactly one continuation prompt.
2. `created → deleted → delayed idle` produces no messages request or prompt, and leaves the `deleted` tombstone intact.
3. Deletion during a deferred todo read produces no prompt and does not recreate idle state when the read resolves.
4. Explicit abort during a deferred todo read produces no prompt, and a later idle for that lifecycle also produces no prompt.
5. `deleted → created → idle` clears the tombstone, establishes an observed lifecycle, and continues normally; an old deferred todo result cannot affect it.
6. Deletion while a prompt is pending prevents the old completion from incrementing or clearing the recreated lifecycle's state.
7. A state-unit test proves that releasing an old lease cannot remove a newer lease for the same session ID.
8. A direct idle with a pending todo read followed by an error that lazily establishes main fallback lifecycle state is reset by the first `session.created`: the idle generation advances, the old lease becomes stale, its read cannot prompt, and a new idle can continue.
9. A duplicate observed create preserves active lease, data, count, and override in state-unit or integration coverage.
10. A late explicit abort after deletion neither clears the tombstone nor creates data or a generation.
11. Existing dedicated-429 idle suppression remains intact: waiting, active, and queued dedicated work suppress ordinary continuation, and completed dedicated work restores it. Generic fallback still permits the original continuation behavior.

Keep the pre-existing enabled, abort, no-client, maximum-count, todo-recognition, deletion cleanup, injected intent cleanup, and fallback-state preservation coverage green. Deferred client promises should be resolved only after the test has asserted the intermediate ownership boundary, so each test proves the race rather than merely its final result.

Run targeted idle suites, the dedicated 429 suppression suite, type checking, the complete test suite, and working-tree scope checks:

```powershell
node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts src/runtime-fallback/event-handler-dedicated-429-idle-suppression.test.ts
pnpm run typecheck
pnpm test
git diff --check
```

## Acceptance Criteria

- A session has no more than one active idle-continuation lease.
- Lease validity requires both current generation and exact token identity.
- An old lease release cannot remove a newer lease for the same session ID.
- A deleted idle lifecycle remains tombstoned until a legal observed create. A late idle or explicit abort cannot recreate it.
- The first observed create resets absent, lazy, or deleted idle state even if main fallback lifecycle state was established by an earlier error. Duplicate observed create does not reset idle state.
- Direct idle events remain supported without a preceding observed creation.
- Delete and explicit abort invalidate active work, and explicit abort stays effective until lifecycle reset or deletion.
- After any await, a stale lease causes no later state mutation or cleanup. The documented final pre-prompt host-request boundary remains the sole exception.
- The documented final pre-prompt race boundary is accepted, while stale prompt completions cannot mutate a replacement lifecycle.
- 429 idle suppression, generic fallback behavior, interruption correlation, prompt text, configuration, and fallback `sessionStates` remain unchanged.
- Only the scoped implementation and direct-test files are changed during implementation, aside from an existing fixture only when strictly necessary.
- Targeted tests, the dedicated 429 suppression test, `pnpm run typecheck`, `pnpm test`, and `git diff --check` pass.

**Author's note:** Written for the engineer implementing subproject 2, so they can add the fence without changing neighboring fallback systems.
