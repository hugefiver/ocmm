# ocmm — OpenCode Multi-Model Auto-Router

A small OpenCode plugin that auto-routes per-agent models, translates a single "variant" knob into provider-specific reasoning settings, and injects mode-specific prompts when intent keywords appear in user input.

Designed from scratch. Concepts (model tiering, per-model specialized prompts, intent gating) are inspired by [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode); naming and code are independent.

## What it does

| Hook | What ocmm does |
|---|---|
| `config` | Registers 10 named agents (`orchestrator`, `worker`, `reviewer`, `doc-search`, `code-search`, `planner`, `clarifier`, `plan-critic`, `media-reader`, `task-runner`) with their preferred provider/model. |
| `chat.params` | When a session uses one of these agents, applies the right `reasoningEffort` / extended-thinking budget / temperature for the active model family (GPT, Claude, Gemini, Kimi, GLM, MiniMax, ...). |
| `chat.message` | Detects `deepwork` / `dw` / `team` / `superplan` / `sp` keywords in user input and prepends the matching mode prompt. The deepwork prompt has GPT, Gemini, default, and planner variants picked by model family + agent. |
| `event` | Cleans up per-session state when a session ends. |

The plugin **does not** change the model on a per-call basis. OpenCode's `chat.params` cannot do that. Per-agent routing happens via the `config` hook, which is the only safe seam for model selection.

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
  "disabledAgents": ["media-reader"],

  "agents": {
    "reviewer": { "model": "anthropic/claude-opus-4-7" },
    "orchestrator": {
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
orchestrator    anthropic/claude-opus-4-7      variant=max     main coordinator
worker          openai/gpt-5.5                 variant=medium  autonomous implementer
reviewer        openai/gpt-5.5                 variant=high    read-only consultant
doc-search      openai/gpt-5.4-mini-fast       (none)          external docs / OSS lookup
code-search     openai/gpt-5.4-mini-fast       (none)          internal codebase grep
planner         anthropic/claude-opus-4-7      variant=max     work-plan author
clarifier       anthropic/claude-sonnet-4-6    (none)          pre-plan analysis
plan-critic     openai/gpt-5.5                 variant=xhigh   plan QA
media-reader    openai/gpt-5.5                 variant=medium  multimodal analysis
task-runner     anthropic/claude-sonnet-4-6    (none)          focused single-task executor
```

These are defaults; users can override any of them in their config or disable them.

## Intent keywords

| Keyword | Mode prompt | Variant routing |
|---|---|---|
| `deepwork` / `dw` | `prompts/deepwork/{default,gpt,gemini,planner}.md` | planner agents -> `planner.md`, GPT -> `gpt.md`, Gemini -> `gemini.md`, else `default.md` |
| `team` / `team-mode` / `teammate` / `teamwork` | `prompts/mode/team.md` | n/a |
| `superplan` / `sp` | `prompts/mode/superplan.md` | n/a |
| `superplan deepwork` (any order) | superplan + deepwork concatenated | combined |

Intent triggers are latched per session. The same keyword in a follow-up message does not re-inject.

## Develop

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Tests use `node --test --experimental-strip-types` (Node 22+). No bundler, no test framework dependencies.

## Knowledge base

`.kb/` contains the design notes, category/agent tables, and the source-of-truth for the routing rules. Read `.kb/00-overview.md` first.
