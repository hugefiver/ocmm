# Idle Auto-Continuation Engine Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a TUI session goes idle but the todo list still has unfinished items, automatically re-prompt the model to continue. Detect ESC aborts via `session.error` and never continue after them. Toggle via config (`idleContinuation.enabled`) or slash command (`/idle-continuation on|off|status`).

**Architecture:** A plugin-level mutable `IdleContinuationState` object (closure in `createPlugin`) is shared between a new `command.execute` hook (slash command toggle) and the `event` hook (continuation logic). On `session.error` with an abort error, mark the session aborted. On `session.idle`, if not aborted + enabled + below max + has unfinished todos, call `client.session.prompt` with a continuation message.

**Tech Stack:** TypeScript (Node 22+, `node --test --experimental-strip-types`), Zod schema, OpenCode plugin hooks (`command.execute`, `event`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/runtime-fallback/idle-state.ts` (new) | `IdleContinuationState` type + `createIdleContinuationState()` factory + `isIdleContinuationEnabled()` helper + `DEFAULT_CONTINUATION_PROMPT` |
| `src/runtime-fallback/todo-reader.ts` (new) | `hasUnfinishedTodos(client, sessionID)` — defensive parse of `session.messages` for `todowrite` tool calls |
| `src/hooks/command-execute.ts` (new) | `createCommandExecuteHandler(deps)` — handles `/idle-continuation on\|off\|status` |
| `src/hooks/command-execute.test.ts` (new) | Tests for on/off/status toggle |
| `src/config/schema.ts` (modify) | Add `IdleContinuationConfigSchema` + `defaultIdleContinuationConfig()` + mount on `OcmmConfigSchema` + `ProfileEntrySchema` + type export |
| `src/runtime-fallback/event-handler.ts` (modify) | `RuntimeFallbackDeps` gets `idleState?`; abort marks `idleState.sessionData.aborted`; `session.idle` gets continuation logic |
| `src/runtime-fallback/event-handler.test.ts` (modify) | New tests: aborted skip, disabled skip, max reached skip, unfinished todos trigger continuation, finished todos skip |
| `src/hooks/event.ts` (modify) | Pass `idleState` through to `createRuntimeFallbackEventHandler` |
| `src/index.ts` (modify) | `PluginInterface` gains `command.execute?`; `createPlugin` creates shared `idleState`; wire both hooks |
| `src/commands/builtin.ts` (modify) | Register `/idle-continuation` command entry; remove "not migrated" claims from ralph-loop/audit-loop templates |
| `README.md` (modify) | Update event hook description + add command.execute hook row |

---

## Task 1: Config Schema

**Files:**
- Modify: `src/config/schema.ts`

- [ ] **Step 1: Add `defaultIdleContinuationConfig()` factory after `defaultRuntimeFallbackConfig()` (after L107)**

```typescript
export function defaultIdleContinuationConfig() {
  return {
    enabled: false,
    maxContinuations: 20,
  }
}
```

- [ ] **Step 2: Add `IdleContinuationConfigSchema` after `RuntimeFallbackConfigSchema` (after L204)**

```typescript
export const IdleContinuationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxContinuations: z.number().int().min(0).max(100).default(20),
    prompt: z.string().optional(),
  })
  .default(defaultIdleContinuationConfig)
```

- [ ] **Step 3: Mount `idleContinuation` on `OcmmConfigSchema` after `runtimeFallback` (after L371)**

```typescript
    idleContinuation: IdleContinuationConfigSchema,
```

- [ ] **Step 4: Add `idleContinuation` partial form to `ProfileEntrySchema` (after the `runtimeFallback` partial, ~L325)**

```typescript
    idleContinuation: z
      .object({
        enabled: z.boolean().optional(),
        maxContinuations: z.number().int().min(0).max(100).optional(),
        prompt: z.string().optional(),
      })
      .optional(),
```

- [ ] **Step 5: Add type export (after `RuntimeFallbackConfig` export, ~L398)**

```typescript
export type IdleContinuationConfig = z.infer<typeof IdleContinuationConfigSchema>
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 7: Run existing tests to verify no regression**

Run: `pnpm test`
Expected: PASS (313 TS + 9 Rust, 0 failed)

---

