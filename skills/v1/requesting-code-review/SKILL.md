---
name: requesting-code-review
description: Use after all implementation tasks complete, after major features are integrated, or before merging to verify work meets requirements
---

<!-- v1 fork of superpowers/requesting-code-review.
     Upstream: obra/superpowers v6.0.3.
     Adjustments: removed executing-plans and subagent-driven-development
     cross-references (v1 uses subagent-driven as the only path); added
     Reviewer Selection section for ordered Oracle slot semantics and logical
     tiers (oracle slots = external-model priority ordering, reviewer =
     primary-lane self-review, tiers = low/normal/high/max). See docs/v1-maintenance.md for sync
     rules. -->

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review implemented code or an integrated change set. Reviewer/Oracle profiles are not research, ideation, architecture-design, debugging, or general-answer consultants.

## When to Request Review

**Mandatory:**
- After all implementation tasks complete
- After completing a major feature
- Before merge to main

**Optional but valuable:**
- After completing a high-risk implementation increment that needs focused code-quality validation
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

- `reviewer` is the primary-model or primary-lane self-review profile; `reviewer-2nd` does not exist.
- Oracle profiles are external-model cross-check slots ordered as `oracle`, `oracle-2nd`, then configured `oracle-3rd` through `oracle-9th`.
- `oracle-2nd` and every later slot have lower selection priority, never greater capability.
- Explicit user model configuration remains authoritative and may remove model heterogeneity.

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

Reviewer and Oracle profiles do not review implementation plans; `plan-critic` owns plan receipts. A timeout, partial response, or review of a different revision is not an acceptance conclusion.

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
