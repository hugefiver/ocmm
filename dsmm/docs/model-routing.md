# Model routing

Providers, accounts and credentials remain native DSH configuration, never named-profile contents.

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

These identifiers are placeholders for resolvable routes. The native model picker and non-DSMM requests retain the owning adapter's effort validation. DSMM routes owned by the explicit raw Host composition below accept any valid effort string without changing advertised model metadata or claiming account/network health.

## Host-owned raw routes

`modelParameters.passthrough` is an ordinary Core setting, defaulting to `true`, resolved through global, explicit native profile and named/session overlays. It is independent of Deepwork enablement and does not prove that a raw executor is installed. Save and both Apply actions preserve the original JSON; each admitted Agent keeps its immutable policy.

With passthrough **ON**, applicable DSMM routes retain valid effort strings and opaque JSON through the declared raw owner. With **OFF**, opaque/custom parameters remain stored but are not sent, and neither configured `reasoningEffort` nor `reasoning_effort` overrides native defaults. SDK-standard `temperature`, `maxTokens` and `stop` retain native handling, including explicit native refusal of an unsupported option. Independent native model/effort selections remain native-owned under either policy. OFF does not force a replacement effort or erase configuration.

`createDsmmLlmColdStartup` is an explicit Host startup composition exported by `@dsmm/dsmm`. Install its `prepare` callback through public `dsh-app-boot.boot` before Loader entries mount. Include its patches in `profileContext.overlays` **before** `readProfilePatches`, exclude its provider names from the stock `llm-pi-ai` row, and preserve the original AgentLoop configuration, including configured Agents. The factory installs the DSMM-aware runtime before constructing the single official AgentLoop. `assertReady()` refuses incomplete composition; a model name or profile flag cannot enable raw request authority.

The provider owner requires explicit finite model declarations, an `openai-completions` endpoint, its own settings namespace and a Host-owned request-time credential resolver. Other provider owners, native catalog metadata, model discovery and native picker validation remain separate. Responses and other APIs are not supported by this raw owner. Credentials are not profile parameters; the resolver receives the named reference and cancellation signal and must not introduce an ambient fallback.

Cold Core composition can consume `configuredModelParameterPolicy(settings)` without waiting for Deepwork. Requests with an immutable Agent admission use `resolvedModelParameterPolicy(admission)`; a child must never substitute the current parent or Host setting. Both helpers return policy data, not authorization. Provider generations recheck their live Host service identity across preparation and credential waits and immediately before payload submission.

Future-default Apply and idle current-session Apply preserve valid route JSON without querying model metadata, requiring a live LLM owner, or sending a completion. Provider/model existence and supported execution are checked at actual role invocation or request preparation. Root-role, preset, ownership and CAS checks remain Apply requirements. Real requests additionally require exact Agent/role admission, the child's original capture and current direct-parent delivery authority. Cold continuation preserves that original full route rather than copying a later parent profile.

```jsonc
{
  "roleRouting": {
    "dsmm-doc-search": {
      "primary": {
        "provider": "apai", "model": "gpt-6.1-sol", "reasoningEffort": "medium",
        "temperature": 0, "full": false, "count": 0, "optional_value": null,
        "customParameters": { "rows": [false, 0, null, [], {}] }
      },
      "fallbackRoutes": [
        { "provider": "apai", "model": "gpt-5.6-terra", "reasoningEffort": "high", "fallback_kind": "terra" },
        { "provider": "apai", "model": "gpt-5.6-luna", "reasoningEffort": "high", "fallback_kind": "luna" }
      ]
    }
  }
}
```

Additional route properties are bounded plain JSON. Their original names, values and presence are preserved, including an ordinary user property named `customParameters`. Standard `reasoningEffort` maps to `reasoning_effort` for this API. Its raw alias is also accepted, but both cannot appear together. The same exclusivity applies to `maxTokens`, `max_tokens`, `max_completion_tokens` and `max_output_tokens`. A raw token field must match the declared API/model token field and satisfy the native context budget; conflicts refuse before HTTP rather than silently rewriting the value or selecting a fallback. Host messages, tools, authentication, endpoint, headers, signals, callbacks and authority fields cannot be supplied as route parameters. Host attribution headers remain authoritative.

Every fallback owns its full parameter set; primary-only properties never flow into a fallback. Full JSON value identity distinguishes parameter-only changes even at the same provider/model, while object key order does not. Native request headers persist the complete call configuration and must actually flush before dispatch. A persistence or admission failure cannot fall through to stock dispatch.

The native Root model-selection API remains its separate three-field contract. Profile Apply and the optional native model-selection action are independent operations; failure of the latter does not undo a successful profile admission.

## Invocation selection

Calls default to `level:"normal"`, meaning primary or inherited routing. There is no `levels.normal` setting. `low`, `high` and `max` must be configured for that exact target; an unconfigured requested level refuses before a model request. Orchestrator isn't a child delegation target and doesn't accept level configuration. Levels don't synthesize suffixed personas or change workflow ownership.