## Task 2: IdleContinuationState Type and Factory

**Files:**
- Create: `src/runtime-fallback/idle-state.ts`
- Test: `src/runtime-fallback/idle-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { createIdleContinuationState, isIdleContinuationEnabled, DEFAULT_CONTINUATION_PROMPT } from "./idle-state.ts"

test("createIdleContinuationState starts with empty maps and globalEnabled false", () => {
  const s = createIdleContinuationState()
  assert.equal(s.globalEnabled, false)
  assert.equal(s.sessionOverrides.size, 0)
  assert.equal(s.sessionData.size, 0)
})

test("isIdleContinuationEnabled returns global when no override", () => {
  const s = createIdleContinuationState()
  s.globalEnabled = true
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), true)
  s.globalEnabled = false
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), false)
})

test("isIdleContinuationEnabled session override wins over global", () => {
  const s = createIdleContinuationState()
  s.globalEnabled = true
  s.sessionOverrides.set("ses_1", false)
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), false)
  s.sessionOverrides.set("ses_1", true)
  assert.equal(isIdleContinuationEnabled(s, "ses_1"), true)
})

test("DEFAULT_CONTINUATION_PROMPT is non-empty string", () => {
  assert.equal(typeof DEFAULT_CONTINUATION_PROMPT, "string")
  assert.ok(DEFAULT_CONTINUATION_PROMPT.length > 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts`
Expected: FAIL with "Cannot find module './idle-state.ts'"

- [ ] **Step 3: Write the implementation**

```typescript
export type IdleSessionData = {
  aborted: boolean
  continuationCount: number
}

export type IdleContinuationState = {
  globalEnabled: boolean
  sessionOverrides: Map<string, boolean>
  sessionData: Map<string, IdleSessionData>
}

export function createIdleContinuationState(): IdleContinuationState {
  return {
    globalEnabled: false,
    sessionOverrides: new Map(),
    sessionData: new Map(),
  }
}

export function isIdleContinuationEnabled(state: IdleContinuationState, sessionID: string): boolean {
  const override = state.sessionOverrides.get(sessionID)
  if (override !== undefined) return override
  return state.globalEnabled
}

export function getSessionData(state: IdleContinuationState, sessionID: string): IdleSessionData {
  let data = state.sessionData.get(sessionID)
  if (!data) {
    data = { aborted: false, continuationCount: 0 }
    state.sessionData.set(sessionID, data)
  }
  return data
}

export function markSessionAborted(state: IdleContinuationState, sessionID: string): void {
  const data = getSessionData(state, sessionID)
  data.aborted = true
}

export function clearSession(state: IdleContinuationState, sessionID: string): void {
  state.sessionData.delete(sessionID)
  state.sessionOverrides.delete(sessionID)
}

export const DEFAULT_CONTINUATION_PROMPT =
  "Your todo list has unfinished items. Continue with the next pending or in-progress task. Do not ask for confirmation — proceed."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/runtime-fallback/idle-state.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/runtime-fallback/idle-state.ts src/runtime-fallback/idle-state.test.ts src/config/schema.ts
git commit -m "feat(idle-continuation): add config schema and idle state type"
```

---

## Task 3: Todo Reader (hasUnfinishedTodos)

