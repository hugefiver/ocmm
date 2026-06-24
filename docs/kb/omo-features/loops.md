# omo Loop Systems

> **Source**: `omo/packages/omo-opencode/src/hooks/ralph-loop/`, `src/hooks/stop-continuation-guard/`, `src/hooks/compaction-context-injector/`, `src/hooks/compaction-todo-preserver/`, `src/hooks/todo-continuation-enforcer/`, `src/hooks/unstable-agent-babysitter/`, `src/hooks/background-notification/`, `src/hooks/atlas/`
> **Current ocmm status**: Only slash command templates are migrated locally (`/ralph-loop`, `/audit-loop`, `/dwloop`). They are registered through OpenCode `config.command` and ocmm also expands bare noninteractive `opencode run "/ralph-loop ..."` input as command context. The event-driven idle continuation engine, verifier orchestration, cancel/stop state, Boulder, and Atlas hooks remain future work.
> **Status**: Research complete
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.

## Overview

omo has **4 loop commands** and **7 continuation hooks** that together form an autonomous continuation system — the "Sisyphus rolls the boulder" mechanism. These are NOT peripheral features; they are core to omo's identity as an autonomous coding agent.

### Loop Commands

| Command | Purpose | Max Iterations | Strategy |
|---------|---------|----------------|----------|
| `/ralph-loop` | Self-referential development loop until completion | 100 | continue (default) or reset |
| `/audit-loop` (`/dwloop` alias) | Verified-completion deepwork loop with Oracle-style verification | 500 | continue (default) or reset |
| `/cancel-ralph` | Cancel active Ralph/ULW loop | — | — |
| `/stop-continuation` | Stop ALL continuation mechanisms + cancel descendants | — | — |

### Continuation Hooks (7)

| # | Hook | Event | Purpose |
|---|------|-------|---------|
| 1 | `stopContinuationGuard` | chat.message + event | Master stop switch; cancels descendant background tasks |
| 2 | `compactionContextInjector` | session.compacted | Save/restore agent/model/tools across compaction |
| 3 | `compactionTodoPreserver` | session.compacted | Save/restore todos across compaction |
| 4 | `todoContinuationEnforcer` (Boulder) | session.idle | Force continuation when todos incomplete |
| 5 | `unstableAgentBabysitter` | session.idle | Monitor stuck background tasks (120s timeout) |
| 6 | `backgroundNotificationHook` | event + chat.message | Forward events to BackgroundManager |
| 7 | `atlasHook` | event + tool.execute.* | Master orchestrator for boulder/ralph/subagent |

---

## 1. Ralph Loop

**Location**: `omo/packages/omo-opencode/src/hooks/ralph-loop/` (53 files, ~1687+ LOC)

### Architecture

Ralph Loop is **event-driven via `session.idle`**, NOT timer-based. The core loop pattern is simple (~300 LOC); complexity is in the surrounding safety hooks.

```
session.idle event
    ↓
event-handler-impl.ts (router)
    ↓
event-handler-idle.ts (decision gate)
    ↓ checks: active? background tasks? matches session? rapid-idle? completion? no-progress? max?
    ↓
continueSettledIteration() (150ms settle window)
    ↓
continueIteration()
    ↓
    ├── "continue" strategy: dispatchInternalPrompt() into SAME session
    └── "reset" strategy: session.create({parentID}) → inject into NEW child session
```

### Start Flow

1. `/ralph-loop` command → `loop-commands.ts`
2. → `hooks.ralphLoop.startLoop()`
3. → `loop-state-controller.ts` persists state to `.omo/ralph-loop.local.md`
4. State file: YAML frontmatter + markdown body
5. Auto-start via `default_mode.ralph_loop: true` config

### Continuation Prompt

```
[SYSTEM_DIRECTIVE - RALPH LOOP {ITERATION}/{MAX}]
Continue. Output <promise>{PROMISE}</promise> when done. {PROMPT}
```

The agent emits `<promise>DONE</promise>` when it believes work is complete.

### Stop Conditions

