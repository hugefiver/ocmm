# CodeMode OpenCode 1.18.4 Baseline Migration Plan

> **Status:** The current complete revision received plan-critic verdict `[OKAY-UNAMBIGUOUS]` after post-live evidence hardening. Final implementation acceptance remains a separate Oracle/reviewer gate.

## Goal

Move the evidence-only CodeMode compatibility harness from the exact OpenCode `1.18.3` contract to the exact `1.18.4` contract, then obtain one isolated, sanitized `apai/gpt-5.6-terra` result without installing software or writing to the project Git repository.

## Final Scope and Constraints

The only allowed repository deltas are these seven paths:

1. `scripts/codemode-execute-compatibility.ts`
2. `scripts/codemode-execute-compatibility.test.ts`
3. `scripts/fixtures/opencode-codemode-execute-compatibility.json`
4. `docs/superpowers/specs/2026-07-20-codemode-execute-compatibility-design.md`
5. `docs/superpowers/plans/2026-07-20-codemode-execute-compatibility.md`
6. `docs/superpowers/specs/2026-07-22-codemode-opencode-1-18-4-design.md`
7. `docs/superpowers/plans/2026-07-22-codemode-opencode-1-18-4.md`

All changes remain unstaged and uncommitted. Do not alter `src/**`, manifests, lockfiles, prompts, skills, generated bundles, or the three executable CodeMode fixture programs. Do not install or upgrade OpenCode, packages, or SDKs. Do not terminate a user, historical-PID, or otherwise non-owned process.

The source baseline is OpenCode tag `v1.18.4`, commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e`. Its provider ownership remains the exact unchanged 24-item map, now named `OPENCODE_1_18_4_BUNDLED_PROVIDER_NPM_IDS`.

## Shipped 1.18.4 Contract

### Exported interface

The migration is defined by the current runner, not an earlier proposed API:

```ts
export const REQUIRED_NESTED_TOOLS = [
  "lsp_status",
  "codemode_probe_identity",
  "codemode_probe_json_error",
] as const

export const REQUIRED_COMPLETED_METADATA_TOOLS = [
  "$codemode_search",
  ...REQUIRED_NESTED_TOOLS,
] as const

export type OpenCodeRunJsonlEventType =
  "tool_use" | "step_start" | "step_finish" | "text" | "reasoning" | "error"

export type OpenCodeRunJsonlFacts = {
  eventCount: number
  eventTypes: OpenCodeRunJsonlEventType[]
  nonErrorPartCount: number
  errorEventCount: number
}

export function parseOpenCodeRunJsonl(text: string): OpenCodeRunJsonlFacts | null
```

`parseOpenCodeRunJsonl()` returns `null` for empty, malformed, unknown, or structurally invalid output. Every accepted row has a finite numeric `timestamp`, a non-empty `sessionID`, and exactly one of the six official event types. Non-error types require record-valued `part`; `error` requires an `error` property. Only the safe aggregate facts above enter normalized evidence or the sanitized fixture.

PASS independently requires those aggregate facts to be non-null with `eventCount > 0`, an event-type array of the same length, non-error plus error counts equal to the event count, and both `errorEventCount === 0` and `nonErrorPartCount === eventCount`. A violation fails closed as `provider-run-jsonl-invalid` before outer/hook PASS evidence.

Nested hook and completed-metadata checks are separate exact multisets:

- `nestedBefore` and `nestedAfter` each contain the three `REQUIRED_NESTED_TOOLS` exactly once.
- `completedMetadataTools` contains `$codemode_search` plus the same three tools exactly once.
- `$codemode_search` is metadata-only, never a nested plugin hook.
- A defect in either multiset is intentionally classified as `FAIL/nested-hook-count-invalid`; there is no second metadata-specific reason code.

Both parent preflight and every attempt-local barrier require exactly `1.18.4`. An unsupported but valid host version stops before later preflight commands or a model call, but still reaches outer cleanup, classification, fixture finalization, and the single result line.

### Debug environment boundary

`buildChildEnvironment()` creates the isolated base command environment with `OCMM_DEBUG="1"`. This remains the environment for the version, paths, config, and MCP registration barriers, so their ocmm diagnostics stay observable. Inside `runAttempt()`, only the provider `run` command receives a copied environment with `OCMM_DEBUG="0"`:

```ts
const commandEnv = name === "run" ? { ...env, OCMM_DEBUG: "0" } : env
```

The strict parser, `--print-logs`/`--log-level DEBUG` command flags, raw capture, cleanup, and product runtime are unchanged. Registration is already proven by the debug-enabled barriers; hook and MCP evidence remain active during the provider call.

## Task 1 — Historical RED and GREEN

1. RED coverage locked the exact host version, unchanged 24-provider map, six-event envelope, parent and attempt version barriers, and the separate three-hook/four-metadata requirements.
2. The initial migration GREEN full harness was `73/73`. It proved the new version and structural contract but was not live compatibility evidence.
3. During live QA, an additional regression exposed stdout contamination. That test increased the full-harness count to `74/74`; post-live JSONL/LSP/fixture evidence hardening increased it to `75/75`.

The applicable focused regression command is:

```powershell
node --test --experimental-strip-types `
  --test-name-pattern='strict CodeMode JSONL parser returns only safe structural facts|provider run disables plugin debug so JSONL stdout remains parseable' `
  scripts/codemode-execute-compatibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "strict JSONL/debug-boundary regression failed" }
