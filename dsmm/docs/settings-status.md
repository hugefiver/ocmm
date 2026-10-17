# Deepwork settings and status

These are built source contracts, not a claim that the published `@dsmm/dsmm@0.2.0` artifact contains every source feature. Named policy is covered in [profiles](profiles.md), routing in [model routing](model-routing.md), and child authority in [Agent presets](agent-presets.md).

## Deployment layers and native editors

Effective settings resolve from **defaults → sparse global base → explicit native entry/profile override → admitted immutable named overlay**. The global base is `<resolvedDshHome>/plugins/dsmm/config.json`; a missing file is an empty layer. This is DSMM's storage convention, not a mandated Host layout. Trusted home resolution uses explicit `profileContext.home`, then `DSH_HOME`, then the official home default.

<a id="native-plugins-configuration-d"></a>

**Plugins → DSMM** edits the global base through fixed `remote.dsmmConfig`. The DSMM bundle and actual row Config pages also offer the current native-profile override through the public `ConfigPageForm`. Runtime entry ID, package ID, row ID and form namespace aren't interchangeable. A profile write requires the actual namespace, descriptor revision and matching raw base/user provenance. If that identity isn't available, the profile editor is unavailable or read-only; it never falls back to Global. The standalone Plugins item has no supplied profile form.

Global and native-profile controls have independent Save, Refresh and Discard actions and revisions. There's no Save all or cross-layer transaction. Missing keys inherit, explicit same-default values pin, and Unset removes only the edited layer's key, not a higher Host pin. Plain objects merge recursively and arrays replace. Full merged validation follows sparse-layer validation; unknown/prototype keys, non-JSON values and raw volatile refs refuse.

Native structural controls and bounded schema-aware Advanced JSON cover applicable deployment settings. Advanced input is strict JSON, not named-document JSONC. Invalid text and conflicts stay visible. Refresh preserves dirty input and its original revision; explicit discard/reload rebases it. Connection replacement, disconnection, entry replacement and disposal fence old writes. Saving doesn't restart, cancel, apply a named profile or respawn LSP.

LSP isn't an applicable UI setting in this version. Its implementation, interfaces and original configuration remain, but DSMM settings hide LSP controls and automatic MCP mounting stays off even with stored `lsp.enabled:true`. Neither a save nor a restart enables it. DSH's own LSP and independently configured MCP are unaffected; the retained historical manual patch isn't a supported DSMM activation entry. See [LSP boundary](lsp.md).

### Save authority and concurrency

`dsmmConfig.describe`, `describeModules`, `describeSettings` and `save` use the existing local writable operator boundary. The native invocation peer must equal `connection.operator`, public `webServer.host` must be exactly `127.0.0.1`, and `settings.writable` must be true. A client loopback assertion, tunnel or reverse proxy isn't authority. These aren't model-visible tools and accept no arbitrary file, root or entry arguments.

Global saves use expected actual-byte revision, cooperative locking, a final revision recheck and same-directory atomic replacement. Authority and lifetime are rechecked before commit. Native-profile saves use public form mutation and descriptor CAS, not a hash guessed to be native CAS. External non-cooperating editors can still race at the final rename boundary. A save acknowledges its layer, not adoption by every live consumer.

Native ConfigEditor can emit `loader/partial-dispose` during empty-pending reconciliation without actual fiber or Agent disposal. The signal alone isn't proof of a lifecycle change; consumers must observe actual lifetime and admission boundaries.

<a id="global-module-ceiling-d0"></a>

## Availability and capture

`modules.deepwork.enabled` is a global-only ceiling and defaults true; ordinary `defaultActive` defaults false. Native profile overrides and named/session overlays can't enable the module. Cold-off leaves Core storage, captures/CAS, configuration/status and mandatory native permissions available, without mounting DW role/routing/recovery substrate. DSMM-managed LSP stays off independently of this module ceiling. Static preset files aren't proof of callable roles.

