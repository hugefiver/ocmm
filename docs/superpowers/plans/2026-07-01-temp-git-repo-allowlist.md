# Temp Git Repository Allowlist Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit agent/subagent git write operations only when they target disposable git repositories under the OS temp directory.

**Architecture:** Keep `isGitWriteCommand()` as the command classifier, then add a contextual allowlist in `guardSubagentGit()` that validates the effective git repository path. The allowlist uses existing quote-aware token/segment helpers and canonical temp-path checks.

**Tech Stack:** TypeScript, Node built-ins (`node:os`, `node:fs`, `node:path`), Node test runner.

---

### Task 1: Contextual Temp Repo Allowlist

**Files:**
- Modify: `src/permissions/index.ts`
- Test: `src/permissions/index.test.ts`

- [x] **Step 1: Add failing guard-path tests**

Add tests that construct `createPermissionGuards({ getConfig: configWithReadme, projectRoot, sessionAgentMap })` with `sessionAgentMap.set("s1", "coding")`. Create temp directories with `mkdtempSync(join(tmpdir(), "ocmm-temp-git-"))`, create valid temp git dirs by adding a `.git` directory containing a git marker such as `HEAD`, and call `guards.before({ tool: "bash", sessionID: "s1", args: { command, workdir } }, {})`.

Expected tests:

```ts
await guards.before({ tool: "bash", sessionID: "s1", args: { command: "git commit -m x", workdir: tempRepo } }, {})
await guards.before({ tool: "bash", sessionID: "s1", args: { command: `git -C "${tempRepo}" commit -m x`, workdir: projectRoot } }, {})
await assert.rejects(() => guards.before({ tool: "bash", sessionID: "s1", args: { command: "git commit -m x", workdir: tempNoRepo } }, {}), /subagent sessions/)
await assert.rejects(() => guards.before({ tool: "bash", sessionID: "s1", args: { command: `git -C "${projectRoot}" commit -m x`, workdir: tempRepo } }, {}), /subagent sessions/)
```

- [x] **Step 2: Implement temp repo detection**

In `src/permissions/index.ts`, import `realpathSync` from `node:fs` and `tmpdir` from `node:os`. Add helpers:

```ts
function bashWorkingDirectory(rawInput: unknown, projectRoot: string): string
function isTempGitRepositoryContext(directory: string, projectRoot: string): boolean
function findTempGitRoot(directory: string, tempRoot: string, projectRoot: string): string | null
```

Use `realpathSync()` where paths exist and fall back to `resolve()` only for option values that may not exist. Require the working directory and `.git` marker to remain under `tmpdir()` and disjoint from `projectRoot` (not inside AND not an ancestor containing). A `.git` directory or worktree `gitdir:` target must be a valid gitdir, not an empty temp directory. For standard `<repo>/.git` and linked-worktree admin gitdirs under `<repo>/.git/worktrees/<name>`, perform the disjointness check against `<repo>`, not only against the gitdir directory.

- [x] **Step 3: Implement git write target validation**

Add a private `gitWritesAllowedInTempRepo(command: string, baseDir: string, projectRoot: string): boolean` that tokenizes with `tokenizeGitCommand()`, recurses through wrappers, and checks each write segment. Direct git segments should process global `-C` options before the subcommand and reject the allowlist when any explicit `-C`, `--git-dir`, `--work-tree`, or `git -c core.worktree=...` override is missing, outside temp, inside `projectRoot`, or otherwise invalid. `GIT_DIR` / `GIT_WORK_TREE` environment assignments in supported forms use the same conservative validation and permanently deny the temp exception when invalid: PowerShell assignments must be unquoted segment-leading `$env:` statements, while `set GIT_DIR=...` / `set GIT_WORK_TREE=...` are recognized only inside `cmd /c` payloads.

- [x] **Step 4: Wire into `guardSubagentGit()`**

After `isGitWriteCommand(command)` returns true, compute the bash working directory and return early when `gitWritesAllowedInTempRepo(command, workdir, projectRoot)` is true. Existing main-agent allow behavior remains unchanged.

- [x] **Step 5: Update commit guard wording**

In `src/hooks/chat-message.ts`, update `COMMIT_GUARD_TEXT` to state that git writes are allowed without separate approval only inside disposable git repositories under the OS temp directory. Normal project/user repositories still require explicit user permission.

- [x] **Step 6: Verify**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec "src/permissions/index.test.ts" "src/permissions/subagent-git-guard.test.ts" "src/hooks/chat-message.test.ts"
pnpm run typecheck
```

Expected: all tests pass and typecheck exits 0.

## Self-Review

- Spec coverage: tests and implementation cover valid temp repo allow, temp non-repo block, project-root blocks even under temp, valid-gitdir enforcement, explicit/env override tainting, wrapper propagation, `git -C` temp allow, and `git -C` invalid/non-temp/project-root blocks.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: helper names in this plan match the intended TypeScript implementation names.
