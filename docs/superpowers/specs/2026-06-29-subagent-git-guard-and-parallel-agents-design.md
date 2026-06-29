# Subagent Git Guard & Parallel Agents Skill Design

## Goal

Add a hard-interception hook (`subagent-git-guard`) that blocks git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert) unless the main agent has explicitly authorized the session by including a `[git-master-authorized]` marker in the task dispatch prompt. Fork the `dispatching-parallel-agents` skill into v1 and add orchestrator prompt instructions so the main agent knows when and how to authorize subagents.

## Background

### Existing commit-guard (soft constraint)

Task 1-5 of the prior plan added `commit-guard-injector` — a `system.transform` hook that appends a "do not commit on your own" prompt instruction to all models. This is a soft constraint: the model is told not to commit, but nothing prevents it from doing so if it ignores the instruction.

This new design adds a **hard constraint** via `tool.execute.before`: even if the subagent ignores the prompt instruction, the bash command is blocked before execution.

### tool.execute.before hook pattern (`src/permissions/index.ts`)

- `createPermissionGuards(args)` returns `{ before, after, definition, event }`.
- `before` is an async handler `(rawInput, rawOutput) => Promise<void>` called before every tool execution.
- Hard interception: `throw new Error(...)` stops the tool from executing (used by `guardExistingFileWrite` L202, `guardNotepadWrite` L214).
- Helpers available: `toolName(rawInput)`, `stringArg(rawInput, key)`, `argsRecord(rawInput)`, `sessionId(rawInput)`, `hookDisabled(config, name, alias)`.
- Session-level state tracking already exists: `readPermissions`, `readmeSessionCache`, `agentsSessionCache` — all `Map<string, Set<string>>`, cleaned in `createGuardEventHandler` on `session.deleted`/`session.compacted`.

### task tool dispatch

- OpenCode's built-in `task` tool dispatches subagents. Its `args` contain `prompt` (the dispatch prompt text).
- `toolName(rawInput)` returns `"task"` for task tool calls.
- `argsRecord(rawInput)?.prompt` is the prompt string the main agent wrote.

### v1 skill injection (`src/intent/skill-loader.ts`)

- `V1_SKILL_DIRS` (L49-55) is a const array of 5 skill directory names.
- `loadV1Skills(rootDir)` reads `skills/v1/<dir>/SKILL.md` for each and concatenates.
- `loadV1SkillCommands(args)` registers each as a slash command.
- Adding a 6th skill requires: (a) forking the SKILL.md to `skills/v1/<dir>/`, (b) adding the dir name to `V1_SKILL_DIRS`.

### dispatching-parallel-agents skill (upstream)

- Source: `~/.config/opencode/skills/superpowers/dispatching-parallel-agents/SKILL.md` (182 lines).
- Content: when to use parallel subagents, how to create focused agent tasks, how to review/integrate.
- Not currently in the ocmm repo; needs forking to `skills/v1/dispatching-parallel-agents/SKILL.md`.

### git-master skill

- `skills/git-master/SKILL.md` exists in the ocmm repo.
- Registered as a slash command via `skills.enable` config.
- Not auto-injected; user or model must explicitly invoke `/git-master` or load it.
- Contains git commit best practices, atomic commit guidance, semantic commit style.

## Design Decisions

| Dimension | Decision |
|---|---|
| Need 1 (inject subagent no-commit) | Hard interception via `tool.execute.before` — block git write commands |
| Authorization mechanism | Task prompt explicit marker `[git-master-authorized]` in the dispatch prompt |
| Authorization tracking | Session-level `Map<string, boolean>` (gitAuthorizedSessions) |
| Git write detection | Regex on bash command: `git commit`, `git push`, `git tag`, `git reset --hard`, `git rebase`, `git cherry-pick`, `git revert` |
| `git add` | NOT blocked (staging only, no history mutation) |
| Hook name | `subagent-git-guard` — default enabled, toggleable via `disabledHooks` |
| Need 2 (main agent injects git-master) | Orchestrator prompt instructions + `[git-master-authorized]` marker convention |
| dispatching-parallel-agents | Fork to `skills/v1/`, add to `V1_SKILL_DIRS`, update v1-maintenance doc |

### Why hard interception instead of prompt-only

