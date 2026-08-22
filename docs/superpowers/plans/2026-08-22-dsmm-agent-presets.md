# DSMM v0.2 Agent Presets Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dsmm v0.2 role/preset support so DeepSeek Harness users can opt into ocmm-style role personas through dsh agent presets, with disabled roles absent from the managed preset root.

**Architecture:** v0.2 ships static dsh agent-preset templates under `dsmm/agent-presets/`, one directory per dsmm role, and a materializer that writes only enabled role presets into a managed root under `$DSH_HOME/.agent-presets` when explicitly enabled. Each preset contains `agent.cordis.yml` with a scoped `@deepseek-ai/dsh-persona` row and `preset.yml` metadata. DSMM does not replace the host `agent-presets` row by default because dsh patch layers replace whole configs; users opt into discovery by enabling materialization or by adding the documented preset root patch.

**Tech Stack:** dsh agent presets (`@deepseek-ai/dsh-agent-presets`), dsh persona (`@deepseek-ai/dsh-persona`), YAML preset assets, Node.js 22 `node:test`, TypeScript ESM, Docker smoke.

**Spec:** `dsmm/docs/roadmap.md` v0.2; discovery evidence from dsh preset docs/source and shipped `standard`/`code`/`minimal` presets.

**Global Constraints:**
- Deepwork remains opt-in; do not change the default dsh preset or globally enable dsmm roles.
- Do not override an existing `agent-presets` row in `dsmm/cordis.patch.yml`.
- Every role preset must be a directory named by a valid dsh preset id (`[a-z0-9][a-z0-9-]*`) and contain `agent.cordis.yml` plus `preset.yml`.
- Preset composition must be agent-plane only; use `@deepseek-ai/dsh-persona` and no host-plane service rows.
- Role prompts must be concise, role-scoped, and derived from ocmm's role model without importing OpenCode-specific tool names.
- Each role/preset must be individually configurable. When materialization is enabled, disabled roles must be absent from the managed preset root.
- Preset materialization is off by default. On every reconcile, it writes enabled roles and removes disabled roles only under the configured managed root, defaulting to `$DSH_HOME/.agent-presets`, and only touches directories containing the dsmm marker file. When `materialize` changes from true to false, all dsmm-marked managed preset directories are removed.
- Keep generated `lib/` output committed for path/package installation smoke tests.

---

## File Structure

- Create: `dsmm/src/roles.ts` — canonical role ids, metadata, enable defaults, persona text, and preset YAML render helpers.
- Create: `dsmm/src/preset-materializer.ts` — writes/removes managed preset directories for enabled roles.
- Modify: `dsmm/src/settings.ts` — add `roles` toggles to config/settings schemas and defaults.
- Modify: `dsmm/src/index.ts` — export role metadata helpers.
- Create: `dsmm/agent-presets/<role>/agent.cordis.yml` and `preset.yml` for each v0.2 role.
- Create: `dsmm/docs/agent-presets.md` — how to add dsmm preset root to a dsh profile without changing defaults.
- Create: `dsmm/patches/agent-presets-root.example.cordis.patch.yml` — commented example patch, not automatically applied.
- Modify: `dsmm/package.json` — include `agent-presets` and `patches` in package files.
- Modify: `dsmm/README.md` — summarize v0.2 role presets and link docs.
- Add tests: `dsmm/test/roles.test.ts`, `dsmm/test/preset-materializer.test.ts`, extend `settings.test.ts`, `assets.test.ts`, and `docker-smoke-assets.test.ts`.

## Role Set

v0.2 ships these initial presets:

- `dsmm-orchestrator`
- `dsmm-planner`
- `dsmm-plan-critic`
- `dsmm-reviewer`
- `dsmm-code-search`
- `dsmm-doc-search`
- `dsmm-clarifier`
- `dsmm-media-reader`

Defer `oracle` and `oracle-2nd` to a later model-routing/review-lane stage because dsh preset assets alone cannot express ocmm's ordered external-model Oracle semantics.

The `dsmm-orchestrator` persona names the other dsmm preset ids as its dsh-native routing targets. Actual subagent creation/tool exposure remains governed by the user's composed dsh preset/tool stack; v0.2 proves the target presets are materialized and discoverable, not that every dsh profile has delegation tools installed.

---

## Task 1: Role metadata and settings

**Files:**
- Create: `dsmm/src/roles.ts`
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/src/index.ts`
- Create: `dsmm/test/roles.test.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: existing `DsmmSettings`, `DsmmPluginConfig`.
- Produces:
  - `export type DsmmRoleId`
  - `export interface DsmmRoleDefinition`
  - `export const DSMM_ROLE_IDS`
  - `export const DSMM_ROLES`
  - `export function renderAgentCordis(role: DsmmRoleDefinition): string`
  - `export function renderPresetMetadata(role: DsmmRoleDefinition): string`
  - `roles: Record<DsmmRoleId, boolean>` in settings/config.
  - `presets: { materialize: boolean; root?: string }` in settings/config.
  - `export function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean`

