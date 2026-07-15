# Subagent Initial 429 Retry and Fallback Design

## Goal

When a newly created child session receives HTTP 429 on its initial model request, retry the same model before advancing through its configured fallback chain. Each fallback model receives a fresh retry budget. Recovery-time hints determine whether retries wait or probe immediately, and each provider can treat rate-limit state as model-scoped or provider-scoped within that child session.

The feature must preserve the existing runtime fallback behavior for root sessions, child sessions whose initial request does not fail with 429, non-429 retryable errors, and sessions where the feature is disabled.

## Non-goals

- Do not replace OpenCode's task or background-agent engine.
- Do not share retry counts or blocked state across child sessions.
- Do not change the meaning of the existing `runtimeFallback.maxAttempts`; it continues to limit model switches, not same-model retries.
- Do not add provider-specific parsers without a concrete, tested error format.

## Design

### Configuration

Add a strict nested object under `runtimeFallback`:

```jsonc
{
  "runtimeFallback": {
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

- `enabled` defaults to `true`. Setting it to `false` restores the current behavior in which a retryable 429 immediately enters generic fallback.
- `maxRetries` defaults to `5` and accepts non-negative integers. It counts additional dispatches after the initial failed request, so `0` means immediate fallback.
- `providerScopes` maps provider IDs to `"model"` or `"provider"`. Providers absent from the map default to `"model"`.
- The profile overlay schema exposes the same fields as optional values.
- The recovery threshold is fixed at strictly greater than 10 minutes. The no-hint backoff uses fixed implementation constants rather than additional configuration.
- An omitted `subagent429` object resolves to these defaults, so the feature is active whenever runtime fallback itself is enabled unless explicitly disabled.

Regenerate `schema.json` from `src/config/schema.ts`. Document the new object in `README.md`, `docs/architecture.md`, and `examples/ocmm.example.jsonc`.

### Component boundary

Add `src/runtime-fallback/subagent-429-controller.ts`. The runtime fallback event handler owns one controller instance and consults it before generic fallback processing.

The controller owns only child-session 429 state and scheduling. It reuses callbacks supplied by the event handler for:

- dispatching the same model through `dispatchFallbackRetry`;
- selecting and committing the next fallback entry through the existing fallback state helpers;
- logging retry and switch decisions.

The controller must not absorb generic fallback state. Existing `FallbackState` continues to own chain index, model-switch attempts, failed-model cooldowns, and the active model.

The dedicated flow calls `dispatchFallbackRetry` with a new optional `abortBeforeDispatch: false` argument. The dispatcher defaults this option to `true`, preserving every existing generic fallback caller. Dedicated retries wait for the 429-owned idle before dispatch, so aborting that already-settled request is unnecessary and would create an additional ambiguous idle event.

### Runtime event contract

OpenCode publishes a provider error before setting the session idle, invokes plugin event hooks without awaiting their returned promises, and exposes no request or attempt ID on these events. A synchronous `client.session.prompt()` call may therefore still be pending when the prompt's idle or error event reaches the controller.

The controller must establish event ownership rather than infer it from session ID alone:

- every handled 429 creates a prior-error-idle barrier;
- the next dispatch can start only after both its retry delay and that barrier are satisfied;
- dedicated dispatches skip the dispatcher's pre-abort, so an idle observed during dispatch belongs to the current prompt rather than a synthetic abort;
- the first provider outcome queued for the current dispatch generation takes precedence over an idle observed for that generation.

### Child-session activation and lifecycle

Use the same child-session lineage fields already supported by the subagent depth guard: `parentID`, `parentId`, `parentSessionID`, and `parentSessionId` on `session.created`.

For each session, the controller tracks whether the initial request is still pending:

1. A child `session.created` marks the session as initial-request pending.
2. An initial `session.error` classified with status code 429 activates the dedicated retry flow.
3. An initial non-429 error consumes the pending marker and continues through generic fallback.
4. A `session.idle` with no active 429 flow consumes the pending marker, identifying an initial request that completed without activating the feature.
5. A later 429 that did not originate from an initial 429 flow uses existing generic fallback behavior.
6. `session.deleted` always cancels dedicated timers and state. During an active flow, the idle following a known 429 satisfies that error's barrier without cancelling its scheduled retry. An idle owned by a dispatched retry is recorded against that dispatch generation and ends the dedicated flow after the dispatch settles if no 429 was queued.

Track the active attempt phase so idle can be interpreted without clearing work scheduled by the preceding error. This dedicated phase tracking does not alter the established generic fallback lifecycle; in particular, idle still preserves `FallbackState`.

Once activated, the dedicated flow remains active across retries and fallback-model dispatches until success, deletion, a non-429 error handoff, or an unrecoverable dispatch/fallback failure. A non-429 received while no dedicated dispatch is active exits immediately to generic fallback. A non-429 received during a dedicated dispatch is queued for that generation and handed off exactly once after the current dispatch settles and releases its in-flight guard.

### Per-session state

Dedicated state is keyed by session ID and contains:

- retry counts keyed by the configured scope;
- blocked-until deadlines keyed by the configured scope;
- the last parsed recovery delay for the active scope;
- the active attempt phase and whether its outcome has already produced a 429;
- whether the current error-owned idle barrier and retry delay are satisfied;
- whether the active dispatch generation has observed idle;
- at most one queued provider outcome for the active dispatch: either an explicit 429 or a non-429 generic-fallback handoff;
- at most one pending timer;
- a timer generation used to invalidate stale callbacks.

For model scope, the key is `providerID/modelID`. For provider scope, the key is `providerID`. These maps never leave the child session, so concurrent child sessions do not consume each other's budgets or inherit blocked deadlines.

### Recovery-time extraction

Extend error classification with an optional `recoveryDelayMs` for explicit HTTP 429 errors.

The extractor checks a bounded set of common locations: the top-level error, `error`, `cause`, and `response.headers`. It supports:

- `Retry-After` headers;
- `retryAfter`, `retry_after`, `retryDelay`, `retryAfterMs`, and `retry_after_ms`;
- numeric seconds, explicit duration strings, HTTP dates, and ISO timestamps;
- messages containing an unambiguous keyword and unit, such as `retry after 90 seconds`, `try again in 12m`, or `reset at <timestamp>`.

It does not parse isolated numbers without a recovery keyword or unit and does not recursively scan arbitrary object graphs. If multiple valid candidates exist, use the longest positive delay to avoid underestimating the provider's limit. A missing or invalid value yields no recovery hint.

Only an explicit classified status code of 429 activates the dedicated controller. Existing regex-only retry classifications continue through generic fallback.

### Retry algorithm

For an active child-session 429 flow, process each 429 in this order:

1. Resolve the active provider/model and its configured scope key.
2. If the scope has already dispatched `maxRetries` retries, switch models.
3. If `recoveryDelayMs` is greater than 10 minutes, enqueue an immediate same-model probe with a zero-delay timer.
4. If `recoveryDelayMs` is at most 10 minutes, enqueue the same model after the full recovery delay without jitter.
5. If no recovery hint exists, use equal-jitter exponential backoff: the raw delay is `min(30 seconds, 1 second * 2^retriesUsed)`, and the actual delay is uniformly chosen from the upper half of that interval.
6. Mark the delay ready when its timer fires, but do not dispatch until the prior-error-idle barrier is also satisfied.
7. Increment the scope's retry count after `dispatchFallbackRetry` returns `true`. If a provider error for that dispatch was queued before a `false` return, the queued event proves the request ran and takes precedence: count the retry exactly once, then either process the queued 429 or execute the queued non-429 generic handoff. A `false` result with no queued provider outcome stops the dedicated flow without consuming another retry.

Long recovery hints therefore cause up to `maxRetries` immediate probes. If every probe still reports more than 10 minutes, the final failed probe exhausts the budget and switches models. If any probe reports 10 minutes or less, the next retry waits that full duration. Missing recovery hints follow the exponential schedule. Any continuing 429 switches models after the same budget is exhausted.

`maxRetries: 0` skips same-model scheduling and immediately attempts fallback.

The dedicated controller runs before the existing fallback-chain length guard. A child session with only one configured model still receives same-model retries; budget exhaustion then stops because no fallback candidate exists.

### Fallback selection and scope blocking

Model switches continue to use the existing one-way fallback chain and consume `runtimeFallback.maxAttempts`. Same-model retries do not consume that counter.

Before switching, record a local blocked-until deadline for the failing scope:

- use the last parsed recovery deadline when available;
- otherwise use `runtimeFallback.cooldownSeconds` from the latest 429.

Extend fallback candidate lookup with an optional blocking predicate whose default permits every candidate, preserving all existing callers. The dedicated controller supplies a predicate that skips entries whose model or provider scope is still blocked in this child session.

With model scope, another model from the same provider remains eligible. With provider scope, all models from the blocked provider are skipped. When a new fallback model is dispatched successfully, its distinct scope begins with a fresh `maxRetries` budget and follows the same algorithm.

Prepare a model switch without advancing `FallbackState`, then dispatch the prepared target. Commit its fallback index and attempt exactly once when dispatch succeeds or when a current-generation queued provider outcome proves the target request ran. If dispatch returns `false` with no queued provider outcome, do not commit the switch. A queued non-429 handoff therefore starts generic fallback from the committed switch target, including when the error event omits model identity.

If no candidate remains, the existing model-switch limit is exhausted, or dispatch fails without a queued provider outcome, stop the dedicated flow, cancel pending work, log the reason, and allow the current error to remain visible. Do not create a retry loop around internal dispatch failures.

### Concurrency, observe-only mode, and logging

- Schedule both delayed retries and immediate probes through an injected scheduler so event handling never sleeps and tests use a fake clock.
- Inject clock and random sources for deterministic deadline and jitter tests.
- Every scheduled callback captures a generation and exits if deletion, cancellation, or a newer schedule has invalidated it. Idle satisfies an ownership barrier; it does not invalidate scheduled work.
- A scheduled dispatch is gated by two independent signals: delay ready and prior error idle observed. Either signal may arrive first.
- During dispatch, record the first provider outcome and idle for that generation. On settlement, resolve outcomes in this order: queued provider outcome, observed idle, then awaiting a later result event. A queued explicit 429 remains in the dedicated flow; a queued non-429 stops dedicated state and invokes generic fallback only after the dedicated dispatch promise has settled.
- Keep at most one timer per session. Continue relying on the dispatcher's existing in-flight session guard as a second line of defense.
- With `runtimeFallback.dispatch: false`, classify and log the decision but do not schedule, increment counters, or switch models.
- Log session ID, provider/model, retry ordinal, selected delay, scope, and switch reason. Do not log the complete provider error payload.

## Expected code changes

- Add `src/runtime-fallback/subagent-429-controller.ts` and its tests.
- Extend `src/runtime-fallback/error-classifier.ts` and tests with recovery-time extraction.
- Integrate lineage and controller handling in `src/runtime-fallback/event-handler.ts` and its tests.
- Add an optional candidate-blocking predicate to `src/runtime-fallback/fallback-state.ts` and test backward-compatible lookup.
- Add the default-preserving `abortBeforeDispatch` option to `src/runtime-fallback/dispatcher.ts` and test both default abort and dedicated no-abort dispatch.
- Extend `src/config/schema.ts`, its profile overlay, schema tests, and generated `schema.json`.
- Update `README.md`, `docs/architecture.md`, and `examples/ocmm.example.jsonc`.

## Verification

Automated tests must prove:

1. A child session's initial 429 retries the same model instead of immediately switching.
2. Five long-recovery probes with the default budget switch only after the fifth retry fails.
3. A long-recovery probe that falls to 10 minutes or less waits the reported duration.
4. Missing recovery hints use deterministic equal-jitter exponential backoff and switch after budget exhaustion.
5. `maxRetries: 0` immediately falls back.
6. Each fallback model receives a fresh retry budget while each switch still consumes existing `maxAttempts`.
7. Model scope permits another model on the same provider; provider scope skips all models on that provider.
8. Two child sessions maintain independent counts, deadlines, and timers.
9. Root sessions, initial non-429 child errors, later non-activated 429 errors, regex-only retry matches, and disabled configuration preserve current behavior.
10. Error-owned idle and delay-ready may arrive in either order and dispatch exactly once. Dedicated dispatch skips pre-abort. A single success idle observed before prompt resolution completes the flow after settlement, while a queued provider outcome beats idle and is processed once. Deletion, exhausted chains, and failed dispatches without queued outcomes cancel stale work without clearing generic fallback state incorrectly.
11. Same-model retry and prepared switch each account exactly once for `true + queued`, `false + queued`, and both `queued → idle → settlement` and `queued → settlement → idle` orders. Bare `false` does not account. A non-429 queued during dispatch performs one post-settlement generic handoff from the active target; deletion or session recreation cancels it.
12. Recovery parsing covers supported headers, fields, durations, dates, messages, invalid inputs, and multiple-candidate selection.
13. Configuration parsing covers defaults, `maxRetries: 0`, invalid scopes, and profile overlays.

Run the repository quality gates:

```text
pnpm run typecheck
pnpm test
pnpm run build
```

Use a fake scheduler with the real event handler and mock client to exercise the observable dispatch sequence without real ten-minute waits. Final acceptance includes an independent code review focused on timer cancellation, retry-count boundaries, candidate filtering, and regressions in generic fallback.
