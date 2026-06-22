# omo Feature Migration Design Spec

> **Date**: 2026-06-23
> **Branch**: `feature/omo-integration` (worktree at `../ocmm-omo-integration`)
> **Status**: Design — awaiting review
> **KB Reference**: `docs/kb/omo-features/*.md` (10 docs: config-and-registration, config-schema-design, delegate-core, hashline, loops, lsp-integration, mcp-infrastructure, rules-and-agents-md, shared-skills, team-core-and-guards)

## Problem Statement

ocmm currently migrates only omo's **workflow layer** (prompts/omo, prompts/v1, skills/v1). omo has substantial non-workflow features — hashline edit reliability, LSP integration, shared-skills, MCP infrastructure, team mode, permission guards, rules engine, background agents — that should also be available in ocmm, configurable to enable/disable.

User's principle: **third-party general tools import directly; omo-own toolchain reimplement ourselves.**

## Goal

Migrate omo's non-workflow features into ocmm progressively, each independently toggleable via config, following the import-vs-reimplement principle.

## Categorization: Import vs Reimplement

| Feature | Category | Rationale | Effort |
|---|---|---|---|
| **shared-skills** (11 skills) | **Import** (3 copy-as-is) + **Adapt** (8 rewrite) | SKILL.md files are data, not code. 3 have zero omo refs (copy). 8 need `task()`/`call_omo_agent` calls rewritten to ocmm's API. | Low–Medium |
| **ast-grep** skill | **Import** | Pure CLI wrapper + Python helper. Zero omo deps. | Low |
| **mcp-stdio-core** | **Import** | Zero-dep JSON-RPC framing. Pure utility. | Low |
| **mcp-client-core** | **Import** | OAuth + client lifecycle. Self-contained, depends only on `@modelcontextprotocol/sdk`. | Medium |
| **Built-in MCPs** (websearch, context7, grep_app, lsp, codegraph) | **Import config** | These are config objects pointing at remote/local MCP servers. Import the config definitions. | Low |
| **hashline-core** | **Reimplement** | omo-own edit reliability system. Clean boundary, only `diff` dep. Reimplement to own the algorithm. | Medium |
| **rules-engine** | **Reimplement** | omo-own rule discovery + matching. Uses picomatch (third-party) but the engine is omo's design. | Medium |
| **agents-md-core** | **Reimplement** | Thin wrapper over rules-engine. omo-own. | Low |
| **permission guards** (17) | **Reimplement** | omo-own safety/quality/context/compat hooks. Each is small (<250 LOC), self-contained. | Medium |
| **delegate-core** | **Import** | 380 LOC pure functions for model selection. Harness-neutral. | Low |
| **ConcurrencyManager** | **Import** | 175 LOC, zero deps. Pure FIFO queue logic. | Low |
| **BackgroundManager** | **Skip** | OpenCode already provides `task`, `background_output`, `background_cancel` as built-in tools. No need to rebuild 3188 LOC. | — |
| **team-core** | **Reimplement** | omo-own team coordination primitives. 78 files. | High |
| **Team Mode hooks** | **Reimplement** | omo-own. Conditional on team_core. | Medium |
| **comment-checker-core** | **Import wrapper** | Wraps external `@code-yeongyu/comment-checker` binary. Import the wrapper, binary is third-party. | Low |
| **config schema extensions** | **Reimplement** | Take omo's patterns (disabled_*, feature namespaces) but design ocmm's own schema. | Low |
| **Ralph Loop** (core) | **Reimplement** (core) + **Import** (storage, prompt builder, no-progress detector) | Core autonomous continuation mechanism — the "Sisyphus rolls boulder" engine. Event-driven via session.idle. Core ~300 LOC, MVP ~800 LOC. | Medium |
| **audit-loop** (was ULW, verification oracle) | **Reimplement** | Two-phase Oracle verification for verified-completion loops. Uses built-in `task(subagent_type="oracle")`. | Medium |
| **Stop-Continuation Guard** | **Import** | 123 LOC, simple Set-based guard. Safety critical. | Low |
| **Compaction hooks** (context + todo preserver) | **Import** + adapt | Save/restore agent state + todos across compaction. ~262 LOC. | Medium |
| **todoContinuationEnforcer** (Boulder) | **Reimplement** | 2061 LOC, tied to OpenCode todo API + BoulderState. Defer to later phase. | High |
| **atlasHook** | **Reimplement** | 1976 LOC, master orchestrator. Defer to later phase. | High |
| **Agent Sort Shim** | **Skip** | Hack for OpenCode 1.4.x bug. May be fixed upstream. | — |
| **i18n** (16 toast keys) | **Skip** | Low value for ocmm's scope. | — |
| **Telemetry** (PostHog) | **Skip** | Privacy concern, ocmm is small. | — |
| **Config migration system** | **Skip** | ocmm has no legacy config. Add only if breaking changes. | — |
| **OpenClaw** | **Skip** | Discord/Telegram integration. Out of scope. | — |
| **Boulder State** (standalone) | **Skip** | Work tracking. Only needed if todoContinuationEnforcer/atlas ported. | — |

