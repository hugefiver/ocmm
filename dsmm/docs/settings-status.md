# Deepwork settings and status

These are built source contracts, not a claim that the published `@dsmm/dsmm@0.2.0` artifact contains every source feature. Named policy is covered in [profiles](profiles.md), routing in [model routing](model-routing.md), and child authority in [Agent presets](agent-presets.md).

## Deployment layers and native editors

Effective settings resolve from **defaults → sparse global base → explicit native entry/profile override → admitted immutable named overlay**. The global base is `<resolvedDshHome>/plugins/dsmm/config.json`; a missing file is an empty layer. This is DSMM's storage convention, not a mandated Host layout. Trusted home resolution uses explicit `profileContext.home`, then `DSH_HOME`, then the official home default.

<a id="native-plugins-configuration-d"></a>

**Plugins → DSMM** edits the global base through fixed `remote.dsmmConfig`. The DSMM bundle and actual row Config pages also offer the current native-profile override through the public `ConfigPageForm`. Runtime entry ID, package ID, row ID and form namespace aren't interchangeable. A profile write requires the actual namespace, descriptor revision and matching raw base/user provenance. If that identity isn't available, the profile editor is unavailable or read-only; it never falls back to Global. The standalone Plugins item has no supplied profile form.

Global and native-profile controls have independent Save, Refresh and Discard actions and revisions. There's no Save all or cross-layer transaction. Missing keys inherit, explicit same-default values pin, and Unset removes only the edited layer's key, not a higher Host pin. Plain objects merge recursively and arrays replace. Full merged validation follows sparse-layer validation; unknown/prototype keys, non-JSON values and raw volatile refs refuse.

Native structural controls and bounded schema-aware Advanced JSON cover applicable deployment settings. Advanced input is strict JSON, not named-document JSONC. Invalid text and conflicts stay visible. Refresh preserves dirty input and its original revision; explicit discard/reload rebases it. Connection replacement, disconnection, entry replacement and disposal fence old writes. Saving doesn't restart, cancel, apply a named profile or respawn LSP.

### Save authority and concurrency

`dsmmConfig.describe`, `describeModules`, `describeSettings` and `save` use the existing local writable operator boundary. The native invocation peer must equal `connection.operator`, public `webServer.host` must be exactly `127.0.0.1`, and `settings.writable` must be true. A client loopback assertion, tunnel or reverse proxy isn't authority. These aren't model-visible tools and accept no arbitrary file, root or entry arguments.

Global saves use expected actual-byte revision, cooperative locking, a final revision recheck and same-directory atomic replacement. Authority and lifetime are rechecked before commit. Native-profile saves use public form mutation and descriptor CAS, not a hash guessed to be native CAS. External non-cooperating editors can still race at the final rename boundary. A save acknowledges its layer, not adoption by every live consumer.

Native ConfigEditor can emit `loader/partial-dispose` during empty-pending reconciliation without actual fiber or Agent disposal. The signal alone isn't proof of a lifecycle change; consumers must observe actual lifetime and admission boundaries.

<a id="global-module-ceiling-d0"></a>

## Availability and capture

`modules.deepwork.enabled` is a global-only ceiling and defaults true; ordinary `defaultActive` defaults false. Native profile overrides and named/session overlays can't enable the module. Cold-off leaves Core storage, captures/CAS, configuration/status and mandatory native permissions available, without mounting DW role/routing/recovery/LSP substrate. Static preset files aren't proof of callable roles.

On a mounted Host, desired-off affects new roots, not existing parents or their future children. Desired-on after cold-off remains restart-required until an independent Host restart. No hot-mount or restart queue is implied. An idle profile change doesn't absorb newer global deployment. Mode-on can't bypass an admitted off module; mode-off can replace saved on intent without pretending the module was active.

The inspector separates merged desired, startup-mounted/captured, next-root preview, and current-session admission. Without an actual session, current admission is unknown. Host bundle enablement also remains unknown when the public interface can't observe it. Sources, capture origins, global bytes revision, native descriptor revision and named pin aren't one acknowledgment.

