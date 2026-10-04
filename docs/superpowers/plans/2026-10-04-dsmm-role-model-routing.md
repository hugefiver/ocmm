# DSMM native role routing, system migration, and 0.1.1

## Approved outcome and boundaries

The user authorized autonomous Deepwork implementation and explicitly requested “对齐功能之后发布0.1.1版本”. Deliver native per-role provider/model/reasoning-effort selection and role-aware fallbacks, align the relevant DSMM feature documentation with ocmm intent, migrate the existing system DSH Desktop profile from its current OpenCode/ocmm model configuration, and publish `@dsmm/dsmm@0.1.1` after verification. Development planning/implementation/review uses the requested high-rigor `gpt-6.1-sol` lane; that is **not** the target system's model mapping.

The existing scoped 0.1.0 publication is immutable: commit `df492ddb01beed1c5fae30e5687b9bffca432946`, tag `dsmm-scoped-v0.1.0`. Use a new release identity, `dsmm-scoped-v0.1.1`; never repair an old tag, registry version, or asset in place. The root agent owns Git, publication, profile changes, credentials, and final acceptance. Implementation agents receive bounded source/test/doc ownership and perform none of those external writes.

Scope is native equivalent behavior for the named roles, routing/recovery, existing workflow, guards, skills, and optional LSP, not an OpenCode compatibility layer or a claim that every hook has a DSH equivalent. Do not change root ocmm schemas, prompts, generated Codex bundles, release lanes, or LSP versions. Do not port OpenCode session history. Preserve dirty user files and `output_test/`, UI/login settings, existing native account availability, read-only boundaries, and host retry/cancellation/permission/depth ownership.

## Relevant evidence and current seams

- `dsmm/src/settings.ts` has restart-scoped native Loader schemas and resolution, boolean `roles`, and a global `runtimeRecovery` list containing provider/model only. Both recovery and continuation default off. There is no role-route API.
- `dsmm/src/roles.ts` centralizes native preset rows, static mirrors, personas, and fixed role tool composition. `roleSubagentConfig()` intentionally uses `modelSelectionSettings:false`, one-shot foreground operation, and read-only allow filters. Enabling dynamic model selection in standing presets can remount tools inside children and bypass inherited restrictions.
- `dsmm/src/preset-registry.ts` programmatically registers active presets and separately reconciles Agent-scoped guards on creation, tool changes, blank preset switches, and disposal. Ordinary profile patches do not override these programmatic definitions. `role-subagents.ts` mounts equivalent native role tools in headless top-level Agent scopes, excluding children.
- `dsmm/src/model-routing.ts` is **legacy exact-route DeepSeek calibration**, not model assignment. Its max-to-high negotiation is legacy behavior; keep it unchanged for requests outside the new explicit policy. New explicit `max` must not use that degradation path.
- `dsmm/src/runtime-recovery.ts` and `recovery-policy.ts` own host-first request-error evaluation, durable attempted-route folding, bounded selection, per-Agent pending/reservation fences, and opt-in durable-work continuation. Current fallback replaces the route and clears effort. Extend this controller rather than adding a second dispatcher.
- `session-scope.ts` resolves the selected preset from events/header. Native spawned children inherit their parent's preset: this is **not child-role identity**. `status.ts` reports the actual persisted request header where available and defensively copies settings; extend both reporting and copying.
- Relevant regression suites: `settings`, `roles`, `agent-presets`, `preset-registry`, `role-subagents`, `session-scope`, `model-routing`, `native-model-routing`, `recovery-policy`, `runtime-recovery`, `runtime-recovery-types`, `status`, `native-preset-security`, `native-runtime-contract`, `package`, `release-readiness`, and Docker smoke.
- `docs/superpowers/plans/2026-10-04-system-dsh-configuration.md` records the current profile, sanitized source model intent, credential APIs, and Desktop carrier restrictions. Its older absence of role-routing capability is what this implementation closes; its safety boundaries still apply.

Native contracts were read from the pinned `output_test/dsmm-dsh-20261003/runtime/node_modules/@deepseek-ai/` runtime, version `0.2.0-rc.2`:

1. `dsh-tool-subagent/lib/index.js` and `lib/types/index.d.ts`: configured `agentOptions:{provider,model,reasoningEffort?}` work with `modelSelectionSettings:false`. Native preflight uses the live Agent's `llm.resolveCallConfig`, validates the exact route/effort, and forwards the caller signal. Changing a route without effort clears incompatible parent effort.
2. `dsh-subagent/lib/types/types.d.ts` and exported `SubagentRuntime`: public `registerProvider(provider)`, `getProvider(name)`, and `SubagentProvider.start(ResolvedSubagentStartRequest)` support trusted provider composition. Native capability validation, catalog publication, returned run ownership, and cancellation remain native.
3. `dsh-subagent/lib/types/descriptor.d.ts`/`.js`: native `subagent/descriptor` version 3 has a trusted `provider` string. It is model-hidden and compaction-durable. The first descriptor is authoritative; `foldSubagentDescriptor()` validates supported payloads. One-shot descriptors contain no resumable route/persona composition.
4. `dsh-subagent-spawn-in-process/lib/index.js` forwards to the native in-process driver. That driver's native child setup composes the parent's preset and child persona/filter, and appends the resolved descriptor inside the initial turn before the first request. No DSMM replacement child loop is needed.
5. `dsh-agent-loop/lib/index.js` prepares proposals through `agent/request`, validates/prepares the final call, and persists canonical request headers. Native host selection can itself contribute a request policy; a preset's model-default service row alone is not proof of routing.

The gateway-contract lane reports offline installed pi-ai payload evidence: `hoo` uses `anthropic-messages`; `compat.forceAdaptiveThinking:true` plus exact `reasoningEfforts:{high:'high',max:'max'}` produces adaptive thinking and distinct `output_config.effort` values for GLM/Pro/Flash. Without that compatibility option high and max collapse into the same fixed budget. Source hoo's baseURL ends in `/v1`: its AI SDK appends `/messages`, while native pi appends `/v1/messages`. Remove **only the terminal `/v1`** for native hoo, preserving effective origin/path by offline equality tests; copying the source endpoint unchanged duplicates `/v1/v1/messages`. Native pi adds its standard `?beta=true` and summarized adaptive display, which still require actual gateway acceptance. `apai`'s actual OpenCode SDK transport is Responses, so use native `openai-responses` and preserve that source baseURL unchanged. This is transport evidence, not a completed authenticated real-model or image-capability test. Keep credentials/endpoints out of public receipts.

## Public configuration and semantics

Add a separate map; preserve boolean `roles` and stable role/tool/Loader IDs:

```ts
interface DsmmModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string; // native adapter-owned ID; no ocmm variant translation
}

interface DsmmRoleRoutingConfig {
  primary?: DsmmModelRoute;
  fallbackRoutes?: DsmmModelRoute[];
}

// Add to DsmmPluginConfig and normalized DsmmSettings:
roleRouting: Partial<Record<DsmmRoleId, DsmmRoleRoutingConfig>>;
```

Plugin input remains optional; normalized default is `{}`. Extend the existing public `DsmmRecoveryRoute` with optional `reasoningEffort` using a shared compatible route shape. Export the new types from `src/index.ts`. Update both DSMM schemas, resolution, and status copies; the unrelated root `schema.json` does not change.

Validation is fail-closed for **new explicit routing**: nonempty trimmed provider/model are supplied together, named effort is nonempty, role keys are canonical, and malformed/incomplete primaries or chain entries are rejected rather than silently replaced by inheritance. Deep-copy normalized routes, preserve fallback order, and deduplicate by provider/model identity so changing effort cannot create unlimited retries. Keep existing legacy global normalization behavior compatible. Disabled-role configuration may be retained for future enablement but must not register a tool/preset or apply policy.

Policy rulings:

- An absent role entry/primary leaves native selection/inheritance alone. No baked-in hoo provider or development-agent model becomes a package default.
- A present `primary` is an explicitly configured **fixed role policy**, authoritative while that role applies. Users who want a different native session route edit/remove the policy; do not invent a heuristic to distinguish an inherited effort from a user effort by inspecting its string value.
- Apply the primary to direct-selected native DSMM roles, trusted role-tool children, and an active top-level deepwork session without a DSMM preset as `dsmm-orchestrator`. An unrecognized child never becomes its parent's role. Resolve actual live/selected preset events for top-level blank switches. Out-of-scope, unconfigured, or disabled roles receive no new policy.
- A configured named primary/fallback effort is exact. Preserve it through legacy `auto` and `strict` calibration; unsupported effort/route fails visibly through native validation, with no max-to-high coercion. When a changed route omits effort, clear incompatible inherited effort and use native adapter defaults. Omission does not mean the string `off`.
- Existing `runtimeRecovery.enabled` remains the sole recovery gate. For a known role, an explicitly present `fallbackRoutes` list takes precedence over the global list; `[]` suppresses global fallback. A missing role chain inherits the existing global list only when recovery is enabled. No new retry statuses/codes or continuation defaults are implied.
- An admitted pending fallback, already persisted role-chain selection, or host-owned durable route change must not be overwritten by primary selection on another request. Retain current step/turn fencing and host-first decisions. Implement the smallest evidence-backed ordering/resolution that satisfies the invariant; final persisted request headers, not middleware intermediate snapshots, are the acceptance authority.

