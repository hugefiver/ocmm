# v1 Skill Priority & Builder Mode Design Spec

> **Date**: 2026-06-26
> **Status**: Design — approved, awaiting implementation
> **Scope**: v1 workflow prompt strengthening + builder agent mode change

## Problem Statement

Two observed weaknesses in the v1 deepwork workflow:

1. **Skills underutilized.** The v1 orchestrator and planner prompts describe the five injected superpowers skills in soft, advisory language ("follow them when their phase applies", "as the canonical planning workflow"). Models treat these as suggestions and skip them — especially on requests that look simple enough to act on directly.

2. **Builder unsuitable as subagent.** `builder` has no role-specific prompt file (`prompts/v1/agents/builder.md` does not exist), so it receives only the deepwork model-calibration prompt with no role boundaries. Yet `src/hooks/config.ts` registers it with `mode: "all"`, allowing it to be dispatched as a subagent where its lack of role definition is a liability.

## Goal

- Make skill usage feel mandatory to the model by strengthening the wording in `orchestrator.md` and `planner.md` — without touching the injection mechanism (chat-message.ts / system.transform).
- Restrict `builder` to primary-only by changing its registered mode from `"all"` to `"primary"`. Subagent execution work routes to category subagents (`coding`, `quick`, `normal-task`, `deep`) instead.

## Non-Goals

- No change to the v1 skill injection mechanism (timing, targets, format).
- No new prompt files for builder. Builder keeps its current prompt-less role as a primary implementer.
- No restructuring of the prompt files beyond the targeted sections. The rest of orchestrator.md and planner.md stays as-is.
- No change to other v1 agent prompts (reviewer, plan-critic, clarifier).
- No change to omo workflow prompts.

## Changes

### Change 1: builder mode `all` → `primary`

**File**: `src/hooks/config.ts` (agent registration logic, ~L179-191)

In the block where built-in agents get their mode:
- `orchestrator` → `"primary"` (unchanged)
- `planner` → `"all"` (unchanged)
- `builder` → **`"primary"`** (was `"all"`)
- all other agents + all categories → `"subagent"` (unchanged)

**Effect**: builder disappears from the subagent dispatch list. `task(subagent_type="builder")` is no longer valid. builder remains usable as `opencode run --agent builder`. `src/data/agents.ts` needs no change — the description ("Primary implementer") and fallback chain already fit a primary role.

### Change 2a: `prompts/v1/agents/orchestrator.md` — delegation table

**Location**: ~L80, the Delegation Table row currently reading `| Focused single task with skills | \`builder\` |`

**New row**:
```
| Focused single task (implementation) | `coding` / `quick` / `normal-task` / `deep` (subagent) — `builder` is primary-only |
```

This keeps the delegation table truthful after Change 1 and steers orchestrator toward category subagents for implementation work.

### Change 2b: `prompts/v1/agents/orchestrator.md` — skill utilization section

**Location**: ~L82-90, the "Injected Skill Utilization" section.

**Current** (soft): "Follow them when their phase applies:" followed by a bullet list.

**New** (mandatory + table):

```
## Injected Skill Utilization (MANDATORY)

Five superpowers skills are injected into this session. They are not optional references. You MUST follow each one when its trigger condition is met — skipping a triggered skill is a workflow violation, not a shortcut.

| Skill | Trigger condition | Your obligation |
|---|---|---|
| `brainstorming` | User requests any new feature, component, or behavior change, AND no approved design exists yet | Present a design and get explicit user approval BEFORE any code. This is a HARD-GATE. |
| `writing-plans` | A spec/design has been approved, or a multi-step task needs decomposition | Produce a plan at `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` before implementation. |
| `subagent-driven-development` | You have an implementation plan with independent tasks | Dispatch a fresh subagent per task with two-stage review (spec then code quality). Do not implement plan tasks yourself. |
| `requesting-code-review` | A task or major feature completes, or before merge to main | Dispatch a code reviewer subagent with the work SHAs. Do not declare done without review. |
| `receiving-code-review` | You receive reviewer feedback | Verify each item against the codebase before implementing. No performative agreement. |

Every routing decision must first check: "Does a skill trigger here?" If yes, the skill dictates the next step, not your default instinct.
```

**Wording rationale**:
- `MANDATORY` header replaces neutral heading.
- Table with explicit trigger + obligation per skill replaces vague bullets.
- "workflow violation, not a shortcut" frames skipping as incorrect rather than threatening punishment (which can provoke defensive responses).
- Closing check ("Does a skill trigger here?") installs a decision-time pause.
- The `brainstorming` row preserves the existing HARD-GATE language already at L52, reinforcing it.

### Change 2c: `prompts/v1/agents/planner.md` — skill utilization section

**Location**: ~L25-35, the "Injected Skill Utilization" section.

