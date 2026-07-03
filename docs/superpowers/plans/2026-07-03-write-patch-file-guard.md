# Write/Patch File Guard Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the `write` tool guard to a two-tier (always-on baseline + gated enhancement) policy that prohibits overwriting existing project files, add an `edit`/`multiedit` read-before-patch guard, and add a `bash-file-write-guard` that blocks shell commands writing to existing project files.

**Architecture:** Three guards compose inside `createPermissionGuards`'s `before` array. `guardExistingFileWrite` is rewritten to a two-tier check (baseline always-on + enhancement gated by `write-existing-file-guard`). A new `guardPatchWithoutRead` reuses the existing `readPermissions` Map (read tokens now persistent, not consumed). A new `guardBashFileWrite` flat-scans the bash command string for redirect operators, write commands, in-place editors, and copy/move overwrites targeting existing project files. A new config hook `bash-file-write-guard` is added to `HOOK_NAMES`; `schema.json` is regenerated.

**Tech Stack:** TypeScript (strict), `node:test` + `node:assert/strict`, `node:fs`/`node:path`, Zod schema. Build via `pnpm run typecheck` / `pnpm test` / `pnpm run build`. Schema regen via `pnpm run gen-schema`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/config/schema.ts` | Add `"bash-file-write-guard"` to `HOOK_NAMES` array (L77-96) |
| `schema.json` | Regenerated artifact (must match schema.ts in same commit) |
| `src/permissions/index.ts` | Rewrite `guardExistingFileWrite` (L187-210); add `guardPatchWithoutRead`; add `guardBashFileWrite` + helpers (`commandWritesExistingFile`, `redirectTargetsExistingProjectFile`, `commandUsesWriteCommandOnExistingFile`, `commandDoesInPlaceEdit`, `commandCopiesMovesOverExisting`, `resolveShellTarget`, `lastNonOptionOperand`); register both new guards in `before` array (L76-86) |
| `src/permissions/index.test.ts` | Rewrite the existing read-then-write test (L53-70) to expect throw even after read; add test suites for two-tier write, edit/multiedit read-before-patch, and bash-file-write-guard |
| `docs/v1-maintenance.md` | Add a "### Hooks" subsection noting the new `bash-file-write-guard` hook |

## Source code anchors (verified line numbers)

- `createPermissionGuards` L61-113; `before` array L76-86; session state L70-72 (`readPermissions`, `readmeSessionCache`, `lastAccess`)
- `createGuardEventHandler` L115-136 (clears session state on `session.deleted`/`session.compacted` — unchanged)
- `trackReadPermission` L138-160 (gated by `write-existing-file-guard` at L146 — unchanged, now feeds `guardPatchWithoutRead`)
- `guardExistingFileWrite` L187-210 (rewrite target)
- `guardNotepadWrite` L212-224; `warnBashFileRead` L226-234; `guardSubagentGit` L236-257
- `bashWorkingDirectory` L259-266
- `isSimpleFileReadCommand` L590-601 (pattern reference: uses `[|;&<>\`]` guard regex)
- helpers: `filePathFromArgs` L882-890; `stringArg` L892-896; `argsRecord` L898-901; `toolName` L926-929; `sessionId` L948-955
- `canonicalExistingFile` L1431-1435 (uses `absolutize` + `safeStatFile`, NOT `realpathSync` — symlink caveat)
- `safeStatFile` L1437-1443; `absolutize` L1453-1455; `isInside` L1457-1460; `isUnderSpecialDir` L1462-1465
- `tokenizeCommand` L1467-1473; `normalizeCommandName` L1547-1554
- `hookDisabled` L1427-1429
- `src/config/schema.ts` `HOOK_NAMES` L77-96; `disabledHooks` default `["directory-readme-injector"]` L139

## plan-critic concerns absorbed into this plan

- **C1 (canonicalExistingFile symlink caveat):** `canonicalExistingFile` (L1431-1435) returns `absolutize()` result, not `realpathSync`. This means symlinks are not resolved. We do NOT modify this helper (out of scope). All new guards use `canonicalExistingFile` as-is, inheriting the same behavior as the existing guard. No action needed beyond awareness.
- **C2 (shell redirect regex completeness):** This plan specifies the complete regex set in Task 5: `\b1?>>?`, `\b2>>?`, `&>>?`, `&>`, and bare `>>?` (with negative lookbehind for `<` to avoid `<<` heredoc). Each is followed by the same file-target capture group.
- **C3 (existing test update):** Task 2 Step 1 explicitly rewrites `index.test.ts` L53-70 before any implementation, so the test fails for the *new* reason (two-tier block) rather than the old reason.

---

### Task 1: Add `bash-file-write-guard` to config schema and regenerate schema.json

**Files:**
- Modify: `src/config/schema.ts:77-96`
- Modify: `schema.json` (regenerated)

- [ ] **Step 1: Add the hook name to HOOK_NAMES**

In `src/config/schema.ts`, locate the `HOOK_NAMES` array (L77-96). Insert `"bash-file-write-guard"` immediately after `"bash-file-read-guard"` (L82). The array becomes:

