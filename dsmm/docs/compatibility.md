# DSMM compatibility and upgrade boundaries

This document describes the **local source candidate**, not a newly published release. The manifest remains `@dsmm/dsmm@0.2.0`, which is an existing registry version; that version string doesn't prove the registry artifact contains these source features. Evaluate the actual local packed artifact. Formal package/smoke checks and authorized installed-host acceptance are separate evidence, and neither is declared complete here.

## Supported integration

| Surface | Contract | Boundary |
| --- | --- | --- |
| Node.js | 22 or later | Required runtime |
| DSH SDK/component peers | `0.2.0-rc.2` | Current native integration target, not a future-version guarantee |
| Cordis / Schemastery | `~4.0.4` / `~3.18.4` | Declared package contracts |
| Native Web UI | Plugins item/bundle/row forms, Settings Profiles and Conversation controls | Actual Host identity and capabilities still required |
| Desktop source | Official `0.2.1-alpha.1` shared PluginManager/Web Host contracts | Source compatibility only, not executable/Electron activation |
| CLI/headless | Native deployment configuration and delegation tools | One-shot headless doesn't select Agent presets |
| TUI | Independent native deployment profile | Package installation doesn't prove every Web client control is exposed in TUI |
| Managed child runtime | Explicit cold `./subagent-runtime` composition | Not installed by the default bundle |
| DSMM-managed external LSP | Not enabled in this version; interfaces and original config retained | Automatic MCP mounting stays off even with `lsp.enabled:true`; DSMM settings UI hides LSP controls |

DSMM is the localized package/Core title; Deepwork names its optional module. Deepwork Profiles and `DW …` role labels don't rename package, Loader, command, role, provider or persistence IDs. Native metadata uses exported `locale/en.json` and `locale/zh.json`, not an invented manifest `displayName`.

The LSP restriction doesn't affect DSH's own LSP or independently configured MCP. The retained historical manual patch isn't a supported DSMM activation entry. Existing release checks still independently validate the retained LSP interface; they don't establish automatic integration availability. See [LSP boundary](lsp.md).

## Stable configuration and admission

Core settings remain available without a session and with Deepwork cold-off. Native Global and current-profile saves are independent: Global writes only central `config.json`; the exact native profile form writes only its own patch. Invalid or dirty input remains visible after refusal. There is no Save-all, second configuration store or implicit restart.

The sparse resolution order is defaults → global deployment → explicit native entry/profile → admitted immutable named overlay. Explicit same-default values remain overrides, objects merge, arrays replace, and unset removes only its own layer's key. Runtime profiles may narrow `roles` and select routing, topology and visible-output locale, but can't grant deployment-only route-override permission, mount services, change accounts or replace persistence. Required-role rules don't create missing startup capability. See [profiles](profiles.md) and [settings/status](settings-status.md).

Draft, saved revision, future-default pin and current admission are separate states. Save activates neither scope. Future-default changes leave existing Agents, including blank ones, unchanged. Current-session Apply requires an exact idle ordinary root, selection CAS and admission epoch; it commits only that root's immutable overlay on its existing deployment baseline. Existing children retain their original captures, and later children inherit the new parent admission. Busy or stale targets aren't queued.

Global CAS uses actual-byte revision, cooperative locking, final recheck and atomic replacement. Native profile saves have separate native authorization/CAS, not a cross-layer transaction. These safeguards don't promise a universal transaction against non-cooperating external editors. Configuration RPC requires native invocation peer equal to the operator, public loopback bind, writable Host and owner/lifetime rechecks. Remote or unknown carriers refuse; a client `isLoopback` claim, tunnel or loopback-looking URL isn't authority.

Cold resume creates a new admission using valid deployment and the exact committed sidecar, or the scoped future default when no sidecar exists. Corrupt/unavailable sidecars don't silently fall back. Clear/compact doesn't transfer choices through inferred lineage. An exact old `<profileContext.dir>/dsmm-profiles` library remains strictly read-only with its original immutable pins; central same-name documents aren't substitutes. Nothing is automatically copied or migrated.

