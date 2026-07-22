# Prompt Synchronization

This document tracks how local ocmm prompt files map to upstream omo prompt logic and how updates should be synchronized.

## Local Prompt Structure

Both workflows use the same prompt layers:

```text
prompts/<workflow>/
  agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
  deepwork/{default,gpt,gpt-5.6,gemini,glm,codex,planner}.md
  category/{frontend,creative,hard-reasoning,research,quick,coding,normal-task,complex,deep,documenting}.md
```

`workflow: "omo"` is the default local prompt set. `workflow: "v1"` is the deepwork skill-driven workflow that keeps the `v1` config/path label while model-visible text calls it the deepwork workflow.

## Functional Agent Mapping

| Local agent | Upstream omo role/file | Local adaptation |
|-------------|------------------------|------------------|
| `orchestrator` | Sisyphus dynamic prompt (`packages/omo-opencode/src/agents/sisyphus-*`) | Local role-descriptive names, category dispatch, and upstream-style intent verbalization before routing; **2026-07-21 planning logical-tier adaptation:** before fresh planner or plan-critic dispatch, inspect current callable/registered availability and select only the first available candidate (`low -> normal` for explicit cost/latency, normal for small/clear, `high -> normal` for complex/cross-module, `max -> high -> normal` for high-risk), never invent a profile, preserve role policy/receipts, and keep the `plan-critic-low` `xhigh`-equivalent floor |
| `reviewer` | Oracle (`packages/omo-opencode/src/agents/oracle.ts`) | Primary-model or primary-lane read-only self-review for software implementation acceptance and focused code-quality verification; never research, ideation, pre-implementation architecture, root-cause debugging, general-answer validation, or routine confidence. **2026-07-18 bounded nested-delegation adjustment:** review profiles use direct tools first and allow only leaf read-only lookup for evidence verification; they never delegate planner/reviewer/oracle/clarifier/plan-critic/implementation judgment. |
| `oracle` + `oracle-2nd` (+ configured `oracle-3rd`…`oracle-9th`) | (derived from reviewer prompt) | Ordered external-model implementation cross-check slots; built-ins are `oracle` and `oracle-2nd`; configured later slots and logical-tier profiles reuse implementation-review semantics via expansion (`promptSource: "reviewer"`); later slots mean lower selection priority, not stronger capability. Explicit user model configuration may remove heterogeneity. |
| `planner` | Prometheus (`packages/omo-opencode/src/agents/prometheus/*`, `packages/prompts-core/prompts/prometheus/default.md`) | Local docs/superpowers plan path and writing-plans skill contract; planner returns completed plans to the orchestrator and never dispatches plan-critic, Reviewer, Oracle, implementation, or decision agents. Repository-evidence-blocked decisions that are genuinely difficult return to the orchestrator for optional `hard-reasoning`; strict or high-risk conditions alone do not qualify, and ordinary planning judgment stays direct. |
| `clarifier` | Metis (`packages/omo-opencode/src/agents/metis.ts`) | Local `clarifier` name, directives feed local planner instead of Prometheus; **2026-07-18 bounded nested-delegation adjustment:** clarifier uses direct evidence first, allows only leaf read-only discovery to resolve named ambiguity, and does not delegate intent classification or final questions-for-user judgment |
| `plan-critic` | Momus (`packages/omo-opencode/src/agents/momus.ts`) | Local `plan-critic` name and inline-or-file plan review, blocker-focused only; **2026-07-18 bounded nested-delegation adjustment:** plan-critic uses direct file/search first, allows only leaf read-only lookup for one concrete plan claim, and does not delegate receipt verdicts |

## Model-Family Prompt Mapping

