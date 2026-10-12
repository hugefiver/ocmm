---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

<!-- Local fork of obra/superpowers/dispatching-parallel-agents v6.2.0.
     Independent file/resource ownership and outcome-oriented evidence integration.
     Source and maintenance contract: docs/v1-maintenance.md. -->

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

Explain enough for each worker to act safely; these are useful prompts, not required fields or an exhaustive resource inventory:

- its goal and ideal end state;
- acceptance criteria and useful evidence;
- current context, dependencies, and interfaces;
- material exclusive ownership or scope boundaries;
- global constraints and permissions;
- current constraints, authorization boundaries, or material risks.

Workers may discover corresponding resources inside their authorized domain; don't require exhaustive file lists or per-item revision/hash/receipt locks. Discovery never expands permissions or shared-state ownership. Keep actual safety, irreversible-operation, and protocol/integrity identities explicit when needed. Do not paste session history or require a fixed response format. Ask for actual changed and new files, local evidence/results, current constraints, and material risks or unverified coverage in conversation, not a ruling log or workspace report. A status label or acknowledgement is informational, not evidence.

Workers may choose minimal evidence-based equivalent changes when repository reality supports them, provided the approved goal, constraints, permissions, and acceptance criteria do not change. Their reports describe final outcomes, constraints, evidence, and unresolved risks, not deviations or decision histories. They escalate changes to scope/acceptance, security or data guarantees, public APIs/protocols, permissions, irreversible actions, or decisions that would be pure guesses.

## Dispatch Concurrently

Use the host's currently callable parallel-dispatch mechanism. Submit calls together only when its schema supports concurrency; otherwise do not imply that sequential calls run in parallel.

Before dispatch, verify ownership boundaries and side-effect isolation. Do not allow workers to expand their own permissions or spawn peer implementation, planning, coordination, Reviewer, or Oracle seats.

## Reconcile and Integrate

Workers run lightweight local checks for their substantive changes, not full suites per small task. The parent coordinates integration and global verification, consolidating necessary heavy checks at task completion or important phase boundaries. Reuse evidence by material relevance under brainstorming: unrelated parallel code, dependency, or environment changes don't stale it; rerun affected or missing checks and report uncovered risks. Required safety, release, pre-commit, and user checks remain binding.

As workers return:

- inspect each result's actual diff and newly created files;
- compare it to that worker's goal and acceptance criteria;
- evaluate or run useful targeted evidence;
- check cross-result interfaces, assumptions, and conflicts;
- carry forward current integration constraints and unresolved risks;
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
