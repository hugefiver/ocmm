# Architecture

This document captures ocmm's design rationale, hook flow, and routing pipeline. It supersedes the former `.kb/` knowledge base (removed as stale Phase-1 documentation). For the authoritative agent/category definitions, see `src/data/agents.ts` and `src/data/categories.ts`. For prompt provenance, see [`v1-maintenance.md`](./v1-maintenance.md) and [`prompt-sync.md`](./prompt-sync.md).

## Goals

1. **Config-driven auto-routing** — route each request to the right model+variant based on the active agent and delegate_task category, with no per-call user input required.
2. **Variant knob translation** — translate an abstract `variant` (e.g. `high`, `max`) into provider-specific parameters (`reasoningEffort`, `thinking`, `temperature`) via `chat.params`, since OpenCode locks the model before the hook fires.
3. **System context injection** — inject v1 deepwork skills and noninteractive slash-command context into the system message via `chat.message` + `experimental.chat.system.transform`; omo prompts are attached declaratively during `config`.
4. **Model-specialized prompt variants** — pick the right deepwork prompt variant per model family (default/gpt/gemini/glm/codex/planner).
5. **Reactive runtime fallback** — on `session.error`, retry with the next model in the agent's fallback chain via `client.session.prompt`.
6. **Honor user overrides** — user config always wins over built-in defaults; explicit config always wins over family-policy defaults.
7. **Emit routing ledger** — append resolution entries to the OpenCode routing ledger for observability (capped at 256).
8. **Expose skill/loop slash commands** — register shared skills, v1 deepwork skills, and loop protocol templates through OpenCode's `config.command`; expand bare ocmm slash commands in `opencode run` input as a compatibility path.
9. **Own the default LSP MCP** — register the built-in OpenCode MCP name `lsp` with the project-owned native `ocmm-lsp mcp` server instead of depending on upstream `omo-lsp`.

## Non-goals

- No custom `delegate_task` tool — use OpenCode's built-in task tool.
- No team-mode orchestration or Boulder/Atlas runtime — out of scope.
- No full Ralph/audit idle auto-continuation engine yet — ocmm currently exposes `/ralph-loop`, `/audit-loop`, and `/dwloop` command templates only.
- No per-agent `runtimeFallback` override — fallback config is global.
- No npm long-lived token requirement — npmjs.org releases use npm Trusted Publishing through GitHub Actions OIDC.

## Two-axis routing matrix

Routing resolves along two independent axes through the same pipeline:

| Axis | Signal | Output |
|---|---|---|
| **Work category** | `delegate_task` category argument, or user prompt prefix | Default model + variant for the category |
| **Agent identity** | Active agent name | Agent's fallback chain |

Both axes feed the same 4-tier resolution pipeline (below), producing a variant that is then translated to provider params.

## 4-tier variant resolution

Priority (highest wins), implemented in `src/routing/resolver.ts`:

1. **User config** — `agents[name]` override from the user's `ocmm.jsonc`. `normalizeShorthand` expands shorthand entries. `disabled: true` causes fall-through to the next tier.
2. **Agent default** — `BUILTIN_AGENT_INDEX` from `src/data/agents.ts` (11 built-in agents).
3. **Category default** — user `categories[name]` override, else `BUILTIN_CATEGORY_INDEX` from `src/data/categories.ts` (10 built-in categories; categories are also registered as `mode:subagent`).
4. **Input variant** — synthetic entry composed from the current model + `message.variant` (the variant the user/agent explicitly requested for this turn).

### `resolveAgainstRequirement`

```
resolveAgainstRequirement(req, modelID, inputVariant, source)
  → pickFromChain(req.fallbackChain, modelID)
    → exact fallback entry match
    → catalog-successor match for configured GPT lane successors or GLM 5.2+
    → boundary-delimited prefix fallback entry match
```

`entryMatches`: exact match **or** `modelID` starts with `entry.model` on a `-`, `_`, or `.` boundary (forward-prefix only). Reverse prefix is intentionally **not** matched, so a shorter chain entry doesn't swallow newer model IDs. If no exact, successor, or prefix entry matches, the chain's first entry is used.

Effective variant comes from the matched entry's `variant`, or `req.variant`. `inputVariant` overrides the **variant** but not the **model**.

### `source` values

`source ∈ {user-config, agent-default, category-default, input-variant, no-op}` — recorded in the ledger entry:

```
{ ts, sessionID, agent, input:{providerID, modelID, variant}, applied:{variant, reasoningEffort}, source }
```

## Variant → parameter translation

Per model family (implemented in `src/routing/variant-translator.ts` + `src/intent/model-family.ts`):

