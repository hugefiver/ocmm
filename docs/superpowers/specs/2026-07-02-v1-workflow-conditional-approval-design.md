# v1 Workflow Adjustment Design

**Date:** 2026-07-02
**Status:** Approved
**Scope:** Adjust the deepwork v1 workflow so that brainstorming consults the
clarifier agent for inspiration on ambiguous requirements, the writing-plans
phase runs a mandatory plan-critic review loop, and spec/plan user-approval
becomes conditional (auto-skip when the work is unambiguous or the user
explicitly delegates).

## Background

The current v1 brainstorming skill mandates user approval of the spec before
transitioning to writing-plans (User Review Gate, step 7). The writing-plans
skill has only a self-review step and no mandatory plan-critic loop. The
plan-critic agent only reviews plans (not specs) and emits a binary
`[OKAY]`/`[REJECT]` verdict with an 80% clarity threshold. The clarifier agent
exists but is not integrated into the brainstorming flow.

## Goals

1. Integrate clarifier consultation into brainstorming (conditional on
   ambiguity).
2. Add a mandatory plan-critic review loop to writing-plans.
3. Make spec and plan user-approval conditional — auto-skip when unambiguous
   or when the user explicitly delegates.
4. Keep the HARD-GATE: code still requires approval, but approval can come from
   the user OR from (self-review pass + plan-critic unambiguous verdict) OR
   from explicit user delegation.
5. Sync all downstream artifacts (Codex plugin bundle, v1-maintenance doc,
   orchestrator and deepwork prompts).

## Non-Goals

- No changes to the omo workflow.
- No changes to subagent-driven-development execution mechanics.
- No changes to plan-critic's core review scope (still plans only, not specs;
  still does not check optimality, architecture, edge cases, or style).
- No new skills or agents.

## Design

### A. brainstorming skill (`skills/v1/brainstorming/SKILL.md`)

**Step 2 restructure** — from "Ask clarifying questions" to "Ambiguity
assessment + conditional consultation":

1. Assess the requirement for ambiguity. If the purpose, constraints, and
   success criteria are all clear, skip step 2 entirely.
2. If ambiguity exists, dispatch the `clarifier` agent with the requirement and
   project context. The clarifier returns: Intent Classification, Pre-Analysis
   Findings, Questions for User (max 3), Identified Risks, Directives for
   planner, Recommended Approach.
3. Use the clarifier's Questions for User to drive user Q&A (one question at a
   time, preserving the existing pattern). If clarifier returns no questions,
   proceed to step 3.

**Step 7 restructure** — from mandatory "User reviews written spec" to
conditional approval:

After self-review (step 6) passes:
- If the user has explicitly delegated ("你自己决定", "无需批准自行继续", or
  "review N 次就下一步") → skip user spec approval, proceed to step 8.
- If self-review ambiguity check (item 4) passed with no unresolved ambiguity
  → skip user spec approval, proceed to step 8.
- Otherwise → present the spec to the user and wait for approval (existing
  behavior).

**HARD-GATE update** — the gate still requires approval before code, but
approval sources expand:

> Do NOT write any code, scaffold any project, or take any implementation
> action until the design has been approved. Approval is granted by: (a)
> explicit user approval, OR (b) self-review passing all four checks with no
> unresolved ambiguity, OR (c) explicit user delegation ("你自己决定" /
> "无需批准自行继续" / "review N 次就下一步"). This applies to EVERY project
> regardless of perceived simplicity.

**User delegation forms** (referenced by both spec and plan approval):

| Form | Scope | Effect |
|---|---|---|
| "你自己决定" / "你看着办" / "you decide" | Full session | Skip all approval gates |
| "无需批准自行继续" / "proceed without approval" | Current node only | Skip the current approval gate |
| "review N 次就下一步" / "review N times then proceed" | plan-critic loop | Cap loop at N iterations; proceed after N even if not [OKAY-UNAMBIGUOUS] |

### B. writing-plans skill (`skills/v1/writing-plans/SKILL.md`)

**New step after Self-Review, before Execution Handoff** — "plan-critic
review loop":

1. Submit the plan to the `plan-critic` agent (plan path or inline plan).
2. If plan-critic returns `[REJECT]`: apply the blocker fixes, re-run
   self-review, resubmit. Loop.
3. If plan-critic returns `[OKAY]`: the plan is executable but has residual
   uncertainty. Proceed to user approval (unless delegation applies).
4. If plan-critic returns `[OKAY-UNAMBIGUOUS]`: the plan is executable and
   unambiguous. Skip user approval, proceed to Execution Handoff.

**Loop cap**: if the user delegated "review N 次就下一步", cap the loop at N
iterations. After N iterations:
- If still `[REJECT]`: record the unresolved blockers and proceed anyway (do
  not block the workflow).
- If `[OKAY]` or `[OKAY-UNAMBIGUOUS]` reached earlier: exit early.

**Plan approval conditionality** (parallel to spec):
- Explicit user delegation → skip.
- `[OKAY-UNAMBIGUOUS]` → skip.
- Otherwise → present plan to user, wait for approval.

### C. plan-critic agent (`prompts/v1/agents/plan-critic.md`)

**Three-state output** (replaces binary):

