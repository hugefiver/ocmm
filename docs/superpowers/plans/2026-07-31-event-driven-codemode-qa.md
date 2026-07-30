# Event-Driven CodeMode QA Completion Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeMode compatibility fixture readiness/completion polling with a cross-platform append-only JSONL event subscription while preserving all cleanup circuit breakers and final PID absence assertions.

**Architecture:** A private test-only subscriber watches the stream's parent directory before performing an initial replay, drains appended bytes only on file notifications, buffers partial lines, and treats lifecycle event names as idempotent one-shot milestones. The MCP fixture's existing `started`/`stopped` rows remain authoritative for its lifecycle; the process wrapper adds optional `started`/`native-exited` rows, while `runCommand()` close and direct PID probes remain the final process evidence.

**Tech Stack:** Node.js built-ins (`node:fs`, `node:child_process`, `node:test`, `node:assert/strict`), TypeScript with Node's `--experimental-strip-types`, dependency-free ESM fixtures, PowerShell, pnpm, Cargo through the repository scripts.

**Global Constraints:**
- Modify only CodeMode compatibility runner fixtures/tests; do not change ocmm product runtime.
- The intended implementation delta is `scripts/codemode-execute-compatibility.test.ts` and `scripts/fixtures/codemode-execute-process-wrapper.mjs` only.
- Keep `scripts/fixtures/codemode-execute-probe-mcp.mjs` and `scripts/codemode-execute-compatibility.ts` behavior unchanged.
- Use a cross-platform append-only completion event stream; do not use POSIX FIFO, named pipes, sockets, external processes, or new dependencies.
- The subscriber must be notification-driven. It must not use `fs.watchFile`, interval polling, recursive timeout polling, repeated `existsSync`, or repeated PID probes.
- Handle subscription before file creation, replay before/at subscription, partial JSONL lines, duplicate events, explicit cleanup, and Windows `rename`/`change` notification semantics.
- Subscribe and register event waiters before the action under observation; missing events fail closed through an outer timeout.
- Preserve `runCommand()` timeout/close fallback, stop grace, PID-reap timeout, stop-file watchdogs, wrapper force timer, existing 1500 ms race circuit breakers, and real elapsed-time tests.
- Completion events never replace the adjacent assertion that a recorded PID is absent from the operating system.
- Do not modify default models, schema, routing, release automation, prompts, skills, manifests, lockfiles, generated bundles, or the tracked live compatibility fixture.
- Do not install software, invoke a provider/model, execute a Git write, stage files, commit, tag, or push.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/codemode-execute-compatibility.test.ts` | Modify | Completion subscriber, timeout wrapper, subscriber contract tests, event-driven MCP/wrapper integration tests, and final PID assertions. |
| `scripts/fixtures/codemode-execute-process-wrapper.mjs` | Modify | Optional append-only `started` and `native-exited` lifecycle producer. |
| `scripts/fixtures/codemode-execute-probe-mcp.mjs` | Verify unchanged | Existing `started`/`stopped` lifecycle producer and 25 ms stop-file watchdog. |
| `scripts/codemode-execute-compatibility.ts` | Verify unchanged | Existing timeout, stop-grace, close-fallback, PID-reap, runner, classifier, and evidence behavior. |
| `docs/superpowers/specs/2026-07-31-event-driven-codemode-qa-design.md` | Reference | Approved design and scope authority. |
| `docs/superpowers/plans/2026-07-31-event-driven-codemode-qa.md` | Reference | Executable TDD handoff and verification gates. |

## Execution Order

1. Task 1 establishes and proves the reusable notification subscriber in isolation.
2. Task 2 makes the wrapper produce lifecycle rows and converts every targeted polling site.
3. Task 3 runs repository gates, changed-file diagnostics, syntax checks, and scope verification.

Tasks 1 and 2 are sequential because Task 2 consumes Task 1's subscriber. Task 3 starts only after both targeted GREEN cycles pass.

### Task 1: Add the notification-driven completion subscriber

**Files:**
- Modify: `scripts/codemode-execute-compatibility.test.ts:1-279`
- Test: `scripts/codemode-execute-compatibility.test.ts`

**Interfaces:**
- Consumes: Node `watch(path, options, listener)`, `readFileSync(path): Buffer`, append-only `{ event: string }` JSONL, and an already-created parent directory.
- Produces: `subscribeToCompletionEvents(path: string): CompletionEventSubscription`, `CompletionEventSubscription.waitFor(event: string): Promise<void>`, `CompletionEventSubscription.close(): void`, `withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T>`, and `EVENT_TIMEOUT_MS = 1500` for Task 2.

- [ ] **Step 1: Add focused contract tests with a deliberate unimplemented subscriber**

Extend the imports at the top of `scripts/codemode-execute-compatibility.test.ts` so the RED tests can append rows:

```ts
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
```

Add this interface, timeout utility, and deliberate RED stub immediately after the fixture constants:

```ts
const EVENT_TIMEOUT_MS = 1500