| Local file | Upstream reference | Notes |
|------------|--------------------|-------|
| `deepwork/default.md` | local ocmm controller + upstream discipline concepts | v1 default is intentionally concise; omo default stays upstream-first; all workflows add shell-adaptation guidance so examples are translated to the active runtime shell |
| `deepwork/gpt.md` | `packages/prompts-core/prompts/ultrawork/gpt.md` | Upstream-first; local agent/tool names plus shell-adaptation guidance |
| `deepwork/gpt-5.6.md` | `packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts`, `packages/omo-codex/plugin/components/rules/bundled-rules/hephaestus/gpt-5.6.md`, and `packages/omo-opencode/src/agents/momus-gpt-5-6.ts` | Additive GPT-5.6 calibration only: applicability/authority, outcome-first completion, conservative retrieval/delegation, context-efficient waiting/revalidation, and reporting priority. Shared discovery, planner trigger, answerability, scope, shell, review labels, and exact role permissions remain in effective base/role/category/skill/terminal-contract layers rather than being duplicated here. **2026-07-19 simplification:** preserves native `max`, safe defaults, authorization, observable delegation evidence, backed-off waiting, and changed-input validation while removing the role matrix and detailed allowlists. **2026-07-22 agile calibration:** adds complexity/rigor-first process scaling, context/workflow-gated subagent use, review-agent purpose and selection boundaries, and parallel implementation guidance for independent non-coupled modules. |
| `deepwork/gemini.md` | `packages/prompts-core/prompts/ultrawork/gemini.md` | Upstream-first; local agent/tool names plus shell-adaptation guidance |
| `deepwork/glm.md` | `packages/prompts-core/prompts/ultrawork/glm.md` | Upstream-first GLM reliability and evidence discipline plus shell-adaptation guidance |
| `deepwork/codex.md` | `packages/prompts-core/prompts/ultrawork/codex.md` | Upstream-first; Codex harness-only commands adapted to OpenCode/ocmm; command-lens wording is shell-neutral and uses the active runtime shell; synced through `./omo@c6058d5` TUI visual QA and command-lens updates. **2026-07-20 local policy refresh:** all three workflow sources use touched/affected increment checks, changed-input broader gates, one final full pass, and a local-envelope-plus-`GOAL`/`STOP WHEN`/`EVIDENCE` delegation contract without weakening complex-task evidence or final acceptance. |
| `deepwork/planner.md` | `packages/prompts-core/prompts/ultrawork/planner.md` and Prometheus prompt | Upstream-first planner doctrine with local planner naming and shell-adaptation guidance |

## Maintenance Rules

1. Any change under `prompts/omo/` that changes upstream-derived behavior must update this document.
2. Any change under `prompts/v1/` must update `docs/v1-maintenance.md`; if it changes upstream omo mapping, update this document too.
3. Keep local model-facing prompts on local role names: `reviewer`, `planner`, `clarifier`, `plan-critic`, and `orchestrator`.
4. Agent and category prompts should remain strongly aligned between `prompts/omo/` and `prompts/v1/`; the skill-driven workflow gets its distinct behavior from the deepwork layer and injected skills.
5. Category prompts must describe the work shape each category handles. Avoid routing language based on model strength, weak/strong labels, or vague difficulty tiers; say what kind of deliverable belongs in the category.
   Local mapping for upstream categories: `hard-reasoning` is the ultrabrain-style decision category; `deep` is autonomous system development and feature delivery; `coding` is determined code editing and bug fixing. `normal-task` absorbs bounded fallback work with known acceptance criteria; `complex` absorbs coordinated cross-cutting fallback work that remains below autonomous feature delivery.
6. Built-in defaults for categories at or above `coding` should use `max` in the local variant vocabulary. GPT-5.6 supports native `max`; other families use `max` only when their selected model exposes a maximum-effort control. `quick` remains the lightweight mechanical-edit category. Explicit user model/variant/parameter declarations are respected as written except for review/plan-review floors, and concrete model names in prompts or docs are examples rather than requirements.
7. Compatibility aliases are intentional: upstream-style `@explore` maps to local `code-search`; `@oracle` selects the independent local `oracle` built-in instead of aliasing `reviewer`. Ordered Oracle slots are `oracle`, `oracle-2nd`, and configured `oracle-3rd` through `oracle-9th`; slot priority does not imply capability. Category names such as `@deep` and `@quick` are exposed directly as category-subagents.
8. Keep compatibility labels such as `workflow: "omo"` and `workflow: "v1"` unchanged unless a separate migration explicitly changes config semantics.
9. Do not expose `v1` as model-facing workflow wording. Files under `prompts/v1/` should say `deepwork` to the model; `v1` remains only a config/path label.
10. When syncing from upstream, compare against the local upstream checkout at `./omo` or a fresh checkout of the same repository, then re-apply local naming and OpenCode/ocmm tool semantics.
11. Shell-adaptation guidance is a local global invariant across every effective `deepwork/*` variant and every category prompt path: prompt/skill shell snippets are examples and must be translated to the active runtime shell. Category prompts carry the guidance directly because not every category runtime path inherits a deepwork layer.
12. GPT-5.6-specific additive calibration belongs only in `deepwork/gpt-5.6.md`. Do not copy its outcome/waiting/revalidation layer into generic GPT/Gemini/GLM/Codex/default prompts. Conversely, do not restore generic discovery, planner-trigger, answerability, scope, shell, review-label, workflow-role matrix, or detailed allowlist copies inside the specialization; those remain authoritative in effective base/role/category/skill prompts and terminal delegation contracts.
13. Nested delegation boundaries for functional agents are strict invariants across `prompts/{omo,v1,codex}/agents/*`: planner keeps direct planning and returns genuinely difficult decision blockers to the orchestrator; strict or high-risk conditions alone do not qualify. Reviewer/Oracle profiles perform only implementation acceptance or focused code-quality verification with read-only evidence lookup; clarifier keeps direct evidence and judgment ownership; plan-critic keeps direct lookup and receipt-verdict ownership.

