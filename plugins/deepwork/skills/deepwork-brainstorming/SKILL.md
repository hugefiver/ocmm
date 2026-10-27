---
name: deepwork-brainstorming
description: "Use before creative or materially ambiguous work to clarify outcomes, constraints, risks, and an appropriate implementation direction."
---

<!-- Local fork of obra/superpowers/brainstorming v7.0.1.
     On-demand final-state policy and proportional discovery.
     Authorized work follows applicable planning without redundant design approval.
     Source and maintenance contract: docs/v1-maintenance.md. -->

# Brainstorming Outcomes Into Designs

Use discovery and design to remove material uncertainty before implementation. The objective is a shared understanding of the goal, constraints, acceptance criteria, interfaces, risks, and ideal end state, not completion of a prescribed ceremony.

## Final-State Artifacts and Regression Tests

These rules apply when the full skill is loaded on demand. Permanent workflow and role policies remain effective without this body; packaging or a brief activation is not full skill execution.

Documents, code and comments, tests, and commit messages express only the concise final requirements, design, and behavior. Update intermediate changes directly to the final text. Don't retain development or decision histories, rejected alternatives, or decision counterexamples. Trace history only through the Git commit tree. The only document exception is a strictly chronological purpose, such as a roadmap or changelog; ordinary maintenance notes aren't history archives.

`docs/superpowers/specs/` and `docs/superpowers/plans/` are reserved for final product requirements to be delivered. Each spec or plan describes its final deliverable, not an execution journal. Represent changed requirements with separate plans, not an accumulated change history. Other tasks use conversation-level coordination or a task-owned temporary plan and never write to those directories. Complexity can require planning without making a task a product-spec deliverable.

Tests protect valid requirements, functional behavior, and external interfaces against regressions. Don't add string, regex, snapshot, or parsed-content locks for documentation, commit messages, package information, or error/log wording that has no functional or system-boundary significance. Verify executable configuration, protocol fields, and resource delivery through their behavior rather than locking descriptive text. Don't add decision-counterexample tests or tests asserting that a deleted component is absent. When requirements change, update corresponding tests. When a module, helper, tool, or subsystem is removed, delete tests dedicated to it. Negative tests for valid safety, protocol, and input-handling requirements remain appropriate.

Don't add tests that freeze incidental files or lockfiles, build-tool details, descriptive package metadata, local OS/shell/path/PATH/CWD settings, dependency/runtime versions, or environment snapshots unrelated to product behavior or an explicit external or necessary delivery contract. A test must expose a concrete failure of a valid requirement, not preserve the current machine or tool setup. Verify configuration and delivery through observable behavior rather than whole-file string/hash equality or parsed incidental state. Necessary integrity, provenance, security, and protocol pins remain valid for their concrete boundary; prompt or document edits alone don't justify new infrastructure/environment tests.

Git commits are the compatibility boundary. Uncommitted intermediate implementations may be changed incompatibly to meet final requirements without transition shims or tests preserving intermediate behavior. An existing component with uncommitted edits still has its committed contracts. This rule doesn't authorize changes to public APIs/protocols, security or data guarantees, permissions, or irreversible behavior, and doesn't authorize any Git write.

Keep current constraints, authorization boundaries, unresolved risks, and verification evidence visible. State a necessary assumption as a current constraint or verification limit, not a ruling ledger. Agent reports stay in conversation; don't turn coordination, review conclusions, or evidence into workspace files unless explicitly requested as deliverables. Final-state discipline must never hide a real defect, blocker, or unverified requirement.

Delegation and delivery need clear goals, useful completion evidence, and material constraints, not exhaustive resource/file inventories, per-item revision/hash/receipt locks, or fixed report fields. Workers may discover relevant files, tests, docs, and other resources within the authorized scope. Communicate scope and ownership boundaries, irreversible-operation limits, and required protocol/integrity identities when they matter; resource discovery never expands permissions. Keep results in conversation and require exact identities only for a concrete safety, integrity, or external protocol requirement.