The prior `commit-guard-injector` is a soft prompt constraint. The user explicitly chose "需求1=硬拦截 hook" — a `tool.execute.before` hook that throws an error to block the bash command regardless of whether the model obeys the prompt instruction. This provides defense-in-depth: prompt says "don't commit", hook enforces it.

### Why `[git-master-authorized]` marker in task prompt

The user chose "task prompt 显式标记". When the main agent dispatches a subagent via the `task` tool, it writes a prompt. If that prompt contains the literal string `[git-master-authorized]`, ocmm detects it in `tool.execute.before` (for the `task` tool) and marks the session as authorized. Subsequent bash git-write commands in that session are allowed. This is explicit, auditable, and requires the main agent to consciously decide to authorize git operations.

The marker is a convention — the orchestrator prompt instructs the main agent to include it when (and only when) it has injected git-master skill guidance into the subagent's task prompt. The hard interception ensures that even if the main agent forgets, no git damage occurs.

## Architecture

### Part A: `subagent-git-guard` hook

**New hook name** — add to `HOOK_NAMES` in `src/config/schema.ts`:

```ts
const HOOK_NAMES = [
  // ... existing ...
  "commit-guard-injector",
  "subagent-git-guard",  // NEW
] as const
```

**Session state** — new `Map<string, boolean>` in `createPermissionGuards`:

```ts
const gitAuthorizedSessions = new Map<string, boolean>()
```

Passed to `createGuardEventHandler` for cleanup on session end.

**Before-hook logic** — new function `guardSubagentGit` in `src/permissions/index.ts`, called in the `before` array:

```ts
function guardSubagentGit(
  config: OcmmConfig,
  rawInput: unknown,
  gitAuthorizedSessions: Map<string, boolean>,
): void {
  if (hookDisabled(config, "subagent-git-guard", "subagentGitGuard")) return
  const name = toolName(rawInput)
  const sid = sessionId(rawInput)

  // Case 1: task tool dispatch — check for authorization marker in prompt.
  if (name === "task") {
    const prompt = stringArg(rawInput, "prompt")
    if (prompt && prompt.includes("[git-master-authorized]")) {
      gitAuthorizedSessions.set(sid, true)
    }
    return  // task dispatch itself is never blocked
  }

  // Case 2: bash tool — check for git write commands.
  if (name !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command) return
  if (!isGitWriteCommand(command)) return

  // Check authorization.
  if (gitAuthorizedSessions.get(sid) === true) return  // authorized — allow

  throw new Error(
    "Git write operations (commit, push, tag, reset --hard, rebase, cherry-pick, revert) " +
    "are blocked by the subagent-git-guard hook. The main agent must authorize this " +
    "session by including [git-master-authorized] in the task dispatch prompt and " +
    "injecting git-master skill guidance. To disable this guard entirely, add " +
    '"subagent-git-guard" to disabledHooks in ocmm.jsonc.'
  )
}
```

**Git write command detection**:

```ts
function isGitWriteCommand(command: string): boolean {
  // Strip leading env var assignments (e.g., GIT_AUTHOR_DATE=... git commit ...)
  const stripped = command.replace(/^[A-Z_]+=\S+\s+/i, "")
  // Match git subcommands that mutate history.
  return /\bgit\s+(commit|push|tag|reset\s+--hard|rebase|cherry-pick|revert)\b/.test(stripped)
}
```

`git add` is NOT matched — it only stages, doesn't mutate history. `git reset` without `--hard` is not matched (soft/mixed reset is less destructive). `git stash`, `git checkout`, `git switch`, `git merge` are not matched (they don't create commits directly, though merge can — this is an accepted simplification; the main destructive operations are covered).

**Event handler cleanup** — extend `createGuardEventHandler` to accept and clean `gitAuthorizedSessions`:

```ts
function createGuardEventHandler(caches: {
  readPermissions: Map<string, Set<string>>
  readmeSessionCache: Map<string, Set<string>>
  lastAccess: Map<string, number>
  agentsSessionCache?: Map<string, Set<string>>
  gitAuthorizedSessions: Map<string, boolean>  // NEW
}): (input: unknown) => Promise<void> {
  // ... existing cleanup ...
  caches.gitAuthorizedSessions.delete(sid)  // NEW
}
```

**Registration** — in `createPermissionGuards`, add to the `before` array:

```ts
before: async (rawInput, rawOutput) => {
  const config = args.getConfig()
  await trackReadPermission(...)
  guardNotepadWrite(...)
  guardExistingFileWrite(...)
  guardSubagentGit(config, rawInput, gitAuthorizedSessions)  // NEW
  warnBashFileRead(...)
  truncateQuestionLabels(...)
  guardTodoRead(...)
  await rewriteWebfetchRedirect(...)
},
```

And pass `gitAuthorizedSessions` to the event handler:

```ts
event: createGuardEventHandler({
  readPermissions,
  readmeSessionCache,
  lastAccess,
  ...(args.agentsSessionCache !== undefined ? { agentsSessionCache: args.agentsSessionCache } : {}),
  gitAuthorizedSessions,  // NEW
}),
```

### Part B: Orchestrator prompt + dispatching-parallel-agents skill

**`prompts/v1/agents/orchestrator.md`** — add a section about subagent git authorization:

```markdown
## Subagent Git Authorization

Subagents cannot execute git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert) by default — the `subagent-git-guard` hook blocks them. To authorize a subagent to perform git operations:

1. Inject git-master skill guidance into the subagent's task prompt (reference the skill's commit best practices, atomic commit style, semantic commit messages).
2. Include the literal marker `[git-master-authorized]` in the task dispatch prompt.

Only authorize when the subagent genuinely needs to commit (e.g., a multi-step implementation task where the user has approved committing). For most tasks, the main agent should perform git operations itself after the subagent completes its work.
```

**`skills/v1/dispatching-parallel-agents/SKILL.md`** — fork from upstream `~/.config/opencode/skills/superpowers/dispatching-parallel-agents/SKILL.md`. Preserve the content, adjust any upstream-only tool/agent names to local equivalents if needed. Keep frontmatter as the first bytes (for OpenCode native slash skill loading).

**`src/intent/skill-loader.ts`** — add `"dispatching-parallel-agents"` to `V1_SKILL_DIRS`:

```ts
const V1_SKILL_DIRS = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "receiving-code-review",
  "dispatching-parallel-agents",  // NEW
] as const
```

**`docs/v1-maintenance.md`** — sync:
- Add `dispatching-parallel-agents` row to Skills Source Mapping table.
- Update orchestrator row in Prompt Source Mapping table (add subagent git authorization note).

### File change list

| File | Change | Responsibility |
|---|---|---|
| `src/config/schema.ts` | Add hook name | `HOOK_NAMES` gains `subagent-git-guard` |
| `src/permissions/index.ts` | Add guard function + state | `guardSubagentGit`, `isGitWriteCommand`, `gitAuthorizedSessions` Map, event cleanup, registration in `before` array |
| `prompts/v1/agents/orchestrator.md` | Add section | Subagent git authorization instructions |
| `skills/v1/dispatching-parallel-agents/SKILL.md` | New file (fork) | Parallel agent dispatch guidance |
| `src/intent/skill-loader.ts` | Add to V1_SKILL_DIRS | 6th skill injected into v1 system message |
| `docs/v1-maintenance.md` | Sync | Skills table + Prompt table updates |
| Tests | New + extend | `guardSubagentGit` unit tests, `isGitWriteCommand` tests, event cleanup test |

## Detailed Design

### Authorization lifecycle

1. Main agent decides a subagent needs to commit.
2. Main agent writes task prompt including: (a) git-master skill guidance, (b) `[git-master-authorized]` marker.
3. Main agent calls `task` tool with this prompt.
4. ocmm `tool.execute.before` fires for the `task` tool: detects marker, sets `gitAuthorizedSessions.set(sessionID, true)`.
5. Subagent runs, attempts `git commit ...` via bash tool.
6. ocmm `tool.execute.before` fires for `bash`: detects git write command, checks `gitAuthorizedSessions.get(sessionID)` — true, allows.
7. Session ends or compacts: `gitAuthorizedSessions.delete(sessionID)` in event handler.

### Non-authorized subagent

1. Main agent dispatches subagent without marker.
2. Subagent attempts `git push ...` via bash.
3. ocmm `tool.execute.before` fires: detects git write, checks `gitAuthorizedSessions` — not set, throws Error.
4. Tool execution blocked. Subagent sees error message explaining how to authorize.

### Main agent own git operations