On a mounted Host, desired-off affects new roots, not existing parents or their future children. Desired-on after cold-off remains restart-required until an independent Host restart. No hot-mount or restart queue is implied. An idle profile change doesn't absorb newer global deployment. Mode-on can't bypass an admitted off module; mode-off can replace saved on intent without pretending the module was active.

The inspector separates merged desired, startup-mounted/captured, next-root preview, and current-session admission. Without an actual session, current admission is unknown. Host bundle enablement also remains unknown when the public interface can't observe it. Sources, capture origins, global bytes revision, native descriptor revision and named pin aren't one acknowledgment.

`presets.plannerRootEnabled` defaults false and controls only the standing DW Planner root preset, not the default-enabled workflow Planner role or Harness's native plan mode. Like the rest of `presets`, Global/native-entry settings may configure it, named overlays cannot, and desired changes require an independent restart; current Agents are not hot-migrated. See [Planner root admission](agent-presets.md#roles-and-composition) for discovery, forced creation/resume and read-only boundaries.

`permissionControl.enabled` defaults true independently of Deepwork. Permission settings are deployment-only: Global and native-profile settings may save them, while named/session overlays cannot. Only `enabled` is startup-pinned: live saves do not remount or change its admitted value, including for newly created roots; a difference is reported as `permissionControl.enabled` restart-required. A separate cold start captures the new toggle. Dynamic outside-read, web and persistent rules require runtime revision synchronization rather than restart. OFF does not disable Core guards, readonly, native sandbox/approval or tool filters. Configuration and startup admission do not establish that a permission executor is mounted or synchronized. Actual native standing `danger-full-access` is full access: DSMM adds no ask, downgrade, path permit or refusal for unknown operations or missing classification facts. Only a deterministically matched existing explicit deny blacklist may produce a native pre-approval denial. A requested mode or configured command target alone isn't effective native authority. See [native permissions](native-permissions.md).

The rules RPC writes the global DSMM layer. A native override of outside-read, web or rule policy refuses that RPC save; edit or unset the native override instead. An enabled-only native override does not shadow dynamic policy. Ordinary configuration Save still writes its chosen layer, and the runtime uses the resolved global/native policy rather than assuming every global edit wins.

The Host installs `installDeploymentPermissionRules` in its owned Core fiber with `agents` injected, the actual `DsmmDeploymentConfig`, a pure writable-Root check and an awaited notification callback. Its `initial` snapshot, `runtime` sync owner and backend are the collaborators for the permission controller and the single permissions RPC. DSH owns approval: an actual manual approval is final for that call and approved scope, without a DSMM post-approval veto from older rules, epochs or internal gates. DSMM has no independent approval queue, UI, TTL or session permit memory. The ordinary `managed-settings` module retains native SettingsForms and supplies only a scoped `configEditor.edit` façade; the root ConfigEditor and its locks, form CAS and reconciliation remain native-owned. Missing or retired ownership refuses managed saves, not an actually approved call. These source interfaces require the corresponding cold Host composition; configuration alone is not mounting evidence.

Permission revisions are opaque tokens over the persistent global CAS and native configuration read set, not form counters or per-rule version maxima. Controlled saves reread actual storage after CAS and publish only after notification acknowledges the committed policy. No-op saves may retain the token. Notification failure exposes saved/runtime revisions as unsynchronized; recovery rereads authoritative storage. CAS, ownership and synchronization checks protect configuration writes and policy adoption, not a second call-approval gate: permission-source changes neither cancel pending native approval nor let DSMM override an actual same-call approval. New calls consume current policy. Conflicts and recovery preserve dirty editor drafts. Native and ordinary JSON rule imports receive `user-import` provenance, while rules RPC provenance comes from the live operator authority. Persistent provenance isn't native approval or a reusable grant. A native once grant doesn't widen session permissions or authorize another call, and a narrower grant isn't full access. Native rejection, caller/native cancellation and original OS failures remain possible; approval doesn't guarantee command success. Only `enabled` remains pinned to the mounted runtime; a desired OFF cannot turn off running controls before restart.

