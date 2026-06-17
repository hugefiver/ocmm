# ocmm — OpenCode Multi-Model Auto-Router

A small OpenCode plugin that auto-routes per-agent models, translates a single "variant" knob into provider-specific reasoning settings, and injects mode-specific prompts when intent keywords appear in user input.

Designed from scratch. Concepts (model tiering, per-model specialized prompts, intent gating) are inspired by [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode); no source code is shared.

## What it does

| Hook | What ocmm does |
|---|---|
| `config` | Registers a curated set of named agents (`sisyphus`, `oracle`, `librarian`, `explore`, `prometheus`, `metis`, `momus`, `multimodal-looker`, `atlas`, `sisyphus-junior`, `hephaestus`) with their preferred provider/model. |
| `chat.params` | When a session uses one of these agents, applies the right `reasoningEffort` / extended-thinking budget / temperature for the active model family (GPT, Claude, Gemini, Kimi, GLM, MiniMax, ...). |
| `chat.message` | Detects `ultrawork` / `ulw` / `team` / `hyperplan` / `hpp` keywords in user input and prepends the matching mode prompt. The ultrawork prompt has GPT, Gemini, default, and planner variants picked by model family + agent. |
| `event` | Cleans up per-session state when a session ends. |

The plugin **does not** change the model on a per-call basis — OpenCode's `chat.params` cannot do that. Per-agent routing happens via the `config` hook, which is the only safe seam for model selection.

## Install

```bash
pnpm install
pnpm run build
```

Then point your OpenCode config at the built plugin (path or installed package):

```jsonc
// opencode.json
{
  "plugin": ["./node_modules/ocmm/dist/index.js"]
}
```

## Configure

Drop a config file in either of these locations (project wins on conflicts):

* `<project>/.opencode/ocmm.jsonc`
* `~/.config/opencode/ocmm.jsonc` (or `%APPDATA%\opencode\ocmm.jsonc` on Windows)

Schema (Zod-validated; unknown keys rejected):

```jsonc
{
  // Disable specific built-in agents from being registered.
  "disabledAgents": ["multimodal-looker"],

  // Override or add agents. Either provide a full requirement or a
  // shorthand `model` string.
  "agents": {
    "oracle": { "model": "anthropic/claude-opus-4-7" },
    "sisyphus": {
      "requirement": {
        "variant": "max",
        "fallbackChain": [
          { "providers": ["anthropic"], "model": "claude-opus-4-7", "variant": "max" },
          { "providers": ["openai"], "model": "gpt-5.5", "variant": "high" }
        ]
      }
    }
  },

  "intent": {
    "enabled": true,
    "skipAgents": ["plan"]
  },

  "registerBuiltinAgents": true,
  "debug": false
}
```

## Variant table

| variant | GPT family | Claude (Opus 4.7+) | Gemini | Kimi/GLM/MiniMax/unknown |
|---|---|---|---|---|
| `minimal` | `reasoningEffort=minimal` | `thinking={ disabled }` | `reasoningEffort=minimal` | `temperature=0.0` |
| `low` | `low` | `thinking budget 4k` | `low` | `0.2` |
| `medium` / `auto` | `medium` | `thinking budget 12k` | `medium` | `0.5` |
| `high` / `thinking` | `high` | `thinking budget 24k` | `high` + thinking | `0.7` |
| `xhigh` | `high` | `thinking budget 49k` | `high` + thinking | `0.85` |
| `max` | `high` | `thinking budget 65k` | `high` + thinking | `1.0` |

## Built-in agents

```
sisyphus           anthropic/claude-opus-4-7      variant=max     orchestrator
hephaestus         openai/gpt-5.5                 variant=medium  autonomous worker
oracle             openai/gpt-5.5                 variant=high    consultant
librarian          openai/gpt-5.4-mini-fast       (none)          external lookup
explore            openai/gpt-5.4-mini-fast       (none)          internal grep
prometheus         anthropic/claude-opus-4-7      variant=max     planner
metis              anthropic/claude-sonnet-4-6    (none)          pre-planning consultant
momus              openai/gpt-5.5                 variant=xhigh   plan critic
multimodal-looker  openai/gpt-5.5                 variant=medium  media analysis
atlas              anthropic/claude-sonnet-4-6    (none)          long-running orchestrator
sisyphus-junior    anthropic/claude-sonnet-4-6    (none)          single-task executor
```

These are defaults; users can override any of them in their config or disable them.

## Intent keywords

| Keyword | Mode prompt | Variant routing |
|---|---|---|
| `ultrawork` / `ulw` | `prompts/ultrawork/{default,gpt,gemini,planner}.md` | planner agents -> `planner.md`, GPT -> `gpt.md`, Gemini -> `gemini.md`, else `default.md` |
| `team` / `team-mode` / `teammate` / `teamwork` | `prompts/mode/team.md` | n/a |
| `hyperplan` / `hpp` | `prompts/mode/hyperplan.md` | n/a |
| `hyperplan ultrawork` (any order) | hyperplan + ultrawork concatenated | combined |

Intent triggers are latched per session — the same keyword in a follow-up message does not re-inject.

## Develop

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Tests use `node --test --experimental-strip-types` (Node 22+). No bundler, no test framework dependencies.

## Knowledge base

`.kb/` contains the design notes, category/agent tables, and the source-of-truth for the routing rules. Read `.kb/00-overview.md` first.