## Models, roles and native controls

Ordinary roots preserve native provider/model/exact effort across activation, Save, profile Apply, later turns and cold resume. **Use profile model** is a separate explicit native action using the current admitted immutable revision. A newer manual selection wins. Locale is captured visible-output preference, subordinate to an explicit user language request, not a change to internal reasoning or technical identifiers.

Eligible child targets use normal by default; low/high/max require explicit exact-target levels. Unsupported effort refuses without downgrade. Per-role and parameterized topologies preserve canonical target filters, definition/provider identity, role matrix, depth and permission checks at execution. Disabled roles remain diagnosable and routing-editable without becoming callable. Orchestrator isn't a child target. `modelSelectionSettings:false` remains unchanged. See [model routing](model-routing.md).

Native child capture records original role, invocation route, locale and authority. Descendants intersect parent allow-lists and accumulate deny-lists. A later parent profile doesn't rewrite child history, lift startup ceilings or recover missing capture. Current exact-parent authority is checked again for delivery, so a retained child capture isn't permission to bypass a newer cutoff. Route comparison uses initial invocation capture and that child's own request header; absent evidence stays unknown.

With background explicitly enabled and native jobs available, a published running foreground one-shot can transfer to background as the **same native run**. This doesn't replay a prompt, create a second child or revive settled work. Run receipts distinguish background, already-background, already-settled and cancelled outcomes.

Only an admitted direct continuable child with ready delivery fencing can accept Queue/Steer or interrupt. Descendant inspection is read-only and doesn't grant non-direct control. Idle/cold continuation keeps the durable child ID. Accepted inbox delivery isn't completion; interrupt acknowledgment isn't completion or proof queued work was removed. Unknown send outcomes retain the draft and disable automatic resend, including after refresh/reconnection. See [Agent presets and child control](agent-presets.md).

`startup-lock` is the default role strategy; bounded `rate-limit-fallback` is explicit. Every retry or switch requires correlated positive no-output evidence. Partial text, reasoning or tool fragments forbid replay, even on the same route. Process-local retry state isn't revived from old headers and generic failures don't authorize hopping. Native lifecycle, model authentication and cancellation stay Host-owned. See [runtime recovery](runtime-recovery.md).

## Explicit managed runtime composition

The default `cordis.patch.yml` is unchanged and adds only the main DSMM entry. It doesn't replace the stock `subagents` service. Managed delivery needs the explicit cold overlay [patches/subagent-runtime.yml](../patches/subagent-runtime.yml) and an independent restart.

The patch targets stock ID `subagent` with name `@deepseek-ai/dsh-subagent`, disables that row, adds `@dsmm/dsmm/subagent-runtime`, and makes the main DSMM entry depend on `subagents`. Native `name` asserts the target identity; it isn't a rename. Check the actual Host composition before applying it. Preserve spawn/fork/model/Gateway services in the same scope and copy explicit stock capacity/depth configuration into the new runtime row. Keep one active runtime; don't hot-shadow or replace a running stock service.

The public `./subagent-runtime` export maps to `lib/runtime-integration.js`. Its default export is `subagentRuntimePlugin`, the Host-owned startup entry that constructs the public DSMM runtime subclass. A separately constructed class isn't proof of Host admission ownership. Runtime projection separates `binding: stock | dsmm | unavailable`, `deliveryFenceReady` and `restartRequired`. Missing native history, providers or admission fencing can't be replaced by an availability flag. Core stays usable, while unavailable controls return a refusal rather than a successful-looking receipt.

## Experimental legacy read

Old children without complete original capture expose conservative evidence, `provenFields` and per-field limitations. Neither the current parent's settings nor a role label proves their old configuration. Legacy child evidence and read-only legacy profile storage are separate mechanisms.

The legacy read adapter is **default off**. The consumed programmatic interface is `DsmmHostStartupOptions.experimentalLegacyRead`, passed to the main package's `createDsmmHostPlugin(startup)` or named `apply(ctx, config, hostStartup)` third argument. The old `legacyRead` option isn't consumed. It isn't a deployment/profile YAML field or an RPC switch.