Temporary, debug, disposable, or retired files and directories do not need repeated stability checks, hash comparisons, or correct recorded status at every instant. Keep short-lived state in the agent session and synchronize useful results at delivery or major phase boundaries, not every checklist update. A completed disposable resource checklist can be deleted without first writing completion status; don't introduce repository debug journals or extra ledgers. Deliverables are proven by correct functionality, interfaces, and usability, not string/hash locks on all text files. Use hashes/checksums only for an explicitly necessary integrity, provenance/security, or protocol-identity requirement, preserving required release checks. Cleanup still requires exact task ownership, safe resolved paths, PID plus start identity for process termination, and preservation of user changes; lighter temporary-state handling never weakens authorization, API contracts, or data guarantees.

## Coordinated Verification and Evidence Reuse

For multi-task or parallel work, workers run lightweight local checks relevant to their substantive changes, not a full suite for each small task. Handoffs state what changed, local evidence/results, and material risks or unverified coverage. The orchestrator coordinates integration and global verification, consolidating necessary heavy checks at task completion or important phase boundaries and minimizing full-suite frequency.

Reuse passing evidence when it still covers the current claim and no change materially affects the tested behavior or interface. Unchanged code needs no repeat verification absent a relevant change. During long tasks, dependency/environment changes and unrelated parallel code edits may coexist with valid evidence; they don't automatically invalidate it. Assess concrete relevance: a dependency or environment change that affects tested behavior or interfaces is not unrelated. Rerun only affected or missing checks and state uncovered risks; don't treat failed, stale, or irrelevant evidence as a pass. This reduces duplication, not necessary verification: preserve safety/data/API/permission boundaries, required release checks, repository pre-commit typecheck/test/build gates, and explicit user verification requirements.

## Authorization and Intent

Start from the user's request and current project evidence:

- Identify the requested goal and ideal end state.
- Preserve stated constraints, permissions, exclusions, and acceptance criteria.
- Treat a materially clear imperative as authorization to implement that stated scope. Do not require a separate design presentation or reapproval merely because implementation follows discovery.
- Honor an explicit request for a strict process, design review, approval checkpoint, artifact, or verification step.
- Ask or obtain specific authorization when a decision changes the requested scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, triggers an irreversible/destructive action, or causes an external side effect that requires consent.

An instruction to design, investigate, implement, or fix does not authorize unrelated work. Git authorization is operation-specific: implement/fix is not commit; commit is not push, tag, rebase, or release. A clear request for an exact Git operation authorizes that operation without a redundant confirmation, but never expands to another operation, repository, branch, or release action.

## Choose Proportional Discovery

Choose and revise the path based on actual uncertainty, coordination, and risk. Path labels are planning aids, not gates, and may become lighter or heavier as evidence resolves or reveals complexity.

- **Direct/bounded:** The goal, affected flow, constraints, and acceptance are materially clear. Read enough local context to match patterns, state any consequential assumption, and proceed without a separate design approval.
- **Spike:** Feasibility or missing facts determine the path. Use the cheapest valid investigation and return a recommendation; exploratory code is throwaway unless the user authorizes implementation.
- **Architectural:** Boundaries, interfaces, dependencies, or consequential trade-offs remain unresolved. Explore enough to make those decisions explicit, then present the useful design or choices before implementation when user input is materially required.

Do not default upward merely because work is multi-file, creative, or unfamiliar. Do not default downward when concrete security, data-loss, compatibility, protocol/API, migration, release, or irreversible-operation risks require additional care.

