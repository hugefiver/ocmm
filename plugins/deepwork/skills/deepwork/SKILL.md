---
name: deepwork
description: "MUST USE when the user asks for deepwork-style planning, multi-agent execution, code review, research, or workflow routing inside Codex."
---

# Deepwork

This is the Codex adapter skill for deepwork. Use it to apply Deepwork's autonomous workflow semantics inside Codex while leaving the OpenCode plugin untouched.

## Runtime Mapping

- Use Codex `update_plan` for TodoWrite-style planning.
- Use the current callable Codex subagent-dispatch tool when delegation is useful and available. Match its actual schema: prefer exact profile selection, then complete model-plus-role composition, then generic/flat dispatch with a self-contained role-and-skills message.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex `apply_patch` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated `dw-*` agent TOML files from this plugin bundle's `agents/` directory as installable profiles when you want Deepwork role prompts as Codex agents. Resolve the directory relative to the installed plugin root, not a source checkout path.

## Workflow

Configured workflow: `codex`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching Deepwork role or generated `dw-*` Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify using repository commands relevant to the changed surface; workers provide lightweight local evidence, and the orchestrator coordinates integration/global checks before reporting completion.

Define the ideal end state, dependencies, interfaces, risks, and useful acceptance evidence. Plans guide execution rather than prescribe a fixed script: each wave has a goal, and actual results may change the order or equivalent implementation. Deep and workers may make minimal evidence-based decisions that preserve the approved goal, constraints, permissions, and final acceptance. Carry forward only current requirements, design constraints, dependencies, unresolved authorization boundaries, material risks, unverified coverage, and acceptance evidence, not a decision or assumption history. Escalate user-visible scope or acceptance changes, security/data/API/permission/irreversible risks, or decisions supported only by guesses.

Documents, code and comments, tests, and commit messages describe only final effective requirements, design, and behavior. Do not retain development narratives, decision histories, assumption rationale/cost records, intermediate changes, rejected alternatives, or decision counterexamples; trace history through the Git commit tree. Only documents with a strictly chronological purpose, such as roadmaps and changelogs, record changes over time. Current constraints, unresolved authorization, risks, actual defects, unverified coverage, and required license, attribution, and source identity remain part of the effective contract.

`docs/superpowers/specs/` and `docs/superpowers/plans/` are reserved for final product requirements to be delivered. Each spec or plan describes one final deliverable. Represent changed requirements with separate plans, not an accumulated decision history. Other tasks use conversation-level coordination or a task-owned temporary plan, never these directories; complexity does not change that boundary.

Tests protect valid requirements, functional behavior, and external interfaces against regressions. Do not add string, regex, snapshot, or parsed-content locks for documentation, commit messages, package information, or error/log wording that does not affect functionality or a system boundary. Verify executable configuration, protocol fields, resource delivery, and safety boundaries through behavior. Use synthetic payloads for text transport and conversion, and semantic review for real policy wording. Deliverables require correct functionality, interfaces, and usability, not universal text/hash locks; hashes/checksums are only for explicitly necessary integrity, provenance/security, or protocol identity. Update corresponding tests when requirements change. Delete tests dedicated to a removed requirement, subsystem, tool, helper, or module; never replace them with assertions of absence or rejected alternatives. Negative tests for valid safety, protocol, and input-handling requirements remain appropriate.

Source-to-generated artifact synchronization is a delivery check, not proof of policy correctness. Use the generation command and required generated-diff gates without weakening release checks; do not lock full policy documents or their parsed wording in tests.

For multi-task or parallel work, consolidate necessary global/heavy checks at task completion or important phase boundaries, not per small task. Workers hand off changes, lightweight local evidence/results for substantive modifications, and material risks or unverified coverage. The orchestrator owns integration and global verification.

Reuse passing evidence when it still covers the current claim and no change materially affects tested behavior or interfaces. Unchanged code needs no rerun absent a relevant change; dependency/environment changes during long tasks and unrelated parallel code edits don't automatically invalidate evidence. Assess concrete relevance, rerun only affected or missing checks, and report uncovered risks. Never classify behavior/interface-affecting changes as unrelated or treat failed/stale evidence as a pass. Safety/data/API/permission boundaries, required release checks, repository pre-commit typecheck/test/build gates, and explicit user verification remain binding.

