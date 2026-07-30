# Event-Driven CodeMode QA Completion Design

**Date:** 2026-07-31
**Status:** Approved by delegated self-review for planning
**Scope:** CodeMode compatibility runner fixtures and tests only; no ocmm product-runtime change

## Goal

Replace readiness and completion polling in `scripts/codemode-execute-compatibility.test.ts` with a dependency-free, cross-platform, append-only JSONL completion event stream. The tests must subscribe before the action under observation, replay events already present in the stream, tolerate partial lines and duplicate lifecycle events, clean up every watcher, fail closed when an event is absent, and retain immediate operating-system PID absence assertions after completion.

## Discovery Evidence

The design is based on repository HEAD `c4ee569` with a clean worktree at discovery time.

- `scripts/codemode-execute-compatibility.test.ts:265-279` currently defines `waitForProcessExit()` and `waitForFile()` as fixed 25 ms polling loops.
- `waitForFile()` is used at current lines 1957 and 2197 to discover the MCP fixture PID ledger and process-wrapper PID ledger.
- `waitForProcessExit()` is used at current lines 2168, 2206, and 2872-2873 to wait for native or wrapper PIDs to disappear.
- `scripts/fixtures/codemode-execute-probe-mcp.mjs:8-13` already appends `{ "event": <name> }` JSONL rows and emits `started` only after recording its PID. Its `stop()` at lines 105-120 emits `stopped` before exit. This fixture already has the required producer contract and needs verification, not a behavioral rewrite.
- `scripts/fixtures/codemode-execute-process-wrapper.mjs:50-55` observes the native child's `exit` but does not expose that completion to tests. It records `{ wrapperPid, nativePid }` at lines 57-63 and therefore has a natural point for a `started` milestone after successful ownership recording.
- `scripts/codemode-execute-compatibility.ts:797-875` implements `runCommand()` timeout, cooperative-stop grace, and close fallback. `cleanupRunTopology()` at lines 969-997 has a bounded PID-reap loop. Those are safety circuit breakers, not fixture-readiness synchronization, and remain unchanged.
- The elapsed-time tests beginning at current lines 2239 and 2269 intentionally verify real delayed descendant-output behavior. Their 1200/2300 ms delays and 1600/3000 ms cleanup horizons remain unchanged.
- `package.json:38-41` defines strict typecheck and the full Node/Cargo test suite. The compatibility test under `scripts/` is not part of `pnpm test`, so it requires its own targeted command.
- The planning baseline command `node --test --experimental-strip-types --test-reporter=spec scripts/codemode-execute-compatibility.test.ts` passed `75/75` in 14.45 seconds. Both relevant `.mjs` files passed `node --check`, and the installed TypeScript Compiler API reported `changed-file compiler diagnostics: 0` for the current compatibility test.

## Scope and Non-Goals

### In scope

1. A private test helper in `scripts/codemode-execute-compatibility.test.ts` that subscribes to an append-only lifecycle stream through parent-directory file notifications.
2. Optional process-wrapper lifecycle output configured by the fixture-only CLI segment `--events <events-file>` immediately after `<pid-file>`.
3. Event-driven synchronization of the existing MCP and process-wrapper integration tests.
4. Regression coverage for subscription-before-file-creation, replay of pre-existing rows, partial JSONL lines, duplicate lifecycle rows, truncation/malformed-row failure, watcher cleanup, and event timeout behavior.
5. Immediate `testPidAlive(pid) === false` assertions adjacent to the completion proof.

### Out of scope

- No files under `src/**` and no ocmm runtime behavior.
- No changes to default models, configuration schema, routing, release automation, prompts, or skills.
- No new package, native dependency, FIFO, named pipe, socket, or platform-specific helper.
- No changes to `runCommand()` timeout/close behavior, `cleanupRunTopology()` PID reap behavior, stop-file watchdogs, stop grace, force-kill deadlines, or intentional elapsed-time tests.
- No replacement of final PID liveness assertions with fixture claims.
- No live provider/model invocation and no generated fixture refresh.

## Approaches Considered

### 1. Parent-directory `fs.watch` plus append-only JSONL — selected

Attach `fs.watch()` to the already-created parent directory before reading the stream. Treat every `rename` or `change` notification, including a notification with no filename, as a wake-up hint; then synchronously drain only bytes appended since the last successful read. Perform one initial drain after the watcher is attached so rows written before subscription are replayed without leaving a read/subscribe race.

