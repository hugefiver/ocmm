---
name: deepwork-subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

<!-- Local fork of obra/superpowers/subagent-driven-development v7.0.1.
     Optional delegation after applicable planning; current outcomes and evidence.
     Worker permissions, ownership, and host continuation remain bounded.
     Source and maintenance contract: docs/v1-maintenance.md. -->

# Subagent-Driven Development

Use focused workers when delegation materially improves implementation of an approved plan. Coordinate toward the plan's goal and ideal end state, not toward ceremonial completion of every originally imagined step.

**Core principle:** Preserve the approved goal, constraints, permissions, and acceptance criteria; choose the smallest execution and evidence path that proves the outcome.

Delegation is optional. Direct execution is valid when a task is small, tightly coupled to controller context, or cheaper to complete than to brief and reconcile. When delegation helps, give each worker self-contained context rather than session history.

This skill begins at implementation. For complex implementation of product business logic or behavior, the orchestrator must first complete the `planner` → `plan-critic` sequence and resolve every substantive plan blocker. An exception applies only to a limited, simple, low-risk, clearly bounded change or an explicit user request. Non-product routine operations, docs, maintenance, and release preparation do not inherit that sequence: execute directly when resolvable, otherwise ask or delegate a bounded `complex`/specialist task. Explicit process requirements and concrete major safety verification still apply. Direct execution does not bypass required product planning.

**Continuous execution:** Do not pause between ordinary tasks merely to ask whether to continue. Stop for a decision that changes scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, requires an irreversible/destructive operation, triggers an external side effect requiring authorization, or leaves only pure guesses. Otherwise make a bounded ruling and continue.

**Bounded execution:** Resolve non-material plan defects or ambiguities from approved requirements and repository evidence. Carry only current constraints, necessary assumptions, unresolved risks, and evidence into coordination and reports. Don't create a ruling ledger or preserve decision history.

**Narration discipline:** Between tool calls, keep narration brief. Use prose for decisions, blockers, and questions rather than duplicating tool output.

## When to Use

- An approved plan or bounded task has work that benefits from isolated execution context.
- Task boundaries and file ownership are clear enough to avoid interference.
- The controller can supply goals, criteria, dependencies, interfaces, evidence expectations, and constraints without pasting session history.

For two or more independent tasks with no shared state or overlapping files, consider `dispatching-parallel-agents`. Keep dependent or shared-state work sequential. Do not delegate merely to satisfy a workflow label.

## Outcome-Oriented Process

1. Understand the goal, ideal end state, acceptance criteria, dependencies/interfaces, relevant evidence, and global constraints.
2. Scan planned file/interface overlaps, current constraints, and material risks.
3. Choose direct execution or a useful worker boundary for each task or wave.
4. After work returns, inspect the actual changes and evidence and resolve integration issues. Keep short-lived coordination in session; synchronize useful results at delivery or major phase boundaries, not every checklist update.
5. Request focused or whole-change review only when risk, uncertainty, change shape, or user instruction makes independent review useful.
6. Coordinate integrated/global verification, consolidating necessary heavy checks at task completion or important phase boundaries; report any unverified item.

The plan is guidance, not an immutable script. A worker may use a minimal evidence-based equivalent when repository reality makes a planned detail unnecessary or inferior, provided the approved goal, constraints, permissions, and acceptance criteria remain unchanged. Describe the resulting current implementation and any unresolved risk, not a deviation history. Decisions in the stop classes above return to the controller or user.

## Worker Briefs

Explain only what the worker needs to act safely toward the outcome; these are useful prompts, not required fields or an exhaustive inventory:

- the task/wave goal and ideal end state;
- acceptance criteria and useful evidence;
- relevant current state, dependencies, and interfaces;
- material scope and ownership boundaries;
- global constraints and permissions;
- current constraints, authorization boundaries, or known risks.

Workers may discover corresponding resources within the authorized scope; the brief need not name every file, revision, hash, or receipt. Discovery does not expand permissions or bypass ownership, irreversible-operation, or protocol-identity boundaries. Do not make a worker read an entire plan when a clear bounded brief is sufficient. Do not prescribe fixed report fields, a first-line status, test transcript, scenario count, commit, or reviewer approval. Ask for the resulting implementation, changed files, local verification evidence/results, and material risks or unverified coverage needed for integration.

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

No automatic workspace or ledger scripts, automatic cleanup, routine full review after each task or wave, or default worker Git write is permitted. Return worker reports in conversation, not workspace plan/report/evidence files unless explicitly requested as deliverables. Use session-level coordination for short-lived state without repeated stability/hash checks or completion writes before deleting disposable checklists; safe ownership cleanup and authorization remain binding. Product specs/plans describe only final product deliverables; other tasks never write to the superpowers directories.

## Plan and Integration Scan

Before work that spans tasks or waves:

- Check shared files and interfaces for incompatible assumptions.
- Check dependencies and ordering against the desired end state.
- Confirm planned evidence relates to observable acceptance criteria.
- Keep security, data-loss, protocol/API, compatibility, and irreversible-operation safeguards intact.

Resolve non-material conflicts from evidence and proceed with the resulting current constraints. Escalate when resolving a conflict would change scope, acceptance, safety, data guarantees, public interfaces/protocols, permissions, irreversible effects, or would be a pure guess.

## Batch Small Same-Shape Work

