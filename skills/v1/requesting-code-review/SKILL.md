---
name: requesting-code-review
description: Use after all implementation tasks complete, after major features are integrated, or before merging to verify work meets requirements
---

<!-- v1 fork of superpowers/requesting-code-review.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed executing-plans and subagent-driven-development
     cross-references (v1 uses subagent-driven as the only path); added
     Reviewer Selection section for oracle/reviewer/oracle-high semantics
     (oracle = self-supervision, reviewer = external review, oracle-high =
     optional supplemental high-effort reviewer). See docs/v1-maintenance.md
     for sync rules. -->

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

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code reviewer subagent:**

Use Task tool with `general-purpose` type, fill template at `code-reviewer.md`

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before declaring done
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

**Feedback classification:** Review findings may be labeled `[product]` (proposed change to product behavior or implementation) or `[evidence]` (a missing or insufficient proof/artifact). An `[evidence]` blocker means the current behavior may be acceptable but the proof is not — add the missing evidence rather than changing product behavior. A `[product]` blocker requires a behavior or implementation change. Do not treat an `[evidence]` finding as a mandate to rewrite code.

## Reviewer Selection

Reviewer agents are available, with distinct semantics:

| Agent | Role | Model default |
|---|---|---|
| `oracle` | Self-supervision — review work the current agent itself produced | Cross-check / heterogeneous lane chosen from explicit configuration and the available catalog to avoid self-confirmation bias |
| `reviewer` | External review — review code not produced by the current agent | Primary reasoning lane from explicit configuration and the available catalog |
| `oracle-high` | Optional supplemental high-effort reviewer — for complex/high-risk triple review only when explicitly configured, available, and not disabled | Primary reasoning lane at native `max` for GPT-5.6 or another max-capable selected model |

**Selection by task complexity:**

| Task shape | Reviewer(s) | Rationale |
|---|---|---|
| Simple / single-stage (1-2 tasks, one module, no architectural change) | `oracle` (default) | plan-critic already reviewed the plan; self-supervision suffices |
| Complex / large (3+ tasks, cross-module, architectural change, security/performance sensitive) | `oracle` + `reviewer` (both, in parallel) | heterogeneous self-supervision AND external review catch orthogonal issues |
| High-risk / very large / final gate with explicit triple-review configuration | `oracle` + `reviewer` + `oracle-high` (all three, in parallel) | adds a supplemental high-effort pass only when `oracle-high` is explicitly configured, available, and not disabled |
| User habit override | user-specified | user may prefer reviewer for all cases, or oracle for all cases |

**How to dispatch:**

- Single reviewer: dispatch one subagent with the chosen reviewer agent type (`oracle`, `reviewer`, or `oracle-high`), passing the work SHAs and context via the `code-reviewer.md` template.
- Two reviewers: dispatch two subagents in parallel (`oracle` + `reviewer`), each with the same SHAs and context. Collect both feedback sets before acting.
- Three reviewers: dispatch three subagents in parallel (`oracle` + `reviewer` + `oracle-high`) only when `oracle-high` is explicitly configured, available in the current dispatch surface/catalog, and not disabled. Collect all feedback sets before acting.

**Default:** `oracle` for simple tasks. Upgrade to `oracle` + `reviewer` when the orchestrator judges the task complex or large. Add `oracle-high` only when the user/profile explicitly enables it, the profile/model is available, and it is not disabled; built-in or profile existence alone must not force three-review dispatch.

`oracle` can also be an optional independent consultation for a high-risk implementation plan. It does not replace the `plan-critic` receipt, does not make dual plan review mandatory, and a timeout or partial response is not a conclusion.

**Reasoning policy:** `reviewer`, `oracle`, and `oracle-high` use an `xhigh`-equivalent minimum when the selected model family exposes that control; otherwise use the highest supported review effort for that family. GPT-5.6 supports native `max`, so complex or high-risk review/verification on GPT-5.6 can request `max` directly; other model families use `max` only when their cataloged controls expose a maximum-effort level. `oracle-high` preserves local `max` for GPT-5.6 and other max-capable models. `plan-critic` uses `xhigh` minimum and may be raised by explicit local configuration. Example model names are references only; explicit user configuration and currently available models decide the actual selection.

## Example

```
[All implementation tasks complete: Add verification and repair workflow]

You: Let me request final acceptance review before declaring this done.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

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
