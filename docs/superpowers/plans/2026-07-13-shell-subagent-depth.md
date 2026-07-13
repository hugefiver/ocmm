# Shell Adaptation and Subagent Depth Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global shell-aware prompt guidance, GPT-5.6-specific subagent restraint, and a configurable subagent nesting limit.

**Architecture:** Put shell adaptation in every effective deepwork prompt variant selected by the prompt loader and every category prompt path that can run without inheriting a deepwork layer, and keep only subagent-restraint wording in the three GPT-5.6 layers. Add `subagent.maxDepth` to the config schema and enforce it in the existing permission before-hook using per-session depth tracking from `session.created` parent metadata.

**Tech Stack:** TypeScript, Zod config schema, Node test runner, pnpm schema/Codex generation.

**Global Constraints:**
- Do not change OpenCode's task API; enforce only through ocmm hooks.
- Default maximum is three subagent layers.
- `subagent-depth-guard` is enabled by default and disableable via `disabledHooks`.
- Prompt changes under `prompts/v1` update `docs/v1-maintenance.md`; prompt changes under `prompts/omo` update `docs/prompt-sync.md`.
- Config schema changes regenerate root `schema.json`.
- Codex bundle generation runs after `pnpm run build:ts` and includes `.agents/plugins/marketplace.json`.
- `session.compacted` must not clear subagent depth state.

---

### Task 1: Prompt and documentation calibration

**Files:**
- Modify: `prompts/v1/deepwork/default.md`
- Modify: `prompts/v1/deepwork/gpt.md`
- Modify: `prompts/v1/deepwork/gemini.md`
- Modify: `prompts/v1/deepwork/glm.md`
- Modify: `prompts/v1/deepwork/planner.md`
- Modify: `prompts/omo/deepwork/default.md`
- Modify: `prompts/omo/deepwork/gpt.md`
- Modify: `prompts/omo/deepwork/gemini.md`
- Modify: `prompts/omo/deepwork/glm.md`
- Modify: `prompts/omo/deepwork/planner.md`
- Modify: `prompts/codex/deepwork/default.md`
- Modify: `prompts/codex/deepwork/gpt.md`
- Modify: `prompts/codex/deepwork/gemini.md`
- Modify: `prompts/codex/deepwork/glm.md`
- Modify: `prompts/codex/deepwork/planner.md`
- Modify: `prompts/v1/deepwork/codex.md`
- Modify: `prompts/omo/deepwork/codex.md`
- Modify: `prompts/codex/deepwork/codex.md`
- Modify: `prompts/v1/deepwork/gpt-5.6.md`
- Modify: `prompts/omo/deepwork/gpt-5.6.md`
- Modify: `prompts/codex/deepwork/gpt-5.6.md`
- Modify: `prompts/v1/category/{coding,complex,creative,deep,documenting,frontend,hard-reasoning,normal-task,quick,research}.md`
- Modify: `prompts/omo/category/{coding,complex,creative,deep,documenting,frontend,hard-reasoning,normal-task,quick,research}.md`
- Modify: `prompts/codex/category/{coding,complex,creative,deep,documenting,frontend,hard-reasoning,normal-task,quick,research}.md`
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`

**Interfaces:**
- Consumes: Existing effective deepwork prompt variants and GPT-5.6 calibration layer.
- Produces: Shell-adaptation instructions in every selected deepwork variant and category prompt path plus restrained-delegation instructions scoped to GPT-5.6 family models.

- [ ] Add shell-adaptation bullets to all effective deepwork prompt variants: `default`, `gpt`, `gemini`, `glm`, `codex`, `planner`, and `gpt-5.6` for `v1`, `omo`, and `codex`.
- [ ] Add shell-adaptation bullets to every category prompt under `prompts/{v1,omo,codex}/category/` because non-Codex, non-GPT-5.6 category agents can receive those prompts without a deepwork layer.
- [ ] Generalize command-lens and CLI QA wording so it says to use the active harness shell syntax instead of hardcoding PowerShell or Bash.
- [ ] Add GPT-5.6-only subagent-restraint bullets to all three `deepwork/gpt-5.6.md` files.
- [ ] Update prompt synchronization docs to distinguish global shell adaptation from GPT-5.6-only subagent restraint.

### Task 2: Config schema and depth guard

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/permissions/index.ts`
- Modify: `src/index.ts`
- Modify: `src/config/load.test.ts`
- Modify: `src/config/profiles.test.ts`
- Modify: `src/permissions/index.test.ts`
- Modify: `src/index.test.ts`
- Generate: `schema.json`

**Interfaces:**
- Consumes: `session.created` event metadata and `sessionAgentMap`.
- Produces: `subagent.maxDepth` config and `subagent-depth-guard` enforcement.

- [ ] Add `subagent-depth-guard` to `HOOK_NAMES`.
- [ ] Add `SubagentConfigSchema` with `maxDepth: number` default `3`, min `0`, max `20`; include partial profile schema.
- [ ] Add `sessionDepthMap` to `createPermissionGuards` and wire it from `src/index.ts`.
- [ ] Update guard event handling to set child depth from `parentID` / `parentId` / `parentSessionID` / `parentSessionId` metadata and clean depth only on `session.deleted`.
- [ ] Add a task before-guard that blocks `task` when the caller's depth is `>= config.subagent.maxDepth`.
- [ ] Add tests for defaults, profile override, max-depth blocking, event parent tracking, compact preserving depth, fail-closed fallback for known subagents without lineage, disabled hook opt-out, and plugin-level wiring through `createPlugin()`.
- [ ] Run `pnpm run gen-schema`.

### Task 3: Generated bundle and verification

**Files:**
- Generate: `.codex/agents/**`
- Generate: `.agents/plugins/marketplace.json`
- Generate: `plugins/deepwork/**`
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Prompt/config source changes.
- Produces: Generated Codex bundle and user-facing hook/config docs.

- [ ] Document `subagent.maxDepth` and the `subagent-depth-guard` hook.
- [ ] Run `pnpm run build:ts` before regenerating the Codex bundle.
- [ ] Run `pnpm run gen:codex-plugin`.
- [ ] Run targeted tests: `node --test --experimental-strip-types src/config/load.test.ts src/config/profiles.test.ts src/permissions/index.test.ts src/index.test.ts`.
- [ ] Run `pnpm run typecheck`.
- [ ] Run `pnpm test` with `OCMM_PROFILE` temporarily cleared if the local shell has that variable set.
