# Superpowers v6.3 Skill Sync Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync high-value Superpowers v6.3.0 workflow skill rules into ocmm and publish a patch release.

**Architecture:** Update source v1 skill files first, pin the local ocmm adaptation in contract tests and maintenance docs, then regenerate generated Codex plugin artifacts from sources. Keep runtime code unchanged except package version metadata.

**Tech Stack:** Markdown skills/prompts, Node test runner, TypeScript build scripts, pnpm, GitHub release checker.

**Spec:** `docs/superpowers/specs/2026-08-15-superpowers-v6-3-sync-design.md`

**Global Constraints:** Do not import Devin/Hermes harness support, upstream ledger/worktree scripts, per-task full review loops, or new dependencies. Preserve ocmm TodoWrite/notepad, identity-bound final review, and subagent no-git-write contracts. Keep `package.json.ocmm.lspVersion` at `0.3.2`.

---

### Task 1: Source Skill Adaptation

**Files:**
- Modify: `skills/v1/brainstorming/SKILL.md`
- Modify: `skills/v1/writing-plans/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/SKILL.md`
- Modify: `skills/v1/subagent-driven-development/implementer-prompt.md`
- Modify: `skills/v1/subagent-driven-development/spec-reviewer-prompt.md`
- Modify: `skills/v1/subagent-driven-development/code-quality-reviewer-prompt.md`
- Modify: `skills/v1/requesting-code-review/code-reviewer.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: current v1 skill contracts and Superpowers v6.3.0 diff.
- Produces: locally adapted v6.3.0 workflow prose in source skills.

- [ ] Add brainstorming `Spike` / `Bounded` / `Architectural` path classification while retaining local hard-gate approval sources.
- [ ] Add `Spec:` to writing-plans plan header.
- [ ] Add SDD no-stall rulings, spec/plan scan, batching, no peer reviewer/implementer spawning, and bounded wait guidance using ocmm tracking surfaces.
- [ ] Add reviewer no-subagent dispatch language and update narrow code-quality review template to use the canonical identity-bound packet instead of stale BASE/HEAD-only handoff.
- [ ] Update `docs/v1-maintenance.md` rows and sync note.

### Task 2: Contract Tests and Generated Bundle

**Files:**
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `src/intent/plan-review-contract.test.ts`
- Modify: `package.json`
- Generated: `.codex/agents/**`, `plugins/deepwork/**`, `.agents/plugins/marketplace.json` as produced by `pnpm run gen:codex-plugin`

**Interfaces:**
- Consumes: Task 1 source skill text.
- Produces: focused tests and generated artifacts matching the new source contracts.

- [ ] Add focused assertions for path scaling, `Spec:` header, local rulings/batching/no peer reviewer spawning, and maintenance rows.
- [ ] Bump package version from `0.6.11` to `0.6.12`; do not change `ocmm.lspVersion`.
- [ ] Run `pnpm run build:ts` and `pnpm run gen:codex-plugin`.

### Task 3: Verification, Review, Commit, Release

**Files:**
- All changed files from Tasks 1-2.

**Interfaces:**
- Consumes: completed source/generated diff.
- Produces: verified commit, `v0.6.12` tag, and release completion receipt.

- [ ] Run focused prompt/contract tests.
- [ ] Run `pnpm run typecheck`, full `pnpm test`, `pnpm run build`, and `git diff --check`.
- [ ] Run final identity-bound acceptance review.
- [ ] Commit, push `master`, tag/push `v0.6.12`, then run `pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.12 --deadline-ms 5400000 --poll-ms 15000`.
