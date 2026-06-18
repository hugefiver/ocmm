# OCMM Plugin Design (Phase 1 — Minimal Complete)

## Goals

1. **Auto-route** the active model based on category and agent identity.
2. **Inject mode prompts** (deepwork/superplan/team) when intent keywords detected.
3. **Pick model-specialized prompt variant** (gpt/gemini/default/planner) when injecting.
4. **Apply variant → param translation** (reasoningEffort, thinking budgets, temperature).
5. **Honor user config overrides** (per-category, per-agent, fallback list).
6. **Emit a routing ledger** for observability.

## Non-goals (Phase 1)

- Reactive runtime fallback (just stubbed log).
- Custom agent factories.
- Custom tools (`delegate_task`, MCP servers).
- Team-mode orchestration.
- Background tasks, boulder, ralph loops.

## File layout

```
ocmm/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # OpenCode plugin entry, hook bindings
│   ├── config/
│   │   ├── schema.ts               # Zod schema for ocmm.config.json
│   │   └── load.ts                 # walk pwd + home for ocmm.config.{json,jsonc}
│   ├── data/
│   │   ├── categories.ts           # 8 built-in categories
│   │   ├── agents.ts               # 11 built-in agents w/ fallback chains
│   │   └── known-variants.ts       # variant set + translations
│   ├── routing/
│   │   ├── resolver.ts             # 6-step pipeline → FallbackEntry
│   │   ├── fuzzy-match.ts          # fuzzyMatchModel
│   │   ├── provider-cache.ts       # connectedProviders / availableModels
│   │   ├── variant-translator.ts   # variant → params (per provider)
│   │   └── ledger.ts               # ResolutionEntry, in-memory log
│   ├── intent/
│   │   ├── detectors.ts            # 4 keyword regexes + dispatch
│   │   ├── model-family.ts         # isGptModel / isGeminiModel / …
│   │   └── prompt-loader.ts        # read .md prompts from disk (or bundled)
│   ├── hooks/
│   │   ├── chat-params.ts          # apply routing (proactive)
│   │   ├── chat-message.ts         # apply intent gate + system-prompt injection
│   │   └── event.ts                # session lifecycle, reactive stub
│   └── shared/
│       ├── types.ts                # FallbackEntry, ModelRequirement, types
│       └── logger.ts               # debug logger respecting OCMM_DEBUG env
├── prompts/                         # bundled prompts (copied from .kb/prompts)
│   ├── deepwork/{default,gpt,gemini,planner}.md
│   └── mode/{superplan,team}.md
└── .kb/                             # internal knowledge base (this folder)
```

## Hook flow

### `config(input, output)` hook

1. Load user config from `<pwd>/ocmm.config.{json,jsonc}` then `~/.config/opencode/ocmm.config.{json,jsonc}`. Deep-merge categories/agents; user wins.
2. Build `ProviderCache` from OpenCode-provided `availableProviders` and `availableModels`.
3. Cache resolved configs onto the plugin module instance.

### `chat.params(input, output)` hook

**Important constraint** — verified from omo source: `chat.params` output schema has NO `model` field. It can only mutate `temperature`, `topP`, `topK`, `maxOutputTokens`, `options.{reasoningEffort,thinking,...}`. **The model is locked before this hook fires.** The only way for a plugin to route the model per-agent is via the `config` hook (set `config.agent.{name}.model`). Per-category routing requires a custom `delegate_task` tool (deferred to Phase 2).

So in Phase 1:

1. `input.agent.name` and `input.model.{providerID,modelID}` come from OpenCode (already routed via the `config` hook).
2. Resolve the **variant** (priority: `input.message.variant` > agent's preferred entry from our config > none).
3. Look up the matched FallbackEntry for `(agent, model)` to get `reasoningEffort`/`thinking`/`temperature`.
4. Apply variant translation via `variantTranslator(modelFamily, variant)` → mutate `output.options`/`output.temperature`/etc.
5. Append a `ResolutionEntry` to the per-session ledger.

### `chat.message(input, output)` hook

1. Strip `<SYSTEM_REMINDER>` blocks, then run `detectIntent(message, agent)`.
2. If hit and not already latched for this session, compose mode + deepwork prompts based on selected model family.
3. Prepend composed prompt to `output.system`.
4. Mark intent latched in session state.

### `event(input)` hook

1. On `session.complete`: GC session state.
2. On `session.error`: log only (Phase 2 will retry).

## Config schema (Zod)

```ts
const Variant = z.enum(["low","medium","high","xhigh","max","minimal","none","auto","thinking"])

const FallbackEntry = z.object({
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

const ModelRequirement = z.object({
  fallbackChain: z.array(FallbackEntry).min(1),
  variant: Variant.optional(),
  requiresModel: z.string().optional(),
  requiresAnyModel: z.boolean().optional(),
  requiresProvider: z.array(z.string()).optional(),
})

const Config = z.object({
  categories: z.record(z.string(), ModelRequirement).optional(),
  agents: z.record(z.string(), ModelRequirement).optional(),
  fallbackModels: z.array(z.string()).optional(),
  systemDefaultModel: z.string().optional(),
  intent: z.object({
    enabled: z.boolean().default(true),
    skipAgents: z.array(z.string()).default([]),
  }).optional(),
  debug: z.boolean().default(false),
}).strict()
```

## Build / run

- TypeScript via `tsc` (no Bun dependency required for OCMM).
- Single CommonJS or ESM bundle (OpenCode plugins are ESM).
- `pnpm install` → dev deps: `typescript`, `zod`, `@types/node`.
- No runtime deps beyond `zod` (small).

## Testing strategy (Phase 1)

- Unit tests with `node:test` runner (no Vitest/Jest dependency to keep minimal):
  - `fuzzyMatchModel` corner cases.
  - `variantTranslator` per family.
  - `detectIntent` regex correctness + guard exemptions.
  - `resolveModel` 6-step priority order with mocked ProviderCache.
- 1 integration test simulating a real `chat.params` call.
