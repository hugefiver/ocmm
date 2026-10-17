# DSMM native parity and integration acceptance

## Required outcome

Provide the complete applicable OCMM workflow, role and resource behavior through DSH-native services, without an OpenCode hook compatibility layer. The integration baseline is DSH `0.2.0-rc.2`, official tag `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84`. No floating latest/alpha upgrade is implied.

Current source contracts are maintained in [DSMM architecture](../../../dsmm/docs/design.md), [configuration](../../../dsmm/docs/settings-status.md), [Profiles](../../../dsmm/docs/profiles.md), [Agent authority](../../../dsmm/docs/agent-presets.md), [routing](../../../dsmm/docs/model-routing.md), [recovery](../../../dsmm/docs/runtime-recovery.md), [source synchronization](../../../dsmm/docs/skill-sync.md) and [client design](../../../dsmm/DESIGN.md). Those documents describe current interfaces; this plan retains the required integration acceptance, not an execution log or permission to repeat old installation/release steps.

## Product constraints

The canonical source inventory is 11 base roles, 11 categories and fourteen configurable lazy skills. Cross-cutting remains opt-in. Root eligibility, native delegation availability and model availability are separate. Planner remains read-only and returns complete Markdown for an authorized coordinator to persist. Role names, generated templates and catalog presence don't grant execution or prove independent review models.

Ordinary off-mode Agents receive no DSMM workflow or skill bodies. Deepwork activation exposes metadata and lazy loading, never a fulltext fallback. Explicit off wins over DW preset defaults while retaining persona, captured read-only/tool restrictions and native approval. Agent-scoped discovery preserves non-DSMM ancestor winners; incomplete/aborted observations don't mean a project skill is absent. No recursive lookup, stale body delivery or invalidation-notification loop is allowed.

Configuration resolves defaults → sparse Global base → explicit native profile → immutable admitted named overlay. Global config is the DSMM convention `<resolvedDshHome>/plugins/dsmm/config.json`, not a mandated Host directory. Home resolution follows trusted explicit Host configuration, `DSH_HOME`, then the native default. Clients/models can't choose roots or another entry's identity.

Objects merge, arrays replace and explicit same-default/false/empty values remain pins. Unset changes only its layer. Global and native saves are independent, preserve untouched values and retain their own authority/version checks. Stat versions and snapshot references aren't configuration-content proofs. Native form CAS, selection CAS, admission epochs, child envelopes and release/resource integrity remain separate boundaries.

Startup captures mounted capability. New ordinary roots admit valid desired policy within that ceiling; existing roots, including blank ones, and their future children keep captured deployment. Idle profile Apply replaces only the permitted overlay on the old baseline, never the native root model or existing children. Named documents may be centrally shared, but selection/session state remains scoped to the exact native profile and DSMM entry. Exact legacy libraries remain read-only, without automatic copying, same-name fallback or history migration.

Core remains usable without a session and with Deepwork cold-off. Global-only `modules.deepwork.enabled`, native-only `runtime.enabled` and session mode are separate controls. Runtime selection is cold-only; Save doesn't remount, cancel work or queue a restart. Real owner/permission changes revoke stale authority. Compatible Main `sessionPersistence` remains required for durable DSMM child delegation; runtime readiness alone doesn't satisfy stock JSONL compatibility.

The deployment editor is the official Plugins DSMM bundle configuration, with module drawers and exact authorized native forms. Named Profiles keeps its Settings/header entries. Native operator identity, public loopback bind, Host writability, entry/form revision and final lifetime checks remain mandatory. Cookie, Origin, local carrier or client assertion isn't substitute authority. Inspection redacts secrets and private paths.

Native runtime owns spawn, continuable children, jobs, depth, cancellation, authentication, approval and storage. Captured child allow-lists intersect and deny-lists accumulate. Current direct-parent delivery authority is rechecked without rewriting original capture. Background handoff transfers the same run; accepted inbox delivery isn't completion. Routing uses generic native/model-parameter policy and exact configured invocation resources, without retired brand defaults. No second scheduler/retry dispatcher or synthetic lifecycle/task ID is introduced.

## Integration acceptance still required

The following outcomes must be demonstrated on the integrated candidate. Existing relevant evidence may be reused, but source checks, package checks and actual installed-carrier behavior aren't interchangeable.