**Advantages:** Uses Node built-ins only; works when the target file does not yet exist; remains attached when Windows reports creation/appends as `rename` rather than `change`; coalesced notifications are safe because every wake-up drains all new bytes; existing JSONL fixtures need only tiny lifecycle additions.

**Trade-off:** `fs.watch` notifications are advisory and can be coalesced. The implementation therefore cannot map one notification to one event and must retain an outer timeout. A missing notification or missing event fails the test rather than falling back to polling.

### 2. Direct file watcher or `fs.watchFile`

Watch the event file itself, or use stat-based `fs.watchFile()` until its size changes.

**Rejected because:** The event file often does not exist when the test must subscribe. Direct file watches can lose continuity across creation/replacement semantics, especially on Windows. `fs.watchFile()` is polling and would only rename the existing problem.

### 3. Child IPC, marker files, or platform pipes

Expose completion through an extra stdio descriptor/IPC channel, one marker file per milestone, a POSIX FIFO, or a Windows named pipe.

**Rejected because:** The MCP fixture and native LSP wrapper are launched through host-owned process topology, so adding an IPC channel changes more wiring than the QA synchronization needs. Marker files still depend on file-creation races and multiply artifacts. POSIX FIFOs are not cross-platform, while Windows named pipes require separate platform behavior. None provides the simple replay property of an append-only stream.

## Architecture

### Completion subscription

`scripts/codemode-execute-compatibility.test.ts` will define this private interface:

```ts
type CompletionEventSubscription = {
  waitFor(event: string): Promise<void>
  close(): void
}

function subscribeToCompletionEvents(path: string): CompletionEventSubscription
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T>
```

The subscription is a one-shot lifecycle latch keyed by event name, not a general message queue. The first valid row for a name marks that milestone complete; later duplicate rows are idempotently ignored. A waiter registered after the row was observed resolves immediately.

The setup sequence is race-safe:

1. Require the parent directory to exist.
2. Attach `fs.watch(parentDirectory, { persistent: false })` without relying on `eventType` or `filename` filtering.
3. Queue an initial drain after the watcher exists.
4. On every notification, queue one serialized drain. Multiple notifications may collapse into one drain.
5. Read the current file as bytes. `ENOENT` before creation is not an error. A length smaller than the already consumed offset violates the append-only contract and rejects every pending waiter.
6. Append only the unread suffix to an in-memory byte buffer. Parse only newline-terminated rows, retain the final incomplete row for the next drain, accept `\r\n`, and require each completed row to have exactly one non-empty string property named `event`.
7. On explicit `close()`, close the watcher and reject unresolved waiters. `close()` is idempotent.

This is event-driven even though a drain uses `readFileSync()`: file reads occur only for initial replay and notification callbacks. There is no interval, recursive timeout, repeated existence check, or repeated PID probe in the subscription.

### Fixture producers

The stream schema remains deliberately minimal:

```json
{"event":"started"}
{"event":"stopped"}
{"event":"native-exited"}
```

No PID, timestamp, command, argument, path, provider value, or output text enters a completion row.

- **MCP fixture:** Keep `OCMM_CODEMODE_PROBE_EVENTS` and its existing `started`/`stopped` ordering unchanged. `started` proves its PID row is readable; `stopped` proves the fixture executed its cooperative-stop handler.
- **Process wrapper:** Extend its fixture CLI from `<pid-file> <command> [args...]` to `<pid-file> [--events <events-file>] <command> [args...]`. Emit `started` only after the `{ wrapperPid, nativePid }` ownership row is appended successfully. Emit `native-exited` exactly once from the native child's `exit` callback, before resolving the wrapper's own exit code. A native spawn error does not forge `native-exited`. The optional explicit path avoids inheriting an ambient variable or changing the live runner's existing invocation.

The production compatibility runner does not consume these synchronization promises. Direct integration tests pass the optional wrapper CLI segment. `scripts/codemode-execute-compatibility.ts` therefore does not need a change.

## Data Flow

### MCP lifecycle tests

1. Create the temporary parent and PID directory.
2. Subscribe to `events.jsonl` before spawning the MCP fixture.
3. Register both `started` and `stopped` waiters before sending input or writing the stop file.
4. Await `started`; only then read the PID ledger or send JSON-RPC/stop input.
5. Await `stopped` together with the child `exit`/`close` promise under the outer timeout.
6. Perform existing response/event-order assertions and close the subscription in `finally`.

