---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

## DSH resource and authority contract

This is a full OCMM source adaptation for DSH 0.2.0-rc.2, not an OpenCode or Codex runtime. Source product names in transcript formats, examples, paths and attribution remain descriptive; they are not a host switch.

- Load this skill through the native skill tool only when its trigger matches. Resolve every relative reference/script/asset from the directory resourceBase returned with this skill, not from the project cwd or an OCMM checkout. Use available read/glob/grep to inspect resources; use write/edit and the active bash or pwsh only within the actual role and host permissions.
- External documentation uses actual web_search/web_fetch or an available documentation service. Context7, GitHub MCP, browser, image and LSP tools are optional catalog capabilities, not bundled calls. Use a real available equivalent or report unavailable evidence; never invent an MCP, Task, todo or compression API.
- Source role names are logical assignments: code-search/explore maps to dsmm-code-search, and other canonical roles/categories map to dsmm-<name>. Dispatch only through the actual role-specific native subagent tool in the current catalog, within the caller's effective policy, depth and authority. No generated file, metadata row or template proves callability. A missing permitted role is a blocker for a required formal stage, not permission to invent it or bypass planning.
- Templates describe assignment content, not a callable argument schema. Native continuation, background, message/interrupt and result handling are used only when actually exposed and supported; do not send task_id, subagent_type or guessed timeout fields. Otherwise perform permitted direct work or return the dependency to the stage owner.
- Use a concise response or an authorized project plan for tracking when no native tracking tool is exposed. Compression is unavailable unless a real tool is exposed; do not simulate it. Role responsibilities, explicit-off common/skill visibility, and the terminal delegation contract override broader examples in a resource.
- Installation, package-manager bootstrap, downloads, authentication/login, credential/profile access, Git writes and destructive actions require explicit authorization for the exact action. Reference commands are not automatic operations. Worktree consent does not authorize dependency installation or later branch deletion. Read before changing an existing file; preserve unrelated user work. Never silently restore/reset a working tree to repair a failed cleanup.
- Browser/debug QA uses run-owned isolated state, no imported credentials or browser profile, and only already available software unless separately authorized. Keep commands in the active shell dialect. Report unverified surfaces honestly.

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
