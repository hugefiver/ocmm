# DSMM roadmap

Current follow-up: 2026-10-16. The supported DSH integration target remains `0.2.0-rc.2`. The manifest remains at published DSMM `0.2.2`; the current source changes aren't a new release or evidence of acceptance in an installed Desktop.

## Delivery boundary

Implement features supported by rc.2 without requiring a Host upgrade. A demonstrated interface or implementation blocker may be deferred with its acceptance criteria. Deferred work isn't delivered functionality, and an upstream release note isn't runtime verification. Installing a prerelease, changing Host code or widening permissions requires separate authorization.

The source includes native-only cold runtime selection, Plugins bundle configuration drawers, managed identity and delegation call presentation, generic model routing, named Profiles and captured-child controls. The [README](../README.md) describes those contracts; this roadmap tracks remaining acceptance and blocked work rather than treating implemented basics as future milestones.

## Prerelease reference

As of 2026-10-16, the npm `@deepseek-ai/dsh` `alpha` tag selects **`0.2.1-alpha.4`**, published on 2026-10-15 at 13:08 UTC. The `latest` and `next` tags still select `0.2.0-rc.2`. The GitHub prerelease [`dsh-v0.2.1-alpha.4`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.4), published at 13:40 UTC, points to commit [`86a402200d95fecef4529d969836f1fe13c6cb0d`](https://github.com/deepseek-ai/deepseek-harness/commit/86a402200d95fecef4529d969836f1fe13c6cb0d).

The same source declares Desktop version `0.2.1-alpha.4`, but that GitHub release has no attached assets; the manifest alone doesn't establish an available Desktop installer. The SDK client and JSON-RPC server packages also publish an `alpha` version of `0.2.1-alpha.4`. These are investigation candidates, not DSMM's supported runtime baseline.

Sources: [CLI registry metadata](https://registry.npmjs.org/@deepseek-ai%2fdsh), [Desktop manifest](https://github.com/deepseek-ai/deepseek-harness/blob/86a402200d95fecef4529d969836f1fe13c6cb0d/apps/desktop/package.json), [SDK client metadata](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-client), [SDK server metadata](https://registry.npmjs.org/@deepseek-ai%2fdsh-sdk-jsonrpc-server).

## Remaining work and resumption criteria

| Direction | Current disposition | Acceptance or evidence needed |
| --- | --- | --- |
| Default optional managed runtime | Native Main `runtime.enabled` is strict boolean, default true; cold startup selects the automatic managed owner or official stock owner. A save records desired state without replacing or cancelling the running owner. | Complete integrated packed-artifact and installed-UI acceptance. Runtime binding and delivery-fence readiness don't establish persistence compatibility. Real permission changes still revoke stale authority. |
| Zero-configuration delegation with stock JSONL | Deferred. A root response isn't proof of child execution; the first DSMM child delegation remains blocked with stock persistence. Explicit compatible Main `sessionPersistence` remains required. | Evaluate the official PluginRecord route below without replacing the storage owner or bypassing metadata admission. A Host upgrade alone isn't a fix. |
| Broader plugin hot-change/restart integration | Deferred enhancement, not a prerequisite for cold selection. | [alpha.3 notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.3) describe immediate hot-reloadable changes and restart prompts for other changes. No reusable pre-dispose or cold-composition SDK hook is verified. Identify a supported interface, then compare rc.2/alpha.4 owner disposal, pending work and restart behavior in isolated profiles. |
| Unified configuration drawers | Source registers only `plugins.bundle.config`; named Profiles keeps its Settings/header entries. | Verify actual native Plugins navigation, scope/form authority, drafts and save outcomes in the packed candidate. alpha.4's custom plugin index isn't evidence of a new Drawer or configuration-lifecycle API. |
| Managed identity and invocation presentation | Source uses Agent-scoped `harness:identity` and native call-view slots. Ordinary native identity remains unchanged. | Verify assembled requests and pending/completed/replayed views, requested versus validated actual metadata, inspectable nontext JSON and windowless native fallback. rc.2 already provides the relevant identity/presentation interfaces; these aren't prerelease additions. |
| Repeated approval for read-only Git | Awaiting an exact triggering call; cause unknown. | Obtain the tool, full command, working directory, escalation parameters and approval reason, then reproduce with isolated native registrations. No alpha.4 evidence establishes a trusted shell-read fix. Don't widen Allow rules to suppress the symptom. |
| Pending one-shot approval across parent profile epoch changes | Deferred under the [accepted P1 native-approval risk](deferred-native-approval-risk.md); still not fixed. | No verified alpha.4 fix. Its [SDK protocol documentation](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.4/packages/sdk/protocol/README.md) describes server-to-client requests as transport groundwork for future approval flows. A supported solution must pass pending Allow, epoch-change, cancellation, cleanup and authority-boundary checks without real credentials. |
| Release and installed-carrier acceptance | Current source changes are unpublished; no version bump or Desktop acceptance is implied. | Apply the [release contract](releasing.md) to a separately authorized identity and report npm publication and GitHub Release status independently. Historical `0.2.2` runs can't receive a new completion interpretation. |

Prerelease evaluation must use disposable profiles and existing authorized tooling. Preserve the current installation, credentials, history and immutable release identities. Package availability, source-level interface discovery and successful isolated behavior are separate evidence levels.

## Stock JSONL delegation: alpha.4 migration candidate

The blocker isn't a blanket inability of native JSONL to retain extension records. Both rc.2 and alpha.4 preserve unknown records marked `ignorable: true`. DSMM's current `assertDsmmMetadataPersistence` additionally requires its `DSMM_PERSISTENCE_COMPATIBILITY` marker; the companion owns the event/handle adaptation for `deepwork/mode` and `dsmm/role-policy`. Stock persistence doesn't satisfy that DSMM contract. Upgrading DSH doesn't change the guard or DSMM's readers and writers.

alpha.4 adds the experimental public `appendPluginRecord(session, type, data)`, `pluginRecordOf(event)` and `PluginRecordMap` APIs. They provide namespaced `plugin:` records that are ignorable and excluded from the model-visible surface; the plugin remains responsible for validating its JSON payload. This is a candidate way to store DSMM metadata through the official persistence owner, not a verified DSMM implementation, a general storage hook or permission to mark arbitrary required events compatible.

Resume only after an isolated implementation demonstrates all of the following:

- Normal `runProfile` with stock JSONL completes real DSMM child delegation without additional persistence configuration.
- Plugin metadata survives append, close/reopen, fork and restore while remaining outside model-visible messages.
- Missing, malformed and older payloads retain conservative admission; parent/child identity, permission and lifecycle boundaries remain intact.
- The explicit companion and retained-history paths remain covered, without automatic migration, storage-root/compression changes or rewriting user history.

Official evidence: [alpha.4 session API](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.4/packages/core/session/src/index.ts), [record types](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.4/packages/core/session/src/types.ts), [plugin-record behavior tests](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.4/packages/core/session/tests/plugin-records.spec.ts), [JSONL admission tests](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.4/packages/session/session-persistence-jsonl/tests/current-event-admission.spec.ts), and [persistence contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.4/packages/session/session-persistence/README.md). Source/API inspection is available; a DSMM migration using these APIs hasn't been executed or validated.

## Longer-term capability policy

Reusable global/profile/role-scoped capability policies remain a future design, distinct from the implemented configuration drawers and role-sized native defaults. Any new policy must bind to inspected Host services, distinguish role-owned rows from inherited child composition, preserve caller/read-only/tool/delegation filters and avoid remounting admitted roots. rc.2 isn't claimed to support preset `extends` or automatic standard inheritance. New schema, authority or public APIs require their own approved scope.

DSMM-managed external LSP remains off and has no scheduled delivery here. Its implementation and interfaces remain available for the required independent release checks, not as an automatic activation entry. DSH's own LSP and independently configured MCP are unaffected; see [LSP boundary](lsp.md).
