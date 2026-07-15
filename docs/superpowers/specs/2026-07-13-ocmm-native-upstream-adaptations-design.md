# ocmm-native upstream adaptations design

## Goal

Adapt selected upstream `omo` workflow improvements into ocmm's own OpenCode and Codex workflows without wholesale prompt copying. The change should improve planning discipline, answer/research efficiency, scope fidelity, review/QA feedback quality, Codex multi-agent compatibility, and configured review diversity while preserving ocmm's existing approval, shell-adaptation, subagent-depth, and verification contracts.

## Scope

This design includes:

- Discovery before planning, integrated into the existing v1 brainstorming flow rather than replacing it.
- Planner trigger semantics that favor relatively complex tasks with clear purpose, while allowing lightweight contextual plans when boundaries and flow are already clear.
- Answer-when-answerable behavior for explanation/research tasks.
- Full-request scope default and removal of MVP/minimum-viable narrowing language unless the user asks for decomposition or the task is genuinely too large.
- Narrower automatic review gate wording, keeping mandatory review for complex, security/performance, release, or user-requested review cases.
- `[product]` / `[evidence]` QA and review blocker classification.
- Codex plugin workflow guidance for MultiAgentV2-compatible tool names while preserving fallback behavior for existing task/subagent tooling.
- GPT-5.6-primary review policy: preserve oracle/cross-check diversity through configured heterogeneous review lanes, while allowing GPT-5.6 native `max` for the primary review lane.
- Codex guidance for complex multi-module tasks to allow three-review cross-validation only when the supplemental `oracle-high` review profile is explicitly configured, available in the current catalog/dispatch surface, and not disabled.

This design explicitly excludes:

- Polling/background backoff protocol migration.
- Frontend layout-mechanics migration.
- Senpi/team-task runtime infrastructure.
- Replacing OpenCode `task` semantics with Codex MultiAgentV2 runtime behavior.
- A release/version bump.

## Workflow behavior

### Discovery before planning

The v1 `brainstorming` skill already starts by exploring project context. This change makes the first discovery wave explicitly precede decomposition and planner decisions: inspect the project state, existing patterns, relevant docs, and recent changes before deciding whether the work needs decomposition or a planner. The HARD-GATE remains unchanged: no implementation before design approval.

### Planner trigger semantics

Planner use should not be based on a raw step count alone. The new rule is:

- Use the planner for relatively complex tasks with a clear purpose, especially multi-surface work, cross-module changes, migrations, integrations, or tasks with dependencies.
- If the goal is clear and the boundaries/flow are also clear, a lightweight contextual plan in the conversation is sufficient; do not force a file-backed plan only because the task has multiple mechanical steps.
- If boundaries, decomposition, dependency order, or success criteria remain unclear after discovery, use a file-backed plan and the existing plan-critic receipt loop.

This preserves ocmm's `writing-plans` skill for work that actually needs durable decomposition while reducing ceremony for clear bounded work.

### Answer-when-answerable

Research and explanation tasks should stop once the evidence is enough to answer the user's question. Additional web fetches, subagents, plan documents, or review loops should not run after the answer is already supported, unless the user asked for exhaustive coverage or the result affects implementation/release risk.

### Full-request scope default

Agents should assume the user wants the full requested outcome. They should not proactively reduce scope to “MVP”, “phase 1”, or “minimum viable” unless the user asks for that framing or the request is too large and must be decomposed. “Must not” constraints should prevent additions and scope creep, not quietly remove requested behavior.

### Review and QA feedback classification

Review and QA feedback should distinguish:

- `[product]`: the product behavior, contract, security/performance property, or user-visible acceptance criterion fails.
- `[evidence]`: the implementation may be correct, but the proof is missing, insufficient, stale, or presented in the wrong artifact/format.

This classification should guide loops: product blockers require code or prompt behavior changes; evidence blockers require additional verification or clearer proof. Evidence-only blockers should not be treated as product defects.

## Prompt surfaces

The changes should be reflected in both OpenCode and Codex prompt families:

- `prompts/{omo,v1,codex}/deepwork/gpt.md`
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md`
- `prompts/{omo,v1,codex}/deepwork/gemini.md`
- `prompts/{omo,v1,codex}/deepwork/glm.md`
- `prompts/{omo,v1,codex}/deepwork/codex.md`
- `prompts/{omo,v1,codex}/deepwork/planner.md`
- `prompts/{omo,v1,codex}/deepwork/default.md` where the generic wording exists
- `prompts/{omo,v1,codex}/agents/clarifier.md` where scope-narrowing language appears
- v1 skills that define workflow mechanics, especially `skills/v1/brainstorming/SKILL.md`, `skills/v1/writing-plans/SKILL.md`, `skills/v1/requesting-code-review/SKILL.md`, and `skills/v1/subagent-driven-development/SKILL.md`

The implementation should preserve existing local additions, including global shell adaptation and GPT-5.6 subagent restraint.

## Codex MultiAgentV2 compatibility

The generated Codex workflow skill should document both surfaces:

- Existing/legacy task-style delegation remains valid for current ocmm/OpenCode compatibility.
- When Codex exposes MultiAgentV2 flat tools, map ocmm concepts to those tools: `spawn_agent` for new agents, `wait_agent` for waiting, `followup_task` for continuing an agent, `interrupt_agent` for stopping, and `fork_turns` for branch-style exploration if available.

This is prompt compatibility only. It does not add runtime wrappers or attempt to emulate Codex MultiAgentV2 inside OpenCode.

## GPT review diversity policy

When GPT-5.6 is the primary model family, the primary review lane can request native `max` directly. The oracle/cross-check lane should remain independent enough to reduce same-model confirmation risk. Its default preference should be described in provider-neutral terms:

1. Prefer explicitly configured heterogeneous oracle/cross-check entries from the available catalog.
2. Use supplemental same-lane checks only when explicitly configured or when no better heterogeneous/cross-check option is available.
3. Preserve non-primary review entries that provide independent perspective unless tests show a conflict.

For Codex complex multi-module work, generated workflow guidance should allow three-review cross-validation only when the supplemental review profile is explicitly enabled:

- reviewer on the primary reasoning lane, using GPT-5.6 native `max` when GPT-5.6 is the selected review model and maximum reasoning is requested,
- oracle/cross-check on the configured heterogeneous review lane,
- oracle-high on the supplemental high-effort review lane only when explicitly configured by user/profile, available in the current catalog/dispatch surface, and not disabled.

This is expressed in model fallback data and Codex prompt guidance. Built-in or generated-profile existence alone must not force three reviewers for every task.

## Observation-only upstream candidates

The upstream polling/background backoff protocol and frontend layout-mechanics rules are intentionally not implemented in this change. They should be recorded in sync documentation as observation items only:

- Polling/background backoff becomes actionable only if ocmm repeatedly sees background-agent wait loops, rate-limit churn, or stale polling failures.
- Frontend layout-mechanics becomes actionable only in a dedicated frontend skill evaluation, because it touches visual/layout heuristics outside this prompt/model-routing change.

## Data and generation flow

- Default OpenCode model behavior is driven by `src/data/agents.ts` fallback chains and runtime matching in `src/routing/*`.
- Codex generated profiles and workflow text are produced by `src/codex/plugin-generator.ts` and must be regenerated with `pnpm run build:ts` followed by `pnpm run gen:codex-plugin`.
- Prompt sync docs must be updated: `docs/prompt-sync.md` for omo/codex prompt adaptations and `docs/v1-maintenance.md` for v1 prompt/skill changes.

## Testing and verification

Tests should prove:

- Prompt-loader real prompt paths include the new planner/scope/answer/review/QA contracts where applicable.
- Prompt-loader tests check every effective `deepwork/*` variant per workflow, including `gpt-5.6.md`, rather than relying only on an aggregate prompt string.
- Clarifier prompts no longer encourage MVP/minimum-viable narrowing by default.
- Reviewer/oracle fallback chains reflect configured heterogeneous review diversity while preserving GPT-5.6 native `max` for primary review when requested.
- Codex workflow skill includes MultiAgentV2 compatibility wording and the explicitly configured `oracle-high` three-review gate.
- Generated Codex bundles are synchronized after prompt/code changes.

Verification should include targeted tests for prompt loader, routing/config/generator behavior, `pnpm run typecheck`, `pnpm test` with local `OCMM_PROFILE` cleared, `pnpm run build:ts`, `pnpm run gen:codex-plugin`, and `git diff --check`.