The main agent (orchestrator) is NOT a subagent — it runs in the main session. The `subagent-git-guard` hook checks ALL bash commands regardless of whether the caller is main or subagent. This means the main agent is also blocked from git write operations unless authorized.

This is intentional per the user's requirement: "模型不得自行提交代码" applies to all models. The main agent must also include `[git-master-authorized]` in... but wait — the main agent doesn't dispatch itself via `task` tool. The authorization marker is in the task prompt, which only applies to subagent dispatch.

Resolution: the `commit-guard-injector` (soft prompt constraint from the prior plan) tells the main agent not to commit. The `subagent-git-guard` (hard hook) blocks subagents. For the main agent, the soft constraint is the primary mechanism. If the user wants the main agent also hard-blocked, they rely on the prompt constraint + the fact that the main agent would need to use bash to run git, and... actually the hook checks ALL bash commands. So the main agent IS hard-blocked too.

This is actually the desired behavior: NO model (main or subagent) can git-commit without authorization. But the main agent can't get authorized via task-prompt-marker (it doesn't dispatch itself). So how does the main agent ever commit?

Answer: the main agent doesn't commit. The user commits, or the user explicitly tells the main agent to commit and the main agent... is still blocked by the hook.

This is a problem. The hook as designed blocks ALL git write commands from ALL agents. The main agent needs a way to commit when the user explicitly asks.

Options:
1. The hook only blocks subagents (detect subagent vs main agent). But ocmm can't reliably distinguish subagent from main agent in `tool.execute.before` — the sessionID is the same for the main chat.
2. The hook blocks all, but the user can disable it per-session or globally via `disabledHooks`.
3. The main agent's git operations are allowed when the user's message explicitly asks for a commit (detected via chat.message hook).

The simplest correct approach: the hook blocks all git write commands. When the user explicitly asks the main agent to commit, the user can either (a) add `"subagent-git-guard"` to disabledHooks temporarily, or (b) the main agent tells the user "I'm blocked from committing by the guard; please run the commit yourself" — which aligns with "模型不得自行提交代码，任何提交须用户明确许可".

Actually, re-reading the requirement: "模型不得自行提交代码，任何提交须用户明确许可". This means NO model should commit without user permission. The hook enforcing this on ALL agents is correct. The user "explicitly permitting" means the user runs the git command themselves, or the user disables the hook to let the model do it.

So the design is: **all git write commands are blocked by default for all agents**. The `[git-master-authorized]` marker is specifically for subagent dispatch where the main agent has verified the subagent needs to commit and has injected git-master guidance. For the main agent, the user must either commit themselves or disable the hook.

This is the correct, safe default. The hook's error message will guide users.

### `isGitWriteCommand` regex

```ts
function isGitWriteCommand(command: string): boolean {
  // Strip leading env var assignments (PowerShell $env:VAR=val or POSIX VAR=val)
  const stripped = command.replace(/^(\$\w+=\S+\s+|[A-Z_]+=\S+\s+)+/i, "")
  return /\bgit\s+(commit|push|tag|reset\s+--hard|rebase|cherry-pick|revert)\b/.test(stripped)
}
```

Handles:
- `git commit -m "msg"` ✓
- `git push origin master` ✓
- `git tag v1.0` ✓
- `git reset --hard HEAD~1` ✓
- `git rebase main` ✓
- `git cherry-pick abc123` ✓
- `git revert abc123` ✓
- `$env:GIT_AUTHOR_DATE="..."; git commit ...` ✓ (env stripped, then matched)
- `git add .` ✗ (not matched — staging only)
- `git status` ✗
- `git log` ✗
- `git diff` ✗
- `git stash` ✗

### Hook interaction with existing commit-guard-injector

Two hooks now relate to git commits:
1. `commit-guard-injector` (system.transform) — soft prompt constraint, all models.
2. `subagent-git-guard` (tool.execute.before) — hard interception, all agents.

They are independent and complementary. The soft constraint tells the model "don't commit"; the hard constraint enforces it. Both can be toggled independently via `disabledHooks`.

## Error Handling

