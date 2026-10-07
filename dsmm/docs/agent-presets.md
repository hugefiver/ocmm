# Deepwork source roles on DSH 0.2.0-rc.2

DSMM's canonical content inventory is **11 base roles + 11 categories**, not twelve short personas. Base roles are orchestrator, builder, reviewer, oracle, oracle-2nd, doc-search, code-search, planner, clarifier, plan-critic and media-reader. Categories are frontend, creative, hard-reasoning, research, quick, coding, normal-task, complex, deep, documenting and cross-cutting. IDs are `dsmm-<source-name>`; explore is only a code-search compatibility alias, not an additional role. Existing `dsmm-creative` is preserved. Cross-cutting defaults disabled; all other canonical items default enabled.

## Content and authority

Every role consumes its complete adapted source Markdown when one exists, actual catalog responsibility and source terminal TS policy. Oracle/Oracle 2nd share reviewer content, not new personas. Builder and the utility roles without standalone source Markdown retain their actual catalog responsibilities and full active workflow. `prompts/source/manifest.json` maps each source/assembled artifact to its runtime consumer. See [source synchronization](skill-sync.md).

Frontend skill resources are fully materialized from the root-declared immutable sources, with project-original aside preserved. Native skill metadata remains body-free. Default build/package checks are offline and refuse missing resources; a fresh source checkout needs the explicit `sync:frontend` step before a source Docker context or package can be complete. Ignored upstream body files are not source commits and must still ship in the artifact.

Only Orchestrator/Builder (`primary`) and Planner (`all`) are root-eligible. The other 19 are auxiliary-only (`subagent`), independent of enablement. Root eligibility does not imply child delegation permission. Root Builder is a trusted stage owner, not a bounded child; native child Builder must retain its narrower assignment. The source grouping is:

| Identity/group | Permitted logical children, intersected with actual capability/authority |
| --- | --- |
| Trusted root/stage-owner Orchestrator or Builder | Authorized workflow and execution roles; owns formal planning, criticism and acceptance |
| Utility leaves: quick, code-search, doc-search, research, media-reader | None; research remains strict leaf |
| Planner, clarifier, plan-critic, Reviewer/Oracle | Read-only code-search, doc-search, research, media-reader; never quick or workflow owners |
| coding, normal-task, frontend, creative, hard-reasoning, documenting | Bounded utility leaves only |
| deep, complex, cross-cutting | Utility leaves and coding/frontend/hard-reasoning/creative/documenting specialists; no workflow owners or local-coordinator peers |
| Bounded native child Builder | Bounded utility leaves only; never inherit stage ownership from persona or preset name |

This is the **content/catalog policy**, not Stage C execution proof. Current native consumers still require Stage C's identity-bound native/headless guard, restricted plan artifact capability, capability intersection and complete continuation/background/depth lifecycle. Planner currently remains read-only; an unavailable path-restricted plan writer is a limitation, not authority for general shell/write access. No static file or list is proof that a role/tier is callable. Default catalog does not synthesize suffixed tiers or later Oracle slots.

## Native composition and generated mirror

DSH rc.2 uses `agentPresets.register({ id, plugins })`; it does not scan exported directories. Enabled root roles register complete native persona/instructions/filesystem/search/web/project-skill/skill-tool compositions. Read-only access is retained independently of Deepwork mode. Main DSMM owns the Agent-scoped lazy provider for all fourteen skills; generated compositions no longer include the legacy no-op `@dsmm/dsmm/preset-skills` row. Skills and common workflow disappear on explicit off; persona/access and host approvals do not.

`agent-presets/` contains 22 renderer-checked inspection templates, including the disabled-by-default cross-cutting template. Default root mirrors omit its child tool until enabled explicitly. Regenerate with `pnpm run generate:roles` after building; `-- --check` is read-only. `presets.materialize` stays off by default. If explicitly enabled, it exports only DSMM-owned enabled directories; this is not native directory discovery. Materialization ownership/link/marker checks are unchanged, and no install changes the host's default preset.

The published renderer's second skills argument is retained but ignored, preserving the later enabledRoles/roleRouting argument positions. The formal `./preset-skills` entry also remains compatible in 0.1.9: its apply hook registers nothing, and current generated compositions do not use it. Actual `registerAgentSkills` remains in that same module and is called by the main entry; no registration/lifecycle or public shape is changed by this compatibility retention.

Current standing/headless source composition retains role-specific native subagent instances for coordinators. `modelSelectionSettings:false`, one-shot/default foreground, persona/filter and inherited native permission/depth limits remain. Actual provider support and current catalog are authoritative; generated templates do not promise background or continuation. Stage C must add the finer source dispatch matrix without creating another scheduler.

## Models and migration

Role names are responsibilities, not routes. Explicit native picker/configured catalog-valid routes win; source OCMM provider/model preferences are not copied into DSH defaults. Reviewer is primary-lane review. Oracle independence exists only when a different actual model is explicitly selected; Oracle 2nd is priority, not greater capability. Exact DeepSeek overlays and auto/strict/off native effort behavior remain.

Existing IDs, runtime profile route keys, immutable admissions and authority are retained. Adding canonical metadata extends their accepted role inventory without adding roles/skills to runtime overlays or implementing desired/volatile settings. Auxiliary cold-resume limitations remain: do not silently substitute a persona, erase history or alter private deployment data. Global rollout, Docker/bootstrap, authenticated Desktop evidence and publication are outside this content stage.
