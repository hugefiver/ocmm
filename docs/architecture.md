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

## Canonical logical-tier profile expansion pipeline

```text
raw config layer
  -> context-specific legacy/alias migration with provenance
  -> schema + semantic validation
  -> logical-tiers/names grammar + logical-tiers/materialize requirement expansion
  -> review-agents and planning-agents role adapters
  -> one canonical candidate map per role family
  -> OpenCode registration / exclusive resolver / permissions
  -> chat.params and Codex plan-review floors / Codex generation

OpenCode lifecycle + task-part events
  -> shared event decoder
  -> one durable child record in the existing 429 controller
  -> existing 429 or generic fallback owns dispatch
  -> task-output adapter may append one resume notice; it owns no retry state
```

The fallback path uses a single 429 controller for both dedicated child-session handling and interruption correlation ownership; interruption recovery layers evidence tracking on top of that controller instead of creating a parallel retry engine.

Canonical review slots are unsuffixed names such as `oracle` and `oracle-2nd`; logical tier profiles (`-low`, `-high`, `-max`) are derived from configured `variants` on those slots rather than independent capability-ranked lanes.

The same shared logical-tier grammar and materializer serve canonical `planner` and `plan-critic` through the planning adapter without importing Oracle ordinals or review-slot aliases. Unsuffixed planning names are logical normal. Planning suffix profiles exist only for explicitly configured `variants`, inherit the canonical role's prompt/mode/permissions/registration policy, and are never synthesized from examples or nearby tiers.

Suffix resolution is exclusive: a request for `planner-high` or `plan-critic-low` resolves only when that exact profile was materialized and remains enabled. It never falls through to the unsuffixed role, another suffix, a category, or input-variant routing. Before dispatch, model-facing selector policy inspects current callable/registered names and chooses the first available low→normal candidate only for explicit cost/latency requests, normal for small/clear work, high→normal for complex work, or max→high→normal for high-risk work.

The plan-review floor is role-owned rather than suffix-owned. Every parsed `plan-critic` identity, including a host-provided route-miss profile, passes through the same chat/Codex xhigh-equivalent minimum. Therefore `plan-critic-low` can select a lower-cost model route but can never lower review effort or current-revision receipt semantics; `planner` tiers retain their configured effort.

## OpenCode plugin configuration and profile aliases

`createPlugin()` uses `loadOpenCodePluginConfig()` at its initial load and on `reload()`. This is a deliberate OpenCode-only boundary: ordinary `loadConfig()` stays non-materializing, even when called with `host: "opencode"`; the Codex adapter does not materialize qualified aliases either.

The plugin loader validates the merged base config, then composes profile descriptors in this order: inline profile < user `ocmm-profiles/` descriptor < project `.opencode/ocmm-profiles/` descriptor. For one basename, a `.jsonc` descriptor wins over `.json` before either is parsed. Ambient profile selection is unchanged: `OCMM_NO_PROFILE`, then `OCMM_PROFILE`, then `activeProfile`. Invalid inactive descriptors do nothing. If the selected highest-precedence descriptor is invalid, plugin loading atomically falls back to defaults rather than using a lower-precedence descriptor.

The selected descriptor plus the validated base-agent map form the qualified-alias pipeline. The first colon in `<profile>:<agent>` selects a profile descriptor and target agent. Alias materialization imports only the normalized `ModelRequirement`: `fallbackChain`; its requirement-level native `variant`; each fallback entry's `providers`, `model`, native `variant`, and model-control metadata; and `requiresModel`, `requiresAnyModel`, and `requiresProvider`. Agent-level logical review `variants` remain local and are not imported. The source agent keeps local permissions, prompts, tools, description, other agent controls, and every profile-wide field.

## Effective routes and publication

The config hook constructs an `EffectiveModelRoute` for every OCMM-managed registration. Its fields are `{ model, requirement, requirementSource, primarySource }`. `requirementSource` reports where the requirement came from (`user-config`, `agent-default`, or `category-default`); `primarySource` independently reports why the final primary won (`existing-model`, `user-requirement`, `catalog-upgrade`, or `builtin-requirement`).

