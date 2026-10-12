# Model routing

This describes built source routing. The published `@dsmm/dsmm@0.2.0` version doesn't imply that uncommitted routing interfaces are present in its artifact. Providers, accounts and credentials remain native DSH configuration, never named-profile contents.

## Native roots and child defaults

Every ordinary top-level Agent keeps the native model tab's assembled provider/model/effort, including an implicit default before the first selection event. Deepwork activation, preset selection, draft Save, future-default selection and normal current-session Apply don't select a model or calibrate root effort. Only explicit **Use profile model** asks native selection to change it; later manual choices remain authoritative.

`roleRouting` is keyed by canonical IDs such as `dsmm-reviewer`, not tool names or labels. Each entry accepts `primary`, ordered `fallbackRoutes`, `strategy`, bounded `rateLimit`, and `levels`. Omitted primary inherits the native parent route for a child. Configured primary supplies child defaults, not a root override or new selection permission. Native child AgentOptions remain explicit host authority; changing provider/model without effort clears stale configured effort.

```jsonc
{
  "roleRouting": {
    "dsmm-reviewer": {
      "primary": { "provider": "my-provider", "model": "review-model" },
      "levels": {
        "low": { "reasoningEffort": "low" },
        "high": { "reasoningEffort": "high" },
        "max": { "provider": "my-provider", "model": "large-review-model", "reasoningEffort": "max" }
      },
      "fallbackRoutes": [],
      "strategy": "startup-lock"
    }
  }
}
```

These identifiers are placeholders for native-resolvable routes. Exact effort strings are native adapter IDs, not OpenCode variants. Unsupported `max` refuses rather than degrading to `high`. A catalog row is advisory; native resolution can accept an unlisted route without proving account/network health.

## Invocation selection

Calls default to `level:"normal"`, meaning primary or inherited routing. There is no `levels.normal` setting. `low`, `high` and `max` must be configured for that exact target; an unconfigured requested level refuses before a model request. Orchestrator isn't a child delegation target and doesn't accept level configuration. Levels don't synthesize suffixed personas or change workflow ownership.

A level override is either `{reasoningEffort}` or a complete `{provider, model, reasoningEffort?}` route. Effort-only selection keeps the resolved model and applies the exact effort to candidate preparation. A complete route replaces model and effort together; omitted effort isn't borrowed from the old route. Native host options are then honored, and an admitted invocation `route` has final override precedence.

Model-facing `route` is absent by default. Explicit deployment `subagents.allowRouteOverride:true` makes it available with the same effort-only/complete-route grammar; a named overlay can't grant this permission. A complete invocation route fixes initial preparation to that route and removes fallback routes. Effort-only overrides retain configured candidates with the requested effort. All paths still require native preflight and role/depth/filter admission. `modelSelectionSettings:false` remains in native child options.

Invocation metadata reports role, label, effective level, route source (`inherited`, `primary`, `level`, or `invocation-route`), mode and actual IDs when available. Raw call arguments aren't evidence that a route executed.

## Tool topology and target filters

`subagents.toolTopology:"per-role"` exposes individual base-role tools such as `dsmm_builder`, `dsmm_plan_critic` and `dsmm_oracle_2nd`, plus `dsmm_category` for category targets. `"parameterized"` exposes `dsmm_role` with a required `role` parameter and `dsmm_category` with a required `category` parameter. Both parameters use canonical `dsmm-*` IDs, and empty groups have no entry. Native provider aliases remain `dsmm-role-<source-name>`.

Entries contain only currently admitted targets of the correct kind. Exact caller definition, provider identity, role matrix, enablement and native depth capability are checked again at execution. The merged entry name doesn't broaden authority: inherited allow/deny filters still constrain individual targets by canonical per-role tool names. Disabled or cross-kind targets refuse. See [Agent authority](agent-presets.md#delegation-authority).

## Locks, fallback and capture

Child preparation selects the primary or first resolvable configured candidate in order without a sacrificial request. No admissible candidate produces a visible no-request refusal, not silent baseline routing. Explicit `fallbackRoutes:[]` disables inheritance of a fallback chain. Omitted role strategy/retry fields inherit `runtimePolicy`; `startup-lock` is the default.

`startup-lock` keeps the admitted route across turns and bounded positively no-output-safe `RATE_LIMIT` retries. `rate-limit-fallback` may advance the ordered chain after the configured threshold, within finite switch/delay limits. Counters and locks aren't shared between roles or sessions; duplicate errors don't count twice, success resets consecutive counts, and exhausted chains don't wrap.

Only exact first-request `NO_ADAPTER` or adapter-proven `UNKNOWN_MODEL`, before accepted output/tool fragments, can advance a remaining startup candidate. Generic, transport, authorization, quota, payment, context and cancelled failures don't authorize model hopping. Partial text, reasoning or tool output forbids automatic retry, including same-route retry. Ordinary roots remain on their native route. See [runtime recovery](runtime-recovery.md).

Existing Agents use immutable admitted policy, not a later draft or desired deployment. Idle session Apply creates a new root epoch for future children; old children keep original captures. Cold continuation doesn't reconstruct original settings from the current parent or a role label. Profile storage, native persistence and ownership are separate authorities; see [profiles](profiles.md#storage-and-lifetime) and [compatibility](compatibility.md).

## Observed route versus declared route

The child report compares initial route from real `invocation-capture` with live route from that child's `own-native-request-header`. Neither substitutes for the other. Missing capture is `missing-invocation-capture`; live unknown reasons include `no-own-request-header`, `invalid-own-request-header` and `not-observed`. A root header, inherited history prefix or configured primary isn't proof of the child's own executed route. Compatibility invocation projections are labeled as such, not presented as this comparison.

## Exact DeepSeek calibration

Child-only calibration recognizes `deepseek-official/deepseek-v4-pro` and `deepseek-official/deepseek-flash` or `deepseek-account/deepseek-flash`. The Flash model ID is `deepseek-flash`, not a guessed alias. Other providers aren't calibrated by matching model text alone.

Each route family retains independent Calibration (`off`, `auto`, `strict`) and DefaultReasoningEffort (`off`, `low`, `high`) settings. Auto preserves explicit effort; strict uses supported policy effort, but neither overwrites an admitted explicit role/child effort. No effort is invented without native reasoning metadata. Ordinary root effort stays native-owned. The retired `deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets` fields reject with `deprecated-field`; explicitly configure levels instead, without automatic migration.

*Author's note: For an operator assigning child models; configure exact resources and verify the child's own request route rather than treating role names as model proof.*
