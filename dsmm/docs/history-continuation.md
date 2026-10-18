# Historical browsing and explicit continuation

## Supported Host

The project-managed activation layer uses five patches in `patches/dsh-session-activation/`: Session Controller, AgentLoop, session persistence, JSONL persistence, and the preset registry. The original installed Desktop is not changed by these patches and is not a supported continuation Host merely because its package versions match.

The patched registry returns an `AgentPresetScopeLease` with synchronous `assertCurrent()`. DSMM calls it through the candidate admission fence before writing, during locked inspection, and after all asynchronous created handlers before driver release. Unregister immediately invalidates current authority even while a revision remains retained; replacement and lease disposal also invalidate the assertion. The additive hook does not cancel existing Agents or alter ordinary retain/dispose behavior. A lease without this capability makes history continuation explicitly unsupported.

Apply the native configuration **before constructing the services or restoring configured sessions**:

```ts
import { DSMM_HISTORY_HOST_CONFIG } from "@dsmm/dsmm";

// Merge into the respective native plugin configurations.
DSMM_HISTORY_HOST_CONFIG.agentLoop;
// { activationAdmissionRequired: true }
DSMM_HISTORY_HOST_CONFIG.sessionController;
// { activateOnFollow: false }
```

`cordis.patch.yml` targets the native entry IDs `agent-loop` and `api-session-controller`. A Host using different entry IDs must adapt those selectors to its own composition before startup. Missing patches, an activating follow configuration, a missing activation guard, or a backend without locked write admission makes continuation unavailable. DSMM requires activation admission before its asynchronous configuration loading; native startup configuration also covers restores that precede DSMM loading.

The Core registers the `dsmmHistory` RPC service with the independent Typert contribution identity `@dsmm/dsmm-history`. This is a protocol registration identity, not an additional npm dependency. Native list/page/follow and presentation remain the only history transport.

## Current authority

Preview explicitly selects a current preset and either the current deployment baseline (`profileId: null`) or a saved profile. It does not recover authorization from historical session selection files, admission epochs, role-policy records, approval outcomes, or temporary grants. A new admission epoch and immutable configuration candidate belong to the exact native activation.

The candidate captures the current deployment, saved-profile source, native preset revision, model availability, permission source, operator connection, owner, persistence identity, and inspected durable prefix. A changed candidate or prefix requires another preview and confirmation. The operator must confirm the stored pending input and, when applicable, native migration. Pending input is processed by the existing inbox once; it is not resubmitted as a new prompt.

Unpublished setup installs current native sandbox/approval policy and DSMM configuration registrations. Historical read-only sandbox or known read-only DSMM role ceilings and native `never` approval ceilings remain restrictive. The exact `agent/created` correlation finishes live-only role-tool binding and publishes the prepared admission. The native final admission check precedes driver release. Ordinary Controller claims cannot join an initializing activation.

A continued historical Agent is not a blank configuration target. Historical selection records remain metadata; they are not replaced to manufacture current authorization. The live admitted configuration is reported separately from persisted selection metadata.

Initialization failure preserves the existing inbox and historical catalog entry. Native writers may already have committed legitimate closers or setup records before a later failure. `storageEffects: "may-have-committed"` is not a rollback receipt. DSMM mode observations use the native ignorable plugin-record format so unloading Core does not make them unreadable.

## Client integration contract

Register `HISTORY_REMOTE` from `src/history-remote.ts` with the Client Typert registry. Create `HistoryContinuationController` from `src/client/history-controller.ts`, then bind it to the current `dsmmHistory` remote, a fresh object representing the exact Host connection generation, and the selected native session ID. Mount `HistoryContinuation` from `src/client/HistoryContinuation.tsx`; its English and Chinese strings are independent of existing page locales.

Before opening native history, obtain a successful status for that same connection and session and require `historyBrowsingAllowed(controller.snapshot())`. An absent service, unsupported Host, failed capability check, or replaced connection must not fall through to native follow. Listing and a capability query do not require retaining a conversation.

The native public `ctx.sessions.retain(target, options)` opens history before a conversation slot mounts. Native reconnect handling can also rebuild an already-open window. Therefore, adding a continuation slot alone is **not** a pre-follow gate. Fence initial retains and reconnect-driven reopening in the owning Client integration. The exported native `SessionEventStream` in `@deepseek-ai/dsh-api-session-controller/client` constructs `remote.session.follow`; `ISessions` does not provide a DSMM-specific pre-follow admission hook. An integration that cannot fence these entry points must not mount/retain native history against an unsupported Host.

Keep native history rendering and address/lineage handling. Do not create a second reader or runtime. Disable new prompt submission while continuation requires authorization or is initializing; after a successful receipt for the same connection/session, submit subsequent user input through the existing native prompt path. A lost or stale receipt is not permission to blindly retry confirmation or replay a prompt.
