# Runtime recovery

## Scope and defaults

Runtime recovery is an opt-in, restart-scoped DSMM setting. Its complete default is:

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

`maxFallbackAttempts` and `idleContinuation.maxContinuations` are finite integer caps floored and clamped to `0..10`. An empty `fallbackRoutes` list is valid and supplies no provider/model fallback. When runtime recovery is disabled (`enabled` is false), recovery is isolated: it does not disable or alter DSMM prompts, skills, guards, LSP, or model routing.

## Host retry and fallback routes

The host `agent/request-error` decision wins by identity. DSMM calls downstream first and acts only after the host declines to retry. It classifies failures using exact integer status membership and lowercased exact code membership only; it performs no message parsing or provider-message classification.

For a host-declined, retryable failure, the failed provider must match the latest request header before DSMM can select a route. Attempted routes are reconstructed from durable request headers: the latest valid header before the target `step/start` is inherited, then valid route changes within that same turn and step are appended. DSMM chooses only the first unattempted, non-failed fallback in configured order. It does not discover providers, infer a heuristic chain, or reorder the configured list.

`maxFallbackAttempts` counts selected fallback routes after the primary route. A cap of zero selects none; an exhausted cap, invalid route, missing header, provider mismatch, disabled setting, aborted signal, or non-retryable failure leaves the host decision unchanged. The selected route is held in process-local state behind a one-shot `(agent, turn, step)` fence. DSMM makes no timer or provider call itself and does not replace the host retry backoff policy.

## Request ordering

The default recovery `agent/request` listener is downstream of the prepend model routing listener. It first receives the downstream request configuration, then applies a matching pending fallback route and removes stale adapter-owned `reasoningEffort`. All other downstream fields are preserved.

The outer model routing listener sees the final route. It calibrates reasoning only for the final exact official V4 Pro route; a fallback route does not broaden the existing model-routing match.

## Durable continuation

Idle continuation is separately opt-in. It is eligible only for an active deepwork session or selected DSMM preset when the signal is not aborted and the durable state shows either a latest current-turn todo with `pending` or `in_progress` status, or a latest active goal. The cap is per live agent and turn, so each live agent/turn pair gets at most `maxContinuations` steering attempts.

The continuation uses this exact user message:

> Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work.

Steering failure consumes an attempt and produces a sanitized warn/fail-open result: it never rejects turn shutdown. DSMM emits only fixed sanitized warnings: `dsmm runtime recovery could not evaluate fallback; preserving the host request-error decision` and `dsmm runtime recovery continuation steering failed for turn <turn>`.

## Cold restart

Durable route/header work can be reconstructed after a cold restart from session events. Process-local pending-route and continuation-count state cannot. There is no continuation until the user or host resumes a turn, which prevents DSMM from fabricating a cross-process retry or continuation loop.

## Subagent recovery

Continuable child sessions differ from one-shot children: a continuable child has a known session that can be resumed deliberately, while a one-shot child has no safe automatic follow-up contract. `subagent/end` is live-only diagnostic information, not a durable recovery trigger.

To investigate an interrupted child, reconstruct the parent `subagent/descriptor` together with the child durable `turn/end` record. Explicitly continue the known child session when the host/user has the required live context. DSMM never synthesizes a parent prompt, parent session, or task ID, and it does not automatically follow up a child or parent.

## Non-goals and logging

- No fake or extended `llm/retry` events.
- No retry timer or backoff replacement, no timers, no session aborts, and no background polling.
- No cross-process automatic retry.
- No provider discovery or heuristic fallback chain.
- No provider-message parsing or classification, and no provider calls outside the host request loop.
- No automatic child followup. No automatic parent followup.

Warnings are fixed and sanitized; they omit request bodies, provider error bodies, credentials, todo text, goal text, and arbitrary exception details.
