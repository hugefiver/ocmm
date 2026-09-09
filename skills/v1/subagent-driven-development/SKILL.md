---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

<!-- v1 fork of superpowers/subagent-driven-development.
     Upstream: obra/superpowers v6.3.0 (synced 2026-08-15).
     Adjustments: removed excluded-skill references and Git-writing workers;
     delegation, evidence, and review now scale with the work rather than forming
     mandatory per-task or final gates. Workers may make bounded evidence-based
     equivalent changes while preserving approved outcomes. Existing background
     waiting and no-ledger/no-automatic-cleanup boundaries remain. See
     docs/v1-maintenance.md for sync rules. -->

# Subagent-Driven Development

Use focused workers when delegation materially improves implementation of an approved plan. Coordinate toward the plan's goal and ideal end state, not toward ceremonial completion of every originally imagined step.

**Core principle:** Preserve the approved goal, constraints, permissions, and acceptance criteria; choose the smallest execution and evidence path that proves the outcome.

Delegation is optional. Direct execution is valid when a task is small, tightly coupled to controller context, or cheaper to complete than to brief and reconcile. When delegation helps, give each worker self-contained context rather than session history.

**Continuous execution:** Do not pause between ordinary tasks merely to ask whether to continue. Stop for a decision that changes scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, requires an irreversible/destructive operation, triggers an external side effect requiring authorization, or leaves only pure guesses. Otherwise make a bounded ruling and continue.

**Rulings, not stalls:** Resolve non-material plan defects or ambiguities from approved requirements and repository evidence. Record significant rulings and assumptions in the active tracking surface or final report, including the reason and cost if wrong. Do not create a separate ledger solely for this purpose.

**Narration discipline:** Between tool calls, keep narration brief. Use prose for decisions, blockers, and questions rather than duplicating tool output.

## When to Use

- An approved plan or bounded task has work that benefits from isolated execution context.
- Task boundaries and file ownership are clear enough to avoid interference.
- The controller can supply goals, criteria, dependencies, interfaces, evidence expectations, and constraints without pasting session history.

For two or more independent tasks with no shared state or overlapping files, consider `dispatching-parallel-agents`. Keep dependent or shared-state work sequential. Do not delegate merely to satisfy a workflow label.

## Outcome-Oriented Process

1. Understand the goal, ideal end state, acceptance criteria, dependencies/interfaces, relevant evidence, and global constraints.
2. Scan planned file/interface overlaps and material risks. Record significant rulings or assumptions.
3. Choose direct execution or a useful worker boundary for each task or wave.
4. After work returns, inspect the actual changes and evidence, resolve integration issues, and update tracking based on the demonstrated outcome.
5. Request focused or whole-change review only when risk, uncertainty, change shape, or user instruction makes independent review useful.
6. Verify the integrated result with evidence proportionate to the plausible regression and report any unverified item.

The plan is guidance, not an immutable script. A worker may use a minimal evidence-based equivalent when repository reality makes a planned detail unnecessary or inferior, provided the approved goal, constraints, permissions, and acceptance criteria remain unchanged. Significant deviations require a recorded ruling with reasons and cost if wrong. Decisions in the stop classes above return to the controller or user.

## Worker Briefs

Give a worker, in whatever order is clearest:

- the task/wave goal and ideal end state;
- acceptance criteria and useful evidence;
- relevant current state, dependencies, and interfaces;
- owned files or explicit boundaries;
- global constraints and permissions;
- significant prior rulings or known risks.

Do not make a worker read an entire plan when a self-contained excerpt is available. Do not prescribe fixed report fields, a first-line status, test transcript, scenario count, commit, or reviewer approval. Ask for the changed files, substantive decisions, verification evidence, and unresolved risks needed for integration.

### Recommended Executor Decision

Before dispatch, verify the profile is callable, no ownership conflict exists, dependencies are ready, and the task's security/runtime rigor fits the worker. A recommendation is evidence for this decision, not a command. Never expand a worker's permissions because a plan names a more powerful profile.

Use direct tools first. Workers may use only bounded utility leaves their effective policy permits; they do not spawn implementation, planning, coordination, Reviewer, or Oracle seats. Worker self-review is useful evidence but does not become a mandatory review receipt.

## Git Ownership and Authorization

Workers do not stage, commit, push, tag, rebase, release, or perform other Git writes unless the user specifically authorized that exact operation and the effective worker policy permits it. Normally they return changed files and evidence to the controller.

A clear user request can authorize the exact Git operation without a redundant confirmation, but its semantics do not expand:

- implement or fix does not mean commit;
- commit does not mean push, tag, rebase, or release;
- authorization for one repository, branch, range, or operation does not authorize another.

## Local Workflow Boundaries

No automatic workspace or ledger scripts, automatic cleanup, routine full review after each task or wave, or default worker Git write is permitted. Use the active todo list, plan notes, notepad, or final response for rulings and handoffs; do not introduce upstream ledger files or cleanup scripts.

## Plan and Integration Scan

Before work that spans tasks or waves:

- Check shared files and interfaces for incompatible assumptions.
- Check dependencies and ordering against the desired end state.
- Confirm planned evidence relates to observable acceptance criteria.
- Keep security, data-loss, protocol/API, compatibility, and irreversible-operation safeguards intact.

