---
name: deepwork
description: "MUST USE when the user asks for deepwork-style planning, multi-agent execution, code review, research, or workflow routing inside Codex."
---

# Deepwork

This is the Codex adapter skill for deepwork. Use it to apply Deepwork's autonomous workflow semantics inside Codex while leaving the OpenCode plugin untouched.

## Runtime Mapping

- Use Codex `update_plan` for TodoWrite-style planning.
- Use Codex `multi_agent_v1.spawn_agent` when delegation is useful and available. Give each subagent a concrete, self-contained task and set `fork_context=false` unless the task genuinely needs inherited history.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex `apply_patch` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated `dw-*` agent TOML files from this plugin bundle's `agents/` directory as installable profiles when you want Deepwork role prompts as Codex agents. Resolve the directory relative to the installed plugin root, not a source checkout path.

## Workflow

Configured workflow: `codex`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching Deepwork role or generated `dw-*` Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify with the repository's own commands before reporting completion.

## Delegation

When a Deepwork role maps to a generated agent, spawn the exact Codex agent type or mention the exact subagent link. Do not simulate the role with a prompt such as "Act as Deepwork plan-critic"; that starts a generic subagent and will not load the generated profile.

- Plan review: `[@dw-plan-critic](subagent://dw-plan-critic)` or `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", fork_context=false, message="Review the plan at <path>.")`
- Code/work review: `[@dw-reviewer](subagent://dw-reviewer)` or `multi_agent_v1.spawn_agent(agent_type="dw-reviewer", fork_context=false, message="<bounded review task>")`
- Self-supervision: `[@dw-oracle](subagent://dw-oracle)` or `multi_agent_v1.spawn_agent(agent_type="dw-oracle", fork_context=false, message="<specific verification task>")`

The `dw-*` agent profile is the load-bearing selector. Never replace it with only a model or reasoning override; doing so creates a generic subagent that lacks the Deepwork role prompt. If only Codex built-in agent types are visible, install the generated TOML files from this bundle's `agents/` directory into project `.codex/agents/` or personal `~/.codex/agents/`, then restart or refresh the Codex thread so the custom agent registry is rebuilt.

## Generated Agents

| Codex agent | Model | Effort | Deepwork source |
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
| dw-oracle | gpt-5 | high | oracle |
| dw-orchestrator | gpt-5.5 | high | orchestrator |
| dw-plan-critic | gpt-5.5 | xhigh | plan-critic |
| dw-planner | gpt-5.5 | high | planner |
| dw-quick | gpt-5.4-mini | high | quick |
| dw-research | gpt-5.5 | high | research |
| dw-reviewer | gpt-5.5 | high | reviewer |

## Runtime Model Selection

When spawning a subagent via `multi_agent_v1.spawn_agent`, omit `model` and `reasoning_effort` by default so Codex can apply the selected `dw-*` profile. Add model or effort overrides only when you can still set the exact `agent_type` and there is a clear task-specific reason.

### Tier assignments

| Tier | Agents | Model | Effort |
|---|---|---|---|
| Flagship | dw-orchestrator, dw-planner, dw-builder, dw-clarifier, dw-deep, dw-hard-reasoning, dw-reviewer | Latest-gen flagship | xhigh |
| Mid | dw-complex, dw-normal-task, dw-coding, dw-research, dw-frontend, dw-creative, dw-documenting, dw-media-reader, dw-doc-search | Latest-gen mid-tier at max, else flagship at high | max or high |
| Mini | dw-quick, dw-code-search, dw-explore | Latest-gen mini | high |
| Cross-gen review | dw-oracle, dw-plan-critic | Previous-gen flagship | xhigh |

### Model tier definitions

- **Flagship**: the most capable model of the latest generation (e.g., gpt-5.5 in the 5.x gen).
- **Mid-tier**: a lighter-but-capable model within the latest generation. If the latest gen has no mid-tier, use the flagship at `high` effort instead.
- **Mini**: the smallest/cheapest model of the latest generation (e.g., `-mini` variants).
- **Previous-gen flagship**: the flagship of the previous generation (e.g., gpt-5.4 when gpt-5.5 is current).

### Cross-generation review rule

dw-oracle and dw-plan-critic should use a **different generation** from the planner/orchestrator to provide independent review perspective. Oracle reviews work the agent itself produced (self-supervision); reviewer reviews code not produced by the current agent (external review). If the main model is the latest flagship, the cross-gen reviewer uses the previous-gen flagship at xhigh. If only one generation is available, use the same flagship at xhigh.

### Example (gpt-5.x generation — verify against your available models)

| Tier | Example model | Effort |
|---|---|---|
| Flagship | gpt-5.5 | xhigh |
| Mid (with 5.4 available) | gpt-5.4 | max |
| Mid (no 5.4) | gpt-5.5 | high |
| Mini | gpt-5.4-mini | high |
| Cross-gen review | gpt-5.4 | xhigh |