| Condition | Detection | Action |
|-----------|-----------|--------|
| Completion | `<promise>DONE</promise>` in output | `completion-handler.ts` → terminate |
| Max iterations | `iteration >= max_iterations` (default 100) | Terminate |
| No-progress turn | `finish="unknown"`, zero tokens, no content | `no-progress-turn-detector.ts` → terminate |
| Runtime error | Error in continuation dispatch | Terminate |
| Manual cancel | `/cancel-ralph` command | `cancelLoop()` → delete state file |
| Orphaned session | Session deleted while loop active | `loop-session-recovery.ts` → cleanup |

### State Persistence

**File**: `.omo/ralph-loop.local.md` (gitignored)

**Fields**:
- `active: boolean`
- `iteration: number`
- `max_iterations: number`
- `completion_promise: string` (e.g., "DONE")
- `started_at: ISO timestamp`
- `session_id: string`
- `ultrawork: boolean`
- `verification_pending: boolean` (ULW only)
- `strategy: "continue" | "reset"`
- `prompt: string` (the continuation prompt)

### Config

```typescript
ralph_loop: {
  enabled: boolean              // default: false
  default_max_iterations: number // 1-1000, default: 100
  state_dir?: string            // override default .omo/
  default_strategy: "continue" | "reset"  // default: "continue"
}
```

### Key File Inventory (Ralph Loop core, 53 files total)

| File | LOC | Purpose |
|------|-----|---------|
| `ralph-loop-hook.ts` | 123 | Hook factory |
| `event-handler-impl.ts` | 84 | Event router |
| `event-handler-idle.ts` | 182 | Idle decision gate (main loop logic) |
| `event-handler-continuation.ts` | 185 | `continueSettledIteration()` |
| `iteration-continuation.ts` | 101 | `continueIteration()` (the dispatch) |
| `loop-state-controller.ts` | 233 | State CRUD |
| `storage.ts` | 197 | File I/O to `.omo/ralph-loop.local.md` |
| `continuation-prompt-builder.ts` | 68 | Prompt templates |
| `continuation-prompt-injector.ts` | 200 | Dispatch via prompt-async-gate |
| `completion-promise-detector.ts` | 172 | Scan for `<promise>` tags |
| `completion-handler.ts` | 92 | Handle completion (ULW → verification) |
| `oracle-verification-detector.ts` | 62 | Parse Oracle VERIFIED |
| `pending-verification-handler.ts` | 220 | Verification pending state |
| `verification-failure-handler.ts` | 184 | Verification failure → retry |
| `no-progress-turn-detector.ts` | 119 | Detect stuck turns |
| `session-reset-strategy.ts` | 79 | Create child session for reset strategy |
| `loop-session-recovery.ts` | 33 | Crash/interrupt recovery |
| `types.ts` | 33 | Type definitions |
| `constants.ts` | 7 | Constants |

---

## 2. ULW Loop (Ultrawork Loop) — renamed to **audit-loop** in ocmm

Same infrastructure as Ralph Loop + `ultrawork: true` flag. In ocmm, this is named **audit-loop** to emphasize the verification oracle (the defining feature) rather than the "ultrawork" branding; `/dwloop` is the local deepwork-loop alias. Key differences:

| Aspect | Ralph Loop | ULW Loop |
|--------|-----------|----------|
| Max iterations | 100 | 500 (`ULTRAWORK_MAX_ITERATIONS`) |
| Verification | None | Two-phase Oracle verification |
| Start command | `/ralph-loop` | Upstream omo: `/ulw-loop` or `ultrawork` keyword. Local ocmm: `/audit-loop` or `/dwloop`. |
| System prompt | Standard | Pre-loads ultrawork system prompts |

### Two-Phase Verification Oracle

This is ULW's distinguishing feature — it doesn't trust the agent's `<promise>DONE</promise>` claim:

```
Phase 1: Agent emits <promise>DONE</promise>
    ↓
completion-handler.ts → markVerificationPending()
    ↓
inject ULTRAWORK_VERIFICATION_PROMPT:
    "Call task(subagent_type='oracle') to verify the work is complete."
    ↓
Phase 2: Oracle emits <promise>VERIFIED</promise>
    ↓
oracle-verification-detector.ts parses for:
    - Agent: oracle
    - <promise>VERIFIED</promise>
    ↓
Loop terminates with SUCCESS

If verification fails:
    ↓
verification-failure-handler.ts injects retry prompt
    ↓
Agent must redo the work
```

---

## 3. Cancel-Ralph (`/cancel-ralph`)

Simple cleanup command:

```typescript
loopState.cancelLoop(sessionID)
  → clearState()
  → delete .omo/ralph-loop.local.md
  → clear stop-continuation guard
```

---

## 4. Stop-Continuation (`/stop-continuation`)

**File**: `stop-continuation-guard/hook.ts` (123 LOC)

A master stop switch that persists across user messages (intentional — prevents accidental resumption).

```typescript
class StopContinuationGuard {
  private stoppedSessions: Set<string> = new Set()

  stop(sessionID: string): void {
    this.stoppedSessions.add(sessionID)
    // Recursively cancel ALL descendant background tasks
    cancelDescendantBackgroundTasks(sessionID)
  }

  isStopped(sessionID: string): boolean {
    return this.stoppedSessions.has(sessionID)
  }

  clear(sessionID: string): void {
    this.stoppedSessions.delete(sessionID)
  }
}
```

**Consumers**: `todoContinuationEnforcer` and `atlasHook` both check `isStopped()` before injecting continuation prompts.

**Clear conditions**:
- `session.deleted` event
- Explicit `clear()` from upstream `/start-work`, `/ulw-loop`, `/ralph-loop`

---

## 5. The 7 Continuation Hooks

Wired in `create-continuation-hooks.ts`.

### 5.1 stopContinuationGuard (123 LOC)

See §4 above.

### 5.2 compactionContextInjector (17 files)

**Event**: `session.compacted`

Saves agent/model/tools/variant before compaction, restores after. Ensures the loop continues with the same configuration even after context compression.

### 5.3 compactionTodoPreserver (3 files, 245 LOC)

**Event**: `session.compacted`

Saves todos before compaction, restores after. Prevents todo loss across context compression.

### 5.4 todoContinuationEnforcer / Boulder (14 files, ~2061 LOC)

**Event**: `session.idle`

The most complex continuation hook. Forces continuation when todos are incomplete:

- **2s countdown**: When session goes idle with incomplete todos, wait 2s
- **30s cooldown**: After injecting continuation, wait 30s before next check
- **5 failures → 5min pause**: If 5 consecutive no-progress turns, pause for 5 minutes
- Integrates with BoulderState (plan progress, task session state)

### 5.5 unstableAgentBabysitter (285 LOC)

**Event**: `session.idle`

Monitors stuck background tasks:
- 120s timeout per task
- Injects reminder messages to stuck agents
- 5min cooldown per task (avoids spam)

### 5.6 backgroundNotificationHook (55 LOC)

**Events**: `event` + `chat.message`

Forwards events to BackgroundManager. Injects pending background task completion notifications into the parent session.

### 5.7 atlasHook (58 files, ~1976 LOC)

**Events**: `event` + `tool.execute.before` + `tool.execute.after`

Master orchestrator for boulder/ralph/subagent coordination:
- Write/edit policies (enforces read-before-write, atomic edits)
- Verification reminders (for ULW loops)
- Final-wave approval (when all todos complete)

---

## 6. experimental.compaction.autocontinue

**File**: `session-compacting.ts` (181 LOC)

