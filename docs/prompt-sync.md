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
| `orchestrator` | Sisyphus dynamic prompt (`packages/omo-opencode/src/agents/sisyphus-*`) | Local role-descriptive names, category dispatch, and upstream-style intent verbalization before routing |
| `reviewer` | Oracle (`packages/omo-opencode/src/agents/oracle.ts`) | Read-only advisor contract, local `reviewer` name, no Oracle branding in model-facing local role prompt |
| `planner` | Prometheus (`packages/omo-opencode/src/agents/prometheus/*`, `packages/prompts-core/prompts/prometheus/default.md`) | Local docs/superpowers plan path and writing-plans skill contract |
| `clarifier` | Metis (`packages/omo-opencode/src/agents/metis.ts`) | Local `clarifier` name, directives feed local planner instead of Prometheus |
| `plan-critic` | Momus (`packages/omo-opencode/src/agents/momus.ts`) | Local `plan-critic` name and inline-or-file plan review, blocker-focused only |

## Model-Family Prompt Mapping

| Local file | Upstream reference | Notes |
|------------|--------------------|-------|
| `deepwork/default.md` | local ocmm controller + upstream discipline concepts | v1 default is intentionally concise; omo default stays upstream-first; all workflows add shell-adaptation guidance so examples are translated to the active runtime shell |
| `deepwork/gpt.md` | `packages/prompts-core/prompts/ultrawork/gpt.md` | Upstream-first; local agent/tool names plus shell-adaptation guidance |
| `deepwork/gpt-5.6.md` | `packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts` and `packages/omo-codex/.../hephaestus/gpt-5.6.md` | GPT-5.6-only outcome-first, conditional-retrieval, evidence-first, and subagent-restraint layer; retains local authorization and tiered QA rules; also carries the global shell-adaptation guidance |
| `deepwork/gemini.md` | `packages/prompts-core/prompts/ultrawork/gemini.md` | Upstream-first; local agent/tool names plus shell-adaptation guidance |
| `deepwork/glm.md` | `packages/prompts-core/prompts/ultrawork/glm.md` | Upstream-first GLM reliability and evidence discipline plus shell-adaptation guidance |
| `deepwork/codex.md` | `packages/prompts-core/prompts/ultrawork/codex.md` | Upstream-first; Codex harness-only commands adapted to OpenCode/ocmm; command-lens wording is shell-neutral and uses the active runtime shell; synced through `./omo@c6058d5` TUI visual QA and command-lens updates |
| `deepwork/planner.md` | `packages/prompts-core/prompts/ultrawork/planner.md` and Prometheus prompt | Upstream-first planner doctrine with local planner naming and shell-adaptation guidance |

## Maintenance Rules

1. Any change under `prompts/omo/` that changes upstream-derived behavior must update this document.
2. Any change under `prompts/v1/` must update `docs/v1-maintenance.md`; if it changes upstream omo mapping, update this document too.
3. Keep local model-facing prompts on local role names: `reviewer`, `planner`, `clarifier`, `plan-critic`, and `orchestrator`.
4. Agent and category prompts should remain strongly aligned between `prompts/omo/` and `prompts/v1/`; the skill-driven workflow gets its distinct behavior from the deepwork layer and injected skills.
5. Category prompts must describe the work shape each category handles. Avoid routing language based on model strength, weak/strong labels, or vague difficulty tiers; say what kind of deliverable belongs in the category.
   Local mapping for upstream categories: `hard-reasoning` is the ultrabrain-style decision category; `deep` is autonomous system development and feature delivery; `coding` is determined code editing and bug fixing. `normal-task` absorbs bounded fallback work with known acceptance criteria; `complex` absorbs coordinated cross-cutting fallback work that remains below autonomous feature delivery.
6. Built-in defaults for categories at or above `coding` should use the highest supported reasoning level (`max` in the local variant vocabulary). `quick` remains the lightweight mechanical-edit category. Explicit user model/variant/parameter declarations are respected as written.
7. Compatibility aliases are intentional: upstream-style `@oracle` maps to local `reviewer`, and `@explore` maps to local `code-search`. Category names such as `@deep` and `@quick` are exposed directly as category-subagents.
8. Keep compatibility labels such as `workflow: "omo"` and `workflow: "v1"` unchanged unless a separate migration explicitly changes config semantics.
9. Do not expose `v1` as model-facing workflow wording. Files under `prompts/v1/` should say `deepwork` to the model; `v1` remains only a config/path label.
10. When syncing from upstream, compare against the local upstream checkout at `./omo` or a fresh checkout of the same repository, then re-apply local naming and OpenCode/ocmm tool semantics.
11. Shell-adaptation guidance is a local global invariant across every effective `deepwork/*` variant and every category prompt path: prompt/skill shell snippets are examples and must be translated to the active runtime shell. Category prompts carry the guidance directly because not every category runtime path inherits a deepwork layer.
12. GPT-5.6 subagent-restraint wording belongs only in `deepwork/gpt-5.6.md`; do not copy it into generic GPT/Gemini/GLM/Codex/default prompts.

## Last Upstream Prompt Check

