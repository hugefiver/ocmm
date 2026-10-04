# dsmm Skill Sync Policy

dsmm skill text is sourced from current ocmm `skills/v1` behavior, then adapted to DSH-native Agent Skills. Seven core skills remain prompt-injected while deepwork is active. The separate `debugging` skill and its DAP client are bundled for on-demand role-preset use and are never added to every turn's core prompt.

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

When ocmm workflow skills change, review the matching dsmm skill for behavior drift. Port durable intent, safety and acceptance; do not port OpenCode/Codex tool names, hook mechanics or imagined DSH events. Keep the seven auto-injected bodies compact, retain debugging as a separate registered skill, and update tests/docs when core inventory or setting names change.

Future sync work should record the source ocmm skill version or date in the related implementation plan or changelog entry, then run the dsmm verification path before publishing the package.
