# Fallback Systems

Two independent fallback layers, mirroring omo's design but simpler.

## Proactive (model-fallback)

**When:** before the request leaves the plugin, in `chat.params` hook.

**Why:** the configured/preferred model is not available (provider not connected, model not in available list, missing auth).

**How:** the variant for the active agent/model is resolved via 4-tier priority (user-config → agent-default → category-default → input-variant). The resolved variant is translated into `reasoningEffort` / `thinking` / `temperature` and applied to `output.options` / `output.temperature` / etc. The model itself is NOT changed here — `chat.params` cannot do that. Model selection happened earlier in the `config` hook.

**Where in code:** `src/routing/resolver.ts` (4-tier resolution) + `src/routing/variant-translator.ts` (per-family translation) + `src/hooks/chat-params.ts` (applies to output).

## Reactive (runtime-fallback)

**When:** after API error during the call, in `event` hook (`session.error`).

**Why:** the model accepted the call but produced a runtime error (rate limit, quota, provider 5xx, content policy block).

**How:**

1. **Classify** the error via `classifyError(error, cfg)` → `{retryable, reason, statusCode?, message}`. Retryable if HTTP status ∈ `cfg.retryOnStatusCodes` (default [429,500,502,503,504]) OR message matches any `cfg.retryOnPatterns` regex. Status code takes priority over pattern. Invalid user regexes are skipped silently.
2. **Resolve** the failing agent's `ModelRequirement` (user agents → user categories → built-in agents → built-in categories).
3. **Mark** the just-failed model with a timestamp in per-session `FallbackState.failedModels`.
4. **Find next** entry in the fallback chain: iterate from `fallbackIndex + 1`, skip the just-failed key, skip any model still in cooldown (`now - failedAt < cooldownSeconds * 1000`).
5. **Dispatch** via `client.session.prompt` with the next model, reusing the last user message's parts. Best-effort `client.session.abort` first. Dedup via module-level `inFlight: Set<sessionID>`.
6. **Stop** when `maxAttempts` reached, chain exhausted, or no next available model.

**Abort errors** (`AbortError`, `MessageAbortedError`, `DOMException`, or `isAbort: true`) are never retried.

**Observe-only mode:** set `runtimeFallback.dispatch: false` to classify + log without dispatching. Useful for validating config before enabling live retries.

**Where in code:** `src/runtime-fallback/` — `error-classifier.ts`, `fallback-state.ts`, `dispatcher.ts`, `event-handler.ts`.

## State

Per-session state:

```ts
type FallbackState = {
  originalModel: string         // "provider/model" of the first attempt
  fallbackIndex: number         // current position in the chain (-1 = primary)
  attempts: number              // dispatches this session
  failedModels: Map<string, number>  // modelKey → timestamp of failure
}
```

Held in an in-memory `Map<sessionId, FallbackState>` inside the event handler closure. Cleaned on `session.created` / `session.deleted` / `session.idle`.

Intent latch state (separate concern, held in `chat-message.ts`):

```ts
type SessionIntentState = {
  latched: Set<"deepwork" | "team" | "superplan" | "superplan-deepwork">
  queuedPrompt?: string         // drained by system.transform
}
```

## Config

```jsonc
"runtimeFallback": {
  "enabled": true,              // master switch
  "dispatch": true,             // false = observe-only
  "maxAttempts": 3,             // cap per session
  "cooldownSeconds": 60,        // skip a failed model for this long
  "retryOnStatusCodes": [429, 500, 502, 503, 504],
  "retryOnPatterns": [
    "rate limit", "overloaded", "temporarily unavailable",
    "service unavailable", "internal server error",
    "gateway timeout", "bad gateway", "capacity", "try again"
  ]
}
```

## What's NOT implemented (vs omo)

- **No prompt-async-gate.** omo uses a reservation/timeout/backoff system to prevent duplicate injection when `promptAsync` returns before durable acceptance. ocmm uses a simple `Set<sessionID>` for dedup. If `client.session.prompt` returns a failed status, we log + give up; the next `session.error` triggers another fallback attempt with the next model.
- **No per-agent `runtimeFallback` override.** Global config only. Per-agent tuning is a Phase 4 candidate.
- **No toast notifications.** omo calls `client.tui.showToast`; ocmm logs only.
- **No quota-error regression suite.** omo has `quota-error-classifier.regression.test.ts`; our 12 classifier tests cover the same surface with synthetic errors.
- **No reserved-retry backoff.** omo does linear backoff (MAX_RESERVED_RETRIES=6, BASE_DELAY_MS=500) when `promptAsync` returns `status: 'reserved'`. ocmm does not — a failed dispatch is a failed dispatch.

## Phase history

- **Phase 1:** proactive fallback only. Reactive stubbed (logged, no retry). Event hook had a silent input-shape bug (`raw.type` instead of `raw.event.type`), so even the stub never fired.
- **Phase 3:** reactive fallback fully implemented. Event input-shape bug fixed. 39 new tests. Live 503 E2E not tested (can't force a provider to return 503); unit tests with synthetic 503 errors cover the retryable path.