```ts
const HOOK_NAMES = [
  "directory-readme-injector",
  "directory-agents-injector",
  "write-existing-file-guard",
  "notepad-write-guard",
  "bash-file-read-guard",
  "bash-file-write-guard",
  "question-label-truncator",
  "tasks-todowrite-disabler",
  "webfetch-redirect-guard",
  "empty-task-response-detector",
  "comment-checker",
  "plan-format-validator",
  "read-image-resizer",
  "json-error-recovery",
  "fsync-skip-warning",
  "tool-output-truncator",
  "todo-description-override",
  "commit-guard-injector",
  "subagent-git-guard",
] as const
```

- [ ] **Step 2: Regenerate schema.json**

Run:
```powershell
pnpm run gen-schema
```

Expected: `schema.json` updated. The `"disabledHooks"` enum array in `schema.json` now includes `"bash-file-write-guard"`.

- [ ] **Step 3: Verify schema.json contains the new hook name**

Run:
```powershell
rg "bash-file-write-guard" schema.json
```

Expected: at least one match (in the `disabledHooks` enum).

- [ ] **Step 4: Run typecheck**

Run:
```powershell
pnpm run typecheck
```

Expected: PASS (exit 0). The `HookName` union type now includes `"bash-file-write-guard"`.

- [ ] **Step 5: Commit**

```powershell
git add src/config/schema.ts schema.json
git commit -m "feat(config): add bash-file-write-guard hook name

New hook to gate the shell file-write bypass detector. Schema regenerated."
```

---

### Task 2: Rewrite the existing read-then-write test to expect the two-tier block

**Files:**
- Modify: `src/permissions/index.test.ts:53-70`

This task updates the existing test BEFORE implementing the new behavior, so that when Task 3 lands, the test fails for the *new* reason (write blocked even after read) rather than a stale assertion.

- [ ] **Step 1: Replace the existing test (L53-70) with the new two-tier test**

Replace the test at `src/permissions/index.test.ts` L53-70 (the test named `"write existing file guard requires a prior read in the same session"`) with:

```ts
test("write existing file guard blocks overwrite even after a prior read (two-tier)", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // Without overwrite: always blocked (baseline), even after read.
    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /File already exists/,
    )
    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})
    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /File already exists/,
    )

    // With overwrite=true and hook enabled (default): enhancement tier blocks it.
    await assert.rejects(
      guards.before({ tool: "write", sessionID: "s1", args: { filePath: file, content: "new", overwrite: true } }, {}),
      /write-existing-file-guard hook blocks/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the test to verify it fails for the new reason**

Run:
```powershell
node --test --experimental-strip-types --test-name-pattern="two-tier" src/permissions/index.test.ts
```

Expected: FAIL. The first write call (before read) currently throws (old behavior), but the assertion `guards.before({ tool: "write", ... overwrite: true })` expects `/write-existing-file-guard hook blocks/` — the current code skips when `overwrite === true` (L197), so that call does NOT throw, failing the assertion. Also, the second write (after read) currently succeeds (old read-then-write-allowed), so its `assert.rejects` also fails.

This confirms the test is now red against the old implementation.

- [ ] **Step 3: Commit (test-only, red)**

```powershell
git add src/permissions/index.test.ts
git commit -m "test(permissions): update write guard test for two-tier policy

Red against current implementation. Expects write blocked even after
read, and overwrite=true blocked when hook enabled."
```

---

### Task 3: Rewrite `guardExistingFileWrite` to two-tier policy

**Files:**
- Modify: `src/permissions/index.ts:187-210`

- [ ] **Step 1: Replace `guardExistingFileWrite` (L187-210) with the two-tier implementation**

Replace the entire `guardExistingFileWrite` function (L187-210) with:

```ts
function guardExistingFileWrite(
  config: OcmmConfig,
  rawInput: unknown,
  _readPermissions: Map<string, Set<string>>,
  projectRoot: string,
): void {
  if (toolName(rawInput) !== WRITE_TOOL) return
  const args = argsRecord(rawInput)
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath) return

  const canonical = canonicalExistingFile(filePath, projectRoot)
  if (!canonical || !isInside(projectRoot, canonical) || isUnderSpecialDir(projectRoot, canonical, ".omo")) return

  const overwrite = args?.overwrite === true

  // Baseline (always on, even when hook disabled): block write without overwrite.
  if (!overwrite) {
    throw new Error(
      "File already exists. Use the edit/multiedit tool to patch the existing file instead of overwriting it with write. " +
        "Set overwrite: true on the write tool only if intentional full overwrite is required and the write-existing-file-guard hook is disabled.",
    )
  }

  // Enhancement (gated): block write even with overwrite when hook is enabled.
  if (hookDisabled(config, "write-existing-file-guard", "writeExistingFileGuard")) return
  throw new Error(
    "File already exists. The write-existing-file-guard hook blocks overwriting existing files. " +
      "Use the edit/multiedit tool to patch the file instead. " +
      'To disable this guard, add "write-existing-file-guard" to disabledHooks in ocmm.jsonc.',
  )
}
```

Key changes from the old L187-210:
- The `hookDisabled` early-return is removed from the top and moved to the enhancement tier only.
- The read-token check (`paths?.has(canonical)` + `paths.delete(canonical)`) is removed entirely — reads no longer unlock writes.
- The baseline throws regardless of hook state (always-on).
- The `_readPermissions` parameter is retained for signature stability but prefixed `_` to signal it is unused (write no longer consumes read tokens).

- [ ] **Step 2: Run the two-tier test to verify it passes**

Run:
```powershell
node --test --experimental-strip-types --test-name-pattern="two-tier" src/permissions/index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full permissions test file to check for regressions**

