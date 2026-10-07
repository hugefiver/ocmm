# dsmm Skill Sync Policy

dsmm skill text is sourced from current ocmm `skills/v1` behavior, then adapted to DSH-native Agent Skills. Stage A (2026-10-07) exposes the existing seven core skills plus debugging only through a native Agent-scoped metadata provider. No skill body is injected into system prompts; both ordinary active presets and DW default-on presets load bodies only on native skill invocation. Explicit off withdraws the DSMM provider without removing project skills or role permissions.

Metadata in `src/skills.ts` must match packaged frontmatter (tested) and must never read `SKILL.md` during discovery. `resourceBase` resolves the package's complete existing skill directory; body reads are cancellable and fenced by the registration signal, per-lookup generation and current parent scope. Parent/global snapshots preserve all non-DSMM winning names and invocation restrictions. Incomplete/error observations do not imply absence. Native registry invalidation clears that registry's catalog cache; no DSMM ancestor/body cache or skills/change notification loop is added. The old preset compatibility entry registers nothing. B owns full source/library expansion, deterministic synchronization and generated preset refresh.

rc.2 broadcasts `skills/change` across the Cordis runtime, but revision/cache ownership remains per registry. DSMM therefore uses its broadcast generation only to fence each in-flight list/get, never as a permanent version in cached candidate locators. Each get rechecks the current ancestor snapshot before reading a body; unrelated registry changes cannot leave a complete cached catalog permanently unloadable or require a manual local invalidate. The listener does not reflect broadcasts into `control.invalidate()`.

## Source mapping

- `brainstorming` mirrors scope-first discovery: an explicit implementation request is authority within that scope, while safety/API/irreversible decisions still escalate.
- `writing-plans` mirrors risk-scaled planning and blocker-focused plan criticism for complex behavior, not a mandatory plan for every multi-step change.
- `subagent-driven-development` mirrors the ocmm/deepwork decomposition and delegated implementation discipline, scoped to dsh-available tools.
- `dispatching-parallel-agents` mirrors the ocmm/deepwork guidance for independent parallel work.
- `requesting-code-review` mirrors risk- and evidence-driven reviewer selection, without fixed reviewer counts or unconditional final approval.
- `receiving-code-review` mirrors the ocmm/deepwork review-feedback handling flow.
- `remove-ai-slops` mirrors the ocmm cleanup workflow: lock behavior first, remove only behavior-preserving slop, then verify.
- `debugging` is on demand. `scripts/sync-debugging-assets.mjs` copies self-contained DAP and runtime references from `skills/debugging`, adapts OpenCode-only team wording and excludes the fixture/test scripts from production assets. The original source tests remain usable from the repository; shipped `dap.mjs` needs only Node and an already available adapter.

## Synchronization rules

When ocmm workflow skills change, review the matching dsmm skill for behavior drift. Port durable intent, safety and acceptance; do not port OpenCode/Codex tool names, hook mechanics or imagined DSH events. Keep discovery metadata separate from all eight lazy bodies/resources, and update tests/docs when inventory or setting names change. Do not reinstate a prompt-body fallback.

Future sync work should record the source ocmm skill version or date in the related implementation plan or changelog entry, then run the dsmm verification path before publishing the package.
