# Model routing

## Explicit role policies

`roleRouting` is a map keyed by canonical DSMM role ID. It defaults to `{}`; role names alone do not select a model. It can be supplied by deployment configuration or, under the 0.1.2 source contract, a selected [runtime profile](profiles.md). Provider authentication and the provider/model catalog remain native DSH deployment configuration, never profile-file contents. The following is a deployment baseline example:

```yaml
- id: dsmm
  config:
    defaultActive: true
    roles:
      dsmm-builder: false
    roleRouting:
      dsmm-orchestrator:
        primary:
          provider: my-provider
          model: primary-model
          reasoningEffort: high
        fallbackRoutes:
          - provider: my-provider
            model: backup-model
            reasoningEffort: high
      dsmm-reviewer:
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

A `primary` is role policy for directly selected roots and active top-level deepwork sessions as orchestrator when no DSMM preset is selected. For a trusted native one-shot role alias it supplies the default route, not an unconditional overwrite of explicit native child options. Supported explicit provider/model/effort overrides win only for a live child owned by a native parent with zero inherited event prefix. Root, cold/unowned child and parent-seeded fork requests still resolve the profile primary rather than claiming this live-child exception. Unconfigured/disabled roles, unrecognized children, and out-of-scope sessions do not acquire another role's policy. Disabled-role configuration may be retained but does not create a callable role. Auxiliary role policies apply through delegation, not additional root presets.

Settings resolve from built-in defaults, then deployment configuration, then the selected immutable runtime revision. Profile apply affects newly created Agents only; it does not reroute existing live Agents, including blank ones. Children and recovery use the parent's admitted snapshot. After Host restart, cold resume uses the current selected revision. Changing a draft alone changes none of these policies; see [profiles](profiles.md). Explicit empty fallback lists remain empty instead of inheriting an omitted global chain.

Each configured route requires a nonempty provider and model together. An optional named `reasoningEffort` is a native adapter ID, not an OpenCode variant translation. The exact configured effort must be supported; unsupported `max` fails rather than being substituted with `high`. A changed route without effort clears incompatible inherited effort and lets the native adapter resolve its default. For a native child override that changes provider/model without supplying effort, the alias likewise clears the profile-primary effort rather than carrying it onto the new route. Existing DeepSeek calibration cannot override the admitted explicit role/child effort.

Native child options keep `modelSelectionSettings:false`: this correction introduces no new model-visible selection permission or tool. DSMM's aliased native provider merges profile-primary defaults from the admitted parent snapshot with explicit native child options, then invokes the parent's native `llm.resolveCallConfig` preflight before native spawn. The trusted live-child path preserves that accepted route/effort through the final request headers instead of reapplying the profile primary. Standing preset/tool rows do not capture per-profile routes. The path preserves native persona/tool filters, depth, permissions, cancellation, and one-shot lifecycle. Child identity comes from its own durable native subagent descriptor, not a parent preset, persona text, or a model-visible role label. Descriptor identity can be reconstructed after reload; it does not prove live ownership or make terminal one-shot children resumable.

Primary selection does not reset an admitted fallback or a host-owned durable route change. Final native request headers are authoritative, not an intermediate middleware snapshot. See [runtime recovery](runtime-recovery.md) for role/global chain precedence and retry fences.

DSMM records a model-hidden `dsmm/role-policy` metadata epoch for explicit routing. Unchanged admitted policies retain accepted routes across turns; on cold resume an epoch is evaluated against the current admitted policy. A changed primary effort or fallback policy invalidates the prior selection and applies the new primary. Profile apply does not change a live Agent's admitted policy. Child epochs are read only from child-owned history, never an inherited ancestor. This metadata does not add model-visible prompt text, create a resumable child lifecycle, or promise cross-restart historical profile retention.

On DSH 0.2.0-rc.2, durable custom metadata requires explicit deployment-only `sessionPersistence: {root, compression}` on the main DSMM Loader entry. DSMM mounts its native JSONL companion and awaits readiness before installing runtime hooks. The public `@dsmm/dsmm/session-persistence` export is a library building block, not a second package Loader source. An incompatible durable provider is rejected before DSMM appends its custom event; ephemeral Hosts without persistence remain allowed. Native `Session.append` cannot set the stock-reader `ignorable` marker itself. See [persistence compatibility](compatibility.md#session-persistence-compatibility) for preserving the effective storage settings, disabling the exact stock provider at startup, and old-log repair limits. Final frozen-artifact/production acceptance remains pending; source contracts are not release proof.

## Legacy exact-route calibration

DSMM calibrates only exact verified routes while deepwork mode or a selected DSMM preset is in scope:

| Route | Calibration settings | Default |
| --- | --- | --- |
| `deepseek-official/deepseek-v4-pro` | `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, `deepseekV4ProMaxReasoningPresets` | `auto`, `high`, plan-critic/reviewer |
| `deepseek-official/deepseek-flash` or `deepseek-account/deepseek-flash` | `deepseekFlashCalibration`, `deepseekFlashDefaultReasoningEffort`, `deepseekFlashMaxReasoningPresets` | `auto`, `high`, plan-critic/reviewer |

The Flash model ID is `deepseek-flash` (catalog name `DeepSeek-V41-Flash`), not `deepseek-v4-pro` or a guessed V4.1 alias. Other provider IDs, even with an identical model string, are not calibrated. DSMM does not change the user's default provider/model.

`off` leaves the request unchanged. `auto` fills an omitted reasoning effort while preserving an explicit upstream effort. `strict` may replace an upstream effort only when configured and when the final route's `llm.resolveModelInfo` advertises a permitted value. The chosen effort is `max → high → valid default → unchanged` for a max-designated role; otherwise it is `desired → valid default → unchanged`. No effort is invented when the model has no reasoning metadata. The provider and host retain temperature and tool/reasoning-content serialization ownership.

The selected preset comes from the latest valid selection event or session header. Without an explicit role policy, native children retain normal model inheritance; a role label alone cannot prove heterogeneity. The max-to-high negotiation above applies only to legacy calibration, never to an explicit role effort. Runtime recovery chooses any final route before calibration evaluates it.

The capability-failure warning is sanitized to route and desired effort; it includes no prompt, credentials, response body or request headers. The actual persisted request header, not an outer middleware probe's earlier snapshot, is authoritative for the resolved effort.