**Files:**
- Create: `src/runtime-fallback/todo-reader.ts`
- Test: `src/runtime-fallback/todo-reader.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test"
import assert from "node:assert/strict"
import { hasUnfinishedTodos } from "./todo-reader.ts"
import type { OcmmClient } from "./dispatcher.ts"

function makeClient(messagesResp: unknown): { client: OcmmClient; calls: number } {
  let calls = 0
  const client = {
    session: {
      abort: async () => {},
      messages: async () => {
        calls++
        return messagesResp
      },
      prompt: async () => {},
    },
  } as unknown as OcmmClient
  return { client, calls }
}

test("returns false when no todowrite tool calls exist", async () => {
  const { client } = makeClient({ data: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("returns true when todowrite result has pending items", async () => {
  const { client } = makeClient({
    data: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "todowrite",
            state: { todos: [{ content: "task", status: "pending" }, { content: "done", status: "completed" }] },
          },
        ],
      },
    ],
  })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, true)
})

test("returns false when all todos are completed", async () => {
  const { client } = makeClient({
    data: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "todowrite",
            state: { todos: [{ content: "done", status: "completed" }] },
          },
        ],
      },
    ],
  })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("returns true when todos have in_progress status", async () => {
  const { client } = makeClient({
    data: [
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "todowrite",
            state: { todos: [{ content: "wip", status: "in_progress" }] },
          },
        ],
      },
    ],
  })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, true)
})

test("returns false on parse error (defensive)", async () => {
  const { client } = makeClient({ broken: true })
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})

test("scans messages from the end, stops at first todowrite call", async () => {
  const messagesResp = {
    data: [
      {
        role: "assistant",
        parts: [{ type: "tool", tool: "todowrite", state: { todos: [{ content: "old", status: "pending" }] } }],
      },
      {
        role: "assistant",
        parts: [{ type: "tool", tool: "todowrite", state: { todos: [{ content: "new", status: "completed" }] } }],
      },
    ],
  }
  const { client } = makeClient(messagesResp)
  const result = await hasUnfinishedTodos(client, "ses_1")
  assert.equal(result, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/runtime-fallback/todo-reader.test.ts`
Expected: FAIL with "Cannot find module './todo-reader.ts'"

- [ ] **Step 3: Write the implementation**

```typescript
import type { OcmmClient } from "./dispatcher.ts"

const UNFINISHED_STATUSES = new Set(["pending", "in_progress"])

type TodoItem = { status?: string }

function extractTodosFromPart(part: unknown): TodoItem[] | null {
  if (typeof part !== "object" || part === null) return null
  const p = part as Record<string, unknown>
  // Check if this is a todowrite tool call/result
  const tool = p.tool ?? p.name
  if (tool !== "todowrite") return null
  // State may be under .state.todos or .output.todos or .result.todos
  const state = p.state ?? p.output ?? p.result
  if (typeof state !== "object" || state === null) return null
  const todos = (state as Record<string, unknown>).todos
  if (!Array.isArray(todos)) return null
  return todos as TodoItem[]
}

export async function hasUnfinishedTodos(client: OcmmClient, sessionID: string): Promise<boolean> {
  try {
    const resp = await client.session.messages({ path: { id: sessionID } })
    const data = (resp as Record<string, unknown>).data ?? resp
    if (!Array.isArray(data)) return false
    // Scan from the end — find the last todowrite call
    for (let i = data.length - 1; i >= 0; i--) {
      const msg = data[i]
      if (typeof msg !== "object" || msg === null) continue
      const parts = (msg as Record<string, unknown>).parts ?? (msg as Record<string, unknown>).content
      if (!Array.isArray(parts)) continue
      for (const part of parts) {
        const todos = extractTodosFromPart(part)
        if (todos !== null) {
          return todos.some((t) => typeof t.status === "string" && UNFINISHED_STATUSES.has(t.status))
        }
      }
    }
    return false
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/runtime-fallback/todo-reader.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/runtime-fallback/todo-reader.ts src/runtime-fallback/todo-reader.test.ts
git commit -m "feat(idle-continuation): add hasUnfinishedTodos defensive reader"
```

---

## Task 4: command.execute Hook

**Files:**
- Create: `src/hooks/command-execute.ts`
- Test: `src/hooks/command-execute.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/hooks/command-execute.test.ts`
Expected: FAIL with "Cannot find module './command-execute.ts'"

- [ ] **Step 3: Write the implementation**

