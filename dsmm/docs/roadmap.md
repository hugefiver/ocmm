# DSMM roadmap

## Version policy

**DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`.** Each DSMM version targets the published DSH RC or stable release selected for that version. Older SDKs and old configuration schemas aren't runtime compatibility targets. Loading sessions created by DSMM `0.2.x` is a required compatibility target, separate from retaining old runtime implementations or execution behavior. A newer upstream release requires deliberate reassessment, not an automatic dependency or runtime switch.

Published `0.3.0` retains its original rc.1 package, tag, assets and version-bound release identity.

## Current capabilities

Official AgentRegistry, SubagentRuntime and JSONL namespace plugins own execution and storage. DSMM supplies immutable admission, roles, routing and scoped policy without a custom execution owner, persistence companion or manual-runtime selector. Coding delegation consumes native activation results and cancellation; live direct-child controls use native ownership and capabilities, while descendant inspection remains read-only.

Deployment configuration uses native Plugins forms and separate sparse Global/native-profile layers. Named Profiles preserve draft, saved revision, future default and current admission as distinct states. Global/store CAS, native form revisions, filesystem protection, operator authority and RPC lifetime checks retain their own boundaries. Desired values don't update mounted services or running task policy. Save/future-default selection, model selection, mode changes and overlay Apply have independent capabilities.

Agent-scoped skills expose metadata and load bodies lazily, preserving non-DSMM ancestor winners. Standard model calls use native prepared calls. The minimal public Pi-AI completions seam supports raw/custom and stop-only parameters for self-contained literal or explicit model-mapping configurations. Catalog-backed raw combinations that can't be reliably reproduced are rejected for both native and DSMM parameter sources; standard calls and native effort encoding remain unchanged.

Native call views show the target in collapsed rows, distinguish requested from actual identity, and retain that distinction for partial output, failure, interruption and current-format replay/PTC. Child labels use `Coding: task description`.

## Remaining capability boundaries

| Capability | Current behavior | Requirement for broader support |
| --- | --- | --- |
| Profile selection in a new session | The working tree supports choosing a profile or deployment defaults before the first turn. | Preserve first-request, child-routing and draft behavior through supported native Client integration. |
| Live overlay Apply | Unavailable. Save/select a future default for a new session; ordinary model and mode actions retain independent capabilities. | Exact configuration/call/approval binding without cross-call authority reuse. See [approval boundaries](deferred-native-approval-risk.md). |
| Running-call background handoff | Unavailable. Select waiting or native parent delivery before starting; don't restart a task to simulate transfer. | A supported same-activation ownership/delivery handoff. |
| DSMM cold resume | Patched Host supports read-only history and explicit continuation with fresh admission. Native Client/bootstrap/navigation enforce generation-bound preparation. | Verify the complete browser/Desktop carrier and socket-retry paths before claiming supported deployment. |
| Non-disruptive hot update | No uninterrupted live-session guarantee. Retire admissions and let native owners cancel/dispose owned work; guards remain fail-closed. | Native lifecycle support that preserves active task/approval boundaries. |
| Catalog-backed raw combinations | Rejected where the complete composition can't be reliably reproduced, regardless of native or DSMM parameter source. Standard calls aren't affected. | A public seam that can reproduce the full catalog composition and preserve native capability/effort semantics. |
| Repeated read-only Git approval | Keep native approval; don't expand Allow rules based on an unexplained prompt. | Exact triggering command, working directory and approval reason. |
| Shell Fake-IP access | Rejection source remains unknown; don't guess a sandbox or permission change. | Concrete command/error/runner evidence identifying the actual rejection layer. See [network boundaries](web-fetch-fakeip.md). |
| External LSP | DSMM automatic mounting isn't delivered. DSH native definition/references/implementation/hover and independently configured MCP remain separate. | Supported APIs and explicit permissions for additional operations; no automatic external remount or scope expansion. |

Search/Fetch retain the explicitly configured native provider. DSMM doesn't automatically enable a direct API, change credentials or forward the recent human question. HTTP Fake-IP behavior and network limits are maintained in [Fake-IP fetch](web-fetch-fakeip.md).

## Planned: loading sessions created by DSMM 0.2.x

Sessions created by DSMM `0.2.x` must remain loadable under the supported current DSH runtime. Changed execution behavior is acceptable; blanket refusal to load an old session is not.

- Opening a historical session must preserve its list entry, title and readable conversation, including messages and tool results. An unavailable execution capability must not make the session disappear or prevent history from loading.
- Retired presets, plugins, metadata or admission formats require interpretation, migration or an explicit degraded mode rather than whole-session rejection solely because the old implementation is unavailable. This does not require restoring the old SDK or execution owner.
- Continued execution may use current roles, routing, configuration and permission semantics. Explain material differences and request fresh authorization where necessary; never treat historical metadata or approvals as current authority. When continuation is unavailable, retain the loaded history and expose the specific limitation separately.
- Preserve original records. Any necessary migration must protect user data with a recoverable original and concurrent-write safeguards; never discard history merely to make loading succeed. Corrupt or genuinely unreadable data must produce a specific diagnostic rather than silently removing the session.
- Acceptance covers opening representative `0.2.x` root and child histories, retaining titles/list entries and readable content, and separating continuation restrictions from loading. These are pending compatibility requirements, not claims that `0.3.1` already fulfills them.

## Working-tree implementation: profile selection before the first message

- Allow selecting a saved profile or the default configuration on the new-session page, including when a blank session has already been created.
- Show the selected profile immediately and use its settings for the first request and subsequent delegated work. Keep the user's unsent draft when changing the selection.
- Keep the choice for this session separate from the default for future sessions. Changing one must not silently change the other.
- Determine availability from whether execution has begun, rather than disabling every session with the same restriction. Preserve permission checks and protect active work when a conversation has already started.
- Verify that a user can open a new session, change its profile and send the first message with the selected settings. Do not show a “new session required” instruction on a page where that action is itself unavailable.

## Working-tree implementation: simpler DSMM settings

- Expand drawers containing only one section by default so their controls are immediately visible. Keep multi-section drawers easy to scan and navigate.
- Remove all redundant copy: repeated headings, explanations already conveyed by a control, implementation details and “not X, but Y” comparisons.
- Use familiar, consistent names across settings and session menus. Prefer direct wording such as “本次会话配置”, “新会话默认配置”, “使用默认配置” and “保存”; keep internal terms such as admission, overlay, mounted state and CAS out of normal interface copy.
- Keep only information needed to make a choice or act: what a setting affects, when it takes effect, important permission/data consequences and a concise recovery action when something fails. Place optional technical diagnostics behind a details disclosure.
- Review every drawer and its empty, disabled, saved and error states. Users must be able to find the controls and understand their choices without reading implementation explanations; preserve keyboard access and accessible labels.

## Working-tree implementation: dispatcher-only native presets

- Register only the dispatcher as a selectable native preset. Delegation targets are not registered compositions: a delegated child shares its parent's standing composition, and the admitted invocation carries its role, identity and restrictions.
- Blank preset switches to any other DSMM role are refused by the native registry; the admitted composition keeps executing.
- DSMM installs no Host package patches. Persisted sessions resume with a fresh admission from the current deployment: history stays readable user intent, while delegation authority and child residency are never reconstructed from logs.

Existing [Fake-IP fetch](web-fetch-fakeip.md) protections remain in force.

## Publication and Desktop installation

0.3.1 publication uses the version-bound [release controls](releasing.md). Desktop plugin installation follows publication, uses the Desktop-owned carrier and requires exact DSH `0.2.1-rc.2`. Installation doesn't authorize upgrading the Host, changing credentials or real sessions, altering unrelated configuration, or restarting active work. An incompatible Host or required data migration blocks installation rather than expanding its scope.
