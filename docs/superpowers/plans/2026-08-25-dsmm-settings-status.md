# DSMM v0.8 Settings and Status Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DSMM v0.8 as a deterministic, defensive status snapshot/formatter plus a fixed `/dsmm-status [json]` host command, with shipped Web/headless/future-TUI documentation and pinned DSH rc.2 packaged-runtime proof.

**Architecture:** Add one pure `status.ts` module that derives scope, current route, calibration action, runtime-recovery applicability, and a deep defensive settings copy from the current agent/settings/mode inputs. Register one fixed status command beside the existing configurable deepwork command in the settings-ready child; export the pure seam for future adapters, but add no browser/client implementation, settings writer, provider lookup, or private event bridge. Generate working-tree `dsmm/lib/**` only in the final task, once for each complete source revision that reaches final review.

**Tech Stack:** TypeScript 6 ESM/NodeNext, Node.js 22 `node:test`, Schemastery, Cordis `^4.0.1`, DeepSeek Harness `@deepseek-ai/dsh@0.1.1-rc.2`, pnpm workspace, npm pack dry-run, and Docker packaged-runtime smoke.

**Spec:** `docs/superpowers/specs/2026-08-25-dsmm-settings-status-design.md`

**Global Constraints:**
- The design targets `@deepseek-ai/dsh@0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.
- The function is deterministic and side-effect free.
- `policyEffort` is the desired DSMM policy, not a claim that the adapter advertises or has already applied that effort.
- `effectiveSettings` is a defensive plain-object copy. Arrays and nested objects must not alias the settings getter's value.
- No status computation calls `ctx.llm.resolveModelInfo()`, changes request state, or performs a provider/network operation.
- The handler reads settings and mode state at invocation time.
- No settings update command is added; writes remain owned by the DSH settings surface and settings file.
- No custom settings card is shipped in v0.8.
- The fixed DSH release has no official TUI bundle.
- DSMM does not invent a private event bridge.
- This implementation writes no browser component, styling, asset, or client bundle.
- no custom Web settings card or standalone panel;
- no React, CSS, browser bundle, or visual design system;
- no settings mutation command;
- no provider capability or network lookup during status calculation;
- no exposure of process-local runtime-recovery pending state or counters;
- no Git commit, push, version bump, or release.
- Preserve every reviewed v0.6/v0.7 source, test, documentation, generated output, and verification contract not listed above.
- 不得覆盖、stash、reset或独立重构。
- 不得引入custom panel、React、settings write command或provider call。
- Tasks final前不得生成working-tree `dsmm/lib/**`；最终task对每完整source revision仅一次权威generation。
- 任何reviewer source/test/docs/package/smoke修正必须使lib/gates/packet/receipts全部失效并从final generation重启。
- 用OS-temp mirror运行targeted RED/GREEN，PowerShell命令必须正确，禁止bash语法、不能依赖PowerShell wildcard不展开问题。
- Root flaky规则：每source revision root test一次；失败精确报告，不允许unchanged retry，除非用户明确批准documented evidence exception。不得把之前v0.7例外自动延续。
- no dependency install/no Git write/no paid provider/no frontend visual QA；保留Docker pre-existing run state和nonowned image，清理run-owned artifacts。

---

## Requirement and evidence map

| Approved requirement | Implementation task | Primary evidence |
|---|---|---|
| Pure current-state snapshot, header/options route precedence, scope, exact family/route classification | Task 1 | `dsmm/test/status.test.ts` snapshot tables |
| Complete calibration action matrix, runtime-recovery applicability, deep defensive settings copy | Task 1 | action-table and alias regressions in `dsmm/test/status.test.ts` |
| Bounded deterministic human formatter with unavailable/provider-default rendering | Task 2 | exact eight-line formatter assertions in `dsmm/test/status.test.ts` |
| Fixed command, absent service no-op, `ctx.get()`, human/JSON/invalid/live settings and mode | Task 3 | `dsmm/test/commands.test.ts` |
| One deepwork command plus one status command in the settings-ready child | Task 3 | `dsmm/test/settings.test.ts` root `apply()` integration |
| Root exports, generated declarations, shipped docs/package inventory | Task 4 | `dsmm/test/package.test.ts`, `dsmm/docs/settings-status.md` |
| Web command UI, headless file settings, future TUI seam, and explicit no-frontend decision | Task 4 | README/docs package assertions and absence checks |
| Pinned rc.2 packaged command execution, human/JSON equality, no provider call, and exact host-owned command lifecycle events | Task 5 | `DSMM_STATUS_COMMAND_OK`, static smoke asset test |
| Roadmap only after runtime proof; authoritative generation; DSMM/pack/Docker/root gates | Task 6 | ordered final gate log and exact 13-marker receipt |
| One canonical identity approved by Oracle and primary Reviewer | Task 6 | two five-field receipts with the same recomputed identity |

## File map

### New focused files

- Create `dsmm/src/status.ts` — pure status snapshot, full defensive settings copy, calibration action selection, and bounded human formatter.
- Create `dsmm/test/status.test.ts` — pure snapshot, action matrix, route precedence, alias protection, and exact formatter tests.
- Create `dsmm/docs/settings-status.md` — command, JSON schema/version, Web/headless/future-TUI behavior, normalized settings-file shape, and non-goals.

### Existing source, tests, package, and runtime proof

- Modify `dsmm/src/commands.ts` — fixed `DSMM_STATUS_COMMAND`, invocation-time snapshot handler, and optional command-service registration.
- Modify `dsmm/test/commands.test.ts` — status command service, input, output, live getter/mode, and no-mutation tests while preserving deepwork command coverage.
- Modify `dsmm/src/index.ts` — register status immediately after deepwork command and export the approved public surface.
- Modify `dsmm/test/settings.test.ts` — assert exactly two settings-ready child commands in order and no root duplicate.
- Modify `dsmm/test/package.test.ts` — source/runtime/type exports, generated status files/declarations, shipped docs, README link, and no-frontend package contract.
- Modify `dsmm/package.json` — ship only `docs/settings-status.md`; add no dependency, export subpath, browser field, or client script.
- Modify `dsmm/README.md` — v0.8 command examples and Web/headless/future-TUI behavior.
- Modify `dsmm/scripts/docker-smoke.mjs` — execute both status command forms through pinned rc.2 and print `DSMM_STATUS_COMMAND_OK` once.
- Modify `dsmm/test/docker-smoke-assets.test.ts` — lock the 13-marker order/count, command calls, no-provider/exact-lifecycle assertions, and owned cleanup.
- Modify `dsmm/docs/roadmap.md` only in Task 6 after Task 5 packaged runtime proof succeeds.

### Generated output

- Regenerate only in Task 6: `dsmm/lib/**` — add `status.js`, `status.d.ts`, maps, updated `commands.*` and `index.*`, while preserving every reviewed v0.6/v0.7 generated module.

## Shared-file overlap and ownership

| Shared file/surface | Existing reviewed content to preserve | Owning v0.8 task |
|---|---|---|
| `dsmm/src/commands.ts` | configurable deepwork parse/steer behavior and `ctx.get()` fallback | Task 3 appends status registration only |
| `dsmm/src/index.ts` | recovery-before-routing root order and all v0.1-v0.7 exports | Task 3 adds child registration; Task 4 adds exports |
| `dsmm/test/package.test.ts` | exact v0.6/v0.7 docs, exports, and type checks | Task 4 extends arrays/assertions without replacing them |
| `dsmm/package.json` | pinned rc.2 dependencies/scripts and existing explicit docs inventory | Task 4 adds one docs entry only |
| `dsmm/README.md` | all v0.1-v0.7 sections/configuration | Task 4 appends v0.8 guidance |
| `dsmm/scripts/docker-smoke.mjs` | package resolution, routing/recovery/safety/LSP proof and cleanup | Task 5 adds one isolated status smoke |
| `dsmm/test/docker-smoke-assets.test.ts` | exact 12-marker sequence and all existing static contracts | Task 5 extends to 13 markers and one call |
| `dsmm/docs/roadmap.md` | accepted v0.6/v0.7 status and future scope | Task 6 changes v0.8 status only after proof |
| `dsmm/lib/**` | reviewed v0.6/v0.7 generated package | Task 6 only, one generation per complete source revision |

## Dependency order, handoff, and invalidation protocol

1. The orchestrator captures HEAD, full status, and a byte-sensitive `dsmm/lib/**` baseline before Task 1.
2. The orchestrator gives each fresh worker the complete text of only its current task, the Global Constraints, the required upstream interfaces, the approved spec path/excerpts, and the captured lib identity. Do not tell an implementation worker to read this whole plan; task handoff is orchestrator-owned.
3. Tasks 1-2 build the pure API. Task 3 consumes it for command/root behavior. Task 4 publishes that completed surface. Task 5 proves the packed command against pinned rc.2. Task 6 is the sole working-tree generation/final-review boundary.
4. During the initial implementation cycle, after every Task 1-5 return, the orchestrator checks the named GREEN evidence and exact file boundary, then recomputes `dsmm/lib/**` identity and requires equality with the pre-Task-1 baseline.
5. The current v0.7 accepted identity `sha256:2bc441189d2469187b9e3495cd28b4df18c48be400095a57fc2d10c0e40c53cf` is provenance only. Adding the v0.8 spec/plan and implementation changes the current canonical working-tree identity; never reuse the v0.7 identity as v0.8 evidence.
6. Suggested commit messages mark independently reviewable boundaries only. No task runs `git add`, `git commit`, `git push`, `git tag`, or another Git write.
7. Any validated source/test/docs/package/smoke correction after Task 6 generation invalidates DSMM gates, pack evidence, Docker evidence, root gates, identity packet, and both receipts. At correction-cycle entry, freeze the current generated `dsmm/lib/**` identity as that cycle's stale baseline and assign it to `$expectedLibIdentity`. Return to the owning task and preserve that exact stale identity through its OS-temp RED/GREEN correction. If compiled `dsmm/src/**` changed, the owning task must return exact `$correctionStaleTests` paths and one `$correctionExpectedStaleAssertion`; restart Task 6 with that targeted stale-output RED before overwriting the stale generated tree exactly once. If only tests/docs/package/smoke changed, retain the owning task's specific RED/GREEN evidence and do not fabricate a generated-output failure. Task 6 still performs one authoritative generation for the corrected complete revision. Never require or attempt to restore the original pre-v0.8 generated bytes.
8. Root `pnpm test` runs exactly once for each complete source revision reaching final review. A failure blocks that revision and is reported verbatim; an unchanged retry is forbidden unless the user explicitly authorizes a documented evidence exception for that exact failure. No v0.7 exception or receipt carries forward.

## Pre-task preservation receipt and OS-temp targeted TDD helper

Before Task 1, run this read-only PowerShell receipt from the repository root. Record the printed identity in orchestrator task state and include its literal value in each Task 1-5 handoff.

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD: $head" }
git status --short

function Get-DsmmLibIdentity {
  $paths = @(git ls-files --cached --others --exclude-standard -- "dsmm/lib") | Sort-Object
  if ($LASTEXITCODE -ne 0) { throw "cannot enumerate dsmm/lib" }
  $rows = foreach ($path in $paths) {
    $hash = (@(git hash-object -- "$path") -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $hash -notmatch '^[0-9a-f]{40,64}$') { throw "cannot hash $path" }
    "$path`t$hash"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return "sha256:" + [Convert]::ToHexString($sha.ComputeHash($bytes)).ToLowerInvariant() }
  finally { $sha.Dispose() }
}

$dsmmLibBaselineIdentity = Get-DsmmLibIdentity
$expectedLibIdentity = $dsmmLibBaselineIdentity
$dsmmLibBaselineIdentity
```

Define this helper once in the orchestrator implementation session. It copies current DSMM inputs into one exact OS-temp mirror, junctions only the already-present dependency directory, generates only the mirror's `lib`, runs explicit test paths, and removes only the verified owned mirror.

```powershell
function Invoke-DsmmSettingsStatusMirrorTests {
  param([Parameter(Mandatory = $true)][string[]]$Tests)

  $workspaceRoot = (Resolve-Path -LiteralPath ".").Path
  $dsmmRoot = Join-Path $workspaceRoot "dsmm"
  $tempParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "OS temp parent is unavailable: $tempParent" }
  $mirror = Join-Path $tempParent ("dsmm-settings-status-test-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $mirror | Out-Null

  try {
    foreach ($directory in @("src", "test", "skills", "prompts", "agent-presets", "docs", "patches", "scripts", "docker")) {
      $sourceDirectory = Join-Path $dsmmRoot $directory
      if (Test-Path -LiteralPath $sourceDirectory -PathType Container) {
        Copy-Item -LiteralPath $sourceDirectory -Destination (Join-Path $mirror $directory) -Recurse
      }
    }
    foreach ($file in @("package.json", "tsconfig.json", "tsconfig.test.json", "cordis.patch.yml", "README.md")) {
      Copy-Item -LiteralPath (Join-Path $dsmmRoot $file) -Destination (Join-Path $mirror $file)
    }

    $existingModules = Join-Path $dsmmRoot "node_modules"
    if (-not (Test-Path -LiteralPath $existingModules -PathType Container)) {
      throw "dsmm/node_modules must already exist; do not install from this helper"
    }
    New-Item -ItemType Junction -Path (Join-Path $mirror "node_modules") -Target $existingModules | Out-Null

    pnpm --dir $dsmmRoot exec tsc -p (Join-Path $mirror "tsconfig.json")
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM source build failed" }
    $resolvedTests = @($Tests | ForEach-Object { Join-Path $mirror $_ })
    node --test --experimental-strip-types $resolvedTests
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM targeted test failed" }
  } finally {
    $resolvedMirror = [IO.Path]::GetFullPath($mirror)
    $expectedPrefix = [IO.Path]::GetFullPath($tempParent + [IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedMirror.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or $resolvedMirror -eq $expectedPrefix.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
      throw "refusing to remove unexpected mirror path: $resolvedMirror"
    }
    Remove-Item -LiteralPath $resolvedMirror -Recurse -Force
  }
}
```

For each RED, accept only the named missing module/symbol/assertion as the expected failure; compiler, dependency, environment, or unrelated v0.6/v0.7 regression failures are blockers. For each GREEN, require exit `0`. In the initial cycle, `$expectedLibIdentity` equals `$dsmmLibBaselineIdentity`. In a post-review correction cycle, capture `$correctionStaleLibIdentity = Get-DsmmLibIdentity`, assign `$expectedLibIdentity = $correctionStaleLibIdentity`, and record whether compiled `dsmm/src/**` changes require a generated-output RED. If they do, the owning task must return a non-empty explicit `$correctionStaleTests` path array and one non-empty `$correctionExpectedStaleAssertion` identifying its stale-runtime failure. After every Task 1-5 GREEN, require `Get-DsmmLibIdentity` to equal `$expectedLibIdentity`; do not require the initial baseline or absence of already-generated status modules during correction cycles.

---

### Task 1: Pure status snapshot, calibration matrix, and defensive settings copy

**Files:**
- Create: `dsmm/src/status.ts`
- Create: `dsmm/test/status.test.ts`

**Interfaces:**
- Consumes: `DshAgent`; `DsmmSettings`, `DeepseekCalibration`; `DeepworkModeController.active()` result supplied as `modeActive`; `resolveSelectedAgentPreset()`; `isDsmmRoleId()`; `classifyModelFamily()`; `isDeepseekV4ProRoute()`; and the complete current v0.7 settings shape.
- Produces:
  - `export const DSMM_STATUS_VERSION = 1 as const`
  - `export interface DsmmStatusSnapshot` exactly as specified, including `mode`, `route`, `calibration`, `runtimeRecovery`, and `effectiveSettings`.
  - `export function createDsmmStatusSnapshot(input: { agent: DshAgent; settings: DsmmSettings; modeActive: boolean }): DsmmStatusSnapshot`
- Integration boundary: this task is pure. It imports no context/commands/LLM runtime, registers nothing, mutates nothing, catches no speculative host errors, and performs no provider/capability/network operation.

- [ ] **Step 1: Create the failing snapshot fixtures and base scenarios**

In `status.test.ts`, import `node:test`, `node:assert/strict`, `createDsmmStatusSnapshot`/`DSMM_STATUS_VERSION` from `../lib/status.js`, and current defaults/types. Use a fixture whose session has mutable `events`, optional `header.agentPreset`, optional `requestHeader()`, and an `append()` that increments a counter.

Cover these exact base snapshots:

```ts
const inactive = createDsmmStatusSnapshot({
  agent: { session: { events: [], append() {} } },
  settings: {
    ...DEFAULT_DSMM_SETTINGS,
    runtimeRecovery: { ...DEFAULT_DSMM_SETTINGS.runtimeRecovery, enabled: true }
  },
  modeActive: false
});
assert.equal(inactive.version, DSMM_STATUS_VERSION);
assert.deepEqual(inactive.mode, {
  name: "deepwork",
  active: false,
  dsmmPreset: false,
  inScope: false
});
assert.deepEqual(inactive.route, {
  family: "unknown",
  deepseekV4Pro: false
});
assert.deepEqual(inactive.calibration, {
  mode: "auto",
  applies: false,
  action: "out-of-scope"
});
assert.equal(inactive.runtimeRecovery.enabled, true);
assert.equal(inactive.runtimeRecovery.applies, false);
```

Also assert active generic deepwork on `{ provider: "openai", model: "gpt-5.6" }` reports family `gpt`, `inScope: true`, `deepseekV4Pro: false`, and action `non-target-route`. Assert a selected `dsmm-reviewer` from the newest valid preset event creates preset-only scope while `modeActive` is false.

- [ ] **Step 2: Add the failing route-source and complete calibration-action tables**

Lock route selection to this precedence:

1. If `session.requestHeader()` returns a header, use only string `header.config.provider`, `header.config.model`, and `header.config.reasoningEffort`; malformed header fields remain absent rather than being filled from stale options.
2. Only when no request header exists, use string `agent.options.provider/model`; non-string option values remain absent.
3. Classify the chosen provider/model with `classifyModelFamily()` and authorize calibration only with exact `isDeepseekV4ProRoute()`.

Use exact official route cases for this action table:

| Calibration | Scope | Exact route | Current effort | Expected action | `applies` | `policyEffort` |
|---|---:|---:|---|---|---:|---|
| `off` | yes | yes | absent | `disabled` | false | absent |
| `auto` | no | yes | absent | `out-of-scope` | false | absent |
| `auto` | yes | no | absent | `non-target-route` | false | absent |
| `auto` | yes | yes | `high` | `preserve-explicit` | true | configured/default policy |
| `auto` | yes | yes | absent | `fill-missing` | true | configured/default policy |
| `strict` | yes | yes | `low` | `enforce` | true | configured/default policy |

For ordinary active scope require the configured `deepseekV4ProDefaultReasoningEffort`; for selected `dsmm-reviewer` included in `deepseekV4ProMaxReasoningPresets`, require `max`. Remove that preset from the configured list and require the default effort. `policyEffort` is absent whenever `applies` is false.

- [ ] **Step 3: Add failing runtime-recovery and deep-alias assertions**

Use settings with two fallback routes and non-default nested guard/LSP/runtime values. Assert:

```ts
assert.deepEqual(snapshot.runtimeRecovery, {
  enabled: true,
  applies: true,
  fallbackRouteCount: 2,
  maxFallbackAttempts: 2,
  idleContinuation: { enabled: true, maxContinuations: 3 }
});
assert.notStrictEqual(snapshot.effectiveSettings, settings);
assert.notStrictEqual(snapshot.effectiveSettings.deepseekV4ProMaxReasoningPresets, settings.deepseekV4ProMaxReasoningPresets);
assert.notStrictEqual(snapshot.effectiveSettings.skills, settings.skills);
assert.notStrictEqual(snapshot.effectiveSettings.roles, settings.roles);
assert.notStrictEqual(snapshot.effectiveSettings.presets, settings.presets);
assert.notStrictEqual(snapshot.effectiveSettings.workflow, settings.workflow);
assert.notStrictEqual(snapshot.effectiveSettings.guards, settings.guards);
assert.notStrictEqual(snapshot.effectiveSettings.guards.toolOutputTruncation, settings.guards.toolOutputTruncation);
assert.notStrictEqual(snapshot.effectiveSettings.guards.questionLabelHelper, settings.guards.questionLabelHelper);
assert.notStrictEqual(snapshot.effectiveSettings.runtimeRecovery, settings.runtimeRecovery);
assert.notStrictEqual(snapshot.effectiveSettings.runtimeRecovery.retryOnStatusCodes, settings.runtimeRecovery.retryOnStatusCodes);
assert.notStrictEqual(snapshot.effectiveSettings.runtimeRecovery.retryOnCodes, settings.runtimeRecovery.retryOnCodes);
assert.notStrictEqual(snapshot.effectiveSettings.runtimeRecovery.fallbackRoutes, settings.runtimeRecovery.fallbackRoutes);
assert.notStrictEqual(snapshot.effectiveSettings.runtimeRecovery.fallbackRoutes[0], settings.runtimeRecovery.fallbackRoutes[0]);
assert.notStrictEqual(snapshot.effectiveSettings.runtimeRecovery.idleContinuation, settings.runtimeRecovery.idleContinuation);
assert.notStrictEqual(snapshot.effectiveSettings.lsp, settings.lsp);
assert.notStrictEqual(snapshot.effectiveSettings.lsp.args, settings.lsp.args);
assert.notStrictEqual(snapshot.effectiveSettings.lsp.env, settings.lsp.env);
assert.equal(snapshot.effectiveSettings.runtimeRecovery.idleContinuation.prompt, settings.runtimeRecovery.idleContinuation.prompt);
```

Mutate every copied array/object after snapshot creation and assert the source settings stay unchanged; mutate source nested values and assert the snapshot stays unchanged. Count session `append()` calls and require zero.

- [ ] **Step 4: Run RED**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/status.test.ts")
```

Expected: FAIL only because `lib/status.js`, `DSMM_STATUS_VERSION`, `DsmmStatusSnapshot`, and `createDsmmStatusSnapshot()` do not exist.

- [ ] **Step 5: Implement the minimal pure snapshot and exhaustive plain-object copy**

Implement route extraction and action precedence directly:

```ts
const header = input.agent.session.requestHeader?.();
const provider = header === undefined
  ? stringValue(input.agent.options?.provider)
  : stringValue(header.config?.provider);
const model = header === undefined
  ? stringValue(input.agent.options?.model)
  : stringValue(header.config?.model);
const currentReasoningEffort = header === undefined ? undefined : stringValue(header.config?.reasoningEffort);
const selectedPreset = resolveSelectedAgentPreset(input.agent.session);
const dsmmPreset = isDsmmRoleId(selectedPreset);
const inScope = input.modeActive || dsmmPreset;
const deepseekV4Pro = provider !== undefined && model !== undefined
  && isDeepseekV4ProRoute({ provider, model });
const policy = selectedPreset !== undefined
  && input.settings.deepseekV4ProMaxReasoningPresets.includes(selectedPreset as never)
  ? "max"
  : input.settings.deepseekV4ProDefaultReasoningEffort;
```

Avoid the illustrative cast in final code by narrowing through `isDsmmRoleId(selectedPreset)` before membership. Select actions strictly in spec order: `off`, out-of-scope, non-target route, auto with explicit effort, auto without effort, strict. Set `applies` only for the final three applicable actions and include `policyEffort` only when applicable.

Implement a private `copyDsmmSettings(settings: DsmmSettings): DsmmSettings` that explicitly copies every current top-level field and every nested object/array listed in Step 3. Do not use JSON serialization, preserve the idle prompt string, and do not expose recovery pending maps/counters.

- [ ] **Step 6: Run GREEN and prove purity/no working-tree generation**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/status.test.ts", "test/model-family.test.ts", "test/model-routing.test.ts", "test/session-scope.test.ts")
rg -n "resolveModelInfo|fetch\(|https?://|agent/request|\.append\(|\.steer\(|ctx\." "dsmm/src/status.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed before Task 6: $currentLibIdentity" }
```

Expected: named tests PASS; prohibited-side-effect search prints nothing; working-tree lib identity remains the reviewed v0.7 baseline.

**Suggested commit boundary (do not execute):** `feat(dsmm): add pure status snapshots`

---

### Task 2: Deterministic bounded human formatter

**Files:**
- Modify: `dsmm/src/status.ts`
- Modify: `dsmm/test/status.test.ts`

**Interfaces:**
- Consumes: Task 1 `DsmmStatusSnapshot` only.
- Produces: `export function formatDsmmStatus(snapshot: DsmmStatusSnapshot): string`.
- Integration boundary: formatter-only work; no command/context access, JSON mode, settings read, provider lookup, event mutation, prompt rendering, or error catch.

- [ ] **Step 1: Add the failing exact eight-line formatter fixture**

Construct a Task 1 snapshot for inactive mode plus selected `dsmm-reviewer`, exact `deepseek-official/deepseek-v4-pro`, explicit current effort `high`, auto/max policy, enabled applicable recovery with two fallbacks, and disabled idle continuation. Require exact text:

```text
DSMM status
Mode: inactive (deepwork)
Scope: dsmm-reviewer preset
Route: deepseek-official/deepseek-v4-pro [deepseek]
Reasoning: auto; policy=max; current=high; action=preserve-explicit
Runtime recovery: enabled; applies=yes; fallbacks=2; max attempts=2
Idle continuation: disabled; max=3
Effective settings: use /dsmm-status json for the normalized snapshot
```

Assert `output.split("\n").length === 8` and no trailing newline.

- [ ] **Step 2: Add failing unavailable/default/scope and content-exclusion assertions**

Require an inactive ordinary snapshot to render:

- `Scope: out of scope`;
- `Route: unavailable/unavailable [unknown]`;
- `Reasoning: auto; policy=not applicable; current=provider default; action=out-of-scope`.

Require active generic deepwork to render `Scope: active deepwork`. Put a distinctive idle continuation prompt and a provider-error-like string into the snapshot's effective settings fixture, then assert neither appears in formatted text. Assert no JSON object dump, prompt body, stack, provider failure body, credential-like value, or session event appears.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/status.test.ts")
```

Expected: FAIL only because `formatDsmmStatus()` is absent or does not produce the exact bounded lines.

- [ ] **Step 4: Implement the minimal formatter**

Derive labels without reading anything outside the snapshot:

```ts
const scope = snapshot.mode.dsmmPreset && snapshot.mode.selectedPreset !== undefined
  ? `${snapshot.mode.selectedPreset} preset`
  : snapshot.mode.inScope ? "active deepwork" : "out of scope";
const route = `${snapshot.route.provider ?? "unavailable"}/${snapshot.route.model ?? "unavailable"} [${snapshot.route.family}]`;
const reasoning = `${snapshot.calibration.mode}; policy=${snapshot.calibration.policyEffort ?? "not applicable"}; current=${snapshot.route.currentReasoningEffort ?? "provider default"}; action=${snapshot.calibration.action}`;
```

Join the exact eight lines from Step 1 with `"\n"`. Render enabled/disabled and yes/no exactly; mention the JSON command instead of serializing `effectiveSettings` into human output.

- [ ] **Step 5: Run GREEN and preserve the pure boundary**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/status.test.ts")
rg -n "JSON\.stringify|resolveModelInfo|fetch\(|\.append\(|\.steer\(|ctx\." "dsmm/src/status.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed before Task 6: $currentLibIdentity" }
```

Expected: status tests PASS; prohibited formatter operations print no matches; lib identity is unchanged.

**Suggested commit boundary (do not execute):** `feat(dsmm): format bounded status output`

---

### Task 3: Fixed status command and settings-ready root integration

**Files:**
- Modify: `dsmm/src/commands.ts`
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/test/commands.test.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: Task 1 `createDsmmStatusSnapshot()`, Task 2 `formatDsmmStatus()`, existing `DshCommandInvocation`/`DshCommandResult`/`DshCommandsRegistry`, `DeepworkModeController.active()`, and live `getSettings(): DsmmSettings`.
- Produces:
  - `export const DSMM_STATUS_COMMAND = "dsmm-status"`
  - `export function registerDsmmStatusCommand(readyCtx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void`
  - one settings-ready child command named `dsmm-status` with input hint `[json]`.
- Integration boundary: no settings write command, command injection dependency, root-global duplicate, broad catch, provider call, event append, steer, or model-history insertion.

- [ ] **Step 1: Add failing command service/name/input tests**

Extend `commands.test.ts` with a command collector that can select by name. Cover:

1. `registerDsmmStatusCommand({}, ...)` does not throw when commands are absent.
2. A proxy exposes the registry only through `ctx.get("commands")` and throws if `.commands` is read; registration succeeds without direct access.
3. The command has exact name `dsmm-status`, a description mentioning DSMM status, and exact hint `[json]`, independent of `settings.modeName`.
4. Empty and whitespace-only input select human output; trimmed lowercase `json` selects JSON; `JSON`, `status`, `json extra`, and any other non-empty form return exactly `{ kind: "error", text: "Usage: /dsmm-status [json]" }`.

- [ ] **Step 2: Add failing human/JSON/live getter/mode/no-mutation tests**

Use mutable `currentSettings` and one session with counters for `append()` and `steer()`. Invoke human mode, replace settings with a second normalized value, update the controller state through its supported session/mode path, then invoke JSON mode. Require:

```ts
assert.deepEqual(humanResult, { kind: "success", text: formatDsmmStatus(firstExpectedSnapshot) });
assert.deepEqual(JSON.parse(jsonResult.text ?? ""), secondExpectedSnapshot);
assert.equal(settingsGetterCalls, 2);
assert.equal(appendCallsAfterStatusOnly, appendCallsBeforeStatus);
assert.equal(steerCallsAfterStatusOnly, steerCallsBeforeStatus);
assert.deepEqual(agent.session.events, eventsBeforeStatus);
```

Compute each expected value with the public pure snapshot function. Assert the second result reflects changed fallback count, calibration mode, default mode activity, and idle settings rather than registration-time values. Invalid input must not call the settings getter or controller.

- [ ] **Step 3: Add the failing root `apply()` command-order assertion**

Update the existing settings-ready child integration expectation from:

```ts
["attached-deepwork"]
```

to:

```ts
["attached-deepwork", "dsmm-status"]
```

Keep root command names empty before and after child attachment. Invoke the captured settings installer twice for the same child/registry and require no duplicate registration. Preserve the existing recovery-before-model-routing assertions.

- [ ] **Step 4: Run RED**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/commands.test.ts", "test/settings.test.ts", "test/status.test.ts")
```

Expected: FAIL because `DSMM_STATUS_COMMAND`, status registration/handler, and the second settings-ready child command are absent.

- [ ] **Step 5: Implement the minimal invocation-time command flow**

Add the fixed command beside the existing command without changing deepwork behavior:

```ts
export const DSMM_STATUS_COMMAND = "dsmm-status";

export function registerDsmmStatusCommand(
  readyCtx: DshContext,
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings
): void {
  const commands = readyCtx.get?.<DshCommandsRegistry>("commands") ?? readyCtx.commands;
  commands?.register({
    name: DSMM_STATUS_COMMAND,
    description: "Show DSMM mode, route, calibration, recovery, and settings status",
    input: { hint: "[json]" },
    handler(invocation) {
      const input = invocation.rawInput.trim();
      if (input !== "" && input !== "json") return { kind: "error", text: "Usage: /dsmm-status [json]" };
      const settings = getSettings();
      const snapshot = createDsmmStatusSnapshot({
        agent: invocation.agent,
        settings,
        modeActive: controller.active(invocation.agent, settings.defaultActive)
      });
      return {
        kind: "success",
        text: input === "json" ? JSON.stringify(snapshot, null, 2) : formatDsmmStatus(snapshot)
      };
    }
  });
}
```

In `apply()` call `registerDsmmStatusCommand(readyCtx, controller, getReadySettings)` immediately after `registerDeepworkCommand(...)` and before preset materialization. Register nowhere else.

- [ ] **Step 6: Run GREEN and inspect the fixed lifecycle boundary**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/commands.test.ts", "test/settings.test.ts", "test/status.test.ts", "test/model-routing.test.ts", "test/runtime-recovery.test.ts")
rg -n "registerDeepworkCommand|registerDsmmStatusCommand|DSMM_STATUS_COMMAND" "dsmm/src/commands.ts" "dsmm/src/index.ts"
rg -n "resolveModelInfo|fetch\(|\.append\(|\.steer\(" "dsmm/src/status.ts" "dsmm/src/commands.ts"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed before Task 6: $currentLibIdentity" }
```

Expected: named suites PASS; index search shows deepwork then status in the child; prohibited status path operations produce no new matches (existing deepwork steer/append lines in `commands.ts` are allowed and must remain unchanged); lib identity is unchanged.

**Suggested commit boundary (do not execute):** `feat(dsmm): register the status command`

---

### Task 4: Public exports, settings/status documentation, and package surface

**Files:**
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/test/package.test.ts`
- Modify: `dsmm/package.json`
- Modify: `dsmm/README.md`
- Create: `dsmm/docs/settings-status.md`

**Interfaces:**
- Consumes: completed Tasks 1-3 status values/type and command registration.
- Produces from package root: `DSMM_STATUS_COMMAND`, `DSMM_STATUS_VERSION`, `createDsmmStatusSnapshot`, `formatDsmmStatus`, `registerDsmmStatusCommand`, and type `DsmmStatusSnapshot`; shipped `docs/settings-status.md`; README command/profile guidance.
- Integration boundary: no new package dependency, subpath export, browser/client entry, React/CSS asset, `DESIGN.md`, command writer, provider call, or roadmap status.

- [ ] **Step 1: Add failing export/generated-declaration/package assertions**

Extend `package.test.ts` to:

- import type `DsmmStatusSnapshot` from `../lib/index.js` and use it in a compile-time tuple;
- require the five status value/function names from a dynamic root import, with constants equal to `"dsmm-status"` and `1`;
- assert `src/index.ts` has the type export `DsmmStatusSnapshot`;
- assert mirror-generated `lib/status.js` and `lib/status.d.ts` exist and `lib/index.d.ts` names `DsmmStatusSnapshot`;
- require `docs/settings-status.md` in `package.json.files` and append it to the exact README local-doc list after `docs/runtime-recovery.md`;
- require no `browser` field, no client export/script, no React dependency, and no uppercase root or DSMM `DESIGN.md`.

- [ ] **Step 2: Add failing documentation contract assertions**

Require `settings-status.md` and README to contain all of these exact contracts:

1. Fixed `/dsmm-status` and `/dsmm-status json`; empty input is human, lowercase `json` is versioned JSON, all other input returns the usage string.
2. Human output names mode, scope/preset, route/family, calibration policy/current/action, runtime recovery, and idle continuation without printing prompts/errors.
3. JSON `version: 1`, all five top-level sections, `policyEffort` caveat, and defensive-copy behavior.
4. Web loopback uses the existing host command UI; existing `settings.describe`/settings API remains independent; no custom card/panel/client bundle ships.
5. Headless configuration lives at `$DSH_HOME/settings.yaml` or profile settings files; `dsh --dump-config` inspects resolution; the fixed headless bundle has no interactive command adapter.
6. The exact `dsmm:` namespace shape lists every current resolved top-level key: `modeName`, `defaultActive`, `promptOrder`, three DeepSeek calibration keys, `skills`, `roles`, `presets`, `workflow`, `guards`, `runtimeRecovery`, and `lsp`; nested examples include all current child keys and defaults from `DEFAULT_DSMM_SETTINGS`.
7. Future TUI adapters may execute the host command or consume `createDsmmStatusSnapshot()`; no official rc.2 TUI or private event bridge exists.
8. Status performs no provider/capability/network lookup and exposes no process-local recovery pending/count state; settings writes remain file/DSH-settings-owned.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/package.test.ts", "test/status.test.ts", "test/commands.test.ts")
```

Expected: FAIL because root status exports, generated mirror declarations, docs/package entry, README link, and profile guidance are absent.

- [ ] **Step 4: Export and ship only the approved public surface**

Add to `src/index.ts` without reordering recovery/model-routing root registration:

```ts
export { DSMM_STATUS_VERSION, createDsmmStatusSnapshot, formatDsmmStatus } from "./status.js";
export type { DsmmStatusSnapshot } from "./status.js";
export { DSMM_STATUS_COMMAND, registerDsmmStatusCommand } from "./commands.js";
```

Add exactly `docs/settings-status.md` to `package.json.files`. Add no dependency or export-map entry because status is available from the existing root export.

- [ ] **Step 5: Write the exact Web/headless/future-TUI documentation**

Create sections named **Command**, **Snapshot contract**, **Web loopback**, **Headless settings**, **Future TUI**, and **Boundaries**. In **Headless settings**, provide one complete `dsmm:` YAML example containing the normalized defaults for all current settings, including seven skills, eight roles, presets, workflow, nested guards, nested recovery with its prompt, and all LSP fields. State that optional `presets.root` is omitted when unset, settings are restart-scoped, and `dsh --dump-config` shows resolved profile configuration.

Add a README v0.8 section with:

```text
/dsmm-status
/dsmm-status json
```

Explain Web command discovery, headless file configuration, and future TUI consumption. Link `docs/settings-status.md`; do not edit the roadmap in this task.

- [ ] **Step 6: Run GREEN and prove no frontend/client scope appeared**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/package.test.ts", "test/status.test.ts", "test/commands.test.ts")
rg -n "dsmm-status|settings-status|createDsmmStatusSnapshot|DsmmStatusSnapshot" "dsmm/src/index.ts" "dsmm/package.json" "dsmm/README.md" "dsmm/docs/settings-status.md" "dsmm/test/package.test.ts"
rg -n "React|custom panel|custom settings card|private event bridge|provider.*network" "dsmm/docs/settings-status.md" "dsmm/README.md"
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed before Task 6: $currentLibIdentity" }
```

Expected: package/status/command tests PASS; public/docs searches show the exact seam and explicit denials; no `DESIGN.md`, browser bundle, or dependency was created; lib identity is unchanged.

**Suggested commit boundary (do not execute):** `docs(dsmm): publish settings and status guidance`

---

### Task 5: Pinned DSH rc.2 packaged status-command proof

**Files:**
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: packed DSMM root exports; pinned rc.2 `CommandRuntime`, `AgentRegistry`, session headers/options, settings service, and existing `mountCoreServices()`.
- Produces: exactly one `DSMM_STATUS_COMMAND_OK` marker after both recovery markers and before `ORDINARY_ISOLATED`, with human/JSON command proof, pure-snapshot equality, zero resolver/stream calls, and exactly the four host-owned lifecycle events produced by two command executions.
- Integration boundary: use only the disposable package/profile/container flow. Preserve every existing marker, pre-existing running container, and non-owned image; remove only the unique run-owned image, `--rm` container, temporary package workspace/home, fake adapter registration, agent handle, and context fiber.

- [ ] **Step 1: Add failing exact 13-marker and smoke-order assertions**

Change the static marker list to exactly:

```ts
const expectedMarkers = [
  "PACKAGED_DSMM_RESOLVED",
  "MODEL_ROUTING_WATERFALL_OK",
  "RUNTIME_RECOVERY_FALLBACK_OK",
  "RUNTIME_RECOVERY_CONTINUATION_OK",
  "DSMM_STATUS_COMMAND_OK",
  "ORDINARY_ISOLATED",
  "DEEPWORK_BODIES_ONCE",
  "DOWNSTREAM_DENY_WINS",
  "POST_EXECUTE_TRUNCATED",
  "PRESET_SCOPED_SKILLS",
  "HEADER_GUARD_ACTIVE",
  "LSP_DIAGNOSTIC_OK",
  "DSMM_PACKAGED_RUNTIME_SMOKE_OK"
];
```

Require each `console.log()` exactly once. Require `await smokeStatusCommand(runtime, dsmm, installedPackageRoot);` after `smokeRuntimeRecovery(...)` and before `smokeCoreRuntime(...)` in `runInnerSmoke()`.

- [ ] **Step 2: Add failing static packaged-command/no-provider/exact-lifecycle assertions**

Require the script to contain:

- one `async function smokeStatusCommand(runtime, dsmm, installedPackageRoot)`;
- DSMM config with recovery enabled, two fallback routes, auto/high calibration, and reviewer in max presets;
- a real agent with `meta.agentPreset: "dsmm-reviewer"` and options `deepseek-official/deepseek-v4-pro`;
- `ctx.commands.execute(agent, "/dsmm-status", [], signal)` and `ctx.commands.execute(agent, "/dsmm-status json", [], signal)`;
- exact success checks, bounded human indicators, `JSON.parse()`, and comparison to `dsmm.createDsmmStatusSnapshot({ agent, settings: dsmm.resolveConfig(statusConfig), modeActive: false })`;
- session event bytes/count captured before both commands, then exactly two
  `command/run`/`command/done` pairs afterward, with no additional
  DSMM/model-visible/request events;
- a fake adapter whose `resolveModel()` and `stream()` counters both remain zero;
- cleanup of agent handle, adapter registration, and `ctx.fiber` in nested `finally` blocks.

Retain static assertions for unique random image tags, `docker run --rm`, `imageOwned`, removal of only `imageTag`, package/home cleanup, and `AggregateError`. Add explicit absence assertions for `docker stop`, `docker kill`, `docker container prune`, `docker image prune`, broad image removal, and paid provider credentials.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/docker-smoke-assets.test.ts")
```

Expected: FAIL because the status smoke function/call/assertions and `DSMM_STATUS_COMMAND_OK` marker do not exist.

- [ ] **Step 4: Implement the real pinned command dispatch**

Create `statusConfig` with exact values:

```js
const statusConfig = {
  deepseekV4ProCalibration: "auto",
  deepseekV4ProDefaultReasoningEffort: "high",
  deepseekV4ProMaxReasoningPresets: ["dsmm-reviewer"],
  runtimeRecovery: {
    enabled: true,
    retryOnStatusCodes: [429],
    retryOnCodes: [],
    fallbackRoutes: [
      { provider: "fallback-a", model: "model-a" },
      { provider: "fallback-b", model: "model-b" }
    ],
    maxFallbackAttempts: 2,
    idleContinuation: { enabled: false, maxContinuations: 3, prompt: RUNTIME_RECOVERY_CONTINUATION_PROMPT }
  }
};
```

Mount services, register a fake exact-route adapter that records `resolveModel()` and throws from `stream()`, and create the preset agent. Before execution, capture the current session-event prefix. Require human text to contain all of:

```text
Mode: inactive (deepwork)
Scope: dsmm-reviewer preset
Route: deepseek-official/deepseek-v4-pro [deepseek]
Reasoning: auto; policy=max; current=provider default; action=fill-missing
Runtime recovery: enabled; applies=yes; fallbacks=2; max attempts=2
```

Parse JSON and compare exact serialized structure with the exported pure snapshot built from `dsmm.resolveConfig(statusConfig)` and `modeActive: false`. Require the original event prefix to remain byte-identical, followed by exactly `command/run`, `command/done`, `command/run`, `command/done` for the two status calls. Reject every extra DSMM/model-visible/request event. Require both adapter counters zero, then print the marker once.

- [ ] **Step 5: Run static GREEN, then the first pinned packaged-runtime proof**

```powershell
Invoke-DsmmSettingsStatusMirrorTests @("test/docker-smoke-assets.test.ts")
$currentLibIdentity = Get-DsmmLibIdentity
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed before Task 6: $currentLibIdentity" }
pnpm --filter dsmm smoke:docker
if ($LASTEXITCODE -ne 0) { throw "DSMM pinned Docker status smoke failed" }
```

Expected: static test PASS; in the initial cycle working-tree lib remains the reviewed v0.7 baseline; Docker source build/package emits all 13 markers exactly once in order, including `DSMM_STATUS_COMMAND_OK`; exactly four host-owned command lifecycle events are appended; fake resolver/stream stay unused; only run-owned artifacts are cleaned. This successful proof is the prerequisite for Task 6's roadmap change.

**Suggested commit boundary (do not execute):** `test(dsmm): prove status command on pinned DSH`

---

### Task 6: Roadmap status, authoritative generation, final gates, and common-identity review

**Files:**
- Modify after Task 5 passes: `dsmm/docs/roadmap.md`
- Regenerate exactly once for the current complete source revision: `dsmm/lib/**`
- Verify only: every Task 1-5 file plus preserved reviewed v0.6/v0.7 working-tree content.

**Interfaces:**
- Consumes: completed Tasks 1-5, successful ordered 13-marker packaged proof, unchanged HEAD, and either the initial preserved pre-v0.8 lib identity or the current correction cycle's frozen stale generated identity.
- Produces: implemented v0.8 roadmap status, synchronized generated status/command/root exports, exact pack inventory, complete DSMM/Docker/root evidence, one canonical working-tree identity, and matching approved Oracle/Reviewer receipts.
- Integration boundary: this is the sole working-tree generation and final acceptance task. Any source/test/docs/package/smoke change exits this task and restarts it from the pre-generation check for a new complete source revision.

- [ ] **Step 1: Mark v0.8 implemented only after packaged runtime proof exists**

Confirm the immediately preceding Task 5 output contains all 13 markers exactly once in the stated order. Then add directly under `## v0.8 — UI/settings polish`:

```md
Status: implemented in v0.8 with a fixed `/dsmm-status [json]` host command, deterministic defensive status snapshots, normalized file-based settings documentation for Web/headless/future TUI use, and pinned DSH rc.2 packaged-command coverage.
```

Keep the deferred custom panel/TUI implementation out of the status and do not change v1.0 scope.

- [ ] **Step 2: Run the cycle-appropriate stale-generation RED check**

Reassert HEAD. On the initial cycle, require the exact pre-v0.8 lib identity and
absence of status modules:

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD: $head" }
$preGenerationLibIdentity = Get-DsmmLibIdentity
if ($preGenerationLibIdentity -ne $dsmmLibBaselineIdentity) { throw "working-tree dsmm/lib changed before final generation" }

$prematureStatusModules = @(
  "dsmm/lib/status.js",
  "dsmm/lib/status.d.ts",
  "dsmm/lib/status.js.map",
  "dsmm/lib/status.d.ts.map"
) | Where-Object { Test-Path -LiteralPath $_ }
if ($prematureStatusModules.Count -ne 0) { throw "v0.8 generated status modules appeared before Task 6: $($prematureStatusModules -join ', ')" }
throw "EXPECTED RED: v0.8 generated status modules are absent before authoritative generation"
```

Expected on the initial cycle: command reaches only the final explicit expected
RED. Any earlier failure blocks generation because HEAD or reviewed v0.7
generated state drifted.

On a correction cycle, do not run the initial absence check. Require the current
lib identity to equal `$expectedLibIdentity`, which is the
`$correctionStaleLibIdentity` captured before the owning task correction. The
orchestrator must also have recorded `$correctionChangesGeneratedSource` from the
actual corrected file list. When it is true, run the corrected targeted
status/command test directly against the stale generated tree. Accept only the
assertion introduced by the current source correction as RED; every unrelated
failure blocks generation:

```powershell
$preGenerationLibIdentity = Get-DsmmLibIdentity
if ($preGenerationLibIdentity -ne $expectedLibIdentity) {
  throw "correction stale dsmm/lib drifted before final generation: $preGenerationLibIdentity"
}
if (-not (Test-Path -LiteralPath "variable:correctionChangesGeneratedSource")) {
  throw "correction cycle must declare whether compiled dsmm/src changed"
}
if ($correctionChangesGeneratedSource) {
  if (-not (Test-Path -LiteralPath "variable:correctionStaleTests") -or
      -not (Test-Path -LiteralPath "variable:correctionExpectedStaleAssertion") -or
      @($correctionStaleTests).Count -eq 0 -or
      [string]::IsNullOrWhiteSpace($correctionExpectedStaleAssertion)) {
    throw "compiled-source correction must provide exact stale tests and expected assertion"
  }
  $staleTests = @($correctionStaleTests)
  foreach ($testPath in $staleTests) {
    if (-not (Test-Path -LiteralPath $testPath -PathType Leaf)) {
      throw "correction stale test does not exist: $testPath"
    }
  }
  $staleOutput = @(node --test --experimental-strip-types $staleTests 2>&1)
  $staleExit = $LASTEXITCODE
  $staleOutput
  if ($staleExit -eq 0) { throw "EXPECTED RED: corrected source unexpectedly passed against stale generated output" }
  if (($staleOutput -join "`n") -notlike ("*" + $correctionExpectedStaleAssertion + "*")) {
    throw "stale generated failure did not contain the owning task assertion: $correctionExpectedStaleAssertion"
  }
} else {
  "CORRECTION_GENERATED_RED_NOT_APPLICABLE"
}
```

For a compiled-source correction, record the exact named failing assertion. For
a tests/docs/package/smoke-only correction, require the owning task's exact
failing-first and GREEN evidence in the handoff and record
`CORRECTION_GENERATED_RED_NOT_APPLICABLE`; do not manufacture a stale-lib
failure. In both branches, do not restore or delete generated files before the
single authoritative generation.

- [ ] **Step 3: Generate working-tree `dsmm/lib/**` exactly once for this complete source revision**

```powershell
pnpm --filter dsmm build
if ($LASTEXITCODE -ne 0) { throw "authoritative DSMM build failed" }
```

Do not run another command that invokes `dsmm/package.json`'s `build` script on this unchanged source revision. Inspect exact generated surfaces without rebuilding:

```powershell
foreach ($path in @(
  "dsmm/lib/status.js",
  "dsmm/lib/status.d.ts",
  "dsmm/lib/status.js.map",
  "dsmm/lib/status.d.ts.map"
)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "missing generated status module: $path" }
}
rg -n "DSMM_STATUS_VERSION|createDsmmStatusSnapshot|formatDsmmStatus|DSMM_STATUS_COMMAND|registerDsmmStatusCommand|DsmmStatusSnapshot" "dsmm/lib"
```

Expected: status JS/declarations/maps exist; command/index generated files expose all approved values/types; all model-routing/recovery/safety/LSP generated modules remain present.

- [ ] **Step 4: Run DSMM test-config typecheck and every DSMM test without rebuilding**

Enumerate exact test files so execution does not depend on PowerShell wildcard expansion:

```powershell
pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit
if ($LASTEXITCODE -ne 0) { throw "DSMM test-config typecheck failed" }
$dsmmTests = @(fd --type f --extension ts --glob "*.test.ts" ".\dsmm\test" | Sort-Object)
if ($LASTEXITCODE -ne 0 -or $dsmmTests.Count -eq 0) { throw "cannot enumerate DSMM tests" }
node --test --experimental-strip-types $dsmmTests
if ($LASTEXITCODE -ne 0) { throw "DSMM tests failed" }
```

Expected: test-config typecheck exits `0`; every DSMM test passes, including status, command, apply, package, smoke assets, model-routing, runtime-recovery, safety, LSP, prompt, and preset suites. Neither command invokes a second DSMM build.

- [ ] **Step 5: Verify exact npm pack dry-run inventory**

```powershell
$packJson = @(npm pack ".\dsmm" --dry-run --json)
if ($LASTEXITCODE -ne 0) { throw "DSMM npm pack dry-run failed" }
$pack = ($packJson -join "`n") | ConvertFrom-Json
$paths = @($pack[0].files | ForEach-Object { $_.path })
$required = @(
  "lib/index.js", "lib/index.d.ts",
  "lib/status.js", "lib/status.d.ts",
  "lib/commands.js", "lib/commands.d.ts",
  "lib/model-routing.js", "lib/model-routing.d.ts",
  "lib/recovery-policy.js", "lib/recovery-policy.d.ts",
  "lib/runtime-recovery.js", "lib/runtime-recovery.d.ts",
  "docs/settings-status.md", "docs/model-routing.md", "docs/runtime-recovery.md",
  "README.md", "package.json"
)
foreach ($path in $required) {
  if ($paths -notcontains $path) { throw "packed dsmm artifact missing $path" }
}
```

Expected: dry-run exits `0`, creates no tarball, and every source-generated declaration/document surface is packed.

- [ ] **Step 6: Run pinned Docker proof and verify exact marker order/count without touching non-owned Docker state**

Capture pre-existing running container IDs and image IDs, run the owned smoke, then require every pre-existing ID still exists. Do not stop, remove, or prune anything to make this check pass.

```powershell
$runningBefore = @(docker ps --no-trunc --format "{{.ID}}")
if ($LASTEXITCODE -ne 0) { throw "cannot capture pre-existing running containers" }
$imagesBefore = @(docker image ls --no-trunc --format "{{.ID}}" | Sort-Object -Unique)
if ($LASTEXITCODE -ne 0) { throw "cannot capture pre-existing Docker images" }
$dockerOutput = @(pnpm --filter dsmm smoke:docker 2>&1)
$dockerExit = $LASTEXITCODE
$dockerOutput
if ($dockerExit -ne 0) { throw "DSMM pinned Docker runtime smoke failed" }
$markerLines = @($dockerOutput | ForEach-Object { $_.ToString().Trim() })
$markers = @(
  "PACKAGED_DSMM_RESOLVED",
  "MODEL_ROUTING_WATERFALL_OK",
  "RUNTIME_RECOVERY_FALLBACK_OK",
  "RUNTIME_RECOVERY_CONTINUATION_OK",
  "DSMM_STATUS_COMMAND_OK",
  "ORDINARY_ISOLATED",
  "DEEPWORK_BODIES_ONCE",
  "DOWNSTREAM_DENY_WINS",
  "POST_EXECUTE_TRUNCATED",
  "PRESET_SCOPED_SKILLS",
  "HEADER_GUARD_ACTIVE",
  "LSP_DIAGNOSTIC_OK",
  "DSMM_PACKAGED_RUNTIME_SMOKE_OK"
)
$priorIndex = -1
foreach ($marker in $markers) {
  $matches = @($markerLines | Where-Object { $_ -eq $marker })
  if ($matches.Count -ne 1) { throw "Docker marker $marker appeared $($matches.Count) times" }
  $index = [Array]::IndexOf($markerLines, $marker)
  if ($index -le $priorIndex) { throw "Docker marker out of order: $marker" }
  $priorIndex = $index
}
$runningAfter = @(docker ps --no-trunc --format "{{.ID}}")
$imagesAfter = @(docker image ls --no-trunc --format "{{.ID}}" | Sort-Object -Unique)
foreach ($id in $runningBefore) { if ($runningAfter -notcontains $id) { throw "pre-existing running container changed or disappeared: $id" } }
foreach ($id in $imagesBefore) { if ($imagesAfter -notcontains $id) { throw "pre-existing Docker image disappeared: $id" } }
```

Expected: all 13 exact marker lines appear once in order; `DSMM_STATUS_COMMAND_OK` binds human/JSON, exact paired host command lifecycle events, no additional DSMM/model/request events, and no-provider assertions; pre-existing running containers and non-owned images remain; unique run-owned container/image/temp assets are gone.

- [ ] **Step 7: Run diff and root gates, with root test exactly once for this source revision**

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff whitespace check failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "root typecheck failed" }
pnpm test
$rootTestExit = $LASTEXITCODE
if ($rootTestExit -ne 0) { throw "root tests failed; preserve the exact command output and failing test/error, do not retry this unchanged source revision" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "root build failed" }
```

Expected: diff check, root typecheck, the one authorized root test invocation, and root build exit `0`. If root tests fail, stop and report exact output. Do not retry the unchanged revision, serialize tests, alter thresholds/tests, or carry forward a v0.7 exception. Only an explicit user-approved documented evidence exception for this exact failure can authorize another same-revision root test invocation.

- [ ] **Step 8: Capture one canonical working-tree identity and one common review packet**

Use the exact canonical PowerShell wrapper from `skills/v1/requesting-code-review/SKILL.md`; do not reproduce or alter its hash algorithm:

```powershell
$skillPath = Join-Path (Get-Location) "skills/v1/requesting-code-review/SKILL.md"
$extractor = @'
const { readFileSync } = require("node:fs");
const text = readFileSync(process.argv[1], "utf8");
const marker = "<!-- ocmm-review-artifact-" + "identity-js -->";
const at = text.indexOf(marker);
if (at < 0 || text.indexOf(marker, at + marker.length) !== -1) throw new Error("canonical marker missing or duplicate");
const following = text.slice(at + marker.length);
const fence = /^\r?\n```js\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(following);
if (!fence) throw new Error("canonical fence missing or not adjacent");
process.stdout.write(fence[1]);
'@
$scriptLines = @(node -e $extractor $skillPath)
if ($LASTEXITCODE -ne 0 -or $scriptLines.Count -eq 0) { throw "cannot extract canonical review identity module" }
$script = $scriptLines -join "`n"
$artifactIdentityLines = @(node --input-type=module -e $script)
if ($LASTEXITCODE -ne 0 -or $artifactIdentityLines.Count -eq 0) { throw "cannot calculate review artifact identity" }
$artifactIdentity = $artifactIdentityLines -join "`n"
if ($artifactIdentity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical review artifact identity has an invalid format" }
$artifactIdentity
```

Construct one packet with these exact fields/content:

```text
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: the exact lowercase sha256 value printed by the canonical wrapper
DESCRIPTION: DSMM v0.8 deterministic settings/status snapshot and formatter, fixed host command, docs/package/generated integration, and pinned rc.2 packaged command proof, preserving reviewed v0.6 model routing and v0.7 runtime recovery
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-25-dsmm-settings-status.md and docs/superpowers/specs/2026-08-25-dsmm-settings-status-design.md
BASELINE: HEAD cedd30b1abd03cf00b9ce330fa3b1805d76cb401 plus reviewed uncommitted v0.6/v0.7 changes; v0.7 provenance identity sha256:2bc441189d2469187b9e3495cd28b4df18c48be400095a57fc2d10c0e40c53cf
REVIEW_INPUT: current binary diff from HEAD plus bytewise-sorted non-ignored untracked manifest, as required by requesting-code-review
VERIFICATION_EVIDENCE: Task 6 DSMM test-config/all tests, exact pack inventory, ordered 13-marker pinned Docker proof, diff check, root typecheck/single root test/build, all captured for this identity
GLOBAL_CONSTRAINTS: the complete Global Constraints section of this plan, verbatim
SOURCE_REVISION_RULE: any source/test/docs/package/smoke correction invalidates lib, all gates, packet, and receipts and restarts Task 6 at the pre-generation check
```

Send the identical packet in parallel to the first currently callable Oracle lane and primary Reviewer lane. This is complex cross-module/runtime/package work: select configured `high` profiles when callable, otherwise unsuffixed normal profiles. Reviewer/Oracle review implementation only, never this implementation plan.

- [ ] **Step 9: Accept only matching current-identity receipts; restart after every file correction**

Immediately rerun the canonical identity wrapper after each lane returns. Reject timeout, partial output, missing field, conditional approval, stale evidence, lost receipt, or identity mismatch. Each accepted receipt contains exactly five fields in this order:

```text
role/profile lane: selected Oracle or primary Reviewer profile
task_id or session receipt: durable task/session/result reference
artifact identity: the common current sha256 identity
verdict: approved
report artifact/source: task result or durable review report source
```

If either lane reports a validated source/test/docs/package/smoke issue, first
capture the current generated identity as `$correctionStaleLibIdentity`, assign
it to `$expectedLibIdentity`, and set
`$correctionChangesGeneratedSource = $true` only when the validated correction
changes compiled `dsmm/src/**`; otherwise set it to `$false`. For a compiled
source correction, require the owning task to return exact
`$correctionStaleTests` and `$correctionExpectedStaleAssertion` values that
detect its stale generated runtime; do not infer a fixed test list in Task 6.
Return to the owning Task 1-5 with a fresh implementation worker and apply only the validated
correction while preserving that stale identity. Invalidate all
DSMM/pack/Docker/root evidence, packet, and receipts, but do not reconstruct the
initial pre-v0.8 generated tree. Restart Task 6 at Step 2's correction branch.
Require the targeted stale-output RED only for compiled-source corrections;
otherwise carry the owning task's exact RED/GREEN. Perform exactly one
authoritative DSMM generation for the corrected complete source revision, and run
root `pnpm test` exactly once for that new revision. Evidence-only omissions that
change no file require the missing evidence and a new current packet/receipts,
never reuse of a stale conditional receipt.

Final acceptance requires both approved receipts and one final parent identity recomputation equal to their common identity.

- [ ] **Step 10: Final read-only preservation and cleanup receipt**

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "HEAD changed during implementation" }
git status --short
git diff --stat
git diff --check
```

Expected: HEAD is unchanged; reviewed v0.6/v0.7 plus intended v0.8 spec/plan/source/tests/docs/package/smoke/generated changes remain unstaged; no dependency-install, browser/client, credential, paid-provider, Docker-owned residue, or unrelated artifacts appear. Report no Git write and request separate authorization before any commit/push/tag.

**Suggested commit boundary (do not execute):** `feat(dsmm): complete v0.8 settings status`

---

## Self-review

**Spec coverage:** Passed. Task 1 covers all pure scenarios, route precedence, calibration precedence, recovery applicability, and defensive copies. Task 2 locks bounded human output and absence rendering. Task 3 covers commands absent/`ctx.get()`/fixed name/human/JSON/invalid/live reads/no mutation plus root child integration. Task 4 covers exports, generated declarations, docs/package inventory, Web/headless/future-TUI behavior, and the no-frontend decision. Task 5 proves the real pinned command with no provider/event side effect. Task 6 gates roadmap status, one-time generation, DSMM/pack/Docker/root evidence, canonical identity, and common Oracle/Reviewer approval.

**Interface consistency:** Passed. `DsmmStatusSnapshot` has one version constant and one constructor; command JSON is exactly that snapshot; formatter consumes only that snapshot; `registerDsmmStatusCommand()` receives the existing controller/live getter shape; route helpers use current v0.6 signatures; runtime-recovery fields use current v0.7 `DsmmSettings`; root exports and package tests use the same names throughout.

**Placeholder scan:** Passed. Every task has exact files, consumed/produced interfaces, RED cause, minimal implementation behavior/code, GREEN commands/evidence, integration boundary, and a non-executed suggested commit boundary. No unresolved filler or deferred implementation marker remains.

**PowerShell scan:** Passed. Commands use PowerShell syntax and `$LASTEXITCODE`, explicit arrays or `fd` enumeration instead of relying on wildcard expansion, no Bash environment assignment/`export`/`&&`/`/dev/null`, and recursive deletion is limited to a verified OS-temp mirror. Docker checks never prune or delete non-owned state.

**Shared-file overlap scan:** Passed. `commands.ts`, `index.ts`, `package.test.ts`, `package.json`, README, Docker smoke/static tests, roadmap, and generated lib each have one named owning task and explicit v0.6/v0.7 preservation requirements.

**Generated-output/invalidation scan:** Passed. Tasks 1-5 compile only OS-temp mirrors and compare working-tree lib identity to the preserved v0.7 baseline. Task 6 starts with an expected absence RED, generates once per complete source revision, and invalidates lib/gates/packet/receipts after every source/test/docs/package/smoke correction.

**Verification scan:** Passed. Final order is DSMM test-config/all tests, exact pack inventory, ordered 13-marker no-provider Docker proof, diff check, root typecheck, one root test for the revision, root build, canonical identity, and Oracle plus primary Reviewer on one packet. Same-revision root test retry is forbidden without explicit user authorization for a documented evidence exception, and no prior v0.7 exception is inherited.

**Scope scan:** Passed. The plan adds no custom panel, browser/client bundle, React/CSS/design file, visual QA, settings mutation command, provider call, private TUI bridge, process-local recovery counters, dependency installation, paid provider use, release action, or Git write.