Cold composition requires actual closed Host callbacks for composition capture, read bindings, call context, audit/retirement fault reporting and revocation. The constructor checks those collaborators; serializable assertions aren't a substitute for real Host operation/approval/audit ownership. Export resolution alone doesn't certify that a carrier supplies them.

Cross-process **known-retained-owner cleanup**, **B await/pre-drain ordering** and **published replay** aren't fully verified. This adapter isn't a stable general legacy-execution or cross-process guarantee. An unproven capability remains unavailable, never supplied by a fabricated attestation, inferred approval or permissive fallback. Keep it off for the stable captured-child path; don't weaken existing Core saves, CAS, model intent or permission cutoffs to accommodate it.

## Session persistence compatibility

DSH `0.2.0-rc.2`'s stock `Session.append` can't attach the `ignorable` envelope marker needed for unknown custom events. DSMM's public companion delegates to native JSONL in a separate Context and marks only validated `deepwork/mode` and `dsmm/role-policy` records. DSMM-aware readers retain them; stock readers can skip the marked records. Other event types and malformed metadata aren't broadly declared safe.

Use the **main** `@dsmm/dsmm` entry's deployment-only `sessionPersistence`. The `./session-persistence` export is a library building block, not a second Loader entry. Set the unchanged effective absolute root and effective `zstd` or `none` compression, disable the exact existing native provider at startup, and wait for the companion to become ready. No root is guessed, migrated or hot-replaced. Incompatible durable providers block custom DSMM appends; ephemeral Hosts without persistence remain allowed.

For a composition using the stock row below, this is a **partial template**, not a ready-to-copy replacement:

```yaml
- id: session-persistence-jsonl
  name: '@deepseek-ai/dsh-session-persistence-jsonl'
  disabled: true
- id: dsmm
  name: '@dsmm/dsmm'
  config:
    # Retain every existing DSMM config value here.
    sessionPersistence:
      root: '<unchanged-effective-absolute-root>'
      compression: '<unchanged-effective-zstd-or-none>'
```

Native patch `config` replaces the whole object. Preserve all existing settings and unrelated rows; another provider ID or a provider-free composition requires its own exact check. Keep one main DSMM Loader source to avoid conflicting native client registrations. Binding, marked durable writes and native/stock read behavior need artifact verification; an export existing isn't proof of persistence ownership.

This prevents unsafe future writes but doesn't repair existing unmarked logs. Any metadata-only repair needs separate authorization, a recoverable targeted backup and validation. Don't bypass unknown-event guards, delete history or silently reset a failed restore.

## Installing or upgrading a real Host

Use a checked local candidate artifact for evaluation, following the [isolated example](../README.md#use-a-local-artifact). Installing registry `0.2.0` isn't a way to obtain these new source interfaces. Publication follows separate [release controls](releasing.md); no new npm publication or automatic Desktop installation is claimed here.

Desktop and CLI/TUI use independent native deployment profiles. A separately authorized real installation must use the correct installation-owned carrier, preserve unrelated Loader rows, provider/account catalogs, role policies and UI preferences, and follow explicit startup requirements. Desktop must be fully quit for package handling. Neither a standalone CLI nor a renamed/copied Desktop profile proves supported Desktop activation. Confirm native inventory and actual UI only with authorization; don't use anonymous RPC as a shortcut.

Old `deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets` fields fail with `deprecated-field`. Don't silently rewrite them; explicit levels need a deliberate configuration edit. Older sessions rooted directly in now-auxiliary roles can fail native cold resume because the root preset isn't registered. Preserve their history and obtain direction rather than substituting another persona. Rollback doesn't authorize credential or history changes.

No package operation here authorizes changing real Desktop/TUI configuration, accounts, credentials or history. Do not copy credentials for keyless artifact checks. Platform, packed-runtime, Web and Electron evidence aren't interchangeable; local source capability isn't a release-completion or installed-host certificate.

*Author's note: For a DSH operator upgrading an existing installation; check the exact artifact and Host composition, then authorize only the intended carrier and data-preserving changes.*
