# ocmm — OpenCode Multi-Model Auto-Router

A small OpenCode plugin that auto-routes per-agent models, translates a single "variant" knob into provider-specific reasoning settings, injects mode-specific prompts when intent keywords appear in user input, reactively falls back to the next model in a chain when the active model fails at runtime, and supports named **profiles** for switching between model configurations.

Designed from scratch. Concepts (model tiering, per-model specialized prompts, intent gating, proactive + reactive fallback) are inspired by [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode); naming and code are independent.

## What it does

| Hook | What ocmm does |
|---|---|
| `config` | Registers 10 primary agents + 8 category-subagents with their preferred provider/model. User config can add, override, or disable any of them. |
| `chat.params` | Resolves the variant for the active agent/model (4-tier priority: user-config → agent-default → category-default → input-variant) and applies the right `reasoningEffort` / extended-thinking budget / temperature for the model family (GPT, Claude, Gemini, Kimi, GLM, MiniMax, ...). |
| `chat.message` | Detects `deepwork` / `dw` / `team` / `superplan` / `sp` keywords in `output.parts` and queues a composed mode prompt for the session. The deepwork prompt has GPT, Gemini, default, and planner variants picked by model family + agent. |
| `experimental.chat.system.transform` | Drains the queued prompt for the session and prepends it to `output.system`. This is the actual injection seam — `chat.message` cannot mutate the system prompt directly. |
| `event` | Cleans up per-session state on `session.deleted` / `session.idle`. On `session.error`: classifies the error, and if retryable, dispatches the next model in the agent's fallback chain via `client.session.prompt`. |

The plugin **does not** change the model on a per-call basis via `chat.params`. OpenCode's `chat.params` output schema has no `model` field. Per-agent routing happens via the `config` hook (the only safe seam for model selection), and reactive re-routing happens via the `event` hook + `client.session.prompt`.

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
* `~/.config/opencode/ocmm.jsonc` (Linux/macOS) — or `$XDG_CONFIG_HOME/opencode/ocmm.jsonc` if set
* `%APPDATA%\opencode\ocmm.jsonc` (Windows, when `XDG_CONFIG_HOME` is unset)

Schema (Zod-validated; unknown keys rejected). All fields optional:

```jsonc
{
  "disabledAgents": ["media-reader"],

  // Agents accept shorthand or full ModelRequirement form.
  "agents": {
    // Shorthand: pin a single model (+ optional variant / fallback list).
    "reviewer": {
      "model": "anthropic/claude-opus-4-7",
      "variant": "max"
    },

    // Shorthand with a fallback list (strings or full entries).
    "orchestrator": {
      "model": "anthropic/claude-opus-4-7",
      "variant": "max",
      "fallbackModels": [
        "openai/gpt-5.5",
        { "providers": ["zhipu"], "model": "glm-5.1" }
      ]
    },

    // Full ModelRequirement form (passthrough — no normalization).
    "worker": {
      "requirement": {
        "variant": "medium",
        "requiresProvider": ["openai"],
        "fallbackChain": [
          { "providers": ["openai"], "model": "gpt-5.5", "variant": "medium" }
        ]
      }
    },

    // Disable a built-in agent entirely.
    "atlas": { "disabled": true }
  },

  // Categories work the same way. Each category is also registered
  // as a mode:"subagent" entry, so callers can invoke it via
  // `task(subagent_type="hard-reasoning", ...)`.
  "categories": {
    "hard-reasoning": {
      "model": "openai/gpt-5.5",
      "variant": "xhigh"
    }
  },

  // Reactive runtime fallback (see "Runtime fallback" below).
  "runtimeFallback": {
    "enabled": true,
    "dispatch": true,
    "maxAttempts": 3,
    "cooldownSeconds": 60,
    "retryOnStatusCodes": [429, 500, 502, 503, 504],
    "retryOnPatterns": [
      "rate limit", "overloaded", "temporarily unavailable",
      "service unavailable", "internal server error",
      "gateway timeout", "bad gateway", "capacity", "try again"
    ]
  },

  "intent": {
    "enabled": true,
    "skipAgents": ["plan"]
  },

  "fallbackModels": ["openai/gpt-5.4-mini"],
  "systemDefaultModel": "openai/gpt-5.4-mini",

  "registerBuiltinAgents": true,
  "debug": false
}
```

### Shorthand vs full form

Both `agents.*` and `categories.*` accept either shape:

| Field | Type | Meaning |
|---|---|---|
| `model` | `"provider/model"` string | Primary model. Split into `providers: [provider]` + `model`. |
| `variant` | `"low" \| "medium" \| "high" \| "xhigh" \| "max" \| "minimal" \| "none" \| "auto" \| "thinking"` | Promoted onto the first chain entry. |
| `fallbackModels` | array of `string \| FallbackEntry` | Strings are parsed as `provider/model`; objects pass through. Prepended after the primary entry to form the fallback chain. |
| `requirement` | full `ModelRequirement` object | If present, shorthand fields are ignored. Use this when you need `requiresProvider` / `requiresAnyModel` / `requiresModel`. |
| `disabled` | `true` | (Agents only.) Removes the agent from registration. |
| `description` | string | Overrides the built-in description (used in agent registration). |

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

## Built-in categories (also registered as subagents)

```
frontend        google/gemini-3.1-pro      variant=high    UI/UX, design, styling
creative        google/gemini-3.1-pro      variant=high    unconventional approaches
hard-reasoning  openai/gpt-5.5             variant=xhigh   heavy logic, architecture
research        openai/gpt-5.5             variant=medium  autonomous multi-step solving
quick           openai/gpt-5.4-mini        (none)          trivial single-file changes
low-effort      anthropic/claude-sonnet-4-6 (none)         moderate effort fallback
high-effort     anthropic/claude-opus-4-7  variant=max     high effort fallback
writing         kimi-for-coding/k2p5       (none)          documentation, prose
```

