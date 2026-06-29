---
name: deepwork
description: "MUST USE when the user asks for deepwork-style planning, multi-agent execution, code review, research, or workflow routing inside Codex."
---

# Deepwork

This is the Codex adapter skill for deepwork. Use it to apply ocmm's autonomous workflow semantics inside Codex while leaving the OpenCode plugin untouched.

## Runtime Mapping

- Use Codex `update_plan` for TodoWrite-style planning.
- Use Codex `multi_agent_v1.spawn_agent` when delegation is useful and available. Give each subagent a concrete, self-contained task and set `fork_context=false` unless the task genuinely needs inherited history.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex `apply_patch` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated `dw-*` agent TOML files under `plugins/ocmm/agents/` as installable profiles when you want ocmm role prompts as Codex agents.

## Workflow

Configured workflow: `v1`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching ocmm role or generated `dw-*` Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify with the repository's own commands before reporting completion.

## Generated Agents

| Codex agent | Model | Effort | ocmm source |
|---|---|---|---|
| dw-builder | gpt-5.5 | high | builder |
| dw-clarifier | gpt-5.5 | high | clarifier |
| dw-code-search | gpt-5.4-mini-fast | high | code-search |
| dw-coding | gpt-5.5 | high | coding |
| dw-complex | gpt-5.5 | high | complex |
| dw-creative | gpt-5.5 | high | creative |
| dw-deep | gpt-5.5 | high | deep |
| dw-doc-search | gpt-5.4-mini-fast | high | doc-search |
| dw-documenting | gpt-5.5 | high | documenting |
| dw-explore | gpt-5.4-mini-fast | high | explore |
| dw-frontend | gpt-5.5 | high | frontend |
| dw-hard-reasoning | gpt-5.5 | xhigh | hard-reasoning |
| dw-media-reader | gpt-5.5 | high | media-reader |
| dw-normal-task | gpt-5.5 | high | normal-task |
| dw-oracle | gpt-5.5 | high | oracle |
| dw-orchestrator | gpt-5.5 | high | orchestrator |
| dw-plan-critic | gpt-5.5 | xhigh | plan-critic |
| dw-planner | gpt-5.5 | high | planner |
| dw-quick | gpt-5.4-mini | high | quick |
| dw-research | gpt-5.5 | high | research |
| dw-reviewer | gpt-5.5 | high | reviewer |

## Runtime Model Selection

When spawning a subagent via `multi_agent_v1.spawn_agent`, select the model and `reasoning_effort` based on the agent's tier. The static model in the agent's TOML is a fallback default; override it via the `model` and `reasoning_effort` parameters of `spawn_agent`.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning | Latest-gen flagship | xhigh |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Latest-gen mid-tier at max, else flagship at high | max or high |
| Mini | dw-quick, dw-code-search, dw-explore | Latest-gen mini | high |
| Cross-gen review | dw-reviewer, dw-plan-critic | Previous-gen flagship | xhigh |

### Model tier definitions

- **Flagship**: the most capable model of the latest generation (e.g., gpt-5.5 in the 5.x gen).
- **Mid-tier**: a lighter-but-capable model within the latest generation. If the latest gen has no mid-tier, use the flagship at `high` effort instead.
- **Mini**: the smallest/cheapest model of the latest generation (e.g., `-mini` variants).
- **Previous-gen flagship**: the flagship of the previous generation (e.g., gpt-5.4 when gpt-5.5 is current).

### Cross-generation review rule

dw-reviewer and dw-plan-critic should use a **different generation** from the planner/orchestrator to provide independent review perspective. If the main model is the latest flagship, the reviewer uses the previous-gen flagship at xhigh. If only one generation is available, use the same flagship at xhigh.

### Example (gpt-5.x generation — verify against your available models)

| Tier | Example model | Effort |
|---|---|---|
| Flagship | gpt-5.5 | xhigh |
| Mid (with 5.4 available) | gpt-5.4 | max |
| Mid (no 5.4) | gpt-5.5 | high |
| Mini | gpt-5.4-mini | high |
| Cross-gen review | gpt-5.4 | xhigh |