```typescript
import { isIdleContinuationEnabled, type IdleContinuationState } from "../runtime-fallback/idle-state.ts"

type CommandExecuteInput = {
  command: string
  arguments?: string
  sessionID: string
}

type CommandPart = { type: string; text?: string }

type CommandExecuteOutput = {
  parts: CommandPart[]
}

export type CommandExecuteDeps = {
  idleState: IdleContinuationState
}

export function createCommandExecuteHandler(deps: CommandExecuteDeps) {
  return async (input: CommandExecuteInput, output: CommandExecuteOutput): Promise<void> => {
    if (input.command !== "idle-continuation") return

    const sid = input.sessionID
    const arg = (input.arguments ?? "").trim().toLowerCase() || "status"

    let message: string
    if (arg === "on") {
      deps.idleState.sessionOverrides.set(sid, true)
      message = "Idle auto-continuation enabled for this session."
    } else if (arg === "off") {
      deps.idleState.sessionOverrides.set(sid, false)
      message = "Idle auto-continuation disabled for this session."
    } else if (arg === "status") {
      const enabled = isIdleContinuationEnabled(deps.idleState, sid)
      const source = deps.idleState.sessionOverrides.has(sid) ? "session override" : "global config"
      message = `Idle auto-continuation: ${enabled ? "enabled" : "disabled"} (source: ${source}). Usage: /idle-continuation [on|off|status]`
    } else {
      message = `Unknown argument "${arg}". Usage: /idle-continuation [on|off|status]`
    }

    output.parts.length = 0
    output.parts.push({ type: "text", text: message })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/hooks/command-execute.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/command-execute.ts src/hooks/command-execute.test.ts
git commit -m "feat(idle-continuation): add command.execute hook for /idle-continuation toggle"
```

---

## Task 5: Event Handler — Abort Marking + Idle Continuation

**Files:**
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler.test.ts`

- [ ] **Step 1: Write the failing tests (append to event-handler.test.ts)**

Add these imports at the top (after existing imports):

```typescript
import { createIdleContinuationState } from "./idle-state.ts"
```

Add a `makeIdleEvent` helper near `makeErrorEvent`:

```typescript
function makeIdleEvent(sessionID: string) {
  return { event: { type: "session.idle", properties: { sessionID } } }
}
```

Add tests:

```typescript
test("idle continuation: does not continue when disabled", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = false
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  await handler(makeIdleEvent("ses_1"))
  assert.equal(calls.length, 0)
})

test("idle continuation: does not continue when aborted", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client, idleState })
  // First: abort error marks the session
  await handler(makeErrorEvent("ses_1", { isAbort: true }, { agent: "orchestrator" }))
  // Then: idle should not continue
  await handler(makeIdleEvent("ses_1"))
  assert.equal(calls.length, 0)
})

test("idle continuation: does not continue when no client", async () => {
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  const cfg = makeConfig({ enabled: true })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, idleState })
  await handler(makeIdleEvent("ses_1"))
  // Should not throw
})

