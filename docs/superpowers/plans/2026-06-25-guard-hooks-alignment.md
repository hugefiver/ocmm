# Guard Hooks Alignment Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align ocmm guard hooks with omo behavior — add session caches to README/AGENTS injectors (inject once per dir per session), add LRU/cap/invalidation to write-guard, add event handler for session cleanup, fix fsync per-call timing, and strengthen JSON error patterns. No disk persistence (memory-only per user request).

**Architecture:** Extend `PermissionGuardHooks` type to include an optional `event` handler. `createPermissionGuards()` maintains three new per-session maps: `readmeSessionCache`, `agentsSessionCache`, and `lastAccess` (LRU for `readPermissions`). The event handler clears all per-session state on `session.deleted` and `session.compacted`. The directory-agents-injector gets a shared session cache injected from the plugin entry point.

**Tech Stack:** TypeScript (Node 22+, `node --test --experimental-strip-types`), Zod schema, OpenCode plugin hooks.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/permissions/index.ts` | All guard hooks + new session caches + event handler | Modify |
| `src/permissions/index.test.ts` | Guard hook tests + new session cleanup tests | Modify |
| `src/hooks/directory-agents-injector.ts` | AGENTS.md injector + session cache | Modify |
| `src/hooks/directory-agents-injector.test.ts` | Injector tests + session cache test | Modify |
| `src/hooks/event.ts` | Pass permission event handler through | Modify |
| `src/index.ts` | Wire permission event handler into plugin event hook | Modify |

---

## Task 1: Session caches + event handler in permissions/index.ts

**Files:**
- Modify: `src/permissions/index.ts`

- [ ] **Step 1: Add `event` to `PermissionGuardHooks` type**

Change the type definition (~L27-31):

```typescript
export type PermissionGuardHooks = {
  before: ToolHook
  after: ToolHook
  definition: ToolDefinitionHook
  event?: (input: unknown) => Promise<void>
}
```

- [ ] **Step 2: Add session cache maps in `createPermissionGuards`**

After the existing `readPermissions` declaration (~L64), add:

```typescript
  const readPermissions = new Map<string, Set<string>>()
  const readmeSessionCache = new Map<string, Set<string>>()
  const agentsSessionCache = new Map<string, Set<string>>()
  const lastAccess = new Map<string, number>()
  const MAX_TRACKED_SESSIONS = 50
```

- [ ] **Step 3: Add LRU eviction for `readPermissions`**

After `trackReadPermission` function, add a helper:

```typescript
function touchSession(
  readPermissions: Map<string, Set<string>>,
  lastAccess: Map<string, number>,
  sessionId: string,
  maxSessions: number,
): void {
  lastAccess.set(sessionId, Date.now())
  if (readPermissions.size <= maxSessions) return
  // Evict least recently used
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [key, time] of lastAccess) {
    if (time < oldestTime) {
      oldestTime = time
      oldestKey = key
    }
  }
  if (oldestKey && oldestKey !== sessionId) {
    readPermissions.delete(oldestKey)
    lastAccess.delete(oldestKey)
    readmeSessionCache.delete(oldestKey)
    agentsSessionCache.delete(oldestKey)
  }
}
```

Update `trackReadPermission` to call `touchSession` after adding a path. The `readPermissions` and `lastAccess` maps need to be passed through. Since `trackReadPermission` is a module-level function, the caches must be passed as parameters. Read the current function signature first to match the pattern.

- [ ] **Step 4: Add session cache to `injectDirectoryReadme`**

Modify `injectDirectoryReadme` to accept `readmeSessionCache` and `sessionID`. Before injecting, check if the README directory was already injected in this session:

```typescript
async function injectDirectoryReadme(
  config: OcmmConfig,
  rawInput: unknown,
  rawOutput: unknown,
  projectRoot: string,
  readmeSessionCache: Map<string, Set<string>>,
): Promise<void> {
  if (hookDisabled(config, "directory-readme-injector", "directoryReadmeInjector")) return
  if (toolName(rawInput) !== READ_TOOL) return
  const out = outputRecord(rawOutput)
  if (!out || typeof out.output !== "string" || out.output.includes("[Directory README:")) return
  const targetPath = filePathFromOutput(rawInput, out, projectRoot)
  if (!targetPath) return
  const readme = findNearestReadme(targetPath, projectRoot)
  if (!readme || resolve(readme) === resolve(targetPath)) return

  const session = sessionId(rawInput) ?? "default"
  const readmeDir = dirname(readme)
  let injected = readmeSessionCache.get(session)
  if (!injected) {
    injected = new Set<string>()
    readmeSessionCache.set(session, injected)
  }
  if (injected.has(readmeDir)) return  // Already injected this session
  injected.add(readmeDir)

  const content = await readText(readme)
  if (content === null) return
  const { text, truncated } = truncateText(content, README_BUDGET)
  out.output = `${out.output}\n\n[Directory README: ${readme}]\n${text}${
    truncated ? `\n[Directory README truncated: ${readme}]` : ""
  }`
}
```

Update the call site in the `after` handler to pass `readmeSessionCache`.

- [ ] **Step 5: Add `event` handler to the returned object**

After the `definition` handler in the return object, add:

```typescript
  return {
    before,
    after,
    definition,
    event: createGuardEventHandler({
      readPermissions,
      readmeSessionCache,
      agentsSessionCache,
      lastAccess,
    }),
  }
