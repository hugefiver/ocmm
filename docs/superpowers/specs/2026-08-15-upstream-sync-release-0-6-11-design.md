# Upstream Sync and 0.6.11 Release Design

**Date:** 2026-08-15
**Status:** Approved by explicit user delegation (`可行，你自主进行`)

## Goal

Adapt the approved low-risk upstream OMO/Superpowers improvements into ocmm, exclude OMO 5.0/Senpi/runtime-only changes, bump the main package from `0.6.10` to `0.6.11`, verify the implementation, then commit, push, tag, and publish the patch release.

## Approved Scope

Implement the previously reviewed sync candidates:

1. Add `upstream request failed` to the default runtime-fallback retry patterns.
2. Pass the project `cwd` into the built-in OpenCode LSP MCP local server config.
3. Keep Bedrock vendor-prefixed GPT-5.6 IDs compatible with GPT-5.6 prompt selection and native `max` reasoning support.
4. Bump the ast-grep skill installer fallback version from `0.43.0` to `0.45.0`.
5. Stop idle continuation after explicitly non-retryable `400`/`422` request errors when idle continuation is enabled.
6. Lower canonical `reasoning` to an OpenCode `variant` at agent registration time for visible TUI/status semantics.
7. Add a lightweight temperature compatibility guard for model families known to reject explicit temperature.
8. Add bounded plan-review convergence rules to the local writing-plans/plan-critic workflow.
9. Proportion Gemini/GLM verification mandates to task size while preserving strong verification for complex/high-risk work.
10. Update the main package and generated Codex plugin bundle to version `0.6.11`.

## Explicit Non-goals

- Do not introduce `.omo` coding-agent session scanning. Existing `.senpi` and `.pi` support remains unchanged.
- Do not import OMO 5.0/Senpi/memory-core/omo-native runtime systems.
- Do not import upstream dual Momus+Oracle plan review. ocmm keeps one plan-critic receipt path.
- Do not import the full upstream model-capability snapshot/provider metadata registry.
- Do not change the pinned ocmm-lsp optional-package version (`package.json.ocmm.lspVersion` stays `0.3.2`).
- Do not perform in-place release repair after publication starts. If release completion fails or is unresolved, report the fixed tag/run identity and stop.

## Architecture

### Runtime fallback and idle continuation

Runtime fallback continues to use `DEFAULT_RUNTIME_FALLBACK_RETRY_PATTERNS` and `classifyError()` as the single classification surface. The default array gains the exact phrase `upstream request failed`; user-provided `retryOnPatterns` arrays still replace defaults.

For idle continuation, `session.error` handling will record a per-session terminal idle-stop marker only for explicit non-retryable request errors: status `400` or `422`, and provider metadata that marks the error as non-retryable (`isRetryable: false` or equivalent nested flag). `handleIdleContinuation()` checks that marker before reading todos or injecting a prompt. This avoids repeating doomed invalid requests while leaving ordinary non-retryable conditions and retryable fallback flows unchanged.

### MCP project cwd

The built-in LSP MCP local config gains optional `cwd` support at the local MCP schema/type boundary. `resolveMcpServers(config, { cwd })` will pass the supplied project cwd through `createBuiltinMcps()` to the LSP `local()` call. Explicit `.mcp.json` or config `lsp` servers continue to override the builtin through existing merge order.

### Model identity and provider parameter compatibility

`extractModelName()` will normalize known hosted vendor prefixes such as `openai.` when the remaining string is itself a GPT model ID, so `amazon-bedrock/openai.gpt-5.6` behaves like `gpt-5.6`. This drives both `parseGptVersion()` and GPT-5.6 prompt selection without broadening arbitrary dotted names.

The chat params hook will drop explicit temperature for families known to reject it: GPT/Codex reasoning-style models and Claude Opus 4.7+ / Opus 5 family. The guard applies after route and fast-option merging so explicit user config cannot accidentally produce provider errors for those models. Other families keep existing temperature behavior.