test("idle continuation: does not continue when maxContinuations reached", async () => {
  const { client, calls } = makeMockClient()
  const idleState = createIdleContinuationState()
  idleState.globalEnabled = true
  // Pre-set session data with maxed-out count
  idleState.sessionData.set("ses_1", { aborted: false, continuationCount: 5 })
  const cfg = makeConfig({ enabled: true })
  // Override maxContinuations to 5 via direct config
  const cfgWithMax = { ...cfg, idleContinuation: { ...cfg.idleContinuation, enabled: true, maxContinuations: 5 } }
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfgWithMax, client, idleState })
  await handler(makeIdleEvent("ses_1"))
  assert.equal(calls.length, 0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --experimental-strip-types src/runtime-fallback/event-handler.test.ts`
Expected: FAIL — idle continuation tests fail because `idleState` is not a recognized dep and idle has no continuation logic

- [ ] **Step 3: Modify `RuntimeFallbackDeps` to add `idleState?`**

In `src/runtime-fallback/event-handler.ts`, change the `RuntimeFallbackDeps` type (L79-83):

```typescript
export type RuntimeFallbackDeps = {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
}
```

Add import at the top (after line 15, the `clearSessionIntent` import):

```typescript
import {
  createIdleContinuationState,
  isIdleContinuationEnabled,
  markSessionAborted,
  getSessionData,
  clearSession,
  DEFAULT_CONTINUATION_PROMPT,
  type IdleContinuationState,
} from "./idle-state.ts"
import { hasUnfinishedTodos } from "./todo-reader.ts"
```

- [ ] **Step 4: Add abort marking in `session.error` branch**

In the `session.error` handling, after `if (isAbortError(error))` check (L121-125), add abort marking:

```typescript
      if (isAbortError(error)) {
        if (deps.idleState) {
          markSessionAborted(deps.idleState, sessionID)
        }
        log.debug("abort error, skipping fallback", { sessionID })
        return
      }
```

- [ ] **Step 5: Split `session.deleted`/`session.idle` and add continuation logic**

Replace the existing block (L104-110):

```typescript
      if (eventType === "session.deleted" || eventType === "session.idle") {
        clearSessionIntent(sessionID)
        sessionStates.delete(sessionID)
        return
      }
```

With:

```typescript
      if (eventType === "session.deleted") {
        clearSessionIntent(sessionID)
        sessionStates.delete(sessionID)
        if (deps.idleState) clearSession(deps.idleState, sessionID)
        return
      }

      if (eventType === "session.idle") {
        clearSessionIntent(sessionID)
        sessionStates.delete(sessionID)
        await handleIdleContinuation(deps, sessionID)
        return
      }
```

- [ ] **Step 6: Add `handleIdleContinuation` helper at the end of the file**

```typescript
async function handleIdleContinuation(deps: RuntimeFallbackDeps, sessionID: string): Promise<void> {
  const idleState = deps.idleState
  if (!idleState) return

  const data = idleState.sessionData.get(sessionID)
  // ESC abort — never continue
  if (data?.aborted) {
    clearSession(idleState, sessionID)
    return
  }

  // Not enabled — clean up
  if (!isIdleContinuationEnabled(idleState, sessionID)) {
    clearSession(idleState, sessionID)
    return
  }

  const cfg = deps.getConfig()
  const idleCfg = cfg.idleContinuation
  const maxContinuations = idleCfg?.maxContinuations ?? 20

  const count = data?.continuationCount ?? 0
  if (count >= maxContinuations) {
    clearSession(idleState, sessionID)
    return
  }

  if (!deps.client) return

  const hasUnfinished = await hasUnfinishedTodos(deps.client, sessionID)
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
    const sessionData = getSessionData(idleState, sessionID)
    sessionData.continuationCount = count + 1
  } catch (err) {
    log.warn("idle continuation prompt failed", { sessionID, error: String(err) })
    clearSession(idleState, sessionID)
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test --experimental-strip-types src/runtime-fallback/event-handler.test.ts`
Expected: PASS — all existing tests + new idle continuation tests pass

- [ ] **Step 8: Run full test suite**

Run: `pnpm test`
Expected: PASS (313 + new tests, 0 failed)

- [ ] **Step 9: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/runtime-fallback/event-handler.ts src/runtime-fallback/event-handler.test.ts
git commit -m "feat(idle-continuation): wire abort marking and idle continuation into event handler"
```

---

## Task 6: Wire Plugin (index.ts + event.ts)

**Files:**
- Modify: `src/hooks/event.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/hooks/event.ts` to pass `idleState`**

Current content (14 lines):

```typescript
export function createEventHandler(deps: {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
}) {
  return createRuntimeFallbackEventHandler(deps)
}
```

New content:

```typescript
export function createEventHandler(deps: {
  getConfig: () => OcmmConfig
  client?: OcmmClient
  directory?: string
  idleState?: IdleContinuationState
}) {
  return createRuntimeFallbackEventHandler(deps)
}
```

Add the import for `IdleContinuationState`:

```typescript
import type { IdleContinuationState } from "../runtime-fallback/idle-state.ts"
```

- [ ] **Step 2: Update `src/index.ts` — PluginInterface type**

Add `"command.execute"?: (input: any, output: any) => Promise<void>` to the `PluginInterface` type (after the `"event"?:` line, ~L45):

```typescript
  "command.execute"?: (input: { command: string; arguments?: string; sessionID: string }, output: { parts: Array<{ type: string; text?: string }> }) => Promise<void>
```

- [ ] **Step 3: Update `src/index.ts` — create shared idleState and wire hooks**

Add imports at the top (after existing imports, ~L31):

```typescript
import { createIdleContinuationState } from "./runtime-fallback/idle-state.ts"
import { createCommandExecuteHandler } from "./hooks/command-execute.ts"
```

Inside `createPlugin(input?)`, after the `cwd` definition (~L60), add:

```typescript
  const idleState = createIdleContinuationState()
```

Update the event handler creation (~L123) to pass `idleState`:

```typescript
    event: createEventHandler({
      getConfig,
      ...(input?.client !== undefined ? { client: input.client } : {}),
      directory: cwd,
      idleState,
    }),
```

In the `pluginInterface` object, add the `command.execute` hook (after `event`):

```typescript
    "command.execute": createCommandExecuteHandler({ idleState }),
```

Also update `globalEnabled` from config after config load. After `const cfg = getConfig()` or the config loading section, add logic to sync `idleState.globalEnabled`:

```typescript
  const syncIdleEnabled = () => {
    const c = getConfig()
    idleState.globalEnabled = c.idleContinuation?.enabled ?? false
  }
```

Call `syncIdleEnabled()` after `getConfig` is available and on reload. Place the call inside `createPlugin` after the config handler is set up.

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/event.ts src/index.ts
git commit -m "feat(idle-continuation): wire shared idleState and command.execute hook into plugin"
```

---

## Task 7: Register Slash Command + Update Loop Templates

**Files:**
- Modify: `src/commands/builtin.ts`

- [ ] **Step 1: Add `/idle-continuation` command entry**

In `loadBuiltinCommands(disabledCommands?)`, add a new entry to the returned array:

```typescript
  {
    name: "idle-continuation",
    description: "Toggle idle auto-continuation for this session. Usage: /idle-continuation [on|off|status]",
    template: "Idle auto-continuation toggle. The command.execute hook processes on/off/status arguments.",
  },
```

- [ ] **Step 2: Remove "not migrated" claims from RALPH_LOOP_TEMPLATE**

Find the sentence in `RALPH_LOOP_TEMPLATE`:

```
Important capability boundary: this local ocmm port currently exposes the slash command prompt, but it has not migrated omo's event-driven idle auto-continuation engine yet. Do not claim that the plugin will automatically re-prompt you after idle.
```

Replace with:

```
Idle auto-continuation: when `idleContinuation.enabled` is true in ocmm config (or toggled on via `/idle-continuation on`), the plugin will automatically re-prompt you after idle if the todo list has unfinished items.
```

- [ ] **Step 3: Remove "not migrated" claims from AUDIT_LOOP_TEMPLATE**

Find the similar sentence in `AUDIT_LOOP_TEMPLATE` and replace with the same text as above.

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/commands/builtin.ts
git commit -m "feat(idle-continuation): register /idle-continuation command and update loop template claims"
```

---

## Task 8: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the event hook row in the hooks table**

Find the `event` row in the hooks table. Current:

```
| `event`                              | Cleans up per-session state on `session.deleted` / `session.idle`. On `session.error`: classifies the error, and if retryable, dispatches the next model in the agent's fallback chain via `client.session.prompt`.                                                                           |
```

Replace with:

```
| `event`                              | Cleans up per-session state on `session.deleted` / `session.idle`. On `session.error`: classifies the error, and if retryable, dispatches the next model in the agent's fallback chain via `client.session.prompt`. When `idleContinuation.enabled` is true, on `session.idle` with unfinished todos and no prior ESC abort, re-prompts the model to continue. ESC aborts (detected via abort errors on `session.error`) suppress continuation. |
```

- [ ] **Step 2: Add a `command.execute` row to the hooks table**

After the `event` row, add:

```
| `command.execute`                    | Handles the `/idle-continuation` slash command to toggle idle auto-continuation per session (`on` / `off` / `status`). Session overrides win over global `idleContinuation.enabled` config.                                                                                                        |
```

- [ ] **Step 3: Add `idleContinuation` to the config schema example**

Find the config schema example in README. Add `idleContinuation` after `runtimeFallback`:

```jsonc
  "idleContinuation": {
    "enabled": false,
    "maxContinuations": 20,
    "prompt": "Your todo list has unfinished items. Continue with the next pending or in-progress task. Do not ask for confirmation — proceed."
  },
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(idle-continuation): document event hook idle continuation and command.execute"
```

---

## Task 9: Final Verification

**Files:** none

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: PASS (all tests, 0 failed)

- [ ] **Step 3: Run build**

Run: `pnpm run build`
Expected: PASS (tsc + cargo)

- [ ] **Step 4: Verify no unrelated files changed**

Run: `git status`
Expected: clean working tree (all committed)

- [ ] **Step 5: Review commit log**

Run: `git log --oneline -8`
Expected: 6-7 commits with semantic messages for this feature