Completion means complete functionality, clear usable interfaces, meaningful regression coverage, and evidence from the real surface. Task status labels are informational; acknowledgements alone are not evidence. An optional or redundant child does not block a result already proven through the actual interface. Use stricter process only when the user explicitly requires it or a concrete high-risk boundary needs it, limited to that risk.

Git commits are the compatibility boundary. Uncommitted intermediate behavior may be changed incompatibly to satisfy final requirements without transition shims or tests preserving it. An uncommitted edit to an existing component does not erase its committed contracts; API, security, data, permission, and irreversible-operation changes still require their applicable authorization. This policy does not authorize Git writes. Git writes require user authorization for the specific action. A request that necessarily includes that action is sufficient without asking twice. Implement/fix does not authorize commit; commit does not authorize push, tag, rebase, or release. Do not expand authorization or separately commit specs/plans by default.

## Runtime Controls

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

### Generated profile references

- `[@dw-*](subagent://dw-*)` is a profile reference, not a spawn.
- Plan review normal-profile example, only when chosen by the planning selector and proven callable: `[@dw-plan-critic](subagent://dw-plan-critic)`.
- Primary-model or primary-lane implementation self-review: `[@dw-reviewer](subagent://dw-reviewer)`.
- External-model implementation cross-check starts with `[@dw-oracle](subagent://dw-oracle)`; use `[@dw-oracle-2nd](subagent://dw-oracle-2nd)` through later configured slots only when explicit additional independent evidence is needed.
- Use Reviewer and Oracle profiles only for software implementation acceptance or focused code-quality verification after an implementation diff exists; never use them for research, ideation, architecture design, root-cause debugging, general-answer validation, or routine confidence.
- If an exact profile returns `unknown agent_type`, continue with Direct composition, then V1/V2 generic or flat dispatch, then Local execution.

## Generated Agents

| Codex agent | Profile effort | Deepwork source |
|---|---|---|
| dw-builder | xhigh | builder |
| dw-clarifier | xhigh | clarifier |
| dw-code-search | medium | code-search |
| dw-coding | xhigh | coding |
| dw-complex | xhigh | complex |
| dw-creative | high | creative |
| dw-deep | xhigh | deep |
| dw-doc-search | high | doc-search |
| dw-documenting | high | documenting |
| dw-explore | medium | explore |
| dw-frontend | xhigh | frontend |
| dw-hard-reasoning | max | hard-reasoning |
| dw-media-reader | high | media-reader |
| dw-normal-task | xhigh | normal-task |
| dw-oracle | xhigh | oracle |
| dw-oracle-2nd | xhigh | oracle-2nd |
| dw-orchestrator | high | orchestrator |
| dw-plan-critic | xhigh | plan-critic |
| dw-planner | xhigh | planner |
| dw-quick | medium | quick |
| dw-research | xhigh | research |
| dw-reviewer | xhigh | reviewer |

Generated profile defaults are installation metadata, not mandatory choices. Actual delegation must preserve explicit user configuration and select overrides only from the currently available model catalog.

## Runtime Model Selection

For an exact profile, omit `model` and `reasoning_effort` by default so Codex can apply the selected `dw-*` profile. For direct composition, select the tier model below only when the current tool exposes `model`, preserve the profile's existing reasoning effort as the baseline, and load the selected role's developer instructions and required skills. For generic/flat dispatch with no model field, do not invent an override: the child inherits its native/default model while the role and skills are carried in `message`. An explicit user-selected model always wins.

### Runtime model upgrades (only when directly selectable)

Apply this section only when the current dispatch surface exposes a `model` field or an exact profile route that also accepts a model override. An explicit user-selected model always wins. Determine availability from the current callable surface or active model catalog; model names in examples are references only and never prove availability. When no suitable model in a lane is available, omit the override and preserve the generated profile's existing model and reasoning behavior unchanged.

