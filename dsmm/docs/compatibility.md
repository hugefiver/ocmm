# DSMM compatibility and upgrade boundaries

This document describes the **@dsmm/dsmm@0.3.0 source candidate**, not proof of a completed publication. It carries current 0.2.2 behavior onto exact DSH `0.2.1-rc.1` while retiring old DSH, capture/history-format, and Desktop/TUI migration compatibility. Evaluate the exact packed artifact; package checks, native/browser acceptance, registry verification, and terminal completion are distinct evidence.

## Supported integration

| Surface | Contract | Boundary |
| --- | --- | --- |
| Node.js | 22 or later | Required runtime |
| DSH SDK/component peers | exact `0.2.1-rc.1`; engine `>=0.2.1-rc.1 <0.3.0-0` | Trusted 0.3.0 integration target, not a future-version guarantee |
| Cordis / Schemastery | `~4.0.5` / `~3.18.5` | Declared package contracts |
| Native Web UI | Plugins item/bundle/row forms, Settings Profiles and Conversation controls | Actual Host identity and capabilities still required |
| Desktop/TUI migration | Not supplied by 0.3.0 | Old profiles and carriers are not read, rewritten, copied, or auto-migrated |
| CLI/headless | DSH `0.2.1-rc.1` native deployment configuration and delegation tools | Current data and permissions only; one-shot headless doesn't select Agent presets |
| Managed Agent/child runtime | Bundled explicit cold `./agent-registry` + `./subagent-runtime` composition | Restart required; no hot replacement or automatic runtime selection |
| DSMM-managed external LSP | Not enabled in this version; interfaces and original config retained | Automatic MCP mounting stays off even with `lsp.enabled:true`; DSMM settings UI hides LSP controls |

DSMM is the localized package/Core title; Deepwork names its optional module. Deepwork Profiles and `DW …` role labels don't rename package, Loader, command, role, provider or persistence IDs. Native metadata uses exported `locale/en.json` and `locale/zh.json`, not an invented manifest `displayName`.

The LSP restriction doesn't affect DSH's own LSP or independently configured MCP. The retained historical manual patch isn't a supported DSMM activation entry. Existing release checks still independently validate the retained LSP interface; they don't establish automatic integration availability. See [LSP boundary](lsp.md).

## Stable configuration and admission

Core settings remain available without a session and with Deepwork cold-off. Native Global and current-profile saves are independent: Global writes only central `config.json`; the exact native profile form writes only its own patch. Invalid or dirty input remains visible after refusal. There is no Save-all, second configuration store or implicit restart.

The sparse resolution order is defaults → global deployment → explicit native entry/profile → admitted immutable named overlay. Explicit same-default values remain overrides, objects merge, arrays replace, and unset removes only its own layer's key. Runtime profiles may narrow `roles` and select routing, topology and visible-output locale, but can't grant deployment-only route-override permission, mount services, change accounts or replace persistence. Required-role rules don't create missing startup capability. See [profiles](profiles.md) and [settings/status](settings-status.md).

Draft, saved revision, future-default pin and current admission are separate states. Save activates neither scope. Future-default changes leave existing Agents, including blank ones, unchanged. Current-session Apply requires an exact idle ordinary root, selection CAS and admission epoch; it commits only that root's immutable overlay on its existing deployment baseline. Current-format children retain their original captures, and later children inherit the new parent admission. Busy or stale targets aren't queued.

Global CAS uses actual-byte revision, cooperative locking, final recheck and atomic replacement. Native profile saves have separate native authorization/CAS, not a cross-layer transaction. These safeguards don't promise a universal transaction against non-cooperating external editors. Configuration RPC requires native invocation peer equal to the operator, public loopback bind, writable Host and owner/lifetime rechecks. Remote or unknown carriers refuse; a client `isLoopback` claim, tunnel or loopback-looking URL isn't authority.

Cold resume creates a new admission using valid current deployment data and the exact committed sidecar, or the scoped future default when no sidecar exists. Corrupt, unavailable, or old-format sidecars and profile libraries refuse without fallback. Clear/compact doesn't transfer choices through inferred lineage. Nothing is automatically copied, rewritten, repaired, or migrated.

## Models, roles and native controls

Ordinary roots preserve native provider/model/exact effort across activation, Save, profile Apply, later turns and cold resume. **Use profile model** is a separate explicit native action using the current admitted immutable revision. A newer manual selection wins. Locale is captured visible-output preference, subordinate to an explicit user language request, not a change to internal reasoning or technical identifiers.

Eligible child targets use normal by default; low/high/max require explicit exact-target levels. Unsupported effort refuses without downgrade. Per-role and parameterized topologies preserve canonical target filters, definition/provider identity, role matrix, depth and permission checks at execution. Disabled roles remain diagnosable and routing-editable without becoming callable. Orchestrator isn't a child target. `modelSelectionSettings:false` remains unchanged. See [model routing](model-routing.md).

Native child capture version 3 records delegation mode with the original role, invocation route, locale and authority. Descendants intersect parent allow-lists and accumulate deny-lists. A later parent profile doesn't rewrite child history, lift startup ceilings or recover missing or old-format capture. Current exact-parent authority is checked again for delivery, so a retained current capture isn't permission to bypass a newer cutoff. Route comparison uses initial invocation capture and that child's own request header; absent evidence stays unknown.

