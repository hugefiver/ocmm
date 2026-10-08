# Deepwork settings and status

## Commands and inspection

`/deepwork [off|message]` changes the receiving session's mode. `/dsmm-status` reports bounded normalized state; `/dsmm-status json` returns a defensive JSON snapshot with version 1. Other input returns `Usage: /dsmm-status [json]`.

Human-facing status/mode copy uses Deepwork. Technical commands, JSON fields and configurable `modeName` remain unchanged. In the stage A working source, the **Deepwork** toggle controls common workflow and DSMM skill visibility with one activation decision: ordinary presets are opt-in/effective-default, official minimal defaults off, and DW roles default on only until a saved explicit `deepwork/mode` choice. Even a same-default choice persists; this intent survives profile changes and reopen. DW roles are no longer locked; explicit off does not remove persona/read-only/Git/host permissions. Busy commands are rejected instead of mutating an open turn or silently queueing a pre-step change. The header's existing idle/CAS path remains authoritative. This source change does not claim publication, installation or Config UI acceptance.

Commands belong to the native command adapter. Headless task text is not a slash-command invocation.

## C0 layered deployment configuration

The working source remains version **0.1.9**. C0 supplies centralized storage/sparse inheritance/immutable capture; C consumes those boundaries for native role policy, continuation/background and startup MCP. D0 adds the global Deepwork module ceiling and safe control-plane projections. D's Config pages and publication/private migration/browser acceptance are separate and are not implied by these backend/native proofs.

Effective composition is **built-in defaults → sparse global deployment base → explicit native DSH entry/profile overrides → applied immutable named-profile/session overlay**. The global base is `<resolvedDshHome>/plugins/dsmm/config.json`, a UTF-8 JSON object containing only explicit DSMM fields. A missing file means an empty layer. The native entry remains a separate sparse layer in the active profile's Cordis configuration, not a copy of merged defaults. Named Profiles are runtime overlays, not another deployment layer editor.

`src/dsh-home.ts` resolves the public `resolveDshHome` export through `createRequire` anchored at the declared `dsh-skill-filesystem` peer. Priority is explicit trusted `profileContext.home`, then `DSH_HOME`, then the official `~/.dsh` default. Resolution failure is explicit, not a fallback to a developer's global SDK. **`home/plugins/dsmm` is DSMM's convention, not an official mandated plugin layout.** `profileContext.dir` identifies the native profile; it isn't used to guess home.

`DSMM_CONFIG_SCHEMA` remains the plain sparse public ABI. Native Loader `Config` uses the separate `DSMM_NATIVE_CONFIG_SCHEMA`, with flat optional volatile transport fields. Full business defaults and validation apply after layer resolution, not as transport defaults. Legacy raw flat callers keep every explicit value, including a value equal to the built-in default. The removed `settings.register()` namespace and old `$DSH_HOME/settings.yaml` aren't DSMM storage interfaces.

Direct public `Config(input)` calls return plain flat data and require complete explicit model-route pairs, preserving `resolveConfig(Config(input))`. Native Cordis consumes the same Config object's Standard Schema protocol to obtain sparse volatile refs. Sparse deployment-layer validation can inherit primary members across global/native layers; their full merge is revalidated. No schema-expanded defaults or resolved refs are used to infer raw presence.

The snapshot's `profile` is the assembled explicit native entry layer, which can include bundle/home/CLI pins; it isn't a claim that every field came from the editable profile file. When available, `nativeForm.base`/`user` retain the public redacted descriptor provenance and `nativeFormRevision` is its actual CAS. Higher host pins cannot be cleared by profile unset; native ConfigEditor rejects a write whose result is overridden by another host layer. DSMM doesn't inspect private layers or evaluate `!!js` to guess presence.

The following is an explicit native profile override, not the global file format. Keep existing values when editing a Cordis patch; its `config` replaces the row's config object:

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

Plain objects merge recursively and arrays replace whole arrays. Missing keys inherit; an empty object doesn't erase inherited children. Valid explicit `false`, `0`, `""` and `[]` aren't omission. Unset removes a key only from the edited layer: profile unset restores global inheritance, global unset restores defaults. `null` is accepted only where the field schema permits it. Unknown/prototype keys, non-JSON values, cycles and raw volatile refs are rejected; the complete merged desired settings are validated before startup or admission.

Native Settings **Deepwork Profiles** / **Deepwork 配置档** remains separate from plugin Config. New named drafts and revisions share `<resolvedDshHome>/plugins/dsmm/profiles/`; selection/session state is scoped by canonical native profile identity and actual DSMM entry ID. An existing current-profile legacy library is strictly read-only, with its original immutable pins retained. See [runtime profiles](profiles.md) for formats and origin rules. These backend contracts don't prove completed Desktop activation or D's Config pages.

