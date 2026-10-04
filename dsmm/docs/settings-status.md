# Deepwork settings and status

## Commands and inspection

`/deepwork [off|message]` changes the receiving session's mode. `/dsmm-status` reports bounded normalized state; `/dsmm-status json` returns a defensive JSON snapshot with version 1. Other input returns `Usage: /dsmm-status [json]`.

Human-facing status/mode copy uses Deepwork. The technical commands, JSON fields, namespace and configurable `modeName` remain unchanged in 0.1.4.

Commands belong to the native command adapter. Headless task text is not a slash-command invocation.

## DSH 0.2 deployment configuration

The Loader plugin entry remains the deployment baseline. Structural fields are **restart-scoped**; the 0.1.4 source contract includes runtime-only file overlays for newly admitted Agents. The removed `settings.register()` service and old `$DSH_HOME/settings.yaml` namespace are not used by DSH 0.2. Copy deployment values into the profile's `cordis.patch.yml`, restart, and inspect `--dump-config` and status:

```yaml
- id: dsmm
  config:
    defaultActive: true
    modeName: deepwork
    workflow:
      policy: risk-based
    deepseekFlashCalibration: auto
    deepseekFlashDefaultReasoningEffort: high
    deepseekFlashMaxReasoningPresets:
      - dsmm-plan-critic
      - dsmm-reviewer
    runtimeRecovery:
      enabled: false
    lsp:
      enabled: false
```

The 0.1.4 source contract includes the additive native Settings **Deepwork Profiles** / **Deepwork 配置档** section through the native client/authorized RPC surface. It is not a volatile SettingsForms projection and does not turn structural fields into live references. Create/read/edit/save/apply/reset operate on independent files under `<profileContext.dir>/dsmm-profiles/`; neither a Settings schema nor these docs prove completed Desktop activation. See [runtime profiles](profiles.md) for the exact allowlist, file formats and pending acceptance boundary.

Save changes only the draft. Explicit apply pins an immutable revision and changes settings for **new Agents only**; existing live Agents, including blank Agents, retain their admitted snapshots. Children and recovery inherit the parent snapshot. After restart, cold-resumed sessions use the current selection, not historical per-session settings. Reset restores the deployment baseline for future Agents and leaves drafts intact.

## Workflow compatibility

`workflow.policy` selects `risk-based` or `legacy`. An explicit policy wins; old explicitly supplied `strictGates`, `reviewCap`, or `finalReviewPolicy` selects legacy behavior when policy is omitted. With neither new nor legacy controls, risk-based behavior is the default. Schema parsing preserves this distinction.

Risk-based behavior scales discovery, planning, and review to uncertainty and integration risk. Legacy fields remain readable in the normalized snapshot, but are not a universal fixed-review loop under risk-based policy.

## Other settings

`roleRouting` defaults to an empty map, configured in the deployment baseline or a selected runtime profile. Each canonical role accepts an optional fixed `primary` and an optional ordered `fallbackRoutes` list of `{provider, model, reasoningEffort?}`. It is separate from the deployment-only boolean `roles` enable map. Unknown role keys and malformed explicit routes fail closed; omitted chains and explicit empty chains have different meanings. See [model routing](model-routing.md) and [runtime recovery](runtime-recovery.md).

The public schema and exported `DEFAULT_DSMM_SETTINGS` are the complete defaults. Seven core skill toggles and all twelve role toggles default on; effective application is scoped to active mode or a selected DSMM role, not global task policy. Managed preset-directory materialization remains off by default and is an export facility rather than native discovery.

Runtime overlays allow only `defaultActive`, `roleRouting`, `workflow`, `guards`, `runtimeRecovery`, and both `deepseekV4Pro*`/`deepseekFlash*` Calibration, DefaultReasoningEffort and MaxReasoningPresets fields. `roles`, `skills`, `modeName`, `promptOrder`, `section`, `presets`, `lsp`, `sessionPersistence`, native provider/account/install controls, embedded profiles and unknown fields are rejected. Defaults resolve before deployment settings, then the selected immutable overlay. A missing selection leaves the deployment baseline unchanged.

Existing `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, and `deepseekV4ProMaxReasoningPresets` remain compatible. Flash has independent corresponding `deepseekFlash*` settings; calibration modes are off/auto/strict. Auto preserves explicit effort, strict chooses supported policy effort, and unsupported capabilities never justify guessed parameters.

Guard scope defaults to `deepwork-or-dsmm-agent`; shell safety and helpers remain enabled and Git writes require host approval. LSP and runtime recovery default off. Recovery caps are finite; an empty fallback list does not enable automatic model discovery or substitution.

## Snapshot boundaries

The snapshot reports `mode`, `route`, `calibration`, `runtimeRecovery`, and `effectiveSettings`. Route flags distinguish exact V4 Pro and V41 Flash matches. Desired policy effort is not a claim that an adapter advertised or applied it.

Status does not perform capability/network queries, expose credentials or provider errors, or report process-local pending retries. Model calibration is enforced in the actual request waterfall, not by status or prompt text.

Configured role policy/chain and the actual persisted current route are distinct facts. The normalized settings snapshot defensively copies nested role routes and lists; configuration presence is not a claim of successful provider authentication or a completed fallback.

Status describes the receiving Agent's admitted settings; the profile UI's current selection describes future Agents. These can intentionally differ. `--dump-config` shows deployment composition, not proof of runtime-profile application or authenticated UI behavior.
