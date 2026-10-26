---
name: avoid-ai-slop
description: Use before generating or modifying code, tests, or documentation when considering speculative abstractions, redundant defenses or fallbacks, filler explanations, or checks that do not prove required behavior; also use when the user explicitly asks to avoid AI slop.
license: MIT
---

# Avoid AI Slop

Prevent unnecessary machinery and unsupported claims in the current deliverable. This is generation-time guidance, not permission to clean unrelated code or start another workflow. Keep the active role, authorization, planning, review, safety, and verification requirements.

## Start with the actual obligation

Identify the requested behavior, its consumers, affected failure paths, and existing guarantees. Prefer the direct solution that fulfills those obligations. Extend it only for a concrete supported input, consumer, failure case, or compatibility requirement that the direct solution cannot handle.

Future flexibility alone is not a requirement. Do not add configuration switches, generic frameworks, pass-through wrappers, compatibility shims, or extra copies without a current responsibility. A helper is useful when it clarifies a real responsibility, not merely because code can be extracted.

## Judge defenses by their effect

For a proposed validation, retry, fallback, exception handler, or recovery layer, identify what it detects and how it changes rejection, recovery, or diagnosis. Validate at genuine trust boundaries; use established internal guarantees instead of repeatedly defending against impossible states.

Preserve authentication, authorization, input handling, data integrity, protocol checks, supported compatibility, accessibility, and necessary recovery. Simplicity is not permission to remove them. Keep valid safeguards even when their code is longer.

Do not turn a failed read into a successful empty result, swallow an error behind a plausible default, or retry a side effect without the required safety guarantees. Propagate failures or handle them according to the existing contract. Fix incorrect types rather than suppressing them with `as any`, `@ts-ignore`, or `@ts-expect-error`.

## Make explanations useful to their reader

Write comments for non-obvious intent, constraints, or invariants, not a narration of the next line. Documentation and reports describe the effective behavior and the facts needed to use or assess it. Omit hollow claims, repetitive summaries, defensive filler, and unrequested process histories.

Ask whether a sentence changes the reader's understanding or decision, and whether removing it would mislead. Preserve qualifications that change scope, evidence strength, attribution, uncertainty, or legal and safety obligations. Do not invent specificity, measurements, citations, causal claims, or certainty to make prose sound authoritative. Use the applicable source-fidelity guidance for sourced reports.

## Verify the obligation, not the appearance of effort

Choose checks that can expose a failure of the required behavior or external interface. Preserve meaningful safety and regression coverage. Do not add tautological assertions, snapshots of incidental prose, tests for an intermediate implementation, or tests whose only purpose is to fill a quota. Mock interactions can be valid interface checks; they do not prove product behavior they never exercise.

A new optional artifact does not automatically justify a verifier for that artifact. A check needs a concrete requirement it can falsify. Reuse passing evidence when it still covers the current behavior; supplement affected or missing coverage instead of repeating unchanged checks for reassurance.

Distinguish compilation, a harness result, and an exercised product surface. Report checks that failed, were blocked, or were not run without claiming completion from an unrelated success. Keep required checks and disclose missing evidence rather than weakening them to get green output.

## Stay within the current task

Apply this guidance before introducing the questionable structure or text. Correct the current authorized change without scanning or rewriting the rest of the repository. Read-only roles remain read-only; report unrelated findings to the task owner.

Do not launch agents, add approval gates, or create audit records because this skill was loaded. If the user explicitly requests systematic cleanup of existing AI-generated changes, use `remove-ai-slops` through the applicable workflow; this skill does not start it automatically. Once the requested outcome and necessary evidence are satisfied, stop.

## Sources and license

Adapted from [Stop That Shit's engineering skill](https://github.com/lennney/stop-that-shit/blob/main/skills/stop-that-shit/SKILL.md) and the reader-focused principles in its [STSS skill](https://github.com/lennney/stop-that-shit/blob/main/skills/stss/SKILL.md). Local comment, test, and workflow guidance follows this project's existing boundaries. No upstream Guard tooling or enforcement workflow is included.

The upstream MIT copyright and permission notice are retained in [LICENSE](./LICENSE).

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