```

## Task 2 — Safe Disposable Build and Live Transaction

Run this procedure as one PowerShell `try`/`finally` transaction below the approved `$env:LOCALAPPDATA\Temp\opencode` parent, resolving the actual parent once and never comparing short- and long-path aliases as strings. It is a historical reproducibility procedure, not a request to rerun the provider call during documentation-only work.

### 1. Establish the isolated QA root and provider file

1. Save every process environment value the transaction changes, including `GIT_DIR`, `GIT_WORK_TREE`, `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and transaction-only `OCMM_CODEMODE_*` values.
2. Create exactly one unique QA root under the approved parent. Store the temporary provider JSON, raw console output, archive, isolated source, fallback fixture, and all transaction evidence only below that root.
3. Read only the exact known user `opencode.json` path supplied to the transaction. It is JSONC; parse it with the installed TypeScript JSONC parser. Do not discover, print, or retain alternate user configuration paths.
4. Use `@(...)` for any candidate/filter collection, including a single known candidate, so PowerShell cannot turn a one-item collection into a scalar string.
5. Write strict JSON only to the QA root. Retain `provider.apai` and, if valid, `$schema`, `enabled_providers`, and `disabled_providers`. Do not print, log, copy, scan, or retain the source config, provider object, API key, base URL, authorization value, or credential-bearing environment values.
6. Require `apai/gpt-5.6-terra` to be explicitly declared and validate every effective apai SDK route against the exact 24-item `1.18.4` bundled map before a host call. This is a no-install precondition.

### 2. Build only a disposable current-source repository

The main repository was not built. Its wrapper was inspected and found missing or noncanonical, so no repository `dist` was written and no existing OpenCode process was stopped.

1. Create `<qaRoot>\source` from `git archive HEAD`, then overlay the current required runner/build/runtime tracked content while excluding `.git`, `node_modules`, `dist`, and Rust build output.
2. Initialize a **disposable** Git repository only inside `<qaRoot>\source`, add and commit the archived baseline only as needed for the runner's revision preflight, then apply the current overlay. These temporary Git writes are permitted solely under the disposable QA root; no project-repository Git write occurs.
3. Create `<qaRoot>\source\node_modules` as a junction to the existing repository `node_modules`. Confirm `Get-Item ... .LinkType -eq "Junction"` before using or later removing it.
4. Build only from the disposable source:

   ```powershell
   pnpm --dir $tempSource --config.verify-deps-before-run=false run build
   if ($LASTEXITCODE -ne 0) { throw "isolated no-install build failed" }
   ```

5. Smoke the built wrapper from that source with `tools/list`; it must expose the exact eight-name multiset—`status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`—each exactly once. An extra ninth tool or a duplicate canonical name fails.