### Trusted child identity without custom sessions

Register effect-owned provider aliases such as `dsmm-role-reviewer` for each enabled delegated role using native `subagents.registerProvider()`. Each alias exposes the supported native spawn capabilities/inheritance description and forwards `start(request)` **unchanged**, including `request.descriptor`, to the live supported native `spawn` provider's `start`. It must not call `subagents.start('spawn', ...)` again, which would replace the descriptor identity, or clone/run/dispose the returned child itself.

Set the role's native tool `provider` to its alias and keep fixed `agentOptions`, `modelSelectionSettings:false`, persona, depth policy, foreground one-shot behavior, and read-only filter. Native outer start snapshots the alias in the descriptor and retains all lifecycle ownership. At request/recovery/status time, use native `foldSubagentDescriptor()` on child-owned events and an exact known alias-to-canonical-role table. Do not infer roles from prompt/persona/description text, parent preset, shared current-role state, or timing. Missing/unknown/malformed child evidence never grants another role's fallback.

Aliases remain one-shot: do not expose `prepareContinuable` or claim a terminal one-shot child can cold-resume. Identity must be reconstructable from persisted child events after plugin/process reload without a WeakMap or live parent. Native current-version malformed descriptors are diagnostics, not permission to guess. Preserve accepted native runs on alias disposal/replacement; new starts must fail cleanly if the underlying spawn capability is absent or changes incompatibly.

## System target mapping

Configure these values in the **system profile**, not package defaults:

| DSMM role | Primary / effort | Ordered fallback / effort |
| --- | --- | --- |
| orchestrator | `hoo/glm-5.3`, high | `hoo/deepseek-v4-pro`, high |
| reviewer, planner, clarifier | `hoo/glm-5.3`, max | `hoo/deepseek-v4-pro`, max |
| plan-critic | `hoo/glm-5.3`, max | `hoo/deepseek-v4.1-flash`, max |
| doc-search, code-search | `hoo/deepseek-v4.1-flash`, high | `[]` |
| oracle | `hoo/deepseek-v4.1-flash`, max | `[]` |
| media-reader | `hoo/doubao-seed-2.1-turbo`, no named effort | `[]` |
| builder | disabled | no callable tool/preset |
| oracle-2nd, creative, other unconfigured roles | inherit | no invented role chain |

Source `explore` is an alias of code-search; map that intent to the canonical `dsmm-code-search` route/persona/tool, not a separate model policy or an unimplemented role name. Do not add a new public role or expose a duplicate alias tool merely to reproduce a source label.

The profile keeps `defaultActive:true`, uses risk-based workflow, and explicitly sets `runtimeRecovery.enabled:true`, `fallbackRoutes:[]`, and `idleContinuation.enabled:false`. This is a deliberate change from its current recovery-off posture to enable **only** configured role chains. Preserve the existing native account route/service and UI preferences rather than rewriting login/default UI settings.

Provider migration uses native pi-ai route config and credential references, with the hoo terminal-path normalization described above and no corresponding apai rewrite. Store new hoo/apai keys using `credentialRef`/`ctx.credentials.set` after checking `describe`, never literal secret headers or committed keys. Source model limits/modalities must stay evidence-based: GLM is text, Flash has source text+image, and source custom-model defaults make Pro text-only when modalities are omitted. The discovered media model needs its actual image/default-effort capabilities checked; its source catalog has only older 2.0 variants, whose limits/modalities must not be copied onto the 2.1 ID. Do not replace media's model or invent max support.

## Bounded waves and ownership

### Wave 1 — Cohesive routing/recovery core