| Verdict | Meaning | Effect on workflow |
|---|---|---|
| `[REJECT]` | Critical blockers exist; plan not executable as-is | Must fix and resubmit |
| `[OKAY]` | Plan is executable; residual uncertainty/ambiguity remains | User approval still required (unless delegation) |
| `[OKAY-UNAMBIGUOUS]` | Plan is executable AND logically clear with no ambiguity | Auto-skip user approval |

**Ambiguity check addition** (new): in addition to existing checks (reference
verification, executability, critical blockers, QA executability), plan-critic
MUST assess whether the plan has any logical ambiguity that could cause
divergent implementations. If any ambiguity is found, the verdict MUST be
`[OKAY]` (not `[OKAY-UNAMBIGUOUS]`), even if the plan is executable.

**Threshold clarification**: the existing 80% clarity threshold applies to the
`[OKAY]` vs `[REJECT]` decision. `[OKAY-UNAMBIGUOUS]` requires 100% clarity on
the ambiguity dimension (but still does not require optimality, architecture
review, or edge-case coverage — those remain out of scope).

### D. orchestrator agent (`prompts/v1/agents/orchestrator.md`)

**Intent Gate update**: the "explicit implementation" branch currently says
"brainstorm a design with the user and get approval, then plan and execute.
Follow the brainstorming HARD-GATE". Update to reflect that approval can now
come from user delegation or self-review+plan-critic unambiguous verdict, not
only explicit user approval.

**Injected Skill Utilization table**: the brainstorming row's obligation
currently says "Present a design and get explicit user approval BEFORE any
code". Update to "Present a design and obtain approval BEFORE any code —
approval may be explicit user approval, self-review pass with no ambiguity, or
explicit user delegation".

### E. deepwork prompts (`prompts/v1/deepwork/*.md`)

Files referencing the HARD-GATE or user approval:
- `prompts/v1/deepwork/default.md` (L7, L38, L50)
- `prompts/v1/deepwork/gpt.md` (L5, L9, L79)
- `prompts/v1/deepwork/glm.md` (L5, L9)
- `prompts/v1/deepwork/gemini.md` (L5, L9, L135)
- `prompts/v1/deepwork/codex.md` (L5, L9)

Update HARD-GATE mentions to reflect the expanded approval sources. The
gemini.md L135 note ("scope 不经用户批准") should be reconciled with the new
conditional approval semantics.

### F. Codex adapter (`prompts/codex/deepwork/*.md`, `prompts/codex/agents/orchestrator.md`)

Codex-side deepwork prompts and orchestrator prompt mirror the v1 prompts.
Apply the same HARD-GATE / approval-conditionality updates. Per
`docs/prompt-sync.md`, changes to `prompts/codex/**` must update that doc.

### G. Codex plugin bundle regeneration

After editing `skills/v1/brainstorming/SKILL.md` and
`skills/v1/writing-plans/SKILL.md`, run `pnpm run build:ts` then
`pnpm run gen:codex-plugin` to regenerate:
- `plugins/ocmm/skills/deepwork-brainstorming/SKILL.md`
- `plugins/ocmm/skills/deepwork-writing-plans/SKILL.md`
- `plugins/ocmm/agents/dw-*.toml` (developer_instructions embed the full skill
  text)

The regenerated bundle must be committed in the same commit as the source
skill edits.

### H. v1-maintenance doc (`docs/v1-maintenance.md`)

Update the Skills Source Mapping table brainstorming and writing-plans rows to
record the adjustments:
- brainstorming: added conditional clarifier consultation; spec approval now
  conditional (delegation / self-review pass).
- writing-plans: added mandatory plan-critic review loop with three-state
  verdict; plan approval now conditional.

Update the Last synced date to 2026-07-02 and bump the upstream version note
if applicable.

## Verification

- `pnpm run typecheck` passes (no TS schema changes; skill/prompt edits are
  markdown only).
- `pnpm test` passes (no behavioral code changes; existing
  `skill-loader.test.ts` / `config.test.ts` assertions still hold because
  V1_INJECTED_SKILLS and V1_COMMAND_SKILLS lists are unchanged).
- `pnpm run gen:codex-plugin` regenerates the Codex bundle without diff
  against the committed bundle (verified by `git diff --exit-code`).
- Manual: inspect the regenerated `plugins/ocmm/skills/deepwork-brainstorming/SKILL.md`
  and confirm the new step 2 / step 7 / HARD-GATE text is present.
- Manual: inspect a sample `plugins/ocmm/agents/dw-oracle.toml` and confirm
  the embedded developer_instructions contain the updated brainstorming text.

## Rollout

Single commit containing all changes:
1. `skills/v1/brainstorming/SKILL.md`
2. `skills/v1/writing-plans/SKILL.md`
3. `prompts/v1/agents/plan-critic.md`
4. `prompts/v1/agents/orchestrator.md`
5. `prompts/v1/deepwork/*.md` (5 files)
6. `prompts/codex/deepwork/*.md` + `prompts/codex/agents/orchestrator.md`
7. `plugins/ocmm/skills/deepwork-brainstorming/SKILL.md`
8. `plugins/ocmm/skills/deepwork-writing-plans/SKILL.md`
9. `plugins/ocmm/agents/dw-*.toml`
10. `docs/v1-maintenance.md`
11. `docs/prompt-sync.md` (if codex prompt changes require it)

All file edits are markdown-only; no TypeScript or Rust changes.
