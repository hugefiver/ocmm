---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

<!-- v1 fork of superpowers/writing-plans.
     Upstream: obra/superpowers v6.3.0 (synced 2026-08-15).
     Adjustments: removed executing-plans and using-git-worktrees references;
     plans are outcome-oriented and scale with uncertainty, dependencies, and
     risk rather than prescribing fixed steps, commits, or review receipts.
     Complex implementation receives blocker-focused plan criticism without a
     fixed receipt or repeated approval loop. See docs/v1-maintenance.md for
     sync rules. -->

# Writing Plans

## Overview

Write an implementation plan that lets a capable engineer reach the approved outcome without rediscovering important context. Capture the goal, ideal end state, dependencies, interfaces, risks, constraints, and evidence that would demonstrate success. Prefer useful decision support over procedural ceremony.

Assume the engineer is skilled but unfamiliar with this codebase and problem domain. Explain local conventions or non-obvious constraints that materially affect the work; do not prescribe details that repository evidence leaves safely open.

**Default location for durable plans:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

## When to Write a File-Backed Plan

Do not write a plan merely because work has multiple steps. Use a durable plan for complex business or behavior implementation, or when discovery shows unclear boundaries or dependencies, cross-module coordination, novel behavior, migration/security/performance risk, or enough work that downstream executors need a shared artifact.

Skip the planner/critic sequence only when the change is limited, simple, low risk, and clearly bounded, or when the user explicitly requests the skip. Record the short reason. Clear requirements, multiple familiar files, strong model capability, or sufficient evidence do not exempt complex work. A user-requested skip does not authorize changes to security/data guarantees, public APIs/protocols, permissions, or irreversible behavior.

## Scope and Discovery

Before decomposing work:

- Read the approved design or requirements and the relevant repository evidence.
- Describe the current state and the ideal end state.
- Identify dependencies, interfaces, ownership boundaries, and ordering constraints.
- Surface material risks: security, data loss, compatibility, protocols/APIs, irreversible operations, and difficult rollback.
- Check external constraints such as budget, mandated/prohibited stack, scale, privacy, compliance, accessibility, and platform requirements. Do not invent constraints.

If the work contains independent subsystems, split it into independently valuable plans or waves. If a material choice would alter scope, acceptance, safety, data, a public API/protocol, permissions, or an irreversible action, return it for approval rather than guessing.

For a non-material open choice, choose a safe reversible default. Record a significant ruling or assumption with the evidence behind it, why it was chosen, and the cost if it is wrong.

## Plan Shape

Use the structure that best explains the work. A useful plan normally makes these discoverable, but does not require fixed headings or field order:

- Approved goal and ideal end state
- Source requirements/design and global constraints
- Relevant current state
- Dependencies and interfaces, including what each unit consumes and produces
- Risks, assumptions, and significant rulings
- Waves or tasks with clear outcome boundaries
- Useful acceptance evidence for each wave and for the integrated result

Do not turn the plan into a transcript. Include commands, code sketches, file paths, or signatures when they prevent ambiguity; omit them when repository patterns and acceptance criteria already make the implementation obvious.

## Waves and Tasks

Organize work around outcomes and dependency order.

For each wave, state:

- the wave goal and observable end state;
- the tasks or changes that produce it;
- dependencies and interfaces that constrain execution;
- likely files or areas, when known;
- material risks or decisions;
- useful acceptance evidence showing the wave achieved its goal.

A task should be cohesive enough to produce meaningful progress and small enough to reason about and verify. Combine setup, types, implementation, docs, and validation when they only have value together. Split tasks when they can be implemented or rejected independently, have different ownership, or unlock parallel work.

Plans need not prescribe one executor action every 2-5 minutes. They also need not mandate a failing-test transcript, scenario count, per-task full review, or commit. Use deterministic tests at real regression-prone seams; use typechecks, builds, focused inspection, runtime probes, or other evidence when those better demonstrate the outcome. Keep real security, data-loss, protocol, compatibility, and irreversible-operation safeguards explicit.

## Executor Flexibility

The plan defines the approved goal, constraints, permissions, and acceptance criteria. It may recommend an approach, task boundary, executor profile, or evidence path without freezing incidental mechanics.

Deep workers and implementers may choose a minimal evidence-based equivalent when repository reality makes a planned detail unnecessary or inferior, provided they do not change the approved goal, constraints, permissions, or acceptance criteria. They record significant deviations, rulings, and assumptions with reasons and the cost if wrong.

They escalate instead of choosing when the decision changes scope or acceptance, weakens safety or data guarantees, changes a public API/protocol, expands permissions, introduces an irreversible action, or would otherwise be a pure guess.

Executor recommendations are hints, not dispatch commands. The orchestrator selects a currently callable profile based on actual complexity and policy. Direct execution describes who performs implementation after applicable planning; it is not a way to skip the complex-work planner/critic sequence.

## Git Boundaries

Do not include routine commit steps or a default separate spec/plan commit. Git writes require authorization for the specific operation. A clear user request can authorize that exact operation without a second confirmation, but authorization never expands beyond its semantics:

- implement or fix does not mean commit;
- commit does not mean push, tag, rebase, or release;
- authorization for one repository, branch, range, or operation does not authorize another.

## Self-Review

Review the completed plan against its source:

1. **Outcome coverage:** Does the ideal end state satisfy every approved requirement?
2. **Dependency consistency:** Do ordering, interfaces, files, and ownership assumptions agree?
3. **Evidence quality:** Would the proposed evidence demonstrate the behavior or invariant that matters?
4. **Risk discipline:** Are material security, data, compatibility, protocol, and irreversible risks handled without speculative scope?
5. **Executability:** Can an engineer act without placeholders or pure guesses while retaining discretion over incidental mechanics?

Fix issues inline. Do not require a second review simply because wording or formatting changed.

## Blocker-Focused Plan Review

For complex business or behavior implementation, return the completed plan to the orchestrator for `plan-critic` review before implementation. The orchestrator owns dispatch; the planner never invokes the critic. For a valid narrow skip, state the reason instead. Give the critic the goal, acceptance criteria, current plan, source requirements, relevant evidence, and global constraints. No fixed field order, first-line verdict, receipt, hash, or repeated approval ritual is required.

Treat acknowledgements and status labels as informational, not evidence. Judge the returned analysis and cited evidence. Correct a substantive blocker, rebut it with concrete evidence, or escalate it for clarification before implementation. Non-blocking improvements do not hold implementation, and an unavailable, timed-out, or merely acknowledging critic does not manufacture approval or erase an unresolved blocker.

If review finds a substantive issue, update the plan and rerun only the affected review when the review input changed materially. Formatting, narration, status wording, or other non-substantive edits do not stale a sound review. Do not impose a fixed iteration count or continue an open-ended loop; escalate when a blocker cannot be resolved from evidence.

## Execution Handoff

Hand off the approved outcome, reviewed plan or recorded narrow-skip reason, dependencies/interfaces, relevant evidence, global constraints, and recorded rulings. Use subagent-driven development or parallel dispatch only when delegation materially helps; otherwise implement directly through the appropriate workflow.