## Last Upstream Prompt Check

- Source checked: local upstream checkout `./omo` at `17104e1` (2026-07-12 sync; v4.16.3 release is `d89f335`, with newer prompt work reviewed at the checked-out head; previous sync was `a7ac217aeeb7bd1f56c4633f4e92d97ec363f60f`).
- Prompt-relevant upstream changes since `c6058d5db`: Prometheus/planner prompt closed the implement-by-proxy loophole — "you never implement - not directly and not by proxy: a subagent you spawn that edits product code is you implementing ... no subagent you dispatch is ever that worker."
- Local sync: `prompts/omo/deepwork/planner.md` now closes the proxy loophole with ocmm-adapted wording (no `/start-work`; references local execution workflow handoff). The codex.md ultrawork changes (Sparkshell removal, TUI visual QA, Browser plugin, `/start-work` rename, implement-by-proxy) were already represented locally — no action needed.
- GPT-5.6 prompt-shape sync (2026-07-12): added `prompts/omo/deepwork/gpt-5.6.md`, selected only for the GPT-5.6 family. It adapts upstream outcome-first context gathering, explicit delegation outcomes, and evidence-first reporting while retaining OpenCode `task(...)`, local role names, tiered authorization, TDD, and QA semantics. The generic `gpt.md` remains unchanged. 2026-07-14 adjustments: the layer now states that concrete model or lane names are references only; user configuration and the currently available catalog decide the actual model; GPT-5.6 supports native `max` reasoning effort, so local `max` is not an `xhigh` alias for GPT-5.6.

## GPT-5.6 Prompt Simplification (2026-07-19)

- GitHub source of truth: `code-yeongyu/oh-my-openagent`, branch `dev`, commit `e8d842a38a7e0ed3edd5fc74f88247f8b63075ad`.
- Reviewed sources: `packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts`, `packages/omo-codex/plugin/components/rules/bundled-rules/hephaestus/gpt-5.6.md`, and `packages/omo-opencode/src/agents/momus-gpt-5-6.ts`.
- Merged evidence: PR #6012 (shorter outcome-first prompts and prioritization), #6010 (shorter role-specific review contract), #6100 (`GOAL` / `STOP WHEN` / `EVIDENCE` delegation outcomes), and #6151 (no empty polling, backed-off waiting, and changed-input revalidation).
- Local result: the three specialization sources keep one shared four-section doctrine and environment-specific applicability/authority wording only. Effective base-plus-specialization prompts retain discovery, planning, answerability, scope, shell, and review behavior without a second copy in the specialization.
- Source budgets: omo 6,742, v1 6,794, and Codex 6,799 baseline characters; each replacement is capped at 3,500 characters and at 60% of its baseline.
- Codex generated profiles carry the compact calibration ahead of runtime model selection; non-GPT-5.6 models ignore it. Generated agent instructions are refreshed only after clean-root and prompt-only candidate-diff checks.
- 2026-07-22 agile calibration: GPT-5.6 now chooses the lightest sufficient process after assessing complexity and rigor, delegates only for parent-context savings or workflow/parallel-delivery value, confines reviewer/Oracle profiles to implementation acceptance or focused code-quality verification under existing selection rules, and considers parallel subagents for independent non-coupled modules.

