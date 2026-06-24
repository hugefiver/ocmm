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

Configured workflow: `omo`

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