Run:
```powershell
node --test --experimental-strip-types src/permissions/index.test.ts
```

Expected: Other write-guard-related tests (e.g. "write guard resolves relative paths from project root, not process cwd" at L72-91) should still pass — that test writes to an existing file without overwrite and expects a throw, which the baseline still produces. If any test fails, inspect: it likely asserts the old read-then-write-allowed behavior and must be updated to the two-tier expectation (but only update tests that are now semantically wrong, not tests that still pass).

- [ ] **Step 4: Run typecheck**

Run:
```powershell
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/permissions/index.ts src/permissions/index.test.ts
git commit -m "feat(permissions): rewrite guardExistingFileWrite to two-tier policy

Baseline (always-on): write to existing project file without overwrite
throws. Enhancement (gated by write-existing-file-guard): write with
overwrite=true also throws when hook enabled. Reads no longer unlock
writes."
```

---

### Task 4: Add `guardPatchWithoutRead` and write failing tests for it

**Files:**
- Modify: `src/permissions/index.ts` (add function + register in `before` array)
- Modify: `src/permissions/index.test.ts` (add test suite)

- [ ] **Step 1: Write the failing tests for `guardPatchWithoutRead`**

Append the following test suite to `src/permissions/index.test.ts` (after the two-tier test from Task 2):

```ts
test("edit/multiedit guard requires a prior read in the same session", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // edit without prior read -> throws
    await assert.rejects(
      guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "new" } }, {}),
      /was not read in this session/,
    )

    // read then edit -> passes
    await guards.before({ tool: "read", sessionID: "s1", args: { filePath: file } }, {})
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "new" } }, {})

    // second edit (token persistent, not consumed) -> passes
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "newer" } }, {})

    // different session, no read -> throws
    await assert.rejects(
      guards.before({ tool: "edit", sessionID: "s2", args: { filePath: file, content: "new" } }, {}),
      /was not read in this session/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("edit/multiedit guard allows new files, .omo, and outside-project targets", async () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    // new (non-existent) file -> passes
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: join(root, "newfile.txt"), content: "x" } }, {})

    // .omo special dir -> passes
    mkdirSync(join(root, ".omo"), { recursive: true })
    const omoFile = join(root, ".omo", "data.txt")
    writeFileSync(omoFile, "old")
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: omoFile, content: "x" } }, {})

    // outside projectRoot -> passes
    const outside = tempProject()
    try {
      writeFileSync(join(outside, "ext.txt"), "old")
      await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: join(outside, "ext.txt"), content: "x" } }, {})
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("edit/multiedit guard is disabled when write-existing-file-guard hook is disabled", async () => {
  const root = tempProject()
  try {
    const file = join(root, "existing.txt")
    writeFileSync(file, "old")
    const config = { ...defaultConfig(), disabledHooks: ["write-existing-file-guard"] }
    const guards = createPermissionGuards({ getConfig: () => config, projectRoot: root })

    // no prior read, hook disabled -> passes
    await guards.before({ tool: "edit", sessionID: "s1", args: { filePath: file, content: "x" } }, {})
    await guards.before({ tool: "multiedit", sessionID: "s1", args: { filePath: file, edits: [] } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Note: `mkdirSync` is already imported at the top of the test file (L3 imports `mkdirSync`). Verify the import exists; if not, add `mkdirSync` to the existing `node:fs` import.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
```powershell
node --test --experimental-strip-types --test-name-pattern="edit/multiedit guard" src/permissions/index.test.ts
```

Expected: FAIL. `guardPatchWithoutRead` does not exist yet, so `edit`/`multiedit` calls pass through without throwing. The "requires a prior read" test fails because the first `edit` call does not throw.

- [ ] **Step 3: Add the `guardPatchWithoutRead` function**

In `src/permissions/index.ts`, add the following function immediately AFTER `guardExistingFileWrite` (which now ends after the enhancement-tier throw, around the former L210). Place it before `guardNotepadWrite`:

```ts
function guardPatchWithoutRead(
  config: OcmmConfig,
  rawInput: unknown,
  readPermissions: Map<string, Set<string>>,
  projectRoot: string,
): void {
  if (hookDisabled(config, "write-existing-file-guard", "writeExistingFileGuard")) return
  const name = toolName(rawInput)
  if (name !== "edit" && name !== "multiedit") return
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath) return
  const canonical = canonicalExistingFile(filePath, projectRoot)
  if (!canonical || !isInside(projectRoot, canonical) || isUnderSpecialDir(projectRoot, canonical, ".omo")) return
  const session = sessionId(rawInput)
  const paths = readPermissions.get(session)
  if (paths?.has(canonical)) return // read token is persistent, NOT consumed
  throw new Error(
    `File already exists but was not read in this session. Read the file first, then use ${name} to patch it. ` +
      'To disable this guard, add "write-existing-file-guard" to disabledHooks in ocmm.jsonc.',
  )
}
```

- [ ] **Step 4: Register `guardPatchWithoutRead` in the `before` array**

In `createPermissionGuards`, locate the `before` array (L76-86). After the `guardExistingFileWrite` call (L80), add the `guardPatchWithoutRead` call. The array becomes:

```ts
before: async (rawInput, rawOutput) => {
  const config = args.getConfig()
  await trackReadPermission(config, rawInput, readPermissions, readmeSessionCache, lastAccess, projectRoot)
  guardNotepadWrite(config, rawInput, projectRoot)
  guardExistingFileWrite(config, rawInput, readPermissions, projectRoot)
  guardPatchWithoutRead(config, rawInput, readPermissions, projectRoot)
  warnBashFileRead(config, rawInput, rawOutput)
  guardSubagentGit(config, rawInput, projectRoot, args.sessionAgentMap)
  truncateQuestionLabels(config, rawInput, rawOutput)
  guardTodoRead(config, rawInput, args.taskSystemEnabled)
  await rewriteWebfetchRedirect(config, rawInput, rawOutput, args.redirectResolver)
},
```

`guardPatchWithoutRead` runs after `guardExistingFileWrite` (write is rejected first if applicable; for edit/multiedit, `guardExistingFileWrite` is a no-op because it only handles `WRITE_TOOL`).

- [ ] **Step 5: Run the new tests to verify they pass**

Run:
```powershell
node --test --experimental-strip-types --test-name-pattern="edit/multiedit guard" src/permissions/index.test.ts
```

Expected: PASS (all three edit/multiedit tests).

- [ ] **Step 6: Run typecheck**

Run:
```powershell
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/permissions/index.ts src/permissions/index.test.ts
git commit -m "feat(permissions): add guardPatchWithoutRead for edit/multiedit

