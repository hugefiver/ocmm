# Deepwork Agent presets and child control

This guide describes built source behavior on the native DSH integration, not automatic availability in the published `@dsmm/dsmm@0.2.0` artifact. Native package composition and callable admission must both exist.

## Roles and composition

The canonical inventory is 11 base roles and 11 categories. Base roles are orchestrator, builder, reviewer, oracle, oracle-2nd, doc-search, code-search, planner, clarifier, plan-critic and media-reader. Categories are frontend, creative, hard-reasoning, research, quick, coding, normal-task, complex, deep, documenting and cross-cutting. IDs are `dsmm-<source-name>`; `explore` is a code-search compatibility alias, not another role. Cross-cutting defaults disabled; other canonical items default enabled.

Only Orchestrator and Builder (`primary`) and Planner (`all`) are root-eligible. Other roles are auxiliary-only (`subagent`), regardless of enablement. Native preset selection displays `DW …` labels under unchanged IDs. A role name is a responsibility, not a model choice or authority claim.

Native `agentPresets.register({id, plugins})` registers root compositions; DSH doesn't discover them by scanning exported directories. Generated `agent-presets/` mirrors are inspection/export resources. `presets.materialize` defaults off and never selects the Host default preset. Personas, read-only restrictions and host approvals remain when explicit Deepwork off hides common workflow and DSMM skills. Complete adapted source content and resources are described in [source synchronization](skill-sync.md).

Standing Orchestrator/Builder compositions include native planning, compaction/pruning, question and todo rows. Planner includes planning, compaction/pruning and questions, but no todo writer. Coding/frontend/deep/complex/cross-cutting include compaction/pruning, questions and todo; other auxiliary roles add none of those rows. Native spawn can retain parent services, so this isn't a promise to strip every inherited row from short children. Effective filters and execution fences still decide access. Native `/plan` doesn't upgrade Planner permissions, and `/compact` remains a human native command.

## Delegation authority

| Admitted identity | Permitted logical children, intersected with native authority |
| --- | --- |
| Trusted root/stage-owner Orchestrator or Builder | Authorized workflow/execution roles; owns formal planning, criticism and acceptance |
| quick, code-search, doc-search, research, media-reader | None; research remains a leaf |
| Planner, clarifier, plan-critic, Reviewer/Oracle | Read-only code-search, doc-search, research, media-reader |
| coding, normal-task, frontend, creative, hard-reasoning, documenting | Bounded utility leaves |
| deep, complex, cross-cutting | Utility leaves and coding/frontend/hard-reasoning/creative/documenting specialists |
| Native child Builder | Bounded utility leaves, not stage ownership |

No child gains coordination authority from a preset label, persona or durable role string. The shared role policy checks exact live native ownership, original child capture, admitted epoch and provider/definition identity. Generic spawn can't bypass role admission in a DSMM-owned workflow. Unrelated ordinary off-mode native children retain Host behavior without acquiring DSMM delegation.

Read-only roles remain read-only independently of mode and optional guards. Planner returns complete Markdown for native review/handoff; an authorized coordinator persists it. There is no Planner writer. Native catalog visibility and role permission are separate: a schema or read-only catalog listing doesn't authorize invocation, and own-layer native schemas may remain visible even when mandatory execution fences deny them.

Descendants intersect parent allow-lists with requested restrictions and union deny-lists, using frozen captures. Existing native filters still execute. Reinstallation, direct aliases, continuable starts and cold resumes don't enlarge original authority. A named profile can narrow enabled roles but can't lift startup/deployment ceilings; required roles and conditional legacy review rules are covered in [profiles](profiles.md#inheritance-and-ceilings).

## Invocation and lifecycle

Actual per-role or parameterized tool names, target IDs and `level`/opt-in `route` parameters are documented in [model routing](model-routing.md#tool-topology-and-target-filters). Default level is normal; low/high/max require explicit target configuration. Root model selection stays native-owned. Children capture route, visible-output locale and authority at admission, not from a parent's later profile.

Foreground one-shot is the deployment default. A one-shot waits for useful native result/output and settles; its terminal child can't be revived as a continuable conversation. Structured result capture, cancellation, storage, capacity and teardown remain native-owned.

Explicit `enableRunInBackground` permits native jobs. With `backgroundMode:"one-shot"`, calls wait unless `run_in_background:true`. With opted-in `backgroundMode:"continuable"`, background continuation is the call default; `run_in_background:false` still waits for one-shot work. Continuable start requires a real native `prepareContinuable` method, not a capability flag alone. Omitted `maxDepth` delegates to the native limit; deployment depth/background settings aren't named-profile fields.

A running foreground one-shot can be handed to background jobs using the exact published run, tool call, parent session and admission epoch. This transfers the same native run, not a restarted prompt or second child. The receipt reports `background`, `already-background`, `already-settled` or `cancelled`, with the same run ID and job ID where applicable. Starting, settled, cancelled, stale or unauthorized requests don't imply a new execution.

## Native child panel and report

The session-scoped Conversation child panel shows actual runs, direct children and a read-only descendant tree. IDs, activity, mode, admitted role/level, route comparison, original evidence and disabled reasons remain separate facts. Corrupt, unsupported or unavailable branches show diagnostics, not fabricated successful results. Descendant inspection doesn't grant control over non-direct children.

Route comparison uses real initial `invocation-capture` and the child's latest `own-native-request-header`. Missing/invalid/unobserved evidence remains unknown, never inferred from the root route, current profile or compatibility invocation projection. Original capture evidence and conservative legacy evidence expose `provenFields` and limitations; neither a role label nor an empty limitation list proves full old-configuration recovery.

Human messages target only an admitted direct continuable child with current parent authority and ready delivery fencing. Entries whose observed control projection is read-only remain inspection-only; this isn't the role's tool-level read-only policy. **Queue** accepts a distinct later turn; **Steer** targets the nearest step. Idle/cold continuation keeps the same durable child ID. Native attachment and model admission validate images separately.

An inbox receipt means **accepted**, not executed or completed. An interrupt acknowledgment isn't completion and doesn't claim queued work was removed. If transport leaves a send outcome unknown, the draft stays visible and automatic resend is disabled. Inspect the native child conversation before explicitly allowing a new message, which could duplicate an accepted one. Refresh and reconnection never imply automatic retry.

## Explicit runtime and legacy boundaries

Managed delivery uses explicit cold-start `@dsmm/dsmm/subagent-runtime` composition and the optional [runtime patch](../patches/subagent-runtime.yml), not automatic replacement by the default bundle. Keep one provider in the same Host scope, preserve native spawn/fork/model/Gateway services, and retain explicit stock capacity/depth settings. Runtime binding, delivery readiness and restart requirement are observable separately. See [settings](settings-status.md#child-runtime-composition).

An old child without complete original capture uses conservative evidence and per-field limitations, not the current parent's settings as recovered history. The separate legacy read adapter remains default off and requires explicit trusted Host composition. Its compatibility boundary doesn't grant arbitrary writes, invented approvals or durable guarantees. See [compatibility](compatibility.md); named legacy storage and old-child admission evidence aren't the same mechanism.

Native Host commands, sessions, inbox, permissions, process/cwd/model selection and transports retain ownership. DSMM supplies role admission and bounded controls, not a replacement lifecycle scheduler, generic permission bypass or automatic retry system.

*Author's note: For a coordinator or DSH operator delegating work; inspect actual child admission and receipts before treating catalog visibility or accepted delivery as execution.*