### 3. Run and validate the real probe

1. Run the runner from the disposable source working directory, not from the main repository. Supply the temporary provider JSON and the exact model `apai/gpt-5.6-terra`; use the runner's default fixture destination so the primary fixture is `<tempSource>\scripts\fixtures\opencode-codemode-execute-compatibility.json`.
2. Redirect console output and raw stdout/stderr only to QA-root files. Do not print or retain those raw files.
3. Parse exactly one receipt with this anchored grammar:

   ```text
   ^OCMM_CODEMODE_RESULT=(PASS|FAIL|SKIP|DEFER):[a-z0-9][a-z0-9-]*:<absolute-path>$
   ```

   Require exit mappings `PASS=0`, `FAIL=2`, `SKIP=3`, and `DEFER=4`.
4. Before reading the emitted fixture, require both lexical and resolved-path containment. The only approved targets are the disposable source default fixture and a fallback directly below the approved OpenCode temp parent.
5. Read only the actual sanitized fixture. Validate its whitelist schema, status/reason/exit agreement, leak scan, exact host version, exact provider model, isolation, plugin and MCP registration, direct eight-tool smoke, outer execute counts and safe markers, JSONL facts, nested hooks, completed metadata, MCP counts, and cleanup facts.
6. For a `PASS`, require `all-required-probes-passed`, `GO`, the exact three nested sets, the exact four metadata set, classifiable output, one outer before and after pair, exact code/result markers, denied-tool hiding, MCP `1/1/0`, a complete PID ledger, zero remaining PIDs, removed attempt roots, and a removed parent root. A non-PASS result remains its actual status; it must not be reinterpreted as PASS.
7. Copy content to `scripts/fixtures/opencode-codemode-execute-compatibility.json` in the main repository **only** after the source-default fixture passes every validation above. An approved-temp fallback is cleanup-only: remove it, do not copy it, and fail the transaction rather than refresh the tracked fixture.

### 4. Always clean up

In `finally`, restore each saved environment value; remove temporary provider JSON, raw output, archive, fallback fixture, run roots, and disposable source. Before deleting the source, remove `node_modules` only after reconfirming it is the verified junction; never recursively delete its target. The transaction observes only its recorded child evidence and never invokes `Stop-Process`, `taskkill`, or historical-PID termination. A retained root, fallback, junction, or owned-process residue is a transaction failure and must not produce a completed receipt.

## Runtime-Discovered Debug Contamination — TDD Record

The first valid live run used provider-run `OCMM_DEBUG="1"` and truthfully returned `DEFER/unclassifiable-output`, exit `4`. The official six JSONL events were valid, but ocmm info diagnostics were interleaved on stdout; stderr was not the cause. The parser therefore correctly returned no JSONL facts and was deliberately not relaxed or filtered.

The regression test `provider run disables plugin debug so JSONL stdout remains parseable` was written first. Its fake command proves barrier debug values are `1`, reproduces the null JSONL result when provider-run debug is `1`, and requires provider-run debug `0` with a valid parsed event while the parent environment remains unchanged. The focused test was RED before the one-line copied-environment change above and GREEN afterwards. The live toggle proof then ran once and passed without modifying parser rules, command log flags, raw capture, cleanup, or product runtime.

Post-live evidence hardening used RED tests for two independent gaps: otherwise passing facts with null, empty, count-inconsistent, or error-bearing JSONL aggregates incorrectly passed; and direct LSP smoke accepted an extra ninth tool. The minimal GREEN guards reject the former as `FAIL/provider-run-jsonl-invalid` and require the exact direct-LSP multiset. A third regression reads the already tracked sanitized fixture and verifies its entire PASS acceptance contract: exact top-level and nested-object schemas plus every retained field, including host platform/revision/dirty-state/feature flag, `deniedTool`, and `allNestedToolsIdentified`. It was intentionally GREEN immediately. The fixture already records the stronger six-event/non-error-zero-error and exact tool evidence, so no provider/model rerun was necessary.

## Recorded Live Evidence