Final-primary precedence is: an existing same-name host model, then an explicit user requirement head, then a catalog upgrade when that registration permits one, then the requirement head. The selected primary `O` is always materialized into the fallback chain. When fast routing chooses a distinct fast primary `F`, it prepends it, yielding `F → O → remainder`; without a fast candidate the chain begins `O → remainder`.

An `EffectiveRouteRegistry` publishes immutable, generation-safe snapshots. A config invocation first begins a generation, writes final agent models, and publishes the complete route map once; a stale generation cannot publish. Before any publication, runtime fallback may use raw compatibility resolution. After publication, an empty map or a missing agent route is authoritative absence, not permission to recompute raw routes. Config, `chat.params`, and runtime fallback read the same immutable snapshot. `registeredAgentModels` exists only in the unchanged generic/Codex compatibility branch, never in registry-managed OpenCode routing.

Reload replaces the captured config and fast-mode value, but keeps the last successful route snapshot until a later successful `config` publication. A failed or stale config build therefore cannot expose partial new routes.

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

### Reactive layer — generic `event` fallback

Runs when a session error is not handled by the dedicated subagent-429 controller. Pipeline:

1. **Classify** — `classifyError(error, cfg) → {retryable, reason, statusCode?, message, recoveryDelayMs?}`. Retryable if `status ∈ retryOnStatusCodes` OR `message` matches `retryOnPatterns` regex. Status takes priority; `recoveryDelayMs` is present only for explicit 429s. Invalid user regexes are silently skipped.
2. **Resolve requirement** — user `agents[name]` → user `categories[name]` → builtin agents → builtin categories.
3. **Mark failed** — `markModelFailed` records a timestamp for the current model.
4. **Find next** — from `fallbackIndex + 1`, skipping failed models and those still in cooldown.
5. **Dispatch** — `client.session.prompt` reusing the latest contiguous user-message block. Best-effort `client.session.abort` first. Dedup via a module-level `Set<sessionID>` to prevent concurrent retries.
6. **Stop conditions** — `maxAttempts` reached, chain exhausted, or no next model.

**Plugin-owned aborts are never retried:** `AbortError` and `DOMException` are treated as aborts under the existing plugin-owned abort rule. `MessageAbortedError` is an explicit abort only when `isAbort: true`; a name-only `MessageAbortedError` remains eligible for configured retry classification, such as transport-disconnect patterns.

**Observe-only mode:** `runtimeFallback.dispatch: false` — classifies and logs but does not dispatch.

**`FallbackState`** (in `event-handler.ts` closure, `Map<sessionId, FallbackState>`):
```
{
  originalModel: string,
  snapshotId: number,
  fallbackIndex: number,
  attempts: number,       // committed model-switch attempts only
  activeModel?: string,
  failedModels: Map<string, number> // generic cooldown timestamps
}
```
It owns fallback position, committed model-switch attempts, the active model, and generic cooldown state. Idle never clears `FallbackState`; lifecycle cleanup occurs on session recreation or deletion.

Generic fallback binds every `FallbackState` to its route `snapshotId`. Lifecycle and snapshot validity are checked before and after every generic I/O, commit, and handoff boundary. A stale snapshot therefore cannot commit a model switch after routes have been republished.

Code: `src/runtime-fallback/{error-classifier,fallback-state,dispatcher,event-handler}.ts`, `src/hooks/event.ts`.

### Dedicated subagent 429 fallback

The shared controller creates state only for a newly created child session. Child detection accepts the four OpenCode parent fields `parentID`, `parentId`, `parentSessionID`, and `parentSessionId`. It starts dedicated handling only for a retryable error with an explicit `statusCode === 429`; root sessions, untracked sessions, disabled dedicated handling, and regex-only matches use generic fallback instead. An initial idle without a dedicated 429 removes the child-session state.

