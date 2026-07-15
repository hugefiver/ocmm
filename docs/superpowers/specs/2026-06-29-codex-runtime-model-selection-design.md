# Codex Runtime Model Selection Design

## Goal

Add runtime model selection guidance to the Codex plugin's `deepwork` workflow skill, so the main agent can dynamically choose models for spawned subagents based on a tiered strategy. The agent TOML files retain static default models as fallback, but the workflow skill instructs the main agent to override `model` + `reasoning_effort` parameters via `multi_agent_v1.spawn_agent`.

## Background

### Current state

- `gen:codex-plugin` generates agent TOML files with static `model` + `model_reasoning_effort` per `dw-*` agent (via `selectCodexModel` + `codexReasoningEffort`).
- `renderWorkflowSkill` (`src/codex/plugin-generator.ts:395-431`) generates the `deepwork` SKILL.md with a Runtime Mapping section, Workflow steps, and a Generated Agents table.
- Generated `dw-*` agents currently bind to configured default models by role tier.
- `selectCodexModel` picks the first Codex-compatible model from the agent's fallback chain; `codexReasoningEffort` maps variant→reasoning_effort.

### Codex `spawn_agent` supports runtime override

Codex's `SpawnAgentArgs` struct includes:
- `model: Option<String>` — overrides the agent's static model
- `reasoning_effort: Option<ReasoningEffort>` — overrides the agent's static effort

This means the main agent (orchestrator) can dynamically select models when spawning subagents, overriding the TOML defaults.

### Limitation of current static binding

- Agent defaults do not yet express role-specific tier selection clearly enough.
- No differentiation between task complexity tiers — a quick task and a hard-reasoning task both use the same primary reasoning lane.
- Reviewer/plan-critic can use the same configured lane as the work they review, creating insufficiently independent review bias.
- Upgrading to a new model generation requires regenerating the plugin with new config.

## Design

### Tiered model strategy

Three tiers + one special rule. The skill text describes the strategy abstractly, without hardcoded provider or generation requirements.

| Tier | Agent categories | Model selection logic | reasoning_effort |
|---|---|---|---|
| **Flagship** | orchestrator, planner, builder, clarifier, deep, hard-reasoning | Primary reasoning lane chosen from explicit configuration and the available catalog | xhigh-equivalent minimum; GPT-5.6 native max when requested |
| **Mid** | complex, normal-task, coding, research, frontend, creative, documenting, media-reader, doc-search | Configured lighter-capable lane at max effort; if unavailable, use the primary reasoning lane at high effort | max (lighter-capable lane) or high (primary reasoning lane) |
| **Mini** | quick, code-search, explore | Configured low-cost lane from the available catalog | high |
| **External review / cross-check / plan review** | reviewer, oracle, oracle-high, plan-critic | Use the primary reasoning lane for external review and plan review; use configured heterogeneous/cross-check review lanes for oracle. Add supplemental review only when explicitly configured, available, and not disabled. | xhigh-equivalent minimum; GPT-5.6 native max when requested |

### Model tier definitions (abstract)

The skill text will use abstract tier descriptions rather than hardcoded version numbers:

- **Primary reasoning lane**: The strongest configured reasoning-capable lane available for the role. Concrete model names are references only; explicit configuration and the current catalog decide the actual model.
- **Mid-tier model**: A capable but lighter configured model. If the catalog/configuration has no such lane, use the primary reasoning lane at `high` effort instead.
- **Mini model**: The configured low-cost model lane for quick lookup and lightweight code search.
- **Cross-check review lane**: A configured heterogeneous review model that avoids same-model confirmation bias. It is selected from the available catalog/configuration, not from hardcoded provider generations.

