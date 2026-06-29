# Codex Runtime Model Selection Design

## Goal

Add runtime model selection guidance to the Codex plugin's `deepwork` workflow skill, so the main agent can dynamically choose models for spawned subagents based on a tiered strategy. The agent TOML files retain static default models as fallback, but the workflow skill instructs the main agent to override `model` + `reasoning_effort` parameters via `multi_agent_v1.spawn_agent`.

## Background

### Current state

- `gen:codex-plugin` generates agent TOML files with static `model` + `model_reasoning_effort` per `dw-*` agent (via `selectCodexModel` + `codexReasoningEffort`).
- `renderWorkflowSkill` (`src/codex/plugin-generator.ts:395-431`) generates the `deepwork` SKILL.md with a Runtime Mapping section, Workflow steps, and a Generated Agents table.
- All 21 `dw-*` agents currently bind to `gpt-5.5` (main agents) or `gpt-5.4-mini(-fast)` (utility agents).
- `selectCodexModel` picks the first Codex-compatible model from the agent's fallback chain; `codexReasoningEffort` maps variant→reasoning_effort.

### Codex `spawn_agent` supports runtime override

Codex's `SpawnAgentArgs` struct includes:
- `model: Option<String>` — overrides the agent's static model
- `reasoning_effort: Option<ReasoningEffort>` — overrides the agent's static effort

This means the main agent (orchestrator) can dynamically select models when spawning subagents, overriding the TOML defaults.

### Limitation of current static binding

- All agents bind to the same generation's models (currently gpt-5.5 / gpt-5.4-mini).
- No differentiation between task complexity tiers — a quick task and a hard-reasoning task both use the same flagship model.
- Reviewer/plan-critic use the same model as the orchestrator/planner they review, creating same-generation bias.
- Upgrading to a new model generation requires regenerating the plugin with new config.

## Design

### Tiered model strategy

Three tiers + one special rule. The skill text describes the strategy abstractly (no hardcoded version numbers), with a reference table showing the current generation as an example.

| Tier | Agent categories | Model selection logic | reasoning_effort |
|---|---|---|---|
| **Flagship** | orchestrator, planner, builder, clarifier, deep, hard-reasoning | Latest generation's flagship model | xhigh |
| **Mid** | complex, normal-task, coding, research, frontend, creative, documenting, media-reader, doc-search | Latest generation's mid-tier model at max effort; if no mid-tier exists in the latest gen, use flagship at high effort | max (mid-tier) or high (flagship) |
| **Mini** | quick, code-search, explore | Latest generation's mini model | high |
| **Cross-gen review** | reviewer, plan-critic | Use a previous-generation flagship at xhigh. If only one generation is available, use the current flagship at xhigh. | xhigh |

### Model tier definitions (abstract)

The skill text will use abstract tier descriptions rather than hardcoded version numbers:

- **Flagship model**: The most capable model of the latest available generation (e.g., the "5.5" in the 5.x generation, the "6" in the 6.x generation).
- **Mid-tier model**: A capable but lighter model within the latest generation (e.g., a "mini" or "lite" variant that is still a full-capability model, not a stripped-down mini). If the latest generation only has one model tier, the mid-tier falls back to the flagship.
- **Mini model**: The smallest/cheapest model of the latest generation (e.g., "mini" variants).
- **Previous-gen flagship**: The flagship model of the previous generation (e.g., "5.4" when "5.5" is current).

