---
name: deepwork-requesting-code-review
description: Use after all implementation tasks complete, after major features are integrated, or before merging to verify work meets requirements
---

<!-- v1 fork of superpowers/requesting-code-review.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed executing-plans and subagent-driven-development
     cross-references (v1 uses subagent-driven as the only path); added
     Reviewer Selection section for ordered Oracle slot semantics and logical
     tiers (oracle slots = model-priority ordering, reviewer = external review
     lane, tiers = low/normal/high/max). See docs/v1-maintenance.md for sync
     rules. -->

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review the integrated change set once implementation work is complete. Mid-stream reviews are exceptions for blockers, high-risk uncertainty, or explicit user requests for strict stepwise review.

## When to Request Review

**Mandatory:**
- After all implementation tasks complete
- After completing a major feature
- Before merge to main

**Optional but valuable:**
- When stuck after concrete evidence gathering (fresh perspective)
- Before high-risk refactoring that changes architecture/security/performance behavior
- After fixing a complex bug when the fix remains uncertain after local verification

## How to Request

**1. Choose the review input:**

Use a committed range only when an orchestrator-owned, user-authorized commit already exists:

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
git diff --stat $BASE_SHA..$HEAD_SHA
git diff $BASE_SHA..$HEAD_SHA
```

Working-tree diff review (use this when implementation subagents returned uncommitted changes):

```bash
git diff --stat
git diff
git diff --cached --stat
git diff --cached
```

Do not require implementation subagents to commit, stage, or push merely to create a review range. The orchestrator owns any Git write and performs it only after explicit user authorization.

**2. Dispatch code reviewer subagent:**

Use Task tool with `general-purpose` type, fill template at `code-reviewer.md`

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{REVIEW_INPUT}` - Commit range plus commands, or working-tree/staged diff commands and output

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before declaring done
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

**Feedback classification:** Review findings may be labeled `[product]` (proposed change to product behavior or implementation) or `[evidence]` (a missing or insufficient proof/artifact). An `[evidence]` blocker means the current behavior may be acceptable but the proof is not — add the missing evidence rather than changing product behavior. A `[product]` blocker requires a behavior or implementation change. Do not treat an `[evidence]` finding as a mandate to rewrite code.

## Reviewer Selection

Review selection has two independent axes: role/model priority and logical rigor.

### Axis 1 — Role/Model Priority

- Oracle slots are ordered as `oracle`, `oracle-2nd`, then configured `oracle-3rd` through `oracle-9th`.
- `oracle-2nd` and every later slot have lower selection priority, never greater capability.
- The external review lane is `reviewer`; `reviewer-2nd` does not exist.

### Axis 2 — Logical Rigor Tiers

- Logical tiers are `low`, `normal`, `high`, `max`.
- `normal` is the unsuffixed profile (`oracle`, `reviewer`).
- Tier-suffixed profiles are used only when configured and available.

**Selection by work shape:**

| Work shape | Reviewer(s) | Tier choice |
|---|---|---|
| Simple / single-stage (1-2 tasks, one module, no architectural change) | first available Oracle | `normal` |
| Complex / cross-module / large integration | first available Oracle + `reviewer` (parallel) | configured `high`, otherwise `normal` |
| Security / performance / data-loss / release / runtime-safety work | first available Oracle + `reviewer` (parallel) | configured `max`, otherwise `high`, otherwise `normal` |
| Additional evidence requested | additional Oracle slots in order (`oracle-2nd`, then later configured slots) | keep the intentionally selected tier; user override is still subject to availability/disabled profiles/floors |

**Dispatch semantics:**

- Configuring several slots or tiers never triggers automatic fan-out by itself.
- A higher logical tier can be selected without adding more reviewers.
- A later Oracle slot is another configured model perspective, not a stronger reviewer.
- User overrides are allowed, but availability, disabled profiles, and floor constraints still apply.

`oracle` can also be an optional independent consultation for a high-risk implementation plan. It does not replace the current `plan-critic` receipt, does not make dual plan review mandatory, and a timeout or partial response is not a conclusion.

**Reasoning policy:** Every parsed Oracle/Reviewer profile retains an `xhigh` minimum floor when the selected model family exposes that control; otherwise use the highest supported review effort for that family. This floor remains in effect while logical tier selection still includes `low`/`normal`/`high`/`max` semantics. GPT-5.6 supports native `max`, so complex or high-risk review/verification on GPT-5.6 can request local `max` directly; other model families use local `max` only when their cataloged controls expose a maximum-effort level. `plan-critic` uses `xhigh` minimum and may be raised by explicit local configuration. Example model names are references only; explicit user configuration and currently available models decide the actual selection.

## Example

```
[All implementation tasks complete: Add verification and repair workflow]

You: Let me request final acceptance review before declaring this done.

[Implementation subagents returned uncommitted changes, so review the working tree:]
git diff --stat
git diff
git diff --cached --stat
git diff --cached

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: docs/superpowers/plans/deployment-plan.md
  REVIEW_INPUT: working-tree diff commands and output above

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Not approved until progress indicators are fixed

You: [Fix progress indicators]
[Re-run final acceptance review]
[Declare done only after reviewer approval]
```

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Declare done with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: `requesting-code-review/code-reviewer.md`

## Codex Compatibility

- When this skill mentions TodoWrite, use Codex `update_plan`.
- When this skill mentions OpenCode `task(...)`, preserve its task contract and use the current callable Codex dispatch route.
- When this skill mentions OpenCode-specific tool names, choose the nearest callable Codex tool with the same intent and preserve the workflow contract.

### Callable Dispatch Contract

The current callable dispatch-tool schema is the only authority. Examples are not feature proof; omit hidden fields.

Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership. Only call `create_goal` when a user, system, or developer instruction explicitly requests runtime goal creation. Ordinary workflow, planning, delegation, or a `GOAL:` line does not qualify.

Use the first permitted route in this order:

1. **Exact profile** — use `agent_type`, `agent_path`, or `agent_nickname` only when the current callable schema explicitly guarantees it selects a generated `dw-*` profile.
2. **Direct composition** — use only when the current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this route as composition, not exact-profile selection.
3. **V1/V2 generic or flat dispatch** — use the canonical envelope below. The child keeps its default or inherited runtime model unless the callable schema exposes and receives a valid explicit override.
4. **Local execution** — when delegation is permitted, use only when no callable native dispatch tool is available. When delegation is not permitted, preserve the role contract and its workflow owner rather than routing around that restriction.

For generic or flat dispatch, put this canonical envelope in the task message:

`GOAL:` State one imperative, bounded outcome, including the role, scope, constraints, and required work.
`STOP WHEN:` State the exact completion condition and non-goal boundary.
`EVIDENCE:` State the paths, commands, outputs, or observations that prove completion.

The generic envelope does not load a profile, select a model, attach a skill, or enable a missing feature.

When the planning logical-tier selector chooses the unsuffixed normal profile and the callable schema proves exact-profile selection is available, the V1 example is `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict.")`. V1 may send `model` only when the current callable schema exposes `model`. V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add `fork_context` only when the callable V1 schema exposes it and an explicit inheritance decision requires it.

V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. No stable `multi_agent_v2` namespace is guaranteed. V2-style flat tools never receive `fork_context`. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.

Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none` to request no context. If `fork_turns` is hidden, omit it. Other `fork_turns` values are only for explicit branch exploration.

`task_name` is an identity, not a profile selector. Do not pass `dw-*.toml` as a prompt, item, or skill attachment: generated TOML files are installation artifacts, not runtime skills.