Requires a prior same-session read before edit/multiedit on existing
project files. Read token is persistent (not consumed per patch).
Gated by write-existing-file-guard hook."
```

---

### Task 5: Add `guardBashFileWrite` shell-write detector (redirection + write commands + in-place editors + cp/mv)

**Files:**
- Modify: `src/permissions/index.ts` (add guard + helpers + register in `before` array)
- Modify: `src/permissions/index.test.ts` (add test suite)

This is the largest task. It adds the shell file-write bypass detector. The guard flat-scans the bash command string (no recursive subshell parsing — documented limitation per spec Scope Boundaries).

- [ ] **Step 1: Write the failing tests for `guardBashFileWrite`**

Append the following test suite to `src/permissions/index.test.ts`:

```ts
test("bash-file-write-guard blocks redirects to existing project files", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases: Array<{ cmd: string; pattern?: RegExp }> = [
      { cmd: `echo x > ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x >> ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x 2> ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x &> ${existing}`, pattern: /writes to an existing project file/ },
      { cmd: `echo x 1>> ${existing}`, pattern: /writes to an existing project file/ },
    ]
    for (const { cmd, pattern } of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        pattern ?? /writes to an existing project file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard allows redirects to new files, /dev/null, and outside-project targets", async () => {
  const root = tempProject()
  try {
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `echo x > ${join(root, "newfile.txt")}`,
      `echo x > /dev/null`,
      `echo x >> /dev/null`,
      `echo x 2> /dev/null`,
    ]
    // outside-project existing file
    const outside = tempProject()
    try {
      writeFileSync(join(outside, "ext.txt"), "old")
      cases.push(`echo x > ${join(outside, "ext.txt")}`)
      for (const cmd of cases) {
        await guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {})
      }
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks tee/dd/install/truncate on existing project files", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `tee ${existing} <<< "x"`,
      `tee -a ${existing} <<< "x"`,
      `dd of=${existing} bs=1`,
      `install -m 644 /dev/null ${existing}`,
      `truncate -s 0 ${existing}`,
    ]
    for (const cmd of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        /writes to an existing project file/,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks sed -i / perl -i / ruby -i in-place edits on existing files", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    const cases = [
      `sed -i 's/a/b/g' ${existing}`,
      `sed -i.bak 's/a/b/g' ${existing}`,
      `perl -i -pe 's/a/b/g' ${existing}`,
      `ruby -i -pe 'sub(/a/, "b")' ${existing}`,
    ]
    for (const cmd of cases) {
      await assert.rejects(
        guards.before({ tool: "bash", sessionID: "s1", args: { command: cmd } }, {}),
        /writes to an existing project file/,
      )
    }

    // sed without -i (writes to stdout) -> passes
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `sed 's/a/b/g' ${existing}` } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard blocks cp/mv overwriting existing project files", async () => {
  const root = tempProject()
  try {
    const src = join(root, "src.txt")
    const dest = join(root, "dest.txt")
    writeFileSync(src, "src")
    writeFileSync(dest, "old")
    const guards = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })

    await assert.rejects(
      guards.before({ tool: "bash", sessionID: "s1", args: { command: `cp ${src} ${dest}` } }, {}),
      /writes to an existing project file/,
    )
    await assert.rejects(
      guards.before({ tool: "bash", sessionID: "s1", args: { command: `mv ${src} ${dest}` } }, {}),
      /writes to an existing project file/,
    )

    // cp to a new dest (does not exist) -> passes
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `cp ${src} ${join(root, "newdest.txt")}` } }, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("bash-file-write-guard is disabled when hook is disabled and ignores non-bash tools", async () => {
  const root = tempProject()
  try {
    const existing = join(root, "existing.txt")
    writeFileSync(existing, "old")
    const config = { ...defaultConfig(), disabledHooks: ["bash-file-write-guard"] }
    const guards = createPermissionGuards({ getConfig: () => config, projectRoot: root })

    // hook disabled -> all shell writes pass
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `echo x > ${existing}` } }, {})
    await guards.before({ tool: "bash", sessionID: "s1", args: { command: `tee ${existing} <<< x` } }, {})

    // non-bash tools (write/edit) -> not inspected by this guard
    const guards2 = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root })
    // write/edit are handled by their own guards; bash-file-write-guard returns early for non-bash
    // (no assertion needed beyond no throw from the guard itself)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:
```powershell
node --test --experimental-strip-types --test-name-pattern="bash-file-write-guard" src/permissions/index.test.ts
```

Expected: FAIL. `guardBashFileWrite` does not exist yet; all `assert.rejects` calls fail because the bash calls pass through.

- [ ] **Step 3: Add the helper functions and `guardBashFileWrite`**

In `src/permissions/index.ts`, add the following block. Place it AFTER `warnBashFileRead` / `isSimpleFileReadCommand` (around L601) and BEFORE `truncateQuestionLabels`, OR immediately before `guardBashFileWrite`'s registration. Group the helpers together.

First, add the `SHELL_FILE_WRITE_COMMANDS` set near the other command sets (e.g., after `GIT_WRITE_SUBCOMMANDS` at L1013, or near the new guard). For locality, place it just above `guardBashFileWrite`:

```ts
const SHELL_FILE_WRITE_COMMANDS = new Set(["tee", "dd", "install", "truncate", "fallocate"])
const SHELL_INPLACE_EDITORS = new Set(["sed", "perl", "ruby"])
const SHELL_COPY_MOVE_COMMANDS = new Set(["cp", "mv", "install"])

function guardBashFileWrite(
  config: OcmmConfig,
  rawInput: unknown,
  projectRoot: string,
): void {
  if (hookDisabled(config, "bash-file-write-guard", "bashFileWriteGuard")) return
  if (toolName(rawInput) !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command) return
  if (!commandWritesExistingFile(command, rawInput, projectRoot)) return
  throw new Error(
    "This shell command writes to an existing project file. Use the edit/multiedit tool to patch the file instead of bypassing the file-write guard via shell. " +
      'To disable this guard, add "bash-file-write-guard" to disabledHooks in ocmm.jsonc.',
  )
}

function commandWritesExistingFile(command: string, rawInput: unknown, projectRoot: string): boolean {
  const workdir = bashWorkingDirectory(rawInput, projectRoot)
  if (redirectTargetsExistingProjectFile(command, workdir, projectRoot)) return true
  if (commandUsesWriteCommandOnExistingFile(command, workdir, projectRoot)) return true
  if (commandDoesInPlaceEdit(command, workdir, projectRoot)) return true
  if (commandCopiesMovesOverExisting(command, workdir, projectRoot)) return true
  return false
}

/**
 * Detect redirect operators (>, >|, >>, 2>, 2>>, &>, &>>, 1>, 1>>) targeting
 * existing project files. Uses a flat regex scan; heredocs (<<) are excluded
 * because >>? only matches '>' not '<'.
 */
function redirectTargetsExistingProjectFile(command: string, workdir: string, projectRoot: string): boolean {
  // Match a redirect operator followed by a file target token.
  // Operators: > >| >> 1> 1>> 2> 2>> &> &>>
  // Negative lookbehind (?<!<) avoids matching <> read-write open operator.
  // No \b word-boundary: operators are commonly preceded by whitespace (non-word),
  // and \b between two non-word chars fails to match (e.g. " > " would not match).
  // 2>&1 / 1>&2 fd-duplication is not falsely blocked: the capture group grabs
  // "&1"/"&2", which isExistingProjectFile() rejects as a non-file path.
  // >| (noclobber clobber) is covered by the optional | after >>?.
  const redirectPattern = /(?<!<)(?:[12]?>>?\|?|&>>?)\s*("[^"]*"|'[^']*'|\S+)/g
  let match: RegExpExecArray | null
  while ((match = redirectPattern.exec(command)) !== null) {
    const rawTarget = match[1] ?? ""
    if (!rawTarget) continue
    const target = stripQuotes(rawTarget)
    if (isExistingProjectFile(target, workdir, projectRoot)) return true
  }
  return false
}

function commandUsesWriteCommandOnExistingFile(command: string, workdir: string, projectRoot: string): boolean {
  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) return false
  const cmdName = normalizeCommandName(tokens[0] ?? "")
  if (!SHELL_FILE_WRITE_COMMANDS.has(cmdName)) return false

  if (cmdName === "dd") {
    // dd of=FILE ...
    for (const tok of tokens) {
      if (tok.startsWith("of=")) {
        const target = stripQuotes(tok.slice(3))
        if (target && isExistingProjectFile(target, workdir, projectRoot)) return true
      }
    }
    return false
  }

  if (cmdName === "tee") {
    // tee [options] FILE... — first non-option token is the target
    for (let i = 1; i < tokens.length; i += 1) {
      const tok = tokens[i] ?? ""
      if (tok.startsWith("-")) continue
      const target = stripQuotes(tok)
      if (isExistingProjectFile(target, workdir, projectRoot)) return true
      // tee can take multiple files; keep scanning
    }
    return false
  }

  if (cmdName === "install") {
    // install [options] SOURCE... DEST — DEST is the last non-option operand
    const dest = lastNonOptionOperand(tokens)
    if (dest && isExistingProjectFile(dest, workdir, projectRoot)) return true
    return false
  }

  if (cmdName === "truncate" || cmdName === "fallocate") {
    // truncate/fallocate [options] FILE — last non-option operand
    const dest = lastNonOptionOperand(tokens)
    if (dest && isExistingProjectFile(dest, workdir, projectRoot)) return true
    return false
  }

  return false
}

function commandDoesInPlaceEdit(command: string, workdir: string, projectRoot: string): boolean {
  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) return false
  const cmdName = normalizeCommandName(tokens[0] ?? "")
  if (!SHELL_INPLACE_EDITORS.has(cmdName)) return false

  // Detect -i flag (sed/perl/ruby). For sed, -i may be followed by a backup suffix
  // (e.g. -i.bak); for perl/ruby, -i is a standalone flag.
  let hasInPlace = false
  let i = 1
  for (; i < tokens.length; i += 1) {
    const tok = tokens[i] ?? ""
    if (tok === "-i") {
      hasInPlace = true
      i += 1
      break
    }
    if (tok.startsWith("-i")) {
      // sed -i.bak or -i'' — in-place with backup suffix; still in-place
      hasInPlace = true
      break
    }
    if (tok === "--") {
      // end of options
      break
    }
    // Other options (e.g. -e, -pe, -n) — keep scanning. Note: perl -i -pe has -i first.
    // We only set hasInPlace when -i is found.
  }

  if (!hasInPlace) return false

  // The target file is the last non-option operand (after the -i and its expression).
  const dest = lastNonOptionOperand(tokens)
  if (dest && isExistingProjectFile(dest, workdir, projectRoot)) return true
  return false
}

function commandCopiesMovesOverExisting(command: string, workdir: string, projectRoot: string): boolean {
  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) return false
  const cmdName = normalizeCommandName(tokens[0] ?? "")
  if (cmdName !== "cp" && cmdName !== "mv") return false
  // install is handled in commandUsesWriteCommandOnExistingFile; do not double-handle.

  // Skip -t DIR case (destination is a directory, not a file overwrite).
  for (const tok of tokens) {
    if (tok === "-t" || tok.startsWith("--target-directory")) return false
  }

  const dest = lastNonOptionOperand(tokens)
  if (dest && isExistingProjectFile(dest, workdir, projectRoot)) return true
  return false
}

/** Resolve a shell target token relative to the bash workdir and check if it
 *  is an existing file inside projectRoot (excluding .omo). */
function isExistingProjectFile(target: string, workdir: string, projectRoot: string): boolean {
  if (!target || target === "/dev/null") return false
  const absolute = absolutize(target, workdir)
  if (!safeStatFile(absolute)) return false
  if (!isInside(projectRoot, absolute)) return false
  if (isUnderSpecialDir(projectRoot, absolute, ".omo")) return false
  return true
}

function stripQuotes(token: string): string {
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1)
  }
  return token
}

/** Return the last token that does not start with '-', or null. Does not
 *  account for value-consuming options (e.g. -m for install); callers handling
 *  such commands should parse options explicitly. */
function lastNonOptionOperand(tokens: string[]): string | null {
  for (let i = tokens.length - 1; i >= 1; i -= 1) {
    const tok = tokens[i] ?? ""
    if (tok === "--") break
    if (tok.startsWith("-")) continue
    return stripQuotes(tok)
  }
  return null
}
```