Read-only configuration projections redact LSP command/arguments/cwd, preset root and recovery prompt; environment values and names aren't disclosed. Authorized sparse editor input is a separate boundary, not a status DTO. A missing projected field is absent; an unavailable layer is unknown, not an invented default.

## Runtime controls

`/deepwork [off|message]` changes the receiving session's mode. Explicit intent, including a same-default choice, survives profile changes and reopen. Official minimal conversations default off; DW presets default on unless explicit intent says otherwise. Off hides common workflow/DSMM skills, not persona, read-only restrictions or host/Git permissions. Busy mutations refuse instead of queuing. Slash commands belong to the native command adapter, not headless task text.

`/dsmm-status` reports normalized bounded state; `/dsmm-status json` returns a defensive version-1 snapshot. Status separates admitted profile/revision/epoch, actual route state, effective settings and captured module/runtime binding. Ordinary roots report native-owned effort and keep the native model tab's route, not an applied child-role primary. `profileModel` is advisory for explicit **Use profile model**, never proof that selection already happened.

`workflow.policy` accepts `risk-based` or `legacy`. Explicit policy wins. Without it, explicitly supplied `strictGates`, `reviewCap` or `finalReviewPolicy` selects legacy; otherwise risk-based is the default. Named role restrictions retain required Orchestrator/Planner/Plan Critic, plus legacy-conditional Reviewer/Oracle. They can't enable a role outside startup/deployment ceilings.

`roleRouting[id].levels` accepts only explicit `low`, `high` and `max` overrides; invocation omission means `normal`. These are call resources, not workflow tiers or generated roles. `subagents.toolTopology` defaults `per-role` and may be narrowed/configured in a named overlay. Background, depth and route-override permission remain deployment-only. `subagents.allowRouteOverride` defaults false. See [routing](model-routing.md) for the exact tool and target grammar.

`locale` is an optional visible-output preference using the supported locale IDs in [profiles](profiles.md#inheritance-and-ceilings). Omission inherits; the current user's explicit language request wins. It doesn't change UI locale or protocol vocabulary. Both retired `*MaxReasoningPresets` fields reject with `deprecated-field`; there is no automatic migration. The only nonblocking document warning is `blank-label`, with schema-safe diagnostics and source location where available.

## Child runtime composition

Default deployment uses foreground one-shot work: `enableRunInBackground:false`, `backgroundMode:"one-shot"`, and omitted `maxDepth` delegates to the native Host limit. Captured settings and actual startup capabilities determine availability. A configured flag isn't proof that jobs, persistence, continuation or delivery fencing is ready.

The built source exports `@dsmm/dsmm/subagent-runtime` (`./subagent-runtime`) for explicit cold-start composition. The optional [subagent runtime patch](../patches/subagent-runtime.yml) disables the exact stock subagent row and installs the DSMM runtime in the same Host service scope. Verify the actual stock row identity and copy explicit capacity/depth configuration before restarting; preserve spawn/fork/model/Gateway services. A duplicate provider refuses. The default [bundle patch](../cordis.patch.yml) is unchanged and doesn't replace stock subagents automatically.

The public runtime projection reports `binding: stock | dsmm | unavailable`, `deliveryFenceReady`, `restartRequired`, and a bounded reason when applicable. Loading Core, saving settings or seeing a role catalog doesn't prove fenced delivery. Managed continuation requires the explicit ready composition. Native lifecycle, inbox, jobs and storage remain native-owned; DSMM doesn't install a second scheduler or retry controller.

Old-child compatibility exposes conservative captured evidence, `provenFields` and limitations, not full configuration recovery. The legacy read adapter is default off and requires explicit trusted Host composition. It isn't a JSON attestation switch or a source of invented approval/durability guarantees. See [compatibility](compatibility.md) for that separate adapter boundary.

*Author's note: For a DSH deployment operator; distinguish a successful configuration save from captured runtime availability before applying policy.*
