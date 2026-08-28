# DSMM Runtime Recovery Design

**Status:** Approved by full-session user delegation (`你自主继续`)

**Roadmap target:** DSMM v0.7 — Runtime recovery

**Baseline:** `cedd30b1abd03cf00b9ce330fa3b1805d76cb401` plus the reviewed, uncommitted v0.6 model-routing working tree

## Goal

Add dsh-native recovery behavior that:

- lets the host's retry policy act before DSMM;
- optionally retries a failed step on configured fallback routes;
- continues scoped work only when durable session state shows unfinished work;
- leaves subagent recovery reconstructable without claiming unsupported automatic resume behavior;
- can be disabled without disabling DSMM prompts, skills, guards, LSP, or model routing.

## Evidence and Constraints

The design targets `@deepseek-ai/dsh@0.1.1-rc.2` at commit
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

Relevant public contracts:

- `agent/request-error` is a waterfall. Its payload contains `agent`, `turn`,
  `step`, `provider`, normalized `failure`, `retryPolicy`, and `signal`.
  Calling `next()` returns `{ kind: "retry" } | undefined`.
- `agent/request` is invoked again when a request-error policy returns retry.
- `agent.session.requestHeader()?.config` exposes the most recent effective
  provider/model configuration. A durable `request/header` payload is
  `{ header: EpochHeader, reason }`; it has no turn/step coordinates. Its
  enclosing `step/start` and `step/end` events provide the coordinates needed
  to reconstruct route transitions.
- `agent/turn-stopping` is a serial event. `agent.steer(message)` queues a
  next-step message before the loop decides whether to emit `turn/end`.
- `todo/write`, `goal/change`, `request/header`, `turn/end`, and
  `subagent/descriptor` are durable. `subagent/end` is live-only and does not
  include the direct parent `Agent` required for safe automatic follow-up.
- DSH `llm/retry` events have a fixed host retry schema and cannot encode a
  provider/model route transition. DSMM must not overload or counterfeit them.

## Alternatives

### A. Host retry first, DSMM fallback second — selected

DSMM calls downstream `agent/request-error` policies first. If they request a
retry, DSMM returns that decision unchanged. Only when downstream declines does
DSMM classify the failure and optionally schedule a configured fallback route for
the repeated `agent/request`.

This preserves host retry budgets and durable retry records while adding only the
missing route-fallback layer.

### B. Port the OpenCode runtime-fallback controller

Rejected. OpenCode's controller depends on `session.error`, `session.idle`,
`session.deleted`, `message.part.updated`, task IDs, route snapshots, and an
imperative prompt/abort client. DSH exposes different, stronger request-level
waterfalls and durable session records. Porting the controller would duplicate
the host and invent unreliable event correlations.

### C. Documentation-only recovery

Rejected. It would satisfy the subagent-notes clause but would not deliver the
roadmap's retry/fallback or idle-continuation policies.

## Architecture

### 1. Pure failure classifier

Create `dsmm/src/recovery-policy.ts` with pure functions and types.

`classifyRecoveryFailure(failure, settings)` returns a normalized decision based
only on:

- exact HTTP status membership in `retryOnStatusCodes`;
- case-insensitive exact failure-code membership in `retryOnCodes`.

It does not parse arbitrary regular expressions or provider-specific message
text. `providerRetryAfterMs` remains host retry metadata; DSMM does not create a
second timer or delay scheduler.

### 2. Route fallback controller

Create `dsmm/src/runtime-recovery.ts`.

The controller owns process-local pending handoff state in a `WeakMap` keyed by
live agent identity. Each entry is also keyed by `(turn, step)`, preventing a
late fallback from affecting another request.

The request-error flow is:

1. Await `next()`.
2. If downstream returns retry, return it unchanged and do not select a fallback.
3. Stop on disabled recovery, aborted signal, out-of-scope session, or a
   non-retryable failure.
4. Read the failed route from `session.requestHeader()?.config` and verify its
   provider matches the event payload.
5. Fold durable request headers for the same turn/step by seeding the history
   with the latest valid header in force before the matching `step/start`, then
   appending any `request/header.data.header.config` changes enclosed before
   that step's end. DSH omits an unchanged header inside later steps, so the
   inherited seed is required to reconstruct the original attempt correctly.