| Variant | GPT-like / Codex-like | Claude | Gemini | Temperature |
|---|---|---|---|---|
| `none` | no-op | no-op | no-op | — |
| `minimal` | reasoningEffort=minimal | thinking disabled | reasoningEffort=minimal | 0.0 |
| `low` | reasoningEffort=low | thinking 2k | reasoningEffort=low | 0.2 |
| `medium` / `auto` | reasoningEffort=medium | thinking 6k | reasoningEffort=medium | 0.5 |
| `high` / `thinking` | reasoningEffort=high | thinking 12k | reasoningEffort=high + provider thinking | 0.7 |
| `xhigh` | reasoningEffort=xhigh | thinking 16k | reasoningEffort=high + provider thinking | 0.85 |
| `max` | reasoningEffort=max on GPT-5.6; xhigh otherwise | thinking 24k | reasoningEffort=high + provider thinking | 1.0 |

**Family policy notes:**
- Explicit user config is respected except that review/plan-review agents are raised to an xhigh-equivalent floor when the selected model family exposes supported high-effort controls.
- GPT/Codex non-mini defaults never drop below `high`.
- GPT/Codex mini keeps the full ladder including `minimal`/`low`/`none`.
- Claude Opus 4.7+ / Fable: no ocmm-owned thinking budget for built-in defaults; review/plan-review agents still receive the xhigh-equivalent floor when explicitly configured with lower effort.
- Older Claude uses Anthropic thinking budgets per the table.
- GLM / DeepSeek normalize local variants.
- Categories `coding` and above resolve to `max` at runtime; `quick` stays lightweight.
- Kimi / MiniMax / unknown: temperature shaping fallback.

## Two-layer fallback

### Proactive layer — `chat.params`

Runs **before** the request leaves OpenCode. Resolves the variant via the 4-tier pipeline, translates it to `reasoningEffort`/`thinking`/`temperature`, and applies to `output.options` / `output.temperature`. **The model is NOT changed** — `chat.params`'s output schema has no `model` field; the model is locked before the hook fires.

**Constraint:** `output` only allows `temperature`, `topP`, `topK`, `maxOutputTokens`, `options.{reasoningEffort, thinking}`.

Flow: `input.agent` + `input.model` → 4-tier resolve → `classifyModelFamily` → `translateVariant` → mutate output → append `ResolutionEntry` to ledger (256 cap).

Code: `src/hooks/chat-params.ts`, `src/routing/{resolver,variant-translator}.ts`.

### Reactive layer — `event` (session.error)

Runs when a session errors. Pipeline:

1. **Classify** — `classifyError(error, cfg) → {retryable, reason, statusCode?, message}`. Retryable if `status ∈ retryOnStatusCodes` OR `message` matches `retryOnPatterns` regex. Status takes priority. Invalid user regexes are silently skipped.
2. **Resolve requirement** — user `agents[name]` → user `categories[name]` → builtin agents → builtin categories.
3. **Mark failed** — `markModelFailed` records a timestamp for the current model.
4. **Find next** — from `fallbackIndex + 1`, skipping failed models and those still in cooldown.
5. **Dispatch** — `client.session.prompt` reusing the last user message's parts. Best-effort `client.session.abort` first. Dedup via a module-level `Set<sessionID>` to prevent concurrent retries.
6. **Stop conditions** — `maxAttempts` reached, chain exhausted, or no next model.

**Never retried:** `AbortError`, `MessageAbortedError`, `DOMException` with `isAbort: true`.

**Observe-only mode:** `runtimeFallback.dispatch: false` — classifies and logs but does not dispatch.

**`FallbackState`** (in `event-handler.ts` closure, `Map<sessionId, FallbackState>`):
```
{ originalModel: string, fallbackIndex: number, attempts: number, failedModels: Map<string, number> }
```
Cleaned on `session.created` / `session.deleted` / `session.idle`.

Code: `src/runtime-fallback/{error-classifier,fallback-state,dispatcher,event-handler}.ts`, `src/hooks/event.ts`.

### Config

```jsonc
{
  "runtimeFallback": {
    "enabled": true,
    "dispatch": true,
    "maxAttempts": 3,
    "cooldownSeconds": 60,
    "retryOnStatusCodes": [429, 500, 502, 503, 504],
    "retryOnPatterns": [/* 9 patterns */]
  }
}
```

## Hook flow

### `config(input, output)`

