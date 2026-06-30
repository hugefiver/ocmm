# TS Risk Fixes Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the approved TypeScript runtime risks: per-plugin state isolation, safer runtime fallback retries, and robust subagent git write detection.

**Architecture:** Convert currently module-global routing/session-intent state into injectable per-plugin stores while keeping default wrappers for existing tests. Track fallback active model in per-session fallback state and retry the latest contiguous user-message block. Replace regex-only git write detection with token-based parsing that skips common git global options.

**Tech Stack:** TypeScript ESM, Node `node:test`, OpenCode plugin hooks, existing ocmm config/runtime-fallback/permissions modules.

---

## File Structure

- Modify: `src/routing/ledger.ts` — add `createResolutionLedger()` and keep default ledger wrappers.
- Create: `src/routing/ledger.test.ts` — prove independent ledgers do not share entries/listeners.
- Modify: `src/hooks/chat-message.ts` — add `createSessionIntentStore()` and inject it into chat/system handlers.
- Modify: `src/hooks/chat-message.test.ts` — prove independent stores isolate queued prompts and default wrappers still work.
- Modify: `src/hooks/chat-params.ts` — accept optional `recordResolution` callback and use it instead of hardwired default ledger.
- Modify: `src/index.ts` — instantiate one ledger and one session intent store per plugin and wire them into hooks.
- Modify: `src/hooks/event.ts` — pass optional `clearSessionIntent` into runtime fallback event handler.
- Modify: `src/runtime-fallback/fallback-state.ts` — add `activeModel` plus peek/commit fallback advancement helpers.
- Modify: `src/runtime-fallback/event-handler.ts` — infer failed model from event model, active model, then primary; commit active model only after successful dispatch.
- Modify: `src/runtime-fallback/event-handler.test.ts` — cover missing model payload after fallback attempt.
- Modify: `src/runtime-fallback/dispatcher.ts` — extract latest contiguous user-message block.
- Create: `src/runtime-fallback/dispatcher.test.ts` — cover multi-message retry extraction through public `dispatchFallbackRetry()` behavior.
- Modify: `src/permissions/index.ts` — implement token-based `isGitWriteCommand()`.
- Modify: `src/permissions/subagent-git-guard.test.ts` — cover git global options before write subcommands.

---

### Task 1: Per-plugin routing ledger

**Files:**
- Modify: `src/routing/ledger.ts`
- Create: `src/routing/ledger.test.ts`
- Modify: `src/hooks/chat-params.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing ledger isolation tests**

Create `src/routing/ledger.test.ts` with tests equivalent to:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  clearResolutions,
  createResolutionLedger,
  recentResolutions,
  recordResolution,
} from "./ledger.ts"
import type { ResolutionEntry } from "../shared/types.ts"

function entry(sessionID: string): ResolutionEntry {
  return {
    ts: Date.now(),
    sessionID,
    agent: "orchestrator",
    input: { providerID: "p", modelID: "m" },
    applied: {},
    source: "builtin-agent",
  }
}

test("createResolutionLedger instances do not share entries", () => {
  const a = createResolutionLedger()
  const b = createResolutionLedger()

  a.recordResolution(entry("a"))

  assert.equal(a.recentResolutions().length, 1)
  assert.equal(b.recentResolutions().length, 0)
})

test("createResolutionLedger instances do not share listeners", () => {
  const a = createResolutionLedger()
  const b = createResolutionLedger()
  const seen: string[] = []
  a.onResolution((item) => seen.push(item.sessionID))

  b.recordResolution(entry("b"))
  a.recordResolution(entry("a"))

  assert.deepEqual(seen, ["a"])
})

test("default ledger wrappers remain compatible", () => {
  clearResolutions()
  recordResolution(entry("default"))
  assert.equal(recentResolutions().length, 1)
  clearResolutions()
  assert.equal(recentResolutions().length, 0)
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `node --test --experimental-strip-types --test-reporter=spec src/routing/ledger.test.ts`

Expected: FAIL because `createResolutionLedger` is not exported.

- [ ] **Step 3: Implement `createResolutionLedger()`**

In `src/routing/ledger.ts`, move `entries` and `listeners` into a factory:

```ts
export type ResolutionLedger = {
  recordResolution(entry: ResolutionEntry): void
  recentResolutions(): readonly ResolutionEntry[]
  clearResolutions(): void
  onResolution(fn: (e: ResolutionEntry) => void): () => void
}