6. Select the first configured fallback route not already attempted and not
   equal to the failed route, subject to `maxFallbackAttempts`.
7. Store that route as the pending handoff and return `{ kind: "retry" }`.

The request flow is:

1. Await downstream `agent/request` to obtain the effective configuration.
2. Consume a pending route only when agent, turn, and step match.
3. Preserve every downstream field except `provider`, `model`, and
   `reasoningEffort`.
4. Replace provider/model and remove the prior adapter-owned reasoning effort.

The recovery request listener must be downstream of the existing model-routing
listener. The outer model-routing listener then sees the final fallback route and
may apply DeepSeek calibration only when that route is the exact official V4 Pro
route.

No custom `llm/retry` event is appended. Durable `request/header` transitions are
the reconstruction source, and the host remains the sole owner of native retry
events.

### 3. Scoped continuation policy

The controller registers `agent/turn-stopping` and evaluates the durable session
event list.

Continuation is eligible only when all conditions hold:

- runtime recovery and idle continuation are enabled;
- the session is active deepwork or uses a selected DSMM preset;
- the signal is not aborted;
- the current turn has an incomplete `todo/write`, or the latest durable goal is
  in phase `active`;
- the per-agent, per-turn continuation count is below `maxContinuations`.

When eligible, DSMM calls `agent.steer(createUserMessage(prompt))`. The operation
is bounded and opt-in. A steering error is logged with a sanitized message and
does not reject turn shutdown.

The todo projection is advisory. DSMM folds raw durable events rather than
requiring an optional projection service. A `todo/write` is considered current
only after the latest `turn/start`; unfinished means at least one item has
`pending` or `in_progress` status. A durable goal remains eligible while its
latest phase is `active`.

The continuation count is process-local because DSH exposes no neutral durable
plugin note event. After a cold restart there is no automatic continuation until
the user or host resumes the turn. This avoids fabricating state or creating an
unbounded cross-process loop.

### 4. Subagent recovery boundary

Automatic subagent follow-up is not implemented in v0.7.

Reasons:

- `subagent/end` is live-only;
- it does not expose the live direct parent `Agent` required by the public
  follow-up API;
- `subagent/descriptor` records child identity and mode but not terminal outcome;
- after reload, child `turn/end` is the durable outcome source.

`dsmm/docs/runtime-recovery.md` will document:

- how continuable child sessions differ from one-shot children;
- that live `subagent/end` is diagnostic only;
- how to reconstruct an interrupted child from `subagent/descriptor` plus the
  child's durable `turn/end`;
- that users should explicitly continue the known child session rather than
  asking DSMM to synthesize a parent prompt or identifier.

This satisfies the roadmap's “notes or implementation, depending on dsh event
support” requirement without unsafe automation.

### 5. Registration lifecycle

`registerRuntimeRecovery(ctx, controller, getSettings)` registers exactly one
set of root agent listeners per context:

- one default-order `agent/request` listener for pending route handoff;
- one prepend `agent/request-error` listener so downstream host policies run via
  `next()` before DSMM decides;
- one `agent/turn-stopping` listener for bounded continuation.

A `WeakSet` prevents duplicate registration. If listener registration returns
disposers, `ctx.effect()` owns their cleanup and clears process-local state.

`apply()` registers runtime recovery before model routing. Model routing remains
the prepend outer request listener.

## Configuration

Add the following restart-scoped settings while preserving every existing flat
v0.6 setting:

```ts
interface DsmmRuntimeRecoverySettings {
  enabled: boolean
  retryOnStatusCodes: number[]
  retryOnCodes: string[]
  fallbackRoutes: Array<{ provider: string; model: string }>
  maxFallbackAttempts: number
  idleContinuation: {
    enabled: boolean
    maxContinuations: number
    prompt: string
  }
}
```

Defaults:

- `enabled: false`
- `retryOnStatusCodes: [429, 500, 502, 503, 504]`
- `retryOnCodes: []`
- `fallbackRoutes: []`
- `maxFallbackAttempts: 2`
- `idleContinuation.enabled: false`
- `idleContinuation.maxContinuations: 3`
- prompt: `Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work.`