## ocmm-Native Workflow Adaptation (2026-07-13)

Local adaptation of upstream omo workflow semantics into ocmm-native wording. Applied to `prompts/omo/**`, `prompts/v1/**`, `prompts/codex/**`, and the v1 skills. Not an upstream sync.

- **Discovery-before-planning**: every deepwork variant and the v1 `brainstorming` skill now require a first discovery wave (read files, search patterns, surface unknowns) before deciding decomposition or whether to invoke a planner.
- **Planner trigger**: planner/file-plan invocation is no longer step-count-based. Use a planner (and write a file-backed plan) only when the work is relatively complex, has a clear purpose, and after discovery still has unclear boundaries, dependencies, success criteria, or needs durable coordination. Clear-boundary work with a single obvious path uses a lightweight contextual plan instead.
- **Answer-when-answerable**: research/explanation requests must gather enough evidence to answer, then stop and answer. No extra research agents, subagents, or planning cycles once the evidence is sufficient.
- **Full-request scope**: deliver the full requested outcome by default. Removed default "minimum viable", "MVP", and phase-1 scope reduction language from clarifier prompts and deepwork scope constraints. Scope reduction only happens when the user explicitly asks for it or the work must be split.
- **Review/QA labels**: review findings are labeled `[product]` (proposed implementation/product change) or `[evidence]` (missing or insufficient proof). An `[evidence]` blocker requires additional evidence, not a product rewrite. Added to the v1 `requesting-code-review` and `subagent-driven-development` skills and to all deepwork variants (except the planner variant, which does not review).
- **GPT-5.6 restraint preserved**: `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` retains the existing GPT-5.6-specific subagent restraint. The new semantics above are expressed as general rules, not GPT-5.6-only rules.
- **Shell Adaptation preserved effectively**: base `gpt.md`, `planner.md`, and category prompts retain shell adaptation. The additive GPT-5.6 specialization no longer repeats that section, and tests verify each effective composed path still contains it exactly once.

## Flat Workflow Subagent Policy (2026-07-17)

- The utility-leaf set is `quick`, `code-search`, `explore`, `doc-search`, `research`, and `media-reader`; utility leaves never dispatch.
- Standard workflow agents may call only utility leaves. Read-only workflow agents exclude `quick` and may call only `code-search`, `explore`, `doc-search`, `research`, and `media-reader`. Planner returns genuinely difficult decision blockers to the orchestrator rather than dispatching decision or review agents; strict or high-risk conditions alone do not qualify.
- Local coordinators `deep` and `complex` may additionally call only `coding`, `frontend`, `hard-reasoning`, `creative`, and `documenting`, and only for materially useful bounded deliverables.
- `prompts/{omo,v1,codex}/agents/planner.md` return completed plans to the orchestrator rather than launching plan-critic, Reviewer/Oracle profiles, implementation workers, or decision agents; genuinely difficult decision blockers return to the orchestrator, while strict or high-risk conditions alone do not qualify.
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` keep only the shared conservative decision threshold: direct tools first; delegation requires effective-role permission and a bounded result that materially improves completion; multiple steps, routine confirmation, or another opinion are insufficient.
- Exact utility/specialist allowlists, utility-leaf termination, difficult-decision routing, and orchestrator-owned formal review remain in role prompts and effective terminal delegation contracts, not in the model calibration.
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` retain explicit safe-default question thresholds: proceed under clear facts; ask only for deliverable-changing choices, unavailable required information, destructive actions, or material-rework risk.
- Effective config prompt contracts override broader skill/model/adapter wording. Formal planner dispatch, the plan-critic loop, formal plan review and final acceptance review remain orchestrator-owned.
- Final review may consume either a committed range or a working-tree/staged diff; implementation subagents report changes and do not create commits merely to create review SHAs.
- Orchestrator requesting-code-review wording must describe committed ranges or working-tree/staged diff review input, never SHA-only review input.
- `prompts/{omo,v1,codex}/agents/orchestrator.md` now state explicit workflow-agent composition ownership, ordered Oracle slot/profile selection, deterministic tier mapping, and no automatic fan-out from multiple configured slots/tiers.

## Codex Prompt Policy Refresh (2026-07-20)

