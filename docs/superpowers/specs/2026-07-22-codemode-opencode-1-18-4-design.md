# CodeMode OpenCode 1.18.4 Baseline Design

## Goal

Migrate the evidence-only CodeMode compatibility harness from the exact OpenCode `1.18.3` contract to the exact `1.18.4` contract, then rerun the live probe with `apai/gpt-5.6-terra`. The migration must preserve fail-closed classification, no-install provider validation, process ownership, cleanup, and evidence sanitization.

## Scope

Update only the CodeMode harness, its tests and fixture, and its existing specification and plan:

- `scripts/codemode-execute-compatibility.ts`
- `scripts/codemode-execute-compatibility.test.ts`
- `scripts/fixtures/opencode-codemode-execute-compatibility.json`
- `docs/superpowers/specs/2026-07-20-codemode-execute-compatibility-design.md`
- `docs/superpowers/plans/2026-07-20-codemode-execute-compatibility.md`
- this migration design and its implementation plan

Do not change ocmm product runtime behavior, the three executable CodeMode fixture programs, package manifests, lockfiles, generated Codex artifacts, or OpenCode installation. The sanitized result fixture may be refreshed by the live probe. Keep all repository changes uncommitted, as requested by the user.

## Source of Truth

- OpenCode tag: `v1.18.4`, commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`.
- `packages/opencode/src/cli/cmd/run.ts`: JSONL event envelope and event types.
- `packages/opencode/src/provider/provider.ts`: exact bundled provider SDK routes.
- `packages/opencode/src/tool/code-mode.ts`: `execute` metadata and child-tool behavior.
- A fresh isolated live run with `apai/gpt-5.6-terra`: real-surface evidence, never a replacement for source-defined structural validation.

OpenCode `1.18.4` has the same 24 bundled provider npm IDs as `1.18.3`; the harness pins that unchanged exact list to the `1.18.4`-owned export.

## Contract Changes

### Current runner interface and classification

The shipped names are `REQUIRED_NESTED_TOOLS`, `REQUIRED_COMPLETED_METADATA_TOOLS`, `OpenCodeRunJsonlEventType`, `OpenCodeRunJsonlFacts`, and `parseOpenCodeRunJsonl(text): OpenCodeRunJsonlFacts | null`. The parser returns only aggregate safe facts or `null`; it does not expose an error-object result. PASS independently requires non-null facts with a positive event count, matching event-type length, internally consistent non-error/error counts, and zero error events; any violation is `FAIL/provider-run-jsonl-invalid`. Missing, duplicate, or extra entries in either the three-tool nested-hook multisets or the four-tool completed-metadata multiset fail closed through the shared `nested-hook-count-invalid` classification. The names and combined classification are intentional and must not be changed merely to match an older plan draft.

### Version and provider routes

- `SUPPORTED_OPENCODE_VERSION` is `1.18.4`.
- The provider-map export is `OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS`.
- Continue rejecting every SDK route outside the exact 24-item map before any host command.
- Treat `1.18.3` and every other version as outside the supported contract with zero live attempts.

### JSONL output

The structural JSONL parser accepts only the six event types emitted by OpenCode `1.18.4`:

- `tool_use`, `step_start`, `step_finish`, `text`, and `reasoning` require a record-valued `part`.
- `error` requires an `error` property.
- Every line must be one JSON object with string `type`, finite numeric `timestamp`, and non-empty string `sessionID`.
- Empty output, malformed lines, unknown event types, or wrong payload shapes remain unclassifiable.

The parser returns only safe event-type and shape facts; it does not copy raw payloads into the fixture.

### CodeMode metadata

OpenCode `1.18.4` reports the internal catalog lookup as completed metadata tool `$codemode_search`. PASS therefore requires exactly:

- `$codemode_search`
- `lsp_status`
- `codemode_probe_identity`
- `codemode_probe_json_error`

The nested plugin before/after contract remains exactly the three actual MCP calls; `$codemode_search` is metadata-only and must not be invented as a plugin hook event. Duplicates, missing entries, or any additional completed metadata tool fail PASS.

## Data Flow

1. Provider/model prerequisites and the no-install SDK allowlist pass before host execution.
2. Parent and attempt-local barriers require exact OpenCode `1.18.4`.
3. XDG/config/MCP registration barriers remain unchanged.
4. The model receives the exact existing CodeMode program.
5. The runner parses JSONL according to the `1.18.4` envelope, hook traces according to phase authority, and metadata using the separate four-tool set.
6. Cleanup completes before classification and fixture finalization.
7. PASS is allowed only when every existing requirement plus the new JSONL and metadata contracts succeeds.

## Error Handling and Safety

- Do not broaden accepted versions or event types.
- Do not infer success from model prose.
- Preserve current `SKIP`, `DEFER`, and `FAIL` precedence.
- Preserve no-install provider checks, attempt isolation, PID-ledger fail-closed cleanup, and sanitized fixture rules.
- A live run that reaches CodeMode but violates either new structural contract remains non-passing with the existing precise classification path.

## Testing

### RED

The migration RED tests failed against the prior `1.18.3` implementation:

- supported version and version barriers require `1.18.4` and reject `1.18.3` before later commands;
- the exported provider map is named for `1.18.4` and remains the exact official 24-item set;
- strict JSONL parsing accepts all six official event shapes and rejects missing envelope fields, unknown types, malformed lines, and wrong `part`/`error` payloads;
- PASS requires the exact four completed metadata entries while nested hooks still require only the three MCP tools.

### GREEN and regression

- The full CodeMode harness, `pnpm run typecheck`, and `git diff --check` passed.
- Product/runtime/package/generated paths have no delta.
- The isolated no-install current-source build, provider-backed `apai/gpt-5.6-terra` run, fixture validation, and cleanup completed as recorded below.

## Acceptance Criteria

- The tracked harness is pinned exclusively to OpenCode `1.18.4`.
- Provider routes match the official `1.18.4` 24-item bundled map.
- JSONL and completed metadata are validated structurally and exactly.
- PASS requires internally consistent, non-error provider-run JSONL aggregate facts, and direct LSP smoke requires the exact eight-tool multiset with no extras or duplicates.
- Full harness and typecheck pass.
- The live `apai/gpt-5.6-terra` run produces a sanitized structured result.
- PASS is reported only if all existing and migrated requirements hold; otherwise the exact non-passing result is reported without reinterpretation.
- The repository worktree contains only the approved uncommitted migration files.

## Completion Receipt — 2026-07-22

Task 1 was completed with RED coverage for the new exact-version/provider/JSONL/hook-metadata assertions and a final GREEN harness result of `73/73`. The implementation pins `1.18.4`, keeps the official 24-item provider map under its `1.18.4` ownership, rejects non-envelope JSONL safely, and keeps the three nested hooks independent from the four completed metadata entries.

Task 2 used a single cleanup transaction and an ephemeral strict-JSON apai-only provider config derived from the exact known JSONC user config. It retained only `provider.apai` plus valid `$schema`/enabled/disabled provider arrays, validated all apai SDK routes against the exact 24-item no-install allowlist, and never recorded provider contents or credentials. The build/probe ran from a disposable temp source/repository created with `git archive HEAD`, current-source overlay, temp-only Git initialization/commit for revision preflight, and a verified existing-repository `node_modules` junction. No project-repository Git write or main-repository build occurred; the built LSP wrapper exposed exactly eight canonical tools.

The first real isolated OpenCode `1.18.4` / `apai/gpt-5.6-terra` probe truthfully returned `DEFER/unclassifiable-output`, exit `4`: `OCMM_DEBUG="1"` caused ocmm plugin info diagnostics to contaminate provider-run stdout even though the official event rows themselves were valid. The strict parser was deliberately unchanged. A required RED test reproduced the state precisely (all barriers at debug `1`, provider run at `1`, null JSONL facts); the minimal fix gives only provider `run` a copied environment with `OCMM_DEBUG="0"`, preserving debug-enabled barriers, raw capture, cleanup, CLI log flags, and product runtime.

The one permitted toggle-proof rerun emitted `PASS/all-required-probes-passed`, exit `0`, and the refreshed sanitized fixture is therefore **GO**. It records host `1.18.4` with SHA-256 `59b66e1983b2665b498f234a17bf92e78e0e9e3f8c77406edf8dcf3e6239ee5c`, model `apai/gpt-5.6-terra`, isolated XDG/project config, ocmm/LSP/probe registration, exact outer code and result markers, an exact six-event JSONL sequence with six non-error parts and zero errors, all three nested hook identities, all four completed metadata identities including `$codemode_search`, denied-tool hiding, MCP counts `1/1/0`, and complete cleanup (one attempt, 16 tracked PIDs, zero remaining PIDs, one attempt root and the parent root removed). The focused regression, unchanged strict parser test, and final full harness are GREEN; final harness count is `74/74`. The actual disposable-source default fixture passed anchored receipt/exit, lexical and resolved confinement, schema/path/leak, version/model, and exact PASS-contract validation before its sanitized content alone refreshed the tracked fixture; approved OpenCode-temp fallbacks were cleanup-only and never copied. All temp config, raw output, build/source archive, junction, fallback, run roots, and owned processes were removed. No install, process kill, staging, project-repository commit, push, or tag occurred.

After that live result, post-live evidence hardening made the parsed JSONL aggregate independently load-bearing for PASS, required the direct-LSP parser to accept exactly the eight canonical names once each, and added a deterministic tracked-fixture acceptance regression. It locks the exact top-level and nested retained schemas and every PASS field, including host platform/revision/dirty-state/feature flag, denied-tool identity, and `allNestedToolsIdentified`. The existing fixture already has six events, six non-error parts, zero errors, and the exact eight-tool/registration evidence, so no paid rerun was needed. The current full harness is `75/75`.
