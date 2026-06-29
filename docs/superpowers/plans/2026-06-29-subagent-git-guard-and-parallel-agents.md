# Subagent Git Guard & Parallel Agents Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `subagent-git-guard` hook that hard-blocks git write commands from subagent sessions, and fork the `dispatching-parallel-agents` skill into the v1 skill set so the orchestrator can dispatch parallel agents with awareness of this constraint.

**Architecture:** Part A adds a new permission guard that tracks session→agent mapping (via `chat.params`), then blocks git write commands in `tool.execute.before` when the session belongs to a non-builtin (subagent) session. Part B forks an upstream skill into the v1 skill directory and adds it to the v1 skill loader array, plus updates the orchestrator prompt to document subagent git limitations.

**Tech Stack:** TypeScript (Node 22+, `node --test --experimental-strip-types`), Zod schema, OpenCode plugin hooks.

**Spec:** `docs/superpowers/specs/2026-06-29-subagent-git-guard-and-parallel-agents-design.md`

---

### Task 1: Add `subagent-git-guard` hook name to schema

**Files:**
- Modify: `src/config/schema.ts:76-93`
- Regenerate: `schema.json`

- [ ] **Step 1: Add hook name to HOOK_NAMES**

In `src/config/schema.ts`, the `HOOK_NAMES` const tuple (L76-93) currently ends with `"commit-guard-injector",`. Add `"subagent-git-guard",` after it:

```ts
const HOOK_NAMES = [
  "directory-readme-injector",
  "directory-agents-injector",
  "write-existing-file-guard",
  "notepad-write-guard",
  "bash-file-read-guard",
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

Run: `pnpm run gen-schema`
Expected: `schema.json` updated to include `"subagent-git-guard"` in the `disabledHooks` enum.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/config/schema.ts schema.json
git commit -m "feat: add subagent-git-guard hook name"
```

---

### Task 2: Add `sessionAgentMap` to `createChatParamsHandler`

**Files:**
- Modify: `src/hooks/chat-params.ts:96-229`
- Modify: `src/hooks/chat-params.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/hooks/chat-params.test.ts`, add a test that verifies the handler records the session→agent mapping:

```ts
test("chat.params records sessionID → agentName in sessionAgentMap", async () => {
  const sessionAgentMap = new Map<string, string>()
  const getConfig = () => ({}) as unknown as OcmmConfig
  const handler = createChatParamsHandler({ getConfig, sessionAgentMap })
  const input = {
    sessionID: "ses_test_agent_map",
    agent: { name: "coding" },
    model: "hoo/test",
  }
  await handler(input)
  assert.equal(sessionAgentMap.get("ses_test_agent_map"), "coding")
})
```

