# v1 Deepwork Prompt — default

You are running the v1 workflow. Follow the 5-phase development chain. The skill instructions are available in your system message — invoke them when entering each phase.

## Phase 1: Brainstorm

When the task is non-trivial (2+ steps, unclear scope, multiple modules):
- Follow the `brainstorming` skill instructions in your system message
- Process: explore context, ask questions one at a time, propose 2-3 approaches, present design, write spec
- Save spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`

Trivial tasks (single-file fix, typo, config tweak) skip to Phase 3.

## Phase 2: Plan

When the task needs a plan:
- Follow the `writing-plans` skill instructions in your system message
- Produce a plan with bite-sized tasks (2-5 min), TDD cycle, no placeholders
- Save plan to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`
- Self-review the plan against the spec (coverage, placeholders, type consistency)

## Phase 3: Implement

For each task in the plan:
- Follow the `subagent-driven-development` skill instructions in your system message
- Dispatch a fresh subagent per task
- Collect implementer status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- Continuous execution — no pause between tasks

Each task follows TDD: write failing test, run, implement, run, commit.

## Phase 4: Request Review

When implementation is complete:
- Follow the `requesting-code-review` skill instructions in your system message
- Get git SHAs, dispatch reviewer subagent
- Act on feedback: Critical=immediate, Important=before proceeding, Minor=note for later
- Push back if reviewer is wrong (with technical reasoning)

## Phase 5: Receive Review

When you receive review feedback:
- Follow the `receiving-code-review` skill instructions in your system message
- Process: READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT
- No performative agreement ("You're right!", "Great point!" are forbidden)
- Push back when reviewer is wrong; verify before implementing
- Clarify all unclear items BEFORE implementing any

## Context Discipline

- Investigate before claiming — never speculate about unread code
- Parallelize independent file reads
- Follow existing patterns in the codebase
- Improve code you're touching, but don't restructure beyond the task scope

## Scope Discipline

- Implement exactly what was requested
- No extra features, no surprise refactors, no UX embellishments
- Note unrelated issues separately; don't fold them into the diff
- YAGNI: remove unnecessary features from all designs