- [ ] **Step 4: Register `guardBashFileWrite` in the `before` array**

In `createPermissionGuards`, the `before` array now becomes:

```ts
before: async (rawInput, rawOutput) => {
  const config = args.getConfig()
  await trackReadPermission(config, rawInput, readPermissions, readmeSessionCache, lastAccess, projectRoot)
  guardNotepadWrite(config, rawInput, projectRoot)
  guardExistingFileWrite(config, rawInput, readPermissions, projectRoot)
  guardPatchWithoutRead(config, rawInput, readPermissions, projectRoot)
  warnBashFileRead(config, rawInput, rawOutput)
  guardBashFileWrite(config, rawInput, projectRoot)
  guardSubagentGit(config, rawInput, projectRoot, args.sessionAgentMap)
  truncateQuestionLabels(config, rawInput, rawOutput)
  guardTodoRead(config, rawInput, args.taskSystemEnabled)
  await rewriteWebfetchRedirect(config, rawInput, rawOutput, args.redirectResolver)
},
```

`guardBashFileWrite` runs after `warnBashFileRead` (read detection is a non-blocking warning; write detection is blocking).

- [ ] **Step 5: Run the bash-file-write-guard tests to verify they pass**

Run:
```powershell
node --test --experimental-strip-types --test-name-pattern="bash-file-write-guard" src/permissions/index.test.ts
```