The dedicated path has a two-signal gate: the recovery-delay timer and the idle event emitted for the 429 error. It sends its retry or switch prompt without aborting the child; generic dispatch retains best-effort abort behavior. A recovery hint strictly greater than 10 minutes is a zero-delay probe; a hint at or below 10 minutes waits in full. Without a hint, delay is equal-jitter exponential backoff with a 1-second base and a 30-second cap.

`subagent429.maxRetries` defaults to 5. `0` prepares a model switch immediately, but the two-signal gate still applies. Retry counts use model scope unless `providerScopes` declares a provider scope; exhausting a provider scope blocks every candidate from that provider in the current child session. Each newly selected model receives a fresh scoped retry budget. Dedicated retries do not consume `runtimeFallback.maxAttempts`; only a committed model switch increments that generic counter.

```text
session.error(429) -> prepare retry/switch gate
timer -> delayReady
error-owned session.idle -> errorIdleObserved
both true -> no-abort dedicated dispatch generation
  first queued provider outcome -> Queued429 | QueuedOtherError
  idle after Queued429 -> Queued429.errorIdleObserved
  idle without queue -> ActiveDispatch.idleObserved
dispatch settlement -> QueuedOutcome > idleObserved > awaiting-result
Queued429 -> account/commit once -> process queued target serially
QueuedOtherError -> account/commit once -> stop dedicated -> generic handoff once
session.deleted -> invalidate lifecycle/timer/dispatch generations
non-429 outside active dispatch -> stop dedicated -> generic fallback
non-429 during active dispatch -> queue first outcome -> post-settlement generic handoff
```

During an active dedicated dispatch, the first queued provider outcome takes precedence over idle. A queued 429 is processed serially against the dispatched target after settlement. A queued non-429 completes accounting once, stops the dedicated controller, and hands off to generic fallback once. A bare `false` dispatch result with no queued outcome stops the dedicated flow. `runtimeFallback.dispatch: false` is observe-only: it records the classification but schedules and dispatches nothing.

`FallbackState` and the controller have separate ownership. `FallbackState` owns `fallbackIndex`, committed model-switch `attempts`, `activeModel`, and generic cooldowns. At the controller layer, each child-session state owns its initial marker, scoped retry counts, blocked deadlines, pending two-signal gate, active-dispatch idle state, queued outcome plus generic-handoff state, one timer, and lifecycle/timer/dispatch generations. No child-session state crosses session boundaries, and idle never clears `FallbackState`.

Dedicated 429 recovery carries the route snapshot ID through timers, pending gates, active dispatches, queued outcomes, and prepared switches. Snapshot and lifecycle checks surround dispatch, accounting, commit, and generic handoff; a stale snapshot has zero dispatch, accounting, commit, or handoff side effects.

### Interruption recovery (correlation + output adapter)

Interruption recovery is a documentation-level name for the `subagent-interruption-recovery` hook behavior in the same event pipeline:

1. It reuses the existing 429/generic fallback controller and retry budgets.
2. Correlation keys are child-session based and parent `message.part.updated` evidence is deduplicated.
3. Child `session.error` events are treated as provider-error evidence in the same controller record.
4. No retry is dispatched for explicit abort, permission denial, unknown agent, deletion, or ordinary empty-output outcomes.
5. The task-output adapter may append at most one manual continuation notice only when explicit task-id evidence exists in task input/output or correlated parent-part evidence; it never substitutes `childSessionID` for `task_id`, never dispatches from `tool.execute.after`, and never synthesizes parent prompts.

### Config

```jsonc
{
  "runtimeFallback": {
    "enabled": true,
    "dispatch": true,
    "maxAttempts": 3,
    "cooldownSeconds": 60,
    "retryOnStatusCodes": [429, 500, 502, 503, 504],
    "retryOnPatterns": [/* 9 patterns */],
    "subagent429": {
      "enabled": true,
      "maxRetries": 5,
      "providerScopes": {
        "anthropic": "provider",
        "openai": "model"
      }
    }
  }
}
```

