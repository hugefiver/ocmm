# Runtime recovery and route strategies (0.1.5)

## Two independent role strategies

Every enabled DSMM role in each profile independently selects `startup-lock` (default) or `rate-limit-fallback`. Optional `runtimePolicy` supplies inherited defaults; a role's `strategy` / `rateLimit` overrides only explicit fields. Different profiles can assign different strategies to the same role. No profile contains native account/auth configuration.

Native preparation admits the primary or first resolvable ordered candidate without sending a sacrificial completion. Catalog listing is advisory, not account/network health. `startup-lock` then retains that exact route/effort across turns and bounded RATE_LIMIT retries. `rate-limit-fallback` may advance the ordered chain after its threshold of distinct safe RATE_LIMIT failures. Success resets consecutive counts; duplicate delivery does not count twice and exhausted chains never wrap.

| Policy field | Default | Strict integer bound |
| --- | --- | --- |
| `maxRetries` | 3 | 0–10 |
| `initialDelayMs` | 500 | 0–30000 |
| `maxDelayMs` | 10000 | 0–30000 |
| `maxTotalDelayMs` | 30000 | 0–120000 |
| `switchAfterRateLimits` | 3 | 1–10 |
| `maxSwitches` | 2 | 0–10 |

`maxRetries` counts requests after the first on a route; the threshold includes that first distinct failed attempt. If retry budget runs out before threshold, stop. A switch starts fresh same-route counters but consumes the admission epoch's switch cap. Malformed, unknown, fractional or nonfinite values fail instead of becoming different defaults.

## Legacy defaults and migration

The legacy continuation/configuration block remains parse-compatible, with this complete default:

```yaml
runtimeRecovery:
  enabled: false
  retryOnStatusCodes: [429, 500, 502, 503, 504]
  retryOnCodes: []
  fallbackRoutes: []
  maxFallbackAttempts: 2
  idleContinuation:
    enabled: false
    maxContinuations: 3
    prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
```

`maxFallbackAttempts` and `idleContinuation.maxContinuations` retain their legacy finite cap grammar. An empty `fallbackRoutes` list is valid and supplies no alternatives. The legacy `runtimeRecovery.enabled` flag is not the strategy selector and does not gate the new scoped finite RATE_LIMIT policy.

0.1.4 documents remain loadable without rewriting drafts, deployment patches or history. The migration is behavioral: omitted strategy now means safer `startup-lock`, so retained generic `SERVER`, `TIMEOUT`, `TRANSPORT` or status-based retry lists do not imply later automatic channel hopping. Explicitly choose `rate-limit-fallback` only where rate-limit rollover is intended. This release supplies no inferred generic-behavior opt-in. Inspect normalized effective role policy before upgrading a deployment that depended on the old automatic behavior.

## Role-specific chains

`roleRouting.<role>.fallbackRoutes` uses the same route shape, with optional exact native `reasoningEffort`. The resolved strategy/retry policy, not legacy enabled state, controls scoped RATE_LIMIT behavior. Configuring a chain does not enable idle continuation.

For a known enabled role, an explicitly supplied chain takes precedence over the global list. `[]` suppresses global fallback for that role; an omitted chain preserves legacy global behavior. Routes retain configured order and deduplicate by provider/model identity, so changing effort does not create additional retry opportunities. Unrecognized children never inherit their parent's role chain.

To migrate explicit role chains, choose each role's strategy deliberately, keep inherited/global alternatives explicit where needed, and leave `idleContinuation.enabled:false`. Omission resolves to startup lock, not legacy generic recovery. Exact effort omission clears stale adapter-owned effort while preserving unrelated native parameters.

## Universal no-output fence and one retry owner

Every DSMM retry or switch requires positive no-output proof, even when staying on the same model. Exact Agent/admission epoch/lock generation, live attempt ID, turn/step, accepted header and committed assistant settlement must match. Dense live chunks must agree with the validated durable compact stream and its exact terminal failure. Missing, stale, mismatched, ambiguous, abandoned or duplicate evidence refuses before spending budget or waiting.

Any accepted text, reasoning, tool-call fragment, block start/end or executed tool forbids replay. Both strategies' deterministic partial-text → RATE_LIMIT and partial-tool-fragment → RATE_LIMIT cases require one provider request, zero tools and terminal refusal. Already completed earlier tools stay unchanged. Same-route retries are not exempt.