| Role lane | Selection principle | Reasoning effort | Roles |
|---|---|---|---|
| Flagship | Best available primary reasoning model in the user's catalog | `xhigh` minimum for planning, deep implementation, hard reasoning, architecture, algorithmic, security, or high-risk work; use native `max` on GPT-5.6 when maximum reasoning is requested, and use the family-supported maximum elsewhere. `high` remains acceptable for coordination, implementation, or clarification roles below that threshold. | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning |
| Primary self-review | Same primary reasoning lane as flagship work, selected from available models; Reviewer has logical tiers only and no ordinal slots | `xhigh` minimum; use native `max` on GPT-5.6 for complex, cross-module, security, performance, high-risk, or final-gate review | dw-reviewer |
| External Oracle cross-check | Oracle slots are external-model priority, not capability ranking (`dw-oracle`, then `dw-oracle-2nd` through configured later slots) | `xhigh` minimum for GPT/Codex review routes; preserve native `max` when explicitly selected and supported | dw-oracle*, dw-oracle-2nd*, dw-oracle-3rd*... |
| Plan review | Same primary reasoning lane when directly configurable | Every normal or suffixed profile has an xhigh minimum (the xhigh-equivalent floor); local `max` only by explicit local configuration | dw-plan-critic* |
| Mid | Best available mid-tier model; if none exists, use the primary reasoning model at a lower effort | Preserve the profile baseline unless task complexity requires more | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search |
| Mini | Best available lightweight model for mechanical, search, or fast lookup work | `high` for accuracy unless the user explicitly configures otherwise | dw-quick, dw-code-search, dw-explore |

When a newer family is explicitly available, select a demonstrably better model in the same capability lane instead of pinning an example name. Keep the role's high/xhigh/max complexity rule, never override an explicit user model, and fall back to the generated profile default when availability or capability evidence is absent.

Reviewer and Oracle routes use an `xhigh`-equivalent minimum when the selected model family exposes that control; otherwise they use the highest supported review effort for that family. GPT-5.6 supports native `max`, so complex or high-risk review/verification on a GPT-5.6 selected model may request `max` directly. Other families use `max` only when their cataloged controls support it.

Every `dw-plan-critic*` profile uses an `xhigh`-equivalent minimum; raise it only through explicit local configuration.

### Ordered Oracle profiles in this bundle

- Slot 1: `dw-oracle` (logical tiers: `normal`)
- Slot 2: `dw-oracle-2nd` (logical tiers: `normal`)

Slot ordering is always by Oracle ordinal (`oracle`, `oracle-2nd`, `oracle-3rd`, ...). Logical tier choice never reorders slots.

### Planning logical-tier profiles in this bundle

- `planner`: `dw-planner`
- `plan-critic`: `dw-plan-critic`

This inventory describes generated installation output only. The current callable dispatch-tool schema is the final authority for profile availability; generated files and configuration examples are not proof that a profile can be called.

For base generated role `dw-R` (`dw-planner` or `dw-plan-critic`), choose the first actually available candidate:

- An explicit user cost/latency request tries `dw-R-low`, then `dw-R`; select low only for that explicit cost/latency request.
- Small or clear work without that request uses the unsuffixed `dw-R` normal profile.
- Complex, cross-module, or coordination-heavy work tries `dw-R-high`, then unsuffixed normal.
- High-risk security, performance, data-loss, release-safety, runtime-safety, or critical-migration work tries `dw-R-max`, then high, then unsuffixed normal.

Never invent or synthesize a missing profile. The tier changes only the configured model route, never the role, prompt, mode, permissions, or review responsibilities. `dw-plan-critic-low` may select a lower-cost or lower-latency model, but it retains the xhigh-equivalent effort floor. Every `dw-plan-critic*` suffix has the same minimum.

### Ordered Oracle review