- [ ] Write failing tests for role ids, metadata rendering, valid preset ids, orchestrator routing-target text, role settings toggles, and `presets.materialize` defaults.
- [ ] Implement `roles.ts` with persona text for all eight roles.
- [ ] Add `roles` schema/defaults to `settings.ts` and export role metadata from `index.ts`.
- [ ] Run `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, `pnpm --filter dsmm build`.

## Task 2: Preset asset generation, materialization, and validation

**Files:**
- Create: `dsmm/agent-presets/**/agent.cordis.yml`
- Create: `dsmm/agent-presets/**/preset.yml`
- Create: `dsmm/src/preset-materializer.ts`
- Modify: `dsmm/test/assets.test.ts`
- Create: `dsmm/test/agent-presets.test.ts`
- Create: `dsmm/test/preset-materializer.test.ts`

**Interfaces:**
- Consumes: `DSMM_ROLES`, `renderAgentCordis`, `renderPresetMetadata`.
- Produces: static preset assets matching role metadata and a managed-root materializer that writes only enabled presets.

- [ ] Add tests that every enabled role has a preset directory, `agent.cordis.yml`, and `preset.yml`.
- [ ] Add tests that each `agent.cordis.yml` is a top-level YAML list containing exactly one persona row with `name: '@deepseek-ai/dsh-persona'`.
- [ ] Add tests that static files exactly match `renderAgentCordis()` and `renderPresetMetadata()` output.
- [ ] Add tests that materialization writes enabled roles, skips disabled roles, removes only dsmm-marked disabled role directories, refuses to remove unmarked directories, and reconciles true-to-false by scanning the managed root and removing every dsmm-marked directory, including legacy dsmm-marked directories outside the current role list.
- [ ] Create all preset directories and files.
- [ ] Implement `materializeRolePresets({ root, settings })`, `reconcileRolePresets({ root, settings })`, and `resolveManagedPresetRoot(settings, env)`. `reconcileRolePresets` always runs when a root can be resolved: if `settings.presets.materialize` is true it writes enabled roles and removes disabled dsmm-marked roles; if false it scans the managed root and removes every directory containing the dsmm marker file.
- [ ] Wire reconciliation from `apply()` through a restart-scoped settings attach callback so the effective attached settings reconcile the managed root when a settings service exists; fall back to base config only on contexts without `ctx.inject`. Because Cordis injection may attach asynchronously, never call the base reconciliation callback merely because an inject callback has not run yet. The callback must use `presets.root` when present, otherwise `$DSH_HOME/.agent-presets`, and no-op only when both are absent. Do not mark the namespace live unless command names, prompt order, skills, and preset reconciliation all re-register live.
- [ ] Run `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, `pnpm --filter dsmm build`.

## Task 3: Optional root patch docs and smoke coverage

**Files:**
- Create: `dsmm/docs/agent-presets.md`
- Create: `dsmm/patches/agent-presets-root.example.cordis.patch.yml`
- Modify: `dsmm/README.md`
- Modify: `dsmm/package.json`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`
- Modify: `dsmm/docker/Dockerfile.smoke`
- Modify: `dsmm/scripts/docker-smoke.mjs`

**Interfaces:**
- Consumes: preset asset root `dsmm/agent-presets`.
- Produces: package and smoke evidence that the preset assets ship, materialization works in an isolated root, and the materialized root can be added to dsh agent-presets discovery by explicit user patch.

- [ ] Add `agent-presets` and `patches` to `package.json.files`.
- [ ] Document the explicit profile patch pattern. The docs must warn that patching `agent-presets` replaces the whole config and users must restate existing roots/defaults.
- [ ] Add an example patch file that is clearly not auto-applied.
- [ ] Extend Docker smoke to enable materialization in an isolated non-default root, verify enabled role directories exist and a disabled role directory is absent, check a dsh `--dump-config` run with an explicit profile patch includes the dsmm managed root without making dsmm the default preset, and import dsh's own `@deepseek-ai/dsh-agent-presets` `discoverPresets()` from the installed dsh package to prove the materialized ids resolve from that root.
- [ ] Run `pnpm --filter dsmm test`, `pnpm --filter dsmm typecheck:test`, `pnpm --filter dsmm build`, `pnpm --filter dsmm smoke:docker`, and `pnpm --filter dsmm pack --dry-run`.

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
