# Superpowers v6.3 Skill Sync Design

## Goal

Selectively sync the high-value `obra/superpowers` v6.3.0 workflow skill updates into ocmm's local deepwork/v1 workflow, adapted to ocmm's existing approval, TodoWrite, review-identity, and no-subagent-git-write contracts.

## Scope

In scope:
- `brainstorming`: add process scaling (`Spike`, `Bounded`, `Architectural`) so small work uses a short in-chat design while preserving the local hard approval gate and delegation/self-review approval semantics.
- `writing-plans`: add an explicit `Spec:` pointer to plan headers so implementers resolve plan questions against the design artifact.
- `subagent-driven-development`: add local versions of v6.3.0's no-stall rulings, pre-dispatch spec/plan scan, small same-shape batching, no peer reviewer/implementer spawning, and waiting discipline.
- `requesting-code-review/code-reviewer.md` and narrow SDD reviewer templates: instruct reviewers not to spawn subagents or second-opinion reviewers, and keep narrow code-quality review handoff aligned with the canonical identity-bound review packet.
- Maintenance docs, focused contract tests, generated Codex plugin bundle, and a patch release bump.

Out of scope:
- Devin CLI, Hermes Agent, `using-superpowers`, `finishing-a-development-branch`, and `writing-skills/render-graphs.js` changes.
- Upstream ledger scripts, automatic worktree lifecycle, per-task full review loops, upstream harness tool names, and any new runtime/tool dependency.
- Any change to `package.json.ocmm.lspVersion`.

## Design

The sync is prose/contract work, not runtime behavior. Source skill files remain authoritative and generated Codex plugin copies are regenerated rather than hand-edited. The local adaptation keeps ocmm-specific boundaries: TodoWrite/notepad/plan notes replace upstream ledgers, final acceptance remains identity-bound through `requesting-code-review`, subagents never perform git writes, and workflow role composition remains orchestrator-owned.

The release target is the next patch version after `0.6.11` (`0.6.12`). Verification requires focused prompt/contract tests, `pnpm run typecheck`, full `pnpm test`, `pnpm run build`, generated bundle consistency, and final acceptance review before commit/tag/publish.