Save changes only the draft. Global Apply pins an immutable revision for **new unscoped Agents only**; existing even-blank Agents retain their admissions. The separate current-session selector uses the native view's actual session ID and idle maintenance/CAS/epoch fences. It changes only that ordinary root and future children; old children retain their old epoch. Cold resume honors an explicit sidecar or, when absent, the current global default. Global reset and session baseline pinning are distinct and leave drafts intact.

Here, “global Apply/default” means the runtime's scoped named-profile selection, not the shared global deployment file.

### Global module ceiling (D0)

The only recognized module is `deepwork`, controlled by `modules.deepwork.enabled` **only in the global `config.json` layer**:

```json
{"modules":{"deepwork":{"enabled":false}}}
```

Missing/unset means `true`, preserving existing availability; ordinary-session `defaultActive` still defaults to `false`. This is an allowed upper bound, not a session-mode override and not a pin for every other global field. Native profile/volatile Config, direct legacy flat Config, named profiles and session overlays reject `modules`; unknown module IDs/fields and nonboolean enabled values refuse. Internally resolved/captured settings include the field without becoming an external profile input.

Core remains installed and usable when Deepwork is off: fixed global configuration read/save, profile storage and immutable captures/CAS, status and mandatory identity/read-only/filter/native-permission fences. A cold-off startup does not register DW persona/common/calibration/workflow skills, role providers/aliases/controls, materialize presets, or mount DW routing/recovery/LSP. It does not delete bundled assets, presets or user data, or withdraw host/project skills, tools, LSP or subagents. A static DW preset may remain visible in the native filesystem picker; choosing it refuses before prompt-body/model execution. Unknown DSMM standing roots also refuse.

With `guards.scope:"always"`, configured shell safety and Git deny/approval gates remain Core safety, including on a cold-off ordinary root. `guards.scope:"off"` retains its existing optional-guard semantics; mandatory identity/native permissions still apply. DW plan/todo/question/output helpers remain unavailable while the module is off. Genuine native foreign children receive Core identity admission from their exact live parent and captured epoch, without installing DW role tools or granting a generic-spawn bypass to a DW-authorized parent.

Startup captures the actual DW substrate once. Each new ordinary root admits **latest valid global desired ∩ startup-mounted substrate ∩ existing policy**. Saving off on a mounted Host leaves old busy/idle parents and their future children on their exact captures, while new roots are off. Their generic/directed skills, standing presets, role aliases, continuable resume and mode-on requests cannot bypass the ceiling. Mode-on reports unavailable; saved historical mode intent is retained but never reported effective while the admitted module is off. Idle profile/mode changes only update that root's overlay/intent and do not absorb newer module state. Saving on after cold-off changes desired/pending only: no mount, reconciliation, disposal, cancellation, process launch or restart queue. New roots remain off/restart-required until an independently authorized Host restart. Restoring on does not rebind old off roots.

For later Config consumers, `DSMM_MODULE_DESCRIPTORS` and `DsmmModuleState` (exported from the package root) are plain static first-party data, not dynamic third-party JS/provider/installer APIs. The additive, no-argument `dsmmConfig.describeModules` uses the same local writable operator authority as `describe`/`save` and reads the latest valid global state; it is not opened to unauthorized read-only carriers. It returns descriptor `{id,label,key}`, global/default desired source, `startupMounted`, `admitted` (`null` without an Agent), next-root admission/reason and pending/reason. `hostBundleEnabled` is explicitly `"unknown"`: installed files, loaded DSMM core, desired DW availability, mounted substrate, admitted module and active mode are different facts.

`getSettings.moduleStates(agent)`, the optional session-profile response `modules`, and status `modules` project the receiving Agent's capture. `desired.capture` distinguishes `current-global`, `admission` and `startup`: a synchronous admission/status snapshot does not claim to have reread current disk state. A future UI should combine the authorized current-global projection with the actual session projection, rather than treat a captured next-root estimate as latest desired. The existing native profile form keeps its separate revision/CAS; these projections introduce neither a Root-path RPC nor a cross-layer atomic save. D's web/Desktop controls are not implemented by D0.

### Save authority and concurrency

The fixed `dsmmConfig` Remote backend exposes `describe`, `describeModules` and `save` for exact set/unset edits with an expected global revision. It accepts no file, root or entry arguments and isn't a model-visible tool. All operations require a local writable control operator: the native invocation peer must equal `connection.operator`, the public current `webServer.host` must be exactly `127.0.0.1`, and `settings.writable` must be `true`. Unknown or remote/nonloopback carriers are unavailable; client `isLoopback` isn't authority. Reverse proxies and tunnels aren't automatically proven safe. Save rechecks lifetime/connection authority before commit, so disconnect or disposal cannot authorize a late write. Core owns the existing Typert descriptor contribution once; global configuration service lifetime does not depend on the DW/profile UI service mounting.