Each category has a prompt-append under `prompts/category/<name>.md` that is set as the subagent's system prompt. Callers invoke them via `task(subagent_type="hard-reasoning", ...)`.

## Intent keywords

| Keyword | Mode prompt | Variant routing |
|---|---|---|
| `deepwork` / `dw` | `prompts/deepwork/{default,gpt,gemini,planner,codex}.md` | planner agents → `planner.md`, GPT → `gpt.md`, Gemini → `gemini.md`, else `default.md` |
| `team` / `team-mode` / `teammate` / `teamwork` | `prompts/mode/team.md` | n/a |
| `superplan` / `sp` | `prompts/mode/superplan.md` | n/a |
| `superplan deepwork` (any order) | superplan + deepwork concatenated | combined |

Intent triggers are latched per session. The same keyword in a follow-up message does not re-inject. Planner agents (`plan` / `planner`) skip the standalone deepwork trigger — they get the planner variant only when the composite `superplan deepwork` form is used.

## Profiles

A **profile** is a named partial overlay on the base config. It can override any top-level field (agents, categories, runtimeFallback, intent, debug, etc.) except `profiles` and `activeProfile` themselves. At load time, after merging user + project configs, the active profile is deep-merged over the result — profile wins over both.

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

If the named profile doesn't exist, it is silently ignored — the base config loads unchanged. This prevents a stale `activeProfile` or `OCMM_PROFILE` value from breaking the plugin.

### Profile merge semantics

| Field type | Behavior under profile overlay |
|---|---|
| Scalars (`debug`, `systemDefaultModel`, ...) | Replaced |
| Objects (`agents`, `categories`, `intent`, `runtimeFallback`) | Deep-merged (profile field wins per-key) |
| `fallbackModels`, `disabledAgents` | **Replaced** (profile fully owns these arrays — a profile is a mode switch, not a patch) |
| Other arrays (`intent.skipAgents`, `retryOnStatusCodes`, ...) | Replaced |

If you want accumulation across user+project layers (NOT profiles), that still happens — `fallbackModels` and `disabledAgents` are unioned across user and project configs. Profiles are the one layer that replaces.

### Config example

```jsonc
{
  "agents": { "orchestrator": { "model": "hoo/glm-5.2" } },
  "profiles": {
    "gpu": {
      "agents": { "orchestrator": { "model": "openai/gpt-5.5", "variant": "high" } },
      "runtimeFallback": { "maxAttempts": 5 }
    },
    "claude": {
      "agents": { "orchestrator": { "model": "anthropic/claude-opus-4-7", "variant": "max" } }
    }
  },
  "activeProfile": "gpu"
}
```

### CLI: `ocmm-profiles`

A command-line tool for managing profiles without editing JSON by hand:

```bash
# List all profiles (* marks the active one)
ocmm-profiles list

# Set the active profile (persisted to config file)
ocmm-profiles use claude

# Print the active profile, or a named one
ocmm-profiles show
ocmm-profiles show gpu

# Add/replace a profile from a JSON file
ocmm-profiles add gpu ./gpu-profile.json

# Delete a profile (clears activeProfile if it was active)
ocmm-profiles rm gpu

# Clear activeProfile (revert to base config)
ocmm-profiles clear

# Print just the active profile name (empty if none)
ocmm-profiles current
```

The CLI reads/writes the **user** config file (`$XDG_CONFIG_HOME/opencode/ocmm.json[c]` → `%APPDATA%\opencode\ocmm.json[c]` → `~/.config/opencode/ocmm.json[c]`). It does NOT touch project configs. Comments are not preserved on write (output is plain JSON with `.jsonc` extension, which is valid JSONC).

In dev (no build needed):
```bash
pnpm cli list
pnpm cli use gpu
```

Or run the compiled binary directly:
```bash
node dist/cli/profiles.js list
```

## Runtime fallback

When a model call fails with a retryable error (HTTP 429/5xx, or a message matching `retryOnPatterns`), ocmm:

1. Resolves the failing agent's `ModelRequirement` (user config → built-in defaults).
2. Marks the just-failed model as failed with a timestamp.
3. Finds the next entry in the fallback chain that is not in cooldown (default 60s).
4. Dispatches a new `client.session.prompt` call with the next model, reusing the last user message's parts.
5. Aborts the original session first (best-effort).

Configuration:

```jsonc
"runtimeFallback": {
  "enabled": true,           // master switch (false = event hook no-ops)
  "dispatch": true,          // false = observe-only (classify + log, no retry)
  "maxAttempts": 3,          // cap per session
  "cooldownSeconds": 60,     // skip a failed model for this long
  "retryOnStatusCodes": [429, 500, 502, 503, 504],
  "retryOnPatterns": ["rate limit", "overloaded", /* ... */]
}
```

Abort errors (`AbortError`, `MessageAbortedError`, `isAbort: true`) are never retried. Deduplication is enforced via an in-flight `Set<sessionID>` so a single error cannot trigger duplicate dispatches.

## Develop

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Tests use `node --test --experimental-strip-types` (Node 22+). No bundler, no test framework dependencies. 105 tests across config, routing, intent, hooks, and runtime-fallback.

### Isolated QA

A real-OpenCode smoke harness lives under `%LOCALAPPDATA%\Temp\opencode\ocmm-test\` (not in the repo). It spins up an isolated XDG config tree, points the plugin at a single `hoo` provider, and runs `opencode run` / `opencode debug agent` scenarios. See `.kb/` for the design notes behind it.

## Knowledge base

`.kb/` contains the design notes, category/agent tables, and the source-of-truth for the routing rules. Read `.kb/00-overview.md` first.