### Process-wrapper lifecycle tests

1. Create the temporary parent/PID directory and subscribe before spawning or calling `runCommand()`.
2. Register `started` and `native-exited` waiters before the action.
3. Await `started` before reading the ownership ledger or sending the stop signal.
4. Await `native-exited` and wrapper process completion under the outer timeout.
5. Immediately assert the native PID is absent. Once wrapper `close` has completed, immediately assert the wrapper PID is absent as well.

### Timeout integration test

The test named `timeout kills a long-lived wrapper child and cleanup removes the real directory` subscribes before `runCommand()`, registers `started` and `native-exited`, and keeps `runCommand(timeoutMs: 1000)` as the authority for timeout behavior. After `runCommand()` returns and the completion milestones resolve, the test directly asserts both recorded PIDs are absent, then exercises `cleanupRunTopology()` exactly as before.

## Polling Replacement Matrix

| Current synchronization | Current use | Replacement |
|---|---|---|
| `waitForFile(pidPath)` | MCP stop test at current line 1957 | Await MCP `started`, then parse the PID ledger. |
| `waitForFile(pidPath)` | Wrapper stop test at current line 2197 | Await wrapper `started`, then parse the ownership ledger. |
| `waitForProcessExit(nativePid)` | Natural wrapper exit at current line 2168 | Await `native-exited`, await wrapper close, then immediately assert `testPidAlive(nativePid) === false`. |
| `waitForProcessExit(nativePid)` | Wrapper stop at current line 2206 | Await `native-exited` and wrapper close, then immediately assert native and wrapper PIDs are absent. |
| `waitForProcessExit(wrapperPid)` | Timeout test at current line 2872 | `runCommand()` close completion is the event-driven wrapper completion; immediately assert the wrapper PID is absent. |
| `waitForProcessExit(nativePid)` | Timeout test at current line 2873 | Await `native-exited`, then immediately assert the native PID is absent. |

After these replacements, remove `processExists()`, `waitForProcessExit()`, and `waitForFile()`. `waitForExit(child)` remains because it already subscribes to `ChildProcess` events rather than polling.

## Preserved Timeouts and Circuit Breakers

The following timing behavior is explicitly retained:

- `runCommand()`'s caller-provided timeout, 300 ms cooperative-stop grace, 2500 ms close fallback, and rule that an already-exited direct child is never killed.
- The wrapper's 750 ms native-child force timer.
- The MCP and wrapper 25 ms stop-file watchdog intervals. They are cooperative shutdown circuit breakers inside disposable fixtures, not test readiness polling.
- `cleanupRunTopology()`'s default 5000 ms PID-reap deadline and 25 ms liveness sampling. It protects deletion safety and remains outside the polling replacement scope.
- The existing 1500 ms MCP/wrapper stop races. They may be expressed through `withTimeout()`, but the deadline and fail-closed behavior remain.
- The real 1200/2300 ms descendant-output delays and 1600/3000 ms cleanup waits in the two `runCommand()` elapsed-time tests.

Every event wait has an outer timeout. The timeout does not poll; it rejects once if the required event is absent.

## Error Handling

- **Event written before subscription:** The post-watch initial drain replays it.
- **File absent at subscription:** Initial `ENOENT` is ignored; parent-directory creation/write notification triggers a drain.
- **Partial line:** Retain bytes until a newline arrives. Never parse or reject an unterminated suffix merely because one notification was delivered.
- **Duplicate event:** Resolve the milestone once and ignore duplicates.
- **Coalesced or repeated notifications:** Serialize and coalesce drains; each drain consumes all bytes after the last offset.
- **Windows `rename`/`change` differences:** Keep the parent-directory watcher attached and treat every notification as a wake-up; do not depend on filename delivery or watch the file inode.
- **Truncation/replacement:** A shorter stream violates append-only ownership and rejects all waiters.
- **Malformed completed row or invalid schema:** Reject all waiters and close the watcher. Do not skip corrupt evidence.
- **Watcher error:** Reject all waiters and close once.
- **Explicit cleanup:** Every test closes its subscription in `finally`; unresolved waiters reject rather than leak.
- **Missing completion:** The outer timeout fails the test. No existence/PID polling fallback is permitted.
- **PID evidence:** A completion row is only synchronization. The adjacent operating-system liveness assertion remains authoritative.