Reads create no directory, lock or config file. Saves use bounded safe file access, the actual bytes' SHA256 revision (or a distinct absent revision), a cooperative writer lock, final revision recheck and same-directory temporary-file rename. Stale or invalid input fails closed instead of overwriting it. Non-cooperating external editors can still race between the final recheck and rename; this isn't a universal external-editor transaction.

Global save changes only `config.json`: no profile patch, Loader reload/patch/dispose, cancellation or automatic profile apply. Native profile saves use only the volatile transport, with native authorization and entry CAS. The two layers have separate revisions and no cross-layer transaction. A save response acknowledges that layer, not that every running consumer has adopted it.

**Native signal distinction:** the rc.2 ConfigEditor/Include forced empty-pending reconciliation path emits the compatibility `loader/partial-dispose` signal even when it doesn't update or dispose a fiber. The real regression observes that signal while proving retained refs/fiber/services, zero actual scope/Agent disposals or updates, and completion of the original busy request. The signal alone isn't a lifecycle acknowledgment; no SDK patch, signal filtering or automatic restart hides it. Consumers must use actual lifetime/admission boundaries rather than treating this signal as disposal proof.

## Workflow compatibility

`workflow.policy` selects `risk-based` or `legacy`. An explicit policy wins; old explicitly supplied `strictGates`, `reviewCap`, or `finalReviewPolicy` selects legacy behavior when policy is omitted. With neither new nor legacy controls, risk-based behavior is the default. Schema parsing preserves this distinction.

Risk-based behavior scales discovery, planning, and review to uncertainty and integration risk. Legacy fields remain readable in the normalized snapshot, but are not a universal fixed-review loop under risk-based policy.

## Other settings

`roleRouting` defaults to an empty map. Each canonical role accepts optional `primary`, ordered `fallbackRoutes`, `strategy` and bounded `rateLimit` fields. Profile-level `runtimePolicy` supplies inherited strategy/retry defaults. Child Agents use their configured startup lock or explicit per-role rate-limit rollover. Ordinary top-level Agents instead preserve the native model tab's exact model/effort and only retry on that same route. Native catalog/form controls edit JSONC paths without changing native global model defaults. The compact header menu has one profile list and one `@use-model` **Use profile model** action; a normal profile switch never selects a model. The action reads the current admitted immutable profile model without reapplying a later saved revision, uses native-default persistence like the Models tab, and preserves newer manual intent through existing race fencing. Successes are accessible live announcements only; visible errors are short sanitized codes/fields, not verbose normal menu descriptions. The deployment-only `roles` enable map remains separate. Unknown keys/malformed routes fail; omitted and explicit empty chains differ. See [model routing](model-routing.md) and [runtime recovery](runtime-recovery.md).

`DEFAULT_DSMM_SETTINGS` supplies the complete business defaults; the public sparse schema doesn't expand them into overrides. The current inventory has 22 roles/categories and 14 configurable skills, with cross-cutting opt-in/default false. Active Agent scopes expose enabled DSMM skills as native metadata/lazy bodies; explicit off wins even on a DW preset. Roles/skills remain outside named runtime profiles. Managed preset-directory materialization remains off by default and is an export facility rather than native discovery. Content/catalog presence doesn't prove the remaining C execution mechanisms.

Runtime overlays allow only `defaultActive`, `roleRouting`, `runtimePolicy`, `workflow`, `guards`, `runtimeRecovery`, and both `deepseekV4Pro*`/`deepseekFlash*` Calibration, DefaultReasoningEffort and MaxReasoningPresets fields. `modules`, `roles`, `skills`, `modeName`, `promptOrder`, `section`, `presets`, `subagents`, `lsp`, `sessionPersistence`, native provider/account/install controls, embedded profiles and unknown fields are rejected. A missing named-profile selection leaves the captured deployment baseline unchanged. Auth and native session logs stay in their existing locations; centralized storage doesn't move them or expand `sessionPersistence` authority.

`subagents.enableRunInBackground:false` and `backgroundMode:"one-shot"` default to foreground one-shot. Explicit opt-in can use native jobs or continuable children. Omitted `maxDepth` uses the host default (rc.2 1); explicit nonnegative integer limits remain native-enforced. These sparse deployment fields capture at new-root admission and remain frozen for old parents/future children. Missing startup jobs/control/persistence/provider substrate yields `restartRequired: ["subagents"]` and effective background disabled, not fabricated readiness. No new queue/controller is created.

## Capture and restart boundaries

