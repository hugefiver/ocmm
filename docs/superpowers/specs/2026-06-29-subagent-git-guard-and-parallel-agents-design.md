# Subagent Git Guard & Parallel Agents Skill Design

## Goal

Add a hard-interception hook (`subagent-git-guard`) that blocks git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert) from **subagent sessions only**. The main agent is not affected by this hook (it is controlled by the separate `commit-guard-injector` prompt constraint). Fork the `dispatching-parallel-agents` skill into v1 to support parallel subagent dispatch guidance.

## Background

### Existing commit-guard (soft constraint, all models)

Task 1-5 of the prior plan added `commit-guard-injector` — a `system.transform` hook that appends a "do not commit on your own" prompt instruction to all models. This is a soft constraint for the main agent.

This new design adds a **hard constraint** for subagents only: even if a subagent ignores the prompt instruction, the bash git command is blocked before execution.

### tool.execute.before hook pattern (`src/permissions/index.ts`)

- `createPermissionGuards(args)` returns `{ before, after, definition, event }`.
- `before` is an async handler `(rawInput, rawOutput) => Promise<void>` called before every tool execution.
- Hard interception: `throw new Error(...)` stops the tool from executing (used by `guardExistingFileWrite` L202, `guardNotepadWrite` L214).
- Helpers available: `toolName(rawInput)`, `stringArg(rawInput, key)`, `argsRecord(rawInput)`, `sessionId(rawInput)`, `hookDisabled(config, name, alias)`.
- `tool.execute.before` input structure: `{ tool, sessionID, args }` — no agent name field.

### chat.params hook (`src/hooks/chat-params.ts`)

- `createChatParamsHandler({ getConfig })` fires at chat session start.
- Input contains `sessionID` and `agent.name` — the agent name is available here.
- This is the only hook where agent identity is visible per-session.

### Builtin agents vs category subagents

- `BUILTIN_AGENTS` (`src/data/agents.ts`): orchestrator, builder, reviewer, doc-search, code-search, planner, clarifier, plan-critic, media-reader. These are **main agents** (no `mode: "subagent"`).
- `BUILTIN_CATEGORIES` (`src/data/categories.ts`): frontend, creative, hard-reasoning, research, quick, coding, normal-task, complex, deep, documenting. In `src/hooks/config.ts` L203, these are registered with `mode: "subagent"`.
- OpenCode dispatches subagents with independent sessionIDs. The `chat.params` hook fires for each subagent session, providing the agent name.

### Session-level state tracking (existing pattern)

- `src/permissions/index.ts`: `readPermissions`, `readmeSessionCache`, `agentsSessionCache`, `lastAccess` — all `Map<string, ...>`, cleaned in `createGuardEventHandler` on `session.deleted`/`session.compacted`.
- `src/index.ts:113`: `agentsSessionCache = new Map<string, Set<string>>()` created in `createPlugin`, shared between hooks.

### v1 skill injection (`src/intent/skill-loader.ts`)

- `V1_SKILL_DIRS` (L49-55): 5 skill directory names.
- `loadV1Skills(rootDir)` reads `skills/v1/<dir>/SKILL.md` for each.
- Adding a 6th skill: fork SKILL.md to `skills/v1/<dir>/`, add dir name to `V1_SKILL_DIRS`.

### dispatching-parallel-agents skill (upstream)

- Source: `~/.config/opencode/skills/superpowers/dispatching-parallel-agents/SKILL.md` (182 lines).
- Content: when to use parallel subagents, how to create focused agent tasks, how to review/integrate.

## Design Decisions

| Dimension | Decision |
|---|---|
| Subagent git interception | Hard block via `tool.execute.before` — all git write commands from subagent sessions |
| Main agent | NOT affected by this hook (controlled by `commit-guard-injector` prompt constraint) |
| Subagent identification | `chat.params` hook records `sessionID → agentName`; `tool.execute.before` checks if the session's agent is a category (subagent) vs builtin (main) |
| Authorization | None — subagent git writes are **always blocked**, no opt-in mechanism |
| Git write detection | Regex: `git commit`, `git push`, `git tag`, `git reset --hard`, `git rebase`, `git cherry-pick`, `git revert` |
| `git add` | NOT blocked (staging only) |
| Hook name | `subagent-git-guard` — default enabled, toggleable via `disabledHooks` |
| dispatching-parallel-agents | Fork to `skills/v1/`, add to `V1_SKILL_DIRS`, update v1-maintenance doc |

### Why no authorization mechanism