export function createResolutionLedger(): ResolutionLedger {
  const entries: ResolutionEntry[] = []
  const listeners = new Set<(e: ResolutionEntry) => void>()

  return {
    recordResolution(entry: ResolutionEntry): void {
      entries.push(entry)
      while (entries.length > MAX_ENTRIES) entries.shift()
      for (const listener of listeners) {
        try {
          listener(entry)
        } catch {
          /* swallow */
        }
      }
    },
    recentResolutions(): readonly ResolutionEntry[] {
      return entries
    },
    clearResolutions(): void {
      entries.length = 0
    },
    onResolution(fn: (e: ResolutionEntry) => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

const defaultLedger = createResolutionLedger()

export function recordResolution(entry: ResolutionEntry): void {
  defaultLedger.recordResolution(entry)
}
```

Keep the other default wrappers delegating to `defaultLedger`.

- [ ] **Step 4: Inject ledger recording into chat params**

In `src/hooks/chat-params.ts`, replace the direct `recordResolution` import with a type import for `ResolutionEntry`, and update handler args:

```ts
import { recordResolution as defaultRecordResolution } from "../routing/ledger.ts"
import type { ResolutionEntry, Variant } from "../shared/types.ts"

export function createChatParamsHandler(args: {
  getConfig: () => OcmmConfig
  sessionAgentMap?: Map<string, string>
  recordResolution?: (entry: ResolutionEntry) => void
})
```

Inside the handler, define `const record = args.recordResolution ?? defaultRecordResolution` and replace both `recordResolution({...})` calls with `record({...})`.

- [ ] **Step 5: Wire per-plugin ledger in `createPlugin()`**

In `src/index.ts`, import `createResolutionLedger`, instantiate it after session maps, and pass its method into `createChatParamsHandler`:

```ts
import { createResolutionLedger } from "./routing/ledger.ts"

const resolutionLedger = createResolutionLedger()

"chat.params": createChatParamsHandler({
  getConfig,
  sessionAgentMap,
  recordResolution: resolutionLedger.recordResolution,
}),
```

- [ ] **Step 6: Run focused ledger/chat params tests**

Run: `node --test --experimental-strip-types --test-reporter=spec src/routing/ledger.test.ts src/hooks/chat-params.test.ts`

Expected: PASS.

---

### Task 2: Per-plugin chat-message session intent store

**Files:**
- Modify: `src/hooks/chat-message.ts`
- Modify: `src/hooks/chat-message.test.ts`
- Modify: `src/hooks/event.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing store isolation test**

Add this test to `src/hooks/chat-message.test.ts`:

```ts
test("session intent stores isolate identical session IDs", async () => {
  const cfg = { ...defaultConfig(), workflow: "v1" as const }
  const storeA = createSessionIntentStore()
  const storeB = createSessionIntentStore()
  const handlerA = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL A",
    sessionIntentStore: storeA,
  })
  const handlerB = createChatMessageHandler({
    getConfig: () => cfg,
    getV1Skills: () => "SKILL B",
    sessionIntentStore: storeB,
  })

  await handlerA(makeInput({ sessionID: "same" }), makeOutput())
  await handlerB(makeInput({ sessionID: "same" }), makeOutput())

  assert.match(storeA.getSessionPrompt("same") ?? "", /SKILL A/)
  assert.doesNotMatch(storeA.getSessionPrompt("same") ?? "", /SKILL B/)
  assert.match(storeB.getSessionPrompt("same") ?? "", /SKILL B/)
  assert.doesNotMatch(storeB.getSessionPrompt("same") ?? "", /SKILL A/)
})
```

Update the import list to include `createSessionIntentStore`.

- [ ] **Step 2: Run the chat-message test and verify it fails**

Run: `node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-message.test.ts`

Expected: FAIL because `createSessionIntentStore` and `sessionIntentStore` args do not exist.

- [ ] **Step 3: Implement `createSessionIntentStore()`**

In `src/hooks/chat-message.ts`, replace the module-level `sessionState` helpers with a store factory:

```ts
export type SessionIntentStore = {
  clearSessionIntent(sessionID: string): void
  getOrInit(sessionID: string): SessionIntentState
  getSessionPrompt(sessionID: string): string | null
}

export function createSessionIntentStore(): SessionIntentStore {
  const sessionState = new Map<string, SessionIntentState>()
  return {
    clearSessionIntent(sessionID: string): void {
      sessionState.delete(sessionID)
    },
    getOrInit(sessionID: string): SessionIntentState {
      let s = sessionState.get(sessionID)
      if (!s) {
        s = { prompts: [], oncePrompts: [], v1SkillsQueued: false }
        sessionState.set(sessionID, s)
      }
      return s
    },
    getSessionPrompt(sessionID: string): string | null {
      const s = sessionState.get(sessionID)
      if (!s) return null
      const prompts = [...s.prompts, ...s.oncePrompts]
      if (prompts.length === 0) return null
      return prompts.join("\n\n---\n\n")
    },
  }
}

const defaultSessionIntentStore = createSessionIntentStore()

export function clearSessionIntent(sessionID: string): void {
  defaultSessionIntentStore.clearSessionIntent(sessionID)
}
```

Keep `getSessionPrompt()` as a default wrapper. In both handler factories, use `const store = args.sessionIntentStore ?? defaultSessionIntentStore` and replace `getOrInit()` / `getSessionPrompt()` calls with store methods.

- [ ] **Step 4: Inject store through event cleanup and plugin wiring**

In `src/runtime-fallback/event-handler.ts`, add an optional dependency:

```ts
clearSessionIntent?: (sessionID: string) => void
```

Replace direct `clearSessionIntent(sessionID)` calls with `(deps.clearSessionIntent ?? clearSessionIntent)(sessionID)`.

In `src/hooks/event.ts`, accept and pass through the same optional `clearSessionIntent` dependency.

In `src/index.ts`, instantiate `const sessionIntentStore = createSessionIntentStore()` and pass it to:

```ts
createEventHandler({ ..., clearSessionIntent: sessionIntentStore.clearSessionIntent })
createChatMessageHandler({ ..., sessionIntentStore })
createSystemTransformHandler({ getConfig, sessionIntentStore })
```

- [ ] **Step 5: Run focused chat/event tests**

Run: `node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-message.test.ts src/runtime-fallback/event-handler.test.ts src/index.test.ts`

Expected: PASS.

---

### Task 3: Safer runtime fallback retry state and context

**Files:**
- Modify: `src/runtime-fallback/fallback-state.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler.test.ts`
- Modify: `src/runtime-fallback/dispatcher.ts`
- Create: `src/runtime-fallback/dispatcher.test.ts`

- [ ] **Step 1: Write failing fallback active-model test**

Add to `src/runtime-fallback/event-handler.test.ts`:

```ts
test("event without model uses active fallback model after a previous retry", async () => {
  const { client, calls } = makeMockClient()
  const cfg = makeConfig({ maxAttempts: 5, cooldownSeconds: 0 })
  const handler = createRuntimeFallbackEventHandler({ getConfig: () => cfg, client })

  await handler(makeErrorEvent("ses_active", { status: 503 }, {
    agent: "orchestrator",
    model: { providerID: "hoo", modelID: "primary-model" },
  }))
  await handler(makeErrorEvent("ses_active", { status: 503 }, { agent: "orchestrator" }))

  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.body.modelID, "fallback-a")
  assert.equal(calls[1]?.body.modelID, "fallback-b")
})
```

- [ ] **Step 2: Write failing contiguous user block dispatcher test**

Create `src/runtime-fallback/dispatcher.test.ts`:

```ts
import { test } from "node:test"
import assert from "node:assert/strict"

import { dispatchFallbackRetry, type OcmmClient } from "./dispatcher.ts"

test("dispatchFallbackRetry retries the latest contiguous user message block", async () => {
  const promptBodies: Record<string, unknown>[] = []
  const client: OcmmClient = {
    session: {
      async abort() {
        return undefined
      },
      async messages() {
        return {
          messages: [
            { role: "user", parts: [{ type: "text", text: "old" }] },
            { role: "assistant", parts: [{ type: "text", text: "reply" }] },
            { role: "user", parts: [{ type: "text", text: "latest one" }] },
            { role: "user", content: [{ type: "text", text: "latest two" }] },
          ],
        }
      },
      async prompt(args) {
        promptBodies.push(args.body)
        return undefined
      },
    },
  }

  const ok = await dispatchFallbackRetry({
    client,
    sessionID: "ses_retry",
    newEntry: { providers: ["hoo"], model: "fallback-a" },
    reason: "test",
  })

  assert.equal(ok, true)
  assert.deepEqual(promptBodies[0]?.parts, [
    { type: "text", text: "latest one" },
    { type: "text", text: "latest two" },
  ])
})
```

- [ ] **Step 3: Run fallback tests and verify failures**

Run: `node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler.test.ts src/runtime-fallback/dispatcher.test.ts`

Expected: FAIL because active model is not tracked and dispatcher only extracts one user message.

- [ ] **Step 4: Track active fallback model**

In `src/runtime-fallback/fallback-state.ts`, add optional `activeModel` to `FallbackState`. Leave it unset until a fallback dispatch succeeds, and export peek/commit helpers:

```ts
export function peekNextFallback(state: FallbackState, requirement: ModelRequirement | null, now: number): PeekResult {
  // Return the next fallback entry and nextAttempts without mutating state.
}

export function commitFallback(state: FallbackState, entry: FallbackEntry, nextAttempts: number): void {
  state.fallbackIndex += 1
  state.attempts = nextAttempts
  state.activeModel = modelKey(entry.providers[0] ?? "", entry.model)
}
```

In `src/runtime-fallback/event-handler.ts`, import `peekNextFallback` and `commitFallback`. Replace failed-key derivation with helper logic:

```ts
const eventModel = resolveEventModel(props)
let justFailedKey: string | null = null
if (eventModel) justFailedKey = modelKey(eventModel.providerID, eventModel.modelID)
else if (state?.activeModel) justFailedKey = state.activeModel
else if (requirement.fallbackChain[0]) justFailedKey = modelKey(requirement.fallbackChain[0].providers[0] ?? "", requirement.fallbackChain[0].model)
```

Use `peekNextFallback()` before dispatch. Only call `commitFallback()` after `dispatchFallbackRetry()` returns `true`; do not advance `activeModel`, `fallbackIndex`, or `attempts` for observe-only, missing-client, or failed-dispatch paths.

- [ ] **Step 5: Extract latest contiguous user-message block**

In `src/runtime-fallback/dispatcher.ts`, replace `extractLastUserParts()` with a helper that scans backward through `messages`, collects adjacent records where `role` or `type` is `"user"`, reverses them, and concatenates each message's `parts` or `content` array:

```ts
function messageParts(message: Record<string, unknown>): unknown[] {
  const parts = message.parts ?? message.content
  return Array.isArray(parts) ? parts : []
}
```

Only return the block if it contains at least one part. Keep failure behavior unchanged when no parts are found.

- [ ] **Step 6: Run fallback tests**

Run: `node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/fallback-state.test.ts`

Expected: PASS.

---

### Task 4: Token-based subagent git write guard

**Files:**
- Modify: `src/permissions/index.ts`
- Modify: `src/permissions/subagent-git-guard.test.ts`

- [ ] **Step 1: Write failing git global-option tests**

Add to `src/permissions/subagent-git-guard.test.ts`:

```ts
test("matches git commit after -c global config", () => {
  assert.ok(isGitWriteCommand("git -c user.name=x commit -m test"))
})

test("matches git push after --no-pager", () => {
  assert.ok(isGitWriteCommand("git --no-pager push origin main"))
})

test("matches git reset --hard after --git-dir value", () => {
  assert.ok(isGitWriteCommand("git --git-dir .git reset --hard HEAD"))
})

test("does NOT match non-hard reset after global option", () => {
  assert.ok(!isGitWriteCommand("git -C repo reset HEAD~1"))
})
```

- [ ] **Step 2: Run git guard test and verify failures**

Run: `node --test --experimental-strip-types --test-reporter=spec src/permissions/subagent-git-guard.test.ts`

Expected: FAIL for `git -c ... commit` and related option-before-subcommand cases.

- [ ] **Step 3: Implement token-based parser**

In `src/permissions/index.ts`, replace `GIT_WRITE_COMMAND_RE` usage with token parsing. Keep a narrow regex fallback only if desired for backward compatibility, but the parser should drive results:

```ts
const GIT_WRITE_SUBCOMMANDS = new Set(["commit", "push", "tag", "rebase", "cherry-pick", "revert"])
const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path", "--super-prefix"])
const GIT_GLOBAL_FLAGS = new Set(["--no-pager", "--paginate", "--bare", "--literal-pathspecs", "--no-literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs", "--no-optional-locks", "--version", "--help"])
```

Implement helpers:

```ts
function findGitWriteSubcommand(tokens: string[]): { command: string; index: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "git") continue
    let cursor = i + 1
    while (cursor < tokens.length) {
      const token = tokens[cursor]
      if (!token) return null
      if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(token)) {
        cursor += 2
        continue
      }
      if ([...GIT_GLOBAL_OPTIONS_WITH_VALUE].some((option) => token.startsWith(`${option}=`))) {
        cursor += 1
        continue
      }
      if (GIT_GLOBAL_FLAGS.has(token) || token.startsWith("--")) {
        cursor += 1
        continue
      }
      return { command: token, index: cursor }
    }
  }
  return null
}
```

Then:

```ts
export function isGitWriteCommand(command: string): boolean {
  const tokens = tokenizeCommand(command)
  const sub = findGitWriteSubcommand(tokens)
  if (!sub) return false
  if (GIT_WRITE_SUBCOMMANDS.has(sub.command)) return true
  if (sub.command === "reset") return tokens.slice(sub.index + 1).includes("--hard")
  return false
}
```

Ensure `git status`, `git log`, `git diff`, and non-hard `git reset` stay allowed.

- [ ] **Step 4: Run permission tests**

Run: `node --test --experimental-strip-types --test-reporter=spec src/permissions/subagent-git-guard.test.ts src/permissions/index.test.ts`

Expected: PASS.

---

### Task 5: Full TypeScript verification and review

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run TypeScript typecheck**

Run: `pnpm run typecheck`

Expected: PASS with exit code 0.

- [ ] **Step 2: Run focused changed test set**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/ledger.test.ts src/hooks/chat-message.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/event-handler.test.ts src/runtime-fallback/dispatcher.test.ts src/runtime-fallback/fallback-state.test.ts src/permissions/subagent-git-guard.test.ts src/permissions/index.test.ts src/index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full repository tests**

Run: `pnpm test`

Expected: PASS for TypeScript tests and Rust `cargo test -p ocmm-lsp`.

- [ ] **Step 4: Inspect git diff**

Run: `git status --short; git diff -- docs/superpowers/specs/2026-06-30-ts-risk-fixes-design.md docs/superpowers/plans/2026-06-30-ts-risk-fixes.md src/routing/ledger.ts src/routing/ledger.test.ts src/hooks/chat-message.ts src/hooks/chat-message.test.ts src/hooks/chat-params.ts src/index.ts src/hooks/event.ts src/runtime-fallback/fallback-state.ts src/runtime-fallback/event-handler.ts src/runtime-fallback/event-handler.test.ts src/runtime-fallback/dispatcher.ts src/runtime-fallback/dispatcher.test.ts src/permissions/index.ts src/permissions/subagent-git-guard.test.ts`

Expected: Diff contains only the approved TS risk fixes, spec, and plan.

---

## Self-Review

- Spec coverage: Tasks 1-4 map directly to per-plugin state isolation, fallback active-model/context handling, and tokenized git guard. Rust LSP and musl release are intentionally out of scope and remain documented in the spec follow-up section.
- Placeholder scan: no placeholder tasks remain; every code-changing task names files, snippets, and test commands.
- Type consistency: `createResolutionLedger`, `createSessionIntentStore`, `SessionIntentStore`, `ResolutionLedger`, and `clearSessionIntent` names are used consistently across plan tasks.