- `prompts/{omo,v1,codex}/deepwork/codex.md` rerun only touched tests and affected scenarios per increment; suite/typecheck/build rerun only when relevant inputs changed after their last green result; one full integrated pass remains required before final reporting.
- Complex-task RED/GREEN/SURFACE/CLEAN evidence, cleanup receipts, and each environment's final acceptance authority remain unchanged.
- Delegation keeps `TASK`, `EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`, `MUST NOT DO`, and `CONTEXT`, and adds observable `GOAL`, `STOP WHEN`, and `EVIDENCE`; the parent verifies evidence, and a child's stop condition never replaces whole-user-goal completion.
- Prompt policy is separate from generated Codex MultiAgent V1/V2 compatibility. `src/codex/plugin-generator.ts` and its compatibility tests remain unchanged; the existing generator path does not consume `prompts/codex/deepwork/codex.md`, so tracked bundle regeneration is expected to be a no-op.

## Observation-Only Upstream Items (2026-07-13)

The following upstream omo prompt/behavior items were reviewed and are intentionally recorded as observation-only. They are not implemented in this change and will only be reconsidered when a concrete trigger appears:

- **Frontend layout-mechanics (item 8)**: no additional frontend layout mechanics guidance beyond the existing `frontend` skill. Revisit if a task explicitly involves CSS layout engine behavior, breakpoint mechanics, or visual QA beyond the current skill coverage.

## v1 Workflow Adjustment (2026-07-02)

- v1 brainstorming: step 2 restructured to ambiguity assessment + conditional `clarifier` consultation; step 7 spec approval made conditional (user delegation OR self-review ambiguity pass); HARD-GATE approval sources expanded to three (user approval / self-review pass / user delegation).
- v1 writing-plans: added mandatory plan-critic review loop after self-review with three-state verdict (`[REJECT]`/`[OKAY]`/`[OKAY-UNAMBIGUOUS]`); plan approval conditional (user delegation OR `[OKAY-UNAMBIGUOUS]`).
- v1 plan-critic: expanded binary output to three-state; added ambiguity assessment check; 80% threshold clarified as applying only to `[OKAY]` vs `[REJECT]`.
- Codex adapter (`prompts/codex/**`): deepwork prompts, orchestrator, and plan-critic mirrored the v1 conditional-approval semantics. Codex plan-critic also gained the three-state verdict.
- These changes are local v1/Codex workflow adjustments, not upstream omo prompt syncs. `prompts/omo/**` is unaffected.

## Oracle Slot Priority + Logical Tier Selection (2026-07-15)

- `oracle` and `oracle-2nd` are built-in ordered model slots; configured `oracle-3rd` through `oracle-9th` extend the same slot family.
- Oracle slot order defines selection priority only. A later slot is an additional configured model perspective, not stronger capability.
- `reviewer` is primary-model or primary-lane implementation self-review; `reviewer-2nd` does not exist. Oracle slots are external-model implementation cross-checks by default; explicit user model configuration may remove heterogeneity.
- Logical rigor tiers are `low` / `normal` / `high` / `max`. `normal` is unsuffixed; tier-suffixed profiles exist only when configured and available.
- Slot and tier axes are independent: selecting a higher tier does not automatically add reviewers, and adding Oracle slots does not force fan-out.
- Runtime selection guidance is ordered by risk: simple work uses the first available Oracle at `normal`; complex/cross-module work uses first available Oracle + reviewer with configured `high` otherwise `normal`; security/performance/data-loss/release/runtime-safety work uses configured `max` otherwise `high` otherwise `normal`; additional evidence adds later Oracle slots in ordinal order.
- Active v1 review skills and generated Codex workflow skills now follow this ordered-slot + logical-tier contract.
- Legacy `oracle-high` naming remains migration-compatible in config plumbing, but active workflow semantics are superseded by the 2026-07-15 ordered-slot design.
- **2026-07-22 role correction:** Reviewer/Oracle profiles are limited to software implementation acceptance or focused code-quality verification after an implementation diff exists. Simple acceptance uses the first available Oracle normal profile; complex/cross-module uses Oracle + Reviewer; high-risk work follows max → high → normal. Research, ideation, pre-implementation architecture, root-cause debugging, general-answer validation, and routine confidence do not use review profiles. Ordinary architecture and first-line debugging stay with the primary workflow; `hard-reasoning` requires genuinely difficult decision analysis, and strict or high-risk conditions alone do not qualify.