Add `import { createChatParamsHandler } from "./chat-params.ts"` if not already present. Check existing imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/hooks/chat-params.test.ts`
Expected: FAIL — `createChatParamsHandler` does not accept `sessionAgentMap`.

- [ ] **Step 3: Add `sessionAgentMap` parameter to the handler**

In `src/hooks/chat-params.ts`, find the `createChatParamsHandler` function (L96). Change its signature to accept an optional `sessionAgentMap`:

```ts
export function createChatParamsHandler(opts: {
  getConfig: () => OcmmConfig
  sessionAgentMap?: Map<string, string>
}): (rawInput: unknown) => Promise<unknown> {
```

Then, after the line where `agentName` is resolved (around L106, `const agentName = typeof input.agent === "string" ? input.agent : input.agent.name`), add:

```ts
  if (opts.sessionAgentMap && input.sessionID) {
    opts.sessionAgentMap.set(input.sessionID, agentName)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/hooks/chat-params.test.ts`
Expected: PASS — new test passes, existing tests still pass.

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/chat-params.ts src/hooks/chat-params.test.ts
git commit -m "feat: track session→agent mapping in chat.params handler"
```

---

### Task 3: Implement `guardSubagentGit` and wire into permission guards

**Files:**
- Modify: `src/permissions/index.ts`
- Modify: `src/index.ts`
- Test: `src/permissions/index.test.ts` (or create a focused test file)

- [ ] **Step 1: Write the failing test for `guardSubagentGit`**

Create or extend a test file. If `src/permissions/index.test.ts` exists, add to it; otherwise create `src/permissions/subagent-git-guard.test.ts`. Test the guard logic directly:

```ts
import { describe, test } from "node:test"
import assert from "node:assert"
import { isGitWriteCommand, isBuiltinAgentName } from "./index.ts"

describe("isGitWriteCommand", () => {
  test("matches git commit", () => {
    assert.ok(isGitWriteCommand("git commit -m test"))
  })
  test("matches git push", () => {
    assert.ok(isGitWriteCommand("git push origin main"))
  })
  test("matches git tag", () => {
    assert.ok(isGitWriteCommand("git tag v1.0"))
  })
  test("matches git reset --hard", () => {
    assert.ok(isGitWriteCommand("git reset --hard HEAD~1"))
  })
  test("matches git rebase", () => {
    assert.ok(isGitWriteCommand("git rebase main"))
  })
  test("matches git cherry-pick", () => {
    assert.ok(isGitWriteCommand("git cherry-pick abc123"))
  })
  test("matches git revert", () => {
    assert.ok(isGitWriteCommand("git revert HEAD"))
  })
  test("does NOT match git status", () => {
    assert.ok(!isGitWriteCommand("git status"))
  })
  test("does NOT match git log", () => {
    assert.ok(!isGitWriteCommand("git log --oneline"))
  })
  test("does NOT match git diff", () => {
    assert.ok(!isGitWriteCommand("git diff"))
  })
  test("matches git commit after env var prefix", () => {
    assert.ok(isGitWriteCommand("$env:CI = \"true\"; git commit -m test"))
  })
  test("matches git commit after cd", () => {
    assert.ok(isGitWriteCommand("cd /tmp; git commit -m test"))
  })
})

describe("isBuiltinAgentName", () => {
  test("recognizes orchestrator", () => {
    assert.ok(isBuiltinAgentName("orchestrator"))
  })
  test("recognizes builder", () => {
    assert.ok(isBuiltinAgentName("builder"))
  })
  test("recognizes reviewer", () => {
    assert.ok(isBuiltinAgentName("reviewer"))
  })
  test("recognizes alias oracle as builtin", () => {
    assert.ok(isBuiltinAgentName("oracle"))
  })
  test("recognizes alias explore as builtin", () => {
    assert.ok(isBuiltinAgentName("explore"))
  })
  test("does NOT recognize coding (category, not builtin agent)", () => {
    assert.ok(!isBuiltinAgentName("coding"))
  })
  test("does NOT recognize deep (category, not builtin agent)", () => {
    assert.ok(!isBuiltinAgentName("deep"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/permissions/subagent-git-guard.test.ts`
Expected: FAIL — `isGitWriteCommand` and `isBuiltinAgentName` not exported.

- [ ] **Step 3: Implement `isGitWriteCommand` and `isBuiltinAgentName`**

In `src/permissions/index.ts`, add these functions. Place them near the other helper functions (around L587 area, before or after `hookDisabled`):

```ts
const GIT_WRITE_COMMAND_RE = /\bgit\s+(?:commit|push|tag|reset\s+--hard|rebase|cherry-pick|revert)\b/

/** Check if a shell command string contains a git write operation. */
export function isGitWriteCommand(command: string): boolean {
  return GIT_WRITE_COMMAND_RE.test(command)
}

/** Check if an agent name is a builtin agent (including aliases like oracle, explore). */
export function isBuiltinAgentName(name: string): boolean {
  if (BUILTIN_AGENT_INDEX.has(name)) return true
  // Check compat aliases (oracle→reviewer, explore→code-search)
  for (const { alias } of COMPAT_AGENT_ALIASES) {
    if (alias === name) return true
  }
  return false
}
```

Note: `BUILTIN_AGENT_INDEX` is imported from `../data/agents.ts` — verify it's already imported at the top of `permissions/index.ts`. `COMPAT_AGENT_ALIASES` is defined in `../hooks/config.ts` — you need to either import it or re-declare the alias list locally. Check if it's already exported from `config.ts`. If `COMPAT_AGENT_ALIASES` is NOT exported, either export it from `config.ts` or hardcode the alias names in `isBuiltinAgentName`:

```ts
const BUILTIN_AGENT_ALIASES = new Set(["oracle", "explore"])

export function isBuiltinAgentName(name: string): boolean {
  return BUILTIN_AGENT_INDEX.has(name) || BUILTIN_AGENT_ALIASES.has(name)
}
```

Use the hardcoded set approach to avoid cross-module coupling — it's a small, stable list.

- [ ] **Step 4: Implement `guardSubagentGit`**

In `src/permissions/index.ts`, add the guard function. Place it near the other guard functions (e.g., after `guardNotepadWrite` or before `createPermissionGuards`):

```ts
function guardSubagentGit(
  config: OcmmConfig,
  rawInput: unknown,
  sessionAgentMap?: Map<string, string>,
): void {
  if (hookDisabled(config, "subagent-git-guard", "subagentGitGuard")) return
  if (!sessionAgentMap) return
  if (toolName(rawInput) !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command) return
  if (!isGitWriteCommand(command)) return
  const sid = sessionId(rawInput)
  const agentName = sessionAgentMap.get(sid)
  if (!agentName) return // unknown session — safe default, don't block
  if (isBuiltinAgentName(agentName)) return // main agent — allow
  throw new Error(
    `ocmm: subagent sessions are not allowed to run git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert). The main agent must handle version control. (agent: ${agentName})`,
  )
}
```

- [ ] **Step 5: Wire `sessionAgentMap` into `createPermissionGuards`**

In `src/permissions/index.ts`, find the `createPermissionGuards` function (L59). Add `sessionAgentMap?: Map<string, string>` to its opts interface:

```ts
export function createPermissionGuards(args: {
  getConfig: () => OcmmConfig
  projectRoot: string
  taskSystemEnabled?: boolean
  redirectResolver?: (url: string) => string | null
  fsyncTracker?: Map<string, Set<string>>
  agentsSessionCache?: Map<string, Set<string>>
  sessionAgentMap?: Map<string, string>
}): {
```

Then in the `before` hook (L73-82), add the `guardSubagentGit` call. Add it after `warnBashFileRead` (so bash file-read checks still run first):

```ts
  const before: PluginHookHandler<"tool.execute.before"> = async (rawInput) => {
    const config = args.getConfig()
    trackReadPermission(config, rawInput, readPermissions, agentsSessionCache)
    guardNotepadWrite(config, rawInput)
    guardExistingFileWrite(config, rawInput, args.projectRoot)
    warnBashFileRead(config, rawInput)
    guardSubagentGit(config, rawInput, args.sessionAgentMap)  // NEW
    truncateQuestionLabels(config, rawInput)
    guardTodoRead(config, rawInput, args.taskSystemEnabled)
    rewriteWebfetchRedirect(config, rawInput, args.redirectResolver)
  }
```

- [ ] **Step 6: Wire `sessionAgentMap` into `createGuardEventHandler`**

In `src/permissions/index.ts`, find `createGuardEventHandler` (L110). Add `sessionAgentMap?: Map<string, string>` to its params:

```ts
function createGuardEventHandler(caches: {
  readPermissions: Map<string, Set<string>>
  readmeSessionCache: Map<string, Set<string>>
  lastAccess: Map<string, number>
  agentsSessionCache?: Map<string, Set<string>>
  sessionAgentMap?: Map<string, string>
}): ...
```

In the session cleanup logic (where `session.deleted`/`session.compacted` deletes map entries), add:

```ts
caches.sessionAgentMap?.delete(sid)
```

- [ ] **Step 7: Wire `sessionAgentMap` into `createPermissionGuards` event handler**

In `createPermissionGuards`, find where `createGuardEventHandler` is called (the `event` property, around L101-106). Add `sessionAgentMap: args.sessionAgentMap`:

```ts
  const event = createGuardEventHandler({
    readPermissions,
    readmeSessionCache,
    lastAccess,
    ...(agentsSessionCache ? { agentsSessionCache } : {}),
    ...(args.sessionAgentMap ? { sessionAgentMap: args.sessionAgentMap } : {}),
  })
```

- [ ] **Step 8: Wire `sessionAgentMap` into `createPlugin`**

In `src/index.ts`, find where `agentsSessionCache` is created (L113). Add `sessionAgentMap` creation right after:

```ts
  const agentsSessionCache = new Map<string, Set<string>>()
  const sessionAgentMap = new Map<string, string>()
```

Pass it to `createPermissionGuards` (L114-118):

```ts
  const permissionGuards = createPermissionGuards({
    getConfig,
    projectRoot: cwd,
    agentsSessionCache,
    sessionAgentMap,
  })
```

Pass it to `createChatParamsHandler` (L142):

```ts
  "chat.params": createChatParamsHandler({ getConfig, sessionAgentMap }),
```

- [ ] **Step 9: Run the new tests**

Run: `node --test --experimental-strip-types src/permissions/subagent-git-guard.test.ts`
Expected: PASS — all isGitWriteCommand and isBuiltinAgentName tests pass.

- [ ] **Step 10: Run full permission tests**

Run: `node --test --experimental-strip-types src/permissions/index.test.ts` (if exists)
Expected: PASS — no regressions.

- [ ] **Step 11: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/permissions/index.ts src/permissions/subagent-git-guard.test.ts src/index.ts
git commit -m "feat: block git write commands from subagent sessions"
```

---

### Task 4: Fork dispatching-parallel-agents skill

**Files:**
- Create: `skills/v1/dispatching-parallel-agents/SKILL.md`
- Modify: `src/intent/skill-loader.ts:49-55`

- [ ] **Step 1: Read the upstream skill**

Read `~/.config/opencode/skills/superpowers/dispatching-parallel-agents/SKILL.md` (full 182 lines). Understand its structure: frontmatter, when-to-use, how-to-create-focused-tasks, review/integration guidance.

- [ ] **Step 2: Fork into v1 skills**

Create `skills/v1/dispatching-parallel-agents/SKILL.md` with the upstream content. Apply these adjustments (based on the v1 maintenance pattern seen in other forked skills):
- Keep the frontmatter as the first bytes (required for OpenCode native slash skill loading).
- Remove any references to `executing-plans` or `using-git-worktrees` skills (excluded from v1).
- Remove any references to upstream-only tool names or omo-specific concepts.
- Keep the core content: when to dispatch, how to create focused agent tasks, review/integration.

- [ ] **Step 3: Add to V1_SKILL_DIRS**

In `src/intent/skill-loader.ts` L49-55, add `"dispatching-parallel-agents"` to the `V1_SKILL_DIRS` array:

```ts
const V1_SKILL_DIRS = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "receiving-code-review",
  "dispatching-parallel-agents",
] as const
```

- [ ] **Step 4: Verify the skill loads**

Run: `node --experimental-strip-types -e "import { loadV1Skills } from './src/intent/skill-loader.ts'; const s = loadV1Skills('.'); console.log(s.length, 'chars')"`
Expected: prints a char count (should be larger than before — the new skill adds content).

- [ ] **Step 5: Commit**

```bash
git add skills/v1/dispatching-parallel-agents/SKILL.md src/intent/skill-loader.ts
git commit -m "feat: fork dispatching-parallel-agents skill into v1 skill set"
```

---

### Task 5: Update orchestrator prompt with subagent git limitations

**Files:**
- Modify: `prompts/v1/agents/orchestrator.md`

- [ ] **Step 1: Read the current orchestrator prompt**

Read `prompts/v1/agents/orchestrator.md` in full. Find the section about delegation or subagent dispatch (likely in the "Delegation Table" or "Injected Skill Utilization" area).

- [ ] **Step 2: Add Subagent Git Limitations section**

After the delegation table or the subagent dispatch section, insert:

```markdown