1. Load user config (project > user; `disabledAgents` / `fallbackModels` unioned across sources).
2. Apply profile overlay: `OCMM_PROFILE` env > `activeProfile`. `deepMerge` with `profileOverlay: true` replaces ALL arrays (unlike user+project union). Missing profile is silently ignored + warning.
3. Load runtime prompts from `prompts/{workflow}/`.
4. Register shared skill paths under `config.skills.paths`; in v1 workflow, also register `skills/v1` so injected deepwork skills resolve as native slash skills.
5. Register slash commands under `config.command`: shared skills, v1 deepwork skills when `workflow:"v1"` is active, and loop protocol commands.
6. Register **11 agents** (from `src/data/agents.ts`); `orchestrator` and `builder` are `primary`, `planner` is `all`, the rest are `subagent`.
7. Register **10 categories as `mode:subagent`** (from `src/data/categories.ts`), using each category's first chain entry as the model and `prompts/{workflow}/category/<name>.md` as the system prompt.
8. Apply user overrides: `agents.<name>` pins model/shorthand/disabled; `categories.<name>` same minus `disabled`.

### MCP registration

`registerMcps()` merges built-ins, project `.mcp.json`, and explicit
`mcp.servers` config. `disabledMcps` removes matching names before registration;
explicit `mcp.servers` entries win over built-ins.

Built-ins:

| MCP | Type | Default |
|---|---|---|
| `websearch` | remote | Exa by default, Tavily when configured; API-key headers only if env-allowlisted. |
| `context7` | remote | `https://mcp.context7.com/mcp`, optional allowlisted API key. |
| `grep_app` | remote | `https://mcp.grep.app`. |
| `lsp` | local | Project-owned `ocmm-lsp mcp`. |

`resolveOcmmLspCommand()` resolves `lsp` in this order: `OCMM_LSP_COMMAND`,
bundled `dist/bin/ocmm-lsp-*`, local Cargo release/debug binaries, `cargo run`
from `crates/ocmm-lsp/`, then a PATH `ocmm-lsp`. If none exists, the built-in
`lsp` config is registered disabled so an explicit override can still replace
it. The MCP receives `OCMM_LSP_PROJECT_CONFIG` with `.opencode/ocmm-lsp.json`,
`.opencode/lsp.json`, and `.codex/lsp-client.json`.

### `chat.message(input, output)`

1. In v1 workflow, queue the injected deepwork skill bundle once per session.
2. If the first text part is a bare ocmm slash command (`/ralph-loop`, `/audit-loop`, `/dwloop`, or a registered shared/v1 skill command), expand the matching command template and queue it as one-shot system context.
3. Rewrite the text part to the command arguments so noninteractive `opencode run "/command args"` does not reach the model as an unknown literal slash command.

### `chat.params(input, output)`

See "Proactive layer" above. Input: `{agent, model, variant?}`. Output mutated in place.

### `experimental.chat.system.transform(input, output)`

Reads `input.sessionID` and prepends queued persistent v1 skill content plus any one-shot slash command context to `output.system` (handles array/string/empty shapes). It can fire multiple times in a turn, including title generation before the main model call, so one-shot slash context is cleared at the start of the next `chat.message` rather than drained on first transform.

**omo workflow:** no persistent skill injection; this hook only modifies output when `chat.message` queued a bare noninteractive slash command.

### `event(input)`

Input shape: `{event: {type, properties}}` (Phase-1 code read `input.type` directly — fixed in Phase 3).

Delegated to `createRuntimeFallbackEventHandler`:
- `session.created` — clear state.
- `session.deleted` / `session.idle` — clear intent + fallback state.
- `session.error` — skip if disabled / no sessionID / abort / in-flight; else classify → resolve requirement → skip if chain ≤ 1 → markFailed → prepareFallback → observe-only check → dispatch.

## Config schema

Zod-validated (`src/config/schema.ts`), `unknown keys` rejected. 26 top-level fields (see [`schema.json`](../schema.json) for the full JSON Schema).

Key shapes:
- **Variant enum:** `[low, medium, high, xhigh, max, minimal, none, auto, thinking]`
- **FallbackEntry:** `{providers:string[], model:string, variant?, reasoningEffort?, temperature?, top_p?, maxTokens?, thinking?:{type:"enabled"|"disabled", budgetTokens?}}`
- **ModelRequirement:** `{fallbackChain:FallbackEntry[], variant?, requiresModel?, requiresAnyModel?:bool, requiresProvider?:string[]}`
- **ShorthandFields:** `model`, `variant`, `fallbackModels`, `requirement`, `disabled`, `description` (expanded by `normalizeShorthand`).
- **AgentEntry:** extends `CategoryEntry` + `disabled` + override fields (`tools`, `permission`, `skills`, `promptAppend`, `temperature`, `topP`, `maxTokens`, `thinking`, `reasoningEffort`). `.strict()`.
- **RuntimeFallbackConfig:** `.default({})`.
- **ProfileEntry:** partial overlay, `.strict()`, excludes `profiles` / `activeProfile`.
- **SkillsConfig:** `{sources, enable, disable}`. Top-level `disabledSkills` and `disabledCommands` further gate skill loading and command registration.

