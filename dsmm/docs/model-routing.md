# Model routing

## Explicit role policies

`roleRouting` is a map keyed by canonical DSMM role ID. It defaults to `{}`; role names alone do not select a model. It can be supplied by deployment configuration or a selected [runtime profile](profiles.md). The 0.1.5 contract adds independent per-role strategy and finite retry policy without embedding native account configuration. Provider authentication and the provider/model catalog remain native DSH deployment configuration, never profile-file contents. The following is a deployment baseline example:

```yaml
- id: dsmm
  config:
    defaultActive: true
    roles:
      dsmm-builder: false
    roleRouting:
      dsmm-orchestrator:
        strategy: startup-lock
        primary:
          provider: my-provider
          model: primary-model
          reasoningEffort: high
        fallbackRoutes:
          - provider: my-provider
            model: backup-model
            reasoningEffort: high
      dsmm-reviewer:
        strategy: rate-limit-fallback
        rateLimit:
          maxRetries: 3
          switchAfterRateLimits: 3
          maxSwitches: 2
        primary:
          provider: my-provider
          model: review-model
          reasoningEffort: max
        fallbackRoutes: []
    runtimeRecovery:
      enabled: true
      fallbackRoutes: []
      idleContinuation:
        enabled: false
```

An ordinary top-level Agent always uses the native DSH model tab's assembled provider/model/effort, including its implicit default before the first request. Enabling Deepwork, selecting a role preset, loading a profile or switching a profile normally does not replace that selection. Root requests do not replay historical model choices, calibrate the effort or automatically switch channels/models. Bounded, positively no-output-safe rate-limit retries stay on the same native route. This applies to every top-level role, not only Orchestrator.

`primary` supplies child-role defaults and is also an advisory model for an explicit **switch profile and use its model** action. That opt-in action submits through native `session/selectModel`; native projection and the actual picker reflect the accepted result. A later model-tab choice remains authoritative. Native model selection has its ordinary background-default persistence behavior; editing profile fields, saving drafts and normal profile switches never call that endpoint. DSMM captures native intent only to fence old retry work; a concurrent later choice belongs to the next assembly, not the already assembled frame.

For a trusted native one-shot role alias, `primary` is also a default rather than an unconditional overwrite of explicit native child options. That live-child exception requires genuine native parent ownership and zero inherited event prefix. Root, cold/unowned child and parent-seeded fork requests cannot claim that exception. A parent's manual native choice does not replace a configured child's own role primary; genuine child-local authority remains distinct. Unconfigured/disabled roles, unrecognized children, and out-of-scope sessions do not acquire another role's policy. Disabled-role configuration may be retained but does not create a callable role. Auxiliary role policies apply through delegation, not additional root presets.

Settings resolve from built-in defaults, then deployment configuration, then the admitted immutable runtime revision. Global profile apply affects newly created unscoped Agents only; explicit idle current-session apply creates a new epoch for that root and later children. Existing children retain their previous snapshot. Cold resume uses a committed session sidecar when present, otherwise the current global default. Changing a draft alone changes none of these policies; see [profiles](profiles.md). Explicit empty fallback lists remain empty instead of inheriting an omitted global chain.

For child Agents, native preparation chooses the primary or first resolvable configured candidate in order. This does not make a sacrificial request or claim account/network health. Missing catalog rows do not make a custom route unavailable; malformed/unsupported exact efforts remain hard errors. Apply may retain dormant unavailable alternatives when another candidate is admissible. No admissible child candidate means a visible no-request refusal, never a silent native baseline. An unrelated configured primary cannot block an ordinary root's native chosen model.

For child Agents, `startup-lock` is the default, including old documents with an omitted strategy. Once admitted, it keeps the exact provider/model/effort across turns and bounded `RATE_LIMIT` retries. `rate-limit-fallback` starts identically, but distinct positively no-output-safe rate-limit failures reaching the configured threshold advance the ordered chain within finite switch/delay caps. Per-role overrides inherit only omitted fields from `runtimePolicy`; different roles and sessions never share route locks or counters. Success resets consecutive rate-limit counts. Duplicate errors do not count twice and exhausted chains never wrap to primary. Ordinary roots retain the native model even when a child-role policy specifies fallback switching.

Only an exact native `NO_ADAPTER` or adapter-proven `UNKNOWN_MODEL` failure on the first actual request, before any accepted output/tool fragment, may advance a remaining startup candidate. Later generic, transport, authorization, quota, payment, context and cancelled failures do not authorize inferred hopping. Exact rate limit is never startup unavailability. Every automatic retry or switch requires a positively correlated native attempt and its matching live/durable no-output settlement; partial text, reasoning, tool fragments or completed blocks forbid even same-route retries. See [runtime recovery](runtime-recovery.md).

