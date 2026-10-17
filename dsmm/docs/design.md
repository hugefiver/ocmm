# DSMM native architecture

DSMM is a DSH-native Cordis bundle. It supplies Core configuration and permission integration plus an optional Deepwork workflow, native role delegation and captured-child controls. It doesn't load the OpenCode plugin or emulate OpenCode hooks. The supported integration target is DSH `0.2.0-rc.2`; current source changes aren't proof of publication or installed Desktop acceptance.

## Composition and authority

The bundle's `cordis.patch.yml` composes with native base/Web/headless profiles. DSH owns authentication, model selection, session storage, approval, jobs and lifecycle. DSMM narrows role/tool/delegation authority within those services, without a second scheduler or approval queue.

Main entry `dsmm` accepts native-only `runtime.enabled`, a strict boolean defaulting to true. At cold startup it selects `dsmm-auto-subagent-runtime`, a subclass of the official `SubagentRuntime`, or leaves the official stock owner when false. The automatic entry inherits the final stock depth/capacity configuration. The explicit manual runtime overlay remains supported with its own Config semantics. Unsupported topology or ambiguous ownership refuses activation, not implicit owner replacement.

A native runtime save records desired state only. It doesn't dispose Main, cancel an active request or replace the resident owner; convergence requires an independent restart. Actual lifecycle loss and relevant permission changes still revoke stale authority. Desired enablement, actual binding, delivery-fence readiness and restart requirement are separate facts.

Default runtime selection doesn't establish stock-persistence readiness. Durable DSMM mode and role-policy events require compatible Main `sessionPersistence`. Native JSONL can retain ignorable extension records, but stock ownership doesn't satisfy DSMM's present compatibility guard. The [roadmap](roadmap.md) records the deferred official PluginRecord route; a Host upgrade alone isn't a fix.

## Configuration and admission

Effective settings resolve as defaults → sparse Global deployment → explicit native entry/profile → immutable named overlay. Objects merge; arrays replace. An explicit same-default value remains a pin, and Unset removes only the current layer's key.

Core remains available without a session and with Deepwork cold-off. Global storage lives under `<resolvedDshHome>/plugins/dsmm`; native profile patches remain Host-owned. Global saves use metadata-version CAS, cooperative locking, final recheck and atomic replacement. Native form CAS, session selection CAS and admission epochs keep their separate authorities. Stat versions, snapshot references and historical digest-shaped references aren't configuration-content proofs. Child capture envelopes, source/resource integrity and release checksums retain their own integrity contracts.

Startup captures mounted capabilities. New ordinary roots admit current valid desired deployment within that startup ceiling. Existing roots, including blank ones, and their future children retain their captured baseline. Explicit idle current-session Apply replaces only the permitted named overlay on that baseline. Existing children retain original settings, locale, route and authority.

Named profile Save, future-default selection and current-session Apply are distinct operations. Neither ordinary profile switching nor Save changes the native root model. **Use profile model** is a separate explicit native selection action, fenced against newer observed manual model/effort intent. Exact legacy libraries remain read-only; no automatic migration or same-name fallback is supplied. See [Profiles](profiles.md).

## Native client surfaces

**Plugins → DSMM bundle config** is the single deployment editor. DSMM registers `plugins.bundle.config` for `@dsmm/dsmm`, not duplicate item/row configuration pages or Conversation configuration tabs. A scope selector chooses Global or the current native profile, and module buttons open one in-area nonmodal drawer. [DESIGN.md](../DESIGN.md) defines the native tokens and interaction contract.

The bundle owner passes `view`; authenticated server metadata resolves the optional native form. Entry ID, row ID, package ID and form namespace aren't interchangeable. Writes require matching identity, revision and raw base/user provenance. Missing or stale form authority makes that scope read-only, never a guessed namespace or Global fallback.

Each scope saves sparse explicit values. Dirty drafts survive drawer changes and native unmount/remount; invalid input or conflicts retain the draft and original CAS. Accepted-but-unrefreshed saves remain committed and can't be replayed. Browsing and saving don't create sessions, select profiles, call providers, restart services or mount LSP.

The Permissions drawer includes exact native-command entries and a separate Root-rules transaction. Default-off command configuration doesn't certify an executor or grant full access. Root rules retain live operator, exact open Root, registration and synchronization gates. Named **Deepwork Profiles** keeps its independent Settings section and compact Conversation header menu.

Native delegation call views distinguish requested identity from validated actual invocation metadata. Raw arguments, errors, metadata and nontext results remain inspectable as JSON without a rich preview. The view changes neither routing nor approval; calls without a native window use the native fallback. These are presentation interfaces, not proof that a target is callable.

## Workflow, identity and routing

The source inventory contains 11 base roles, 11 categories and fourteen configurable lazy skills. Only enabled Orchestrator, Builder and opted-in Planner are standing-root eligible. File/catalog presence isn't execution admission. See [Agent presets](agent-presets.md) and [source synchronization](skill-sync.md).

Ordinary native identity remains Host-owned. DSMM-managed scopes supply their own `harness:identity` system section while preserving role, read-only and permission boundaries. Deepwork off withdraws common workflow and DSMM skills, not mandatory persona or access restrictions. The global module ceiling, session mode and runtime owner are separate controls.

Providers use generic native capabilities, `modelParameters`, role routes, configured invocation levels and explicit deployment-authorized per-call overrides. Omitted effort stays native-owned. Retired brand-calibration/default-effort and MaxReasoningPresets fields reject with `deprecated-field`; no automatic migration is provided. [Model routing](model-routing.md) defines exact route precedence and captured-version compatibility.

Native jobs own permitted background execution. Handoff transfers the same running one-shot rather than starting another child. Continuable delivery retains the durable child ID and current direct-parent authority; inbox acceptance isn't execution completion. Retries require positive correlated no-output evidence, and partial text/reasoning/tool fragments forbid replay. See [runtime recovery](runtime-recovery.md).

## Verification and remaining limits

Packed-artifact, native Web and actual Electron/Desktop acceptance are different surfaces. Source compatibility with official Desktop shared contracts doesn't prove executable activation. Verification must preserve user profiles, credentials, history and immutable release identities; software installation and real-carrier changes need separate authorization.

The accepted P1 pending one-shot approval/parent-epoch defect remains [deferred](deferred-native-approval-risk.md). Repeated approval for read-only Git awaits an exact triggering command and reason; its cause isn't established. The [roadmap](roadmap.md) retains both limits and the official prerelease evidence.

DSMM-managed external LSP remains off, even with `lsp.enabled:true`. Retained interfaces and release checks don't provide an automatic activation entry. DSH's own LSP and independently configured MCP remain unaffected; see [LSP boundary](lsp.md).
