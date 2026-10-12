# Deepwork runtime profiles

This guide describes the built source configuration. A published `@dsmm/dsmm@0.2.0` package doesn't automatically contain uncommitted source features; check the actual artifact before using these interfaces. Package availability and Host compatibility are separate from configuration validity. See [compatibility](compatibility.md) and [releasing](releasing.md).

A named Deepwork profile is a runtime-policy document, not a native deployment profile or Agent preset. Open **Settings → Deepwork Profiles** to browse and edit it. Native **Plugins → DSMM** edits deployment layers instead, as described in [settings and status](settings-status.md).

## Four independent states

| State | What it means |
| --- | --- |
| Draft | Unsaved JSONC in the editor, including invalid input and comments |
| Saved revision | Validated bytes in the named document; Save changes only these bytes |
| Future-default pin | An immutable saved revision selected for new unscoped Agents |
| Current admission | The actual session's captured settings, profile revision and admission epoch |

Browsing doesn't activate anything. **Save profile** doesn't select or apply it, even when its ID is already selected. **Set as future default** pins the saved revision, not the dirty draft, and leaves existing Agents unchanged. **Use baseline for future sessions** clears that default without deleting documents.

**Apply profile to current session** and **Pin baseline for current session** are separate actions. They target the native view's exact session ID, reserve a truly idle ordinary root, and require both selection CAS and the current admission epoch. Busy, maintenance-owned, disposed, replaced, child or unauthorized targets refuse; nothing is queued. A successful change updates only that root and future children. Existing children keep their original captures.

The compact Conversation header menu switches the current-session profile while preserving the native model. Its separate **Use profile model** action asks native model selection to use the current admitted immutable profile's declared main model. It doesn't apply a later saved draft. Native model-default persistence follows the Models tab; newer manual model or effort intent wins. Sessionless controls never create a session.

## Document format

A document contains exactly `version: 1`, a filename-matching `id`, optional `label`, and `settings`. IDs contain 1 to 64 lowercase ASCII letters, digits, hyphens or underscores, start with a letter or digit, and can't be Windows reserved names. Labels are bounded text without control characters.

```jsonc
{
  "version": 1,
  "id": "careful",
  "label": "Careful review",
  "settings": {
    // Omitted fields inherit the captured deployment baseline.
    "locale": "en",
    "roles": { "dsmm-quick": false },
    "subagents": { "toolTopology": "parameterized" },
    "roleRouting": {
      "dsmm-reviewer": {
        "primary": { "provider": "my-provider", "model": "review-model" },
        "levels": { "high": { "reasoningEffort": "high" } },
        "fallbackRoutes": [],
        "strategy": "startup-lock"
      }
    }
  }
}
```

The provider/model must resolve through native DSH, and an exact effort must be supported. Catalog listings are advisory, not authentication or network-health checks. Manual/unlisted routes remain editable. See [model routing](model-routing.md) for level selection and route precedence.

Allowed runtime fields are `defaultActive`, `locale`, `roles`, `roleRouting`, `runtimePolicy`, `workflow`, `guards`, `runtimeRecovery`, `subagents.toolTopology`, and the `deepseekV4Pro`/`deepseekFlash` Calibration and DefaultReasoningEffort fields. Skills, prompt content, preset installation, LSP, session persistence, provider/account credentials, background/depth settings and `subagents.allowRouteOverride` remain deployment-only. `modules` is global-only. Unknown fields are rejected.

`deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets` are rejected with `deprecated-field`. They aren't silently ignored or migrated. Configure explicit `roleRouting[id].levels.low/high/max` instead; `normal` is the invocation default, not a configurable level entry. Orchestrator levels aren't supported.

## Inheritance and ceilings

Effective policy resolves from **built-in defaults → sparse global deployment → explicit native entry/profile override → immutable named overlay**. Missing members inherit, arrays replace, and explicit empty fallback chains remain empty. A named primary or level route replaces that route value, including removal of omitted effort, rather than retaining an old route's effort.

Named `roles` can narrow availability, not lift the captured deployment or startup ceiling. Orchestrator, Planner and Plan Critic can't be disabled by a named profile. Under legacy workflow policy, Reviewer is also required when final review isn't off, and Oracle is required for `simple-oracle-complex-reviewer`. Required status doesn't create missing startup capabilities. The editor shows required reason, startup availability, deployment enablement, admitted state, and source/capture separately; routing remains editable for disabled roles.

`locale` supports `en`, `zh-Hans`, `zh-Hant`, `ja`, `ko`, `de`, `fr`, `es`, `pt-BR`, and `ru`. Omission inherits deployment preference, then applicable native/user language guidance or conversation context. A current user's explicit output-language request wins and should be preserved in child assignments. Locale affects visible replies, plans and role output only, not internal reasoning, UI/project locale, identifiers, commands or exact quotations. A parent's later profile change doesn't rewrite a child's captured preference.

## JSONC, diagnostics and concurrency

Structured controls and Advanced JSONC edit the same draft. Path edits preserve unrelated bytes and comments. Invalid raw input stays visible and isn't normalized by switching back to the form. Save or explicitly discard dirty changes before changing the editor's document or selecting its saved revision.

The only nonblocking warning is `blank-label`: the profile ID is used for display, and the original document can still be saved and selected. Saved, draft, future-pin and current-admission warnings are distinct. Validation errors carry a stable reason, schema-safe field and, when available, JSONC offset/length and line/column. Unknown key names aren't echoed as trusted diagnostic fields. Duplicate keys, unsafe keys, malformed routes, unsupported values and retired fields block validation.

Saves and selections require expected revisions. Cooperative writers share a lock, recheck the revision before commit, and use same-directory atomic replacement. A conflict retains the draft and prior selection: refresh and reconcile explicitly. A non-cooperating editor can still race between the final recheck and rename; this isn't a universal external-editor transaction. Failed pointer commits retain the prior selection, though an unused immutable revision may remain.

## Storage and lifetime

The central store is `<resolvedDshHome>/plugins/dsmm/profiles/`, a DSMM convention. Trusted home resolution uses explicit `profileContext.home`, then `DSH_HOME`, then the official `~/.dsh` default. Shared named drafts and immutable revisions are separate from selection/session state scoped to canonical native profile identity and the actual DSMM entry ID. Reads don't create files or locks. Clients and models can't choose arbitrary roots or entry identities.

An existing exact `<profileContext.dir>/dsmm-profiles` library binds that runtime to strict read-only legacy storage. Its original pins and session records remain authoritative; a same-name central document isn't a fallback. Invalid, missing, linked, unstable or digest-mismatched references refuse. There is no automatic copy, migration or source deletion. Explicit import needs separate source authority and must preserve the reference graph without overwriting conflicts.

Startup freezes deployment and mounted capabilities before consumers install. New ordinary roots capture current valid desired deployment plus the selected immutable overlay. Existing roots, including blank ones, keep their full captures; idle profile Apply replaces only the allowed overlay on that root's old deployment baseline. `getSettings(agent)` is authoritative for an existing Agent. Cold resume creates a new live admission from current valid deployment and its committed sidecar, or the scoped future default when no sidecar exists; it doesn't restore an exited process's memory snapshot.

Profile Apply never changes the native root model, remounts startup services or upgrades role permissions. Deepwork mode intent is separately saved and survives profile changes. Children retain their original route/locale/authority evidence, intersected with current exact-parent authority for delivery; see [Agent presets and child control](agent-presets.md).

*Author's note: For a DSH operator editing named policy; save first, then choose the intended future or current-session scope explicitly.*