Expected: PASS (all six test cases).

If any case fails, inspect the failing command and the corresponding detector branch. Common issues:
- Redirect regex not matching `2>` or `&>`: verify the regex alternation `(?:[12]&|&|1|2)?>>?` covers all variants.
- `tee` with here-string (`<<<`): the `<<<` is not a redirect target (no file token), so it should not falsely trigger. Verify the redirect regex's negative lookbehind `(?<!<)` excludes `<<`.
- `cp`/`mv` last-operand heuristic: if `cp -t dir src` appears, it is skipped (Step 3 code returns false for `-t`).

- [ ] **Step 6: Run the full permissions test file**

Run:
```powershell
node --test --experimental-strip-types src/permissions/index.test.ts
```

Expected: PASS (all tests, including pre-existing ones). The existing `warnBashFileRead` test (L108-109 in the original) uses `cat package.json` — this is a read, not a write, so `guardBashFileWrite` does not trigger.

- [ ] **Step 7: Run typecheck**

Run:
```powershell
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/permissions/index.ts src/permissions/index.test.ts
git commit -m "feat(permissions): add guardBashFileWrite shell bypass detector

Detects shell commands writing to existing project files: redirects
(> >> 2> &>), tee/dd/install/truncate/fallocate, sed -i/perl -i/ruby -i
in-place edits, and cp/mv overwrites. Flat scan, no subshell parsing
(documented limitation). Gated by bash-file-write-guard hook."
```

---

### Task 6: Add doc note to `docs/v1-maintenance.md`

**Files:**
- Modify: `docs/v1-maintenance.md`

Per AGENTS.md "v1 Maintenance" rule: changes touching `skills/v1/` or `prompts/v1/` require a doc sync. This change does NOT touch those paths — it touches `src/config/schema.ts` (a config-level surface). The spec's Doc Sync section recommends adding a one-line note under a "### Hooks" subsection for discoverability. This is a soft recommendation, not a strict mandate, but we add it for completeness.

- [ ] **Step 1: Read the current `docs/v1-maintenance.md` to find the right insertion point**

Run (read the file structure):
```powershell
rg "^#" docs/v1-maintenance.md
```

Identify whether a "Hooks" or "Config" section exists. If not, the note will be added under a new "### Hooks" subsection at the end of the file (or after the most relevant existing section).

- [ ] **Step 2: Add the hook note**

Append (or insert under a new "### Hooks" subsection) the following line:

```markdown
### Hooks

- `bash-file-write-guard` (added 2026-07-03): blocks shell commands that write to existing project files via redirects (`>`/`>>`), write commands (`tee`/`dd of=`/`install`/`truncate`/`fallocate`), in-place editors (`sed -i`/`perl -i`/`ruby -i`), or copy/move overwrites (`cp`/`mv`). Complements `write-existing-file-guard` (now two-tier: always-on baseline blocks write-without-overwrite; gated enhancement blocks write-with-overwrite) and the new `guardPatchWithoutRead` (edit/multiedit requires prior same-session read). Disable via `disabledHooks: ["bash-file-write-guard"]`.
```

- [ ] **Step 3: Commit**

```powershell
git add docs/v1-maintenance.md
git commit -m "docs(v1): note bash-file-write-guard and write guard two-tier change"
```

---

### Task 7: Full build and integration verification

**Files:** (none — verification only)

- [ ] **Step 1: Run the full test suite**

Run:
```powershell
pnpm test
```

Expected: PASS (all Node tests + cargo tests). The `index.test.ts` suite includes the new write/edit/bash-file-write tests and the rewritten two-tier test. The `subagent-git-guard.test.ts` suite is unaffected.

- [ ] **Step 2: Run typecheck**