Core implementer owns `dsmm/src/settings.ts`, `roles.ts`, `preset-registry.ts`, `role-subagents.ts`, `session-scope.ts`, `runtime-recovery.ts`, `recovery-policy.ts`, `model-routing.ts`, `status.ts`, `dsh-types.ts`, `index.ts`, and small new modules for shared role policy/provider registration if useful. They also own the smallest direct dependency/peer additions needed by public native imports, pinned to `0.2.0-rc.2`, and matching readiness dependency inventory changes. `dsh-tool-subagent` already imports native `dsh-subagent`; declare the latter correctly if directly consumed, but do not install speculative dependencies or reintroduce the old unpublished `dsh-type-meta` peer-graph problem recorded by the DSH migration. A clean packed install must prove new peer resolution. No unrelated root dependencies or schema changes.

Implement the public map, fixed native tool options, direct/top-level request policy, native alias registration/descriptor resolution, effort-aware role fallback, and sanitized status. Thread the same resolved config through native registry/headless/materialized output; avoid a profile-YAML-only implementation. Keep read-only reconciliation unchanged unless a proven narrow adjustment is necessary. Resolve primary/recovery ownership together, so two workers do not independently change request ordering.

Observable end state: deterministic native tool configurations and top-level role policy select the exact configured model; disabled/unconfigured roles are inert; admitted fallbacks retain exact effort; default configs preserve prior behavior. Regenerate `dsmm/lib` with TypeScript and role assets with `node dsmm/scripts/generate-role-assets.mjs`, never edit generated files by hand. Freeze exported shape/helpers before handing parallel test/doc work off; executors are not alone and must preserve other edits.

### Wave 2 — Independent tests, docs, and integrated verification

Test owner owns `dsmm/test/**` and narrowly scoped verification-script improvements; they consume the Wave 1 interface and do not modify core source. Doc owner owns `dsmm/README.md`, `dsmm/docs/{model-routing,runtime-recovery,settings-status,agent-presets,migration-from-ocmm,compatibility,roadmap,releasing}.md` and an optional sanitized example patch. They describe the fixed policy, schema, opt-in gate, exact effort failure, native identity, limitations, and migration; no speculative all-hook parity. Coordinator owns version bump/package release identity updates and lock regeneration when necessary, avoiding conflicts with the core owner's peer inventory.

Required deterministic regression evidence:

- Schema/type/resolution round trips, absent versus empty chains, incomplete-route rejection, input-copy isolation, disabled-but-retained config, route/effort dedupe, and exported types.
- Native preset/headless parity and static mirrors: fixed route/effort reaches `agentOptions`; dynamic model selection remains false; disabled builder disappears; optional media tools remain capability-gated.
- Trusted sibling role separation under an orchestrator parent, unknown children and ordinary sessions untouched, blank selected-role switches, descriptor identity after serialization/reconstruction/compaction, spoofed persona/description ignored, and alias/provider teardown/replacement behavior.
- Direct-selected/top-level/child exact request routes; primary cannot reset admitted fallback; host-owned retry/durable route decisions win; role chain beats global, empty suppresses it, missing preserves legacy semantics; cancellation, stale steps, duplicate errors, exhaustion, disposal, and two simultaneous Agents retain existing fences.
- Named fallback effort is preserved, omitted effort clears incompatible primary effort, unsupported explicit max rejects without high substitution, and legacy calibration outside explicit policies stays unchanged. Assert actual final native request headers.
- Existing real native read-only tests still deny write/edit/shell/delegation on direct selection and native children, including model-routed children. Route changes must not widen tools or permissions. Status reports effective role/policy/chain separately from actual current route and defensively copies new nested settings.

Use pinned native Cordis/SubagentRuntime/Session/LLM fixtures for alias/descriptor/final-header behavior, not only mocks or text assertions. Run package typecheck, test typecheck, full test/build/readiness and complete existing Docker smoke. Review the diff independently before release; concrete blockers are fixed or escalated, not ignored because tests pass.

Package checks: `pnpm --dir dsmm typecheck:test`, `pnpm --dir dsmm test`, `pnpm --dir dsmm build`, `pnpm --dir dsmm check:release`, and `pnpm --dir dsmm smoke:docker`. Root AGENTS additionally requires `pnpm run typecheck`, `pnpm test`, and `pnpm run build` before commit. Preserve existing LSP PIDs `24680`/`36780` and locked binaries: if necessary use the established isolated root-build copy with identical selected inputs and accurately report that boundary. Never traverse/delete its `node_modules` junction to the real repository.

### Wave 3 — Candidate system composition and frozen artifact evidence

