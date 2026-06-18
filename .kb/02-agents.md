# Agent Identities and Fallback Chains

OMO ships 11 agents. OCMM keeps the same identity model: each agent has a preferred first-pick model and a fallback chain used when the first pick is unavailable.

## Agent table

| Agent | First pick | Variant | Fallback chain (truncated) | Notes |
|---|---|---|---|---|
| `orchestrator` | `anthropic/claude-opus-4-7` | `max` | kimi-k2.6 → kimi-k2p5 → kimi-k2.5 → gpt-5.5/medium → glm-5 → big-pickle | Orchestrator. `requiresAnyModel: true` (cannot fail to resolve). |
| `worker` | `openai/gpt-5.5` | `medium` | (provider-restricted: openai/copilot/venice/opencode/vercel) | Autonomous worker. `requiresProvider`: GPT-only. |
| `reviewer` | `openai/gpt-5.5` | `high` | gemini-3.1-pro/high → claude-opus-4-7/max → glm-5.1 | Read-only consultant for hard problems. |
| `doc-search` | `openai/gpt-5.4-mini-fast` | _(none)_ | qwen3.5-plus → minimax-m2.7-highspeed → minimax-m3 → minimax-m2.7 → claude-haiku-4-5 → gpt-5.4-nano | External docs/OSS search. Cheap. |
| `explore` | `openai/gpt-5.4-mini-fast` | _(none)_ | (same as doc-search) | Internal codebase grep helper. Cheap. |
| `media-reader` | `openai/gpt-5.5` | `medium` | kimi-k2.6 → glm-4.6v → gpt-5-nano | Vision/PDF/diagram interpretation. |
| `planner` | `anthropic/claude-opus-4-7` | `max` | gpt-5.5/high → glm-5.1 → gemini-3.1-pro | Plan agent (coordinator, blocked from delegation). |
| `clarifier` | `anthropic/claude-sonnet-4-6` | _(none)_ | claude-opus-4-7/max → gpt-5.5/high → glm-5.1 → kimi-k2p5 | Pre-planning consultant. |
| `plan-critic` | `openai/gpt-5.5` | `xhigh` | claude-opus-4-7/max → gemini-3.1-pro/high → glm-5.1 | Plan critic. |
| `long-runner` | `anthropic/claude-sonnet-4-6` | _(none)_ | kimi-k2.6 → gpt-5.5/medium → minimax-m3 → minimax-m2.7 | Master orchestrator (boulder/background). |
| `orchestrator-junior` | `anthropic/claude-sonnet-4-6` | _(none)_ | kimi-k2.6 → gpt-5.5/medium → minimax-m3 → minimax-m2.7 → big-pickle | Junior executor. |

## Agent → category preference

Agents have a default category they delegate as. OCMM uses this when the user invokes an agent without specifying a category:

| Agent | Default category |
|---|---|
| orchestrator, long-runner | (orchestrator — uses delegation directly, picks per task) |
| worker | `deep` |
| reviewer, plan-critic | `hard-reasoning` |
| doc-search, explore | (no delegation — direct tool use) |
| clarifier | `hard-reasoning` |
| planner | (planner — uses planner.md prompt) |
| media-reader | `low-effort` |
| orchestrator-junior | `low-effort` |
| _generic_ | `high-effort` |

## OCMM Phase 1 simplification

Phase 1 stores agent first-pick + 1-3 fallback layers. Full ~7-layer chains can be added in Phase 2 via user config. The schema (see `03-model-resolution.md`) supports arbitrary chain length.