The user decided subagent git writes are **always blocked** — no `[git-master-authorized]` marker, no opt-in. If a subagent needs to commit, the main agent performs the git operation itself (the main agent is not blocked by this hook). This is the simplest correct design: no authorization state to track, no task-prompt parsing, no session-to-session authorization propagation.

### Why chat.params tracking

`tool.execute.before` input has `sessionID` but no `agent.name`. To determine if a bash command comes from a subagent, ocmm must know the session's agent. The `chat.params` hook fires at session start with both `sessionID` and `agent.name`, making it the natural place to record the mapping. A new `sessionAgentMap: Map<string, string>` records `sessionID → agentName`, shared between `chat.params` and `tool.execute.before`.

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

**Session state** — new `Map<string, string>` for sessionID → agentName:

Created in `createPlugin` (alongside `agentsSessionCache`), shared with both `chat.params` handler and `createPermissionGuards`.

```ts
// src/index.ts
const sessionAgentMap = new Map<string, string>()
```

**chat.params tracking** — extend `createChatParamsHandler` to accept and populate `sessionAgentMap`:

```ts
export function createChatParamsHandler(args: {
  getConfig: () => OcmmConfig
  sessionAgentMap?: Map<string, string>  // NEW
}): ...
```

In the handler, after reading `agentName` (existing L106), record it:

```ts
if (args.sessionAgentMap && agentName) {
  args.sessionAgentMap.set(input.sessionID, agentName)
}
```

**Before-hook logic** — new function `guardSubagentGit` in `src/permissions/index.ts`:

```ts
function guardSubagentGit(
  config: OcmmConfig,
  rawInput: unknown,
  sessionAgentMap: Map<string, string>,
): void {
  if (hookDisabled(config, "subagent-git-guard", "subagentGitGuard")) return
  const name = toolName(rawInput)
  if (name !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command || !isGitWriteCommand(command)) return

  // Check if this session belongs to a subagent (category agent).
  const sid = sessionId(rawInput)
  const agentName = sessionAgentMap.get(sid)
  if (!agentName) return  // unknown agent — don't block (safe default for main agent)
  if (isBuiltinAgent(agentName)) return  // main agent — not blocked by this hook

  // Subagent session — block.
  throw new Error(
    "Git write operations (commit, push, tag, reset --hard, rebase, cherry-pick, revert) " +
    "are blocked by the subagent-git-guard hook for subagent sessions. " +
    "The main agent should perform git operations. " +
    'To disable this guard, add "subagent-git-guard" to disabledHooks in ocmm.jsonc.'
  )
}
```

**Builtin agent check** — helper to determine if an agent name is a main agent:

```ts
import { BUILTIN_AGENTS } from "../data/agents.ts"

function isBuiltinAgent(name: string): boolean {
  const lower = name.toLowerCase()
  return BUILTIN_AGENTS.some((a) => a.name.toLowerCase() === lower)
}
```

Note: also check canonical aliases. The `registerCompatAgentAliases` function (in `src/hooks/config.ts`) maps aliases like "oracle" → "reviewer", "explore" → "code-search". If `sessionAgentMap` records the alias name, `isBuiltinAgent` should check both canonical names and aliases. For simplicity, check against `BUILTIN_AGENTS` names + known aliases. Alternatively, `chat.params` may already canonicalize the name — verify during implementation.

**Git write command detection**:

```ts
function isGitWriteCommand(command: string): boolean {
  // Strip leading env var assignments (PowerShell $env:VAR=val or POSIX VAR=val)
  const stripped = command.replace(/^(\$\w+=\S+\s+|[A-Z_]+=\S+\s+)+/i, "")
  return /\bgit\s+(commit|push|tag|reset\s+--hard|rebase|cherry-pick|revert)\b/.test(stripped)
}
```

**Registration** — in `createPermissionGuards`:

1. Accept `sessionAgentMap` in args.
2. Call `guardSubagentGit` in the `before` array.
3. Pass `sessionAgentMap` to `createGuardEventHandler` for cleanup.

```ts
export function createPermissionGuards(args: {
  getConfig: () => OcmmConfig
  projectRoot: string
  taskSystemEnabled?: () => boolean
  redirectResolver?: RedirectResolver
  fsyncTracker?: FsyncSkipTracker
  agentsSessionCache?: Map<string, Set<string>>
  sessionAgentMap?: Map<string, string>  // NEW
}): PermissionGuardHooks {
  // ... existing setup ...
  return {
    before: async (rawInput, rawOutput) => {
      const config = args.getConfig()
      await trackReadPermission(...)
      guardNotepadWrite(...)
      guardExistingFileWrite(...)
      if (args.sessionAgentMap) guardSubagentGit(config, rawInput, args.sessionAgentMap)  // NEW
      warnBashFileRead(...)
      // ...
    },
    // ...
    event: createGuardEventHandler({
      // ... existing ...
      sessionAgentMap: args.sessionAgentMap,  // NEW (for cleanup)
    }),
  }
}
```

