# team-core & Permission Guards

> **Source**: `omo/packages/team-core/` (78 TS files), `omo/packages/omo-opencode/src/hooks/` (17 guards), `omo/packages/omo-opencode/src/plugin/hooks/create-tool-guard-hooks.ts`
> **Status**: Not migrated. Team Mode = HIGHEST complexity; Guards = MEDIUM
> **Principle**: team-core = omo-own (reimplement); guards = mixed (some import, some reimplement)
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.
> **Guard count**: 17 base guards + 1 conditional (`teamToolGating`, active only when `team_mode.enabled`). Total 18 with team mode.

## PART A — team-core Architecture

### Package Overview

**Package**: `@oh-my-opencode/team-core` (harness-neutral domain primitives)
**Dependencies**: `@oh-my-opencode/tmux-core`, `@oh-my-opencode/utils`, `zod`
**Size**: 78 TypeScript files, 26 test files

### What Team Mode Is

Team Mode enables parallel multi-agent coordination: a **lead agent** orchestrates up to 8 **member agents** (default max 4 concurrent), all running simultaneously and communicating via dedicated tools. Members share a mailbox, task list, and optional tmux visualization.

**Config gate**: `team_mode.enabled` (default `false`)

### TeamModeConfigSchema (11 fields)

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Master gate |
| `tmux_visualization` | `boolean` | `false` | Render tmux pane layout |
| `max_parallel_members` | `int 1..8` | `4` | Concurrent active members |
| `max_members` | `int 1..8` | `8` | Hard cap on team size |
| `max_messages_per_run` | `int >=1` | `10000` | Total message limit |
| `max_wall_clock_minutes` | `int >=1` | `120` | Time limit per run |
| `max_member_turns` | `int >=1` | `500` | Turns per member |
| `base_dir` | `string?` | `null` | Override `~/.omo/teams/` |
| `message_payload_max_bytes` | `int >=1024` | `32768` | Per-message cap |
| `recipient_unread_max_bytes` | `int >=1024` | `262144` | Per-recipient inbox cap |
| `mailbox_poll_interval_ms` | `int >=500` | `3000` | Poll cadence |

### The 12 team_* Tools

#### Lifecycle Tools

| # | Tool | Input | Output | Behavior |
|---|------|-------|--------|----------|
| 1 | `team_create` | `teamName?`, `inline_spec?`, `leadSessionId?` | `{teamRunId, members}` | Load named spec or parse inline → validate members → spawn member sessions → init mailbox/tasklist/worktrees → optional tmux |
| 2 | `team_delete` | `teamRunId` | JSON success | Tear down state, mailbox, tasklist, worktrees, tmux |
| 3 | `team_shutdown_request` | `teamRunId` | JSON confirmation | Member or lead requests own shutdown |
| 4 | `team_approve_shutdown` | `teamRunId`, `memberName` | JSON confirmation | Lead acks shutdown |
| 5 | `team_reject_shutdown` | `teamRunId`, `memberName`, `reason` | JSON confirmation | Lead rejects with reason |

#### Messaging Tools

| # | Tool | Input | Output | Behavior |
|---|------|-------|--------|----------|
| 6 | `team_send_message` | `teamRunId`, `to` (name or `*`), `body`, `kind?`, `correlationId?`, `summary?`, `references?` | `{deliveredTo[], reservedMailbox}` | Validates sender role (broadcast=lead-only), writes to recipient `.jsonl`, triggers live delivery |

#### Task Tools

| # | Tool | Input | Output | Behavior |
|---|------|-------|--------|----------|
| 7 | `team_task_create` | `teamRunId`, `subject`, `description`, `blockedBy?` | `{taskId, task}` | Create task with status "pending" |
| 8 | `team_task_list` | `teamRunId`, `status?`, `owner?` | `{tasks[]}` | List filtered tasks |
| 9 | `team_task_update` | `teamRunId`, `taskId`, `status`, `owner?` | `{task}` | Atomic file-lock claim/update |
| 10 | `team_task_get` | `teamRunId`, `taskId` | `{task}` | Fetch single task |