Each configured route requires a nonempty provider and model together. An optional named `reasoningEffort` is a native adapter ID, not an OpenCode variant translation. The exact configured effort must be supported; unsupported `max` fails rather than being substituted with `high`. A changed route without effort clears incompatible inherited effort and lets the native adapter resolve its default. For a native child override that changes provider/model without supplying effort, the alias likewise clears the profile-primary effort rather than carrying it onto the new route. Existing DeepSeek calibration cannot override the admitted explicit role/child effort.

Native child options keep `modelSelectionSettings:false`: this correction introduces no new model-visible selection permission or tool. DSMM's aliased native provider merges profile-primary defaults from the admitted parent snapshot with explicit native child options, then invokes the parent's native `llm.resolveCallConfig` preflight before native spawn. The trusted live-child path preserves that accepted route/effort through the final request headers instead of reapplying the profile primary. Standing preset/tool rows do not capture per-profile routes. The path preserves native persona/tool filters, depth, permissions, cancellation, and one-shot lifecycle. Child identity comes from its own durable native subagent descriptor, not a parent preset, persona text, or a model-visible role label. Descriptor identity can be reconstructed after reload; it does not prove live ownership or make terminal one-shot children resumable.

Default primary preparation does not reset an admitted fallback or an accepted native user choice. Public `session/selectModel` intentionally persists the native default in the host's background; profile-editor fields use only the advisory catalog and never call that endpoint. Final native request headers are authoritative, not an intermediate middleware snapshot. See [runtime recovery](runtime-recovery.md) for role/global chain precedence and retry fences.

DSMM records a model-hidden `dsmm/role-policy` identity for explicit routing. It hashes the admitted profile epoch, strategy/retry policy and routes while keeping the audited v1 event's exact three-key grammar. Unchanged admitted policies retain accepted routes across turns; a scoped apply changes the root's epoch and invalidates old pending reservations. Child epochs come only from child-owned history/native live ownership. Cold admissions do not resurrect an old process-local lock merely from history. This metadata does not add model-visible prompt text, create a resumable child lifecycle, or substitute for session sidecars.

On DSH 0.2.0-rc.2, durable custom metadata requires explicit deployment-only `sessionPersistence: {root, compression}` on the main DSMM Loader entry. DSMM mounts its native JSONL companion and awaits readiness before installing runtime hooks. The public `@dsmm/dsmm/session-persistence` export is a library building block, not a second package Loader source. An incompatible durable provider is rejected before DSMM appends its custom event; ephemeral Hosts without persistence remain allowed. Native `Session.append` cannot set the stock-reader `ignorable` marker itself. See [persistence compatibility](compatibility.md#session-persistence-compatibility) for preserving the effective storage settings, disabling the exact stock provider at startup, and old-log repair limits. Final frozen-artifact/production acceptance remains pending; source contracts are not release proof.

## Legacy exact-route calibration

DSMM calibrates only child Agents on exact verified routes while deepwork mode or a selected DSMM preset is in scope. Ordinary roots preserve native effort without calibration:

| Route | Calibration settings | Default |
| --- | --- | --- |
| `deepseek-official/deepseek-v4-pro` | `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, `deepseekV4ProMaxReasoningPresets` | `auto`, `high`, plan-critic/reviewer |
| `deepseek-official/deepseek-flash` or `deepseek-account/deepseek-flash` | `deepseekFlashCalibration`, `deepseekFlashDefaultReasoningEffort`, `deepseekFlashMaxReasoningPresets` | `auto`, `high`, plan-critic/reviewer |

The Flash model ID is `deepseek-flash` (catalog name `DeepSeek-V41-Flash`), not `deepseek-v4-pro` or a guessed V4.1 alias. Other provider IDs, even with an identical model string, are not calibrated. DSMM does not change the user's default provider/model.

`off` leaves the request unchanged. `auto` fills an omitted reasoning effort while preserving an explicit upstream effort. `strict` may replace an upstream effort only when configured and when the final route's `llm.resolveModelInfo` advertises a permitted value. The chosen effort is `max → high → valid default → unchanged` for a max-designated role; otherwise it is `desired → valid default → unchanged`. No effort is invented when the model has no reasoning metadata. The provider and host retain temperature and tool/reasoning-content serialization ownership.

The selected preset comes from the latest valid selection event or session header. Without an explicit role policy, native children retain normal model inheritance; a role label alone cannot prove heterogeneity. The max-to-high negotiation above applies only to legacy calibration, never to an explicit role effort. Runtime recovery chooses any final route before calibration evaluates it.

The capability-failure warning is sanitized to route and desired effort; it includes no prompt, credentials, response body or request headers. The actual persisted request header, not an outer middleware probe's earlier snapshot, is authoritative for the resolved effort.
