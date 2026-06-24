# ocmm — OpenCode Multi-Model Auto-Router

A small OpenCode plugin that auto-routes per-agent models, translates a single "variant" knob into provider-specific reasoning settings, attaches workflow-specific prompts declaratively at config time, and reactively falls back to the next model in a chain when the active model fails at runtime.

Concepts (model tiering, per-model specialized prompts, intent gating, proactive + reactive fallback) are inspired by [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode); naming and code are independent.

## What it does

| Hook                                 | What ocmm does                                                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`                             | Registers 10 primary agents + 10 category-subagents with their preferred provider/model. Attaches functional agent prompts plus workflow/model-family deepwork prompts to built-in agents, and category prompts to category subagents. User config can add, override, or disable any of them. |
| `chat.params`                        | Resolves the variant for the active agent/model (4-tier priority: user-config -> agent-default -> category-default -> input-variant) and applies the right `reasoningEffort` / extended-thinking budget / temperature for the model family (GPT, Claude, Gemini, Kimi, GLM, MiniMax, ...).    |
| `chat.message`                       | v1 workflow: queues superpowers skills content on the first message per session. omo workflow: no-op (prompts are declaratively attached at config time).                                                                                                                                     |
| `experimental.chat.system.transform` | v1 workflow: drains queued skills content and prepends to `output.system`. omo workflow: no-op.                                                                                                                                                                                               |
| `event`                              | Cleans up per-session state on `session.deleted` / `session.idle`. On `session.error`: classifies the error, and if retryable, dispatches the next model in the agent's fallback chain via `client.session.prompt`.                                                                           |

The plugin **does not** change the model on a per-call basis via `chat.params`. OpenCode's `chat.params` output schema has no `model` field. Per-agent routing happens via the `config` hook (the only safe seam for model selection), and reactive re-routing happens via the `event` hook + `client.session.prompt`.

## Workflows

ocmm supports two workflows, switchable via the `workflow` config field:

**`omo`** (default) — Upstream oh-my-opencode system prompts. Aggressive tone (CODE RED, ABSOLUTE CERTAINTY). Prompts are attached declaratively to agents at config time based on model family.

**`v1`** — Skill-driven deepwork workflow. The config/path label stays `v1`, but model-facing prompt text calls it `deepwork`. The default prompt is a concise local controller; GPT/Gemini/GLM/Codex/planner variants stay close to upstream omo model-specific prompt style with local tool/agent/path adaptation. Skills are injected on the first message per session via `chat.message` + `system.transform` hooks.

```jsonc
{ "workflow": "v1" }
```

## Install

```bash
pnpm install
pnpm run build
```

Then point your OpenCode config at the built plugin (path or installed package):

```jsonc
// opencode.json
{ "plugin": ["./node_modules/ocmm/dist/index.js"] }
```

Or use the `ocmm` shim binary (see below) to launch opencode with automatic plugin loading and config isolation.

## Configure

Drop a config file in either of these locations (project wins on conflicts):

- `<project>/.opencode/ocmm.jsonc`
- `~/.config/opencode/ocmm.jsonc` (all platforms, including Windows — follows opencode's convention)

Schema (Zod-validated; unknown keys rejected). All fields optional:

```jsonc
{
  "workflow": "omo", // "omo" (default) or "v1"

  "disabledAgents": ["media-reader"],

  "agents": {
    "reviewer": {
      "model": "anthropic/claude-opus-4-7",
      "variant": "max",
    },
    "orchestrator": {
      "model": "anthropic/claude-opus-4-7",
      "variant": "max",
      "fallbackModels": [
        "openai/gpt-5.5",
        { "providers": ["zhipu"], "model": "glm-5.1" },
      ],
    },
    "worker": {
      "requirement": {
        "variant": "medium",
        "requiresProvider": ["openai"],
        "fallbackChain": [
          { "providers": ["openai"], "model": "gpt-5.5", "variant": "medium" },
        ],
      },
    },
    "atlas": { "disabled": true },
  },

  "categories": {
    "hard-reasoning": {
      "model": "openai/gpt-5.5",
      "variant": "xhigh",
    },
  },

  "runtimeFallback": {
    "enabled": true,
    "dispatch": true,
    "maxAttempts": 3,
    "cooldownSeconds": 60,
    "retryOnStatusCodes": [429, 500, 502, 503, 504],
    "retryOnPatterns": [
      "rate limit",
      "overloaded",
      "temporarily unavailable",
      "service unavailable",
      "internal server error",
      "gateway timeout",
      "bad gateway",
      "capacity",
      "try again",
    ],
  },

  "shim": {
    "mode": "none", // none|inline|config-file|config-dir|xdg (default: none)
    "configDir": "/custom", // target dir for config-dir/xdg modes
    "configFile": "/path.json", // target file for config-file mode
    "opencode": "/usr/local/bin/opencode",
    "keepOmo": false,
    "noProviders": false,
    "noPlugins": false,
  },

  "registerBuiltinAgents": true,
  "debug": false,
}
```

### Shorthand vs full form

Both `agents.*` and `categories.*` accept either shape:

| Field            | Type                                                                                             | Meaning                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `model`          | `"provider/model"` string                                                                        | Primary model. Split into `providers: [provider]` + `model`.                                                                |
| `variant`        | `"low" \| "medium" \| "high" \| "xhigh" \| "max" \| "minimal" \| "none" \| "auto" \| "thinking"` | Promoted onto the first chain entry.                                                                                        |
| `fallbackModels` | array of `string \| FallbackEntry`                                                               | Strings are parsed as `provider/model`; objects pass through. Prepended after the primary entry to form the fallback chain. |
| `requirement`    | full `ModelRequirement` object                                                                   | If present, shorthand fields are ignored. Use this when you need `requiresProvider` / `requiresAnyModel` / `requiresModel`. |
| `disabled`       | `true`                                                                                           | (Agents only.) Removes the agent from registration.                                                                         |
| `description`    | string                                                                                           | Overrides the built-in description (used in agent registration).                                                            |

## Variant table

| variant             | GPT family                | Claude (Opus 4.7+)      | Gemini                    | Kimi/GLM/MiniMax/unknown |
| ------------------- | ------------------------- | ----------------------- | ------------------------- | ------------------------ |
| `none`              | _(no override)_           | _(no override)_         | _(no override)_           | _(no override)_          |
| `minimal`           | `reasoningEffort=minimal` | `thinking={ disabled }` | `reasoningEffort=minimal` | `temperature=0.0`        |
| `low`               | `low`                     | `thinking budget 4k`    | `low`                     | `0.2`                    |
| `medium` / `auto`   | `medium`                  | `thinking budget 12k`   | `medium`                  | `0.5`                    |
| `high` / `thinking` | `high`                    | `thinking budget 24k`   | `high` + thinking         | `0.7`                    |
| `xhigh`             | `high`                    | `thinking budget 49k`   | `high` + thinking         | `0.85`                   |
| `max`               | `high`                    | `thinking budget 65k`   | `high` + thinking         | `1.0`                    |

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

## Built-in categories (also registered as subagents)

```
frontend        google/gemini-3.1-pro      variant=high    UI/UX, layout, styling, visual QA
creative        google/gemini-3.1-pro      variant=high    concepts, naming, narrative, framing
hard-reasoning  openai/gpt-5.5             variant=xhigh   ultrabrain-style decisions and tradeoffs
research        openai/gpt-5.5             variant=medium  missing-fact investigation and evidence gathering
quick           openai/gpt-5.4-mini        (none)          fully specified mechanical edits
coding          anthropic/claude-sonnet-4-6 (none)         determined code edits and bug fixes
normal-task     anthropic/claude-sonnet-4-6 (none)         ordinary bounded tasks
complex         openai/gpt-5.5             variant=high    coordinated multi-step ordinary tasks
deep            openai/gpt-5.5             variant=medium autonomous system development and delivery
documenting     kimi-for-coding/k2p5       (none)          standalone documentation and prose
```

The primary structure is `orchestrator` plus four functional agents: `reviewer`, `planner`, `clarifier`, and `plan-critic`. Supporting utility agents (`worker`, `doc-search`, `code-search`, `media-reader`, `task-runner`) still use the workflow/model-family deepwork prompt without an additional role prompt. Each category has a prompt under `prompts/<workflow>/category/<name>.md` that is set as the category-subagent's system prompt. Callers invoke categories via `task(category="deep", ...)` or direct subagent names such as `@deep` and `@quick`. Compatibility aliases `@oracle` and `@explore` are registered for upstream omo-style delegation and map to local `reviewer` and `code-search`.

## Prompt architecture

Prompts are organized by workflow:

```
prompts/
  omo/                              # upstream omo prompts
    deepwork/{default,gpt,gemini,glm,codex,planner}.md
    agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
    category/*.md (10 files)
  v1/                               # superpowers-style prompts
    deepwork/{default,gpt,gemini,glm,codex,planner}.md
    agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
    category/*.md (10 files)
skills/
  v1/                               # forked superpowers skills (v1 only)
    brainstorming/SKILL.md
    writing-plans/SKILL.md
    subagent-driven-development/SKILL.md
    requesting-code-review/SKILL.md
    receiving-code-review/SKILL.md
```

Model-family variant selection (`pickDeepworkVariantForAgent`):

- planner agent -> `planner.md`
- GPT family -> `gpt.md`
- Gemini family -> `gemini.md`
- GLM family -> `glm.md`
- Codex family -> `codex.md`
- others (Claude/Kimi/Minimax/unknown) -> `default.md`

Variant is selected at config time using the agent's `fallbackChain[0].model` + `classifyModelFamily`. For built-in functional agents, ocmm composes `agents/<name>.md` with the selected `deepwork/<variant>.md`; the role prompt is authoritative for that agent's scope and the deepwork prompt supplies workflow/model calibration. Categories receive only their category prompt. No runtime keyword detection — prompts are attached declaratively.

For v1 workflow, superpowers skills are injected on the first message per session via `chat.message` (queue) + `system.transform` (prepend). For omo workflow, `chat.message` and `system.transform` are no-ops.

## Profiles

A **profile** is a named partial overlay on the base config. It can override any top-level field (agents, categories, runtimeFallback, debug, etc.) except `profiles` and `activeProfile` themselves. At load time, after merging user + project configs, the active profile is deep-merged over the result — profile wins over both.

### Selecting a profile

Two ways, in priority order:

1. **`OCMM_PROFILE` env var** (highest priority, per-shell, not persisted):

   ```bash
   OCMM_PROFILE=gpu opencode run "..."
   ```

   Empty string is treated as unset — falls back to the config's `activeProfile`.

2. **`activeProfile` in the config file** (persisted):
   ```jsonc
   { "activeProfile": "gpu" }
   ```

If the named profile doesn't exist, it is silently ignored — the base config loads unchanged.

### Profile merge semantics

| Field type                                          | Behavior under profile overlay                 |
| --------------------------------------------------- | ---------------------------------------------- |
| Scalars (`debug`, `workflow`, ...)                  | Replaced                                       |
| Objects (`agents`, `categories`, `runtimeFallback`) | Deep-merged (profile field wins per-key)       |
| `fallbackModels`, `disabledAgents`                  | **Replaced** (profile fully owns these arrays) |
| Other arrays (`retryOnStatusCodes`, ...)            | Replaced                                       |

`fallbackModels` and `disabledAgents` are unioned across user and project configs (NOT profiles). Profiles are the one layer that replaces.

## `ocmm` shim

The `ocmm` binary launches opencode with configurable config isolation. It merges providers from your global `opencode.json`, adds the ocmm plugin, and optionally strips the `oh-my-openagent` plugin to avoid collision.

```bash
ocmm                              # start opencode (no isolation by default)
ocmm -p work run "hello"          # select profile + run
ocmm --mode xdg run "hello"       # full config isolation
ocmm --mode config-file -c run x  # config-file mode + continue
ocmm --help
```

### Flags

```
-p, --profile <name>     Select ocmm profile (sets OCMM_PROFILE)
    --mode <m>            Isolation: none|inline|config-file|config-dir|xdg (default: none)
    --no-providers        Don't merge providers from global config
    --no-plugins          Don't merge plugins from global config
    --ocmm-only           Shorthand for --no-providers --no-plugins
    --config-dir <path>   Target dir for config-dir/xdg modes
    --config-file <path>  Target file for config-file mode
    --opencode <path>     Custom opencode binary path
    --keep-omo            Keep oh-my-openagent plugin (stripped by default in xdg)
    --reset               Clear isolated dir before starting
-h, --help                Show help
--                        Separator; everything after passes to opencode verbatim
```

All non-ocmm args (including `-c`, `--continue`, `--model`, `run`, etc.) pass through to opencode.

### Isolation modes

| Mode             | Env var                   | Isolates?      | Can strip omo? | Default path                        |
| ---------------- | ------------------------- | -------------- | -------------- | ----------------------------------- |
| `none` (default) | `OPENCODE_CONFIG_CONTENT` | No             | No             | n/a                                 |
| `inline`         | `OPENCODE_CONFIG_CONTENT` | No             | No             | n/a                                 |
| `config-file`    | `OPENCODE_CONFIG`         | Single file    | No             | `<config-dir>/opencode.json`        |
| `config-dir`     | `OPENCODE_CONFIG_DIR`     | Dir (additive) | No             | `~/.config/opencode/ocmm-opencode/` |
| `xdg`            | `XDG_CONFIG_HOME`         | Full           | Yes            No | No | n/a |
| `config-file` | `OPENCODE_CONFIG` | Single file | No | `<config-dir>/opencode.json` |
| `config-dir` | `OPENCODE_CONFIG_DIR` | Dir (additive) | No | `~/.config/opencode/ocmm-opencode/` |
| `xdg` | `XDG_CONFIG_HOME` | Full | Yes | `~/.config/opencode/ocmm-opencode/` |

Config defaults can be set in the `shim` section of `ocmm.jsonc`. CLI flags override config values.

## `ocmm-profiles` CLI

Manage profiles without editing JSON:

```bash
ocmm-profiles list                 # list all (* = active)
ocmm-profiles use claude           # set active profile (persisted)
ocmm-profiles show [name]          # print a profile
ocmm-profiles add gpu ./gpu.json  # add/replace from JSON file
ocmm-profiles rm gpu              # delete a profile
ocmm-profiles clear                # clear activeProfile
ocmm-profiles current             # print active profile name
```

The CLI reads/writes the **user** config file at `~/.config/opencode/ocmm.json[c]`. Comments are not preserved on write.

## Runtime fallback

When a model call fails with a retryable error (HTTP 429/5xx, or a message matching `retryOnPatterns`), ocmm:

1. Resolves the failing agent's `ModelRequirement` (user config -> built-in defaults).
2. Marks the just-failed model as failed with a timestamp.
3. Finds the next entry in the fallback chain that is not in cooldown (default 60s).
4. Dispatches a new `client.session.prompt` call with the next model, reusing the last user message's parts.
5. Aborts the original session first (best-effort).

```jsonc
"runtimeFallback": {
  "enabled": true,
  "dispatch": true,
  "maxAttempts": 3,
  "cooldownSeconds": 60,
  "retryOnStatusCodes": [429, 500, 502, 503, 504],
  "retryOnPatterns": ["rate limit", "overloaded", "..."]
}
```

Abort errors are never retried. Deduplication is enforced via an in-flight `Set<sessionID>`.

## Develop

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Tests use `node --test --experimental-strip-types` (Node 22+). No bundler, no test framework dependencies. 177 tests across config, routing, intent, hooks, runtime-fallback, and shim.

### Live integration test

See `AGENTS.md` for the full live test procedure using isolated XDG dirs.

## License

Licensed under the **Anti American AI Public License (AAAPL)** — see [`LICENSE`](./LICENSE) (English), [`LICENSE.zh.md`](./LICENSE.zh.md) (Chinese), or [`LICENSE.bilingual.md`](./LICENSE.bilingual.md) (authoritative bilingual reference).

SPDX identifier: `LicenseRef-AAAPL`.

## Knowledge base

`.kb/` contains the design notes, category/agent tables, and the source-of-truth for the routing rules. Read `.kb/00-overview.md` first.