#### Query Tools

| # | Tool | Input | Output | Behavior |
|---|------|-------|--------|----------|
| 11 | `team_status` | `teamRunId` | JSON string | Full team run status |
| 12 | `team_list` | `scope?` ("user"\|"project"\|"all") | array of `{name, scope, status, teamRunId?, memberCount}` | Lists declared specs + active runs |

### State Management

**Storage layout** under `~/.omo/teams/{name}/`:

```
config.json           → TeamSpec (static)
state.json            → RuntimeState (mutable: members, sessionIDs, lifecycle)
mailbox/{name}.jsonl  → Per-recipient message inbox (append-only)
tasklist.jsonl        → Shared task list (JSONL, one Task per line)
worktrees/{member}/   → Git worktree per member (isolated working dir)
```

**6 state primitives**:
1. **Registry** (`team-registry/`): Discover/load config.json, validate member eligibility, path traversal guards
2. **Mailbox** (`team-mailbox/`): send, inbox read, poll, ack, delivery reservation
3. **Tasklist** (`team-tasklist/`): CRUD, atomic claim, update, dependency tracking
4. **State Store** (`team-state-store/`): Durable state.json with atomic file locks, status transitions, resume/recovery, stale-run cleanup
5. **Worktree** (`team-worktree/`): Per-member git worktree create/validate/cleanup
6. **Tmux Layout** (`team-layout-tmux/`): Optional focus+grid pane layout, rebalance, stale session sweep

### AGENT_ELIGIBILITY_REGISTRY

| Verdict | Agents | Notes |
|---------|--------|-------|
| `eligible` | `sisyphus`, `atlas`, `sisyphus-junior` | Full team member rights |
| `conditional` | `hephaestus` | Lacks `teammate: "allow"` permission by default |
| `hard-reject` | `oracle`, `librarian`, `explore`, `multimodal-looker`, `metis`, `momus`, `prometheus` | Read-only/plan-only → use `task` instead |

### Agent Spawning Model

Lead session spawns member sessions via `client.session.prompt`. Each member gets its own session ID tracked in `RuntimeStateMemberSchema.sessionId`. The `team-session-registry` provides spawn-race-safe `sessionID → {teamRunId, role, memberName}` lookups.

### Integration Points

| Integration Point | What Happens |
|---|---|
| `src/index.ts` | `checkTeamModeDependencies()` if enabled (verify git, tmux, `~/.omo/teams/`) |
| `tool-registry-team-tools.ts` | 12 team_* tools when `team_mode.enabled` |
| `create-transform-hooks.ts` | `team-mode-status-injector` + `team-mailbox-injector` |
| `create-tool-guard-hooks.ts` | `team-tool-gating` guard |
| `event.ts` | 4 team-session-event handlers |

### External Dependencies

- `@oh-my-opencode/tmux-core` (workspace) — tmux pane management
- `@oh-my-opencode/utils` (workspace) — shared utilities
- `zod` (v4.4.3) — schema validation

---

## PART B — Permission Guards (ALL 17 + 1 conditional)

### Registration

All guards created in `create-tool-guard-hooks.ts`, invoked from `tool-execute-before.ts` in registration order:

```
1. writeExistingFileGuard       10. rulesInjector
2. notepadWriteGuard            11. tasksTodowriteDisabler
3. questionLabelTruncator       12. webfetchRedirectGuard
4. claudeCodeHooks              13. fsyncSkipWarning
5. nonInteractiveEnv            14. prometheusMdOnly
6. bashFileReadGuard            15. sisyphusJuniorNotepad
7. commentChecker               16. atlasHook
8. directoryAgentsInjector     17. compactionTodoPreserver
9. directoryReadmeInjector      18. teamToolGating (conditional, +1 with team_mode)
```

### Guard Catalog by Category

#### SAFETY (6 + 1 conditional)

**1. `writeExistingFileGuard`** — Require Read before Write/Edit on existing files
- Tracks read files per session: `readPermissionsBySession: Map<sessionID, Set<canonicalPath>>`
- Throws error if writing to unread file; canonicalizes via `realpathSync.native`
- Deps: `node:fs`, `node:path`
- Source: `hooks/write-existing-file-guard/hook.ts`