### Profiles

Named partial overlay applied **after** user+project merge. Selection: `OCMM_PROFILE` env > `activeProfile` > none. `deepMerge` with `profileOverlay: true` replaces ALL arrays (vs user+project union for `disabledAgents`/`fallbackModels`). Missing profile: silently ignored + warning.

CLI: `ocmm-profiles` (`list`/`use`/`show`/`add`/`rm`/`clear`/`current`) manages the user config file. No comment preservation. `loadConfig` returns `{config, sources, activeProfile?}`.

### Shorthand normalization

`normalizeShorthand` (in `src/config/normalize.ts`):
- `entry.requirement` present → passthrough.
- Else build chain from `entry.model` (split on `/`) + `entry.variant` (promoted onto first chain entry) + `entry.fallbackModels` (strings → `provider/model`, objects passthrough).

## Code layout

```
src/
├── cli/                  # CLI entry (shim.ts, profiles.ts, ocmm-lsp.ts)
├── commands/             # built-in slash command templates
├── config/               # schema.ts, load.ts, normalize.ts, profiles.ts
├── data/                 # agents.ts, categories.ts (authoritative built-in definitions)
├── hashline/             # hashline line-hashing subsystem (16 files)
├── hooks/                # config.ts, chat-params.ts, chat-message.ts, system-transform.ts, event.ts
│                         # + rules-injector, hashline-read-enhancer, directory-agents-injector
├── intent/               # model-family.ts, skill-loader.ts, prompt-loader.ts
├── mcp/                  # MCP server registration and native LSP command resolution
├── permissions/         # permission rules
├── routing/              # resolver.ts, variant-translator.ts
├── rules/                # rule definitions
├── runtime-fallback/     # error-classifier, fallback-state, dispatcher, event-handler
├── shared/               # shared types/utilities
└── tools/                # skill-mcp.ts, hashline-edit.ts
crates/
└── ocmm-lsp/             # Rust stdio MCP server exposing LSP tools
scripts/
└── build-ocmm-lsp.ts     # Cargo release build + dist/bin copy helper
```

The TypeScript plugin and Rust `ocmm-lsp` crate are built together for releases.

## Build & test

- **Build:** `pnpm run build` — TypeScript into `dist/`, then Cargo release build copied into `dist/bin/` under both the target-triple release name and local fallback name.
- **Typecheck:** `pnpm run typecheck` — `tsc --noEmit`, strict mode.
- **Test:** `pnpm test` — TypeScript tests via `node --test --experimental-strip-types` (Node 22+) plus `cargo test -p ocmm-lsp`.
- **Runtime dep:** `zod ^3.23.8`.
- **Dev deps:** `typescript ^5.6.0`, `@types/node ^22.10.0`, `rimraf ^6.0.1`.

## What's NOT implemented (vs upstream omo)

- No `prompt-async-gate` — simple `Set<sessionID>` dedup instead.
- No full loop runtime — `/ralph-loop`, `/audit-loop`, and `/dwloop` are command templates, not event-driven idle continuation. Noninteractive `opencode run` receives a compatibility expansion, but still no hidden background continuation. Ralph Loop runtime, stop/cancel, compaction, and verifier hooks are tracked as follow-up work in `docs/kb/omo-features/loops.md`.
- No per-agent `runtimeFallback` override — global config only.
- No full upstream LSP daemon — ocmm ships a direct native stdio MCP instead of the shared socket daemon.
- No toast notifications — logs only.
- No quota-error regression suite — 12 classifier tests exist, but no dedicated quota suite.
- No reserved-retry backoff.

## Phase history

| Phase | Commit | Summary |
|---|---|---|
| 1 | `eaf8ccb` | Minimal proactive routing (variant resolution + translation). Event input-shape bug surfaced (`raw.type` vs `raw.event.type`). |
| Refactor | `e62abe6` | Renamed agents to role-descriptive names (worker→builder, explore→code-search, etc.). |
| 2 | `efe7f13` | Categories registered as subagents + per-category prompt-appends. |
| QA hardening | `e013518` | XDG isolation fix, shorthand redesign, `system.transform` wiring, event input bug surfaced. |
| 3 | `b8f2ac3` | Reactive fallback fully implemented + event input bug fixed. |