The main agent determines which models belong to which tier by inspecting the available model list (from the provider's model catalog or the Generated Agents table). The skill provides guidance, not hardcoded IDs.

### Reference table (example, not authoritative)

The skill text includes a reference table showing the current generation as an example, explicitly marked as "verify against available models":

```
Example (gpt-5.x generation, verify against your available models):
| Tier | Model (example) | effort |
|---|---|---|
| Flagship | gpt-5.5 | xhigh |
| Mid (if gpt-5.4 exists) | gpt-5.4 max, else gpt-5.5 high | max or high |
| Mini | gpt-5.4-mini | high |
| Cross-gen review | gpt-5.4 (previous flagship) | xhigh |
```

### Changes to `renderWorkflowSkill`

Add a new "Runtime Model Selection" section after the Generated Agents table:

```markdown
## Runtime Model Selection

When spawning a subagent via `multi_agent_v1.spawn_agent`, select the model and
reasoning_effort based on the agent's tier. The static model in the agent's TOML
is a fallback default; override it when the task warrants a different tier.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning | Latest gen flagship | xhigh |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Latest gen mid-tier at max, else flagship at high | max or high |
| Mini | dw-quick, dw-code-search, dw-explore | Latest gen mini | high |
| Cross-gen review | dw-reviewer, dw-plan-critic | Previous gen flagship | xhigh |

### Model tier definitions

- **Flagship**: the most capable model of the latest generation (e.g., gpt-5.5 in the 5.x gen).
- **Mid-tier**: a lighter-but-capable model within the latest generation. If the latest gen has no mid-tier, use the flagship at `high` effort instead.
- **Mini**: the smallest/cheapest model of the latest generation (e.g., `-mini` variants).
- **Previous-gen flagship**: the flagship of the previous generation (e.g., gpt-5.4 when gpt-5.5 is current).

### Cross-generation review rule

dw-reviewer and dw-plan-critic should use a **different generation** from the
planner/orchestrator to provide independent review perspective. If the main
model is the latest flagship, the reviewer uses the previous-gen flagship at
xhigh. If only one generation is available, use the same flagship at xhigh.

### Example (gpt-5.x generation — verify against your available models)

| Tier | Example model | effort |
|---|---|---|
| Flagship | gpt-5.5 | xhigh |
| Mid (with 5.4 available) | gpt-5.4 max | max |
| Mid (no 5.4) | gpt-5.5 high | high |
| Mini | gpt-5.4-mini | high |
| Cross-gen review | gpt-5.4 | xhigh |
```

### Changes to agent TOML `developer_instructions`

In `codexAgentInstructions` (L433-454), add a note about runtime model override:

```ts
"- The model and reasoning_effort in your profile are defaults. The main agent may override them via spawn_agent's model and reasoning_effort parameters when spawning you."
```

This tells each agent that its static model is not fixed — the orchestrator can choose differently.

### What does NOT change

- `selectCodexModel` and `codexReasoningEffort` — unchanged. The static model in agent TOML remains as fallback default.
- `buildCodexAgents` — unchanged. Agent specs still carry the static model.
- OpenCode plugin — completely unaffected. This is Codex-only.
- Agent TOML structure — `model` and `model_reasoning_effort` fields still present (Codex requires them), just supplemented by skill guidance.

## Scope

### Files to change

| File | Change |
|---|---|
| `src/codex/plugin-generator.ts` | Add "Runtime Model Selection" section to `renderWorkflowSkill`; add model-override note to `codexAgentInstructions` |
| `src/codex/plugin-generator.test.ts` | Add tests verifying the new section exists in the workflow skill |
| `docs/v1-maintenance.md` | No change needed — Codex plugin generator is not a v1 skill or prompt file |

### Verification

- `renderWorkflowSkill` output contains "Runtime Model Selection", "Tier assignments", "Cross-generation review rule" section markers.
- `codexAgentInstructions` output contains "main agent may override" note.
- All existing tests still pass.
- Regenerated plugin (`gen:codex-plugin`) includes the new section in `plugins/ocmm/skills/deepwork/SKILL.md`.

## Risks

- **Main agent may not follow the guidance**: The skill text is advisory, not enforced. The main agent might ignore the tier assignments and use the TOML defaults. Mitigation: the section is prominently placed and uses MUST language. If behavior is insufficient, a future enhancement could generate per-agent TOML variants.
- **Model availability detection**: The main agent must infer which models are flagship/mid/mini from the available model list. If the provider's model naming is ambiguous, the agent may misclassify. Mitigation: the reference table provides concrete examples for the current generation.
- **Previous-gen availability**: If only one generation is available (e.g., at a new gen launch), the cross-gen rule falls back to same-gen xhigh. This is handled in the skill text.

## YAGNI

Not in this design:
- No code to detect available models at gen:codex-plugin time (the skill text guides the runtime agent, not the build tool).
- No changes to `selectCodexModel` or static model binding (kept as fallback).
- No changes to OpenCode plugin.
- No new config fields for model tier definitions (the strategy is hardcoded in the skill text, not configurable).
- No per-project model tier overrides (future enhancement if needed).
