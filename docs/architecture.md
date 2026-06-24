# Architecture

This document captures ocmm's design rationale, hook flow, and routing pipeline. It supersedes the former `.kb/` knowledge base (removed as stale Phase-1 documentation). For the authoritative agent/category definitions, see `src/data/agents.ts` and `src/data/categories.ts`. For prompt provenance, see [`v1-maintenance.md`](./v1-maintenance.md) and [`prompt-sync.md`](./prompt-sync.md).

## Goals

1. **Config-driven auto-routing** — route each request to the right model+variant based on the active agent and delegate_task category, with no per-call user input required.
2. **Variant knob translation** — translate an abstract `variant` (e.g. `high`, `max`) into provider-specific parameters (`reasoningEffort`, `thinking`, `temperature`) via `chat.params`, since OpenCode locks the model before the hook fires.
3. **Workflow prompt injection** — inject the active workflow's prompts (v1 = deepwork skills; omo = upstream oh-my-opencode prompts) into the system message via `chat.message` + `experimental.chat.system.transform`.
4. **Model-specialized prompt variants** — pick the right deepwork prompt variant per model family (default/gpt/gemini/glm/codex/planner).
5. **Reactive runtime fallback** — on `session.error`, retry with the next model in the agent's fallback chain via `client.session.prompt`.
6. **Honor user overrides** — user config always wins over built-in defaults; explicit config always wins over family-policy defaults.
7. **Emit routing ledger** — append resolution entries to the OpenCode routing ledger for observability (capped at 256).

## Non-goals

- No custom `delegate_task` tool — use OpenCode's built-in task tool.
- No team-mode orchestration, boulder, ralph, or MCP server — out of scope.
- No per-agent `runtimeFallback` override — fallback config is global.
- No npm publish — the plugin ships as a built `dist/` referenced by path.

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
2. **Agent default** — `BUILTIN_AGENT_INDEX` from `src/data/agents.ts` (9 built-in agents).
3. **Category default** — user `categories[name]` override, else `BUILTIN_CATEGORY_INDEX` from `src/data/categories.ts` (10 built-in categories; categories are also registered as `mode:subagent`).
4. **Input variant** — synthetic entry composed from the current model + `message.variant` (the variant the user/agent explicitly requested for this turn).

### `resolveAgainstRequirement`

```
resolveAgainstRequirement(req, modelID, inputVariant, source)
  → pickFromChain(req.fallbackChain, modelID)
    → first entry where entryMatches(entry, modelID)
```

`entryMatches`: exact match **or** `modelID` starts with `entry.model` (forward-prefix only). Reverse prefix is intentionally **not** matched, so a shorter chain entry doesn't swallow newer model IDs. If no entry matches, the chain's first entry is used.

Effective variant comes from the matched entry's `variant`, or `req.variant`. `inputVariant` overrides the **variant** but not the **model**.

### `source` values

`source ∈ {user-config, agent-default, category-default, input-variant, no-op}` — recorded in the ledger entry:

```
{ ts, sessionID, agent, input:{providerID, modelID, variant}, applied:{variant, reasoningEffort}, source }
```

## Variant → parameter translation

Per model family (implemented in `src/routing/variant-translator.ts` + `src/intent/model-family.ts`):

| Variant | GPT / Codex | Claude | Gemini | Temperature |
|---|---|---|---|---|
| `none` | no-op | no-op | no-op | — |
| `minimal` | reasoningEffort=minimal | thinking disabled | reasoningEffort=minimal | 0.0 |
| `low` | reasoningEffort=low | thinking 4k | reasoningEffort=low | 0.2 |
| `medium` / `auto` | reasoningEffort=medium | thinking 12k | reasoningEffort=medium | 0.5 |
| `high` / `thinking` | reasoningEffort=high | thinking 24k | reasoningEffort=high + provider thinking | 0.7 |
| `xhigh` | reasoningEffort=high | thinking 49k | reasoningEffort=high + provider thinking | 0.85 |
| `max` | reasoningEffort=high | thinking 65k | reasoningEffort=high + provider thinking | 1.0 |

**Family policy notes:**
- Explicit user config is always respected.
- GPT/Codex non-mini defaults never drop below `high`.
- GPT/Codex mini keeps the full ladder including `minimal`/`low`/`none`.
- Claude Opus 4.7+ / Fable: no ocmm-owned thinking budget.
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
4. Register **9 primary agents** (from `src/data/agents.ts`).
5. Register **10 categories as `mode:subagent`** (from `src/data/categories.ts`), using each category's first chain entry as the model and `prompts/{workflow}/category/<name>.md` as the system prompt.
6. Apply user overrides: `agents.<name>` pins model/shorthand/disabled; `categories.<name>` same minus `disabled`.

### `chat.params(input, output)`

See "Proactive layer" above. Input: `{agent, model, variant?}`. Output mutated in place.

### `chat.message(input, output)`

Input shape (OpenCode 1.17.8): `{sessionID, agent?, model?, messageID?, variant?}`. Output: `{message: UserMessage, parts: Part[]}`. User text lives in `output.parts`, not `input.message`.

**v1 workflow:** On the first message of a session, queues the 5 deepwork skills into a `Map<sessionId, string>`. Latches per-session so injection only happens once.

**omo workflow:** No-op (prompts are attached declaratively at config time).

### `experimental.chat.system.transform(input, output)`

Reads `input.sessionID`, drains the queued prompt, and prepends it to `output.system` (handles array/string/empty shapes). Logs `prepended N chars`. Fires multiple times per turn; idempotency guaranteed by the `chat.message` latch.

**omo workflow:** No-op.

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
├── cli/                  # CLI entry (shim.ts, profiles.ts)
├── config/               # schema.ts, load.ts, normalize.ts, profiles.ts
├── data/                 # agents.ts, categories.ts (authoritative built-in definitions)
├── hashline/             # hashline line-hashing subsystem (16 files)
├── hooks/                # config.ts, chat-params.ts, chat-message.ts, system-transform.ts, event.ts
│                         # + rules-injector, hashline-read-enhancer, directory-agents-injector
├── intent/               # model-family.ts, skill-loader.ts, prompt-loader.ts
├── mcp/                  # MCP server registration
├── permissions/         # permission rules
├── routing/              # resolver.ts, variant-translator.ts
├── rules/                # rule definitions
├── runtime-fallback/     # error-classifier, fallback-state, dispatcher, event-handler
├── shared/               # shared types/utilities
└── tools/                # skill-mcp.ts, hashline-edit.ts
```

51 source `.ts` files (excluding tests). 273 tests across 29 test files.

## Build & test

- **Build:** `pnpm run build` — `tsc` (target ES2022, module ES2022, moduleResolution Bundler, `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`).
- **Typecheck:** `pnpm run typecheck` — `tsc --noEmit`, strict mode.
- **Test:** `pnpm test` — `node --test --experimental-strip-types` (Node 22+). No test framework dependency.
- **Runtime dep:** `zod ^3.23.8`.
- **Dev deps:** `typescript ^5.6.0`, `@types/node ^22.10.0`, `rimraf ^6.0.1`.

## What's NOT implemented (vs upstream omo)

- No `prompt-async-gate` — simple `Set<sessionID>` dedup instead.
- No per-agent `runtimeFallback` override — global config only.
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