Several independent, low-judgment edits of the same kind may share one brief. State the shared outcome and material scope/ownership boundaries; workers can discover corresponding resources inside them without an exhaustive file list or per-item identity lock. Inspect actual changes against that scope. Keep separate work where judgment, dependencies, tests, or integration risk differ.

## Corrections and Changed Inputs

Continue the same worker session for a bounded correction to the same goal when the host exposes a continuation handle and its context remains valid. Otherwise start a fresh worker with the necessary correction context.

After a correction, rerun only affected checks or reviews plus any integration check whose substantive input changed. A newly identified or resolved blocker or relevant new evidence can justify another affected pass; formatting, narration, status wording, repeated doubts, or unchanged uncertainty cannot. When the same check fails consecutively for the same reason and no new diagnostic basis exists, stop blind retries, identify whether the failure belongs to the product or the harness/tool/environment, and state the unmet requirement and needed input or capability. Continue independent authorized work only when it does not depend on the blocker.

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

Keep product failures separate from harness, tool, fixture, and environment failures. If the harness did not exercise the product behavior, report the evidence gap; do not change product behavior or weaken a valid check merely to obtain green output. An unresolved required failure remains incomplete even when other authorized work can proceed independently.

Workers run lightweight local checks for their substantive changes; the controller owns integration and consolidated global/heavy verification, not a full-suite run per small task. Apply brainstorming's material-relevance reuse rule: unrelated code, dependency, or environment changes don't invalidate passing evidence; changes affecting tested behavior or interfaces require only affected checks and explicit coverage gaps. Required safety, release, pre-commit, and user-mandated checks remain binding.

Do not impose a universal RED gate, test transcript, scenario count, or full-suite run for every task. Add or run tests where a plausible deterministic regression seam warrants them. Never weaken real safeguards or substitute an acknowledgement for evidence.

Tests protect final valid requirements, functionality, and external interfaces. Don't lock descriptive documentation, commit messages, package information, or non-contractual error/log wording through string, regex, snapshot, or parsed-content assertions. Don't test decision counterexamples or the absence of removed components. Update tests with requirements and delete tests dedicated to removed components. Uncommitted intermediate behavior needn't be preserved; committed contracts and authorization boundaries still apply.

## Completion and Integration Check

For each worker result or direct-execution wave:

- inspect the actual changed and newly created files or current diff;
- compare the result to the goal and acceptance criteria;
- evaluate the reported evidence and run additional targeted checks when needed;
- check shared interfaces and assumptions against other work;
- report current constraints, unresolved risks, and intentionally unverified items.

This is outcome verification, not a mandatory full reviewer pass after each task or wave.

## Conditional Review Guidance

When step 5 applies because independent review is explicitly required or materially useful, load and follow [the review guidance](./references/review.md). Do not load it or add a review gate for a result whose current evidence and risk do not justify review. The permissions, stop/escalation classes, workflow ownership, and evidence rules in this entry remain authoritative.

## Prompt Templates

- `./implementer-prompt.md` — focused worker brief
- `./spec-reviewer-prompt.md` — optional narrow requirements consultation
- `./code-quality-reviewer-prompt.md` — optional narrow quality consultation

## Integration

- **writing-plans** — captures outcomes, dependencies, risks, and useful evidence when durable coordination is warranted
- **requesting-code-review** — constructs a focused review request when review is useful
- **receiving-code-review** — evaluates and acts on findings with technical rigor

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
3. **V1/V2 generic or flat dispatch** — state the permitted role, bounded goal, and material constraints clearly; the brief prompts below are optional guidance. The child keeps its default or inherited runtime model unless the callable schema exposes and receives a valid explicit override.
4. **Local execution** — resolvable non-product routine work may run directly without entering dispatch routing. Otherwise use this fallback when no callable native dispatch tool is available. When delegation is not permitted, preserve the role contract and its workflow owner rather than routing around that restriction.

For generic or flat dispatch, clear prose is sufficient. These labels are illustrative, not required protocol fields or report sections:

`GOAL:` Describe the permitted role, bounded outcome, and material scope/ownership constraints.
`STOP WHEN:` Describe the observable completion condition and relevant non-goals.
`EVIDENCE:` Describe useful completion evidence; the worker may find corresponding resources within scope.

Workers may discover relevant resources within the communicated scope; do not require exhaustive file lists, per-item revision/hash/receipt locks, or fixed report fields. Discovery does not expand permissions or bypass material ownership, irreversible-operation, or protocol/integrity identity boundaries. Workers run lightweight local checks for substantive changes and return outcomes, changes, local evidence/results, and material risks or unverified coverage in conversation, not workspace reports. The orchestrator owns integration and consolidated global/heavy verification, not full suites per small task; required safety, release, pre-commit, and user checks remain binding. A generic brief does not load a profile, select a model, attach a skill, or enable a missing feature.

When the planning logical-tier selector chooses the unsuffixed normal profile and the callable schema proves exact-profile selection is available, the V1 example is `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the current implementation plan and return concrete findings with supporting evidence.")`. V1 may send `model` only when the current callable schema exposes `model`. V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add `fork_context` only when the callable V1 schema exposes it and an explicit inheritance decision requires it.

V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. No stable `multi_agent_v2` namespace is guaranteed. V2-style flat tools never receive `fork_context`. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.

Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none` to request no context. If `fork_turns` is hidden, omit it. Other `fork_turns` values are only for explicit branch exploration.

`task_name` is an identity, not a profile selector. Do not pass `dw-*.toml` as a prompt, item, or skill attachment: generated TOML files are installation artifacts, not runtime skills.