A level override is either `{reasoningEffort}` or a complete route with `provider`, `model` and optional effort/JSON parameters. Effort-only selection keeps the resolved model and applies the exact effort to candidate preparation. A complete route replaces the route parameters together; omitted effort isn't borrowed from the old route. Native host options are then honored, and an admitted invocation `route` has final override precedence.

Model-facing `route` is absent by default. Explicit deployment `subagents.allowRouteOverride:true` makes it available with the same effort-only/complete-route grammar; a named overlay can't grant this permission. A complete invocation route fixes initial preparation to that route and removes fallback routes. Effort-only overrides retain configured candidates with the requested effort. All paths still require native preflight and role/depth/filter admission. `modelSelectionSettings:false` remains in native child options.

Invocation metadata reports role, label, effective level, route source (`inherited`, `primary`, `level`, or `invocation-route`), mode and actual IDs when available. Raw call arguments aren't evidence that a route executed.

## Tool topology and target filters

`subagents.toolTopology:"per-role"` exposes individual base-role tools such as `dsmm_builder`, `dsmm_plan_critic` and `dsmm_oracle_2nd`, plus `dsmm_category` for category targets. `"parameterized"` exposes `dsmm_role` with a required `role` parameter and `dsmm_category` with a required `category` parameter. Both parameters use canonical `dsmm-*` IDs, and empty groups have no entry. Native provider aliases remain `dsmm-role-<source-name>`.

Entries contain only currently admitted targets of the correct kind. Exact caller definition, provider identity, role matrix, enablement and native depth capability are checked again at execution. The merged entry name doesn't broaden authority: inherited allow/deny filters still constrain individual targets by canonical per-role tool names. Disabled or cross-kind targets refuse. See [Agent authority](agent-presets.md#delegation-authority).

## Locks, fallback and capture

Child preparation selects the primary or first resolvable configured candidate in order without a sacrificial request. No admissible candidate produces a visible no-request refusal, not silent baseline routing. Explicit `fallbackRoutes:[]` disables inheritance of a fallback chain. Omitted role strategy/retry fields inherit `runtimePolicy`; `startup-lock` is the default.

`startup-lock` keeps the admitted route across turns and bounded positively no-output-safe `RATE_LIMIT` retries. `rate-limit-fallback` may advance the ordered chain after the configured threshold, within finite switch/delay limits. Counters and locks aren't shared between roles or sessions; duplicate errors don't count twice, success resets consecutive counts, and exhausted chains don't wrap.

Only provider absence established through the public registration directory, or adapter-proven `UNKNOWN_MODEL`, can advance a remaining startup candidate before accepted output/tool fragments. A generic `NO_ADAPTER` from preparation, middleware or an unready registered adapter is not absence proof. Transport, authorization, quota, payment, context and cancelled failures don't authorize model hopping. Partial text, reasoning or tool output forbids automatic retry, including same-route retry. Ordinary roots remain on their native route. See [runtime recovery](runtime-recovery.md).

Existing Agents use immutable admitted policy, not a later draft or desired deployment. Idle session Apply creates a new root epoch for future children; existing current-format children keep their original captures. Cold continuation doesn't reconstruct original settings from the current parent or a role label. Profile storage, native persistence and ownership are separate authorities; see [profiles](profiles.md#storage-and-lifetime) and [compatibility](compatibility.md).

New child captures write payload version **3**, adding the exact `one-shot` or `continuable` delegation mode to the requested route, effective initial route, effort provenance and resolved parameter policy. The outer envelope/checksum and `.children/v1` storage namespace are unchanged. The 0.3.0 reader accepts only the strict version-3 shape; V1/V2, malformed, unknown-version, or identity-mismatched captures refuse without fallback, rewrite, or migration. A version-3 one-shot child cannot be cold-resumed as live or continuable.

## Observed route versus declared route

The child report compares initial route from real `invocation-capture` with live route from that child's `own-native-request-header`. Neither substitutes for the other. Missing capture is `missing-invocation-capture`; live unknown reasons include `no-own-request-header`, `invalid-own-request-header` and `not-observed`. A root header, inherited history prefix or configured primary isn't proof of the child's own executed route. Compatibility invocation projections are labeled as such, not presented as this comparison.

## Exact DeepSeek calibration

Child-only calibration recognizes `deepseek-official/deepseek-v4-pro` and `deepseek-official/deepseek-flash` or `deepseek-account/deepseek-flash`. The Flash model ID is `deepseek-flash`, not a guessed alias. Other providers aren't calibrated by matching model text alone.

Each route family retains independent Calibration (`off`, `auto`, `strict`) and DefaultReasoningEffort (`off`, `low`, `high`) settings. Auto preserves explicit effort; strict uses supported policy effort, but neither overwrites an admitted explicit role/child effort. No effort is invented without native reasoning metadata. Ordinary root effort stays native-owned. Parameter passthrough OFF does not run DSMM effort calibration. The retired `deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets` fields reject with `deprecated-field`; explicitly configure levels instead, without automatic migration.

*Author's note: For an operator assigning child models; configure exact resources and verify the child's own request route rather than treating role names as model proof.*