## Hook flow

### `config(input, output)`

1. Load the OpenCode-plugin config through `loadOpenCodePluginConfig` (project > user; `disabledAgents` / `fallbackModels` unioned across sources).
2. Resolve profile descriptors and apply the selected overlay: `OCMM_NO_PROFILE` > `OCMM_PROFILE` > `activeProfile`. `deepMerge` with `profileOverlay: true` replaces ALL arrays (unlike user+project union). A missing selected profile is ignored with a warning; an invalid selected descriptor atomically defaults the plugin config.
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
- `session.created` — reset generic state and create dedicated 429 state only when one of the supported parent-session fields marks the session as a child.
- `session.deleted` — clear generic state and invalidate the dedicated controller's lifecycle, timer, and dispatch generations.
- `session.idle` — report the event to the dedicated controller; it is suppressed while a dedicated gate, dispatch, or queued 429 is active. It never clears generic `FallbackState`.
- `session.error` — explicit 429 errors for tracked children first enter the dedicated controller. Generic errors, regex-only matches, roots, and untracked children use the generic classifier → resolve requirement → mark failed → prepare fallback → observe-only check → dispatch pipeline. Non-429 outcomes received during dedicated work invalidate or hand off through the controller's guarded lifecycle.

## Config schema

Zod-validated (`src/config/schema.ts`), `unknown keys` rejected (see [`schema.json`](../schema.json) for the full JSON Schema).

Key shapes:
- **Variant enum:** `[low, medium, high, xhigh, max, minimal, none, auto, thinking]`
- **FallbackEntry:** `{providers:string[], model:string, variant?, reasoningEffort?, temperature?, top_p?, maxTokens?, thinking?:{type:"enabled"|"disabled", budgetTokens?}}`
- **ModelRequirement:** `{fallbackChain:FallbackEntry[], variant?, requiresModel?, requiresAnyModel?:bool, requiresProvider?:string[]}`
- **ShorthandFields:** `model`, `variant`, `fallbackModels`, `requirement`, `disabled`, `description` (expanded by `normalizeShorthand`).
- **AgentEntry:** extends `CategoryEntry` + `disabled` + override fields (`tools`, `permission`, `skills`, `promptAppend`, `temperature`, `topP`, `maxTokens`, `thinking`, `reasoningEffort`). `.strict()`.
- **RuntimeFallbackConfig:** `.default({})`.
- **ProfileEntry:** partial overlay, `.strict()`, excludes `profiles` / `activeProfile`.
- **FastModelsConfig:** root `{providers, mappings}` defaults to empty allowlist/map; profile `fastModels` fields are optional so an overlay changes only the fields it provides.
- **SkillsConfig:** `{sources, enable, disable}`. Top-level `disabledSkills` and `disabledCommands` further gate skill loading and command registration.

### Profiles

Named partial overlay applied **after** user+project merge. Selection: `OCMM_NO_PROFILE` > `OCMM_PROFILE` env > `activeProfile` > none. `deepMerge` with `profileOverlay: true` replaces ALL arrays (vs user+project union for `disabledAgents`/`fallbackModels`). Missing profile: silently ignored + warning.

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
├── config/               # schema.ts, load.ts, normalize.ts, profiles.ts, profile-aliases.ts
├── data/                 # agents.ts, categories.ts (authoritative built-in definitions)
├── hashline/             # hashline line-hashing subsystem (16 files)
├── hooks/                # config.ts, chat-params.ts, chat-message.ts, system-transform.ts, event.ts
│                         # + rules-injector, hashline-read-enhancer, directory-agents-injector
├── intent/               # model-family.ts, skill-loader.ts, prompt-loader.ts
├── mcp/                  # MCP server registration and native LSP command resolution
├── permissions/         # permission rules
├── routing/              # resolver.ts, effective-route.ts, route-registry.ts, variant-translator.ts
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