## Progressive Integration Plan

### Phase 0: Config Schema Foundation (PR 1)

**Goal**: Add gating mechanism before any feature lands.

**Changes**:
- Add `disabledHooks`, `disabledTools`, `disabledSkills`, `disabledCommands`, `disabledMcps` to `OcmmConfigSchema` (all optional arrays)
- Add same arrays to `ProfileEntrySchema` (replace semantics)
- No behavior change — fields parsed but nothing reads them

**Code skeleton** (for `src/config/schema.ts`):
```typescript
// Add to OcmmConfigSchema
disabledHooks: z.array(z.string()).optional(),
disabledTools: z.array(z.string()).optional(),
disabledSkills: z.array(z.string()).optional(),
disabledCommands: z.array(z.string()).optional(),
disabledMcps: z.array(z.string()).optional(),

// Add same fields to ProfileEntrySchema (replace semantics on overlay)
```

**Files**: `src/config/schema.ts`
**Effort**: ~30 min
**Risk**: Zero — additive, optional, no consumers

### Phase 1: Agent Override Extensions (PR 2)

**Goal**: Extend `AgentEntrySchema` for richer per-agent config needed by later features.

**Changes**:
- Add optional: `tools: Record<string, boolean>`, `skills: string[]`, `promptAppend: string`, `temperature`, `topP`, `maxTokens`, `thinking`, `reasoningEffort`
- No behavior change — fields parsed but not consumed by router yet

**Files**: `src/config/schema.ts`
**Effort**: ~30 min
**Risk**: Zero — additive, optional

### Phase 2: Quick Wins — shared-skills (4 copy-as-is) (PR 3)

**Goal**: Land the 4 zero-dependency skills immediately.

**Skills**: `git-master`, `ast-grep`, `frontend`, `debugging` (all from `omo/packages/shared-skills/skills/`, all zero omo refs)

**Changes**:
- Copy 4 skill directories to `skills/` (new top-level dir, not `skills/v1/`)
- Add `skills` config namespace: `{ sources, enable, disable }`
- Wire skill loading into config hook (scan `skills/` directory)
- Skills are loadable via `task(load_skills=["git-master"], ...)` — **requires Phase 7 (task enhancement)** or verification that OpenCode's built-in `task` tool supports `load_skills`. See Open Question #3.

**Files**: `skills/git-master/`, `skills/ast-grep/`, `skills/frontend/`, `skills/debugging/`, `src/config/schema.ts`, `src/hooks/config.ts` (skill loading)
**Effort**: ~2 hours
**Risk**: Low — skills are pure markdown, no runtime impact unless loaded
**Dependency**: Phase 7 (task enhancement) — OR verify built-in `task` supports `load_skills`. If neither, skills can be copied but won't be loadable until Phase 7 or equivalent lands.

### Phase 3: Hashline (PR 4)

**Goal**: Port hashline edit reliability system.

