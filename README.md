# ocmm — OpenCode Multi-Model Auto-Router

A small OpenCode plugin that auto-routes per-agent models, translates a single "variant" knob into provider-specific reasoning settings, attaches workflow-specific prompts declaratively at config time, and reactively falls back to the next model in a chain when the active model fails at runtime.

Concepts (model tiering, per-model specialized prompts, intent gating, proactive + reactive fallback) are inspired by [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode); naming and code are independent.

## What it does

| Hook                                 | What ocmm does                                                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`                             | Registers 11 agents + 10 category-subagents with their preferred provider/model, shared skill paths, and slash commands. Attaches functional agent prompts plus workflow/model-family deepwork prompts to built-in agents, and category prompts to category subagents. User config can add, override, or disable any of them. |
| `chat.params`                        | Resolves the variant for the active agent/model (4-tier priority: user-config -> agent-default -> category-default -> input-variant), respects explicit user choices, and applies only the model-family parameters ocmm supports for that model. Built-in defaults normalize category work to model-appropriate high/max reasoning where supported and avoid implicit Opus 4.7+ thinking budgets.                  |
| `chat.message`                       | v1 workflow: queues superpowers skills content on the first message per session. Also expands bare ocmm slash commands in noninteractive `opencode run` input so `/ralph-loop ...` and shared-skill commands get command context even when the TUI slash parser is bypassed. |
| `experimental.chat.system.transform` | Prepends queued v1 skill content and one-shot slash command context to `output.system`. omo workflow only uses this hook when a bare slash command was expanded by `chat.message`.                                                                                                               |
| `event`                              | Cleans up per-session state on `session.deleted` / `session.idle`. On `session.error`: classifies the error, and if retryable, dispatches the next model in the agent's fallback chain via `client.session.prompt`. When `idleContinuation.enabled` is true, on `session.idle` with unfinished todos and no prior ESC abort, re-prompts the model to continue. ESC aborts (detected via abort errors on `session.error`) suppress continuation. |
| `command.execute.before`            | Handles the `/idle-continuation` slash command to toggle idle auto-continuation per session (`on` / `off` / `status`). Session overrides win over global `idleContinuation.enabled` config. |

The plugin **does not** change the model on a per-call basis via `chat.params`. OpenCode's `chat.params` output schema has no `model` field. Per-agent routing happens via the `config` hook (the only safe seam for model selection), and reactive re-routing happens via the `event` hook + `client.session.prompt`.

## Workflows

ocmm supports two workflows, switchable via the `workflow` config field:

**`omo`** (default) — Upstream oh-my-opencode system prompts. Aggressive tone (CODE RED, ABSOLUTE CERTAINTY). Prompts are attached declaratively to agents at config time based on model family.

**`v1`** — Skill-driven deepwork workflow. The config/path label stays `v1`, but model-facing prompt text calls it `deepwork`. The default prompt is a concise local controller; GPT/Gemini/GLM/Codex/planner variants stay close to upstream omo model-specific prompt style with local tool/agent/path adaptation. Skills are injected on the first message per session via `chat.message` + `system.transform` hooks.

```jsonc
{ "workflow": "v1" }
```

## Install

### From npmjs.org

The main `ocmm` package is published to npmjs.org as `ocmm`. Native LSP binaries are per-platform optional dependencies — npm installs the matching platform package for your system automatically. Use `--omit=optional` to skip native binaries if you only need the plugin logic:

```bash
pnpm add ocmm
# or: npm install ocmm
```

The npm tarball excludes native LSP binaries to keep it platform-agnostic. When installed with default options, the matching `ocmm-lsp-<platform>` optional package is fetched from npmjs.org alongside the main package. Runtime resolution: optional platform package first, then bundled `dist/bin` fallback (GitHub Release/Codex tarballs only), then local build / PATH.

```jsonc
// opencode.json
{ "plugin": ["./node_modules/ocmm/dist/index.js"] }
```

For Codex, add the installed package root as a local marketplace:

```bash
codex plugin marketplace add ./node_modules/ocmm --json
codex plugin add deepwork@deepwork-local --json
```

### From GitHub Release

Main package releases (`vX.Y.Z`) publish self-contained OpenCode/Codex plugin tarballs and their checksums. Standalone native `ocmm-lsp-*` executables and platform package `.tgz` assets belong to the separate `ocmm-lsp-vA.B.C` release lane.

A main `vX.Y.Z` release contains:

- `ocmm-opencode-plugin-<version>.tgz` — package-manager install package for the OpenCode plugin, CLI wrappers, Codex bundle, and bundled native binaries.
- `deepwork-codex-plugin-<version>.tgz` — direct Codex plugin package root for local marketplace installation.
- `SHA256SUMS.txt` — checksums for every release asset.

For OpenCode, install the release tarball asset URL with your package manager:

```bash
VERSION=0.1.1
pnpm add "https://github.com/<owner>/ocmm/releases/download/v${VERSION}/ocmm-opencode-plugin-${VERSION}.tgz"
```

The release tarball bundles the OpenCode plugin, the `ocmm`, `ocmm-profiles`, and `ocmm-lsp` CLI wrappers, plus platform-suffixed native `ocmm-lsp` binaries under `dist/bin/`.
It also includes the Codex marketplace file and a self-contained generated plugin bundle under `.agents/plugins/marketplace.json` and `plugins/deepwork/`; the Codex bundle carries its own plugin-local `dist/cli`, `dist/shared`, and `dist/bin` runtime so Codex's plugin cache can run the default `lsp` MCP.

```jsonc
// opencode.json
{ "plugin": ["./node_modules/ocmm/dist/index.js"] }
```

For Codex, either add the installed package root as a local marketplace:

```bash
codex plugin marketplace add ./node_modules/ocmm --json
codex plugin add deepwork@deepwork-local --json
```

Or install directly from the Codex release package. The tarball is package-root-shaped, so extract it to a directory such as `.codex-plugins/deepwork` and point the marketplace at that directory:

```bash
VERSION=0.1.1
curl -L -o "deepwork-codex-plugin-${VERSION}.tgz" "https://github.com/<owner>/ocmm/releases/download/v${VERSION}/deepwork-codex-plugin-${VERSION}.tgz"
mkdir -p .codex-plugins/deepwork
tar -xzf "deepwork-codex-plugin-${VERSION}.tgz" -C .codex-plugins/deepwork
codex plugin marketplace add ".codex-plugins/deepwork" --json
codex plugin add deepwork@deepwork-local --json
```

### From GitHub Packages

The release workflow can also publish the same package contents to GitHub Packages as `@<owner>/ocmm`. This still avoids npmjs.org, but installs through `npm.pkg.github.com` and normally requires a GitHub personal access token with `read:packages` in `.npmrc`:

```ini
@<owner>:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<github_pat_with_read:packages>
```

```bash
pnpm add @<owner>/ocmm
```

```jsonc
// opencode.json
{ "plugin": ["./node_modules/@<owner>/ocmm/dist/index.js"] }
```

For Codex, use the scoped package root as the marketplace root:

```bash
codex plugin marketplace add ./node_modules/@<owner>/ocmm --json
codex plugin add deepwork@deepwork-local --json
```

In GitHub Actions, `${GITHUB_TOKEN}` can be used instead of a personal token when the workflow has package read permission.

### Native LSP Support

ocmm ships the `ocmm-lsp` native binary in multiple forms:

- **npm optional platform packages**: 8 per-platform packages published to npmjs.org (`ocmm-lsp-linux-x64-gnu`, `ocmm-lsp-linux-arm64-gnu`, `ocmm-lsp-linux-x64-musl`, `ocmm-lsp-linux-arm64-musl`, `ocmm-lsp-darwin-x64`, `ocmm-lsp-darwin-arm64`, `ocmm-lsp-windows-x64`, `ocmm-lsp-windows-arm64`). npm installs the matching one automatically based on your OS, CPU, and libc.
- **bundled inside GitHub Release tarballs** under `dist/bin/` and `plugins/deepwork/dist/bin/`;
- **standalone release assets** named `ocmm-lsp-*` for direct download or custom `OCMM_LSP_COMMAND` setups.

Runtime resolution priority (first match wins):

1. Optional npm platform package (`node_modules/ocmm-lsp-<platform>/bin/ocmm-lsp-<target>`)
2. Bundled release binary (`dist/bin/ocmm-lsp-<target>`) — GitHub Release tarballs only
3. Local Cargo release/debug build
4. `cargo run` from `crates/ocmm-lsp/`
5. PATH `ocmm-lsp`

Linux builds cover both glibc (GNU) and musl libc targets, so Alpine and other musl-based distributions are now fully supported out of the box.

Native binaries are built for:

| Platform | npm package | Asset |
| --- | --- | --- |
| Linux x64 glibc | `ocmm-lsp-linux-x64-gnu` | `ocmm-lsp-x86_64-unknown-linux-gnu` |
| Linux arm64 glibc | `ocmm-lsp-linux-arm64-gnu` | `ocmm-lsp-aarch64-unknown-linux-gnu` |
| Linux x64 musl | `ocmm-lsp-linux-x64-musl` | `ocmm-lsp-x86_64-unknown-linux-musl` |
| Linux arm64 musl | `ocmm-lsp-linux-arm64-musl` | `ocmm-lsp-aarch64-unknown-linux-musl` |
| macOS x64 | `ocmm-lsp-darwin-x64` | `ocmm-lsp-x86_64-apple-darwin` |
| macOS arm64 | `ocmm-lsp-darwin-arm64` | `ocmm-lsp-aarch64-apple-darwin` |
| Windows x64 | `ocmm-lsp-windows-x64` | `ocmm-lsp-x86_64-pc-windows-msvc.exe` |
| Windows arm64 | `ocmm-lsp-windows-arm64` | `ocmm-lsp-aarch64-pc-windows-msvc.exe` |

ocmm registers the built-in OpenCode MCP named `lsp` with the project-owned `ocmm-lsp mcp` server by default. Resolution prefers optional npm platform package first, then bundled release binaries in `dist/bin/`, then local Cargo release/debug builds, then `cargo run` from `crates/ocmm-lsp/`, then a PATH `ocmm-lsp`. Set `OCMM_LSP_COMMAND` to force a custom command, add `disabledMcps:["lsp"]` to disable it, or define `mcp.servers.lsp` to override the built-in.

For direct external-program use, download the matching standalone asset from the `ocmm-lsp-vA.B.C` release and point `OCMM_LSP_COMMAND` at it:

```bash
LSP_VERSION=0.1.1
curl -L -o ~/.local/bin/ocmm-lsp "https://github.com/<owner>/ocmm/releases/download/ocmm-lsp-v${LSP_VERSION}/ocmm-lsp-x86_64-unknown-linux-gnu"
chmod +x ~/.local/bin/ocmm-lsp
OCMM_LSP_COMMAND="$HOME/.local/bin/ocmm-lsp" opencode run "check diagnostics"
```

Plain `OCMM_LSP_COMMAND` values automatically receive the `mcp` argument. Use a JSON array, for example `["/path/to/ocmm-lsp","mcp"]`, only when you need exact argument control.

### From source

```bash
pnpm install
pnpm run build
```

Then point your OpenCode config at the built plugin:

```jsonc
// opencode.json
{ "plugin": ["./node_modules/ocmm/dist/index.js"] }
```

Or use the `ocmm` shim binary (see below) to launch opencode with automatic plugin loading and config isolation.

## Codex adapter

ocmm also ships a Codex plugin bundle generated from the same local workflow data:

```
.agents/plugins/marketplace.json
plugins/deepwork/
  .codex-plugin/plugin.json
  .mcp.json
  package.json
  agents/*.toml
  dist/{cli,shared,bin}/
  skills/*
```

Generate or refresh it after changing prompts, skills, agents, categories, or MCP config logic:

```bash
pnpm run gen:codex-plugin
```

The generator is intentionally separate from the OpenCode runtime. It reads project config from `<project>/.codex/ocmm.jsonc` first, then `<project>/.opencode/ocmm.jsonc`; it does **not** read user-global config by default, so local provider names or secrets are not baked into the committed Codex bundle. If no project config exists, it uses ocmm defaults.

Install into an isolated Codex home for testing:

```powershell
$env:CODEX_HOME = "$env:LOCALAPPDATA\Temp\codex\ocmm-test"
mkdir.exe -p $env:CODEX_HOME
codex plugin marketplace add . --json
codex plugin add deepwork@deepwork-local --json
codex plugin list --available --json
```

The Codex plugin exposes:

- copied ocmm shared skills plus flattened `deepwork-*` skills from `skills/v1/`;
- a `deepwork` skill that maps ocmm's planning/delegation semantics to Codex tools;
- plugin-scoped MCP servers generated from ocmm's MCP config, including the default `lsp` MCP served by the plugin-local `ocmm-lsp` wrapper;
- generated `dw-*` Codex agent TOML files under `plugins/deepwork/agents/` for installers or local agent registration, including functional agents such as `dw-oracle`, `dw-oracle-high`, and `dw-creative`.

OpenCode still uses `dist/index.js` and its OpenCode hook surface. The Codex adapter does not import or mutate the OpenCode plugin module at runtime.

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
  "disabledMcps": [],

  "skills": {
    "sources": [],
    "enable": [],
    "disable": []
  },

  "agents": {
    "reviewer": {
      "model": "<provider>/<primary-reasoning-model>",
      "variant": "max",
    },
    "orchestrator": {
      "model": "<provider>/<primary-reasoning-model>",
      "variant": "max",
      "fallbackModels": [
        "<provider>/<fallback-reasoning-model>",
        { "providers": ["<provider>"], "model": "<fallback-model>", "variant": "high" },
      ],
    },
    "builder": {
      "requirement": {
        "variant": "high",
        "requiresProvider": ["<provider>"],
        "fallbackChain": [
          { "providers": ["<provider>"], "model": "<implementation-model>", "variant": "high" },
        ],
      },
    },
  },

  "categories": {
    "hard-reasoning": {
      "model": "<provider>/<primary-reasoning-model>",
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
    "subagent429": {
      "enabled": true,
      "maxRetries": 5,
      "providerScopes": {
        "anthropic": "provider",
        "openai": "model"
      }
    }
  },

  "subagent": {
    "maxDepth": 3
  },

  "idleContinuation": {
    "enabled": false,
    "maxContinuations": 20,
    "prompt": "Your todo list has unfinished items. Continue with the next pending or in-progress task. Do not ask for confirmation — proceed."
  },

  "mcp": {
    "enabled": true,
    "envAllowlist": ["EXA_API_KEY", "CONTEXT7_API_KEY"],
    "websearch": { "provider": "exa" }, // "exa" or "tavily"
    "servers": {
      // Explicit entries override built-ins. Use this to replace or pin lsp.
      // "lsp": { "type": "local", "command": "custom-lsp", "args": ["mcp"] }
    }
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

## Hook defaults

`disabledHooks` in config controls which hooks are active. Default: `["directory-readme-injector"]` — only the directory README injector is disabled out of the box; all other hooks are enabled. The full list:

| Hook name | Default | Purpose |
| --- | --- | --- |
| `directory-readme-injector` | **Disabled** | Read tool output appends the nearest `README.md` once per directory/session; disabled by default. |
| `directory-agents-injector` | Enabled | Read tool output appends `AGENTS.md` directory context found upward from the read file, within project root, once per directory/session. |
| `rules-injector` | Enabled | Appends configured rule blocks to matching Read/Write/Edit tool output when rules are enabled. |
| `write-existing-file-guard` | Enabled | Tracks Read permissions; blocks `write` overwriting existing files and `edit`/`multiedit`/patch-style edits without prior read where applicable. |
| `notepad-write-guard` | Enabled | Blocks `write`/`edit`/`multiedit` under `.omo/notepads/` and `.sisyphus/notepads/`. |
| `bash-file-read-guard` | Enabled | Warns when a Bash command appears to be a simple file read (`cat`, `head`, `tail`); does not block. |
| `bash-file-write-guard` | Enabled | Blocks Bash commands that write to existing project files through redirects, `tee`/`dd`/`install`/`truncate`, in-place editors, copy/move overwrites, or nested shell scripts. |
| `question-label-truncator` | Enabled | Truncates ask-user-question option labels over 30 chars. |
| `tasks-todowrite-disabler` | Enabled | Blocks `todoread` while the task system is active, making `todowrite` the source of truth. |
| `webfetch-redirect-guard` | Enabled | Resolves HTTP redirects and rewrites the WebFetch URL to the final URL. |
| `empty-task-response-detector` | Enabled | Replaces empty Task tool output with a warning/notice. |
| `comment-checker` | Enabled | Warns on AI-attribution comments in `write`/`edit`/`multiedit` content unless a bypass marker is present. |
| `plan-format-validator` | Enabled | Warns on malformed checklist lines in `.omo/plans/*.md` writes/edits. |
| `read-image-resizer` | Enabled | Appends a dependency-free build notice for image Read outputs; does not resize. |
| `json-error-recovery` | Enabled | Appends recovery instructions when tool output contains JSON parse errors. |
| `fsync-skip-warning` | Enabled | Appends drained fsync skip warnings from the fsync tracker. |
| `tool-output-truncator` | Enabled | Truncates very large selected tool outputs. |
| `todo-description-override` | Enabled | Overrides the `todowrite` tool description with ocmm’s structured todo format. |
| `commit-guard-injector` | Enabled | Injects the no-autonomous-git-write constraint into the system prompt. |
| `subagent-git-guard` | Enabled | Blocks git write commands in subagent sessions except allowed temp-repo cases. |
| `subagent-depth-guard` | Enabled | Blocks `task` dispatches that would exceed `subagent.maxDepth`; default max depth is 3 subagent layers. |

## Variant policy

`variant` is a routing hint, not a portable provider API. ocmm normalizes it by model family before writing `chat.params`:

| Model family | ocmm behavior |
| ------------ | ------------- |
| Explicit user config or request | Respected as written except for review/plan-review floors: `reviewer`, `oracle`, `oracle-high`, and `plan-critic` are raised to the model family's xhigh-equivalent/highest-supported review effort when possible. |
| GPT-like non-mini built-in defaults | Built-in defaults never request below `high`; category defaults from `coding` upward resolve to `max`. GPT-5.6 supports native `reasoningEffort=max`; other GPT-like/Codex-like families use their catalog-supported maximum effort. |
| GPT-like mini | Keeps the provider's full low-effort ladder, including `minimal`, `low`, and no-op `none` when supported. |
| Claude Opus 4.7+ / Fable | Built-in defaults do not emit an ocmm-owned `thinking` budget or `reasoningEffort`; explicit non-review user config is passed through as written, while review/plan-review agents still receive the xhigh-equivalent floor when possible. |
| Older Claude | Uses Anthropic `thinking` budgets for non-`none` variants. |
| Gemini | Uses `reasoningEffort`; high and above also enable provider thinking. |
| Latest GLM / DeepSeek | Built-in defaults normalize low/medium-style local variants to canonical high/max controls where the provider family supports them; non-review explicit user config or request variants are left as written. |
| Category defaults | `quick` stays lightweight. Built-in category defaults from `coding` upward resolve to `max`; explicit user category config or input variants are respected as written. |
| Kimi / MiniMax / unknown | Uses the existing temperature shaping fallback when no better family-specific knob exists. |

## Built-in agents

```
orchestrator    primary reasoning lane          variant=max     main coordinator
builder         implementation lane             variant=high    autonomous implementer
reviewer        primary review lane             xhigh floor     read-only consultant
oracle          cross-check lane                xhigh floor     self-supervision reviewer (heterogeneous when configured/available)
oracle-high     supplemental high-effort review variant=max     optional third reviewer (explicit config only)
doc-search      lightweight lookup lane         (none)          external docs / OSS lookup
code-search     lightweight lookup lane         (none)          internal codebase grep
planner         primary reasoning lane          variant=max     work-plan author
clarifier       analysis lane                    (none)          pre-plan analysis
plan-critic     primary review lane             variant=xhigh   plan QA
media-reader    multimodal-capable lane         variant=high    multimodal analysis
```

## Built-in categories (also registered as subagents)

```
frontend        UI/multimodal-capable lane   variant=high    UI/UX, layout, styling, visual QA
creative        creative-capable lane        variant=high    concepts, naming, narrative, framing
hard-reasoning  primary reasoning lane       variant=xhigh   ultrabrain-style decisions and tradeoffs
research        research-capable lane        variant=high    missing-fact investigation and evidence gathering
quick           lightweight lane             (none)          fully specified mechanical edits
coding          implementation lane          (none)          determined code edits and bug fixes
normal-task     implementation lane          (none)          ordinary bounded tasks
complex         coordinated-work lane        variant=high    coordinated multi-step ordinary tasks
deep            primary reasoning lane       variant=max     autonomous system development and delivery
documenting     prose-capable lane           (none)          standalone documentation and prose
```

Rows above describe built-in selection lanes, not required provider channels or model IDs. Example model names elsewhere in the repository are references only; explicit user configuration and the currently available model catalog decide the actual model. Agent rows show source defaults or enforced review floors; category rows show the **raw source values** from `src/data/categories.ts`. At runtime the variant policy normalizes categories from `coding` upward to model-appropriate `max` unless the user explicitly overrides them; see the variant policy table above. Entries marked `(none)` carry no built-in variant and rely on this normalization.

The primary structure is `orchestrator` plus six functional agents: `reviewer`, `oracle`, `oracle-high`, `planner`, `clarifier`, and `plan-critic`. `oracle` is an independent built-in agent for self-supervision with a configured cross-check / heterogeneous review default, and it shares the reviewer prompt via `promptSource: "reviewer"`. `oracle-high` reuses the reviewer prompt but is not a `reviewer` alias; it is an optional supplemental high-effort reviewer used only when explicitly configured, available, and not disabled. Supporting utility agents (`builder`, `doc-search`, `code-search`, `media-reader`) still use the workflow/model-family deepwork prompt without an additional role prompt. `builder` is registered with `mode:"primary"`; `planner` is registered with `mode:"all"` so it can be selected directly and used as a delegated task agent. Each category has a prompt under `prompts/<workflow>/category/<name>.md` that is set as the category-subagent's system prompt. Callers invoke categories via `task(category="deep", ...)` or direct subagent names such as `@deep` and `@quick`. The upstream-style compatibility alias `@explore` maps to local `code-search`; `@oracle` selects the independent local `oracle` agent rather than aliasing `reviewer`.

## Prompt architecture

Prompts are organized by workflow:

```
prompts/
  omo/                              # upstream omo prompts
    deepwork/{default,gpt,gpt-5.6,gemini,glm,codex,planner}.md
    agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
    category/*.md (10 files)
  v1/                               # superpowers-style prompts
    deepwork/{default,gpt,gpt-5.6,gemini,glm,codex,planner}.md
    agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
    category/*.md (10 files)
skills/
  ast-grep/                          # shared skills registered as OpenCode skills + slash commands
  debugging/
  frontend/
  git-master/
  init-deep/
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

Variant is selected at config time using the final selected agent model after explicit user configuration, inherited aliases, and catalog-confirmed upgrades are considered. For built-in functional agents, ocmm composes `agents/<name>.md` with the selected `deepwork/<variant>.md`; the role prompt is authoritative for that agent's scope and the deepwork prompt supplies workflow/model calibration. Categories receive only their category prompt. No runtime keyword detection — prompts are attached declaratively.

For v1 workflow, superpowers skills are injected on the first message per session via `chat.message` (queue) + `system.transform` (prepend). For omo workflow, prompts are attached declaratively at config time; `chat.message` and `system.transform` only participate when a bare noninteractive slash command needs compatibility expansion.

## Slash Commands

ocmm registers OpenCode `config.command` entries for:

- Shared skills under `skills/`, available as `/git-master`, `/ast-grep`, `/frontend`, `/debugging`, and `/init-deep` by default.
- v1 injected deepwork skills when `workflow:"v1"` is active, available as `/brainstorming`, `/writing-plans`, `/subagent-driven-development`, `/requesting-code-review`, and `/receiving-code-review`. In v1, ocmm also adds `skills/v1` to OpenCode skill paths so native skill slash resolution works without "skill not found" noise.
- Loop protocol commands `/ralph-loop`, `/audit-loop`, and `/dwloop` (`/dwloop` is the deepwork-loop alias for `/audit-loop`).

Interactive OpenCode uses its native slash-command parser. For noninteractive `opencode run "/command args"` calls, OpenCode 1.17.9 passes the first message directly and does not parse project commands; ocmm compensates by expanding bare ocmm command text during `chat.message` and injecting the expanded command once through `system.transform`.

The loop commands are command-template entry points only. The full upstream omo idle continuation engine, verifier orchestration, Boulder/Atlas state, and cancel/stop hooks are not yet migrated; the templates explicitly tell the model to run the loop inside the current session and not claim hidden auto-continuation. The Ralph Loop runtime and related hooks are tracked as follow-up work in `docs/kb/omo-features/loops.md`.

ocmm does not ship a separate `/lsp-setup` command. OpenCode already provides LSP setup guidance, while ocmm's responsibility is to register and distribute the default `lsp` MCP backed by `ocmm-lsp`. Configure external language servers through `.opencode/ocmm-lsp.json`, `.opencode/lsp.json`, or `.codex/lsp-client.json` when overrides are needed.

## Profiles

A **profile** is a named partial overlay on the base config. It can override any top-level field (agents, categories, runtimeFallback, subagent, debug, etc.) except `profiles` and `activeProfile` themselves. At load time, after merging user + project configs, the active profile is deep-merged over the result — profile wins over both.

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
| Objects (`agents`, `categories`, `runtimeFallback`, `subagent`) | Deep-merged (profile field wins per-key)       |
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

When a model call falls through to generic runtime fallback (HTTP 429/5xx, or a message matching `retryOnPatterns`), ocmm:

1. Resolves the failing agent's `ModelRequirement` (user config -> built-in defaults).
2. Marks the just-failed model as failed with a timestamp.
3. Finds the next entry in the fallback chain that is not in cooldown (default 60s).
4. Dispatches a new `client.session.prompt` call with the next model, reusing the latest contiguous user-message block.
5. Aborts the original session first (best-effort).

### Subagent 429 recovery

New child sessions have a dedicated recovery path only for retryable errors with an explicit HTTP status of `429`. It recognizes the OpenCode parent-session fields `parentID`, `parentId`, `parentSessionID`, and `parentSessionId` when the child is created; root sessions, untracked sessions, and regex-only matches remain on generic fallback. A non-429 error before the child enters the dedicated path leaves it on the generic path.

Each dedicated 429 waits for two signals before retrying or switching: its delay timer and the idle event owned by that error. Dedicated dispatches do **not** abort the child session; generic fallback continues to use a best-effort abort. Recovery hints longer than 10 minutes become a zero-delay probe, while hints of 10 minutes or less wait in full. With no hint, the wait uses capped equal-jitter exponential backoff (1-second base, 30-second cap).

`subagent429.maxRetries` defaults to 5 and is scoped to a model by default. Set it to 0 to prepare a switch immediately (the two signals still gate dispatch). A configured provider scope blocks every model of that provider, but only in the current child session. Every newly selected model starts with a fresh retry budget; `runtimeFallback.maxAttempts` counts only committed model switches, not same-model dedicated retries.

While a dedicated dispatch is active, the first queued provider outcome takes priority over idle. A queued 429 continues the dedicated flow after the active dispatch settles; a queued non-429 error hands off to generic fallback after settlement; and a bare `false` dispatch result with no queued outcome stops the dedicated flow. With `runtimeFallback.dispatch: false`, ocmm is observe-only and dispatches neither dedicated retries nor generic fallback. Dedicated state is never shared between child sessions.

```jsonc
"runtimeFallback": {
  "enabled": true,
  "dispatch": true,
  "maxAttempts": 3,
  "cooldownSeconds": 60,
  "retryOnStatusCodes": [429, 500, 502, 503, 504],
  "retryOnPatterns": ["rate limit", "overloaded", "..."],
  "subagent429": {
    "enabled": true,
    "maxRetries": 5,
    "providerScopes": {
      "anthropic": "provider",
      "openai": "model"
    }
  }
}
```

Abort errors are never retried. Deduplication is enforced via an in-flight `Set<sessionID>`.

## Develop

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Tests use `node --test --experimental-strip-types` (Node 22+) plus `cargo test` for the native `ocmm-lsp` MCP server in `crates/ocmm-lsp/`. `pnpm run build` emits TypeScript into `dist/` and copies the Rust release binary into `dist/bin/` as both the target-triple release name and the local fallback name.

## Release

ocmm publishes through two independent release lanes.

### ocmm-lsp release

1. Bump `crates/ocmm-lsp/Cargo.toml` version.
2. Tag `ocmm-lsp-vA.B.C` and push.
3. CI builds 8 native binaries (Linux glibc x64/arm64, Linux musl x64/arm64, macOS x64/arm64, Windows x64/arm64).
4. CI publishes 8 npm platform packages to npmjs.org through npm Trusted Publishing (GitHub Actions OIDC).
5. CI publishes standalone native binaries, platform package tarballs (`ocmm-lsp-<platform-package>-<version>.tgz`), and `SHA256SUMS.txt` to the GitHub Release.

### ocmm release

1. Set `package.json.version` and `package.json.ocmm.lspVersion` (must match an already-published `ocmm-lsp-vA.B.C` release).
2. Regenerate the Codex plugin bundle: `pnpm run build:ts && pnpm run gen:codex-plugin`.
3. Tag `vX.Y.Z` and push.
4. CI downloads pinned `ocmm-lsp-v<lspVersion>` release assets, bundles them into GitHub Release tarballs.
5. CI publishes to npmjs.org as `ocmm` through npm Trusted Publishing (GitHub Actions OIDC).
6. On tag pushes, CI also publishes `@<owner>/ocmm` to GitHub Packages (optional for manual dispatch).
7. CI publishes self-contained tarballs (`ocmm-opencode-plugin-X.Y.Z.tgz`, `deepwork-codex-plugin-X.Y.Z.tgz`) and `SHA256SUMS.txt` to the GitHub Release.

The npm tarball excludes native LSP binaries (platform-agnostic, relies on optional dependency resolution). GitHub Release tarballs are self-contained with bundled native binaries for all 8 platforms.

Required npm configuration:
- Configure npm Trusted Publishing for `ocmm` and each `ocmm-lsp-*` platform package, with GitHub repository `hugefiver/ocmm`, workflow filename `release.yml` (the file at `.github/workflows/release.yml`), and publish permission enabled. The workflow uses GitHub Actions OIDC (`id-token: write`) and does not require an npm token for npmjs.org publishes.

### Live integration test

See `AGENTS.md` for the full live test procedure using isolated XDG dirs.

## License

Licensed under the **Anti American AI Public License (AAAPL)** — see [`LICENSE`](./LICENSE) (English), [`LICENSE.zh.md`](./LICENSE.zh.md) (Chinese), or [`LICENSE.bilingual.md`](./LICENSE.bilingual.md) (authoritative bilingual reference).

SPDX identifier: `LicenseRef-AAAPL`.

## Architecture & internals

For design rationale, hook flow, the 4-tier variant resolution pipeline, two-layer fallback system, and config schema overview, see [`docs/architecture.md`](./docs/architecture.md).

Authoritative agent and category definitions live in `src/data/agents.ts` and `src/data/categories.ts`. For prompt provenance, see [`docs/v1-maintenance.md`](./docs/v1-maintenance.md) (v1/deepwork) and [`docs/prompt-sync.md`](./docs/prompt-sync.md) (omo).