- Exercise an isolated ordinary preset through off/on, metadata discovery, skill/reference loading, authorized delegation, child result/continuation and disposal. Run a second session to prove scope/admission isolation. Verify the DW preset and explicit-off reverse paths.
- Exercise cold-off Core, Global master Save, desired-on/restart-required state and an independent restart. A subsequent desired-off Save retains old parent/future-child capture while new ordinary roots honor the new ceiling. Runtime toggles don't cancel the current signal; mixed real permission changes still revoke stale authority.
- Prove two native profiles resolve Global → explicit override → named/session overlay while selection state stays separate. Dirty/conflicting/invalid saves retain drafts. Legacy reads create no files/locks and keep original immutable references; any import demonstration uses synthetic fixtures and preserves original bytes.
- Drive the actual official Plugins owner, not a standalone form, with real native Settings/Loader authority. Verify scope identity, sparse saves, pending modules, native command defaults/exact matching, missing forms, stale connections, denial and safe inspection. Profiles/header and delegation call views retain their separate roles; no duplicate Conversation configuration tabs are required.
- Verify ordinary root native provider/model/effort, the explicit admitted-revision model action, newer manual intent, child primary/fallback/level routes and bounded positively no-output-safe recovery. Partial output forbids replay. Capture and actual request-header route evidence remain distinguishable.
- Verify native read-only/target/caller/depth filters through useful allowed reads and denied writes/delegation, including alias, re-registration and cold-continuation paths. A displayed tool that the Host can't hide must still refuse unauthorized execution.
- Verify complete distribution from a cold source and actual packed candidate. Prepared resources and licenses must ship without checkout/global/private paths. Build/check stays offline; resource fetching requires explicit authorization and immutable pins. Generated resources change only through their owning generators.
- Verify applicable keyboard, focus, accessible naming/announcements, narrow/200% layouts, long English/Chinese text, light/dark and reduced-motion states at 375, 768 and 1280px. The bounded stable release browser receipt doesn't replace this broader matrix or actual Electron acceptance. Apply performance/React checks to the plugin surface without changing vendor UX/security or adding tools implicitly.
- Verify listener, provider, fiber, timer, child, job, browser and server cleanup on success and failure. Keep only useful requirement-to-evidence coverage; don't create fixed ledgers, arbitrary test quotas or repeated full-suite rituals.

## Carrier evidence and unresolved limits

The official Desktop shared-source reference is `0.2.1-alpha.1`, commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc`. Source compatibility, rc.2 native Web behavior and actual installed official Electron navigation/operator saves are distinct evidence. Community Desktop isn't the official acceptance surface. Missing authorized runtime conditions must remain an explicit unverified boundary, not a reason to omit required shared implementation or install software without permission.

The [roadmap](../../../dsmm/docs/roadmap.md) retains current alpha.4 commit/API evidence and resumption conditions. Zero-configuration stock JSONL child delegation remains deferred; unknown ignorable records are supported by native JSONL, but DSMM's current metadata contract isn't satisfied by stock ownership. Upgrading alone isn't a fix. Repeated read-only Git approval awaits the exact triggering call/reason. The accepted pending one-shot approval/parent-epoch P1 remains [unresolved](../../../dsmm/docs/deferred-native-approval-risk.md).

DSMM-managed external LSP remains off. Retained independent release checks don't make automatic mounting a delivered feature or certify an operator's executable environment.

## Verification and authorization

Use existing authorized tools and task-owned empty homes with both `DSH_HOME` and `DSH_AGENTS_HOME` isolated. Don't import user credentials, sessions, browser storage or private search roots. Native operator/Gateway fixtures may test real components without weakening production authentication. Real Desktop testing requires its own supported isolated carrier and authority; don't attach to a user window or patch the Host.

Coordinate DSMM typecheck/tests/build, source/resource generation and release readiness at integration boundaries. Root pre-commit typecheck/test/build gates remain mandatory for any separately authorized commit. Use relevant passing evidence only while its behavior/interface inputs remain covered. Report failed or unavailable checks; don't skip them, replace them with inventories or manufacture all-green claims.

This plan doesn't authorize Git writes, publication, software installation or changes to real user profiles. Current source changes aren't a new npm release or a Desktop acceptance receipt. [Release policy](../../../dsmm/docs/releasing.md) separately governs immutable publication and carrier rollout.
