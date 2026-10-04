# Deepwork runtime profiles (0.1.3 source contract)

This guide describes the 0.1.3 source contract. It is not evidence of a published package or completed Docker/Desktop acceptance; see [releasing](releasing.md). Deepwork is the display name; package, storage and configuration IDs retain `dsmm` for compatibility.

A Deepwork runtime profile is a named file containing runtime policy, not a native deployment profile or an Agent role preset. Native Settings → **Deepwork Profiles** / **Deepwork 配置档** provides create/read/edit/save, explicit apply, and reset to the deployment baseline. The native Agent preset selector remains a separate role selector, displaying `DW …` names under unchanged `dsmm-*` IDs.

## Files and document format

The native `profileContext.dir` is the only storage authority. No guessed user-home fallback or inline `profiles` object in plugin config is used.

| File | Purpose |
| --- | --- |
| `<profileContext.dir>/dsmm-profiles/<id>.jsonc` | Editable named draft |
| `<profileContext.dir>/dsmm-profiles/.revisions/<sha256>.jsonc` | Immutable exact bytes pinned by an explicit apply |
| `<profileContext.dir>/dsmm-profiles/.selection.json` | Minimal selection pointer: `{version: 1, id, revision}` |

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
        "fallbackRoutes": []
      }
    },
    "runtimeRecovery": { "enabled": false }
  }
}
```

The example provider/model must already exist in the native catalog and advertise the specified effort. It introduces no provider, account or credential. Explicit `fallbackRoutes: []` disables that role's fallback chain; it is not equivalent to omitting the key and inheriting a global chain.

## Supported settings and precedence

The exact top-level `settings` allowlist is:

- `defaultActive`
- `roleRouting`
- `workflow`
- `guards`
- `runtimeRecovery`
- `deepseekV4ProCalibration`, `deepseekV4ProDefaultReasoningEffort`, `deepseekV4ProMaxReasoningPresets`
- `deepseekFlashCalibration`, `deepseekFlashDefaultReasoningEffort`, `deepseekFlashMaxReasoningPresets`

Existing nested validation and finite bounds still apply. Profiles reject deployment-only `roles`, `skills`, `modeName`, `promptOrder`, `section`, `presets`, `lsp`, and `sessionPersistence`, as well as embedded profiles, native provider/account/auth/header/env/install fields, arbitrary Cordis rows, and unknown fields. Structural changes belong in deployment configuration and require restart. A guard setting cannot enable tools forbidden by a canonical read-only role composition.

Effective settings resolve in this order: **built-in DSMM defaults → deployment DSMM configuration → selected immutable runtime revision**. Structural settings always come from deployment configuration. No selection means the unchanged deployment baseline, not a synthetic default profile. Omitted fallback policy and explicit empty policy remain distinct through resolution. See [model routing](model-routing.md) and [settings/status](settings-status.md).

## Save versus apply

Create or open a draft in native Settings, edit its JSONC, and save. Saving validates the draft and preserves the edited raw JSONC/comments, but does not activate it—even if the same ID is currently selected. Unsaved edits must be saved or explicitly discarded before switching away.

**Apply** is a separate operation. It checks the expected draft revision, validates runtime fields and native route/effort semantics, pins the draft's exact bytes in `.revisions`, and atomically commits `.selection.json`. Only after the pointer commit succeeds may the current in-memory selection change. The UI distinguishes the editable draft, selected immutable revision for future Agents, and an existing Agent's admitted snapshot. **Reset to baseline** clears the runtime selection for future Agents; it does not delete drafts or mutate an existing Agent.

Save/apply requests use expected revisions. A concurrent UI save or external file edit produces a conflict instead of overwriting later bytes; reread and reconcile. Validation, missing file, revision conflict, lock/IO, authorization, or activation failures must be visible, not reported as success. Invalid/missing/linked files and digest mismatches never silently select another profile or model. Pointer failure retains the prior disk selection and current settings; an unused immutable revision may remain.

Storage uses bounded validated content, containment/link checks under a cross-process writer lock, and same-directory atomic replacement. Lock timeouts are errors; stale-looking locks are not stolen. Immutable revision files are never overwritten or hand-edited. Operations accept stable IDs, not arbitrary filesystem paths. Profile summaries do not expose credentials or deployment configuration.

## Agent lifetime and restart

Applying or resetting affects **new Agents only**. Every existing live Agent, including a blank one, retains its admitted immutable runtime snapshot. Native children inherit their parent's snapshot, and in-flight recovery stays within that same policy. Profile selection does not re-register presets, change role enablement, alter tool/skill composition, or update an existing session's persona.

This retention is **live-Host-only**. After a Host restart, cold-resumed sessions admit the currently selected immutable revision and native current definition, not their old historical profile. A later edit to the draft cannot change the pinned revision used after restart. There is no cross-restart historical per-session settings guarantee.

Older sessions whose selected root ID is now auxiliary-only may fail native cold resume with an unknown preset ID. Read [compatibility](compatibility.md) before upgrading; never silently switch their persona or erase history.

## Migration, authority and rollback

Migration from 0.1.1 is explicit: save supported runtime values as a named draft, preserve deployment roles/skills/provider/account/UI rows, inspect the draft, then apply separately. No operation rewrites `cordis.patch.yml` or migrates credentials. Native RPC authorization applies on the backend as well as the UI. There are no model-visible profile-management tools, child write capabilities, anonymous endpoints or authentication bypasses.

For policy rollback, reset to the deployment baseline or explicitly apply a reviewed prior configuration. Never overwrite an immutable revision or restore draft bytes over a later user edit. Existing live Agents remain unchanged. Package rollback is separate and uses an exact known immutable package through the official carrier; see [releasing](releasing.md).