When a conflict is non-material, record the significant decision, its evidence or reason, and the cost if wrong in whatever form is useful, then proceed. Escalate when resolving it would change scope, acceptance, safety, data guarantees, public interfaces/protocols, permissions, irreversible effects, or would be a pure guess.

## Batch Small Same-Shape Work

Several independent, low-judgment edits of the same kind may share one brief. List every owned area and expected outcome, then inspect the result area-by-area. Keep separate work where judgment, dependencies, tests, or integration risk differ.

## Corrections and Changed Inputs

Continue the same worker session for a bounded correction to the same goal when the host exposes a continuation handle and its context remains valid. Otherwise start a fresh worker with the necessary correction context.

After a correction, rerun only affected checks or reviews plus any integration check whose substantive input changed. Do not restart a full review for formatting, narration, status wording, or other changes that cannot affect the reviewed outcome. Escalate rather than retry blindly after repeated no-progress attempts.

## Model Selection

Use the least costly currently available profile likely to complete the task reliably. Turn count and context handoff cost matter more than nominal token price. Scale capability to integration judgment, diff size, uncertainty, and risk; do not use a reviewer or Oracle as an implementation or architecture worker.

## Worker Results Are Evidence, Not Gates

Status labels such as `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT` are informational. Read the actual changed files, reasoning, evidence, and concerns. An acknowledgement, dispatch success, or label alone is not completion evidence.

Likewise, an optional or redundant child that is unavailable, times out, returns only an acknowledgement, or fails to add evidence does not block a result already proven by sufficient current evidence. Required work remains required; do not use this rule to bypass a real unresolved security, data-loss, protocol/API, compatibility, or irreversible-operation risk.

When a worker raises a concern:

- resolve correctness or scope concerns from code and requirements before relying on the result;
- provide missing context when that is the blocker;
- change model or task boundary when the work genuinely exceeds the worker;
- escalate decisions in the stop classes rather than forcing a guess.

### Waiting on Dispatched Subagents

Do not poll aggressively, sleep, or repeatedly ask for status. While you have local work — preparing the next dispatch, inspecting returned diffs, updating todos, or packaging review input — keep working. If the host exposes background completion, let it notify you. If a wait surface exists and you are genuinely idle, wait in bounded stretches rather than short loops, then reconcile outstanding children once per stretch. A continuation handle continues a child session; it is not a polling job ID.

## Verification

Choose evidence that can demonstrate the requested behavior or invariant. Depending on the change, this can include focused deterministic tests, existing regression tests, typechecks, builds, runtime probes, inspection of generated output, or protocol/security checks.

Do not impose a universal RED gate, test transcript, scenario count, or full-suite run for every task. Add or run tests where a plausible deterministic regression seam warrants them. Never weaken real safeguards or substitute an acknowledgement for evidence.

## Completion and Integration Check

For each worker result or direct-execution wave:

- inspect the actual changed and newly created files or current diff;
- compare the result to the goal and acceptance criteria;
- evaluate the reported evidence and run additional targeted checks when needed;
- check shared interfaces and assumptions against other work;
- record significant rulings, unresolved risks, and intentionally unverified items.

This is outcome verification, not a mandatory full reviewer pass after each task or wave.

## Constructing Review Requests

When independent review is useful, provide the reviewer with the goal, acceptance criteria, current diff or committed range including new files, relevant verification evidence, and global constraints. Add focused context for a known concern without pre-judging the conclusion. Do not paste accumulated session history or require a fixed packet schema, receipt, or first-line verdict.

Reviewers inspect the actual change and evidence; they should not rerun expensive checks without a reason. Treat their findings according to technical merit. Re-request only the affected review when substantive code, requirements, evidence, or constraints changed. An editorial prompt change does not stale otherwise applicable review analysis.

## When Review Is Useful

Consider focused review for a high-risk implementation concern, uncertain complex fix, meaningful cross-module integration, security/data/protocol/compatibility/release risk, or explicit user request. Consider a whole-change review before merge or delivery when the size or risk benefits from independent scrutiny.

Review is not unconditional. A proven low-risk result need not wait for an optional or redundant reviewer, and reviewer approval is not a substitute for evidence. When review is required by the user or a governing release/safety process, satisfy that requirement and resolve substantive blockers before completion.

## Handling Findings

Use the `receiving-code-review` skill. Fix validated blocking defects or missing required evidence. Group related findings into a coherent correction rather than spawning one worker per comment. Push back with code, requirements, or evidence when a finding is incorrect or would change approved intent.

After a substantive fix, rerun affected evidence and reviews. Do not rerun unaffected reviews. Preserve the approved goal and constraints; escalate feedback that would change scope, acceptance, safety/data guarantees, public APIs/protocols, permissions, or irreversible behavior.

## Prompt Templates

- `./implementer-prompt.md` — focused worker brief
- `./spec-reviewer-prompt.md` — optional narrow requirements consultation
- `./code-quality-reviewer-prompt.md` — optional narrow quality consultation

## Integration

- **writing-plans** — captures outcomes, dependencies, risks, and useful evidence when durable coordination is warranted
- **requesting-code-review** — constructs a focused review request when review is useful
- **receiving-code-review** — evaluates and acts on findings with technical rigor