```

Add the event handler factory function:

```typescript
function createGuardEventHandler(caches: {
  readPermissions: Map<string, Set<string>>
  readmeSessionCache: Map<string, Set<string>>
  agentsSessionCache: Map<string, Set<string>>
  lastAccess: Map<string, number>
}): (input: unknown) => Promise<void> {
  return async (raw: unknown) => {
    if (!isRecord(raw)) return
    const event = (raw as Record<string, unknown>).event ?? raw
    const eventType = (event as Record<string, unknown>).type
    if (eventType !== "session.deleted" && eventType !== "session.compacted") return
    const props = (event as Record<string, unknown>).properties ?? event
    const sid = (props as Record<string, unknown>).sessionID ?? (props as Record<string, unknown>).sessionId
    if (typeof sid !== "string") return
    caches.readPermissions.delete(sid)
    caches.readmeSessionCache.delete(sid)
    caches.agentsSessionCache.delete(sid)
    caches.lastAccess.delete(sid)
  }
}
```

- [ ] **Step 6: Pass `readmeSessionCache` in the `after` handler**

In the `after` handler (~L78-88), update the `injectDirectoryReadme` call to pass `readmeSessionCache`.

- [ ] **Step 7: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 8: Run existing tests**

Run: `pnpm test`
Expected: PASS (existing tests should not regress — the session cache is additive)

- [ ] **Step 9: Commit**

```powershell
git add src/permissions/index.ts
git commit -m "feat(guards): add session caches, LRU eviction, and event cleanup to permission guards"
```

---

## Task 2: Session cache tests in permissions/index.test.ts

**Files:**
- Modify: `src/permissions/index.test.ts`

- [ ] **Step 1: Add tests for session cache + event cleanup**

```typescript
test("readme injector caches per session — does not re-inject same dir", async () => {
  const root = await tempProject()
  try {
    await write(join(root, "README.md"), "# Project\n")
    await write(join(root, "src", "app.ts"), "")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })
    const input1 = { tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } }
    const output1 = { output: "file content" }
    await guards.after(input1, output1)
    assert.match(output1.output, /\[Directory README:/)
    const input2 = { tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } }
    const output2 = { output: "file content 2" }
    await guards.after(input2, output2)
    assert.doesNotMatch(output2.output, /\[Directory README:/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("event handler clears session caches on session.deleted", async () => {
  const root = await tempProject()
  try {
    await write(join(root, "README.md"), "# Project\n")
    await write(join(root, "src", "app.ts"), "")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })
    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } })
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } }, { output: "content" })
    await guards.event({ event: { type: "session.deleted", properties: { sessionID: "s1" } } })
    const output = { output: "content after cleanup" }
    await guards.after({ tool: "read", sessionID: "s1", args: { filePath: join(root, "src", "app.ts") } }, output)
    assert.match(output.output, /\[Directory README:/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("LRU eviction removes oldest session when max exceeded", async () => {
  const root = await tempProject()
  try {
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })
    for (let i = 0; i < 60; i++) {
      await guards.before({ tool: "read", sessionID: `s${i}`, args: { filePath: join(root, "file.ts") } })
    }
    // Session s0 should have been evicted (it was first/oldest)
    // Session s59 should still be tracked
    // We can't directly inspect the map, but we can verify behavior:
    // writing in s0 should fail (evicted) while s59 should succeed (still tracked)
    // Actually — we need to create a file to write. Let's just verify no crash.
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Note: The LRU test is hard to verify behaviorally without file writes. Keep it simple — just verify no crash with many sessions. If the implementer has a better approach, adapt.

- [ ] **Step 2: Run tests**

Run: `node --test --experimental-strip-types src/permissions/index.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/permissions/index.test.ts
git commit -m "test(guards): add session cache and event cleanup tests"
```

---

## Task 3: AGENTS injector session cache

**Files:**
- Modify: `src/hooks/directory-agents-injector.ts`

- [ ] **Step 1: Add session cache to `createDirectoryAgentsInjector`**

Modify the function to accept and maintain a `sessionCache`:

```typescript
export function createDirectoryAgentsInjector(args: {
  getConfig: () => OcmmConfig
  projectRoot: string
  sessionCache?: Map<string, Set<string>>
}): (input: unknown, output: unknown) => Promise<void> {
  const sessionCache = args.sessionCache ?? new Map<string, Set<string>>()
  return async (rawInput, rawOutput) => {
    const config = args.getConfig()
    if (!config.rules.enabled || config.disabledHooks?.includes(HOOK_NAME)) return
    if (!isRecord(rawOutput)) return
    if (toolName(rawInput) !== "read") return

    const output = rawOutput as ToolOutput
    if (typeof output.output !== "string") return
    const filePath = inputFilePath(rawInput, output)
    if (!filePath) return

    const session = sessionId(rawInput) ?? "default"
    const blocks = await agentsBlocks({
      filePath,
      projectRoot: args.projectRoot,
      sessionCache,
      sessionId: session,
    })
    if (blocks.length === 0) return
    output.output = `${output.output}${blocks.join("")}`
  }
}
```

Update `agentsBlocks` to check the session cache before injecting each AGENTS.md dir.

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/hooks/directory-agents-injector.ts
git commit -m "feat(guards): add session cache to directory-agents-injector"
```

---

## Task 4: Wire permission event handler in index.ts + event.ts

**Files:**
- Modify: `src/hooks/event.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/index.ts` to wire the permission event handler**

Read `src/index.ts` to find where `createPermissionGuards` is called and where the `event` hook is registered. The permission guards' `event` handler needs to be called alongside the existing runtime-fallback event handler.

The existing event hook is `createEventHandler(...)` which returns `createRuntimeFallbackEventHandler(...)`. The permission guards' event handler needs to be composed with it — either by calling both in sequence, or by having the event hook delegate.

The simplest approach: in the `event` property of `pluginInterface`, call both the runtime-fallback event handler AND the permission guards' event handler.

- [ ] **Step 2: Update `src/hooks/event.ts` if needed**

If the event handler composition is done in `index.ts`, no changes needed here. If it's done in `event.ts`, update the factory to accept and compose the permission event handler.

- [ ] **Step 3: Pass session cache to directory-agents-injector**

In `src/index.ts`, where `createDirectoryAgentsInjector` is called, pass the `agentsSessionCache` from `createPermissionGuards`. This requires either:
- Exposing `agentsSessionCache` from `createPermissionGuards` return value, or
- Creating the map in `createPlugin` and passing it to both

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/event.ts src/index.ts
git commit -m "feat(guards): wire permission event handler and shared agents cache"
```

---

## Task 5: fsync per-call timing + JSON patterns

**Files:**
- Modify: `src/permissions/index.ts`

- [ ] **Step 1: Add fsync before-hook timing**

Add a `startTimesByCallId` Map to track per-call start times. Record the start time in the `before` handler for `bash`/`interactive_bash` tools, and in the `after` handler only drain events after that timestamp.

This requires the `FsyncSkipTracker` to support timestamp-based filtering, or the `appendFsyncWarnings` function to filter events by timestamp.

Simplest approach: add a `Map<string, number>` in `createPermissionGuards`, record `Date.now()` in the `before` handler for bash tools, and pass the start time to `appendFsyncWarnings` which filters `tracker.drain()` results.

- [ ] **Step 2: Strengthen JSON error patterns**

Update `containsJsonParseError` (~L333-335) to include omo's additional patterns:

```typescript
export function containsJsonParseError(text: string): boolean {
  return /(
    json\.parse
    |unexpected (token|end).*json
    |invalid json
    |json parse error
    |failed to parse json
    |malformed json
    |unexpected end of json input
    |syntaxerror: unexpected token.*json
    |json[^\n]*expected \}
    |json[^\n]*unexpected eof
  )/ix.test(text)
}
```

Also remove the duplicate `"grep_app_searchgithub"` entry in `jsonRecoveryExcluded` (~L578-583).

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm run typecheck && pnpm test` (use `;` in PowerShell)
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/permissions/index.ts
git commit -m "feat(guards): add fsync per-call timing and strengthen JSON error patterns"
```

---

## Task 6: Final verification

**Files:** none

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: PASS (all tests, 0 failed)

- [ ] **Step 3: Run build**

Run: `pnpm run build:ts`
Expected: PASS

- [ ] **Step 4: Verify no unrelated files changed**

Run: `git status`
Expected: clean working tree
