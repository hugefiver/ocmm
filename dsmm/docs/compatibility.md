# DSMM compatibility and upgrade boundaries

**DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`** and Node.js 22 or later. Older SDKs and automatically drifting versions aren't supported targets.

## Supported integration

Official AgentRegistry, SubagentRuntime and JSONL namespace plugins own execution and storage. Basic role delegation uses native activation results and cancellation. There is no DSMM Registry/Runtime owner to select, manual-runtime overlay to install or persistence companion to configure. Keep the native storage root, compression and unrelated Loader entries unchanged.

Native Web surfaces are Plugins bundle configuration, Settings Profiles, the compact Conversation menu and delegation call views. CLI/headless use native deployment and tools; headless doesn't select Agent presets. TUI and Desktop retain their own carriers and exposed UI capabilities; Web controls aren't necessarily exposed in TUI.

`preset-skills` is internal Agent-scoped installation, not a public Loader plugin. DSMM-managed external LSP stays disabled even with stored `lsp.enabled:true`; native DSH LSP and independently configured MCP remain unaffected. See [LSP boundary](lsp.md).

## Configuration and actions

Core configuration and native permissions work without a session or active Deepwork. Resolution is defaults → sparse Global → explicit native entry/profile → admitted immutable named overlay. Objects merge, arrays replace, and false/empty/same-default pins remain explicit. Unset only removes the edited layer.

Global and exact native-profile saves are independent. Native form identity/revision and base/user provenance are required; no fallback Global write or cross-layer transaction is implied. Named documents, future-default pointers and actual admission remain separate. Desired saves don't change mounted capability or a running Agent's policy. Without a session, actual admission is unknown.

Save and future-default selection remain available under their own authority. **Live overlay Apply is unavailable; choose a default for a new session.** Native **Use profile model** and **Deepwork mode** have independent capabilities, not Apply's disabled gate. Use profile model consumes the admitted immutable configuration and respects newer native manual model/effort intent, including same-value reselection. Ordinary roots otherwise retain native selection. See [Profiles](profiles.md) and [settings/status](settings-status.md).

Stores use separate CAS and atomic-write boundaries. Committed saves aren't rolled back in the response because observation/notification failed: report refresh-required or unsynchronized status. An unconfirmed native mutation requires authoritative reread before retry. Operator, connection and owner lifetime remain valid through precommit; client claims or loopback-looking URLs don't authorize writes.

## Execution and recovery

### Native history composition

History protection requires the matching Session/Agent-loop, Gateway, aggregate `api-remotes` browser descriptor and workspace/subagent UI patches, not only the DSMM plugin. The bundle mounts `@dsmm/dsmm/history-support` independently of Core. It supplies `__DSMM_HISTORY_REQUIRED__` through native `webserver/index-inject` before Client initialization; Core failure does not remove that bootstrap. Non-browser integrations must supply `historyRequired: true` when initializing both patched Gateway and Session Clients.

Required Clients obtain generation-bound readiness and an opaque full-address lease before retention. The actual receiving Host validates protected RPC/stream requests before native lookup; unsupported Hosts and missing or retired readiness owners fail closed without falling back to ordinary follow. Main navigation waits for a ready replacement before releasing the old reference, and child sidebar resources prepare before retaining. These preparations authorize only browsing, not migration, continuation or execution.

Empty-browser component coverage uses the native Renderer, workspace navigation, child resource and failure Toast with test-owned layout, controls and a logical carrier. Separate loopback HTTP/WebSocket coverage exercises socket-wait guard retirement, native Session transport retry under a separately owned stable Connection generation, and actual receiving-Host replacement with native authentication and reconnect. Full application/Desktop carrier verification remains outstanding; see the [roadmap](roadmap.md).

### Execution ownership

Role calls wait for native activation results by default; only `completed` is normal completion. Cancellation after publication uses activation disposal and cleanup. Enabled background execution selects `delivery: 'parent'` before start. The accepted child/message receipt and interrupt acknowledgment aren't completion. Running waiting tasks can't transfer to background.

Queue/Steer/interrupt apply only to supported live direct children under exact-parent/operator authority. Descendant views are read-only. Missing native capability disables that operation with a reason; unknown sends aren't automatically resent. Requested role/model data isn't actual execution identity. See [Agent presets](agent-presets.md).

DSMM cold resume without trusted live admission is unsupported, including direct/Gateway resume paths. Configuration, PluginRecord metadata, labels or child IDs can't reconstruct authorization. Preserve readable history; don't substitute a persona, reset a session or import old data automatically. DSMM history inspection doesn't resume Agents. Native factory load/repair can precede the created guard, so refusal doesn't promise the log was never opened. Clear/compact can retain policy only with the exact live object and admission, not inferred lineage.

Standard supported model calls use native prepared calls. Raw/custom and Pi-AI stop-only calls use the minimal public completions seam for self-contained literal or explicit model-mapping configurations. Catalog-backed raw combinations that can't be reliably reproduced are rejected for both native and DSMM parameter sources, without disabling standard Coding. Native effort encoding/capability metadata isn't rewritten. See [model routing](model-routing.md).

## Retired compatibility surfaces

No old SDK branch, legacy-read host, cold-profile migration, session repair or custom-owner selector is a 0.3.1 activation path. Old libraries, captures and unmarked history aren't copied, rewritten, repaired or adopted by same-name fallback. Retired brand calibration/default-effort and MaxReasoningPresets fields reject with `deprecated-field`; edit configuration deliberately using generic routes and parameters.

Published **0.3.0 retains its rc.1 identity**, immutable tag, package, assets and version-bound receipt grammar. Historical release controls interpret those records under their original identity, not as a runtime compatibility branch.

## Installation boundaries

Evaluate an authorized built artifact in an isolated home/profile as in the [README](../README.md#use-a-local-artifact). Real Desktop/TUI/CLI plugin installation needs exact authorization and the matching rc.2 Host; it doesn't authorize upgrading the Host, touching credentials/history or copying a Desktop profile into another carrier.

Desktop plugin installation follows publication and requires the exact rc.2 Host; it doesn't authorize a Host upgrade. [Release controls](releasing.md) define publication and delivery. [Fake-IP fetch](web-fetch-fakeip.md) owns network details and limits; shell rejection remains unresolved. [Native permissions](native-permissions.md) defines approval scope.