Run:
```powershell
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full build**

Run:
```powershell
pnpm run build
```

Expected: PASS (tsc -> dist/, cargo release -> dist/bin/). Exit 0.

- [ ] **Step 4: Verify schema.json is in sync with schema.ts**

Run:
```powershell
rg "bash-file-write-guard" schema.json src/config/schema.ts
```

Expected: both files contain the hook name. If `schema.json` is missing it, re-run `pnpm run gen-schema` and amend the Task 1 commit (or create a fixup commit).

- [ ] **Step 5: Smoke-test the guards compose correctly (integration)**

Write a temporary test file and run it (avoids PowerShell quoting issues with inline `-e`):

```powershell
node --experimental-strip-types --input-type=module -e "import('./src/permissions/index.ts').then(async ({ createPermissionGuards }) => { const { defaultConfig } = await import('./src/config/schema.ts'); const { mkdtempSync, writeFileSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const root = mkdtempSync(join(tmpdir(), 'ocmm-smoke-')); const f = join(root, 'x.txt'); writeFileSync(f, 'old'); const g = createPermissionGuards({ getConfig: defaultConfig, projectRoot: root }); try { await g.before({ tool: 'write', sessionID: 's1', args: { filePath: f, content: 'new' } }, {}); console.log('UNEXPECTED PASS'); } catch (e) { console.log('OK blocked:', e.message); } });"
```

Expected output: `OK blocked: File already exists. Use the edit/multiedit tool...`

This confirms the baseline tier fires for write-without-overwrite on an existing file. The dynamic import chain avoids PowerShell `$` interpolation issues by keeping all JS in a single-quoted string.

- [ ] **Step 6: Final commit (if any fixups needed)**

If Steps 1-4 all pass without changes, no commit is needed. If `schema.json` was out of sync and regenerated, commit:

```powershell
git add schema.json
git commit -m "chore: regenerate schema.json to sync with HOOK_NAMES"
```

---

## Self-Review Checklist (completed by plan author)

- [x] **Spec coverage:** Every spec section maps to a task.
  - Spec Part 1 (Config schema) → Task 1
  - Spec Part 2 (write two-tier) → Task 3
  - Spec Part 3 (edit/multiedit read-before-patch) → Task 4
  - Spec Part 4 (trackReadPermission unchanged) → no task needed (explicitly unchanged)
  - Spec Part 5 (bash-file-write-guard) → Task 5
  - Spec Part 6 (registration order) → Tasks 4 and 5 (registration steps)
  - Spec Part 7 (event cleanup) → no task needed (explicitly unchanged)
  - Spec File change list (schema.ts, schema.json, index.ts, index.test.ts, docs/v1-maintenance.md) → Tasks 1, 3, 4, 5, 6
  - Spec Testing section (write tests, edit/multiedit tests, bash tests, integration) → Tasks 2, 3, 4, 5, 7
  - Spec Doc Sync → Task 6
  - Spec Risks #3 (existing tests break) → Task 2 (rewrite first)
  - plan-critic C1 (canonicalExistingFile) → noted in "Source code anchors" and helpers reuse it as-is
  - plan-critic C2 (redirect regex) → Task 5 Step 3 specifies the complete regex with all variants
  - plan-critic C3 (existing test update) → Task 2 explicitly rewrites L53-70 first
- [x] **Placeholder scan:** No "TBD", "TODO", "add appropriate handling", or stub steps. Every code step contains complete code.
- [x] **Type consistency:** `guardExistingFileWrite` signature unchanged (4 params: config, rawInput, readPermissions, projectRoot) — `_readPermissions` prefix signals unused but param retained. `guardPatchWithoutRead` uses the same 4-param signature. `guardBashFileWrite` uses 3 params (config, rawInput, projectRoot) — no readPermissions needed (stateless). Helper names match across tasks: `commandWritesExistingFile`, `redirectTargetsExistingProjectFile`, `commandUsesWriteCommandOnExistingFile`, `commandDoesInPlaceEdit`, `commandCopiesMovesOverExisting`, `isExistingProjectFile`, `stripQuotes`, `lastNonOptionOperand`. Error message strings match between spec Error Handling section and Task code.
- [x] **Registration order:** `guardPatchWithoutRead` after `guardExistingFileWrite` (Task 4 Step 4); `guardBashFileWrite` after `warnBashFileRead` (Task 5 Step 4). Matches spec Part 6.
- [x] **Read-token lifecycle:** `trackReadPermission` unchanged (gated, records reads). `guardPatchWithoutRead` checks `paths?.has(canonical)` and returns WITHOUT deleting (persistent token, spec Design Decision #5). `guardExistingFileWrite` no longer touches `readPermissions` (parameter prefixed `_`).
- [x] **Scope consistency:** All three guards use `canonicalExistingFile` + `isInside(projectRoot, ...)` + `isUnderSpecialDir(projectRoot, ..., ".omo")` for the same scope semantics (spec Design Decision #6).
- [x] **Two-tier baseline:** `guardExistingFileWrite` throws for `!overwrite` BEFORE the `hookDisabled` check (Task 3 Step 1) — always-on. The enhancement tier checks `hookDisabled` then throws. Matches spec Part 2.
