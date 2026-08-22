# dsmm Skill Sync Policy

dsmm skill text is sourced from ocmm workflow skills, then adapted into concise dsh-native Agent Skills. The v0.3 skill set is intentionally not a verbatim copy of OpenCode-specific workflow text: it preserves the user-facing behavior while removing ocmm-only tool names, hook mechanics, and agent orchestration details that would mislead dsh users.

## v0.3 source mapping

- `brainstorming` mirrors the ocmm/deepwork brainstorming gate for design-before-implementation.
- `writing-plans` mirrors the ocmm/deepwork implementation planning workflow.
- `subagent-driven-development` mirrors the ocmm/deepwork decomposition and delegated implementation discipline, scoped to dsh-available tools.
- `dispatching-parallel-agents` mirrors the ocmm/deepwork guidance for independent parallel work.
- `requesting-code-review` mirrors the ocmm/deepwork final review request flow.
- `receiving-code-review` mirrors the ocmm/deepwork review-feedback handling flow.
- `remove-ai-slops` mirrors the ocmm cleanup workflow: lock behavior first, remove only behavior-preserving slop, then verify.

## Synchronization rules

When ocmm workflow skills change, review the matching dsmm skill for behavior drift. Port durable workflow intent, safety requirements, and acceptance checks; do not port OpenCode-only implementation details unless dsh exposes an equivalent runtime surface. Keep each dsmm skill short enough for routine model use and update tests/docs whenever the canonical skill list or setting names change.

Future sync work should record the source ocmm skill version or date in the related implementation plan or changelog entry, then run the dsmm verification path before publishing the package.