- Reviewer is primary-model or primary-lane self-review; Oracle profiles are external-model implementation cross-checks. Explicit user model configuration may remove model heterogeneity.
- Reviewer and Oracle profiles are only for software implementation acceptance or focused code-quality verification after an implementation diff exists, never research, ideation, architecture design, root-cause debugging, general-answer validation, or routine confidence.
- Oracle priority is ordered by slot: `dw-oracle`, then `dw-oracle-2nd` through later configured slots.
- Oracle slots are model priority, not capability ranking.
- The unsuffixed profile is logical `normal`; configured `-low`, `-high`, and `-max` profiles select task rigor independently of slot priority.
- When an external cross-check is useful or explicitly required, select the first available Oracle normal profile; complexity alone does not require dispatch.
- When a focused review needs greater rigor, choose configured `high`, falling back to unsuffixed `normal`; select Reviewer and Oracle only for their distinct evidentiary value.
- A review addressing concrete security, performance, data-loss, release, or runtime-safety risk selects configured `max`, otherwise configured `high`, otherwise unsuffixed `normal`.
- Logical `low` is selected only by an explicit user/workflow cost-or-latency request and still receives the review-effort floor.
- Additional Oracle passes select later configured slots in order only when additional independent evidence is explicitly needed.
- Configuring multiple Oracle profiles does not fan-out automatically.
- Reviewer has logical tier variants only and has no ordinal profiles.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning | Primary reasoning model from the user's available catalog | xhigh minimum for planner/deep/hard-reasoning; native max for GPT-5.6 maximum-reasoning work. high only for coordination, implementation, or clarification roles below that threshold |
| Primary self-review | dw-reviewer | Primary reasoning lane | xhigh-equivalent minimum when supported; native max for GPT-5.6 complex or high-risk review |
| External Oracle cross-check | dw-oracle, dw-oracle-2nd, later configured Oracle slots | Ordered by Oracle slot ordinal; tier choice does not reorder slots | xhigh-equivalent minimum when supported; native max for GPT-5.6 complex or high-risk verification |
| Plan review | dw-plan-critic* | Primary reasoning lane | xhigh-equivalent minimum for normal and every suffix unless local config raises it |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Available mid-tier model, else primary reasoning model at lower effort | max or high by task shape |
| Mini | dw-quick, dw-code-search, dw-explore | Available lightweight model | high |

### Model tier definitions

- **Flagship**: the most capable primary reasoning model available to the user.
- **Mid-tier**: a lighter-but-capable configured model. If no mid-tier lane is available, use the primary reasoning lane at `high` effort instead.
- **Mini**: the smallest/cheapest model available for fast mechanical or lookup tasks.

### Review dispatch guardrail

Oracle and Reviewer profiles are selectable options, not automatic fan-out or default delivery authorities. Choose only reviews that resolve a concrete uncertainty or meet an explicit user requirement, rather than attaching reviews to every task or wave.

Complex implementation of product business logic or behavior defaults to orchestrator-owned `dw-planner` → `dw-plan-critic` → implementation. Skip planning or criticism for that work only for a limited, simple, low-risk, clearly bounded change or when the user explicitly requests the skip; state the applicable exception in conversation. Clear requirements or model capability do not exempt complex product implementation. Non-product routine operations, docs, maintenance, and release preparation use direct execution when resolvable, otherwise a material question or useful `dw-complex`/specialist delegation, not automatic or repeated planner/critic/review cycles. Explicit process requirements and concrete major safety verification remain binding; authorization, API contracts, and data guarantees are unchanged.

Keep short-lived state and agent reports in conversation; synchronize useful results at delivery or major phase boundaries, not every checklist update. Do not materialize coordination, review conclusions, or evidence as workspace files unless explicitly requested as deliverables. Temporary, debug, disposable, or retired artifacts need no repeated stability/hash comparisons or completion writes before deleting their disposable resource checklist/journal. Do not introduce repository debug journals or extra ledgers. Cleanup still requires exact task ownership, safe resolved paths, PID plus start identity, and preservation of user edits.

dw-plan-critic* provides blocker-focused plan review through the Plan review lane at an `xhigh`-equivalent minimum for every suffix. Resolve substantive blockers through correction, concrete evidence rebuttal, or escalation before implementation; non-blocking suggestions do not delay it. No fixed verdict format, receipt, workflow hash, unlimited loop, or routine edit re-review is required.

When review is needed, provide the goal, acceptance criteria, current diff or range plus new files, verification evidence, and global constraints in a useful form without prescribed labels or order. Rerun only the affected review when its inputs change substantively; do not repeat unchanged reviews. Do not invent workflow hashes, artifact identities, stamps, or digest receipts; preserve existing Git commit SHAs and explicitly required external integrity/release protocols. Review supports judgment, not unconditional approval as a default completion gate.

Reviewer and Oracle routes use an `xhigh`-equivalent minimum when the selected model family exposes that control; otherwise they use the highest supported review effort for that family. GPT-5.6 supports native `max`; for other families, request `max` only when the selected model and catalog expose a maximum-effort control.

### Example names

Concrete model names in docs, tests, or generated profile comments are examples and compatibility references only. Select from the user's currently available model catalog and explicit local configuration; never require a specific example name or provider channel.