**Event handler cleanup** — extend `createGuardEventHandler`:

```ts
function createGuardEventHandler(caches: {
  readPermissions: Map<string, Set<string>>
  readmeSessionCache: Map<string, Set<string>>
  lastAccess: Map<string, number>
  agentsSessionCache?: Map<string, Set<string>>
  sessionAgentMap?: Map<string, string>  // NEW
}): (input: unknown) => Promise<void> {
  return async (raw: unknown) => {
    // ... existing ...
    caches.sessionAgentMap?.delete(sid)  // NEW
  }
}
```

**Plugin wiring** (`src/index.ts`):

```ts
const sessionAgentMap = new Map<string, string>()  // NEW

const permissionGuards = createPermissionGuards({
  getConfig,
  projectRoot: cwd,
  // ... existing ...
  sessionAgentMap,  // NEW
})

// chat.params handler
"chat.params": createChatParamsHandler({
  getConfig,
  sessionAgentMap,  // NEW
}),
```

### Part B: dispatching-parallel-agents skill + orchestrator prompt + v1-maintenance sync

**`prompts/v1/agents/orchestrator.md`** — add a short section instructing the main agent about subagent git limitations:

```markdown
## Subagent Git Limitations

Subagents (category agents dispatched via task tool) cannot execute git write commands (commit, push, tag, reset --hard, rebase, cherry-pick, revert) — the `subagent-git-guard` hook blocks them. When a subagent's work requires committing, the main agent should perform the git operation itself after verifying the subagent's output. Do not instruct subagents to commit; instruct them to report what should be committed.
```

This aligns with the existing `commit-guard-injector` prompt constraint (which tells the main agent not to commit autonomously either). The main agent's workflow becomes: subagent does the work → main agent reviews → main agent tells the user what to commit (or commits itself if the user has explicitly permitted it).

**`skills/v1/dispatching-parallel-agents/SKILL.md`** — fork from upstream. Preserve content, adjust upstream-only tool/agent names to local equivalents if any. Keep frontmatter as first bytes.

**`src/intent/skill-loader.ts`** — add to `V1_SKILL_DIRS`:

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
- Update "all 5" → "all 6" in 6 rows of Prompt Source Mapping table (deepwork/default, deepwork/gpt, deepwork/gemini, deepwork/glm, deepwork/codex, agents/orchestrator).

### File change list

| File | Change | Responsibility |
|---|---|---|
| `src/config/schema.ts` | Add hook name | `HOOK_NAMES` gains `subagent-git-guard` |
| `src/permissions/index.ts` | Add guard + helpers | `guardSubagentGit`, `isGitWriteCommand`, `isBuiltinAgent`; extend `createPermissionGuards` args + `createGuardEventHandler` cleanup |
| `src/hooks/chat-params.ts` | Track agent name | Accept + populate `sessionAgentMap` |
| `src/index.ts` | Wire state | Create `sessionAgentMap`, pass to `createPermissionGuards` + `createChatParamsHandler` |
| `skills/v1/dispatching-parallel-agents/SKILL.md` | New file (fork) | Parallel agent dispatch guidance |
| `prompts/v1/agents/orchestrator.md` | Add section | Subagent git limitations instructions |
| `src/intent/skill-loader.ts` | Add to V1_SKILL_DIRS | 6th skill injected |
| `docs/v1-maintenance.md` | Sync | Skills table + Prompt table (all 5 → all 6) + orchestrator row update |
| Tests | New + extend | `guardSubagentGit`, `isGitWriteCommand`, `isBuiltinAgent` unit tests; chat-params tracking test; event cleanup test |

## Detailed Design

### Interception lifecycle

1. Main agent (e.g., orchestrator) starts a chat session. `chat.params` fires, records `sessionAgentMap.set(mainSessionID, "orchestrator")`.
2. Main agent dispatches a subagent (e.g., `coding`) via `task` tool. OpenCode creates a new session for the subagent.
3. Subagent's `chat.params` fires, records `sessionAgentMap.set(subagentSessionID, "coding")`.
4. Subagent attempts `git commit -m "..."` via bash tool.
5. `tool.execute.before` fires: `guardSubagentGit` checks `toolName === "bash"`, `isGitWriteCommand(command)` is true, `sessionAgentMap.get(subagentSessionID)` returns "coding", `isBuiltinAgent("coding")` is false → **throws Error**.
6. Tool execution blocked. Subagent sees error message.

