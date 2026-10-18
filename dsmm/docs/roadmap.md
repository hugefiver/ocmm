# DSMM roadmap

## Version policy

**DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`.** Each DSMM version targets the published DSH RC or stable release selected for that version. Older SDKs, old configuration schemas and historical session formats aren't compatibility targets; existing data remains untouched. A newer upstream release requires deliberate reassessment, not an automatic dependency or runtime switch.

Published `0.3.0` retains its original rc.1 package, tag, assets and version-bound release identity.

## Current capabilities

Official AgentRegistry, SubagentRuntime and JSONL namespace plugins own execution and storage. DSMM supplies immutable admission, roles, routing and scoped policy without a custom execution owner, persistence companion or manual-runtime selector. Coding delegation consumes native activation results and cancellation; live direct-child controls use native ownership and capabilities, while descendant inspection remains read-only.

Deployment configuration uses native Plugins forms and separate sparse Global/native-profile layers. Named Profiles preserve draft, saved revision, future default and current admission as distinct states. Global/store CAS, native form revisions, filesystem protection, operator authority and RPC lifetime checks retain their own boundaries. Desired values don't update mounted services or running task policy. Save/future-default selection, model selection, mode changes and overlay Apply have independent capabilities.

Agent-scoped skills expose metadata and load bodies lazily, preserving non-DSMM ancestor winners. Standard model calls use native prepared calls. The minimal public Pi-AI completions seam supports raw/custom and stop-only parameters for self-contained literal or explicit model-mapping configurations. Catalog-backed raw combinations that can't be reliably reproduced are rejected for both native and DSMM parameter sources; standard calls and native effort encoding remain unchanged.

Native call views show the target in collapsed rows, distinguish requested from actual identity, and retain that distinction for partial output, failure, interruption and current-format replay/PTC. Child labels use `Coding: task description`.

## Remaining capability boundaries

| Capability | Current behavior | Requirement for broader support |
| --- | --- | --- |
| Live overlay Apply | Unavailable. Save/select a future default for a new session; ordinary model and mode actions retain independent capabilities. | Exact configuration/call/approval binding without cross-call authority reuse. See [approval boundaries](deferred-native-approval-risk.md). |
| Running-call background handoff | Unavailable. Select waiting or native parent delivery before starting; don't restart a task to simulate transfer. | A supported same-activation ownership/delivery handoff. |
| DSMM cold resume | Refuses execution without trusted live admission and preserves history. Display metadata can't restore authority. | Native identity and trustworthy configuration/permission binding across close/reopen and record loss. |
| Non-disruptive hot update | No uninterrupted live-session guarantee. Retire admissions and let native owners cancel/dispose owned work; guards remain fail-closed. | Native lifecycle support that preserves active task/approval boundaries. |
| Catalog-backed raw combinations | Rejected where the complete composition can't be reliably reproduced, regardless of native or DSMM parameter source. Standard calls aren't affected. | A public seam that can reproduce the full catalog composition and preserve native capability/effort semantics. |
| Repeated read-only Git approval | Keep native approval; don't expand Allow rules based on an unexplained prompt. | Exact triggering command, working directory and approval reason. |
| Shell Fake-IP access | Rejection source remains unknown; don't guess a sandbox or permission change. | Concrete command/error/runner evidence identifying the actual rejection layer. See [network boundaries](web-fetch-fakeip.md). |
| External LSP | DSMM automatic mounting isn't delivered. DSH native definition/references/implementation/hover and independently configured MCP remain separate. | Supported APIs and explicit permissions for additional operations; no automatic external remount or scope expansion. |

Search/Fetch retain the explicitly configured native provider. DSMM doesn't automatically enable a direct API, change credentials or forward the recent human question. HTTP Fake-IP behavior and network limits are maintained in [Fake-IP fetch](web-fetch-fakeip.md).

## Publication and Desktop installation

0.3.1 publication uses the version-bound [release controls](releasing.md). Desktop plugin installation follows publication, uses the Desktop-owned carrier and requires exact DSH `0.2.1-rc.2`. Installation doesn't authorize upgrading the Host, changing credentials or real sessions, altering unrelated configuration, or restarting active work. An incompatible Host or required data migration blocks installation rather than expanding its scope.
