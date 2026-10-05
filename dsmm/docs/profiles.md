# Deepwork runtime profiles (0.1.9 source contract)

This guide describes the prospective 0.1.9 source contract. It is not evidence of a published 0.1.9 package or completed Docker/Desktop acceptance; see [releasing](releasing.md). Deepwork is the display name; package, storage and configuration IDs retain `dsmm` for compatibility. Historical release identities and completed 0.1.4/0.1.6 continuation evidence stay immutable. The already published and Desktop-installed 0.1.7 has failed terminal verification, not a completed GitHub Release; it remains immutable. The 0.1.9 plugin behavior is unchanged from 0.1.8; only release Action verification controls change to an exact shared 20-minute 404 visibility budget and a 45-minute verify job. The 0.1.8 npm publication is genuine but its original terminal receipt failed with GitHub skipped; Desktop remains on 0.1.7 and CLI/TUI on 0.1.6 until a separately completed successor rollout.

A Deepwork runtime profile is a named file containing runtime policy, not a native deployment profile or an Agent role preset. Native Settings → **Deepwork Profiles** / **Deepwork 配置档** provides create/read/edit/save, explicit apply, and reset to the deployment baseline. The native Agent preset selector remains a separate role selector, displaying `DW …` names under unchanged `dsmm-*` IDs.

## Files and document format

The native `profileContext.dir` is the only storage authority. No guessed user-home fallback or inline `profiles` object in plugin config is used.

| File | Purpose |
| --- | --- |
| `<profileContext.dir>/dsmm-profiles/<id>.jsonc` | Editable named draft |
| `<profileContext.dir>/dsmm-profiles/.revisions/<sha256>.jsonc` | Immutable exact bytes pinned by an explicit apply |
| `<profileContext.dir>/dsmm-profiles/.selection.json` | Minimal selection pointer: `{version: 1, id, revision}` |
| `<profileContext.dir>/dsmm-profiles/.sessions/<sha256(native-session-id)>.json` | Explicit session choice: exact session ID, pinned profile/baseline, CAS revision and admission epoch; no history or credentials |

IDs are filename-safe identifiers, not paths; reserved names, case collisions and link traversal are rejected. A document has exactly `version: 1`, `id`, optional `label`, and `settings`. For example, a draft named `careful.jsonc` may contain:

```jsonc
{
  "version": 1,
  "id": "careful",
  "label": "Careful review",
  "settings": {
    // Saving preserves this comment; apply pins these exact bytes.
    "defaultActive": true,
    "workflow": { "policy": "risk-based" },
    "roleRouting": {
      "dsmm-reviewer": {
        "primary": {
          "provider": "my-existing-provider",
          "model": "my-existing-model",
          "reasoningEffort": "high"
        },
        "fallbackRoutes": [],
        "strategy": "startup-lock",
        "rateLimit": { "maxRetries": 3, "maxTotalDelayMs": 30000 }
      }
    },
    "runtimeRecovery": { "enabled": false }
  }
}
```

The example provider/model must be native-resolvable and advertise the specified effort. Catalog listing is advisory: a manually configured route can be resolvable while absent from the list. It introduces no provider, account or credential. Explicit `fallbackRoutes: []` disables that role's fallback chain; it is not equivalent to omitting the key and inheriting a global chain.

## Supported settings and precedence

The exact top-level `settings` allowlist is:

- `defaultActive`
- `roleRouting`
- `runtimePolicy` (optional inherited strategy and finite `rateLimit` defaults)
- `workflow`
- `guards`
- `runtimeRecovery`
- `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, `deepseekV4ProMaxReasoningPresets`
- `deepseekFlashCalibration`, `deepseekFlashDefaultReasoningEffort`, `deepseekFlashMaxReasoningPresets`

Existing nested validation and finite bounds still apply. Profiles reject deployment-only `roles`, `skills`, `modeName`, `promptOrder`, `section`, `presets`, `lsp`, and `sessionPersistence`, as well as embedded profiles, native provider/account/auth/header/env/install fields, arbitrary Cordis rows, and unknown fields. Structural changes belong in deployment configuration and require restart. A guard setting cannot enable tools forbidden by a canonical read-only role composition.

Effective settings resolve in this order: **built-in DSMM defaults → deployment DSMM configuration → selected immutable runtime revision**. Structural settings always come from deployment configuration. No selection means the unchanged deployment baseline, not a synthetic default profile. Omitted fallback policy and explicit empty policy remain distinct through resolution. See [model routing](model-routing.md) and [settings/status](settings-status.md).

## Save versus apply

Create or open a draft in native Settings and use the role-specific primary provider/model/exact-effort controls, ordered fallback rows, strategy and bounded retry fields. Each role can choose `startup-lock` or `rate-limit-fallback` independently; blank policy fields inherit, zero is explicit, and an empty fallback chain is not inheritance. Provider/model changes clear stale explicit effort. Catalog refresh preserves configured/manual values and does not select the native/global model default. Advanced JSONC remains available for custom routes and other supported settings.

Saving validates the draft and preserves edited raw JSONC/comments, but does not activate it—even if the same ID is currently selected. Structured changes edit only their JSONC paths; invalid raw text remains visible and cannot be silently normalized by returning to the form. Unsaved edits must be saved or explicitly discarded before switching away.

**Apply saved profile** is a separate global-default operation. It checks the expected draft revision, validates runtime fields and native route/effort semantics, pins the draft's exact bytes in `.revisions`, and atomically commits `.selection.json`. Only after the pointer commit succeeds may the current in-memory selection change. The UI distinguishes the editable draft, selected immutable revision for future Agents, and an existing Agent's admitted snapshot. **Reset to baseline** clears the global runtime selection for future unscoped Agents; it does not delete drafts or mutate an existing Agent.

**Current-session profile / Apply profile to current session** uses the actual native view's session ID, not the profile being edited or a guessed latest session. It commits only that session's sidecar under a genuine native idle-maintenance reservation. Both the expected sidecar revision and admission epoch must still match. **Pin baseline for current session** writes an explicit baseline choice without changing the global default. Sessionless Settings cannot apply to a session; busy, maintenance-owned, disposed, replaced, child or unauthorized targets refuse visibly. Cold targets are resumed only through native session authority after backend authorization and strict decoding.

The Conversation header has one icon-only button opening the native Profile menu. Profile names, current selection, status, disabled reasons and refresh are shown only inside that menu, not as standalone header text. It is present on blank sessions and the sessionless welcome screen; without an actual session it is read-only and never creates a session or changes the global default. The single leading slot yields to any higher-priority native/plugin navigation owner.

The menu has one profile list. Normal options switch only the session profile and preserve the current native model, with zero native model-selection calls. One separate `@use-model` action, **Use profile model**, reads the current admitted immutable profile's configured main model through DSH's native selection endpoint, so the picker and subsequent request agree. It does not reapply the profile or activate a later saved draft revision. An absent configured model, unavailable selection source or native refusal produces a short sanitized error; the admitted profile remains unchanged. Existing manual-model-intent race fencing preserves a newer native choice, including effort-only and same-value choices. Successes use accessible live announcements only, not visible success prose. Full editing and revisions remain in Settings. A refused profile change keeps the prior admission; refresh before retrying, with only allowlisted codes/fields and refresh/retry guidance. Refresh never applies a profile or selects a model on its own.

The same compact menu offers a **Deepwork** toggle for other native presets. Official minimal conversations default off unless saved explicit `deepwork/mode` intent exists. Explicit same-default choices persist durable intent; profile switching does not erase it or adopt a profile's `defaultActive`. Mode intent survives profile changes and reopen. Standing DW presets show Deepwork locked enabled and explain the preset lock; they cannot be switched off here. Sessionless, busy or unavailable mutations are disabled/refused, without creating a session. Normal menu rows omit verbose explanatory descriptions and the old duplicate profile-model list.

Save/apply requests use expected revisions. A concurrent UI save or external file edit produces a conflict instead of overwriting later bytes; reread and reconcile. Validation, missing file, revision conflict, lock/IO, authorization, or activation failures must be visible, not reported as success. Invalid/missing/linked files and digest mismatches never silently select another profile or model. Pointer failure retains the prior disk selection and current settings; an unused immutable revision may remain.

Storage uses bounded validated content, containment/link checks under a cross-process writer lock, and same-directory atomic replacement. Lock timeouts are errors; stale-looking locks are not stolen. Immutable revision files are never overwritten or hand-edited. Operations accept stable IDs, not arbitrary filesystem paths. Profile summaries do not expose credentials or deployment configuration.

## Agent lifetime and restart

Global applying or resetting affects **new unscoped Agents only**. Every existing live Agent, including a blank one, retains its admitted immutable runtime snapshot. An explicit current-session apply is different: a truly idle ordinary root receives a new immutable admission epoch after the durable sidecar commit. Even reapplying the same revision creates a new epoch. Existing children retain their captured old epoch; later genuinely owned native children inherit the new one. Other roots, the global default, completed tools and native persona/tool/skill composition remain unchanged.

Native model selection is separate user intent, not a profile sidecar setting. Every ordinary top-level request respects the native assembled provider/model/effort, including an implicit default with no prior selection event. Profile primary/defaults and calibration never overwrite it. An effort-only or same-value native selection still fences stale retry work. Parent model choice does not overwrite a configured child's own role route. Structured editing, save, global apply and normal session apply never select the native/global model default. Only **Use profile model** invokes native model selection, with the same background-default persistence behavior as the Models tab; later manual model changes remain authoritative. Mode intent is a separate saved `deepwork/mode` event, retained across admission/profile changes and cold resume.

After restart, a session with a committed sidecar admits that exact immutable revision or explicit baseline, even if its draft/global default changed. A session without a sidecar preserves the historical global-current cold-resume behavior; it does not infer a previous profile from lineage/history. Corrupt, missing, linked or digest-mismatched sidecars/revisions fail visibly instead of falling back to baseline. Sidecars add no new session event vocabulary, so stock native history readers remain authoritative. Native clear/compact changes the session identity and does not automatically transfer an old choice.

Older sessions whose selected root ID is now auxiliary-only may fail native cold resume with an unknown preset ID. Read [compatibility](compatibility.md) before upgrading; never silently switch their persona or erase history.

## Migration, authority and rollback

Migration from 0.1.1 is explicit: save supported runtime values as a named draft, preserve deployment roles/skills/provider/account/UI rows, inspect the draft, then apply separately. No operation rewrites `cordis.patch.yml` or migrates credentials. Native RPC authorization applies on the backend as well as the UI. There are no model-visible profile-management tools, child write capabilities, anonymous endpoints or authentication bypasses.

For policy rollback, explicitly choose global baseline, session baseline, or a reviewed prior profile in the intended scope using current CAS/epoch values. Never overwrite an immutable revision or restore draft bytes over a later user edit. Global rollback leaves existing live Agents unchanged; scoped rollback changes only the admitted idle root and future children. Package rollback is separate and uses an exact known immutable package through the official carrier; see [releasing](releasing.md).

0.1.4 documents remain loadable without rewriting user files. Omitted strategy now means the safer `startup-lock`; a legacy generic fallback chain no longer silently hops after later generic failures. `runtimeRecovery.enabled` is not the strategy selector. Read [runtime recovery](runtime-recovery.md) before upgrading a configuration that depended on generic automatic fallback.