### Main agent git operations

1. Main agent (orchestrator) attempts `git commit` via bash.
2. `tool.execute.before` fires: `guardSubagentGit` checks, `sessionAgentMap.get(mainSessionID)` returns "orchestrator", `isBuiltinAgent("orchestrator")` is true → **returns** (not blocked).
3. The `commit-guard-injector` prompt constraint tells the main agent not to commit, but if it does, the hook does not block it.

### `isGitWriteCommand` regex

```ts
function isGitWriteCommand(command: string): boolean {
  const stripped = command.replace(/^(\$\w+=\S+\s+|[A-Z_]+=\S+\s+)+/i, "")
  return /\bgit\s+(commit|push|tag|reset\s+--hard|rebase|cherry-pick|revert)\b/.test(stripped)
}
```

Matches: `git commit`, `git push`, `git tag`, `git reset --hard`, `git rebase`, `git cherry-pick`, `git revert`, and variants with env var prefixes.
Does NOT match: `git add`, `git status`, `git log`, `git diff`, `git stash`, `git checkout`, `git switch`, `git merge`.

### Hook interaction with existing commit-guard-injector

| Hook | Scope | Mechanism | Blocks main agent? | Blocks subagent? |
|---|---|---|---|---|
| `commit-guard-injector` | All models | Soft prompt (system.transform) | Yes (soft) | Yes (soft) |
| `subagent-git-guard` | Subagent sessions only | Hard interception (tool.execute.before) | No | Yes (hard) |

Both can be toggled independently via `disabledHooks`.

## Error Handling

- **`hookDisabled` throws**: existing pattern — propagates, blocks tool. Acceptable.
- **`getConfig()` throws**: existing pattern — propagates. Acceptable.
- **`sessionAgentMap` missing entry**: `agentName` is undefined → `return` (don't block). Safe default — unknown sessions are treated as potential main agent.
- **Session not cleaned**: minor memory leak, same as existing Maps. Acceptable.

## Testing

### `src/permissions/` tests (new or extend)

- `isGitWriteCommand`: matches all 7 git write subcommands; does NOT match `git add`, `git status`, `git log`, `git diff`, `git stash`, `git checkout`.
- `isBuiltinAgent`: returns true for "orchestrator", "builder", "reviewer", etc.; false for "coding", "quick", "frontend", etc.
- `guardSubagentGit` with bash git commit, subagent session (agentName="coding"): throws.
- `guardSubagentGit` with bash git commit, main agent session (agentName="orchestrator"): does NOT throw.
- `guardSubagentGit` with bash git commit, unknown session (no map entry): does NOT throw (safe default).
- `guardSubagentGit` with bash git add, subagent session: does NOT throw (not a write command).
- `guardSubagentGit` with bash git commit, disabled hook: does NOT throw.
- Event cleanup: `sessionAgentMap` entry deleted on `session.deleted`.

### `src/hooks/chat-params.test.ts` extension

- `chat.params` records agentName in `sessionAgentMap` when provided.
- `chat.params` does not throw when `sessionAgentMap` is not provided (optional).

## Scope Boundaries (YAGNI)

Not in this design:
- No authorization mechanism for subagents (git writes always blocked for subagents).
- No `[git-master-authorized]` marker.
- No task before-hook prompt parsing.
- No `git add` blocking.
- No `git merge` blocking (accepted simplification).
- No subagent vs main agent distinction beyond builtin-agent check.
- No config field for custom git command patterns.

## v1-maintenance Doc Sync

- Add `dispatching-parallel-agents` row to Skills Source Mapping table (upstream: obra/superpowers/dispatching-parallel-agents, version: v6.0.3, adjustments: forked to v1, frontmatter kept).
- Update "all 5" → "all 6" in 6 rows of Prompt Source Mapping table.
- Update orchestrator row in Prompt Source Mapping: add "subagent git limitations instructions" to the Adapted column.

## Risks

- **Agent name canonicalization**: `chat.params` may record an alias (e.g., "oracle") instead of the canonical name ("reviewer"). `isBuiltinAgent` must check aliases too. Mitigation: import `registerCompatAgentAliases` mapping or check against both canonical names and known aliases during implementation.
- **Unknown sessions**: if `chat.params` doesn't fire for a session (edge case), `sessionAgentMap` has no entry, and the guard returns (doesn't block). This is safe — better to under-block than over-block the main agent.
- **dispatching-parallel-agents skill content drift**: forked from upstream, needs sync tracking. Same maintenance pattern as other 5 skills.
- **V1_SKILL_DIRS change affects all models**: 6th skill increases injected text. Minimal impact — skill is advisory per gpt.md's priority override.