type CompletionEventSubscription = {
  waitFor(event: string): Promise<void>
  close(): void
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function subscribeToCompletionEvents(_path: string): CompletionEventSubscription {
  throw new Error("completion event subscription not implemented")
}
```

Add these four tests next to the existing private test helpers and before `passingFacts()`:

```ts
test("completion event subscription replays partial and duplicate JSONL rows", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-events-replay-"))
  const eventsPath = join(root, "events.jsonl")
  writeFileSync(eventsPath, '{"event":"started"}\n{"event":"stop')
  const subscription = subscribeToCompletionEvents(eventsPath)
  try {
    await withTimeout(subscription.waitFor("started"), EVENT_TIMEOUT_MS, "existing started event was not replayed")
    const stopped = subscription.waitFor("stopped")
    appendFileSync(eventsPath, 'ped"}\n{"event":"stopped"}\n')
    await withTimeout(stopped, EVENT_TIMEOUT_MS, "partial stopped event did not complete")
    await withTimeout(subscription.waitFor("stopped"), EVENT_TIMEOUT_MS, "duplicate stopped event was not idempotent")
    subscription.close()
    subscription.close()
    await assert.rejects(subscription.waitFor("missing"), /subscription closed/)
  } finally {
    subscription.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test("completion event subscription observes creation and rejects truncation", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-events-create-"))
  const eventsPath = join(root, "events.jsonl")
  const subscription = subscribeToCompletionEvents(eventsPath)
  try {
    const started = subscription.waitFor("started")
    appendFileSync(eventsPath, '{"event":"started"}\n')
    await withTimeout(started, EVENT_TIMEOUT_MS, "created event stream was not observed")
    const missing = subscription.waitFor("missing")
    writeFileSync(eventsPath, "")
    await assert.rejects(
      withTimeout(missing, EVENT_TIMEOUT_MS, "truncated event stream was not rejected"),
      /completion event stream truncated/,
    )
  } finally {
    subscription.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test("completion event subscription rejects malformed terminated rows", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-events-malformed-"))
  const eventsPath = join(root, "events.jsonl")
  const subscription = subscribeToCompletionEvents(eventsPath)
  try {
    const missing = subscription.waitFor("started")
    appendFileSync(eventsPath, "not-json\n")
    await assert.rejects(
      withTimeout(missing, EVENT_TIMEOUT_MS, "malformed event row was not rejected"),
      /invalid completion event row/,
    )
  } finally {
    subscription.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test("completion event subscription rejects empty terminated rows", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-events-empty-"))
  const eventsPath = join(root, "events.jsonl")
  const subscription = subscribeToCompletionEvents(eventsPath)
  try {
    const missing = subscription.waitFor("started")
    appendFileSync(eventsPath, "\r\n")
    await assert.rejects(
      withTimeout(missing, EVENT_TIMEOUT_MS, "empty event row was not rejected"),
      /invalid completion event row/,
    )
  } finally {
    subscription.close()
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
node --test --experimental-strip-types --test-reporter=spec `
  --test-name-pattern='completion event subscription' `
  scripts/codemode-execute-compatibility.test.ts
```

Expected: exit nonzero. Each of the four selected tests fails from `completion event subscription not implemented`; no fixture or product source has changed yet.

- [ ] **Step 3: Replace the stub with the complete parent-directory subscriber**

Add `watch` to the `node:fs` import and `dirname` to the `node:path` import:

```ts
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  watch,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
```

Keep `CompletionEventSubscription`, `EVENT_TIMEOUT_MS`, and `withTimeout()` from Step 1. Replace only the RED stub with this implementation:

```ts
function subscribeToCompletionEvents(path: string): CompletionEventSubscription {
  type Waiter = { resolve: () => void; reject: (error: Error) => void }

  let watcher: ReturnType<typeof watch> | undefined
  let closed = false
  let failure: Error | null = null
  let consumedBytes = 0
  let buffered = Buffer.alloc(0)
  let drainQueued = false
  const seen = new Set<string>()
  const waiters = new Map<string, Set<Waiter>>()

  const rejectAll = (error: Error): void => {
    for (const entries of waiters.values()) {
      for (const waiter of entries) waiter.reject(error)
    }
    waiters.clear()
  }

  const fail = (value: unknown): void => {
    if (failure || closed) return
    failure = value instanceof Error ? value : new Error(String(value))
    closed = true
    watcher?.close()
    rejectAll(failure)
  }

  const observe = (event: string): void => {
    if (seen.has(event)) return
    seen.add(event)
    const entries = waiters.get(event)
    if (!entries) return
    waiters.delete(event)
    for (const waiter of entries) waiter.resolve()
  }

  const drain = (): void => {
    let contents: Buffer
    try {
      contents = readFileSync(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    if (contents.length < consumedBytes) {
      throw new Error(`completion event stream truncated: ${path}`)
    }
    const appended = contents.subarray(consumedBytes)
    consumedBytes = contents.length
    if (appended.length > 0) buffered = Buffer.concat([buffered, appended])

    for (let newline = buffered.indexOf(0x0a); newline >= 0; newline = buffered.indexOf(0x0a)) {
      const lineBuffer = buffered.subarray(0, newline)
      buffered = buffered.subarray(newline + 1)
      const line = lineBuffer.toString("utf8").replace(/\r$/, "")
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        throw new Error(`invalid completion event row: ${path}`)
      }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 ||
        !Object.hasOwn(parsed, "event") ||
        typeof (parsed as { event: unknown }).event !== "string" ||
        !(parsed as { event: string }).event.trim()
      ) {
        throw new Error(`invalid completion event row: ${path}`)
      }
      observe((parsed as { event: string }).event)
    }
  }

  const queueDrain = (): void => {
    if (closed || drainQueued) return
    drainQueued = true
    queueMicrotask(() => {
      drainQueued = false
      if (closed) return
      try {
        drain()
      } catch (error) {
        fail(error)
      }
    })
  }

  watcher = watch(dirname(path), { persistent: false }, () => queueDrain())
  watcher.once("error", fail)
  queueDrain()

  return {
    waitFor(event: string): Promise<void> {
      if (seen.has(event)) return Promise.resolve()
      if (failure) return Promise.reject(failure)
      if (closed) return Promise.reject(new Error(`completion event subscription closed: ${path}`))
      return new Promise<void>((resolveEvent, rejectEvent) => {
        const entries = waiters.get(event) ?? new Set<Waiter>()
        entries.add({ resolve: resolveEvent, reject: rejectEvent })
        waiters.set(event, entries)
      })
    },
    close(): void {
      if (closed) return
      closed = true
      watcher?.close()
      rejectAll(new Error(`completion event subscription closed: ${path}`))
    },
  }
}
```

Implementation invariants:

- The watcher is attached before `queueDrain()` performs initial replay.
- Every notification queues a full unread-suffix drain; callback `eventType` and `filename` are intentionally ignored.
- Only newline-terminated rows are parsed; `buffered` retains an incomplete suffix.
- `seen` makes lifecycle milestones idempotent.
- `readFileSync()` is invoked only by initial replay and watcher notification, never by a timer.

- [ ] **Step 4: Run the focused tests and verify GREEN**

```powershell
node --test --experimental-strip-types --test-reporter=spec `
  --test-name-pattern='completion event subscription' `
  scripts/codemode-execute-compatibility.test.ts
```

Expected: exit `0`; the four selected subscription tests pass. The creation test proves parent-directory notification, the replay test proves existing/partial/duplicate handling, and malformed, empty, or truncated streams reject with their named errors rather than timing out.

- [ ] **Step 5: Inspect the helper for forbidden polling**

```powershell
@'
import fs from "node:fs"
import ts from "typescript"

const path = "scripts/codemode-execute-compatibility.test.ts"
const text = fs.readFileSync(path, "utf8")
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const target = source.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "subscribeToCompletionEvents")
if (!target) throw new Error("subscribeToCompletionEvents declaration missing")
const body = target.getText(source)
for (const forbidden of ["watchFile", "setInterval", "process.kill", "existsSync", "setTimeout"]) {
  if (body.includes(forbidden)) throw new Error(`subscriber contains forbidden polling primitive: ${forbidden}`)
}
for (const required of ["watch(dirname(path)", "readFileSync(path)", "queueMicrotask", "consumedBytes", "buffered"]) {
  if (!body.includes(required)) throw new Error(`subscriber invariant missing: ${required}`)
}
process.stdout.write("completion subscriber polling scan: PASS\n")
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw "completion subscriber polling scan failed" }
```

Expected: exit `0` and print `completion subscriber polling scan: PASS`. The AST-bounded function body contains the notification/replay state and none of the forbidden polling primitives.

**Suggested commit message (do not execute in this task):** `test: add codemode completion event subscriber`

### Task 2: Publish fixture lifecycle events and remove readiness polling

**Files:**
- Modify: `scripts/codemode-execute-compatibility.test.ts:1840-1972,2145-2214,2847-2908`
- Modify: `scripts/fixtures/codemode-execute-process-wrapper.mjs:1-69`
- Verify unchanged: `scripts/fixtures/codemode-execute-probe-mcp.mjs`
- Verify unchanged: `scripts/codemode-execute-compatibility.ts`
- Test: `scripts/codemode-execute-compatibility.test.ts`

**Interfaces:**
- Consumes: `subscribeToCompletionEvents()`, `withTimeout()`, `EVENT_TIMEOUT_MS`, existing MCP `OCMM_CODEMODE_PROBE_EVENTS` rows, wrapper ownership ledger, `waitForExit()`, `runCommand()`, and `testPidAlive(pid: number): boolean`.
- Produces: optional wrapper CLI segment `--events <events-file>`; wrapper rows `{ event: "started" }` and `{ event: "native-exited" }`; tests with no `waitForFile()` or `waitForProcessExit()`.

- [ ] **Step 1: Rewrite the fixture integration tests to require lifecycle events before changing the wrapper**

For each MCP fixture test, create the subscription before `spawn()`, register `started` and `stopped` waiters before writing stdin or the stop file, and close the subscription in `finally`.

Replace `MCP fixture serves deterministic newline JSON-RPC probes without marker leakage` with this complete event-synchronized form:

```ts
test("MCP fixture serves deterministic newline JSON-RPC probes without marker leakage", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-"))
  const eventsPath = join(root, "events.jsonl")
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "fixture.jsonl")
  mkdirSync(pidDirectory)
  const events = subscribeToCompletionEvents(eventsPath)
  let child: ReturnType<typeof spawn> | null = null
  let completion: ReturnType<typeof waitForExit> | null = null
  try {
    const started = events.waitFor("started")
    const stopped = events.waitFor("stopped")
    child = spawn(process.execPath, [MCP_FIXTURE], {
      env: {
        ...process.env,
        OCMM_CODEMODE_PROBE_EVENTS: eventsPath,
        OCMM_CODEMODE_PROBE_PID_FILE: pidPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    completion = waitForExit(child)
    await withTimeout(started, EVENT_TIMEOUT_MS, "MCP fixture did not publish started")

    const fixedMarker = "OCMM_CODEMODE_EXECUTE_PROBE"
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" },
    })}\n`)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`)
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "identity", arguments: { marker: fixedMarker } },
    })}\n`)
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "json_error", arguments: {} },
    })}\n`)
    child.stdin.end()

    const [completed] = await withTimeout(
      Promise.all([completion, stopped]),
      EVENT_TIMEOUT_MS,
      "MCP fixture did not publish stopped and exit",
    )
    const { code, stdout, stderr } = completed
    assert.equal(code, 0, stderr)
    const responses = stdout.trim().split("\n").map((line) => JSON.parse(line)) as Array<{
      id: number
      result?: { tools?: Array<{ name: string }>; content?: Array<{ text: string }> }
    }>
    assert.deepEqual(responses.find((response) => response.id === 2)?.result?.tools?.map((tool) => tool.name), [
      "identity", "json_error", "denied",
    ])
    assert.match(responses.find((response) => response.id === 3)?.result?.content?.[0]?.text ?? "", new RegExp(fixedMarker))
    assert.match(
      responses.find((response) => response.id === 4)?.result?.content?.[0]?.text ?? "",
      /OCMM_CODEMODE_HOOK_SENTINEL/,
    )

    const pidRows = parseJsonLines(pidPath) as Array<{ fixturePid: unknown }>
    assert.equal(pidRows.length, 1)
    assert.equal(typeof pidRows[0]?.fixturePid, "number")
    assert.ok(Number.isInteger(pidRows[0]?.fixturePid))

    const eventText = readFileSync(eventsPath, "utf8")
    assert.doesNotMatch(eventText, new RegExp(fixedMarker))
    assert.deepEqual((parseJsonLines(eventsPath) as Array<{ event: string }>).map((row) => row.event), [
      "started", "tools/list", "tools/call:identity", "tools/call:json_error", "stopped",
    ])
  } finally {
    events.close()
    if (child?.exitCode === null) {
      child.stdin.end()
      child.kill("SIGTERM")
      if (completion) await completion.catch(() => undefined)
    }
    rmSync(root, { recursive: true, force: true })
    assert.equal(existsSync(root), false)
  }
})
```

Replace `MCP identity rejects wrong or missing markers without emitting the success marker` with this complete event-synchronized form:

```ts
test("MCP identity rejects wrong or missing markers without emitting the success marker", async () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-codemode-mcp-invalid-"))
  const eventsPath = join(root, "events.jsonl")
  const pidDirectory = join(root, "pid")
  const pidPath = join(pidDirectory, "fixture.jsonl")
  mkdirSync(pidDirectory)
  const events = subscribeToCompletionEvents(eventsPath)
  let child: ReturnType<typeof spawn> | null = null
  let completion: ReturnType<typeof waitForExit> | null = null
  try {
    const started = events.waitFor("started")
    const stopped = events.waitFor("stopped")
    child = spawn(process.execPath, [MCP_FIXTURE], {
      env: {
        ...process.env,
        OCMM_CODEMODE_PROBE_EVENTS: eventsPath,
        OCMM_CODEMODE_PROBE_PID_FILE: pidPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    completion = waitForExit(child)
    await withTimeout(started, EVENT_TIMEOUT_MS, "MCP fixture did not publish started")
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "identity", arguments: { marker: "wrong" } },
    })}\n`)
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "identity", arguments: {} },
    })}\n`)
    child.stdin.end()
    const [completed] = await withTimeout(
      Promise.all([completion, stopped]),
      EVENT_TIMEOUT_MS,
      "invalid-marker MCP fixture did not publish stopped and exit",
    )
    assert.equal(completed.code, 0, completed.stderr)
    assert.doesNotMatch(completed.stdout, /OCMM_CODEMODE_EXECUTE_PROBE/)
    const responses = completed.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line)) as Array<{
      id: number
      error?: { code: number; message: string }
    }>
    assert.deepEqual(responses.map((response) => response.error?.code), [-32602, -32602])
    assert.doesNotMatch(readFileSync(eventsPath, "utf8"), /wrong|OCMM_CODEMODE_EXECUTE_PROBE/)
  } finally {
    events.close()
    if (child?.exitCode === null) {
      child.stdin.end()
      child.kill("SIGTERM")
      if (completion) await completion.catch(() => undefined)
    }
    rmSync(root, { recursive: true, force: true })
  }
})
```

Replace the current `waitForFile(pidPath)` and stop race in `MCP fixture exits on its attempt-local stop signal` with:

```ts
const events = subscribeToCompletionEvents(eventsPath)
const started = events.waitFor("started")
const stopped = events.waitFor("stopped")
const child = spawn(process.execPath, [MCP_FIXTURE], {
  env: {
    ...process.env,
    OCMM_CODEMODE_PROBE_EVENTS: eventsPath,
    OCMM_CODEMODE_PROBE_PID_FILE: pidPath,
    OCMM_CODEMODE_STOP_PATH: stopPath,
  },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
})
const completion = waitForExit(child)
try {
  await withTimeout(started, EVENT_TIMEOUT_MS, "MCP fixture did not publish started")
  const pidRows = parseJsonLines(pidPath) as Array<{ fixturePid: number }>
  assert.equal(pidRows.length, 1)
  assert.equal(testPidAlive(pidRows[0]!.fixturePid), true)
  writeFileSync(stopPath, "stop\n")
  const [completed] = await withTimeout(
    Promise.all([completion, stopped]),
    1500,
    "MCP fixture ignored stop signal or omitted stopped",
  )
  assert.equal(completed.code, 0, completed.stderr)
  assert.equal(testPidAlive(pidRows[0]!.fixturePid), false)
} finally {
  events.close()
  if (child.exitCode === null) {
    child.stdin.end()
    await completion.catch(() => undefined)
  }
  rmSync(root, { recursive: true, force: true })
}
```

For `process wrapper records real native child exit and leaves no survivor`, subscribe before spawn and provide the wrapper event path:

```ts
const eventsPath = join(root, "events.jsonl")
const events = subscribeToCompletionEvents(eventsPath)
let child: ReturnType<typeof spawn> | null = null
let completion: ReturnType<typeof waitForExit> | null = null
try {
  const started = events.waitFor("started")
  const nativeExited = events.waitFor("native-exited")
  child = spawn(process.execPath, [
    PROCESS_WRAPPER_FIXTURE,
    pidPath,
    "--events",
    eventsPath,
    process.execPath,
    "-e",
    "setTimeout(() => process.exit(0), 25)",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  completion = waitForExit(child)
  await withTimeout(started, EVENT_TIMEOUT_MS, "process wrapper did not publish started")
  const [completed] = await withTimeout(
    Promise.all([completion, nativeExited]),
    EVENT_TIMEOUT_MS,
    "process wrapper omitted native-exited",
  )
  assert.equal(completed.code, 0, completed.stderr)
  const pidRows = parseJsonLines(pidPath) as Array<{ wrapperPid: unknown; nativePid: unknown }>
  assert.equal(pidRows.length, 1)
  assert.equal(typeof pidRows[0]?.wrapperPid, "number")
  assert.ok(Number.isInteger(pidRows[0]?.wrapperPid))
  assert.equal(typeof pidRows[0]?.nativePid, "number")
  assert.ok(Number.isInteger(pidRows[0]?.nativePid))
  assert.equal(testPidAlive(pidRows[0]!.nativePid as number), false)
  assert.equal(testPidAlive(pidRows[0]!.wrapperPid as number), false)
} finally {
  events.close()
  if (child?.exitCode === null) {
    child.kill("SIGTERM")
    if (completion) await completion.catch(() => undefined)
  }
  rmSync(root, { recursive: true, force: true })
  assert.equal(existsSync(root), false)
}
```

For `process wrapper stop signal terminates and reaps its owned native child`, subscribe before spawn, await `started` before reading `pidPath`, retain the live-before-stop assertion, then replace the stop race and native polling with:

```ts
const eventsPath = join(root, "events.jsonl")
const events = subscribeToCompletionEvents(eventsPath)
const started = events.waitFor("started")
const nativeExited = events.waitFor("native-exited")
child = spawn(process.execPath, [
  PROCESS_WRAPPER_FIXTURE,
  pidPath,
  "--events",
  eventsPath,
  process.execPath,
  "-e",
  "setInterval(() => {}, 1000)",
], {
  env: {
    ...process.env,
    OCMM_CODEMODE_STOP_PATH: stopPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
})
completion = waitForExit(child)
try {
  await withTimeout(started, EVENT_TIMEOUT_MS, "process wrapper did not publish started")
  const recorded = parseJsonLines(pidPath)[0] as { wrapperPid: number; nativePid: number }
  nativePid = recorded.nativePid
  assert.equal(testPidAlive(nativePid), true)
  writeFileSync(stopPath, "stop\n")
  const [completed] = await withTimeout(
    Promise.all([completion, nativeExited]),
    1500,
    "wrapper ignored stop signal or omitted native-exited",
  )
  assert.equal(completed.code, 0, completed.stderr)
  assert.equal(testPidAlive(recorded.nativePid), false)
  assert.equal(testPidAlive(recorded.wrapperPid), false)
} finally {
  events.close()
  if (child && child.exitCode === null) {
    child.kill("SIGTERM")
    if (completion) await completion.catch(() => undefined)
  }
  rmSync(root, { recursive: true, force: true })
}
```

For `timeout kills a long-lived wrapper child and cleanup removes the real directory`, create `eventsPath` and the subscription before calling `runCommand()`, pass the explicit fixture-only `--events` segment, and replace both PID polling calls with event completion plus adjacent assertions:

```ts
const eventsPath = join(pidDir, "events.jsonl")
const events = subscribeToCompletionEvents(eventsPath)
const startedEvent = events.waitFor("started")
const nativeExitedEvent = events.waitFor("native-exited")
try {
  const completed = await runCommand(
    process.execPath,
    [wrapper, pidFile, "--events", eventsPath, process.execPath, "-e", "setInterval(() => {}, 1000)"],
    {
      cwd: root,
      env: {
        ...process.env,
        OCMM_CODEMODE_STOP_PATH: join(pidDir, "stop"),
      },
      timeoutMs: 1000,
    },
  )
  await withTimeout(
    Promise.all([startedEvent, nativeExitedEvent]),
    EVENT_TIMEOUT_MS,
    "timed-out wrapper omitted lifecycle completion",
  )
  assert.equal(completed.timedOut, true)
  assert.equal(existsSync(pidFile), true)
  const recorded = JSON.parse(readFileSync(pidFile, "utf8")) as { wrapperPid: number; nativePid: number }
  assert.ok(Number.isInteger(recorded.wrapperPid))
  assert.ok(Number.isInteger(recorded.nativePid))
  observedPids = [recorded.wrapperPid, recorded.nativePid, completed.pid].filter((value): value is number =>
    typeof value === "number" && value > 0)
  assert.equal(testPidAlive(recorded.wrapperPid), false)
  assert.equal(testPidAlive(recorded.nativePid), false)

} finally {
  events.close()
  rmSync(parentRoot, { recursive: true, force: true })
}
```

Leave the existing `nonPassingBaseline()`, `AttemptRecord`, `cleanupRunTopology()`, cleanup aggregate/root assertions, and final `observedPids` liveness loop immediately after the two new PID assertions. Their inputs and expected values do not change; only the two pre-cleanup polling awaits are removed.

Finally delete these obsolete private helpers from the top of the test file:

```ts
function processExists(pid: number): boolean
async function waitForProcessExit(pid: number): Promise<void>
async function waitForFile(path: string): Promise<void>
```

Do not delete `waitForExit()` or `testPidAlive()`.

- [ ] **Step 2: Run the event-dependent fixture tests and verify RED**

```powershell
node --test --experimental-strip-types --test-reporter=spec `
  --test-name-pattern='MCP fixture serves|MCP identity rejects|MCP fixture exits|process wrapper records real native child exit|process wrapper stop signal|timeout kills a long-lived wrapper child' `
  scripts/codemode-execute-compatibility.test.ts
```

Expected: exit nonzero. The MCP tests can pass because `codemode-execute-probe-mcp.mjs` already emits `started`/`stopped`. The selected wrapper tests fail with one of the named `started` or `native-exited` timeout messages because the wrapper has not yet parsed `--events` or emitted lifecycle rows.

- [ ] **Step 3: Add minimal lifecycle emission to the process wrapper**

Replace `scripts/fixtures/codemode-execute-process-wrapper.mjs` with this complete behavior-preserving version:

```js
import { spawn } from "node:child_process"
import { appendFileSync, existsSync } from "node:fs"

const argv = process.argv.slice(2)
const pidFile = argv.shift()
let completionEventsPath
if (argv[0] === "--events") {
  argv.shift()
  completionEventsPath = argv.shift()
}
const command = argv.shift()
const args = argv
if (!pidFile || !command) {
  process.stderr.write("usage: node codemode-execute-process-wrapper.mjs <pid-file> [--events <events-file>] <command> [args...]\n")
  process.exit(64)
}

const child = spawn(command, args, { stdio: "inherit", windowsHide: true })

let stopping = false
let requestedStop = false
let ownershipWriteFailed = false
let completionWriteFailed = false
let forceTimer
let stopTimer
const stopPath = process.env.OCMM_CODEMODE_STOP_PATH

function event(name) {
  if (!completionEventsPath) return true
  try {
    appendFileSync(completionEventsPath, `${JSON.stringify({ event: name })}\n`)
    return true
  } catch (error) {
    completionWriteFailed = true
    process.stderr.write(`failed to record process completion: ${error instanceof Error ? error.message : String(error)}\n`)
    return false
  }
}

function stop(signal, requested = true) {
  if (stopping) return
  stopping = true
  requestedStop = requested
  if (stopTimer) clearInterval(stopTimer)
  if (child.exitCode === null) {
    try { child.kill(signal) } catch { /* child already exited */ }
    forceTimer = setTimeout(() => {
      if (child.exitCode === null) {
        try { child.kill("SIGKILL") } catch { /* child already exited */ }
      }
    }, 750)
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal, true))
}
process.on("exit", () => {
  if (child.exitCode === null) {
    try { child.kill("SIGTERM") } catch { /* child already exited */ }
  }
})

child.once("error", (error) => {
  if (stopTimer) clearInterval(stopTimer)
  if (forceTimer) clearTimeout(forceTimer)
  stopping = true
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.once("exit", (code, signal) => {
  if (stopTimer) clearInterval(stopTimer)
  if (forceTimer) clearTimeout(forceTimer)
  stopping = true
  event("native-exited")
  process.exitCode = ownershipWriteFailed || completionWriteFailed
    ? 1
    : requestedStop
      ? 0
      : typeof code === "number"
        ? code
        : signal
          ? 1
          : 0
})

try {
  appendFileSync(pidFile, `${JSON.stringify({ wrapperPid: process.pid, nativePid: child.pid ?? null })}\n`)
} catch (error) {
  ownershipWriteFailed = true
  process.stderr.write(`failed to record process ownership: ${error instanceof Error ? error.message : String(error)}\n`)
  stop("SIGTERM", false)
}

if (!ownershipWriteFailed && !event("started")) stop("SIGTERM", false)

if (!stopping && stopPath) {
  stopTimer = setInterval(() => {
    if (existsSync(stopPath)) stop("SIGTERM", true)
  }, 25)
}
```

The 750 ms force timer, signal handlers, stop-file watchdog, requested-stop exit semantics, ownership-failure behavior, and native-child ownership boundary must remain exactly represented. `started` follows a successful ownership append; `native-exited` comes only from the native child `exit` callback.

- [ ] **Step 4: Run the event-dependent fixture tests and verify GREEN**

```powershell
node --test --experimental-strip-types --test-reporter=spec `
  --test-name-pattern='MCP fixture serves|MCP identity rejects|MCP fixture exits|process wrapper records real native child exit|process wrapper stop signal|timeout kills a long-lived wrapper child' `
  scripts/codemode-execute-compatibility.test.ts
```

Expected: exit `0`; every selected MCP and wrapper lifecycle test passes. Stop tests still use a 1500 ms circuit breaker, and every native/wrapper PID is asserted absent directly after event/close completion.

- [ ] **Step 5: Prove polling removal and protected-boundary preservation**

```powershell
rg -n 'waitForFile|waitForProcessExit|function processExists' scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -eq 0) { throw "obsolete readiness polling remains" }
if ($LASTEXITCODE -ne 1) { throw "polling-removal search failed" }

rg -n -- '--events|event\("started"\)|event\("native-exited"\)' `
  scripts/codemode-execute-compatibility.test.ts `
  scripts/fixtures/codemode-execute-process-wrapper.mjs
if ($LASTEXITCODE -ne 0) { throw "wrapper lifecycle contract missing" }

rg -n 'setTimeout\(resolveDelay, 300\)|}, 2500\)|reapTimeoutMs = 5000|await sleep\(25\)' `
  scripts/codemode-execute-compatibility.ts
if ($LASTEXITCODE -ne 0) { throw "runner timeout or reap circuit breaker changed" }

rg -n '}, 750\)|setInterval\(\(\) =>|}, 25\)' `
  scripts/fixtures/codemode-execute-process-wrapper.mjs `
  scripts/fixtures/codemode-execute-probe-mcp.mjs
if ($LASTEXITCODE -ne 0) { throw "fixture stop watchdog or force timer changed" }

rg -n 'elapsed >= 1000|elapsed >= 2100|1600 - \(Date\.now\(\) - started\)|3000 - \(Date\.now\(\) - started\)' `
  scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "real elapsed-time assertions changed" }
```

Expected: the first search returns no matches and is normalized to success by the PowerShell checks. All three preservation searches find the protected runner/fixture/elapsed-time guards.

- [ ] **Step 6: Verify the MCP producer and compatibility runner have no diff**

```powershell
git diff --exit-code -- `
  scripts/fixtures/codemode-execute-probe-mcp.mjs `
  scripts/codemode-execute-compatibility.ts
```

Expected: exit `0` and no output. If either file differs, revert the task-owned accidental edit without touching unrelated user work; the selected design does not require those files to change.

**Suggested commit message (do not execute in this task):** `test: replace codemode readiness polling with lifecycle events`

### Task 3: Run full verification and inspect the final surface

**Files:**
- Verify: `scripts/codemode-execute-compatibility.test.ts`
- Verify: `scripts/fixtures/codemode-execute-process-wrapper.mjs`
- Verify unchanged: `scripts/fixtures/codemode-execute-probe-mcp.mjs`
- Verify unchanged: `scripts/codemode-execute-compatibility.ts`
- Review: `docs/superpowers/specs/2026-07-31-event-driven-codemode-qa-design.md`
- Review: `docs/superpowers/plans/2026-07-31-event-driven-codemode-qa.md`

**Interfaces:**
- Consumes: completed Tasks 1-2, repository scripts in `package.json`, `lsp_diagnostics` when available, installed `typescript`, `node --check`, and Git read-only inspection.
- Produces: zero-failure targeted/full test receipts, successful typecheck/build, zero changed-file diagnostics, two successful `.mjs` syntax checks, clean whitespace, and an allowlisted final diff.

- [ ] **Step 1: Run repository typecheck**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm run typecheck
```

Expected: exit `0` and no TypeScript errors. This gate validates repository product sources even though the script test lies outside `tsconfig.json`'s include set.

- [ ] **Step 2: Run the complete targeted compatibility test**

```powershell
node --test --experimental-strip-types --test-reporter=spec scripts/codemode-execute-compatibility.test.ts
```

Expected: exit `0`; all compatibility subtests pass with zero failures. No provider/model is invoked by this test file.

- [ ] **Step 3: Run the full Node and Cargo test suites**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm test
```

Expected: exit `0`; the Node test summary and `cargo test -p ocmm-lsp` report zero failures. This does not replace Step 2 because `package.json` excludes `scripts/**/*.test.ts` from `test:ts`.

- [ ] **Step 4: Run the full build**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm run build
```

Expected: exit `0`; TypeScript build and release-mode native LSP build both complete. If an existing user process locks an artifact, do not terminate it; report the build gate as blocked instead of claiming success.

- [ ] **Step 5: Run diagnostics for the changed TypeScript file**

First invoke `lsp_diagnostics` with `severity: "all"` for:

```text
scripts/codemode-execute-compatibility.test.ts
```

Expected: no diagnostics. If the environment reports that `typescript-language-server` is unavailable, do not install it. Run this exact fallback with the repository's installed TypeScript Compiler API:

```powershell
@'
import path from "node:path"
import ts from "typescript"

const files = ["scripts/codemode-execute-compatibility.test.ts"].map((file) => path.resolve(file))
const targets = new Set(files.map((file) => file.toLowerCase()))
const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json")
if (!configPath) throw new Error("tsconfig.json not found")
const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"))
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), undefined, configPath)
if (parsed.errors.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }))
}
const program = ts.createProgram({
  rootNames: files,
  options: {
    ...parsed.options,
    rootDir: undefined,
    outDir: undefined,
    declaration: false,
    declarationMap: false,
    noEmit: true,
  },
})
const missing = files.filter((file) => program.getSourceFile(file) === undefined)
if (missing.length) throw new Error(`diagnostic targets missing from compiler program: ${missing.join(", ")}`)
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
  diagnostic.file === undefined || targets.has(path.resolve(diagnostic.file.fileName).toLowerCase()))
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }))
  process.exit(1)
}
process.stdout.write("changed-file compiler diagnostics: 0\n")
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw "changed-file compiler diagnostics failed" }
```

Expected fallback: exit `0` and print `changed-file compiler diagnostics: 0`. `rootDir`/emit paths are removed because this target intentionally lives outside `src/`; all other strict repository compiler options remain.

- [ ] **Step 6: Syntax-check both relevant ESM fixtures**

```powershell
node --check scripts/fixtures/codemode-execute-process-wrapper.mjs
if ($LASTEXITCODE -ne 0) { throw "process wrapper syntax check failed" }
node --check scripts/fixtures/codemode-execute-probe-mcp.mjs
if ($LASTEXITCODE -ne 0) { throw "probe MCP syntax check failed" }
```

Expected: both commands exit `0` with no syntax diagnostics.

- [ ] **Step 7: Run whitespace, scope, and protected-surface checks**

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff whitespace check failed" }

$allowed = @(
  "docs/superpowers/specs/2026-07-31-event-driven-codemode-qa-design.md",
  "docs/superpowers/plans/2026-07-31-event-driven-codemode-qa.md",
  "scripts/codemode-execute-compatibility.test.ts",
  "scripts/fixtures/codemode-execute-process-wrapper.mjs"
)
$changed = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object {
  $_.Substring(3).Replace("\", "/")
})
$unexpected = @($changed | Where-Object { $_ -notin $allowed })
if ($unexpected.Count -gt 0) { throw "unexpected changed paths: $($unexpected -join ', ')" }

git diff --stat
git diff -- scripts/codemode-execute-compatibility.test.ts scripts/fixtures/codemode-execute-process-wrapper.mjs
git status --short
```

Expected: `git diff --check` exits `0`; changed/untracked paths are a subset of the four-path allowlist; the implementation diff contains only the test subscriber/synchronization and wrapper lifecycle producer; no staged content or protected product/config/release/prompt/skill/generated/manifest/lockfile change appears.

- [ ] **Step 8: Perform real-surface lifecycle QA from the targeted tests' evidence**

Review the targeted test output and require all of these observable claims:

1. subscriber tests pass for pre-existing rows, file creation, partial lines, duplicate events, truncation, malformed or empty rows, and close cleanup;
2. MCP integration observes `started` before input/stop and `stopped` before successful exit;
3. process-wrapper integration observes `started` after ledger creation and `native-exited` for natural, cooperative-stop, and timeout paths;
4. every recorded native/wrapper PID is immediately absent after event/close completion and again absent after topology cleanup where applicable;
5. stop/watchdog, force timer, reap timeout, close fallback, and real elapsed-time tests still pass.

Expected: all five claims are backed by passing named tests or the preservation searches in Task 2; no manual provider/model or user-process action is required.

No commit command belongs to this plan. If the caller later authorizes a repository write, the suggested feature-level message is `test: make codemode fixture completion event driven`.

## Requirement Coverage

| Requirement | Plan coverage |
|---|---|
| Replace `waitForFile` and `waitForProcessExit` polling | Task 2 Steps 1 and 5, with all six current call sites mapped to lifecycle/close completion. |
| Append-only, cross-platform, no new dependency | Task 1 Step 3 and Global Constraints. |
| True notifications rather than renamed polling | Parent-directory `watch`, notification-only drains, and forbidden-polling inspection in Task 1 Step 5. |
| Pre-existing events, partial rows, duplicates, cleanup, Windows semantics | Task 1 contract tests and implementation invariants. |
| MCP `started`/`stopped` | Task 2 Step 1; producer verified unchanged in Step 6. |
| Wrapper `native-exited` | Task 2 Steps 2-4. |
| Subscribe before action and timeout fail closed | Task 2 Step 1 plus `withTimeout()` from Task 1. |
| Preserve timeout/circuit-breaker boundaries | Global Constraints and Task 2 Step 5 searches. |
| Keep final PID absence assertions | Every wrapper/MCP stop code block in Task 2 and Task 3 real-surface review. |
| No unrelated runtime/config/release/prompt/skill work | File map, Task 2 Step 6, and Task 3 Step 7 allowlist. |
| Typecheck, targeted test, full test, build | Task 3 Steps 1-4 in the required order. |
| Changed-file diagnostics and `.mjs` checks | Task 3 Steps 5-6. |
| Git diff check without Git writes | Task 3 Step 7 and Global Constraints. |

## Plan Self-Review

- **Spec coverage:** Every acceptance criterion in the design maps to a named task/step in the table above.
- **Placeholder scan:** Every file, symbol, event, environment variable, command, expected RED/GREEN result, diagnostic fallback, and scope gate is explicit.
- **Interface consistency:** `CompletionEventSubscription`, `subscribeToCompletionEvents()`, `withTimeout()`, `EVENT_TIMEOUT_MS`, and the optional `--events <events-file>` wrapper segment retain the same names and semantics across all tasks.
- **TDD ordering:** Task 1 fails on the deliberate subscriber stub before implementation. Task 2 requires wrapper events before adding the producer, then reruns the identical selection GREEN.
- **Scope consistency:** Only the TypeScript test and process-wrapper fixture are implementation files. The MCP fixture and compatibility runner are unchanged verification boundaries.
- **Safety consistency:** Completion events synchronize tests but never prove OS process absence; direct PID assertions remain adjacent to event/close completion.
- **Command consistency:** All shell snippets use PowerShell syntax, install nothing, and perform no Git write.
- **Ambiguity:** The plan fixes event ordering, duplicate semantics, partial-line behavior, notification strategy, timeout ownership, final PID authority, and every preserved timing boundary.

## Review Receipt

**Status:** `waiting for receipt`.

This planner session is not authorized to dispatch `plan-critic`, Reviewer, or Oracle profiles. The orchestrator owns any current-revision plan-critic receipt and later implementation acceptance reviews. The plan is self-reviewed and decision-complete; any later plan edit invalidates an external receipt for an earlier revision.
