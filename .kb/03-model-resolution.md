# Model Resolution Pipeline

The 4-tier resolution pipeline determines which model + variant is used for a request. Each tier is tried in order; the first tier that yields a match wins.

## The 4 tiers

1. **user-config** — the user's `agents[agentName]` override. Normalized via `normalizeShorthand`; if it carries a `requirement`, we resolve against it. `disabled: true` falls through to the next tier.
2. **agent-default** — the built-in agent catalog (`BUILTIN_AGENT_INDEX`). Looked up by agent name and resolved against the active model.
3. **category-default** — user's `categories[agentName]` override, else the built-in category catalog (`BUILTIN_CATEGORY_INDEX`). This tier fires when the agent name matches a category name (categories are also registered as subagents).
4. **input-variant** — if the caller passed a valid `message.variant` and no earlier tier matched, a synthetic entry is built from the current model + the input variant.

## Per-tier resolution

Each tier (1-3) calls `resolveAgainstRequirement(req, modelID, inputVariant, source)`:

1. `pickFromChain` iterates `req.fallbackChain` and returns the first entry where `entryMatches(entry, modelID)` is true.
2. If no entry matches, the chain's first entry is used as a default.
3. The effective variant comes from the matched entry's `variant`, falling back to `req.variant`.
4. If the caller supplied a valid `inputVariant`, it overrides the effective variant (but not the model).

## Matching rule

```ts
function entryMatches(entry, modelID): boolean
// Exact match, or modelID starts with entry.model (forward prefix only).
// "gpt-5.5" in the chain matches an input "gpt-5.5-20250101".
// The reverse ("gpt-5" chain entry matching "gpt-5.5" input) is intentionally
// NOT matched — a shorter chain entry must not swallow newer model IDs.
```

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

| Variant | OpenAI/GPT | Anthropic Claude (Opus 4.7+) | Gemini | Kimi/GLM/MiniMax/unknown |
|---|---|---|---|---|
| `none` | _(no override)_ | _(no override)_ | _(no override)_ | _(no override)_ |
| `minimal` | `reasoningEffort: "minimal"` | `thinking: { type: "disabled" }` | `reasoningEffort: "minimal"` | `temperature: 0.0` |
| `low` | `reasoningEffort: "low"` | `thinking budget 4k` | `reasoningEffort: "low"` | `temperature: 0.2` |
| `medium` / `auto` | `reasoningEffort: "medium"` | `thinking budget 12k` | `reasoningEffort: "medium"` | `temperature: 0.5` |
| `high` / `thinking` | `reasoningEffort: "high"` | `thinking budget 24k` | `reasoningEffort: "high"` + thinking | `temperature: 0.7` |
| `xhigh` | `reasoningEffort: "high"` | `thinking budget 49k` | `reasoningEffort: "high"` + thinking | `temperature: 0.85` |
| `max` | `reasoningEffort: "high"` | `thinking budget 65k` | `reasoningEffort: "high"` + thinking | `temperature: 1.0` |

`none` is a true no-op: no `reasoningEffort`, no `thinking`, no `temperature` override is emitted. Use it when an agent should inherit whatever the caller already set.

## Ledger

Each resolution emits a structured ledger entry for observability:

```jsonc
{
  "ts": 1719129600000,
  "sessionID": "ses_abc123",
  "agent": "reviewer",
  "input": { "providerID": "openai", "modelID": "gpt-5.5", "variant": null },
  "applied": { "variant": "high", "reasoningEffort": "high" },
  "source": "agent-default"
}
```

`source` is one of `user-config`, `agent-default`, `category-default`, `input-variant`, or `no-op` (when no tier matched and no input variant was supplied).