Read-only configuration projections redact LSP command/arguments/cwd, preset root and recovery prompt; environment values and names aren't disclosed. Authorized sparse editor input is a separate boundary, not a status DTO. A missing projected field is absent; an unavailable layer is unknown, not an invented default.

## Runtime controls

`/deepwork [off|message]` changes the receiving session's mode. Explicit intent, including a same-default choice, survives profile changes and reopen. Official minimal conversations default off; DW presets default on unless explicit intent says otherwise. Off hides common workflow/DSMM skills, not persona, read-only restrictions or host/Git permissions. Busy mutations refuse instead of queuing. Slash commands belong to the native command adapter, not headless task text.

`/dsmm-status` reports normalized bounded state; `/dsmm-status json` returns a defensive version-1 snapshot. Status separates admitted profile/revision/epoch, actual route state, effective settings and captured module/runtime binding. Ordinary roots report native-owned effort and keep the native model tab's route, not an applied child-role primary. `profileModel` is advisory for explicit **Use profile model**, never proof that selection already happened.

`workflow.policy` accepts `risk-based` or `legacy`. Explicit policy wins. Without it, explicitly supplied `strictGates`, `reviewCap` or `finalReviewPolicy` selects legacy; otherwise risk-based is the default. Named role restrictions retain required Orchestrator/Planner/Plan Critic, plus legacy-conditional Reviewer/Oracle. They can't enable a role outside startup/deployment ceilings.

`roleRouting[id].levels` accepts only explicit `low`, `high` and `max` overrides; invocation omission means `normal`. These are call resources, not workflow tiers or generated roles. `subagents.toolTopology` defaults `per-role` and may be narrowed/configured in a named overlay. Background, depth and route-override permission remain deployment-only. `subagents.allowRouteOverride` defaults false. See [routing](model-routing.md) for the exact tool and target grammar.

`locale` is an optional visible-output preference using the supported locale IDs in [profiles](profiles.md#inheritance-and-ceilings). Omission inherits; the current user's explicit language request wins. It doesn't change UI locale or protocol vocabulary. Both retired `*MaxReasoningPresets` fields reject with `deprecated-field`; there is no automatic migration. The only nonblocking document warning is `blank-label`, with schema-safe diagnostics and source location where available.

## Child runtime composition

Default deployment uses foreground one-shot work: `enableRunInBackground:false`, `backgroundMode:"one-shot"`, and omitted `maxDepth` delegates to the native Host limit. Captured settings and actual startup capabilities determine availability. A configured flag isn't proof that jobs, persistence, continuation or delivery fencing is ready.

The 0.3.0 build exports `@dsmm/dsmm/agent-registry` (`./agent-registry`) and `@dsmm/dsmm/subagent-runtime` (`./subagent-runtime`) for explicit cold-start composition. The bundled [patch](../cordis.patch.yml) disables the exact stock Agent and Subagent rows and installs one DSMM owner for each service before Main. Verify settled Loader identities and actual service constructors, preserve spawn/fork/model/Gateway services and explicit capacity/depth configuration, then restart. Missing or duplicate ownership refuses; there is no hot replacement or automatic runtime selection.

The public runtime projection reports `binding: stock | dsmm | unavailable`, `deliveryFenceReady`, `restartRequired`, and a bounded reason when applicable. Loading Core, saving settings or seeing a role catalog doesn't prove fenced delivery. Managed continuation requires the explicit ready composition. Native lifecycle, inbox, jobs and storage remain native-owned; DSMM doesn't install a second scheduler or retry controller.

0.3.0 accepts only current version-3 child captures. Old or incomplete capture evidence refuses without falling back to current parent settings, role labels, or fabricated approval/durability guarantees. The legacy-read adapter is not exported or composed. See [compatibility](compatibility.md#retired-compatibility-surfaces).

*Author's note: For a DSH deployment operator; distinguish a successful configuration save from captured runtime availability before applying policy.*