**2. `bashFileReadGuard`** — Prefer Read tool over bash cat/head/tail
- Matches: `/^\s*cat\s+/`, `/^\s*head\s+/`, `/^\s*tail\s+/`
- Sets warning message; no deps
- Source: `hooks/bash-file-read-guard.ts`

**3. `notepadWriteGuard`** — Block Write to append-only notepad paths
- Checks `.omo/notepads/`, `.sisyphus/notepads/`
- Throws descriptive error
- Deps: `node:path`
- Source: `hooks/notepad-write-guard/index.ts`

**4. `teamToolGating`** — Restrict team_* tools by role (conditional)
- Resolves participant role via `team-session-registry`
- `team_create` = non-participants only; `team_delete`/`shutdown_request` = lead-only; `approve/reject_shutdown` = target member or lead; universal tools require active participation
- Deps: `@oh-my-opencode/team-core`
- Source: `hooks/team-tool-gating/hook.ts`

**5. `webfetchRedirectGuard`** — Resolve HTTP redirects before webfetch
- Pre-resolves redirect chain up to `MAX_WEBFETCH_REDIRECTS`
- Rewrites `output.args.url` to resolved URL; rewrites output on failure
- Source: `hooks/webfetch-redirect-guard/hook.ts`

**6. `fsyncSkipWarning`** — Warn when fsync is skipped
- Drains fsync-skip events from tracker during tool call
- Appends formatted warning to output
- Deps: `shared/fsync-skip-tracker`, `shared/fsync-skip-warning-formatter`
- Source: `hooks/fsync-skip-warning/index.ts`

**7. `commentChecker`** — Block AI-generated comment patterns
- Spawns `@code-yeongyu/comment-checker` binary to scan changed lines
- Supports bypass: `// @allow` per-line, `// comment-checker-disable-file` per-file
- Config: `comment_checker.enabled`, `comment_checker.custom_prompt`
- Deps: `@oh-my-opencode/comment-checker-core` + external binary
- Source: `hooks/comment-checker/hook.ts`

#### QUALITY (7)

**8. `emptyTaskResponseDetector`** — Detect empty task results
- After Task tool, checks if output is empty/whitespace
- Replaces with `[Task Empty Response Warning]`
- No deps
- Source: `hooks/empty-task-response-detector.ts`

**9. `toolOutputTruncator`** — Truncate oversized tool output
- After grep, glob, lsp_diagnostics, interactive_bash, skill_mcp, webfetch
- Default 50K tokens (10K for webfetch); uses `DynamicTruncator`
- Config: `experimental.truncate_all_tool_outputs`
- Deps: `shared/dynamic-truncator`
- Source: `hooks/tool-output-truncator.ts`

**10. `questionLabelTruncator`** — Truncate long Question tool labels
- Truncates option labels to 30 chars (appending "...")
- No deps
- Source: `hooks/question-label-truncator/hook.ts`

**11. `tasksTodowriteDisabler`** — Disable TodoWrite when task system active
- If `experimental.task_system` enabled, blocks specific tools
- Throws replacement message
- Source: `hooks/tasks-todowrite-disabler/hook.ts`

**12. `todoDescriptionOverride`** — Override todowrite tool description
- In `tool.definition` hook, replaces description for `todowrite`
- No deps
- Source: `hooks/todo-description-override/hook.ts`

**13. `planFormatValidator`** — Validate plan checkbox format
- After Write/Edit to `.omo/plans/*.md`, counts raw checkboxes vs `getPlanProgress()`
- Warns on malformed labels (T1., Phase 1:, Task-1. instead of 1.)
- Deps: `features/boulder-state/storage`
- Source: `hooks/plan-format-validator/hook.ts`

**14. `jsonErrorRecovery`** — Detect JSON parse errors, inject reminder
- After tool execute (except excluded tools), checks `JSON_ERROR_PATTERNS`
- Appends `JSON_ERROR_REMINDER` with fix guidance
- No deps
- Source: `hooks/json-error-recovery/hook.ts`

