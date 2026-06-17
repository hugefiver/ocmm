# OCMM Knowledge Base — Overview

**Source of truth for the OCMM (oh-my-opencode-mini) plugin design.** All routing logic, model tiers, and per-model specialized prompts derived from analysis of `./omo` (oh-my-opencode), the reference implementation.

OCMM is a **from-scratch redesign**, not a port. We borrow only:

1. The 8-category work-content grading scheme.
2. Agent → model fallback chain concept.
3. Per-model specialized prompt injection (ultrawork/mode prompts).
4. Intent-keyword gate.

We deliberately drop:

- Multi-package monorepo split (one TS file per concern is fine).
- 38 packages worth of features (codex, MCP servers, web site, binary releases).
- Team-mode multi-agent orchestration (out of scope for routing plugin).

## Two-axis routing matrix

| Axis | Source signal | Output |
|---|---|---|
| **Work category** | `delegate_task(category=…)` argument OR explicit prefix in user prompt | Default model + variant |
| **Agent identity** | Active agent name (e.g. `oracle`, `librarian`) | Fallback chain |

Both axes resolve through the same **6-step resolution pipeline** (see `03-model-resolution.md`).

## Per-model prompt specialization

When the routing engine selects a model, the plugin injects a model-tuned system prompt (held in `.kb/prompts/`):

- GPT family → `prompts/ultrawork/gpt.md` (decision-framework heavy, less aggressive).
- Gemini family → `prompts/ultrawork/gemini.md` (intent gate, anti-optimism checkpoint, tool mandate).
- Other (Claude, Kimi) → `prompts/ultrawork/default.md` (full ultrawork banner).
- Planner agents → `prompts/ultrawork/planner.md` (concise, plan-only).

Mode prompts in `prompts/mode/` (hyperplan, team) layer on top when intent keywords detected.

## Plugin shape (target)

Single OpenCode plugin module hooking:

- `config` — register categories + load user config.
- `chat.params` — model override based on category/agent (proactive routing).
- `chat.message` — intent keyword detection + mode prompt injection.
- `event` — reactive fallback on session.error (Phase 2).

See `06-plugin-design.md` for component layout.
