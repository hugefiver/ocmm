---
name: deepwork-dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

<!-- v1 fork of superpowers/dispatching-parallel-agents.
     Upstream: obra/superpowers v6.2.0 (synced 2026-08-02).
     Adjustments: platform-agnostic parallel dispatch is retained while worker
     briefs, evidence, integration, and escalation are outcome-oriented and do
     not impose mandatory review or Git ceremony. See docs/v1-maintenance.md for
     sync rules. -->

# Dispatching Parallel Agents

## Overview

Parallelize independent work only when isolated workers can make useful progress without sharing mutable state, editing overlapping files, or depending on one another's results.

**Core principle:** Parallelize independent outcome domains, then integrate against the shared goal and constraints.

Delegation is optional. If direct execution is smaller than preparing and reconciling worker briefs, do the work directly. If tasks share a root cause or interface decision, investigate or sequence them together.

## Independence Check

Parallel work is appropriate when:

- there are at least two independently understandable goals;
- file/resource ownership does not overlap;
- no task consumes an output another task must first produce;
- workers do not mutate the same external service, environment, or test fixture;
- each result can be evaluated with useful evidence before integration.

Do not parallelize related failures, exploratory debugging with an unknown shared cause, coupled architecture decisions, or work whose safety depends on global ordering.

## Create Focused Worker Briefs

Give each worker, in whatever order is clearest:

- its goal and ideal end state;
- acceptance criteria and useful evidence;
- current context, dependencies, and interfaces;
- exclusive files/resources or scope boundaries;
- global constraints and permissions;
- material risks or prior rulings.

Do not paste session history or require a fixed response format. Ask for actual changed and new files, evidence/results, significant assumptions or rulings, and unresolved concerns. A status label or acknowledgement is informational, not evidence.

Workers may choose minimal evidence-based equivalent changes when repository reality supports them, provided the approved goal, constraints, permissions, and acceptance criteria do not change. They record significant deviations with reasons and cost if wrong. They escalate changes to scope/acceptance, security or data guarantees, public APIs/protocols, permissions, irreversible actions, or decisions that would be pure guesses.

## Dispatch Concurrently

Use the host's currently callable parallel-dispatch mechanism. Submit calls together only when its schema supports concurrency; otherwise do not imply that sequential calls run in parallel.

Before dispatch, verify ownership boundaries and side-effect isolation. Do not allow workers to expand their own permissions or spawn peer implementation, planning, coordination, Reviewer, or Oracle seats.

## Reconcile and Integrate

As workers return:

- inspect each result's actual diff and newly created files;
- compare it to that worker's goal and acceptance criteria;
- evaluate or run useful targeted evidence;
- check cross-result interfaces, assumptions, and conflicts;
- record significant integration rulings and their cost if wrong;
- verify the combined result against the overall ideal end state.

This is an integration check, not a mandatory full review per worker or wave. Request focused or whole-change review only when risk, uncertainty, user instruction, or a governing process makes it useful.

An optional or redundant child that times out, returns only an acknowledgement, or adds no evidence does not block a result already proven by sufficient evidence. Required tasks and real security, data-loss, compatibility, protocol/API, or irreversible-operation risks remain blockers until resolved or explicitly decided.

## Corrections and Review

When a result needs a bounded correction, continue the same worker session if its context is valid; otherwise issue a fresh focused brief. Rerun only evidence or reviews affected by substantive changes. Formatting, narration, status wording, or unrelated edits do not require a new review.

Do not impose a universal RED gate, test transcript, scenario count, full-suite run, per-task reviewer, or commit. Select evidence proportionate to the plausible regression and integration risk.

## Git Boundary

Parallel workers do not perform Git writes unless the user specifically authorizes the exact operation and effective policy permits it. A clear request authorizes only its stated operation: implement/fix is not commit, and commit is not push, tag, rebase, or release. Authorization does not expand across repositories or operations.

## Common Mistakes

- **Too broad:** one worker owns several unrelated domains.
- **False independence:** workers touch the same files, interface, fixture, or external state.
- **Vague outcome:** the brief says "fix it" without criteria or useful evidence.
- **No constraints:** a worker can accidentally broaden behavior or permissions.
- **Ceremonial fan-out:** workers or reviewers are dispatched only to satisfy a count.
- **Summary-only integration:** the parent trusts claims without inspecting changes and evidence.
- **Guessing through risk:** a worker silently decides scope, safety, data, protocol/API, permission, or irreversible behavior.

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