#### CONTEXT (3)

**15. `directoryAgentsInjector`** — Inject dir-local AGENTS.md on Read
- After Read, discovers AGENTS.md files near target path
- Auto-disables when OpenCode has native AGENTS.md injection
- Deps: `@oh-my-opencode/rules-engine`, `shared/dynamic-truncator`
- Source: `hooks/directory-agents-injector/hook.ts`

**16. `directoryReadmeInjector`** — Inject dir-local README.md on Read
- After Read, discovers README.md files near target path
- Deps: `shared/dynamic-truncator`
- Source: `hooks/directory-readme-injector/hook.ts`

**17. `rulesInjector`** — Inject rules (.rules, AGENTS.md) on file access
- After Read/Write/Edit/MultiEdit, discovers rule files near target path
- Per-session dedup via cache store; clears on session.deleted/compacted
- Deps: `shared/dynamic-truncator`, 19-file subsystem
- Source: `hooks/rules-injector/hook.ts`

#### COMPATIBILITY (2)

**18. `hashlineReadEnhancer`** — Tag Read output with LINE#ID hashes
- After Read (when `hashline_edit.enabled`), parses output lines, computes SHA256-based hash
- Transforms output adding `#XX` hash suffixes; also processes Write output to strip markers
- Deps: `tools/hashline-edit/hash-computation`
- Source: `hooks/hashline-read-enhancer/hook.ts` (216 LOC)

**19. `readImageResizer`** — Resize large images for context efficiency
- After Read, checks for image attachments (png/jpeg/gif/webp)
- Resizes via canvas operations based on model context window
- No deps (uses co-located helpers)
- Source: `hooks/read-image-resizer/hook.ts` (209 LOC)

### Guards with External Dependencies

| Guard | External Dep |
|---|---|
| `teamToolGating` | `@oh-my-opencode/team-core` |
| `commentChecker` | `@oh-my-opencode/comment-checker-core` + external binary |
| `directoryAgentsInjector` | `@oh-my-opencode/rules-engine` |
| `rulesInjector` | 19-file internal subsystem |
| `hashlineReadEnhancer` | `tools/hashline-edit/hash-computation` |
| `planFormatValidator` | `features/boulder-state/storage` |

### Config Gating

All guards gated via `disabled_hooks: string[]` (56 hook names total in omo's `HookNameSchema` enum).

## Migration Assessment

### Team Mode
**Verdict**: REIMPLEMENT (omo-own)
- 78 files, tightly coupled to OpenCode session API
- Depends on tmux-core, team-session-registry
- Agent spawning via `client.session.prompt`
- **Priority**: LOW (biggest feature, needs careful scoping as separate spec)
- **Effort**: EXTREME

### Permission Guards
**Verdict**: MIXED (selective port)

**Port directly (simple, no deps)**:
- `bashFileReadGuard` — 1 file, zero deps
- `questionLabelTruncator` — 1 file, zero deps
- `emptyTaskResponseDetector` — 1 file, zero deps
- `jsonErrorRecovery` — 1 file, zero deps
- `writeExistingFileGuard` — 1 file, node builtins only
- `notepadWriteGuard` — 1 file, node:path only
- `fsyncSkipWarning` — 1 file, needs shared tracker
- `todoDescriptionOverride` — 1 file, zero deps

**Port with deps**:
- `directoryAgentsInjector` — depends on rules-engine port
- `directoryReadmeInjector` — depends on shared/dynamic-truncator
- `rulesInjector` — 19-file subsystem, depends on rules-engine
- `hashlineReadEnhancer` — depends on hashline port
- `planFormatValidator` — depends on boulder-state

**Skip or reimplement**:
- `commentChecker` — needs external binary
- `teamToolGating` — needs team-core
- `webfetchRedirectGuard` — needs fetch impl
- `toolOutputTruncator` — needs dynamic-truncator
- `readImageResizer` — needs canvas/image processing

**Config**: `disabled_hooks: string[]` already in ocmm's schema
