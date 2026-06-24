# ocmm — OpenCode Multi-Model Auto-Router

A small OpenCode plugin that auto-routes per-agent models, translates a single "variant" knob into provider-specific reasoning settings, attaches workflow-specific prompts declaratively at config time, and reactively falls back to the next model in a chain when the active model fails at runtime.

Concepts (model tiering, per-model specialized prompts, intent gating, proactive + reactive fallback) are inspired by [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode); naming and code are independent.

## What it does

| Hook                                 | What ocmm does                                                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`                             | Registers 9 agents + 10 category-subagents with their preferred provider/model, shared skill paths, and slash commands. Attaches functional agent prompts plus workflow/model-family deepwork prompts to built-in agents, and category prompts to category subagents. User config can add, override, or disable any of them. |
| `chat.params`                        | Resolves the variant for the active agent/model (4-tier priority: user-config -> agent-default -> category-default -> input-variant), respects explicit user choices, and applies only the model-family parameters ocmm supports for that model. Built-in defaults normalize category work to model-appropriate high/max reasoning where supported and avoid implicit Opus 4.7+ thinking budgets.                  |
| `chat.message`                       | v1 workflow: queues superpowers skills content on the first message per session. Also expands bare ocmm slash commands in noninteractive `opencode run` input so `/ralph-loop ...` and shared-skill commands get command context even when the TUI slash parser is bypassed. |
| `experimental.chat.system.transform` | Prepends queued v1 skill content and one-shot slash command context to `output.system`. omo workflow only uses this hook when a bare slash command was expanded by `chat.message`.                                                                                                               |
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
  "disabledSkills": ["debugging"],
  "disabledCommands": ["ralph-loop"],

  "skills": {
    "sources": [],
    "enable": [],
    "disable": []
  },

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
    "builder": {
      "requirement": {
        "variant": "high",
        "requiresProvider": ["openai"],
        "fallbackChain": [
          { "providers": ["openai"], "model": "gpt-5.5", "variant": "high" },
        ],
      },
    },
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

## Variant policy

`variant` is a routing hint, not a portable provider API. ocmm normalizes it by model family before writing `chat.params`:

| Model family | ocmm behavior |
| ------------ | ------------- |
| Explicit user config or request | Respected as written. ocmm does not silently rewrite user-declared `model`, `variant`, `reasoningEffort`, or `thinking` values. |
| GPT/Codex non-mini built-in defaults | Built-in defaults never request below `high`; category defaults from `coding` upward resolve to `max`, which currently translates to the GPT/Codex `xhigh` reasoning effort. |
| GPT/Codex mini | Keeps the full OpenAI reasoning ladder, including `minimal`, `low`, and no-op `none`. |
| Claude Opus 4.7+ / Fable | Built-in defaults do not emit an ocmm-owned `thinking` budget or `reasoningEffort`; explicit user config is passed through as written. |
| Older Claude | Uses Anthropic `thinking` budgets for non-`none` variants. |
| Gemini | Uses `reasoningEffort`; high and above also enable provider thinking. |
| Latest GLM / DeepSeek | Built-in defaults normalize low/medium-style local variants to canonical high/max controls where the provider family supports them; explicit user config or request variants are left as written. |
| Category defaults | `quick` stays lightweight. Built-in category defaults from `coding` upward resolve to `max`; explicit user category config or input variants are respected as written. |
| Kimi / MiniMax / unknown | Uses the existing temperature shaping fallback when no better family-specific knob exists. |

## Built-in agents

```
orchestrator    anthropic/claude-opus-4-7      variant=max     main coordinator
builder         openai/gpt-5.5                  variant=high    autonomous implementer
reviewer        openai/gpt-5.5                  variant=high    read-only consultant
doc-search      openai/gpt-5.4-mini-fast       (none)          external docs / OSS lookup
code-search     openai/gpt-5.4-mini-fast       (none)          internal codebase grep
planner         anthropic/claude-opus-4-7      variant=max     work-plan author
clarifier       anthropic/claude-sonnet-4-6    (none)          pre-plan analysis
plan-critic     openai/gpt-5.5                 variant=xhigh   plan QA
media-reader    openai/gpt-5.5                 variant=high    multimodal analysis
```

## Built-in categories (also registered as subagents)

```
frontend        google/gemini-3.1-pro       variant=high    UI/UX, layout, styling, visual QA
creative        google/gemini-3.1-pro       variant=high    concepts, naming, narrative, framing
hard-reasoning  openai/gpt-5.5              variant=xhigh   ultrabrain-style decisions and tradeoffs
research        openai/gpt-5.5              variant=high    missing-fact investigation and evidence gathering
quick           openai/gpt-5.4-mini         (none)          fully specified mechanical edits
coding          anthropic/claude-sonnet-4-6  (none)          determined code edits and bug fixes
normal-task     anthropic/claude-sonnet-4-6  (none)          ordinary bounded tasks
complex         openai/gpt-5.5              variant=high    coordinated multi-step ordinary tasks
deep            openai/gpt-5.5              (none)          autonomous system development and delivery
documenting     kimi-for-coding/k2p5        (none)          standalone documentation and prose
```

Variants shown are the **raw source values** from `src/data/categories.ts`. At runtime the variant policy normalizes categories from `coding` upward to model-appropriate `max` (which translates to the GPT/Codex `xhigh` reasoning effort for GPT-class models) unless the user explicitly overrides them; see the variant policy table above. Entries marked `(none)` carry no built-in variant and rely on this normalization.

The primary structure is `orchestrator` plus four functional agents: `reviewer`, `planner`, `clarifier`, and `plan-critic`. Supporting utility agents (`builder`, `doc-search`, `code-search`, `media-reader`) still use the workflow/model-family deepwork prompt without an additional role prompt. `builder` and `planner` are registered with `mode:"all"` so they can be selected directly and used as delegated task agents. Each category has a prompt under `prompts/<workflow>/category/<name>.md` that is set as the category-subagent's system prompt. Callers invoke categories via `task(category="deep", ...)` or direct subagent names such as `@deep` and `@quick`. Compatibility aliases `@oracle` and `@explore` are registered for upstream omo-style delegation and map to local `reviewer` and `code-search`.

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
  ast-grep/                          # shared skills registered as OpenCode skills + slash commands
  debugging/
  frontend/
  git-master/
  init-deep/
  lsp-setup/
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

For v1 workflow, superpowers skills are injected on the first message per session via `chat.message` (queue) + `system.transform` (prepend). For omo workflow, prompts are attached declaratively at config time; `chat.message` and `system.transform` only participate when a bare noninteractive slash command needs compatibility expansion.

## Slash Commands

ocmm registers OpenCode `config.command` entries for:

- Shared skills under `skills/`, available as `/git-master`, `/ast-grep`, `/frontend`, `/debugging`, `/init-deep`, and `/lsp-setup` by default.
- v1 injected deepwork skills when `workflow:"v1"` is active, available as `/brainstorming`, `/writing-plans`, `/subagent-driven-development`, `/requesting-code-review`, and `/receiving-code-review`. In v1, ocmm also adds `skills/v1` to OpenCode skill paths so native skill slash resolution works without "skill not found" noise.
- Loop protocol commands `/ralph-loop`, `/audit-loop`, and `/dwloop` (`/dwloop` is the deepwork-loop alias for `/audit-loop`).

Interactive OpenCode uses its native slash-command parser. For noninteractive `opencode run "/command args"` calls, OpenCode 1.17.9 passes the first message directly and does not parse project commands; ocmm compensates by expanding bare ocmm command text during `chat.message` and injecting the expanded command once through `system.transform`.

The loop commands are command-template entry points only. The full upstream omo idle continuation engine, verifier orchestration, Boulder/Atlas state, and cancel/stop hooks are not yet migrated; the templates explicitly tell the model to run the loop inside the current session and not claim hidden auto-continuation. The Ralph Loop runtime and related hooks are tracked as follow-up work in `docs/kb/omo-features/loops.md`.

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

| Mode             | Env var                   | Isolation                           | Notes |
| ---------------- | ------------------------- | ----------------------------------- | ----- |
| `none` (default) | `OPENCODE_CONFIG_CONTENT` | No config-dir isolation             | Inline config is additive; it cannot remove an already-loaded global plugin. |
| `inline`         | `OPENCODE_CONFIG_CONTENT` | No config-dir isolation             | Explicit form of `none`. |
| `config-file`    | `OPENCODE_CONFIG`         | Generated single config file        | Writes `<config-dir>/opencode.json`. |
| `config-dir`     | `OPENCODE_CONFIG_DIR`     | Generated config directory          | Uses `~/.config/opencode/ocmm-opencode/` unless `--config-dir` overrides it. |
| `xdg`            | `XDG_CONFIG_HOME`         | Full OpenCode config-dir isolation  | Uses the same default isolated directory and can strip global plugins. |

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

Tests use `node --test --experimental-strip-types` (Node 22+). No bundler, no test framework dependencies.

### Live integration test

See `AGENTS.md` for the full live test procedure using isolated XDG dirs.

## License

Licensed under the **Anti American AI Public License (AAAPL)** — see [`LICENSE`](./LICENSE) (English), [`LICENSE.zh.md`](./LICENSE.zh.md) (Chinese), or [`LICENSE.bilingual.md`](./LICENSE.bilingual.md) (authoritative bilingual reference).

SPDX identifier: `LicenseRef-AAAPL`.

## Architecture & internals

For design rationale, hook flow, the 4-tier variant resolution pipeline, two-layer fallback system, and config schema overview, see [`docs/architecture.md`](./docs/architecture.md).

Authoritative agent and category definitions live in `src/data/agents.ts` and `src/data/categories.ts`. For prompt provenance, see [`docs/v1-maintenance.md`](./docs/v1-maintenance.md) (v1/deepwork) and [`docs/prompt-sync.md`](./docs/prompt-sync.md) (omo).