## Testing Strategy

### Subscription contract tests

Add focused tests that prove:

1. a subscription created before the stream file exists receives the creation/append notification;
2. an event present before subscription is replayed;
3. an unterminated JSONL suffix is retained and resolves only after the remaining bytes plus newline arrive;
4. duplicate rows are idempotent and a later waiter resolves immediately;
5. truncation, an empty or CR-only terminated row, or any other malformed terminated JSONL rejects rather than timing out or being skipped; and
6. `close()` is idempotent and rejects a waiter registered after closure.

### Fixture integration tests

Update the three MCP fixture tests to subscribe before spawn and use existing `started`/`stopped` milestones. Update natural-exit, cooperative-stop, and timeout process-wrapper tests to require `started`/`native-exited`, wrapper close, and immediate PID absence.

The RED phase for process-wrapper integration is deterministic: after tests require `started`/`native-exited` but before the wrapper emits them, the selected wrapper tests fail through the named outer timeout. The GREEN phase emits both events in the defined order and all selected tests pass without either polling helper.

### Verification commands

The implementation plan will require, in order:

1. `pnpm run typecheck` — exit `0`, no TypeScript errors.
2. `node --test --experimental-strip-types --test-reporter=spec scripts/codemode-execute-compatibility.test.ts` — all compatibility subtests pass with zero failures.
3. `pnpm test` — Node and Cargo suites pass with zero failures.
4. `pnpm run build` — TypeScript and release native-LSP build complete successfully.
5. Per-changed-file diagnostics for the TypeScript test through `lsp_diagnostics`, or the installed TypeScript Compiler API if the language server is unavailable; no installation is allowed.
6. `node --check scripts/fixtures/codemode-execute-process-wrapper.mjs` and `node --check scripts/fixtures/codemode-execute-probe-mcp.mjs` — both exit `0`.
7. `git diff --check`, allowlist inspection, and explicit searches proving the two polling helpers are gone while protected timing guards remain.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/codemode-execute-compatibility.test.ts` | Modify | Private event subscription, contract tests, event-driven fixture synchronization, and adjacent PID assertions. |
| `scripts/fixtures/codemode-execute-process-wrapper.mjs` | Modify | Optional `started` and `native-exited` append-only lifecycle rows. |
| `scripts/fixtures/codemode-execute-probe-mcp.mjs` | Verify unchanged | Existing `started`/`stopped` producer contract. |
| `scripts/codemode-execute-compatibility.ts` | Verify unchanged | Preserve runtime timeout, stop grace, close fallback, PID-reap timeout, and runner behavior. |

No other product, test, fixture, configuration, release, prompt, skill, generated, manifest, or lockfile path is part of the implementation.

## Acceptance Criteria

1. `waitForFile`, `waitForProcessExit`, and their private `processExists` helper are absent from the compatibility test.
2. No replacement helper uses interval/stat polling or repeated PID/file existence checks.
3. The subscription attaches before initial replay and before the test action, handles absent/pre-existing files, partial rows, duplicates, cleanup, and Windows notification shapes.
4. MCP tests wait for `started`/`stopped`; wrapper tests wait for `started`/`native-exited`.
5. Every missing lifecycle event fails through an outer timeout.
6. Native and wrapper PID absence is asserted immediately after the corresponding event/process completion and is never inferred solely from JSONL.
7. Every protected timeout, watchdog, reap loop, stop grace, close fallback, circuit breaker, and elapsed-time test listed above remains.
8. Targeted compatibility tests, typecheck, full tests, build, changed-file diagnostics, JavaScript syntax checks, and diff checks all pass.
9. The final repository delta stays within the two implementation files plus these two planning documents; no Git write or software installation is part of this subproject task.

## Design Self-Review

- **Placeholder scan:** Every interface, event name, environment variable, replacement site, timeout boundary, command, and expected result is concrete.
- **Internal consistency:** The stream is append-only, the watcher is parent-directory based, duplicate milestone semantics are one-shot, and outer timeouts remain independent of PID truth.
- **Scope:** The implementation changes one test file and one fixture only. The existing MCP producer and compatibility runner are verification boundaries.
- **Ambiguity:** Event ordering, replay, partial-line buffering, duplicate handling, Windows notifications, cleanup, fail-closed paths, and final PID assertions each have one explicit behavior.