**Current** (soft): "Follow the `writing-plans` skill as the canonical planning workflow" + tool list.

**New** (mandatory + trigger conditions):

```
## Injected Skill Utilization (MANDATORY)

`writing-plans` is injected into this session. When you produce a plan, you MUST follow the `writing-plans` skill structure exactly: plan header with goal/architecture/tech-stack, bite-sized TDD tasks with checkbox steps, no placeholders, self-review against spec coverage. This is not a style preference — it is the contract the implementer subagents will rely on.

`brainstorming` is also injected. If the request needs a design and none is approved yet, STOP and tell the orchestrator/user to run the brainstorming phase first. Do not produce a plan for undesigned work.
```

**Wording rationale**:
- planner only uses two skills (`writing-plans`, `brainstorming`); strengthening all five would be noise.
- "the contract the implementer subagents will rely on" ties the plan's quality to downstream subagent success — a concrete consequence, not an abstract rule.
- The brainstorming STOP instruction already exists at L21; this section reinforces it.

## Testing

### Unit tests

**File**: `src/hooks/config.test.ts`

- Find existing assertions that builder has `mode: "all"` and change them to `"primary"`.
- If no such assertion exists, add one: after config hook runs, the builder agent entry must have `mode === "primary"`.
- Verify orchestrator remains `"primary"` and planner remains `"all"` (regression guard).

Prompt files are text; they have no direct unit tests. They are exercised via build (prompts are read at build/config time) and manual QA.

### Manual QA

Follow the AGENTS.md "Live Integration Test" flow with an isolated test directory and XDG env vars:

1. `pnpm run build` — must pass (typecheck + build).
2. `opencode debug config --print-logs --log-level DEBUG` — verify builder agent's mode is `primary`.
3. `opencode run --agent orchestrator "实现一个简单函数"` (with `workflow: "v1"`) — orchestrator should trigger the brainstorming HARD-GATE (no approved design) rather than writing code immediately. Expected: it asks clarifying questions or presents a design sketch.
4. `opencode run --agent builder "实现一个简单函数"` — builder as primary executes directly (it does not receive injected skills and is not responsible for design gating).
5. Clean up XDG env vars and temp dir.

### Build/typecheck gate

`pnpm run typecheck && pnpm test && pnpm run build` must all pass before commit, per AGENTS.md.

## Documentation Sync

Per AGENTS.md, changes under `prompts/v1/` MUST update `docs/v1-maintenance.md` in the same commit.

**File**: `docs/v1-maintenance.md`

Add an entry recording:
- `prompts/v1/agents/orchestrator.md`: "Injected Skill Utilization" section changed from advisory to MANDATORY table; delegation table builder row updated to reflect primary-only status.
- `prompts/v1/agents/planner.md`: "Injected Skill Utilization" section strengthened to MANDATORY for `writing-plans` and `brainstorming`.
- `src/hooks/config.ts`: builder mode changed from `"all"` to `"primary"` (this is a code change but directly tied to the orchestrator delegation-table update; note it in v1-maintenance.md if that doc tracks config-hook mode assignments, otherwise note in the commit body).

The exact heading/section to append under depends on the existing structure of v1-maintenance.md — implementer should read it first and place the entry consistently.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing `task(subagent_type="builder")` calls break | Low — builder is a built-in ocmm agent, not user-configured | None needed; this is intended behavior. |
| Over-strict skill gating makes orchestrator refuse simple tasks | Low | brainstorming skill itself has "Anti-Pattern: This Is Too Simple" section that balances this. |
| Prompt wording too aggressive → model produces defensive/refusal responses | Low | Avoided threat language ("or else"); used "workflow violation, not a shortcut" framing. |
| v1-maintenance.md sync missed | Medium | Explicit task in implementation plan. |

## Success Criteria

- [ ] `config.ts` registers builder with `mode: "primary"`.
- [ ] `orchestrator.md` skill section uses MANDATORY table with trigger conditions.
- [ ] `orchestrator.md` delegation table no longer lists builder as a subagent target.
- [ ] `planner.md` skill section uses MANDATORY wording for writing-plans and brainstorming.
- [ ] `config.test.ts` asserts builder mode is `"primary"`.
- [ ] `docs/v1-maintenance.md` updated in same commit.
- [ ] `pnpm run typecheck && pnpm test && pnpm run build` all pass.
- [ ] Manual QA: orchestrator triggers brainstorming gate on implementation requests without approved design.

## Files Touched

- `src/hooks/config.ts` — builder mode change (1 line + test)
- `src/hooks/config.test.ts` — update/add builder mode assertion
- `prompts/v1/agents/orchestrator.md` — L80 delegation table + L82-90 skill section
- `prompts/v1/agents/planner.md` — L25-35 skill section
- `docs/v1-maintenance.md` — sync entry