Inside the scoped DSMM RATE_LIMIT/unavailable branch, DSMM owns the native `agent/request-error` decision. Refusal is terminal and never falls through to native `mode:always` or another competing retry handler. Outside that branch, native host-first behavior and exact downstream result identity remain unchanged. All provider calls and step retries stay inside the native loop; DSMM neither calls a provider directly nor synthesizes a prompt, restarts a turn or replays tools.

Only exact native `NO_ADAPTER` or adapter-proven `UNKNOWN_MODEL` on the first actual no-output request may advance a remaining startup candidate. Contradictory 401/403/402/429 facts, authorization, quota/payment, context, cancellation, transport/server ambiguity or error-message text do not establish availability. Later generic failures cannot hop.

One finite abortable middleware delay may honor valid `providerRetryAfterMs` only within per-delay and total budgets. Invalid or too-large values refuse instead of causing infinite waiting or uncontrolled retry. Abort/disposal/epoch/header/provider replacement and closed/superseded boundaries cancel or invalidate pending work. No independent timer-driven request exists.

Fresh native `model/selection` intent also invalidates old reservations, even when provider/model/effort is unchanged. DSMM captures the exact typed user intent at native prompt-assembly start and correlates it with the native-selected request; a concurrently newer choice is for the next assembly, never a retrofit of the current frame. Explicit user provider/model/effort outranks profile primary/defaults on later turns and cold resume. Profile apply advances the admission epoch and policy without silently clearing native user intent. A parent's manual choice is not authority to overwrite a configured child's own role route.

## Request ordering

The recovery request path applies a matching pending fallback route after native request selection. A named fallback effort is preserved exactly; omission clears stale adapter-owned `reasoningEffort`. All unrelated downstream fields are preserved. Explicit role primary policy must not replace the admitted fallback on that or a later request in the same recovery scope.

Model routing evaluates the final route. Legacy calibration still recognizes only exact V4 Pro or native V41 Flash routes; a fallback does not broaden those matches. Explicit configured efforts bypass legacy degradation and are checked through the native model capability seam. DSMM does not set temperature or create a second capability registry, and the final adapter remains responsible for supported call parameters.

Duplicate failure delivery cannot select a second pending route. Closed/superseded turn/step boundaries and aborted signals cannot commit a late route. HTTP 402 never authorizes strategy rollover. No real billing/rate-limit error is manufactured for testing.

## Durable continuation

Idle continuation is separately opt-in. It is eligible only for an active deepwork session or selected DSMM preset when the signal is not aborted and the durable state shows either a latest current-turn todo with `pending` or `in_progress` status, or a latest active goal. The cap is per live agent and turn, so each live agent/turn pair gets at most `maxContinuations` steering attempts.

The continuation uses this exact user message:

> Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work.

Steering failure consumes an attempt and produces a sanitized warn/fail-open result: it never rejects turn shutdown. DSMM emits only fixed sanitized warnings: `dsmm runtime recovery could not evaluate fallback; preserving the host request-error decision` and `dsmm runtime recovery continuation steering failed for turn <turn>`.

## Cold restart

An explicit session sidecar pins its exact immutable profile/baseline on cold resume; absent sidecars retain the historical global-current contract. Process-local attempts, waits, counters and locks do not resurrect from old headers alone. New admission epochs fence old reservations and route folds while the audited `dsmm/role-policy` event retains its exact grammar. There is no continuation until the user/native host resumes activity. See [profiles](profiles.md).

## Subagent recovery

Continuable child sessions differ from one-shot children: a continuable child has a known session that can be resumed deliberately, while a one-shot child has no safe automatic follow-up contract. `subagent/end` is live-only diagnostic information, not a durable recovery trigger.

To investigate an interrupted child, use the native durable descriptor and child control/session surfaces. Explicitly continue a known continuable child only when the host/user has the required context; one-shot role tools are not continuable sessions. DSMM never synthesizes a parent prompt, parent session, or task ID, and it does not automatically follow up a child or parent. Native delegation depth and permission restrictions remain authoritative; DSMM does not raise the host's default depth.

## Non-goals and logging

- No fake or extended `llm/retry` events.
- No independent retry timer/request engine, session aborts, or background polling; only finite abortable delay in the existing native error middleware.
- No cross-process automatic retry.
- No provider discovery or heuristic fallback chain.
- No provider-message parsing or classification, and no provider calls outside the host request loop.
- No automatic child followup. No automatic parent followup.

Warnings are fixed and sanitized; they omit request bodies, provider error bodies, credentials, todo text, goal text, and arbitrary exception details.