Coordinator/integration owner prepares a reversible isolated profile candidate from known exact source files, without printing credentials. Validate native pi-ai model metadata/transport, credential-reference lookup, all target mappings, unchanged UI/account rows, and exact effort semantics. Use native route validation and bounded paid calls on the intended hoo model, plus a read-only delegated role on a deliberately different configured route. Prove high/max payload distinction using sanitized native evidence; model discovery alone does not prove wire semantics. Media requires actual image-input capability evidence, not only catalog membership.

Use a deterministic local native failure fixture for role fallback, counts, efforts, and cancellation; avoid inducing repeated paid provider failures. Live gateway smoke proves authenticated transport/real-model response separately. Existing smoke options only test inherited Flash and cannot certify new role routing without extending/adding a narrow route-aware probe.

After reviewed implementation and all required checks pass, the root agent may commit only authorized task files, bumping to 0.1.1 in the selected release commit and regenerating version-sensitive artifacts as required. Pack once from that exact tested commit to `dsmm-dsmm-0.1.1.tgz`, inspect the archive/readiness receipt, freeze SHA256 plus npm-compatible integrity, and run the final real-model/delegation smoke against **that file**. Receipt `packedSha256` must match; rehash immediately before publication and never repack after final smoke.

### Wave 4 — Immutable scoped 0.1.1 publication

Root agent alone rechecks authenticated npm organization access, absence/identity of `@dsmm/dsmm@0.1.1`, and remote `dsmm-scoped-v0.1.1`. Use the existing maintainer-authenticated bootstrap, not the unrelated root workflow or invented Trusted Publishing. Publish the frozen reviewed tarball with public access and create the new tag/GitHub Release with the identical tarball and `SHA256SUMS.txt`.

Completion binds tag's peeled commit, exact scoped package/version, npm dist integrity/downloaded artifact bytes, frozen tarball SHA256, downloaded GitHub asset/checksum bytes, and a fresh isolated exact registry-installed profile successfully resolving both package exports and composing stable `id: dsmm`. A command printing Done, local readiness, workflow result, or root ocmm completion checker is insufficient. Any partial publication is reported; do not overwrite assets/version or move the tag. Use a separately authorized new version or precise recovery instruction for a defect after publication.

### Wave 5 — System Desktop cutover and honest host acceptance

Root agent rechecks the app is fully quit before package management; do not terminate a preexisting/newly user-used app. Take local recoverable snapshots of exact Desktop manifest/lock/patch targets and compare for concurrent changes immediately before writes. Use only the official installed carrier `C:/Users/hugefiver/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd` to install exact `@dsmm/dsmm@0.1.1` into `desktop`, then apply the validated provider/role configuration while preserving other rows. The ordinary npm DSH CLI cannot manage Desktop; even the official carrier cannot boot/dump Desktop. Never fabricate another profile as Desktop execution proof.

Verify the carrier terminates successfully, installed version/integrity and exactly one selected scoped bundle, native Loader-visible config/role inventory, configured model/effort and disabled builder, UI/account preservation, and a fresh **actual Electron host** using supported authorized access. No unauthenticated ad hoc RPC or policy bypass. If native host authentication/launch access is unavailable, system disk configuration and isolated real-model proof may complete, but report actual Desktop host activation/session validation as pending rather than claiming equivalence. Preserve UI/login records and ask only for the user action that tools cannot safely perform.

Rollback restores only task-changed profile entries/dependency selections with concurrent edits respected. Newly created credential refs may be removed only through native APIs and only if still task-owned/unchanged; never restore a whole stale credential file over refreshed login records. Do not remove existing `output_test`, old release evidence, broad temp roots, or user sessions. Cleanup targets must be exact, task-owned, validated paths.

## Acceptance and risks to carry into review

End-to-end acceptance requires the public policy working on real native direct/headless/delegated surfaces, exact target role/effort/fallback intent in the candidate/system profile, unchanged safety/host ownership, verified immutable 0.1.1 publication, and separately stated actual Desktop activation evidence. Release and system-host status are separate outcomes.

The material risks are primary policy resetting fallback or fighting native host selection, mistaking parent preset for child identity, same-scope tool remounts weakening read-only filters, exact max being silently degraded by legacy calibration/provider transport, missing media image capability, stale credential/profile restoration, and irreversible partial publication. Tests/evidence above target those seams. No plan step authorizes a workaround that changes those guarantees.

The orchestrator owns blocker-focused plan criticism before implementation. This planner does not dispatch a critic or implement. Incidental file boundaries/algorithms may use an evidence-backed equivalent, but public semantics, target models, permission/data guarantees, host ownership, and immutable release identity require escalation for a material change.
