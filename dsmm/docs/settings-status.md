# Deepwork settings and status

## Commands and inspection

`/deepwork [off|message]` changes the receiving session's mode. `/dsmm-status` reports bounded normalized state; `/dsmm-status json` returns a defensive JSON snapshot with version 1. Other input returns `Usage: /dsmm-status [json]`.

Human-facing status/mode copy uses Deepwork. The technical commands, JSON fields, namespace and configurable `modeName` remain unchanged. The prospective 0.1.8 menu adds a **Deepwork** toggle for other native presets; it defaults off in official minimal conversations unless a saved explicit `deepwork/mode` says otherwise. Even a same-default choice is persisted. This mode intent survives profile changes and reopen. Standing DW presets show a locked enabled label rather than an off action; sessionless, busy and unavailable mutations fail closed. These source requirements do not claim 0.1.8 publication or Desktop acceptance.

Commands belong to the native command adapter. Headless task text is not a slash-command invocation.

## DSH 0.2 deployment configuration

The Loader plugin entry remains the deployment baseline. Structural fields are **restart-scoped**; the prospective 0.1.8 source contract includes runtime-only file overlays for newly admitted Agents. The removed `settings.register()` service and old `$DSH_HOME/settings.yaml` namespace are not used by DSH 0.2. Copy deployment values into the profile's `cordis.patch.yml`, restart, and inspect `--dump-config` and status:

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

The prospective 0.1.8 source contract includes the additive native Settings **Deepwork Profiles** / **Deepwork 配置档** section through the native client/authorized RPC surface. It is not a volatile SettingsForms projection and does not turn structural fields into live references. Create/read/edit/save/apply/reset operate on independent files under `<profileContext.dir>/dsmm-profiles/`; neither a Settings schema nor these docs prove completed Desktop activation. See [runtime profiles](profiles.md) for the exact allowlist, file formats and pending acceptance boundary.

Save changes only the draft. Global Apply pins an immutable revision for **new unscoped Agents only**; existing even-blank Agents retain their admissions. The separate current-session selector uses the native view's actual session ID and idle maintenance/CAS/epoch fences. It changes only that ordinary root and future children; old children retain their old epoch. Cold resume honors an explicit sidecar or, when absent, the current global default. Global reset and session baseline pinning are distinct and leave drafts intact.

## Workflow compatibility

`workflow.policy` selects `risk-based` or `legacy`. An explicit policy wins; old explicitly supplied `strictGates`, `reviewCap`, or `finalReviewPolicy` selects legacy behavior when policy is omitted. With neither new nor legacy controls, risk-based behavior is the default. Schema parsing preserves this distinction.

Risk-based behavior scales discovery, planning, and review to uncertainty and integration risk. Legacy fields remain readable in the normalized snapshot, but are not a universal fixed-review loop under risk-based policy.

## Other settings

`roleRouting` defaults to an empty map. Each canonical role accepts optional `primary`, ordered `fallbackRoutes`, `strategy` and bounded `rateLimit` fields. Profile-level `runtimePolicy` supplies inherited strategy/retry defaults. Child Agents use their configured startup lock or explicit per-role rate-limit rollover. Ordinary top-level Agents instead preserve the native model tab's exact model/effort and only retry on that same route. Native catalog/form controls edit JSONC paths without changing native global model defaults. The compact header menu has one profile list and one `@use-model` **Use profile model** action; a normal profile switch never selects a model. The action reads the current admitted immutable profile model without reapplying a later saved revision, uses native-default persistence like the Models tab, and preserves newer manual intent through existing race fencing. Successes are accessible live announcements only; visible errors are short sanitized codes/fields, not verbose normal menu descriptions. The deployment-only `roles` enable map remains separate. Unknown keys/malformed routes fail; omitted and explicit empty chains differ. See [model routing](model-routing.md) and [runtime recovery](runtime-recovery.md).

The public schema and exported `DEFAULT_DSMM_SETTINGS` are the complete defaults. Seven core skill toggles and all twelve role toggles default on; effective application is scoped to active mode or a selected DSMM role, not global task policy. Managed preset-directory materialization remains off by default and is an export facility rather than native discovery.

Runtime overlays allow only `defaultActive`, `roleRouting`, `runtimePolicy`, `workflow`, `guards`, `runtimeRecovery`, and both `deepseekV4Pro*`/`deepseekFlash*` Calibration, DefaultReasoningEffort and MaxReasoningPresets fields. `roles`, `skills`, `modeName`, `promptOrder`, `section`, `presets`, `lsp`, `sessionPersistence`, native provider/account/install controls, embedded profiles and unknown fields are rejected. Defaults resolve before deployment settings, then the admitted immutable overlay. A missing global selection leaves the deployment baseline unchanged.

Existing `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, and `deepseekV4ProMaxReasoningPresets` remain compatible for child Agents. Flash has independent corresponding `deepseekFlash*` settings; calibration modes are off/auto/strict. Auto preserves explicit effort, strict chooses supported policy effort, and unsupported capabilities never justify guessed parameters. Ordinary root effort is always native-owned, including when a calibration setting says strict.

Guard scope defaults to `deepwork-or-dsmm-agent`; shell safety and helpers remain enabled and Git writes require host approval. LSP and runtime recovery default off. Recovery caps are finite; an empty fallback list does not enable automatic model discovery or substitution.

## Snapshot boundaries

The snapshot reports `mode`, `route`, `calibration`, `runtimeRecovery`, and `effectiveSettings`. Route flags distinguish exact V4 Pro and V41 Flash matches. Desired policy effort is not a claim that an adapter advertised or applied it.

Status does not perform capability/network queries, expose credentials or provider errors, or report process-local pending retries. Model calibration is enforced in the actual request waterfall, not by status or prompt text.

Configured role policy/chain and the actual persisted current route are distinct facts. The normalized settings snapshot defensively copies nested role routes and lists; configuration presence is not a claim of successful provider authentication or a completed fallback.

For ordinary roots, effective status reports `startup-lock`, no applied profile primary/fallback chain, and reasoning action `native-owned`. The original child-role configuration remains available under `effectiveSettings`; it is not falsely presented as an automatic main-model override. `profileModel` in a session-profile response is only the declared model for an explicit user action, never proof that the native model has already changed.

Status describes the receiving Agent's admitted profile/revision/epoch, resolved strategy/retry policy and actual route state separately from future global defaults. Settings and the header selector display those scopes distinctly; a global change can intentionally differ from a live Agent. `--dump-config` shows deployment composition, not proof of runtime-profile application or authenticated UI behavior.