### Subagent Git Limitations

Subagent sessions (category agents dispatched via task tool) are hard-blocked from running git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert). The `subagent-git-guard` hook enforces this at the `tool.execute.before` level.

When a subagent task requires committing:
1. The subagent should report what needs to be committed (files, message).
2. You (the orchestrator) handle the git operation directly, with explicit user permission.

Do not attempt to instruct subagents to commit. They cannot. If a subagent's work is complete and needs a commit, perform the commit yourself after the subagent returns its result.

The `dispatching-parallel-agents` skill describes how to create focused, independent subagent tasks. Use it when facing 2+ independent tasks with no shared state.
```

- [ ] **Step 3: Commit**

```bash
git add prompts/v1/agents/orchestrator.md
git commit -m "feat: document subagent git limitations in orchestrator prompt"
```

---

### Task 6: Sync docs/v1-maintenance.md

**Files:**
- Modify: `docs/v1-maintenance.md`

- [ ] **Step 1: Update Skills Source Mapping table**

In `docs/v1-maintenance.md`, the Skills Source Mapping table (L9-15) has 5 skill rows. Add a new row for `dispatching-parallel-agents`:

```markdown
| dispatching-parallel-agents | obra/superpowers/dispatching-parallel-agents | v6.0.3 | removed executing-plans and using-git-worktrees references; frontmatter kept as first bytes for OpenCode native slash skill loading | 2026-06-29 |
```

- [ ] **Step 2: Update Prompt Source Mapping — change "all 5" to "all 6"**

In the Prompt Source Mapping table (L29+), update the "Skills referenced" column for rows that currently say "all 5" to "all 6". These rows are:
- `deepwork/default.md`
- `deepwork/gpt.md`
- `deepwork/gemini.md`
- `deepwork/glm.md`
- `deepwork/codex.md`
- `agents/orchestrator.md`

Change each "all 5" to "all 6" in those rows.

- [ ] **Step 3: Update orchestrator row with new note**

In the `agents/orchestrator.md` row, append to the "Adapted for v1" column:

```
; subagent git limitations section (subagent-git-guard hard-blocks git write commands from subagent sessions; orchestrator handles commits)
```

- [ ] **Step 4: Commit**

```bash
git add docs/v1-maintenance.md
git commit -m "docs: sync v1-maintenance for subagent-git-guard and dispatching-parallel-agents"
```

---

### Task 7: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: All TS + Rust tests pass, 0 failures.

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 3: Verify hook name is registered**

Run: `rg "subagent-git-guard" src/config/schema.ts src/permissions/index.ts`
Expected: matches in both files (schema HOOK_NAMES + guard hookDisabled check).

- [ ] **Step 4: Verify skill is forked and loaded**

Run: `rg "dispatching-parallel-agents" src/intent/skill-loader.ts skills/v1/dispatching-parallel-agents/SKILL.md`
Expected: matches in both files.

- [ ] **Step 5: Verify v1-maintenance sync**

Run: `rg "dispatching-parallel-agents|all 6" docs/v1-maintenance.md`
Expected: matches in the Skills Source Mapping and Prompt Source Mapping tables.

- [ ] **Step 6: Verify orchestrator prompt**

Run: `rg "Subagent Git Limitations|subagent-git-guard" prompts/v1/agents/orchestrator.md`
Expected: matches.

- [ ] **Step 7: Build to verify no compilation regressions**

Run: `pnpm run build:ts`
Expected: PASS.

---

## Self-Review Notes

**Spec coverage:**
- Part A: `subagent-git-guard` hook name (Task 1), session→agent tracking (Task 2), guard implementation + wiring (Task 3) ✓
- Part B: dispatching-parallel-agents skill fork (Task 4), orchestrator prompt update (Task 5) ✓
- v1-maintenance sync (Task 6) ✓
- Full verification (Task 7) ✓

**Type consistency:**
- `sessionAgentMap: Map<string, string>` — consistent across `createChatParamsHandler`, `createPermissionGuards`, `createGuardEventHandler`, `guardSubagentGit`.
- `isGitWriteCommand(command: string): boolean` — used in guard + tests.
- `isBuiltinAgentName(name: string): boolean` — uses `BUILTIN_AGENT_INDEX` + hardcoded aliases set.

**Ordering:**
- Task 1 (schema) first — hook name must exist before guard references it.
- Task 2 (chat.params tracking) before Task 3 (guard) — the guard depends on the map being populated.
- Task 3 (guard) is the core — wiring touches permissions, index, tests.
- Task 4 (skill fork) is independent of Tasks 1-3 — could run in parallel, but kept sequential for review.
- Task 5 (prompt) after Task 3 — references the hook by name.
- Task 6 (docs) after Tasks 4-5 — references both.
- Task 7 (verification) last.

**Key risk:**
- `COMPAT_AGENT_ALIASES` is defined in `src/hooks/config.ts` as a const but may not be exported. The plan uses a hardcoded `BUILTIN_AGENT_ALIASES = new Set(["oracle", "explore"])` to avoid cross-module coupling. If the aliases change, both must be updated. This is a small, stable list — acceptable risk.
- `isGitWriteCommand` checks the full command string for the regex pattern. This handles PowerShell `;`-separated commands and env var prefixes correctly because the regex uses `\b` word boundaries. A command like `git status; git commit -m test` would match because the regex scans the entire string.