The main agent determines which models belong to which tier by inspecting the available model list (from the provider's model catalog or the Generated Agents table). The skill provides guidance, not hardcoded IDs.

### Reference table (example, not authoritative)

The skill text includes a provider-neutral reference table, explicitly marked as "verify against configured models":

```
Example (verify against configured models):
| Tier | Model (example) | effort |
|---|---|---|
| Primary reasoning lane | configured reasoning model | xhigh-equivalent minimum; GPT-5.6 native max when requested |
| Mid | configured lighter-capable model, else primary reasoning lane | max or high |
| Mini | configured low-cost model | high |
| Cross-check review | configured heterogeneous review lane | xhigh-equivalent minimum |
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
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning | Primary reasoning lane from explicit configuration and available catalog | xhigh-equivalent minimum; GPT-5.6 native max when requested |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Configured lighter-capable lane at max, else primary reasoning lane at high | max or high |
| Mini | dw-quick, dw-code-search, dw-explore | Configured low-cost lane | high |
| External review / cross-check / plan review | dw-reviewer, dw-oracle, dw-oracle-high, dw-plan-critic | Primary reasoning lane for external review and plan review; configured cross-check lane for oracle; supplemental review only when explicitly configured, available, and not disabled | xhigh-equivalent minimum; GPT-5.6 native max when requested |

### Model tier definitions

- **Flagship / primary reasoning lane**: the strongest configured reasoning-capable model available for the role; example model names are not requirements.
- **Mid-tier**: a lighter-but-capable configured model. If unavailable, use the primary reasoning lane at `high` effort instead.
- **Mini**: the configured low-cost model lane.
- **Cross-check review lane**: a configured heterogeneous review model selected from available catalog/configuration.

### Independent review rule

dw-oracle provides independent review perspective through the configured
cross-check lane. dw-reviewer and dw-plan-critic use the primary reasoning lane
with an xhigh-equivalent minimum, and GPT-5.6-capable selected models may use
native max when maximum verification is requested.

### Example (verify against configured models)

| Tier | Example model | effort |
|---|---|---|
| Flagship | configured primary reasoning lane | xhigh-equivalent minimum; native max on max-capable selected models when requested |
| Mid | configured lighter-capable lane | max when supported, else high |
| Mini | configured low-cost lane | high |
| Cross-check review | configured heterogeneous review lane | xhigh-equivalent minimum |
```

### Changes to agent TOML `developer_instructions`

In `codexAgentInstructions` (L433-454), add a note about runtime model override:

```ts
"- The model and reasoning_effort in your profile are defaults. The main agent may override them via spawn_agent's model and reasoning_effort parameters when spawning you."
```

This tells each agent that its static model is not fixed — the orchestrator can choose differently.

### What does NOT change

- `selectCodexModel` — unchanged. The static model in agent TOML remains as fallback default.
- `codexReasoningEffort` — updated separately by later reasoning-floor work to gate unsupported GPT-like/Codex-like `max` to `xhigh` and to floor review/plan-review agents.
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

- `renderWorkflowSkill` output contains "Runtime Model Selection", "Tier assignments", "Independent review rule" section markers.
- `codexAgentInstructions` output contains "main agent may override" note.
- All existing tests still pass.
- Regenerated plugin (`gen:codex-plugin`) includes the new section in `plugins/deepwork/skills/deepwork/SKILL.md`.

## Risks

- **Main agent may not follow the guidance**: The skill text is advisory, not enforced. The main agent might ignore the tier assignments and use the TOML defaults. Mitigation: the section is prominently placed and uses MUST language. If behavior is insufficient, a future enhancement could generate per-agent TOML variants.
- **Model availability detection**: The main agent must infer which configured models map to primary, mid, mini, and cross-check lanes from the available model list. If model naming is ambiguous, explicit user configuration should win over inferred tiers.
- **Cross-check availability**: If no independent cross-check lane is configured or available, review guidance falls back to the available configured review lane with an xhigh-equivalent floor rather than requiring a specific generation.

## YAGNI

Not in this design:
- No code to detect available models at gen:codex-plugin time (the skill text guides the runtime agent, not the build tool).
- No changes to `selectCodexModel` or static model binding (kept as fallback).
- No changes to OpenCode plugin.
- No new config fields for model tier definitions (the strategy is hardcoded in the skill text, not configurable).
- No per-project model tier overrides (future enhancement if needed).
