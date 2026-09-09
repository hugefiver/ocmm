---
name: deepwork-requesting-code-review
description: Use when an implemented change benefits from independent review before delivery or merge
---

<!-- v1 fork of superpowers/requesting-code-review.
     Upstream: obra/superpowers v6.3.0.
     Adjustments: review is risk- and evidence-driven rather than unconditional;
     requests carry the current change, goals, criteria, evidence, and constraints
     without fixed packet fields, receipts, or verdict formats.
     Reviewer-seat discipline remains: reviewers do not spawn additional review
     seats. See docs/v1-maintenance.md for sync rules. -->

# Requesting Code Review

Request independent code review when it provides useful evidence about an implemented change. Give the reviewer the work product and decision context, not the session transcript.

**Core principle:** Review current implemented code against the approved outcome. Reviewer and Oracle profiles are not research, ideation, architecture-design, root-cause debugging, plan review, or implementation workers.

## When Review Is Useful

Consider review when one or more applies:

- The change is complex, cross-module, difficult to inspect, or carries meaningful integration risk.
- Security, data loss, performance, compatibility, protocol/API, migration, release, or irreversible behavior deserves independent scrutiny.
- Local verification leaves material uncertainty about a complex fix.
- The user or a governing project/release process requires review.
- A focused concern would benefit from a second model perspective.

A small, low-risk result with sufficient current evidence does not require review merely as ceremony. Reviewer approval is not unconditional, and an optional or redundant reviewer does not become a completion gate.

## Construct the Review Request

Provide the reviewer, in whatever order is clearest:

- the goal and ideal end state;
- acceptance criteria;
- the current working-tree diff or committed range, including newly created files;
- relevant verification evidence and any intentionally unverified item;
- global constraints, permissions, and material approved rulings;
- focused dependency/interface or risk context needed to evaluate the change.

Use the actual current diff or range rather than a prose-only summary. If output is large or sensitive, provide a safe reviewable artifact or focused slices plus a complete file manifest, without omitting changes material to the criteria.

Do not require a fixed packet schema, first-line verdict, receipt, or transcript. Do not paste accumulated conversation history. Do not tell the reviewer what conclusion to reach or add open-ended directions unrelated to the change.

The reviewer evaluates supplied evidence and may request missing evidence. They should not rerun expensive checks without a reason, and they do not dispatch other reviewers, workers, or evidence-gathering subagents.

## Reviewer Selection

Select only the lanes that add useful independent evidence. Available profiles do not cause automatic fan-out.

- `reviewer` is the primary-model or primary-lane self-review profile.
- Oracle slots are external-model cross-check choices in configured priority order: `oracle`, `oracle-2nd`, then later configured slots.
- Later Oracle slots indicate selection order, not greater capability.
- Logical tiers are `low`, unsuffixed `normal`, `high`, and `max`, subject to actual configuration and model support.
- Explicit user model configuration and effective routing policy remain authoritative.

Typical choices:

- Focused, moderate-risk review: one suitable Reviewer or Oracle lane.
- Complex or high-impact change: primary review plus an intentionally chosen independent cross-check when the extra evidence is worth its cost.
- Additional lanes: only for an explicit evidence need, not because profiles happen to exist.

Review roles inspect implementation; they do not approve plans or decide unapproved product scope.

## Interpret the Result

Read the reviewer's analysis, cited code, and evidence. A status label, acknowledgement, dispatch success, or unsupported approval/rejection is informational rather than proof.

- Fix validated Critical or Important product defects before relying on the result.
- Supply missing required evidence when the implementation may be sound but proof is insufficient.
- Record or defer Minor suggestions according to scope and value.
- Push back with requirements, code, or evidence when a finding is wrong.
- Preserve real security, data-loss, protocol/API, compatibility, release, and irreversible-operation safeguards.

An optional or redundant review child that is unavailable, times out, or returns no substantive analysis does not block a result already established by sufficient evidence. This does not waive a review explicitly required by the user or governing process, nor a real unresolved high-impact risk.

## Rerunning Review

Rerun only reviews affected by substantive changes to code, new files, requirements, acceptance criteria, constraints, or relevant evidence. Do not rerun because formatting, narration, status wording, or unrelated files changed.

When a substantive fix changes the reviewed area, send the updated current diff or range and affected evidence. Reuse a continuation only while it remains the same review objective and context is reliable; otherwise start a fresh focused review.

## Git Boundary

Review does not require a commit. A working-tree diff plus new files is valid review input. Do not stage, commit, push, tag, rebase, or release merely to manufacture a review boundary.

Git writes require authorization for the specific operation. A clear user request can authorize that exact operation without re-asking, but implement/fix does not mean commit, and commit does not mean push, tag, rebase, or release. Authorization never expands to a different operation or repository.

See template at: `requesting-code-review/code-reviewer.md`

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
