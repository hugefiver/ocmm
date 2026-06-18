# OCMM Plugin Design

## Goals

1. **Auto-route** the active model based on agent identity and category, via the `config` hook.
2. **Translate a single variant knob** into provider-specific params (`reasoningEffort`, extended-thinking budget, temperature) via `chat.params`.
3. **Inject mode prompts** (deepwork / superplan / team) when intent keywords appear in user input, via `chat.message` + `experimental.chat.system.transform`.
4. **Pick model-specialized prompt variant** (gpt / gemini / default / planner) when injecting.
5. **Reactive runtime fallback**: on `session.error`, classify the error and dispatch the next model in the agent's fallback chain via `client.session.prompt`.
6. **Honor user config overrides** (per-category, per-agent, fallback list, shorthand or full form).
7. **Emit a routing ledger** for observability.

## Non-goals (deferred)

- Custom `delegate_task` tool (we register categories as subagents instead — callers use OpenCode's built-in `task`).
- Team-mode orchestration, boulder, ralph loops, MCP servers.
- Per-agent `runtimeFallback` override (currently global only).
- npm publish.

## File layout (actual)

```
ocmm/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # OpenCode plugin entry; binds all 5 hooks
│   ├── config/
│   │   ├── schema.ts               # Zod schema (shorthand + full form + runtimeFallback)
│   │   ├── load.ts                 # XDG_CONFIG_HOME → APPDATA → ~/.config/opencode (XDG wins)
│   │   ├── normalize.ts            # shorthand → ModelRequirement expansion
│   │   ├── load.test.ts
│   │   └── normalize.test.ts
│   ├── data/
│   │   ├── agents.ts               # 10 built-in agents (orchestrator..task-runner)
│   │   └── categories.ts           # 8 built-in categories (frontend..writing)
│   ├── routing/
│   │   ├── resolver.ts             # 4-tier: user-config → agent-default → category-default → input-variant
│   │   ├── variant-translator.ts   # variant → params per model family
│   │   ├── ledger.ts               # ResolutionEntry log (256 cap)
│   │   └── *.test.ts
│   ├── intent/
│   │   ├── detectors.ts            # deepwork/team/superplan/composite regexes + isPlannerAgent
│   │   ├── model-family.ts         # classifyModelFamily → gpt|claude-opus-47-plus|claude|gemini|kimi-k27|kimi|minimax|glm|unknown
│   │   ├── prompt-loader.ts        # loads prompts/ from disk; getDeepworkPrompt/getModePrompt/getCategoryPrompt
│   │   └── *.test.ts
│   ├── hooks/
│   │   ├── config.ts               # register 10 agents + 8 category-subagents + user overrides
│   │   ├── chat-params.ts          # 4-tier resolve + variant translation + ledger
│   │   ├── chat-message.ts         # read output.parts, detect intent, queue per session
│   │   ├── event.ts                # thin wrapper → createRuntimeFallbackEventHandler
│   │   └── *.test.ts
│   ├── runtime-fallback/
│   │   ├── error-classifier.ts     # extractStatus/Name/Message + classifyError(error, cfg)
│   │   ├── fallback-state.ts       # FallbackState + create/markFailed/isInCooldown/findNext/prepare
│   │   ├── dispatcher.ts           # dispatchFallbackRetry → client.session.{abort,messages,prompt}
│   │   ├── event-handler.ts        # createRuntimeFallbackEventHandler({getConfig, client?, directory?})
│   │   ├── index.ts                # barrel
│   │   └── *.test.ts
│   └── shared/
│       ├── types.ts                # FallbackEntry, ModelRequirement, Variant, Agent, Category, Resolution*
│       └── logger.ts               # OCMM_DEBUG-gated console wrapper
├── prompts/                         # runtime prompts (loaded by prompt-loader.ts)
│   ├── deepwork/{default,gpt,gemini,planner,codex}.md
│   ├── mode/{superplan,team}.md
│   └── category/{frontend,creative,hard-reasoning,research,quick,low-effort,high-effort,writing}.md
└── .kb/                             # internal knowledge base
```

## Hook flow

### `config(input, output)` hook

1. Load user config from `<cwd>/.opencode/ocmm.json[c]` (project) and `$XDG_CONFIG_HOME/opencode/ocmm.json[c]` → `%APPDATA%\opencode\ocmm.json[c]` → `~/.config/opencode/ocmm.json[c]` (user). XDG wins over APPDATA on Windows. Project wins over user on conflicts; `disabledAgents` / `fallbackModels` are unioned.
2. Load runtime prompts from `prompts/` (deepwork, mode, category).
3. Register the 10 primary built-in agents into `input.config.agent` (or `input.agent` — both shapes handled).
4. Register the 8 categories as `mode: "subagent"` agents, using the first entry of each category's fallback chain as the model and the matching `prompts/category/<name>.md` as the system prompt.
5. Apply user overrides: `agents.<name>` can pin a model (shorthand), provide a full `ModelRequirement`, or set `disabled: true`. `categories.<name>` works the same way (minus `disabled`). User-set fields are never clobbered.

### `chat.params(input, output)` hook

**Important constraint** — verified from OpenCode plugin types: `chat.params` output schema has NO `model` field. It can only mutate `temperature`, `topP`, `topK`, `maxOutputTokens`, `options.{reasoningEffort,thinking,...}`. **The model is locked before this hook fires.** Per-agent routing happens in `config`; per-call re-routing is impossible from this hook.

Flow:

1. `input.agent` (string or `{name}`) and `input.model.{providerID, modelID}` come from OpenCode (already routed via `config`).
2. Resolve the **variant** via 4-tier priority: user-config agent override → user-config category override → built-in agent default → `input.message.variant`. Falls back to `undefined` (no translation).
3. `classifyModelFamily(modelID)` → `gpt | claude-opus-47-plus | claude | gemini | kimi-k27 | kimi | minimax | glm | unknown`.
4. `translateVariant(family, variant)` → `{reasoningEffort?, thinking?, temperature?}`. Mutate `output.options` / `output.temperature` / `output.topP` / `output.maxOutputTokens`.
5. Append a `ResolutionEntry` to the in-memory ledger (256-entry cap).

### `chat.message(input, output)` hook

**Input shape (verified from OpenCode 1.17.8):** `input: {sessionID, agent?, model?, messageID?, variant?}`, `output: {message: UserMessage, parts: Part[]}`. The user text is in `output.parts` (array of `{type, text}`), NOT in `input.message`.

Flow:

1. Read `output.parts`, concatenate text parts.
2. Strip `<SYSTEM_REMINDER>` blocks, then run `detectIntent(text, agentName)`.
3. If hit and not already latched for this session, compose mode + deepwork prompts based on selected model family + agent.
4. Queue the composed prompt into `Map<sessionID, SessionIntentState>`. Do NOT mutate `output` — `chat.message` cannot inject into the system prompt.
5. Mark intent latched.

### `experimental.chat.system.transform(input, output)` hook

This is the actual injection seam. Flow:

1. Read `input.sessionID`.
2. Drain the queued prompt for this session (if any).
3. Prepend to `output.system` — handles array, string, or empty shapes.
4. Log `prepended N chars`.

The hook fires multiple times per turn (once per system-prompt construction pass). Idempotency relies on the session-state latch in `chat.message` — the prompt is composed once, then drained on the first `system.transform` call; subsequent calls see an empty queue.

### `event(input)` hook

**Input shape (verified from OpenCode plugin types):** `input: { event: { type, properties } }`. (Old code read `input.type` directly — that was a silent bug from Phase 1; fixed in Phase 3.)

Flow (delegated to `createRuntimeFallbackEventHandler`):

- `session.created`: clear per-session state.
- `session.deleted` / `session.idle`: clear session intent (delegates to `clearSessionIntent` from chat-message) + clear fallback state.
- `session.error`:
  1. Skip if `runtimeFallback.enabled === false`.
  2. Skip if no sessionID.
  3. Skip if `isAbortError(error)` — name ∈ {AbortError, MessageAbortedError, DOMException} or `isAbort === true`.
  4. Skip if `isDispatchInFlight(sessionID)` (dedup).
  5. `classifyError(error, cfg)` → `{retryable, reason, statusCode?, message}`.
  6. Skip if not retryable.
  7. Resolve the agent's `ModelRequirement` (user agents → user categories → built-in agents → built-in categories).
  8. Skip if chain length ≤ 1 (no fallback available).
  9. Get-or-create `FallbackState`, `markModelFailed(justFailedKey)`.
  10. `prepareFallback(state, requirement, justFailedKey, maxAttempts, cooldownSeconds)` → `{ok, entry?, index?, attempts?}` or `{ok:false, reason}`.
  11. If `dispatch === false`: log observe-only and return.
  12. If no `client` available: log and return.
  13. `dispatchFallbackRetry({client, sessionID, directory?, agent?, newEntry, reason})`.

## Config schema (Zod, actual)

```ts
const Variant = z.enum(["low","medium","high","xhigh","max","minimal","none","auto","thinking"])

const FallbackEntrySchema = z.object({
  providers: z.array(z.string()).min(1),
  model: z.string().min(1),
  variant: Variant.optional(),
  reasoningEffort: z.string().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    type: z.enum(["enabled","disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
})

const ModelRequirementSchema = z.object({
  fallbackChain: z.array(FallbackEntrySchema).min(1),
  variant: Variant.optional(),
  requiresModel: z.string().optional(),
  requiresAnyModel: z.boolean().optional(),
  requiresProvider: z.array(z.string()).optional(),
})

// Shared shape for both agents.* and categories.*
const ShorthandFields = {
  description: z.string().optional(),
  variant: Variant.optional(),
  model: z.string().optional(),                         // "provider/model"
  fallbackModels: z.array(z.union([z.string(), FallbackEntrySchema])).optional(),
  requirement: ModelRequirementSchema.optional(),
}

const CategoryEntrySchema = z.object(ShorthandFields).strict()
const AgentEntrySchema = z.object({ ...ShorthandFields, disabled: z.boolean().optional() }).strict()

const RuntimeFallbackConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dispatch: z.boolean().default(true),
  maxAttempts: z.number().int().positive().default(3),
  cooldownSeconds: z.number().int().positive().default(60),
  retryOnStatusCodes: z.array(z.number().int()).default([429,500,502,503,504]),
  retryOnPatterns: z.array(z.string()).default([/* 9 patterns */]),
}).default({})

const OcmmConfigSchema = z.object({
  disabledAgents: z.array(z.string()).default([]),
  agents: z.record(z.string(), AgentEntrySchema).default({}),
  categories: z.record(z.string(), CategoryEntrySchema).default({}),
  runtimeFallback: RuntimeFallbackConfigSchema,
  intent: z.object({ enabled: z.boolean().default(true), skipAgents: z.array(z.string()).default([]) }).default({}),
  fallbackModels: z.array(z.string()).default([]),
  systemDefaultModel: z.string().optional(),
  registerBuiltinAgents: z.boolean().default(true),
  debug: z.boolean().default(false),
}).strict()
```

### Shorthand normalization (`src/config/normalize.ts`)

`normalizeShorthand(entry)` converts shorthand fields into a `ModelRequirement`:

- If `entry.requirement` is present → passthrough (return as-is).
- Else build a chain: primary entry from `entry.model` (split on `/`) + `entry.variant` (promoted onto first entry) + `entry.fallbackModels` (strings parsed as `provider/model`, objects passthrough).
- Returns `{ description?, requirement?, disabled? }`.

## Build / run

- TypeScript via `tsc`, target ES2022, module ES2022, `moduleResolution: Bundler`.
- `allowImportingTsExtensions: true` + `rewriteRelativeImportExtensions: true` — source uses `.ts` imports, build rewrites to `.js`.
- Runtime dep: `zod` (config validation only).
- `pnpm install` → dev deps: `typescript`, `@types/node`, `rimraf`.
- `pnpm run build` → `dist/index.js` (+ per-file JS).

## Testing strategy

- `node --test --experimental-strip-types` (Node 22+). No test framework deps.
- 105 tests across:
  - `config/load.test.ts`, `config/normalize.test.ts` — XDG priority, shorthand expansion, mixed fallbackModels, passthrough, disabled flag.
  - `routing/resolver.test.ts`, `routing/variant-translator.test.ts` — 4-tier priority, per-family translation.
  - `intent/detectors.test.ts`, `intent/prompt-loader.test.ts` — regex correctness, planner exemption, composite intent.
  - `hooks/config.test.ts`, `hooks/chat-params.test.ts`, `hooks/chat-message.test.ts` — registration, variant application, system.transform injection.
  - `runtime-fallback/error-classifier.test.ts`, `runtime-fallback/fallback-state.test.ts`, `runtime-fallback/event-handler.test.ts` — 39 tests covering classification, state machine, dispatch, dedup, abort-skip, observe-only.

## Isolated QA

A real-OpenCode smoke harness lives under `%LOCALAPPDATA%\Temp\opencode\ocmm-test\` (not in repo). It spins up an isolated XDG config tree, points the plugin at a single `hoo` provider, and runs `opencode run` / `opencode debug agent` scenarios. Battery of 6 scenarios verified all 5 hooks fire correctly.

## Phase history

- **Phase 1** (`eaf8ccb`): minimal complete plugin — config + chat.params + chat.message + event stub.
- **Refactor** (`e62abe6`): renamed agents/categories/intents to role-descriptive names (sisyphus→orchestrator, ultrawork→deepwork, etc.).
- **Phase 2** (`efe7f13`): registered categories as subagents; added category prompt-appends.
- **QA hardening** (`e013518`): XDG priority fix, shorthand schema redesign, system.transform hook wiring, event input shape bug surfaced (fixed in Phase 3).
- **Phase 3** (`b8f2ac3`): reactive runtime fallback — error classifier + state machine + dispatcher + event handler; fixed the event input shape bug.