**Changes**:
- Reimplement `hashline-core` (~17 src files): hash computation, marker format, edit pipeline, autocorrect, stale detection
- Add `hashline-edit` tool (replaces `edit` tool when enabled)
- Add `hashline-read-enhancer` hook (tags Read output with LINE#ID)
- Add `hashline: { enabled }` config namespace
- Single dep: `diff` ^9.0.0 (for unified diff)

**KB Ref**: `docs/kb/omo-features/hashline.md`
**Files**: `src/hashline/`, `src/tools/hashline-edit.ts`, `src/hooks/hashline-read-enhancer.ts`, `src/config/schema.ts`
**Effort**: ~1 week
**Risk**: Medium — touches edit tool, needs careful testing

### Phase 4: Rules Engine + AGENTS.md (PR 5)

**Goal**: Port workspace rule injection + AGENTS.md walk-up discovery.

**Changes**:
- Reimplement `rules-engine` (finder, matcher with picomatch, engine with truncation budgets)
- Reimplement `agents-md-core` (walk-up AGENTS.md discovery)
- Add `rules-injector` hook (tool.execute.after for read/write/edit/multiedit)
- Add `directory-agents-injector` hook (tool.execute.after for read only)
- Add `rules: { enabled, skipClaudeUserRules }` config namespace
- Deps: `picomatch` ^4.0.4

**KB Ref**: `docs/kb/omo-features/rules-and-agents-md.md`
**Files**: `src/rules/`, `src/hooks/rules-injector.ts`, `src/hooks/directory-agents-injector.ts`, `src/config/schema.ts`
**Effort**: ~3-4 days
**Risk**: Low — additive hooks, no existing behavior changed

### Phase 5: MCP Infrastructure (PR 6)

**Goal**: Port MCP client lifecycle + OAuth + 5 built-in MCPs.

**Changes**:
- Import `mcp-stdio-core` (zero-dep, copy as-is)
- Import `mcp-client-core` (OAuth, client lifecycle — adapt to ocmm's module structure)
- Import 5 built-in MCP config definitions (websearch, context7, grep_app, lsp, codegraph)
- Add `mcp` config namespace + `disabledMcps` (already in Phase 0)
- Add `skill_mcp` tool (MCP tool dispatch from skills)
- Add SKILL.md YAML frontmatter MCP config parsing

**KB Ref**: `docs/kb/omo-features/mcp-infrastructure.md`
**Files**: `src/mcp/`, `src/tools/skill-mcp.ts`, `src/config/schema.ts`
**Effort**: ~1 week
**Risk**: Medium — OAuth flow needs testing, but self-contained

### Phase 6: Permission Guards (PR 7-8)

**Goal**: Port the 17 safety/quality/context/compat guards.

**Changes** (split into 2 PRs, excluding guards already implemented in earlier phases):
- **PR 7 (Safety + Compat, 6 new guards)**: writeExistingFileGuard, bashFileReadGuard, notepadWriteGuard, webfetchRedirectGuard, fsyncSkipWarning, commentChecker, readImageResizer
  - Note: `hashlineReadEnhancer` already implemented in Phase 3 — not re-listed here
- **PR 8 (Quality + Context, 7 new guards)**: emptyTaskResponseDetector, toolOutputTruncator, questionLabelTruncator, tasksTodowriteDisabler, todoDescriptionOverride, planFormatValidator, jsonErrorRecovery, directoryReadmeInjector
  - Note: `directoryAgentsInjector` already implemented in Phase 4 — not re-listed here
  - Note: `rulesInjector` already implemented in Phase 4 — not re-listed here
- Each guard gated via `disabledHooks`

**KB Ref**: `docs/kb/omo-features/team-core-and-guards.md`
**Files**: `src/hooks/*.ts` (17 files), `src/hooks/index.ts`
**Effort**: ~1 week
**Risk**: Medium — guards intercept tool calls, need careful ordering

### Phase 7: Task Enhancement (optional, PR 9)

**Goal**: Optionally enhance OpenCode's built-in `task` tool with category routing + skill injection + fallback models.

**Context**: OpenCode already provides `task`, `background_output`, `background_cancel`, `session_list`, `session_read` etc. as built-in tools. omo registers its own `task` tool that **shadows** the built-in to add: category → model resolution, skill content injection, fallback model chains, concurrency limits per provider/model.

**Decision needed**: Does ocmm need these enhancements, or is the built-in `task` sufficient?

- If built-in is sufficient → **skip this phase entirely**
- If category/skill enhancements needed → port `delegate-core` (380 LOC pure functions) + `ConcurrencyManager` (175 LOC, zero deps). Do NOT build BackgroundManager — use OpenCode's built-in background infrastructure.

**Changes** (if proceeding):
- Import `delegate-core` (model selection, error detection, retry guidance)
- Import `ConcurrencyManager` (FIFO queue, per-key limits)
- Register ocmm `task` tool that wraps/enhances built-in
- Add `background_task` config namespace (concurrency limits, circuit breaker)

**KB Ref**: `docs/kb/omo-features/delegate-core.md`
**Files**: `src/delegate/`, `src/tools/task.ts`, `src/config/schema.ts`
**Effort**: ~3-4 days (vs original 2 weeks — no BackgroundManager rebuild)
**Risk**: Medium — shadowing built-in tool needs careful testing
**Note**: Loops (Phase 8) do NOT depend on this phase. They use the built-in `task` tool for ULW verification oracle.

### Phase 8a: Loops MVP — Ralph + Audit-Loop Basic (PR 10a)

**Goal**: Port the autonomous continuation mechanism — ocmm's "Sisyphus rolls the boulder" engine.

**Naming**: ULW Loop renamed to **audit-loop** (emphasizes the verification oracle — the defining feature that distinguishes it from ralph-loop).

**CRITICAL CONSTRAINT — User-Message Injection Bug**:

omo's `dispatchInternalPrompt()` fires for ALL `session.idle` events without filtering by session ID. This re-prompts already-completed subagent sessions, stalling the workflow. ocmm's implementation MUST NOT replicate this pattern.

**ADDITIONAL CONSTRAINT — Minimize Injection via Blocking Task + Reminder Merging**:

Even with the session-ID filter, injecting user messages for continuation is fragile. Two mitigations reduce injection frequency:

1. **Prefer blocking `task` over async `task`**: The loop's system prompt MUST instruct the model to use `task(run_in_background=false, ...)` when waiting for subagent results (e.g., audit-loop verification oracle). Blocking task returns results in the same turn — no `session.idle` event fires for the subagent, no parent-wake notification needs injection, and the loop can immediately decide the next iteration. Async `task` is reserved for genuinely parallel work where the parent has other useful work to do concurrently.

2. **Merge multiple reminders into a single injection**: When multiple events would each trigger a notification (e.g., 3 background tasks completed, 2 todo items updated), the loop's notification buffer MUST coalesce them into a single message before injecting. Implementation requirements:
   - Coalesce window (default 500ms) — accumulate events before injecting
   - Max buffer size (default 5) — flush immediately if exceeded
   - Dedup by event type + target — don't inject "background task X completed" twice
   - At most one reminder message per `continueIteration()` call

**3-Tier Continuation Architecture**:

1. **Tier 1 (future, when OpenCode PR #16598 merges)**: Migrate to `session.stopping` hook — the clean, per-session, pre-emptive solution. Track the PR.

2. **Tier 2 (current)**: `session.idle` + `client.session.prompt()` with **STRICT session-ID filter**:
   ```typescript
   // CRITICAL: Only re-prompt the loop's own session, never descendants
   if (input.properties.sessionID !== loopState.session_id) return;
   ```
   Plus re-entrancy guards: `inFlight: Set<sessionID>`, `lastIdle: Map<sessionID, timestamp>` with 500ms debounce, 150ms settle window.

3. **Tier 3 (hybrid, always-on)**: `experimental.chat.system.transform` injects loop directives (iteration count, completion instructions) into system prompt — no message dispatch, no race risk. Combined with `experimental.session.compacting` for state persistence across compaction.

**XML Tag Robustness (CRITICAL)**:

Completion detection MUST tolerate:
- Whitespace: `<promise>  DONE  </promise>`
- Case variants: `<PROMISE>done</PROMISE>`
- Attributes: `<promise type="done">DONE</promise>`
- Surrounding Markdown: `` `<promise>DONE</promise>` ``, `\<promise>DONE</promise\>`
- Fallback keyword detection after configurable timeout (default 60s): "done", "complete", "finished", "verified"
- Hard per-iteration timeout (default 5min) → no-progress handling

Robust regex: `/<promise[^>]*>\s*(DONE|VERIFIED)\s*<\/promise>/i`

**Changes** (split into 2 PRs):

- **PR 10a (MVP Loop)**: Import storage.ts (197 LOC), continuation-prompt-builder (68 LOC), no-progress-turn-detector (119 LOC), stop-continuation-guard (123 LOC). Reimplement core loop logic (~300 LOC) against ocmm's `session.idle` event **with session-ID filter**. Add `/ralph-loop`, `/audit-loop` (basic, no verification yet), `/cancel-ralph`, `/stop-continuation` commands. Add `ralph_loop` config namespace. Implement robust completion detector (regex + fallback + timeout per §11.2 of loops.md).
- **PR 10b (Verification + Compaction)**: Import compaction-context-injector + compaction-todo-preserver. Reimplement audit-loop verification oracle (~466 LOC, uses built-in `task` tool with `subagent_type="oracle"`). Enable verification for `/audit-loop` command.

### Phase 8b: Audit-Loop Verification + Compaction Hooks (PR 10b)

**KB Ref**: `docs/kb/omo-features/loops.md` (§11 documents the bugs and constraints)
**Files**: `src/loops/`, `src/hooks/stop-continuation-guard.ts`, `src/hooks/compaction-*.ts`, `src/commands/ralph-loop.ts`, `src/commands/audit-loop.ts`, `src/commands/cancel-ralph.ts`, `src/commands/stop-continuation.ts`, `src/config/schema.ts`
**Effort**: ~1 week (MVP) + 1 week (verification + compaction)
**Risk**: Medium — core loop is simple, but session-ID filter is CRITICAL. Without it, the omo bug reproduces. Test thoroughly with background subagents.

**Deferred**: todoContinuationEnforcer (Boulder, 2061 LOC) and atlasHook (1976 LOC) are NOT in this phase. They add safety but are not required for a functional loop. They can be added later as independent enhancements.

### Phase 9: Team Mode (PR 11, separate spec)

**Goal**: Port team-core + team mode hooks.

**Note**: This is the biggest feature (78 files in team-core alone). Should have its own spec. Listed here for completeness.

**KB Ref**: `docs/kb/omo-features/team-core-and-guards.md`
**Effort**: ~3 weeks
**Risk**: High — multi-agent coordination, tmux integration, complex state management

### Phase 10: Remaining shared-skills (PR 12-13)

**Goal**: Port the 8 skills that need adaptation.

**Changes** (split by rewrite complexity):
- **PR 12 (Minor rewrite)**: init-deep (replace `task(subagent_type="explore")` calls)
- **PR 13 (Moderate-Major rewrite)**: remove-ai-slops, visual-qa, tech-debt-audit, refactor, review-work, github-triage, remove-deadcode

**KB Ref**: `docs/kb/omo-features/shared-skills.md`
**Effort**: ~1 week
**Risk**: Low — skills are markdown, adaptation is mechanical

## Priority Ranking

| Priority | Phase | Feature | Value | Effort | Risk |
|---|---|---|---|---|---|
| **P0** | 0 | Config schema foundation | Enabler | 30m | Zero |
| **P0** | 1 | Agent override extensions | Enabler | 30m | Zero |
| **P1** | 2 | shared-skills (3 copy-as-is) | High | 2h | Low |
| **P1** | 3 | Hashline | High (6.7%→68.3% edit success) | 1w | Med |
| **P1** | 8a | Loops MVP (Ralph + audit-loop basic + stop guard) | High (autonomous continuation) | 1w | Med |
| **P2** | 4 | Rules engine + AGENTS.md | Medium | 3-4d | Low |
| **P2** | 5 | MCP infrastructure | High | 1w | Med |
| **P2** | 6 | Permission guards | Medium (safety) | 1w | Med |
| **P2** | 8b | audit-loop verification oracle + compaction hooks | High (verified completion) | 1w | Med |
| **P3** | 7 | Task enhancement (optional) | Medium (category/skill routing) | 3-4d | Med |
| **P3** | 10 | Remaining shared-skills | Medium | 1w | Low |
| **P4** | 9 | Team Mode | High but big | 3w | High |

## Dependencies Between Phases

```
Phase 0 (config schema) ──────┬──→ Phase 2 (shared-skills)
                              ├──→ Phase 3 (hashline)
                              ├──→ Phase 4 (rules engine)
                              ├──→ Phase 5 (MCP)
                              ├──→ Phase 6 (guards)
                              ├──→ Phase 8a (loops MVP)
                              └──→ Phase 7 (task enhancement, optional)

Phase 1 (agent extensions) ───┴──→ Phase 7 (task enhancement needs tools/skills fields)
                              └──→ Phase 9 (team mode needs tools field)

Phase 3 (hashline) ──────────────→ Phase 6 (hashlineReadEnhancer guard depends on hashline)

Phase 4 (rules engine) ─────────→ Phase 6 (rulesInjector + directoryAgentsInjector guards depend on rules engine)

Phase 5 (MCP) ───────────────────→ Phase 7 (task enhancement may use MCP for tool dispatch)

Phase 8a (loops MVP) ────────────→ Phase 8b (verification oracle + compaction)
```

Phases 2-6, 8a can proceed in parallel after Phase 0+1 land. Phase 8b depends on 8a. Phase 7 is optional and depends on Phase 1. Phase 9 depends on Phase 1 and is the largest effort.

**Note**: Loops (Phase 8) do NOT depend on Phase 7 (task enhancement). They use OpenCode's built-in `task` tool for the audit-loop verification oracle.

## Out of Scope

- **todoContinuationEnforcer (Boulder)** — 2061 LOC, tied to OpenCode todo API + BoulderState. Deferred until loop MVP proves valuable.
- **atlasHook** — 1976 LOC, master orchestrator. Deeply tied to event model. Deferred.
- **Boulder State** (standalone) — work tracking. Only needed if todoContinuationEnforcer/atlas ported.
- **OpenClaw** — Discord/Telegram/HTTP integration
- **Telemetry** (PostHog) — privacy concern, low value
- **i18n** — 16 toast keys, low value
- **Config migration system** — no legacy config to migrate
- **Agent Sort Shim** — hack for OpenCode 1.4.x bug
- **Codex adapter** (omo-codex) — Codex-specific
- **Tmux integration** — specialized
- **Monitor system** — specialized

## Success Criteria

- [ ] Each feature independently toggleable via config
- [ ] All existing ocmm tests pass unchanged
- [ ] New features have their own test suites
- [ ] Config schema remains strict (unknown keys rejected)
- [ ] Profile overlay system works with new fields
- [ ] No breaking changes to existing `ocmm.jsonc` format
- [ ] KB docs maintained alongside implementations

## Open Questions

1. **Task tool enhancement scope** — OpenCode already provides `task`, `background_output`, `background_cancel` as built-in tools. Does ocmm need to enhance them with category routing + skill injection + fallback models (omo's approach), or is the built-in sufficient? If sufficient, Phase 7 is skipped entirely.

2. **LSP integration scope** — ocmm's available tools already include `lsp_diagnostics`, `lsp_find_references`, etc. (OpenCode built-in). Is there a gap that omo's LSP MCP fills? Need to verify before porting `lsp-daemon`.

3. **Skill loading path** — omo scans `skills/` at runtime. ocmm's v1 skills are loaded at build time (bundled). Should shared-skills be runtime-scanned or build-time-bundled? Runtime is more flexible but adds startup cost. Also: does OpenCode's built-in `task` tool support `load_skills` parameter? If not, Phase 7 (task enhancement) becomes a prerequisite for Phase 2 skill loading.

4. **Team Mode priority** — is it worth the 3-week effort, or should it stay out of scope for now?

## Resolved Questions

- **Can we continue an interrupted session without injecting a new user prompt?** — **RESOLVED (NO, not currently)**. OpenCode's API has no "continue session without a new user prompt" mechanism. The only continuation mechanism is `client.session.prompt()` which injects a user message. The ideal solution, `session.stopping` hook (PR #16598), is NOT merged. Mitigations: (1) prefer blocking `task` over async `task` to avoid needing continuation injection at all, (2) merge multiple reminders into a single injection, (3) track `session.stopping` PR for future clean migration. See §11.1 and §11.4 of `docs/kb/omo-features/loops.md`.

- **`dispatchInternalPrompt` equivalent** — **RESOLVED**. There is no native "system message injection" API in OpenCode. The fix is NOT to avoid injection — it's to filter strictly by session ID (omo's bug was firing for ALL `session.idle` events). 3-tier approach: (1) track `session.stopping` PR #16598 for future clean migration, (2) use `session.idle` + `client.session.prompt()` with session-ID filter + re-entrancy guards (inFlight Set, 500ms debounce, 150ms settle), (3) use `experimental.chat.system.transform` for directive injection (no message dispatch). See Phase 8a above and §11 of `docs/kb/omo-features/loops.md`.

- **Completion detection robustness** — **RESOLVED**. omo's `<promise>DONE</promise>` regex is fragile. Migration MUST tolerate whitespace, case, attributes, Markdown fences, and provide fallback keyword matching after timeout. See §11.2 of `docs/kb/omo-features/loops.md` and Phase 8a above for the robust regex pattern.