- Source checked: local upstream checkout `./omo` at `17104e1` (2026-07-12 sync; v4.16.3 release is `d89f335`, with newer prompt work reviewed at the checked-out head; previous sync was `a7ac217aeeb7bd1f56c4633f4e92d97ec363f60f`).
- Prompt-relevant upstream changes since `c6058d5db`: Prometheus/planner prompt closed the implement-by-proxy loophole — "you never implement - not directly and not by proxy: a subagent you spawn that edits product code is you implementing ... no subagent you dispatch is ever that worker."
- Local sync: `prompts/omo/deepwork/planner.md` now closes the proxy loophole with ocmm-adapted wording (no `/start-work`; references local execution workflow handoff). The codex.md ultrawork changes (Sparkshell removal, TUI visual QA, Browser plugin, `/start-work` rename, implement-by-proxy) were already represented locally — no action needed.
- GPT-5.6 prompt-shape sync (2026-07-12): added `prompts/omo/deepwork/gpt-5.6.md`, selected only for the GPT-5.6 family. It adapts upstream outcome-first context gathering, explicit delegation outcomes, and evidence-first reporting while retaining OpenCode `task(...)`, local role names, tiered authorization, TDD, and QA semantics. The generic `gpt.md` remains unchanged.

## ocmm-Native Workflow Adaptation (2026-07-13)

Local adaptation of upstream omo workflow semantics into ocmm-native wording. Applied to `prompts/omo/**`, `prompts/v1/**`, `prompts/codex/**`, and the v1 skills. Not an upstream sync.

- **Discovery-before-planning**: every deepwork variant and the v1 `brainstorming` skill now require a first discovery wave (read files, search patterns, surface unknowns) before deciding decomposition or whether to invoke a planner.
- **Planner trigger**: planner/file-plan invocation is no longer step-count-based. Use a planner (and write a file-backed plan) only when the work is relatively complex, has a clear purpose, and after discovery still has unclear boundaries, dependencies, success criteria, or needs durable coordination. Clear-boundary work with a single obvious path uses a lightweight contextual plan instead.
- **Answer-when-answerable**: research/explanation requests must gather enough evidence to answer, then stop and answer. No extra research agents, subagents, or planning cycles once the evidence is sufficient.
- **Full-request scope**: deliver the full requested outcome by default. Removed default "minimum viable", "MVP", and phase-1 scope reduction language from clarifier prompts and deepwork scope constraints. Scope reduction only happens when the user explicitly asks for it or the work must be split.
- **Review/QA labels**: review findings are labeled `[product]` (proposed implementation/product change) or `[evidence]` (missing or insufficient proof). An `[evidence]` blocker requires additional evidence, not a product rewrite. Added to the v1 `requesting-code-review` and `subagent-driven-development` skills and to all deepwork variants (except the planner variant, which does not review).
- **GPT-5.6 restraint preserved**: `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` retains the existing GPT-5.6-specific subagent restraint. The new semantics above are expressed as general rules, not GPT-5.6-only rules.
- **Shell Adaptation preserved**: existing global Shell Adaptation guidance remains untouched across all variants.

## Observation-Only Upstream Items (2026-07-13)

The following upstream omo prompt/behavior items were reviewed and are intentionally recorded as observation-only. They are not implemented in this change and will only be reconsidered when a concrete trigger appears:

- **Polling/backoff mechanics (item 7)**: no polling/backoff guidance added to prompts or skills. Revisit if a task explicitly involves polling loops, retry/backoff design, or rate-limit handling.
- **Frontend layout-mechanics (item 8)**: no additional frontend layout mechanics guidance beyond the existing `frontend` skill. Revisit if a task explicitly involves CSS layout engine behavior, breakpoint mechanics, or visual QA beyond the current skill coverage.

## v1 Workflow Adjustment (2026-07-02)

- v1 brainstorming: step 2 restructured to ambiguity assessment + conditional `clarifier` consultation; step 7 spec approval made conditional (user delegation OR self-review ambiguity pass); HARD-GATE approval sources expanded to three (user approval / self-review pass / user delegation).
- v1 writing-plans: added mandatory plan-critic review loop after self-review with three-state verdict (`[REJECT]`/`[OKAY]`/`[OKAY-UNAMBIGUOUS]`); plan approval conditional (user delegation OR `[OKAY-UNAMBIGUOUS]`).
- v1 plan-critic: expanded binary output to three-state; added ambiguity assessment check; 80% threshold clarified as applying only to `[OKAY]` vs `[REJECT]`.
- Codex adapter (`prompts/codex/**`): deepwork prompts, orchestrator, and plan-critic mirrored the v1 conditional-approval semantics. Codex plan-critic also gained the three-state verdict.
- These changes are local v1/Codex workflow adjustments, not upstream omo prompt syncs. `prompts/omo/**` is unaffected.

## Oracle/Reviewer Separation + Acceptance Review Loop (2026-07-02)

- `oracle` promoted from pure `reviewer` alias to independent builtin agent: self-supervision semantics (reviews work the agent itself produced), cross-gen model default (claude-first chain), `promptSource: "reviewer"` (shares reviewer.md), `defaultAlias: "reviewer"` (inherits reviewer model config when user configures neither oracle model nor alias).
- `reviewer` semantics clarified: external review (code not produced by current agent), flagship model default (same family as main agent).
- Removed `oracle→reviewer` from `AGENT_ALIASES` (resolver.ts, plugin-generator.ts) and `COMPAT_AGENT_ALIASES` (config.ts) so oracle's cross-gen requirement is reachable; `AGENT_ALIASES` now only maps `explore→code-search`.
- Added generic `alias` config field to `ShorthandFields` (agent + category entries): inherits another agent's model `requirement` only (not prompt/permission/tools/skills), with cycle detection (hard error).
- Codex tier table: `reviewer` moved to Flagship, `oracle` added to Cross-gen review (with `plan-critic`).
- v1 requesting-code-review skill: added Reviewer Selection section (oracle default for simple, both oracle+reviewer for complex/large).
- v1 subagent-driven-development skill: added Final Acceptance Review stage.
- v1 + Codex orchestrator/deepwork prompts synced with oracle/reviewer duality and acceptance review guidance.
- These are local v1/Codex workflow adjustments; `prompts/omo/**` is unaffected.