- **`hookDisabled` throws**: `guardSubagentGit` catches internally? No — existing guards like `guardNotepadWrite` call `hookDisabled` without try/catch and let it propagate. The `before` handler is called in an async function; if it throws, the tool execution is blocked with the error. This is the existing pattern. If `hookDisabled` throws (unlikely — it just checks an array), the tool is blocked. Acceptable — safe failure.
- **`getConfig()` throws**: Same as above — the `before` handler calls `args.getConfig()` first; if it throws, all guards are skipped (the error propagates and blocks the tool). This is existing behavior.
- **Session state race**: `gitAuthorizedSessions.set` in task-before, `gitAuthorizedSessions.get` in bash-before. Both are synchronous Map operations — no race condition in single-threaded Node.js.
- **Session not cleaned**: if `session.deleted`/`session.compacted` event doesn't fire, the Map entry persists. This is a minor memory leak, same as existing `readPermissions` etc. Acceptable — sessions are finite.

## Testing

### `src/permissions/index.ts` tests (new or extend existing test file)

- `isGitWriteCommand`: matches `git commit`, `git push`, `git tag`, `git reset --hard`, `git rebase`, `git cherry-pick`, `git revert`; does NOT match `git add`, `git status`, `git log`, `git diff`, `git stash`, `git checkout`.
- `guardSubagentGit` with task tool + marker: sets `gitAuthorizedSessions` for session.
- `guardSubagentGit` with task tool without marker: does NOT set.
- `guardSubagentGit` with bash git commit, authorized session: does NOT throw.
- `guardSubagentGit` with bash git commit, unauthorized session: throws Error.
- `guardSubagentGit` with bash git add: does NOT throw (not a write command).
- `guardSubagentGit` when disabled: does nothing (no throw, no set).
- Event cleanup: `gitAuthorizedSessions` entry deleted on `session.deleted`.

### Integration (if feasible)

- Full `before` handler: task dispatch with marker → subsequent bash git commit allowed.
- Full `before` handler: task dispatch without marker → subsequent bash git commit blocked.

## Scope Boundaries (YAGNI)

Not in this design:
- No subagent vs main agent distinction (hook applies to all agents equally).
- No per-agent authorization (session-level only).
- No `git add` blocking (staging is safe).
- No `git merge` blocking (accepted simplification — merge can create commits but is less destructive than the covered operations).
- No config field for custom git command patterns (regex is hardcoded).
- No audit log of blocked attempts (error message is the only feedback).
- No automatic git-master skill injection (main agent must manually include skill guidance + marker).

## v1-maintenance Doc Sync

- Add `dispatching-parallel-agents` row to Skills Source Mapping table (upstream: obra/superpowers/dispatching-parallel-agents, version: v6.0.3, adjustments: forked to v1, frontmatter kept).
- Update all "all 5" references in the Skills/Prompt Source Mapping tables to "all 6" (affects rows for deepwork/default.md, deepwork/gpt.md, deepwork/gemini.md, deepwork/glm.md, deepwork/codex.md, agents/orchestrator.md — 6 rows total in the Prompt Source Mapping table). This is a mechanical find-and-replace within `docs/v1-maintenance.md`.
- Update orchestrator row in Prompt Source Mapping: add "subagent git authorization instructions" to the Adapted column.
- gpt.md's skill priority override lists specific skill names (not a count), so no text change needed in gpt.md itself — but the v1-maintenance row for gpt.md changes from "all 5" to "all 6" in the "Skills referenced" column.

## Risks

- **Main agent blocked from committing**: By design — the user must commit themselves or disable the hook. The error message guides this. Aligns with "任何提交须用户明确许可".
- **Marker spoofing**: A subagent could include `[git-master-authorized]` in its own bash command... no, the marker is only checked in `task` tool prompts, not bash commands. A subagent can't authorize itself via bash. Only the main agent's task dispatch prompt can authorize.
- **Regex false positives/negatives**: `git commit` in a string literal or comment could false-positive. Acceptable — better to over-block git operations than under-block. The regex requires `git` as a word boundary followed by the subcommand, which is specific enough.
- **dispatching-parallel-agents skill content drift**: Forked from upstream; needs sync tracking in v1-maintenance doc. Same maintenance pattern as the other 5 forked skills.
- **V1_SKILL_DIRS change affects all models**: Adding a 6th skill increases the injected text size for all v1 models. The skill is advisory (per gpt.md's priority override), so impact is minimal — the model reads it but isn't forced to invoke its ceremony for simple tasks.
