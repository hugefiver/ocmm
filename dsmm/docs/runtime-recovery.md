# Runtime recovery and route strategies

DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`.

## Independent role strategies

Each role may use `startup-lock` (default) or explicit `rate-limit-fallback`. `runtimePolicy` supplies inherited defaults; role `strategy` / `rateLimit` overrides only explicit fields. Profiles contain no native accounts or credentials.

Child preparation admits the primary or first resolvable configured candidate in order without a sacrificial completion. A catalog isn't an authentication/network-health check. `startup-lock` retains the admitted route for bounded safe rate-limit retries. `rate-limit-fallback` may advance its ordered chain after the configured threshold. Success resets consecutive counts, duplicate failure delivery doesn't count twice, and exhausted chains don't wrap.

Ordinary roots retain native assembled provider/model/effort, even before the first selection event. Role/global primary and fallback chains don't automatically replace that route. **Use profile model** is a separate explicit selection action against admitted immutable configuration, not a retry or overlay Apply.

| Policy field | Default | Strict integer bound |
| --- | --- | --- |
| `maxRetries` | 3 | 0 to 10 |
| `initialDelayMs` | 500 | 0 to 30000 |
| `maxDelayMs` | 10000 | 0 to 30000 |
| `maxTotalDelayMs` | 30000 | 0 to 120000 |
| `switchAfterRateLimits` | 3 | 1 to 10 |
| `maxSwitches` | 2 | 0 to 10 |

`maxRetries` counts requests after the first on a route; the threshold includes the first distinct failure. Exhausted retry budget stops the attempt even before the switch threshold. Switches consume a finite scope budget. Invalid values refuse instead of becoming different defaults.

`roleRouting.<role>.fallbackRoutes` owns its full route/parameter sets. Explicit `[]` suppresses inherited alternatives; omission inherits the applicable chain. A fallback doesn't inherit primary-only parameters. Omitted effort clears stale explicit effort. `runtimeRecovery.enabled` isn't the role strategy selector, and retained generic status/code lists don't authorize arbitrary transport/server retries or channel hopping.

## Positive no-output proof and native execution

Every automatic retry or switch needs correlated positive no-output evidence from native `agent/request-error` and `agent/assistant-stream`. Missing, stale, ambiguous or mismatched Agent, admission, request, turn/step or generation evidence refuses replay. Partial text, reasoning or tool-call fragments forbid automatic replay, including same-route retries. Already executed tools aren't rerun.

Only public registration-directory proof of provider absence or adapter-proven `UNKNOWN_MODEL` may advance startup candidates without accepted output. A generic `NO_ADAPTER` from middleware or an unready registered adapter isn't absence proof. Authorization, payment/quota, context, cancellation and ambiguous transport/server failures don't authorize hopping; error wording isn't proof.

Fallback decisions stay in the native request loop. DSMM doesn't create another request scheduler, invoke providers independently, synthesize retry prompts or restart turns. Native adapter retry and DSMM candidate policy must remain bounded together. Where native evidence can't establish a reliable no-output boundary, report automatic fallback unavailable and require explicit retry rather than guessing.

An abortable middleware delay can honor valid `providerRetryAfterMs` only within per-delay and total budgets. Cancellation, owner/provider retirement, closed turn/step boundaries or superseded intent invalidate pending work before another dispatch. Duplicate errors can't reserve a second fallback.

Native model selection, including same-value reselection, is new intent. Assembly captures that intent for the request; a concurrently newer selection belongs to the next assembly, not a retrofit. Child initial routes are defaults, not every-turn overrides of accepted native intent or valid fallback. Existing Agents consume admitted policy, not later saved desired configuration. See [model routing](model-routing.md).

## Live continuation and activation

Idle continuation is separately opt-in under `runtimeRecovery.idleContinuation`; it doesn't follow from a fallback chain. It requires an eligible active live Agent and unfinished durable goal/todo evidence, with a finite per-Agent/turn cap. Steering failure consumes an attempt and doesn't reject turn shutdown. It grants no extra tool or role authority.

Role delegation uses official activation. Waiting uses `delivery:'caller'`; only native `completed` is normal completion. Failure, partial output and cancellation remain visible. After publication, cancellation uses the receipt's `dispose()` and awaits cleanup. Background must be selected before start with `delivery:'parent'`; an accepted child/message receipt isn't completion. Running waiting calls can't be transferred to background.

Supported exact live children may receive Queue/Steer or interrupt through native controls, subject to current direct-parent/operator authority and actual capabilities. Inbox acceptance and interrupt acknowledgment aren't completion. Unknown sends aren't automatically retried. Read-only descendant inspection grants no control.

## Cold resume and lifetime

DSMM cold resume without trusted live admission is unsupported. Old headers, configuration sidecars, role labels or PluginRecord display data don't revive retry state, policy or execution authority. Preserve history instead of copying current settings into it. DSMM read-only history queries don't call resume. Native factory load/repair may occur before the created guard rejects execution, so refusal isn't a guarantee that the log was never opened.

Official Registry, Runtime and JSONL plugins own lifecycle and storage. DSMM scoped guards retain retirement checks; hot unload/reinstall doesn't promise uninterrupted live-session replacement. No custom owner, companion, cold migration or cross-process automatic retry is provided.

Diagnostics omit request/provider bodies, credentials and goal/todo text.
