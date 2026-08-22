# DSMM v0.3 Workflow Skills Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring dsmm's bundled workflow skills to practical parity for deepwork planning/review flows.

**Architecture:** DSMM already registers bundled skills from `dsmm/skills/*/SKILL.md` through `registerBundledSkills()`. v0.3 expands the skill registry from the v0.1 four-skill set to the full workflow set by adding `subagent-driven-development`, `dispatching-parallel-agents`, and `remove-ai-slops`, renaming the skill type from MVP-specific to workflow-generic, and adding settings for strict gates, review caps, and final review policy that the `deepwork` prompt can surface.

**Tech Stack:** TypeScript ESM, Node.js 22 `node:test`, dsh runtime skill registration (`ctx.skills.register()`), Agent Skills markdown files.

**Spec:** `dsmm/docs/roadmap.md` v0.3; current source skills from `skills/v1/subagent-driven-development/SKILL.md`, `skills/v1/dispatching-parallel-agents/SKILL.md`, and `skills/remove-ai-slops/SKILL.md`.

**Global Constraints:**
- Keep dsmm skills concise and dsh-native; do not copy OpenCode-only mechanics verbatim where they would mislead dsh users.
- Keep every skill configurable through `settings.skills`.
- Preserve the existing four skills and their names.
- Do not change role preset behavior except where docs mention available skills.
- Keep `lib/` output committed after build.

---

## File Structure

- Modify: `dsmm/src/settings.ts` — rename skill type to a complete workflow skill union and add settings toggles for strict gates, review caps, and final review policy.
- Modify: `dsmm/src/skills.ts` — register all workflow skill names from one canonical list.
- Modify: `dsmm/src/prompts.ts` — mention full skill set and configurable gates in deepwork prompt.
- Create: `dsmm/skills/subagent-driven-development/SKILL.md`.
- Create: `dsmm/skills/dispatching-parallel-agents/SKILL.md`.
- Create: `dsmm/skills/remove-ai-slops/SKILL.md`.
- Modify: `dsmm/test/skills.test.ts`, `dsmm/test/settings.test.ts`, `dsmm/test/prompts.test.ts`, `dsmm/test/docker-smoke-assets.test.ts`.
- Modify: `dsmm/README.md`, `dsmm/docs/roadmap.md`.
- Create: `dsmm/docs/skill-sync.md`.
- Create: `dsmm/docs/implementation-plan-v0.3.md` as dsmm-local copy of this plan after approval.

## Task 1: Expand workflow skill registry and settings

**Files:**
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/src/skills.ts`
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/test/skills.test.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: existing `MvpSkillName`, `DEFAULT_DSMM_SETTINGS`, `registerBundledSkills()`.
- Produces:
  - `export type DsmmSkillName`
  - `export const DSMM_SKILL_NAMES`
  - `settings.skills: Record<DsmmSkillName, boolean>`.
  - `workflow: { strictGates: boolean; reviewCap: number; finalReviewPolicy: "simple-oracle-complex-reviewer" | "reviewer-only" | "off" }`.

- [ ] Add failing tests proving `DSMM_SKILL_NAMES` includes the seven workflow skills and `registerBundledSkills()` registers all enabled skills.
- [ ] Add failing tests proving disabling `remove-ai-slops` removes it from registration while other skills remain.
- [ ] Add failing tests for `workflow` settings defaults and config merging.
- [ ] Rename the skill-name type to `DsmmSkillName`, update schemas/defaults, and export the canonical list.
- [ ] Run `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, `pnpm --filter dsmm build`.

## Task 2: Add remaining workflow skill assets

**Files:**
- Create: `dsmm/skills/subagent-driven-development/SKILL.md`
- Create: `dsmm/skills/dispatching-parallel-agents/SKILL.md`
- Create: `dsmm/skills/remove-ai-slops/SKILL.md`
- Modify: `dsmm/test/assets.test.ts`

**Interfaces:**
- Consumes: `DSMM_SKILL_NAMES` from Task 1.
- Produces: seven bundled Agent Skills-compatible markdown files.

- [ ] Add asset tests requiring a `SKILL.md` for every `DSMM_SKILL_NAMES` entry.
- [ ] Add concise dsh-native skill files for subagent-driven development, parallel dispatch, and remove-ai-slops.
- [ ] Ensure skill text preserves core behavior: subagents do not perform git writes, parallel dispatch only for independent work, remove-ai-slops locks behavior before cleanup.
- [ ] Run `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, `pnpm --filter dsmm build`.

## Task 3: Prompt/docs/smoke updates

**Files:**
- Modify: `dsmm/src/prompts.ts`
- Modify: `dsmm/prompts/deepwork.md`
- Modify: `dsmm/test/prompts.test.ts`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/README.md`
- Modify: `dsmm/docs/roadmap.md`
- Create: `dsmm/docs/skill-sync.md`
- Create: `dsmm/docs/implementation-plan-v0.3.md`

**Interfaces:**
- Consumes: full workflow skill registry and settings from Task 1/2.
- Produces: documentation and smoke evidence that the complete workflow skill set is present and configurable.

- [ ] Update the deepwork prompt to mention the full workflow skill set and render the active workflow policy values (`strictGates`, `reviewCap`, `finalReviewPolicy`) without making those policies global outside deepwork mode.
- [ ] Extend Docker smoke to verify all seven skill directories exist in the package and that disabling one skill through settings removes it from runtime registration in a Node-level smoke check.
- [ ] Document skill sync policy and configurable workflow settings in README/docs.
- [ ] Copy this approved plan to `dsmm/docs/implementation-plan-v0.3.md`.
- [ ] Run `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, `pnpm --filter dsmm build`, `pnpm --filter dsmm smoke:docker`, `pnpm --filter dsmm pack --dry-run`.

## Final Verification

- [ ] `pnpm --filter dsmm test`
- [ ] `pnpm --filter dsmm typecheck:test`
- [ ] `pnpm --filter dsmm build`
- [ ] `pnpm --filter dsmm smoke:docker`
- [ ] `pnpm --filter dsmm pack --dry-run`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run build`
- [ ] `pnpm run test:lsp`
- [ ] `pnpm test` or record the known local Python-stub environment failure if it remains isolated to `coding-agent-sessions.test.ts`.
