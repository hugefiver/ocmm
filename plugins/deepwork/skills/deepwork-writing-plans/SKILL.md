---
name: deepwork-writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

<!-- v1 fork of superpowers/writing-plans.
     Upstream: obra/superpowers v6.3.0 (synced 2026-08-15).
     Adjustments: removed executing-plans and using-git-worktrees references;
     plans are outcome-oriented and scale with uncertainty, dependencies, and
     risk rather than prescribing fixed steps, commits, or review receipts.
     Plan review is optional and evidence-driven. See docs/v1-maintenance.md for
     sync rules. -->

# Writing Plans

## Overview

Write an implementation plan that lets a capable engineer reach the approved outcome without rediscovering important context. Capture the goal, ideal end state, dependencies, interfaces, risks, constraints, and evidence that would demonstrate success. Prefer useful decision support over procedural ceremony.

Assume the engineer is skilled but unfamiliar with this codebase and problem domain. Explain local conventions or non-obvious constraints that materially affect the work; do not prescribe details that repository evidence leaves safely open.

**Default location for durable plans:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

## When to Write a File-Backed Plan

Do not write a plan merely because work has multiple steps. Use a durable plan when discovery shows unclear boundaries or dependencies, cross-module coordination, novel behavior, migration/security/performance risk, or enough work that downstream executors need a shared artifact.

For a clear bounded change, a contextual todo list or concise in-chat plan is enough. A planner or critic is not mandatory when the orchestrator can state the outcome, boundaries, and verification clearly.

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

Executor recommendations are hints, not dispatch commands. Select a currently callable profile based on actual complexity and policy; direct execution is valid when delegation adds no value.

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

## Optional Plan Review

Request a plan review only when independent scrutiny is useful: unresolved cross-module interactions, consequential migration/security/data risk, a novel interface, or explicit user request. Give the reviewer the goal, acceptance criteria, current plan, source requirements, relevant evidence, and global constraints. No fixed field order, first-line verdict, receipt, or mandatory critic loop is required.

Treat acknowledgements and status labels as informational, not evidence. Judge the returned analysis and cited evidence. An optional, redundant, unavailable, timed-out, or merely acknowledging child does not block an outcome already established by sufficient evidence.

If review finds a substantive issue, update the plan and rerun only the affected review when the review input changed materially. Formatting, narration, status wording, or other non-substantive edits do not stale a sound review.

## Execution Handoff

Hand off the approved outcome, plan or task text, dependencies/interfaces, relevant evidence, global constraints, and recorded rulings. Use subagent-driven development or parallel dispatch only when delegation materially helps; otherwise execute directly through the appropriate workflow.

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