- Host receipt: `PASS/all-required-probes-passed`, exit `0`.
- Host: OpenCode `1.18.4`; SHA-256 `59b66e1983b2665b498f234a17bf92e78e0e9e3f8c77406edf8dcf3e6239ee5c`.
- Model: `apai/gpt-5.6-terra`; disposable source revision `15404c9`, intentionally dirty after current-source overlay.
- Build/smoke: exact 24-provider map validated; isolated no-install build succeeded; wrapper exposed exactly eight tools.
- JSONL: six events in order `step_start`, `tool_use`, `step_finish`, `step_start`, `text`, `step_finish`; six non-error parts and zero error events.
- Hooks/metadata: nested before/after `3/3`; completed metadata `4`, including `$codemode_search`.
- MCP and permissions: `identity/json_error/denied` counts `1/1/0`; denied tool hidden and not called.
- Cleanup: one attempt, 16 tracked PIDs, zero remaining PIDs, one removed attempt root, and removed parent root.
- Fixture provenance: the validated sanitized disposable-source default fixture, not a fallback, was the sole source copied to the tracked fixture.

## Final Verification and Documentation-Correction Gates

The historical implementation gates were green:

```powershell
node --test --experimental-strip-types --test-reporter=spec scripts/codemode-execute-compatibility.test.ts
pnpm run typecheck
git diff --check
```

The current full harness result is `75/75`. Typecheck runs with ambient `OCMM_PROFILE` and `OCMM_NO_PROFILE` absent for its child process. Do not rerun the provider/model transaction for this evidence hardening.

Read all four synchronized documents after editing. Confirm all Markdown fences are paired, all tables retain matching headers/separators, and completed-plan checkboxes are not introduced as pending implementation work. Scan the four documents for obsolete interface names and obsolete current-scope wording; the scan must have no match. A self-contained PowerShell form avoids embedding the obsolete complete tokens in this document:

```powershell
$docs = @(
  "docs/superpowers/specs/2026-07-20-codemode-execute-compatibility-design.md",
  "docs/superpowers/plans/2026-07-20-codemode-execute-compatibility.md",
  "docs/superpowers/specs/2026-07-22-codemode-opencode-1-18-4-design.md",
  "docs/superpowers/plans/2026-07-22-codemode-opencode-1-18-4.md"
)
$forbidden = @(
  ('REQUIRED_NESTED' + '_HOOK_TOOLS'),
  ('parseOpenCode' + 'Jsonl'),
  ('OpenCodeJsonl' + 'ParseResult'),
  ('completed' + '-metadata-count-invalid'),
  ('eight' + ' CodeMode'),
  ('eight' + '-CodeMode')
)
foreach ($token in $forbidden) {
  rg -n --fixed-strings $token $docs
  if ($LASTEXITCODE -eq 0) { throw "obsolete documentation token remains: $token" }
  if ($LASTEXITCODE -ne 1) { throw "documentation scan failed: $token" }
}
```

Finally require no staged content, exactly the seven allowlisted paths changed or untracked, no protected product/package/generated delta, and no delta to the three executable fixture programs. Run `git diff --check` plus no-index whitespace checks for both untracked migration documents. No Git write belongs to this plan.

## Plan Self-Review

- **Interface consistency:** The only named parser/types/constants are the current runner exports, and hook plus metadata defects share the shipped classification.
- **Procedure consistency:** The build and probe use a disposable source/repository; only its validated default sanitized fixture may refresh the tracked fixture; fallbacks are removed.
- **TDD consistency:** The historic `73/73` migration result, debug-contamination RED, copied-environment GREEN, live toggle PASS, post-live JSONL/LSP RED, fixture-test immediate GREEN, and final `75/75` are distinguished.
- **Scope and safety:** The seven-path, unstaged, no-install, no-project-Git-write, no-non-owned-process-kill constraints are explicit.
- **Plan-critic state:** The current complete revision received `[OKAY-UNAMBIGUOUS]` after the post-live JSONL, direct-LSP, and tracked-fixture evidence hardening. This plan receipt does not substitute for final implementation acceptance.
