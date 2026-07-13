---
name: requesting-code-review
description: Use after all implementation tasks complete, after major features are integrated, or before merging to verify work meets requirements
---

<!-- v1 fork of superpowers/requesting-code-review.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed executing-plans and subagent-driven-development
     cross-references (v1 uses subagent-driven as the only path); added
     Reviewer Selection section for oracle/reviewer duality (oracle =
     self-supervision, reviewer = external review). See docs/v1-maintenance.md
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

## Reviewer Selection

Two reviewer agents are available, with distinct semantics:

| Agent | Role | Model default |
|---|---|---|
| `oracle` | Self-supervision — review work the current agent itself produced | Cross-gen (different generation from main, to avoid self-confirmation bias) |
| `reviewer` | External review — review code not produced by the current agent | Flagship (same family as main) |

**Selection by task complexity:**

| Task shape | Reviewer(s) | Rationale |
|---|---|---|
| Simple / single-stage (1-2 tasks, one module, no architectural change) | `oracle` (default) | plan-critic already reviewed the plan; self-supervision suffices |
| Complex / large (3+ tasks, cross-module, architectural change, security/performance sensitive) | `oracle` + `reviewer` (both, in parallel) | cross-gen self-supervision AND external review catch orthogonal issues |
| User habit override | user-specified | user may prefer reviewer for all cases, or oracle for all cases |

**How to dispatch:**

- Single reviewer: dispatch one subagent with the chosen reviewer agent type (`oracle` or `reviewer`), passing the work SHAs and context via the `code-reviewer.md` template.
- Both reviewers: dispatch two subagents in parallel (one `oracle`, one `reviewer`), each with the same SHAs and context. Collect both feedback sets before acting.

**Default:** `oracle` for simple tasks. Upgrade to both when the orchestrator judges the task complex or large.

`oracle` can also be an optional independent consultation for a high-risk implementation plan. It does not replace the `plan-critic` receipt, does not make dual plan review mandatory, and a timeout or partial response is not a conclusion.

**GPT/Codex reasoning policy:** `reviewer` and `oracle` use `xhigh` minimum. For complex or high-risk review or verification, request local `max`; the adapter maps it to the target's maximum supported effort (currently `xhigh` for GPT/Codex). `plan-critic` remains `xhigh`.

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
