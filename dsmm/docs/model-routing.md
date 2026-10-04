# Model routing

## Explicit role policies (0.1.1)

`roleRouting` is a restart-scoped map keyed by canonical DSMM role ID. It defaults to `{}`; role names alone do not select a model. Provider authentication and route declarations remain native DSH configuration.

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

A `primary` is an explicit fixed role policy, not merely a model-menu default. It applies to a directly selected role, a trusted role-tool child, and an active top-level deepwork session as orchestrator when no DSMM preset is selected. Remove or change the policy to use a different native session route. Unconfigured/disabled roles, unrecognized children, and out-of-scope sessions do not acquire another role's policy. Disabled-role configuration may be retained but does not create a callable role.

Each route requires a nonempty provider and model together. An optional named `reasoningEffort` is a native adapter ID, not an OpenCode variant translation. The exact configured effort must be supported; unsupported `max` fails rather than being substituted with `high`. A changed route without effort clears incompatible inherited effort and lets the native adapter resolve its default. Existing DeepSeek calibration cannot override an explicit role effort.

Fixed native child options keep `modelSelectionSettings:false`. DSMM-owned aliases of the native spawn provider preserve native persona/tool filters, depth, permissions, cancellation, and one-shot lifecycle. Child identity comes from its own durable native subagent descriptor, not a parent preset, persona text, or a model-visible role label. Descriptor identity can be reconstructed after reload; it does not make terminal one-shot children resumable.

Primary selection does not reset an admitted fallback or a host-owned durable route change. Final native request headers are authoritative, not an intermediate middleware snapshot. See [runtime recovery](runtime-recovery.md) for role/global chain precedence and retry fences.

DSMM records a model-hidden `dsmm/role-policy` metadata epoch for explicit routing. Unchanged policies retain accepted routes across turns and reloads; changing the primary effort or fallback policy invalidates the old selection and applies the new primary. Child epochs are read only from child-owned history, never an inherited ancestor. This metadata does not add model-visible prompt text or create a resumable child lifecycle.

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