Normalization:

- statuses are unique integers from 100 through 599;
- codes are trimmed, non-empty, case-insensitively deduplicated strings;
- routes require non-empty trimmed provider and model and are deduplicated by
  exact normalized pair;
- attempt/continuation limits are finite integers clamped to documented bounds;
- an empty route list remains valid and means no provider/model fallback.

## DSH Structural Types

Extend `dsmm/src/dsh-types.ts` minimally with:

- `DshLlmFailure`;
- `DshEpochHeader` and the exact `{ header, reason }` request-header payload;
- narrow `step/start` and `step/end` coordinate payloads used to associate
  headers with a turn/step;
- `AgentRequestErrorFrame` and `DshRequestErrorAction`;
- `AgentTurnStoppingFrame`;
- `DshSession.requestHeader?()`;
- typed `agent/request-error` and `agent/turn-stopping` overloads;
- the narrow durable event payload structures consumed by pure folders.

Do not import private DSH runtime classes or claim complete mirrors of upstream
types.

## Public Surface and Documentation

Export the recovery classifier, event folders, registration function, and public
settings types from `dsmm/src/index.ts`.

Add `docs/runtime-recovery.md` to `package.json.files`, update the README settings
and behavior tables, and mark roadmap v0.7 implemented only after the packaged
runtime gate passes.

## Error Handling

- Downstream host retry decisions always win.
- Missing/mismatched request headers fail open without fallback.
- Invalid or exhausted fallback chains return the downstream decision unchanged.
- Route handoffs are consumed once and fenced by agent/turn/step.
- Aborted signals never schedule fallback or continuation.
- Listener failures are caught, logged without prompt/error bodies, and return
  the host decision or normal stop behavior.
- No recovery path issues provider calls itself, starts timers, aborts sessions,
  or retries outside the DSH loop.

## Testing

### Pure tests

- status/code classification and normalization;
- durable inherited-header plus step-boundary request-route folding;
- todo/goal unfinished-work folding;
- fallback selection, duplicate skipping, and attempt limits.

### Hook tests

- downstream host retry suppresses DSMM fallback;
- non-retryable/out-of-scope/disabled/aborted flows preserve object identity;
- fallback handoff changes only provider/model and removes reasoning effort;
- stale turn/step pending routes do not apply;
- request-header history prevents repeated routes after controller recreation;
- continuation steers once per eligible boundary and stops at the cap;
- completed/no todo, inactive goal, disabled scope, and steer failure are safe;
- registration/disposal does not duplicate listeners.

### Packaged runtime smoke

Extend the pinned rc.2 Docker smoke with a fake adapter and no provider network:

- a downstream host retry decision wins;
- a retryable failure with no host decision changes to the configured fallback
  on the repeated `agent/request`;
- the repeated request writes a route-bearing `request/header`;
- an unfinished durable todo causes exactly one bounded continuation;
- a completed todo causes none;
- existing model routing, safety, skill, and LSP markers remain green.

### Repository gates

- DSMM test typecheck and full tests;
- DSMM build and generated export inventory;
- npm pack dry run with recovery docs and generated modules;
- pinned packaged Docker smoke;
- root typecheck, test, and build;
- `git diff --check`;
- identity-bound Oracle and primary Reviewer approval.

## Non-Goals

- Replacing DSH native retry/backoff or appending fake `llm/retry` events.
- Provider-specific message parsing or arbitrary regex error classifiers.
- Timers, session aborts, background polling, or cross-process automatic retry.
- Automatic subagent follow-up without a direct live parent-agent contract.
- Request-text heuristics, provider discovery, or automatic construction of
  fallback chains.
- Changing existing v0.6 model-routing policy.

## Acceptance

The feature is complete when:

1. Host retry wins before DSMM fallback.
2. Configured fallback retries are bounded, scoped, and visible in durable
   request headers.
3. Continuation is opt-in, bounded, and requires durable unfinished-work state.
4. Recovery can be disabled while all other DSMM features continue to work.
5. Subagent recovery limits and reconstruction steps are documented accurately.
6. The pinned packaged-runtime smoke proves fallback and continuation without a
   paid provider call.
7. All repository gates and both final review lanes approve one current artifact
   identity.
