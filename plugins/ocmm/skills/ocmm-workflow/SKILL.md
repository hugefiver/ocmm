---
name: ocmm-workflow
description: "MUST USE when the user asks for ocmm/deepwork-style planning, multi-agent execution, code review, research, or workflow routing inside Codex."
---

# ocmm Workflow

This is the Codex adapter skill for ocmm. Use it to apply ocmm's autonomous workflow semantics inside Codex while leaving the OpenCode plugin untouched.

## Runtime Mapping

- Use Codex `update_plan` for TodoWrite-style planning.
- Use Codex `multi_agent_v1.spawn_agent` when delegation is useful and available. Give each subagent a concrete, self-contained task and set `fork_context=false` unless the task genuinely needs inherited history.
- Use Codex MCP tools exposed by this plugin for docs/search/context where available.
- Use Codex `apply_patch` for manual edits; use shell commands for read-only inspection and project verification.
- Use generated agent TOML files under `plugins/ocmm/agents/` as installable profiles when you want ocmm role prompts as Codex agents.

## Workflow

Configured workflow: `omo`

1. Classify the request into quick, normal-task, coding, complex, deep, research, frontend, hard-reasoning, creative, or documenting.
2. Select the matching ocmm role or generated Codex agent.
3. Load task-relevant skills explicitly before doing specialized work.
4. Verify with the repository's own commands before reporting completion.

## Generated Agents

| Codex agent | Model | Effort | ocmm source |
|---|---|---|---|
| ocmm-builder | gpt-5.5 | high | builder |
| ocmm-clarifier | gpt-5.5 | high | clarifier |
| ocmm-code-search | gpt-5.4-mini-fast | high | code-search |
| ocmm-coding | gpt-5.5 | high | coding |
| ocmm-complex | gpt-5.5 | high | complex |
| ocmm-creative | gpt-5.5 | high | creative |
| ocmm-deep | gpt-5.5 | high | deep |
| ocmm-doc-search | gpt-5.4-mini-fast | high | doc-search |
| ocmm-documenting | gpt-5.5 | high | documenting |
| ocmm-explore | gpt-5.4-mini-fast | high | explore |
| ocmm-frontend | gpt-5.5 | high | frontend |
| ocmm-hard-reasoning | gpt-5.5 | xhigh | hard-reasoning |
| ocmm-media-reader | gpt-5.5 | high | media-reader |
| ocmm-normal-task | gpt-5.5 | high | normal-task |
| ocmm-oracle | gpt-5.5 | high | oracle |
| ocmm-orchestrator | gpt-5.5 | high | orchestrator |
| ocmm-plan-critic | gpt-5.5 | xhigh | plan-critic |
| ocmm-planner | gpt-5.5 | high | planner |
| ocmm-quick | gpt-5.4-mini | high | quick |
| ocmm-research | gpt-5.5 | high | research |
| ocmm-reviewer | gpt-5.5 | high | reviewer |