Fires on compaction completion:
- Skips compaction agents (don't loop the compactor)
- 10s duplicate guard (prevents double-fire)
- Restores `compactionContextInjector` + `compactionTodoPreserver` state

---

## 7. Dependencies

| Dependency | Used By | Purpose |
|------------|---------|---------|
| BackgroundManager | stop-continuation, background-notification | Task lifecycle, cancel descendants |
| BoulderState | atlas, todo-continuation-enforcer | Plan progress, task session state |
| Todo system (OpenCode `session.todo()`) | todo-continuation-enforcer | Todo tracking |
| prompt-async-gate | ralph-loop, all continuation | Safe internal message dispatch (duplicate-injection protection) |
| Session API | all loops | `messages()`, `promptAsync()`, `create()`, `abort()`, `todo()`, `status()` |
| claude-code-session-state | ralph-loop | Agent registry |
| Oracle agent | ULW loop | Verification |

---

## 8. External Dependencies

**None for loops specifically.** Only:
- `@opencode-ai/plugin`
- `@opencode-ai/sdk`
- `zod`
- `commander` (for CLI commands)
- Workspace packages

No external npm packages. No external binaries.

---

## 9. Test Coverage (~45+ files)

### Ralph Loop (~23 test files)
- `event-handler-characterization.test.ts`
- `completion-promise-detector.test.ts`
- `oracle-verification-detector.test.ts`
- `oracle-double-fire-race.test.ts`
- `reset-strategy-race-condition.test.ts`
- `stuck-oracle-dispatch-recovery.test.ts`
- `user-message-race.test.ts`
- `dispatch-failure-invariant.test.ts`
- `no-progress-loop-stop.test.ts`
- `ulw-loop-verification.test.ts`
- + ~13 more

### Continuation Hooks
- `stop-continuation-guard.test.ts`
- `compaction-context-injector/` (5 test files)
- `compaction-todo-preserver.test.ts`
- `todo-continuation-enforcer/` (4 test files)
- `background-notification.test.ts`
- `unstable-agent-babysitter.test.ts`
- `atlas/` (multiple test files)

### CLI
- `codex-ulw-loop.test.ts`
- `run/continuation-state/` (3 test files)

### Plugin-level
- `index.compacting.test.ts`
- `index.compaction-model-agnostic.static.test.ts`

---

## 10. Migration Assessment

### Import (port with minimal adaptation)

| Component | LOC | Rationale |
|-----------|-----|-----------|
| `storage.ts` | 197 | Pure file I/O to `.omo/ralph-loop.local.md`. No OpenCode deps. |
| `continuation-prompt-builder.ts` | 68 | Pure prompt templates. |
| `no-progress-turn-detector.ts` | 119 | Core logic is agnostic (checks for zero tokens, no content). |
| `compaction-context-injector` | 17 files | Checkpoint capture/restore pattern is portable. |
| `compaction-todo-preserver` | 3 files, 245 LOC | Todo save/restore logic. |
| `unstable-agent-babysitter` core | 285 LOC | Stuck-task detection logic. |
| `stop-continuation-guard` | 123 LOC | Simple Set-based guard. Adapts to any event model. |

### Reimplement (rebuild against ocmm's runtime)

| Component | LOC | Rationale |
|-----------|-----|-----------|
| Ralph Loop core (event-handler-idle, continuation, iteration) | ~550 LOC | Event-driven, tied to `session.idle` event. Core pattern is simple but OpenCode-specific. |
| `completion-promise-detector.ts` | 172 | Tied to `session.messages()` API. |
| Verification oracle (ULW) | ~466 LOC | Uses `task(subagent_type="oracle")` — needs ocmm's task tool. |
| `todo-continuation-enforcer` (Boulder) | ~2061 LOC | Tied to OpenCode `session.todo()` API, countdown toast, BoulderState. |
| `atlasHook` | ~1976 LOC | Deeply tied to OpenCode event model + BoulderState. 58 files. |

### Priority Ranking

| Priority | Component | Value | Effort |
|----------|-----------|-------|--------|
| **HIGH** | State persistence (storage.ts) + no-progress detector | Foundation — loops can't work without state | Low (import) |
| **HIGH** | Stop-continuation guard | Safety critical — prevents runaway loops | Low (import) |
| **MEDIUM** | Continuation prompt builder | Templates for loop prompts | Low (import) |
| **MEDIUM** | Ralph Loop core (reimplement) | The actual loop engine | Medium (~550 LOC) |
| **MEDIUM** | Compaction hooks (context + todo preserver) | Loop survives compaction | Medium (import + adapt) |
| **MEDIUM** | audit-loop verification oracle (was ULW) | Verified completion — the defining feature of audit-loop. Phase 8b promotes this to P2. | Medium (~466 LOC) |
| **LOW** | todoContinuationEnforcer (Boulder) | Complex, OpenCode-tied. Deferred — not in Phase 8a/8b. | High (~2061 LOC) |
| **LOW** | atlasHook | Very complex, deeply integrated. Deferred — not in Phase 8a/8b. | High (~1976 LOC) |

### Follow-up Development Plan

Current ocmm intentionally stops at slash-command loop templates. A future full loop runtime should be split into guarded, reviewable phases:

1. **Ralph Loop runtime MVP**: add loop state storage, no-progress detection, completion-promise detection, continuation prompt building, and a session-scoped `session.idle` handler. The handler must filter strictly to the active loop session and must never re-prompt completed child/subagent sessions.
2. **Stop/cancel safety hooks**: add `/cancel-ralph`, `/stop-continuation`, and the stop-continuation guard before enabling any automatic continuation by default. This is a prerequisite for safe idle continuation.
3. **Compaction hooks**: migrate/adapt compaction context injection and todo preservation so a running loop can survive context compaction without losing agent/model/tool state or outstanding todos.
4. **Audit verification loop**: extend `/audit-loop` and `/dwloop` beyond prompt templates with explicit reviewer/oracle verification. Prefer blocking task calls for verifier work to avoid extra idle continuation messages.
5. **Deferred heavy hooks**: keep `todoContinuationEnforcer`/Boulder and `atlasHook` out of the MVP. They remain useful follow-up work after the core runtime is stable, because both are large and tightly tied to OpenCode's event/task model.

Acceptance bar for enabling the runtime: unit tests for state, completion detection, stop/cancel, and no-progress behavior; integration tests for parent plus child sessions; and live isolated OpenCode tests proving the loop continues only its own session and stops on completion, cancellation, and verifier failure.

---

## Key Architectural Insight

**The core loop is simple; the safety hooks are complex.**

The actual Ralph Loop mechanism (~300 LOC) is straightforward:
1. Listen for `session.idle`
2. Check stop conditions
3. Inject continuation prompt

The complexity (4000+ LOC) is in the **safety and verification layer**:
- Verification oracle (ULW): Don't trust "I'm done"
- Boulder todo enforcer: Don't stop if todos incomplete
- Atlas hook: Orchestrate everything
- Babysitter: Catch stuck agents
- Compaction preservers: Survive context loss

For ocmm migration, the **minimum viable loop** is:
1. `stop-continuation-guard` (123 LOC) — safety
2. `storage.ts` (197 LOC) — state
3. `continuation-prompt-builder.ts` (68 LOC) — prompts
4. `no-progress-turn-detector.ts` (119 LOC) — stuck detection
5. Core loop logic (~300 LOC reimplemented) — idle → check → inject

**Total MVP: ~800 LOC** (vs omo's ~5500+ LOC with all hooks).

The verification oracle, Boulder, and Atlas can be added later as independent enhancements.

---

## 11. Known omo Bugs + Migration Constraints

### 11.1 User-Message Injection Hits Completed Subagents

**Bug**: omo's `dispatchInternalPrompt()` wraps `client.session.prompt()` fired from the `session.idle` event handler. The event handler does NOT filter by session ID — it fires for ALL `session.idle` events, including sessions of already-completed subagents.

**Symptom**: When a loop runs in session A and a subagent was spawned into session B (now complete), omo's unfiltered handler re-prompts session B with a continuation directive. The completed subagent has no work to do, so it emits nothing useful, and the workflow stalls waiting for a `<promise>` that never comes.

**Root cause**: Missing session-ID filter in `event-handler-idle.ts`. The correct check is:
```typescript
if (input.properties.sessionID !== loopState.session_id) return;
```

**OpenCode API constraint**: There is **no native "system message injection" or "nudge" API** in OpenCode. All continuation ultimately requires some form of message injection. The available mechanisms are:

| Mechanism | Status | Suitability for loops |
|-----------|--------|----------------------|
| `session.stopping` hook (PR #16598) | **NOT merged** (assigned to @kitlangton, issue #16626) | IDEAL — pre-emptive, fires before loop breaks, `output.stop = false` + `output.message` re-enters. No race conditions. No session-ID filter needed because it's per-session by design. |
| `session.idle` + `client.session.prompt()` | Working (used by `/goal` plugin, commit d11ead8) | Current mechanism. MUST filter by session ID. Known bug #32010: async prompts to idle sessions can be silently dropped. Need `inFlight` Set + `lastIdle` Map for re-entrancy guards. 500ms delay recommended for state machine stability (per codemcp/workflows plugin). The injected message IS a user message (visible in conversation). |
| `experimental.chat.system.transform` | Working | Appends loop directives to system prompt. Does NOT trigger continuation, only modifies existing turns. Useful for telling agent "you are in a loop". |
| `experimental.session.compacting` | Working | Inject loop state (iteration, phase, active files) into compaction summary. Persistent across compaction. |
| `experimental.compaction.autocontinue` | Working | Can set `enabled: false` to skip synthetic 'continue' user message after compaction. Default: enabled (true). |
| `experimental.chat.messages.transform` | Working (PR #19961 added sessionID + model) | Modify messages array going to LLM. Temporary (not persisted). |
| `chat.message` + `noReply` | Issue #26022, NOT implemented | Would let plugin skip assistant turn. |
| `tool.execute.after` + `output.inject` | Issue #19519, NOT implemented | Let tool hooks inject AI-visible messages. |
| `todo.updated` event | Working | Session-scoped state observation. Agent's `todowrite` tool fires this. Plugin can observe todo completion to decide loop continuation. |

**Migration constraint**: Phase 8a MUST use a 3-tier approach:

1. **Tier 1 (future, when merged)**: Migrate to `session.stopping` hook (PR #16598). This is the clean solution — per-session, pre-emptive, no race conditions. Track the PR and migrate when it lands.

2. **Tier 2 (current)**: Use `session.idle` + `client.session.prompt()` with **STRICT session-ID filter**:
   ```typescript
   // CRITICAL: Only re-prompt the loop's own session
   if (input.properties.sessionID !== loopState.session_id) return;
   ```
   Plus:
   - `inFlight: Set<sessionID>` to prevent double-dispatch
   - `lastIdle: Map<sessionID, timestamp>` with 500ms debounce
   - 150ms settle window before dispatch (omo's pattern, keep it)

3. **Tier 3 (hybrid, always-on)**: Use `experimental.chat.system.transform` to inject loop directives (iteration count, completion instructions) into the system prompt. This does NOT trigger continuation but ensures the agent knows it's in a loop. Combine with `experimental.session.compacting` to persist loop state across compaction.

**What MUST NOT be replicated**: omo's pattern of firing `dispatchInternalPrompt()` for every `session.idle` without a session-ID filter.

### 11.2 XML Tag Detection Fragility

**Bug**: omo detects completion via `<promise>DONE</promise>` / `<promise>VERIFIED</promise>` tags. The detector (`completion-promise-detector.ts`, 172 LOC) uses a regex that requires exact tag format. When subagents don't strictly follow the convention (extra whitespace, different case, attributes on the tag, Markdown code fences around it, etc.), detection fails and the loop either stalls or runs forever.

**Migration constraint**: ocmm's completion detector MUST:

1. **Tolerate whitespace**: `<promise>DONE</promise>`, `<promise>  DONE  </promise>`, `<promise>\nDONE\n</promise>`
2. **Tolerate case**: `<promise>DONE</promise>`, `<PROMISE>done</PROMISE>`, `<Promise>Done</Promise>`
3. **Tolerate attributes**: `<promise type="done">DONE</promise>`, `<promise level="final">VERIFIED</promise>`
4. **Tolerate surrounding Markdown**: `\<promise>DONE</promise\>`, `` `<promise>DONE</promise>` ``, `<promise>DONE</promise>`
5. **Fallback matching**: If no tag found within N seconds (configurable, default 60s), fall back to keyword detection: "done", "complete", "finished", "verified" — combined with a confidence heuristic.
6. **Timeout**: Hard timeout per iteration (default 5min). If no completion signal after 5min, mark iteration as no-progress and apply no-progress handling.

**Implementation**: Robust regex pattern:
```typescript
const COMPLETION_PATTERN = /<promise[^>]*>\s*(DONE|VERIFIED)\s*<\/promise>/i;
```

Plus fallback keyword scan:
```typescript
const FALLBACK_KEYWORDS = /\b(done|complete(?:d)?|finished|verified)\b/i;
// Only applied if no tag match AND timeout exceeded
```

### 11.3 OpenCode API Gaps (track for future)

These proposed OpenCode features would simplify the loop implementation. Track them and migrate when available:

| Proposal | Status | Benefit |
|----------|--------|---------|
| `session.stopping` hook (PR #16598) | Assigned, not merged | Pre-emptive re-entry, no session-ID filter needed |
| `chat.message` + `noReply` (issue #26022) | Not implemented | Skip assistant turn cleanly |
| `tool.execute.after` + `output.inject` (issue #19519) | Not implemented | Inject AI-visible messages from tool hooks |

### 11.4 Mitigation: Prefer Blocking Task + Merge Reminders

**Constraint**: In current OpenCode, continuation ultimately requires injecting a user message via `client.session.prompt()` — there is no "continue session without a new user prompt" API. The omo bug (§11.1) is NOT that injection is fundamentally wrong, but that omo injects indiscriminately into all idle sessions. Two mitigations reduce injection frequency and blast radius:

**Mitigation A: Prefer blocking `task` over async `task`**

When a loop iteration needs to wait for a subagent (e.g., the audit-loop verification oracle), the agent prompt SHOULD instruct the model to use `task(run_in_background=false, subagent_type="oracle", ...)`. This blocks until the subagent completes and returns its result directly in the same turn — no `session.idle` event fires for the subagent, no parent-wake notification needs to be injected, and no second user message is needed to retrieve results.

```
BAD:  task(run_in_background=true, subagent_type="oracle", ...)
      → subagent runs in background
      → parent session goes idle
      → loop injects continuation prompt to retrieve results
      → 2 messages injected, subagent's idle event may trigger stray re-prompts

GOOD: task(run_in_background=false, subagent_type="oracle", ...)
      → blocks until oracle returns
      → result available in same turn
      → 0 extra messages injected
      → loop can immediately decide next iteration based on result
```

**Where async is still needed**: Only for genuinely parallel work where the parent has other useful work to do concurrently (e.g., spawning 3 explore agents to scan different directories). In those cases, the parent should collect results via `background_output` within the same turn before emitting its own completion, avoiding idle-triggered continuation.

**Mitigation B: Merge multiple reminders into a single injection**

When multiple events would each trigger a notification (e.g., 3 background tasks completed, 2 todo items updated, 1 compaction occurred), the loop's notification queue SHOULD coalesce them into a single message before injecting. Pattern:

```typescript
// BAD: inject one message per event
for (const event of pendingEvents) {
  await client.session.prompt(sessionID, formatEvent(event));
  // each call is a separate user message
}

// GOOD: coalesce into one message
if (pendingEvents.length > 0) {
  const merged = formatMergedReminders(pendingEvents);
  await client.session.prompt(sessionID, merged);
  pendingEvents.length = 0;  // clear after injection
}
```

**Implementation requirement**: Loop's notification buffer MUST have:
1. A coalesce window (default 500ms) — accumulate events before injecting
2. A max buffer size (default 5) — flush immediately if exceeded to avoid unbounded delay
3. Dedup by event type + target — don't inject "background task X completed" twice
4. Single injection per loop iteration — at most one reminder message per `continueIteration()` call