These paths size discovery and design; they do not replace workflow planning policy. Complex implementation of product business logic or behavior defaults to `planner` → `plan-critic` → implementation even when requirements are clear and evidence is strong. Planning or criticism for that work may be skipped only for a limited, simple, low-risk, clearly bounded change, or when the user explicitly requests the skip; state the applicable condition in conversation. Non-product routine operations, docs, maintenance, and release preparation use direct execution when resolvable, otherwise a material question or useful `complex`/specialist delegation, not automatic or repeated planner/critic/review cycles. Explicit process requirements and verification for concrete major safety risks remain binding. An explicit skip never permits an unapproved security, data, API/protocol, permission, or irreversible-action decision.

## Discovery

Before asking a question, read the context the user supplied and the project material it points to: requirements, plans, handoffs, files, and the relevant code or documentation around them. Read enough to explain the current behavior and likely touch points. Treat answers already present in that context or earlier conversation as settled unless new evidence creates a material conflict; do not ask for the same information again in different words.

Inspect only enough additional project context to resolve material questions:

- current behavior and relevant local patterns;
- affected boundaries, dependencies, and interfaces;
- constraints and acceptance evidence;
- plausible failure, rollback, compatibility, security, data, and operational risks;
- independent work that can form separate waves.

Use a clarifier or ask the user only when missing information would change the deliverable, create material rework, or cross an escalation boundary. Ask the smallest useful question in the clearest form and explain what its answer would change. If project evidence or a prior answer resolves it, do not ask it. There is no required question count, option count, or multiple-choice format.

## Explore Approaches When They Matter

Present alternatives only when there is a real decision with meaningful trade-offs. Give as many viable approaches as the decision warrants, including one when the evidence supports a single clear path. Explain the recommendation using project evidence, constraints, reversibility, risk, and cost.

Do not manufacture alternatives, architecture, or refactoring to make the process appear thorough. Follow established patterns and apply YAGNI.

## Outcome-Oriented Design

Scale the design artifact to the work within the product-spec and temporary-plan boundaries above. A useful design makes the following discoverable without requiring fixed sections or order:

- goal and ideal end state;
- scope, exclusions, constraints, permissions, and acceptance criteria;
- current state and proposed approach;
- dependencies, interfaces, data/error flow, and ownership boundaries;
- material risks, rollback or safeguards where relevant;
- wave goals and useful acceptance evidence.

Organize waves by independently meaningful outcomes and dependency order. For each wave, state what becomes true and what evidence would demonstrate it. Do not require a task list, tiny sequential steps, or completion in a fixed order when work can safely proceed directly or in parallel.

## Bounded Rulings and Escalation

Resolve non-material ambiguity from the approved goal and repository evidence. Choose the smallest safe, reversible option that preserves the user's goal, constraints, permissions, and acceptance criteria.

Keep only the resulting current requirements, constraints, unresolved risks, and useful evidence in task coordination and handoffs. Don't write a decision or assumption history.

Escalate rather than guess when a choice changes scope or acceptance, weakens security or data guarantees, changes a public API/protocol, expands permissions, creates an irreversible effect, conflicts with a specific user mandate, or has no evidence-based path. Strict process is otherwise justified only by an explicit user request or concrete risk.

## Review and Approval

Self-review a material design for requirement coverage, internal consistency, interfaces, risks, and acceptance evidence. Fix clear issues directly.

Request user review or approval only when their decision is needed, they explicitly requested the checkpoint, or a governing high-risk boundary requires it. Do not require approval section-by-section, repeat review because wording changed, or restart a design loop after a non-substantive edit. If substantive inputs change, revisit only the affected decisions and evidence.

A saved spec is not mandatory for a clear bounded change. Create a product spec only for final product requirements to be delivered; other tasks stay in conversation or a task-owned temporary plan. Do not create a separate design/spec commit by default.

## Implementation Handoff

Once the goal is authorized and material uncertainty is resolved, proceed through the applicable implementation workflow without asking for a second design approval. Hand off the goal, ideal end state, constraints, acceptance criteria, dependencies/interfaces, material risks, and useful evidence. File-backed plans follow the location and final-deliverable rules above; delegated workers remain conditional on execution value.

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