With background explicitly enabled and native jobs available, a published running foreground one-shot can transfer to background as the **same native run**. This doesn't replay a prompt, create a second child or revive settled work. Run receipts distinguish background, already-background, already-settled and cancelled outcomes.

Only an admitted direct continuable child with ready delivery fencing can accept Queue/Steer or interrupt. Descendant inspection is read-only and doesn't grant non-direct control. Idle/cold continuation keeps the durable child ID. Accepted inbox delivery isn't completion; interrupt acknowledgment isn't completion or proof queued work was removed. Unknown send outcomes retain the draft and disable automatic resend, including after refresh/reconnection. See [Agent presets and child control](agent-presets.md).

`startup-lock` is the default role strategy; bounded `rate-limit-fallback` is explicit. Every retry or switch requires correlated positive no-output evidence. Partial text, reasoning or tool fragments forbid replay, even on the same route. Process-local retry state isn't revived from old headers and generic failures don't authorize hopping. Native lifecycle, model authentication and cancellation stay Host-owned. See [runtime recovery](runtime-recovery.md).

## Explicit managed runtime composition

The 0.3.0 `cordis.patch.yml` explicitly disables stock ID `agent` / `@deepseek-ai/dsh-agent` and stock ID `subagent` / `@deepseek-ai/dsh-subagent`, then inserts exactly one DSMM Agent registry, one DSMM subagent runtime, and Main. This is a cold-start composition and requires an independent Host restart.

`@dsmm/dsmm/agent-registry` must own the actual `agents` service as `DsmmAgentRegistry`; `@dsmm/dsmm/subagent-runtime` must own `subagents` as `DsmmSubagentRuntime`. Native `name` values assert target identity rather than renaming rows. Check settled Loader state and both live service owners, preserve spawn/fork/model/Gateway services and explicit capacity/depth policy, and keep one owner of each service. Missing or duplicate owners refuse; a running stock service is never hot-shadowed.

The public `./agent-registry` export maps to `lib/agent-registry.js`; `./subagent-runtime` maps to `lib/runtime-integration.js`, whose default remains the explicit Host-owned startup plugin. These are two of sixteen public 0.3.0 exports. A resolved module or configured row is not proof of Host ownership. Runtime projection separates `binding: stock | dsmm | unavailable`, `deliveryFenceReady` and `restartRequired`. Missing native history, providers or admission fencing cannot be replaced by an availability flag.

## Retired compatibility surfaces

0.3.0 does not export `./legacy-read-host` and does not package session-repair or cold-profile migration scripts. Its current capture reader accepts only version 3. Old captures, old profile libraries, and unmarked historical logs are left untouched and refuse current resume or mutation. A role label, current parent, same-name central document, or serializable assertion cannot reconstruct missing historical authority.

Historical package/tag validators retain their original byte and receipt rules; this release does not reinterpret them or adopt their artifacts. Any separately authorized forensic recovery must use a tool and immutable version chosen for that exact private target, outside the 0.3.0 package and release proof.

## Session persistence compatibility

DSH `0.2.1-rc.1`'s stock session compatibility boundary retains the validated DSMM behavior: the public companion delegates to native JSONL in a separate Context and marks only validated `deepwork/mode` and `dsmm/role-policy` records. DSMM-aware readers retain them; stock readers can skip the marked records. Other event types and malformed metadata aren't broadly declared safe.

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

This prevents unsafe future writes but does not repair existing unmarked logs. 0.3.0 supplies no repair entrypoint. Don't bypass unknown-event guards, delete history, or silently reset a failed restore.

## Installing or upgrading a real Host

Use a checked exact 0.3.0 candidate artifact for evaluation, following the [isolated example](../README.md#use-a-local-artifact). Registry presence is not terminal completion. Publication follows separate [release controls](releasing.md); no automatic Desktop installation is claimed here.

Current CLI/headless evaluation must use a DSH `0.2.1-rc.1` installation-owned carrier, preserve unrelated Loader rows, provider/account catalogs, role policies and UI preferences, and follow explicit startup requirements. 0.3.0 does not supply an old Desktop/TUI migration path, and a renamed or copied profile is not supported activation. Confirm native inventory and actual UI only with authorization; don't use anonymous RPC as a shortcut.

Old `deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets` fields fail with `deprecated-field`. Don't silently rewrite them; explicit levels need a deliberate configuration edit. Older sessions rooted directly in now-auxiliary roles can fail native cold resume because the root preset isn't registered. Preserve their history and obtain direction rather than substituting another persona. Rollback doesn't authorize credential or history changes.

No package operation here authorizes changing real Desktop/TUI configuration, accounts, credentials or history. Do not copy credentials for keyless artifact checks. Platform, packed-runtime, Web and Electron evidence aren't interchangeable; local source capability isn't a release-completion or installed-host certificate.

*Author's note: For a DSH operator upgrading an existing installation; check the exact artifact and Host composition, then authorize only the intended carrier and data-preserving changes.*