Startup awaits global/profile read, merge and validation before any consumer mounts. The startup snapshot is frozen. Persistent registration, standing presets, `modeName`, `promptOrder`, preset materialization and LSP retain startup settings; late dependency install/injection doesn't reread desired settings.

When a native preset registry already exists, its frozen startup definitions finish registering before retained ordinary Agents are audited/admitted. Optional absent registries retain the existing late-install lifetime path, using that same startup getter. Direct trusted Cordis callers without a Loader entry use the stable `trusted-direct` namespace; fiber allocation never becomes a persisted entry identity.

A new ordinary root awaits the latest valid global/profile desired deployment and combines it with the applied immutable named overlay, never a later draft. Existing roots retain their entire captured snapshot, including blank/idle roots. Future children of an old parent inherit that parent's complete snapshot and epoch rather than today's desired settings. An explicit idle session-profile switch replaces only the allowed runtime overlay on that root's old deployment baseline.

New-root capture validates schema/file safety and standing startup capabilities, not every dormant role's model catalog entry. Native root requests retain the model tab's authority; child/alias preflight owns exact candidate selection, fallback and hard effort refusal before requests. Named selection/current-session Apply and retained-Agent startup admission keep their full semantic catalog audits and readiness guards. Capture isn't an automatic model-selection action or a promise that every declared role route is callable.

Role enable policy is constrained by the startup substrate and original permissions. A capability absent at startup is restart-required, not made available by saving desired settings. No restart/idle queue exists. Desired off isn't a claim that old admitted work was cancelled.

`getSettings(agent)` is the authority for an existing Agent. No-argument `getSettings()` remains the validated runtime named default, not raw desired settings. Invalid external edits refuse new admissions and writes without invalidating old frozen admissions. Cold resume creates a new admission from current valid desired deployment and the correct origin's pinned sidecar/default; it doesn't promise persistence of an exited process's old memory snapshot.

Existing `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, and `deepseekV4ProMaxReasoningPresets` remain compatible for child Agents. Flash has independent corresponding `deepseekFlash*` settings; calibration modes are off/auto/strict. Auto preserves explicit effort, strict chooses supported policy effort, and unsupported capabilities never justify guessed parameters. Ordinary root effort is always native-owned, including when a calibration setting says strict.

Guard scope defaults to `deepwork-or-dsmm-agent`; shell safety and helpers remain enabled and Git writes require host approval. LSP and runtime recovery default off. Recovery caps are finite; an empty fallback list does not enable automatic model discovery or substitution.

## Snapshot boundaries

The snapshot reports `mode`, `route`, `calibration`, `runtimeRecovery`, and `effectiveSettings`. Route flags distinguish exact V4 Pro and V41 Flash matches. Desired policy effort is not a claim that an adapter advertised or applied it.

Status does not perform capability/network queries, expose credentials or provider errors, or report process-local pending retries. Model calibration is enforced in the actual request waterfall, not by status or prompt text.

Status masks configured preset/LSP working-directory paths, all LSP command/argument contents and LSP environment values with fixed markers; runtime LSP settings aren't changed. The trusted backend's `describeDeployment()` retains separate plain startup, desired and admitted snapshots, with the raw native input hash and optional native form CAS revision explicitly distinguished. `deployment.sources` describes desired input; admission `sources` describes effective values after startup pins/role constraints and named overlays. `sourceCaptures.fields` identifies startup versus captured deployment versus named-session origins, and its startup revision pair prevents attributing pinned values to the newer desired revision.

A named overlay's complete primary route replaces its lower primary, including removal of omitted effort. Effective provenance removes that entire replaced primary subtree before marking the overlay; nonexistent lower-only members aren't left in `sources` or capture fields.

Configured role policy/chain and the actual persisted current route are distinct facts. The normalized settings snapshot defensively copies nested role routes and lists; configuration presence is not a claim of successful provider authentication or a completed fallback.

For ordinary roots, effective status reports `startup-lock`, no applied profile primary/fallback chain, and reasoning action `native-owned`. The original child-role configuration remains available under `effectiveSettings`; it is not falsely presented as an automatic main-model override. `profileModel` in a session-profile response is only the declared model for an explicit user action, never proof that the native model has already changed.

Status describes the receiving Agent's admitted profile/revision/epoch, resolved strategy/retry policy and actual route state separately from desired deployment and future named defaults. Global bytes revision, native entry revision, startup capability and store origin are distinct facts, not one atomic cross-layer acknowledgment. `--dump-config` shows native Loader composition, not the complete global-aware DSMM effective snapshot or proof of runtime-profile application/authenticated UI behavior. C0 supplies backend boundaries; D's field-level Config presentation and browser QA remain pending.
