# Fallback Systems

Two independent fallback layers, mirroring omo's design but simpler.

## Proactive (model-fallback)

**When:** before the request leaves the plugin, in `chat.params` hook.

**Why:** the configured/preferred model is not available (provider not connected, model not in available list, missing auth).

**How:** walk the FallbackEntry chain in order. For each entry, check `connectedProviders` and `availableModels`. First passing entry wins. Apply variant translation, set the request's model + params.

**Where in code:** `src/routing/proactive.ts` (Phase 1).

## Reactive (runtime-fallback)

**When:** after API error during the call, in `event` hook (session.error).

**Why:** the model accepted the call but produced a runtime error (rate limit, quota, provider 5xx, content policy block).

**How:**

1. Classify error via simple heuristics:
   - HTTP status (429/5xx → retryable; 400/422 → not).
   - Body keywords (`quota`, `rate_limit`, `overloaded`, `model_not_found`).
   - Provider-specific (Anthropic `overloaded_error`, OpenAI `insufficient_quota`).
2. If classified as retryable: pick **next entry** in the same fallback chain (skip already-tried).
3. If chain exhausted: surface the error and stop.
4. Track per-session attempted models to avoid loops.

**Where in code:** `src/routing/reactive.ts` (Phase 2).

## State

Per-session state needed:

```ts
type SessionFallbackState = {
  sessionId: string
  intentLatched: Set<"deepwork" | "team" | "superplan" | "superplan-deepwork">
  attemptedEntries: Map<string, FallbackEntry[]> // key: agent or category
  resolutionLedger: ResolutionEntry[]
}
```

Held in an in-memory `Map<sessionId, SessionFallbackState>`. Cleaned on `session.complete` event.

## OCMM Phase plan

- **Phase 1 (this milestone):** proactive fallback only. Reactive is stubbed (logs intent, no retry).
- **Phase 2 (later):** reactive retry with classified errors.
- **Phase 3 (maybe):** quota-error regression suite, provider matrix tests.