Canonical `reasoning` on configured agent entries will be lowered to an OpenCode `variant` only when `reasoningToVariant()` produces a concrete value. `off`, `auto`, and `none` remain non-variant values and are left to the chat params hook's canonical reasoning path.

### Skills and prompts

The ast-grep skill fallback installer version updates to `0.45.0` across PowerShell, POSIX, docs, source metadata, and the smoke fixture.

The writing-plans plan-critic loop gains bounded convergence rules adapted to ocmm: default maximum five review rounds, evidence-backed blocker eligibility, non-blocking notes for ineligible findings, round-one blocker ledger freeze, smallest-edit plan fixes, and stop-and-ask-user behavior on cap exhaustion. Existing explicit delegation (`review N 次就下一步`) remains a user-selected override path.

The plan-critic role prompts in `prompts/v1/agents/plan-critic.md` and `prompts/omo/agents/plan-critic.md` will describe the same blocker eligibility and non-blocking note policy. The v1 prompt keeps the three-state receipt (`[REJECT]`, `[OKAY]`, `[OKAY-UNAMBIGUOUS]`); the omo prompt is aligned to the same local receipt semantics rather than restored to upstream binary-only behavior.

Gemini and GLM deepwork prompts will scale scenario/TDD/manual-QA expectations by task complexity: simple tasks get targeted verification; moderate tasks get the happy path plus one adjacent regression; complex/high-risk tasks still require three-plus scenarios and stronger RED/GREEN/SURFACE evidence. This mirrors existing GPT/Codex proportionality without weakening final acceptance for significant implementation work.

Because this touches `skills/v1/` and `prompts/v1/` plus `prompts/omo/`, `docs/v1-maintenance.md` and `docs/prompt-sync.md` must be updated in the same change. Generated Codex plugin artifacts must be regenerated after source and version changes.

### Versioning and release

`package.json` bumps `0.6.10 -> 0.6.11`. The generated Codex plugin bundle must carry the same version in `plugins/deepwork/package.json`, `plugins/deepwork/.codex-plugin/plugin.json`, marketplace metadata, and generated agent/skill copies as produced by `pnpm run gen:codex-plugin`.

After verification and review, one semantic commit will contain the implementation and generated artifacts. The release tag is `v0.6.11`. Publishing completion is proven only by `pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.11 --deadline-ms 5400000 --poll-ms 15000` returning exit `0` with outcome `COMPLETED`.

## Test Strategy

1. Runtime-fallback classifier tests prove `upstream request failed` is retryable and explicit overrides still replace defaults.
2. Idle-continuation event tests prove `400/422` with `isRetryable: false` suppresses continuation and ordinary cases are unchanged.
3. MCP tests prove builtin LSP receives `cwd` and explicit LSP config still overrides it.
4. Model-family/prompt/config tests prove Bedrock-prefixed GPT-5.6 selects GPT-5.6 handling and native `max`, canonical `reasoning` registers visible variants, and unsupported-temperature families strip explicit temperature.
5. Skill/prompt source tests prove ast-grep version strings, plan-review convergence rules, and Gemini/GLM proportional verification wording.
6. `pnpm run gen-schema` and `pnpm run gen:codex-plugin` regenerate schema and bundle artifacts.
7. Repository gates: `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `git diff --check`, and LSP diagnostics on changed TypeScript files.
8. Final implementation acceptance review covers the complete working-tree diff before commit.
9. Release completion checker proves the published `v0.6.11` surfaces after tag push.

## Acceptance Criteria

- Selected upstream candidates are implemented with local ocmm semantics and tests.
- Excluded `.omo`, Senpi/runtime, dual-review, and capability-registry systems are absent.
- Schema, docs, prompts, skills, generated Codex bundle, and version files are consistent.
- All required verification and final code review pass.
- The final commit and `v0.6.11` tag are pushed.
- Release is reported complete only if the release completion checker returns `COMPLETED`; otherwise the fixed tag/run identity and unresolved/failed state are reported without repair.
