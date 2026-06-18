# Model Resolution Pipeline

The 6-step resolution pipeline determines which model is actually used for a request. Order matters; first hit wins.

## The 6 steps

1. **UI override** — user picked a model in the UI. Source: `provider/model` from chat params. Resolution origin: `override`.
2. **User config override** — explicit `model` field in plugin config (per-category or per-agent). Resolution origin: `override`.
3. **Category default** — fuzzy-match category's default model against `availableModels`; if no match, try `connectedProviders`. Origin: `category-default`.
4. **User fallback list** — `fallback_models` from plugin config. First match wins. Origin: `provider-fallback`.
5. **Hardcoded fallback chain** — built-in agent/category fallback chain (see `02-agents.md`). Cross-provider fuzzy match. Origin: `provider-fallback`.
6. **System default** — last resort. Use `systemDefaultModel` (whatever OpenCode passed in). Origin: `system-default`.

## Fuzzy matcher

```ts
fuzzyMatchModel(target: string, available: string[]): string | undefined
// Returns first exact match, else shortest-prefix match, else undefined.
// Example: target="gpt-5.5", available=["openai/gpt-5.5-medium","openai/gpt-5"]
//   → matches "openai/gpt-5.5-medium" (prefix "openai/gpt-5.5")
```

Provider routing uses both directions: `"google/gemini-3.1-pro"` → look for any available model whose name segment after `/` starts with `gemini-3.1-pro`.

## FallbackEntry schema

```ts
type FallbackEntry = {
  providers: string[]      // ["openai", "github-copilot"] — first connected provider wins
  model: string            // "gpt-5.5"
  variant?: string         // "high", "max", etc.
  reasoningEffort?: string // "minimal" | "low" | "medium" | "high"
  temperature?: number
  top_p?: number
  maxTokens?: number
  thinking?: { type: "enabled" | "disabled"; budgetTokens?: number }
}

type ModelRequirement = {
  fallbackChain: FallbackEntry[]
  variant?: string         // default if entry omits it
  requiresModel?: string   // hard requirement, no fallback if missing
  requiresAnyModel?: boolean  // must succeed (orchestrator pattern)
  requiresProvider?: string[] // restrict provider set (worker = openai-only)
}
```

## Variant → param translation

Variant maps to provider-specific knobs at the `chat.params` hook layer:

| Variant | OpenAI/GPT | Anthropic Claude | Gemini |
|---|---|---|---|
| `low` | `reasoningEffort: "low"` | `thinking: { type: "disabled" }` | `temperature: 0.4` |
| `medium` | `reasoningEffort: "medium"` | `thinking: { type: "enabled", budgetTokens: 16000 }` | `temperature: 0.7` |
| `high` | `reasoningEffort: "high"` | `thinking: { type: "enabled", budgetTokens: 32000 }` | `temperature: 0.8`, `topP: 0.95` |
| `xhigh` | `reasoningEffort: "high"`, `maxTokens` raised | `thinking: { budgetTokens: 64000 }` | `temperature: 0.9` |
| `max` | _(opus only signal)_ | `thinking: { budgetTokens: 128000 }` | _(N/A — fall back to high)_ |
| `minimal` | `reasoningEffort: "minimal"` | _(thinking off)_ | _(temp lowered)_ |
| `none` | (no override) | (no override) | (no override) |
| `thinking` | _(N/A)_ | `thinking: { type: "enabled" }` | (gemini thinking flag) |

## Provider availability check

Before applying step 3-5, OCMM consults `ProviderCache`:

- `connectedProviders: Set<string>` — providers OpenCode has authenticated/configured.
- `availableModels: Map<provider, modelId[]>` — models each connected provider exposes.

A FallbackEntry passes if **any** of its `providers[]` is in `connectedProviders` AND the `model` (post-fuzzy-match) is in that provider's `availableModels`.

## Ledger

Each resolution emits a structured ledger entry for observability:

```jsonc
{
  "step": 5,
  "origin": "provider-fallback",
  "agent": "reviewer",
  "category": null,
  "selectedProvider": "github-copilot",
  "selectedModel": "claude-opus-4-7",
  "variant": "max",
  "skippedSteps": [
    { "step": 3, "reason": "category-default openai/gpt-5.5 not connected" }
  ]
}
```
