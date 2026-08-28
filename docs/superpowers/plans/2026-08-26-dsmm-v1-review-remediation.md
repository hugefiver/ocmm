# DSMM v1 Review Remediation Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 DSMM v1.0 身份绑定综合审查确认的五类产品缺陷，并为同一当前工作树身份生成完整、可复算、未发布的 release-readiness 证据。

**Architecture:** 前五个任务各自使用最小 TDD 回路修复类型收窄、模型路由日志隔离、保留命令名、精确 release scripts 策略和 Docker 清理错误组合；涉及 `dsmm/src/**` 的 RED/GREEN 只在 OS 临时镜像编译，工作树 `dsmm/lib/**` 保持陈旧。第六个任务先证明陈旧生成物 RED，再对完整源版本执行唯一一次权威 DSMM build，依次完成 DSMM、打包、Docker、根工作区 gates，并把同一规范工作树身份发送给 `oracle-high` 和 `reviewer-high`。

**Tech Stack:** PowerShell 7、Node.js 22 ESM、TypeScript 6 strict/NodeNext、`node:test`、pnpm workspace、npm pack JSON、Docker、Cordis `^4.0.1`、DeepSeek Harness `@deepseek-ai/dsh@0.1.1-rc.2`。

**Spec:** `docs/superpowers/specs/2026-08-26-dsmm-v1-review-remediation-design.md`

**Global Constraints:**
- Baseline HEAD: `cedd30b1abd03cf00b9ce330fa3b1805d76cb401`.
- Reviewed pre-remediation working-tree identity: `sha256:1e8ba331a1de558675112fd2c41cd4b5e1a1efe022f511ae33e232ea25b6f6fd`.
- Preserve all reviewed v0.6-v1.0 source, tests, documentation, package metadata, generated output, and every pre-existing dirty-tree change.
- No `add`, `commit`, `stash`, `reset`, `checkout`, `push`, `tag`, publication, dependency installation, registry mutation, or unrelated process termination is authorized.
- Release-test remediation changes test correctness only and must use explicit control-flow narrowing before regex result or named-capture dereference.
- Model-routing warning emission must be fail-open; resolver/capability failures preserve the exact downstream object, while a rejection from `next()` propagates unchanged outside DSMM containment.
- Only exact `modeName === "dsmm-status"` is reserved; it normalizes to `deepwork` for base and attached settings, while every other spelling remains unchanged.
- `manifest.scripts` must equal the approved eight-entry release map exactly before `npm pack`; added, removed, or changed entries fail deterministically.
- Docker cleanup preserves the primary error in both outer image cleanup and inner temporary-directory cleanup and remains fail-closed for cleanup-only failures.
- Tasks that modify `dsmm/src/**` run RED/GREEN through an OS-temp mirror and never write working-tree `dsmm/lib/**`.
- After all product corrections are integrated, run exactly one authoritative `pnpm --filter dsmm build` for each complete `dsmm/src/**` identity; a later source correction invalidates generated output, all gates, canonical identity, and both review receipts.
- A later test/checker/Docker-only correction leaves generated output valid for the unchanged source identity but invalidates all affected gates, canonical identity, and review receipts.
- Root `pnpm test` and root `pnpm run build` each run once for a complete revision admitted to final review; do not retry unchanged inputs without separate explicit authorization.
- If root build fails solely because an unrelated process holds `dist/bin/ocmm-lsp*.exe`, preserve the output and stop for user process closure; do not kill a process, retry, or substitute mirror subcommands.
- Final acceptance requires DSMM noEmit/all tests, checker, independent pack, pinned rc.2 Docker markers, diff/root gates, a matching root-build receipt, and unconditional `oracle-high` plus `reviewer-high` approval of one recomputed current identity.
- Do not weaken accepted behavior, thresholds, marker ordering, provider/model policy, reasoning semantics, release checks, or package boundaries; do not add broad refactors or a general command-name framework.

---

## Requirement and evidence map

| Approved requirement | Task | Primary evidence |
|---|---:|---|
| Explicit nullable regex narrowing | 1 | test-config RED becomes GREEN; targeted release-readiness test passes |
| Warning emission cannot break model-routing fail-open semantics | 2 | child/root throwing-logger matrix and unchanged `next()` rejection identity |
| Exact reserved `dsmm-status` normalization and dual registration | 3 | direct, attached, case-sensitive, and real `apply()` registration matrix |
| Exact approved release scripts before pack | 4 | added lifecycle, removed key, and changed command fixtures; zero pack receipt fields |
| Primary/cleanup error preservation in both Docker cleanup layers | 5 | pure four-case helper test plus outer/inner static integration assertions |
| One authoritative generation and complete same-identity evidence | 6 | stale-lib RED, one build, DSMM/pack/Docker/root receipts, canonical identity recomputation, two approvals |

## File map

### Product and regression surfaces

- Modify `dsmm/test/release-readiness.test.ts` — explicit regex narrowing and exact release-script fixtures.
- Modify `dsmm/src/model-routing.ts` — contain synchronous logger failures only.
- Modify `dsmm/test/model-routing.test.ts` — independent child/root logger injection and fail-open matrix.
- Modify `dsmm/src/settings.ts` — define the reserved status command constant and normalize exact collisions.
- Modify `dsmm/src/commands.ts` — consume and re-export the single status-command constant without changing registration behavior.
- Modify `dsmm/test/settings.test.ts` — direct/base/attached normalization and actual dual registration.
- Verify `dsmm/test/commands.test.ts` — preserve the public `DSMM_STATUS_COMMAND` export and standalone status registration.
- Modify `dsmm/scripts/check-release-readiness.mjs` — exact `manifest.scripts` structural equality.
- Create `dsmm/scripts/docker-cleanup-errors.mjs` — pure `throwAfterCleanup(primaryError, cleanupErrors, message)` helper.
- Modify `dsmm/scripts/docker-smoke.mjs` — use the helper for outer image and inner temp cleanup.
- Modify `dsmm/test/docker-smoke-assets.test.ts` — helper truth table and two integration points.

### Generated and verify-only surfaces

- Regenerate only in Task 6 when the current `dsmm/src/**` identity has no authoritative receipt: `dsmm/lib/**`.
- Verify only: all other `dsmm/test/*.test.ts`, `dsmm/package.json`, `dsmm/docker/Dockerfile.smoke`, root TypeScript/Rust/build surfaces, `skills/v1/requesting-code-review/SKILL.md`, and all pre-existing dirty-tree files.
- This plan creates no source, package, release, or publication documentation beyond this plan artifact.

## Dependency order and review boundaries

1. Task 1 is independent test correctness and establishes a clean test-config baseline.
2. Task 2 changes `model-routing.ts`; its GREEN is consumed by Task 6 generation.
3. Task 3 changes `settings.ts` and `commands.ts`; it runs after Task 2 so one final build can generate both complete source corrections.
4. Task 4 changes only checker/tests and consumes the existing exact `dsmm/package.json` script map.
5. Task 5 changes only executable `.mjs` scripts/tests and must complete before the real Docker gate.
6. Task 6 consumes Tasks 1-5, owns the only working-tree DSMM generation for each source identity, then runs final gates and reviews in strict order.
7. Each task is a review boundary only. No task stages or commits files, and no commit step appears in this plan.

## Fresh-process bootstrap, OS-temp receipts, and invalidation protocol

Every PowerShell tool call starts a fresh process. No command block in this plan consumes a function, variable, list, or build ledger created only in an earlier process. The authoritative helper body below lives in this plan; every later PowerShell block begins by extracting and dot-sourcing this exact marked fence in its own process. Task state that must cross calls is stored only in one deterministic, workspace-keyed file directly under the verified OS-temp parent. Tasks 1-5 create their own receipt in RED and delete it after GREEN; Task 6 creates one receipt plus one evidence directory at its stale-output precondition and deletes both only after final acceptance.

The supplied pre-remediation identity remains historical review evidence. The plan file itself legitimately changes the later canonical identity, so no command compares a post-plan identity to that historical value.

<!-- dsmm-remediation-powershell-bootstrap -->
```powershell
$DsmmBaselineHead = "cedd30b1abd03cf00b9ce330fa3b1805d76cb401"
$DsmmPlanRelativePath = "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md"

function Get-DsmmWorkspaceContext {
  $workspaceRoot = (Resolve-Path -LiteralPath ".").Path
  $planPath = Join-Path $workspaceRoot $DsmmPlanRelativePath
  if (-not (Test-Path -LiteralPath $planPath -PathType Leaf)) { throw "authoritative remediation plan is missing: $planPath" }
  $tempParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "OS temp parent is unavailable: $tempParent" }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $workspaceBytes = [Text.Encoding]::UTF8.GetBytes($workspaceRoot)
    $workspaceKey = [Convert]::ToHexString($sha.ComputeHash($workspaceBytes)).ToLowerInvariant().Substring(0, 16)
  } finally {
    $sha.Dispose()
  }
  return [pscustomobject]@{
    workspaceRoot = $workspaceRoot
    planPath = $planPath
    tempParent = $tempParent
    workspaceKey = $workspaceKey
  }
}

function Assert-DsmmBaselineHead {
  $head = (@(git rev-parse HEAD) -join "`n").Trim()
  if ($LASTEXITCODE -ne 0 -or $head -ne $DsmmBaselineHead) { throw "unexpected HEAD: $head" }
}

function Get-DsmmTreeIdentity {
  param([Parameter(Mandatory = $true)][string]$Tree)

  $paths = @(git ls-files --cached --others --exclude-standard -- $Tree) | Sort-Object
  if ($LASTEXITCODE -ne 0 -or $paths.Count -eq 0) { throw "cannot enumerate $Tree" }
  $rows = foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "identity input is not a file: $path" }
    $hash = (@(git hash-object -- $path) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $hash -notmatch '^[0-9a-f]{40,64}$') { throw "cannot hash $path" }
    "$path`t$hash"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return "sha256:" + [Convert]::ToHexString($sha.ComputeHash($bytes)).ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-DsmmTaskReceiptPath {
  param([Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task)
  $context = Get-DsmmWorkspaceContext
  return Join-Path $context.tempParent "ocmm-dsmm-review-remediation-$($context.workspaceKey)-task$Task.json"
}

function Get-DsmmTaskEvidenceDirectory {
  param([Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task)
  $context = Get-DsmmWorkspaceContext
  return Join-Path $context.tempParent "ocmm-dsmm-review-remediation-$($context.workspaceKey)-task$Task-evidence"
}

function Write-DsmmTaskReceipt {
  param(
    [Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Receipt
  )
  $context = Get-DsmmWorkspaceContext
  $path = Get-DsmmTaskReceiptPath -Task $Task
  if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($path)) -ne [IO.Path]::GetFullPath($context.tempParent)) {
    throw "receipt escaped OS temp parent: $path"
  }
  $json = $Receipt | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($path, $json + "`n", [Text.UTF8Encoding]::new($false))
}

function New-DsmmTaskReceipt {
  param(
    [Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task,
    [Parameter(Mandatory = $true)][bool]$ExpectedSourceChange
  )
  Assert-DsmmBaselineHead
  $context = Get-DsmmWorkspaceContext
  $path = Get-DsmmTaskReceiptPath -Task $Task
  if (Test-Path -LiteralPath $path) { throw "task receipt already exists; inspect before retry: $path" }
  $receipt = [ordered]@{
    schema = 1
    task = $Task
    workspaceRoot = $context.workspaceRoot
    baselineHead = $DsmmBaselineHead
    expectedSourceChange = $ExpectedSourceChange
    sourceIdentityBefore = Get-DsmmTreeIdentity -Tree "dsmm/src"
    libIdentityBefore = Get-DsmmTreeIdentity -Tree "dsmm/lib"
  }
  Write-DsmmTaskReceipt -Task $Task -Receipt $receipt
  return $receipt
}

function Read-DsmmTaskReceipt {
  param([Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task)
  Assert-DsmmBaselineHead
  $context = Get-DsmmWorkspaceContext
  $path = Get-DsmmTaskReceiptPath -Task $Task
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "task receipt is missing: $path" }
  $receipt = [IO.File]::ReadAllText($path) | ConvertFrom-Json -AsHashtable
  if ($receipt.schema -ne 1 -or $receipt.task -ne $Task -or
      $receipt.workspaceRoot -ne $context.workspaceRoot -or $receipt.baselineHead -ne $DsmmBaselineHead) {
    throw "task receipt identity mismatch: $path"
  }
  return $receipt
}

function Remove-DsmmTaskReceipt {
  param([Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task)
  $context = Get-DsmmWorkspaceContext
  $expected = Get-DsmmTaskReceiptPath -Task $Task
  $resolved = [IO.Path]::GetFullPath($expected)
  if ([IO.Path]::GetDirectoryName($resolved) -ne [IO.Path]::GetFullPath($context.tempParent) -or
      [IO.Path]::GetFileName($resolved) -ne "ocmm-dsmm-review-remediation-$($context.workspaceKey)-task$Task.json") {
    throw "refusing to remove unexpected receipt: $resolved"
  }
  if (Test-Path -LiteralPath $resolved -PathType Leaf) { [IO.File]::Delete($resolved) }
  if (Test-Path -LiteralPath $resolved) { throw "task receipt cleanup failed: $resolved" }
}

function Remove-DsmmTaskEvidenceDirectory {
  param([Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Task)
  $context = Get-DsmmWorkspaceContext
  $expected = Get-DsmmTaskEvidenceDirectory -Task $Task
  $resolved = [IO.Path]::GetFullPath($expected)
  if ([IO.Path]::GetDirectoryName($resolved) -ne [IO.Path]::GetFullPath($context.tempParent) -or
      [IO.Path]::GetFileName($resolved) -ne "ocmm-dsmm-review-remediation-$($context.workspaceKey)-task$Task-evidence") {
    throw "refusing to remove unexpected evidence directory: $resolved"
  }
  if (Test-Path -LiteralPath $resolved -PathType Container) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  if (Test-Path -LiteralPath $resolved) { throw "task evidence cleanup failed: $resolved" }
}

function Get-DsmmFileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "digest input is missing: $Path" }
  $stream = [IO.File]::OpenRead($Path)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return "sha256:" + [Convert]::ToHexString($sha.ComputeHash($stream)).ToLowerInvariant() }
  finally { $sha.Dispose(); $stream.Dispose() }
}

function Get-DsmmCanonicalReviewIdentity {
  $context = Get-DsmmWorkspaceContext
  $skillPath = Join-Path $context.workspaceRoot "skills/v1/requesting-code-review/SKILL.md"
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
  $identityModuleLines = @(node -e $extractor $skillPath)
  if ($LASTEXITCODE -ne 0 -or $identityModuleLines.Count -eq 0) { throw "cannot extract canonical identity module" }
  $identityLines = @(node --input-type=module -e ($identityModuleLines -join "`n"))
  if ($LASTEXITCODE -ne 0 -or $identityLines.Count -eq 0) { throw "cannot calculate canonical working-tree identity" }
  $identity = $identityLines -join "`n"
  if ($identity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical identity format is invalid" }
  return $identity
}

function Invoke-DsmmRemediationMirrorTests {
  param(
    [Parameter(Mandatory = $true)][string[]]$Tests,
    [string]$ExpectedFailure = ""
  )
  $context = Get-DsmmWorkspaceContext
  $dsmmRoot = Join-Path $context.workspaceRoot "dsmm"
  $mirror = Join-Path $context.tempParent ("dsmm-review-remediation-$($context.workspaceKey)-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $mirror | Out-Null
  try {
    foreach ($directory in @("src", "test", "skills", "prompts", "agent-presets", "docs", "patches", "scripts", "docker")) {
      $sourceDirectory = Join-Path $dsmmRoot $directory
      if (Test-Path -LiteralPath $sourceDirectory -PathType Container) {
        Copy-Item -LiteralPath $sourceDirectory -Destination (Join-Path $mirror $directory) -Recurse
      }
    }
    foreach ($file in @("package.json", "tsconfig.json", "tsconfig.test.json", "cordis.patch.yml", "README.md", "LICENSE")) {
      $sourceFile = Join-Path $dsmmRoot $file
      if (Test-Path -LiteralPath $sourceFile -PathType Leaf) {
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $mirror $file)
      }
    }
    $existingModules = Join-Path $dsmmRoot "node_modules"
    if (-not (Test-Path -LiteralPath $existingModules -PathType Container)) {
      throw "dsmm/node_modules must already exist; dependency installation is forbidden"
    }
    New-Item -ItemType Junction -Path (Join-Path $mirror "node_modules") -Target $existingModules | Out-Null
    pnpm --dir $dsmmRoot exec tsc -p (Join-Path $mirror "tsconfig.json")
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM source build failed" }
    pnpm --dir $dsmmRoot exec tsc -p (Join-Path $mirror "tsconfig.test.json") --noEmit
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM test-config typecheck failed" }
    $resolvedTests = @($Tests | ForEach-Object { Join-Path $mirror $_ })
    foreach ($testPath in $resolvedTests) {
      if (-not (Test-Path -LiteralPath $testPath -PathType Leaf)) { throw "mirror test is missing: $testPath" }
    }
    $testOutput = @(node --test --experimental-strip-types $resolvedTests 2>&1)
    $testExit = $LASTEXITCODE
    $testOutput
    if ($ExpectedFailure -ne "") {
      if ($testExit -eq 0) { throw "EXPECTED RED: mirror tests passed" }
      $failurePattern = '(?m)^\s*not ok \d+ - ' + [regex]::Escape($ExpectedFailure) + '\s*$'
      if (($testOutput -join "`n") -notmatch $failurePattern) {
        throw "mirror RED did not contain expected failure: $ExpectedFailure"
      }
    } elseif ($testExit -ne 0) {
      throw "temporary DSMM targeted test failed"
    }
  } finally {
    $resolvedMirror = [IO.Path]::GetFullPath($mirror)
    $expectedPrefix = [IO.Path]::GetFullPath($context.tempParent + [IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedMirror.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $resolvedMirror -eq $expectedPrefix.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
      throw "refusing to remove unexpected mirror path: $resolvedMirror"
    }
    Remove-Item -LiteralPath $resolvedMirror -Recurse -Force
  }
}
```

Every later PowerShell fence repeats this exact fresh-process prologue before using any helper or receipt:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) {
  throw "remediation bootstrap marker is missing or duplicated"
}
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
```

The prologue is intentionally repeated, not assumed. Task receipts capture the exact pre-edit source/lib identities and expected source-change bit. A GREEN block independently reloads the bootstrap, validates its task receipt, compares current identities, and deletes only its exact receipt after success. Task 6 uses its receipt fields `staleRedPassed`, `buildInvocationCount`, `authoritativeSourceIdentity`, `authoritativeLibIdentity`, and per-gate evidence paths; a second Step 2 invocation sees `buildInvocationCount = 1` and fails before calling the build command.

---

### Task 1: Release-test regex control-flow narrowing

**Files:**
- Modify: `dsmm/test/release-readiness.test.ts:434-441`

**Interfaces:**
- Consumes: `RegExpExecArray | null` returned by `/^const PROFILE = "(?<profile>[^"]+)";$/mu.exec(smoke)` and optional `groups.profile`.
- Produces: a definitely assigned `profile: string`; no source/runtime/package interface changes.
- Regression matrix: match absent → `assert.fail("docker smoke defines its profile constant")`; named capture absent → `assert.fail("docker smoke profile regex captures its profile")`; valid capture → exact `dsmm-v1-smoke` assertion and existing README checks.

- [ ] **Step 1: Confirm the existing type-safety RED without generating lib**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
New-DsmmTaskReceipt -Task 1 -ExpectedSourceChange $false | Out-Null
$typeRed = @(pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit 2>&1)
$typeRedExit = $LASTEXITCODE
$typeRed
if ($typeRedExit -eq 0) { Remove-DsmmTaskReceipt -Task 1; throw "EXPECTED RED: nullable profileMatch unexpectedly typechecked" }
if (($typeRed -join "`n") -notmatch "profileMatch.*possibly.*null") {
  Remove-DsmmTaskReceipt -Task 1
  throw "release-test RED was not the confirmed nullable regex failure"
}
```

Expected: nonzero exit with the `profileMatch` possibly-null diagnostic at the current profile dereference; unrelated compiler/import errors block the task.

- [ ] **Step 2: Replace assertion-based narrowing with explicit branches**

Replace the current `assert.notEqual(...)` and non-null assertion with exactly this control flow:

```ts
const profileMatch = /^const PROFILE = "(?<profile>[^"]+)";$/mu.exec(smoke);
if (profileMatch === null) {
  assert.fail("docker smoke defines its profile constant");
}
const profile = profileMatch.groups?.profile;
if (profile === undefined) {
  assert.fail("docker smoke profile regex captures its profile");
}
assert.equal(profile, "dsmm-v1-smoke");
```

Do not extract a general regex helper or change the regex, profile value, or surrounding README assertions.

- [ ] **Step 3: Run typecheck GREEN and the targeted runtime suite**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 1
pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit
if ($LASTEXITCODE -ne 0) { throw "release-test type narrowing did not typecheck" }
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "release-readiness targeted test failed" }
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $receipt.sourceIdentityBefore) { throw "Task 1 changed dsmm/src" }
if ($currentLibIdentity -ne $receipt.libIdentityBefore) { throw "Task 1 changed working-tree dsmm/lib" }
Remove-DsmmTaskReceipt -Task 1
```

Expected: no TypeScript diagnostic; all release-readiness tests pass; `dsmm/src` and `dsmm/lib` identities remain unchanged.

**Review boundary:** test-correctness-only diff in `dsmm/test/release-readiness.test.ts`; no Git write.

---

### Task 2: Exception-safe model-routing warnings

**Files:**
- Modify: `dsmm/test/model-routing.test.ts:36-165,221-243,374-410`
- Modify: `dsmm/src/model-routing.ts:45-70,91-93`

**Interfaces:**
- Consumes: `registerModelRouting(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void`, `DshContext.logger`, and `next(): Promise<DshLlmCallConfig>`.
- Produces: unchanged private `warnUnavailable(readyCtx: DshContext, rootCtx: DshContext, desired: DeepseekReasoningEffort): void`, now swallowing only synchronous warning-emission errors.
- Test harness extension: `childLogger?: DshContext["logger"] | null` and `rootLogger?: DshContext["logger"] | null`; `null` means the logger is absent, while `undefined` preserves the existing recording default.
- Regression matrix: resolver throw, missing `reasoning`, empty efforts, and invalid default × throwing child logger or throwing root fallback logger → exact downstream object identity; `next()` sentinel rejection × both logger placements → exact sentinel rejection, no settings read, no resolver call.

- [ ] **Step 1: Extend the harness and write the failing warning-containment matrix**

Replace `routingHarness()` with the current implementation plus these complete logger seams; existing callers keep the recording default:

```ts
function routingHarness(options: {
  settings?: DsmmSettings;
  getSettings?: () => DsmmSettings;
  resolve?: DshLlmRuntime["resolveModelInfo"];
  withInject?: boolean;
  childLogger?: DshContext["logger"] | null;
  rootLogger?: DshContext["logger"] | null;
} = {}): RoutingHarness {
  const dependencies: string[][] = [];
  const resolverCalls: Array<{ provider: string; model: string; signal: AbortSignal | undefined }> = [];
  const warnings: string[] = [];
  const effects: Array<() => void | (() => void)> = [];
  let listener: AgentRequestListener | undefined;
  let installer: ((readyCtx: DshContext) => unknown) | undefined;
  const resolve = options.resolve ?? (async (provider, model, signal) => {
    resolverCalls.push({ provider, model, signal });
    return { provider, id: model, name: model, reasoning: reasoning(["high"], "high") };
  });
  const recordingLogger: NonNullable<DshContext["logger"]> = {
    warn(message) {
      warnings.push(message);
    }
  };
  const childLogger = options.childLogger === undefined ? recordingLogger : options.childLogger;
  const createChild = (): DshContext => ({
    llm: {
      async resolveModelInfo(provider, model, signal) {
        if (options.resolve !== undefined) resolverCalls.push({ provider, model, signal });
        return resolve(provider, model, signal);
      }
    },
    on(event, candidate) {
      if (event === "agent/request") listener = candidate as AgentRequestListener;
      return () => {
        if (listener === candidate) listener = undefined;
      };
    },
    effect(callback) {
      effects.push(callback);
    },
    ...(childLogger === null ? {} : { logger: childLogger })
  });
  const child = createChild();
  const rootLogger = options.rootLogger === undefined ? childLogger : options.rootLogger;
  const root: DshContext = {
    ...(rootLogger === null ? {} : { logger: rootLogger }),
    ...(options.withInject === false
      ? { llm: child.llm, on: child.on, effect: child.effect }
      : {
          inject(deps, candidate) {
            dependencies.push([...deps]);
            installer = candidate;
          }
        })
  };
  const controller = new DeepworkModeController({});
  registerModelRouting(root, controller, options.getSettings ?? (() => options.settings ?? DEFAULT_DSMM_SETTINGS));

  return {
    dependencies,
    resolverCalls,
    warnings,
    child,
    get listener() {
      return listener;
    },
    createChild,
    install(readyCtx = child) {
      if (options.withInject === false) return;
      assert.ok(installer);
      installer(readyCtx);
    },
    dispose() {
      for (const effect of effects.splice(0)) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanup();
      }
    }
  };
}
```

Use conditional object spreads so a `null` logger omits the property rather than assigning `null`. Add this exact matrix test shape:

```ts
test("model routing contains throwing warning loggers and preserves downstream identity", async () => {
  const resolverCases: Array<[string, DshLlmRuntime["resolveModelInfo"]]> = [
    ["resolver rejection", async () => { throw new Error("resolver sentinel"); }],
    ["missing reasoning", async (provider, model) => ({ provider, id: model, name: model })],
    ["empty efforts", async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning([]) })],
    ["invalid default", async (provider, model) => ({ provider, id: model, name: model, reasoning: reasoning(["off"], "invalid") })]
  ];

  for (const loggerOwner of ["child", "root"] as const) {
    for (const [caseName, resolve] of resolverCases) {
      const loggerSentinel = new Error(`${loggerOwner} logger sentinel`);
      const throwingLogger: NonNullable<DshContext["logger"]> = {
        warn() { throw loggerSentinel; }
      };
      const harness = routingHarness({
        resolve,
        childLogger: loggerOwner === "child" ? throwingLogger : null,
        rootLogger: loggerOwner === "root" ? throwingLogger : null
      });
      harness.install();
      const downstream = officialConfig({ unknownNestedOption: { caseName } });
      assert.equal(await request(harness, activeFrame(), downstream), downstream, `${loggerOwner}: ${caseName}`);
    }
  }
});
```

Replace the existing downstream-rejection test with this exact two-placement regression:

```ts
test("model routing awaits downstream first and preserves its rejection without resolving", async () => {
  for (const loggerOwner of ["child", "root"] as const) {
    const events: string[] = [];
    const sentinel = new Error(`downstream ${loggerOwner} sentinel`);
    const loggerSentinel = new Error(`${loggerOwner} logger must not run`);
    const throwingLogger: NonNullable<DshContext["logger"]> = {
      warn() { throw loggerSentinel; }
    };
    const harness = routingHarness({
      getSettings() {
        events.push("settings");
        return DEFAULT_DSMM_SETTINGS;
      },
      childLogger: loggerOwner === "child" ? throwingLogger : null,
      rootLogger: loggerOwner === "root" ? throwingLogger : null
    });
    harness.install();
    const listener = harness.listener;
    assert.ok(listener);

    await assert.rejects(
      listener(activeFrame(), async () => {
        events.push("next");
        throw sentinel;
      }),
      (error) => error === sentinel
    );
    assert.deepEqual(events, ["next"]);
    assert.equal(harness.resolverCalls.length, 0);
  }
});
```

- [ ] **Step 2: Run the OS-temp RED**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
New-DsmmTaskReceipt -Task 2 -ExpectedSourceChange $true | Out-Null
try {
  Invoke-DsmmRemediationMirrorTests `
    -Tests @("test/model-routing.test.ts") `
    -ExpectedFailure "model routing contains throwing warning loggers and preserves downstream identity"
} catch {
  Remove-DsmmTaskReceipt -Task 2
  throw
}
```

Expected: mirror compilation/typecheck succeeds and the new containment test fails because the current `warnUnavailable()` lets the logger sentinel reject the request. A mirror/compiler/dependency failure is not an acceptable RED.

- [ ] **Step 3: Contain warning emission without widening the request catch**

Change only the private warning helper:

```ts
function warnUnavailable(readyCtx: DshContext, rootCtx: DshContext, desired: DeepseekReasoningEffort): void {
  try {
    (readyCtx.logger ?? rootCtx.logger)?.warn(`dsmm could not select advertised reasoning effort for ${DEEPSEEK_V4_PRO_ROUTE}; desired ${desired}`);
  } catch {
    // Warning emission is diagnostic-only and must not alter routing fail-open behavior.
  }
}
```

Keep `const downstream = await next()` before settings/resolver logic and outside the existing resolver `try/catch`; do not catch, replace, wrap, or log a `next()` rejection. Preserve exact downstream identity on every resolver/unusable-metadata path.

- [ ] **Step 4: Run mirror GREEN and record the source correction**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 2
Invoke-DsmmRemediationMirrorTests -Tests @("test/model-routing.test.ts")
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -eq $receipt.sourceIdentityBefore) { throw "Task 2 did not change the reviewed model-routing source" }
if ($currentLibIdentity -ne $receipt.libIdentityBefore) { throw "Task 2 generated working-tree dsmm/lib" }
Remove-DsmmTaskReceipt -Task 2
```

Expected: all existing and new model-routing tests pass from mirror-built output; the working-tree generated lib remains byte-identical and intentionally stale.

**Review boundary:** logger containment only; no routing policy, provider selection, effort waterfall, request ordering, or Git write.

---

### Task 3: Reserved `dsmm-status` mode-name normalization

**Files:**
- Modify: `dsmm/test/settings.test.ts:74-92,337-386,610-681`
- Modify: `dsmm/src/settings.ts:107-159,316-332`
- Modify: `dsmm/src/commands.ts:1-8`
- Verify: `dsmm/test/commands.test.ts:1-74`

**Interfaces:**
- Consumes: `resolveConfig(config?: DsmmPluginConfig): DsmmSettings`, `registerSettings(...)`, `apply(ctx: DshContext, config?: Config): void`, and fixed status command registration.
- Produces: `export const DSMM_STATUS_COMMAND = "dsmm-status"` from `settings.ts`; `commands.ts` imports and re-exports the same binding; private `normalizeModeName(modeName: string | undefined): string`.
- Normalization matrix: exact `dsmm-status` → `DEFAULT_DSMM_SETTINGS.modeName` (`deepwork`); `undefined` → `deepwork`; `custom`, empty string, `DSMM-STATUS`, and `dsmm-status ` remain unchanged.
- Registration matrix: direct base and attached settings both expose `deepwork`; actual base and settings-ready child registration each produce exactly `["deepwork", "dsmm-status"]` once.

- [ ] **Step 1: Write direct, attached, and real-registration regressions**

Add `import { DSMM_STATUS_COMMAND } from "../lib/commands.js";` to `settings.test.ts` so the public compatibility surface is exercised. Add direct assertions:

```ts
test("resolveConfig reserves only the exact dsmm-status mode name", () => {
  assert.equal(resolveConfig({ modeName: DSMM_STATUS_COMMAND }).modeName, DEFAULT_DSMM_SETTINGS.modeName);
  assert.equal(resolveConfig({ modeName: "custom" }).modeName, "custom");
  assert.equal(resolveConfig({ modeName: "" }).modeName, "");
  assert.equal(resolveConfig({ modeName: "DSMM-STATUS" }).modeName, "DSMM-STATUS");
  assert.equal(resolveConfig({ modeName: "dsmm-status " }).modeName, "dsmm-status ");
});
```

Add this attached-settings regression, which proves both the live getter and installation callback consume the normalized value:

```ts
test("registerSettings normalizes an attached reserved mode name for getters and installs", () => {
  const installedModeNames: string[] = [];
  const attached = { ...DEFAULT_DSMM_SETTINGS, modeName: DSMM_STATUS_COMMAND };
  const getSettings = registerSettings({
    settings: {
      register<T>() {
        return { get: () => attached as T };
      }
    }
  }, {}, {
    install(_readyCtx, getReadySettings) {
      installedModeNames.push(getReadySettings().modeName);
    }
  });

  assert.equal(getSettings().modeName, "deepwork");
  assert.deepEqual(installedModeNames, ["deepwork"]);
});
```

Add an `apply()` test with two cases:

```ts
test("reserved dsmm-status mode names normalize for base, attached, and dual registration", () => {
  const baseCommands: string[] = [];
  apply({ commands: { register(command) { baseCommands.push(command.name); } } }, { modeName: DSMM_STATUS_COMMAND });
  assert.deepEqual(baseCommands, ["deepwork", "dsmm-status"]);

  const rootCommands: string[] = [];
  const childCommands: string[] = [];
  let settingsInstaller: ((readyCtx: DshContext) => unknown) | undefined;
  const child: DshContext = {
    settings: {
      register<T>() {
        return { get: () => ({ ...DEFAULT_DSMM_SETTINGS, modeName: DSMM_STATUS_COMMAND }) as T };
      }
    },
    systemPrompt: { section() {} },
    commands: { register(command) { childCommands.push(command.name); } }
  };
  apply({
    systemPrompt: { section() {} },
    commands: { register(command) { rootCommands.push(command.name); } },
    inject(dependencies, installer) {
      if (dependencies[0] === "settings") settingsInstaller = installer;
    }
  }, { modeName: DSMM_STATUS_COMMAND });
  const installer = settingsInstaller;
  assert.ok(installer);
  installer(child);
  assert.deepEqual(rootCommands, []);
  assert.deepEqual(childCommands, ["deepwork", "dsmm-status"]);
});
```

Retain the existing custom `base-deepwork` / `attached-deepwork` test unchanged to prove non-reserved names still pass through.

- [ ] **Step 2: Run the OS-temp RED**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
New-DsmmTaskReceipt -Task 3 -ExpectedSourceChange $true | Out-Null
try {
  Invoke-DsmmRemediationMirrorTests `
    -Tests @("test/settings.test.ts", "test/commands.test.ts") `
    -ExpectedFailure "reserved dsmm-status mode names normalize for base, attached, and dual registration"
} catch {
  Remove-DsmmTaskReceipt -Task 3
  throw
}
```

Expected: the new tests observe `dsmm-status` instead of `deepwork` and/or duplicate status command names; existing custom-name tests remain valid.

- [ ] **Step 3: Introduce one constant and exact normalization**

In `settings.ts`, define the public constant next to the settings namespace and use a private normalizer:

```ts
export const DSMM_SETTINGS_NAMESPACE = "dsmm";
export const DSMM_STATUS_COMMAND = "dsmm-status";

function normalizeModeName(modeName: string | undefined): string {
  const resolved = modeName ?? DEFAULT_DSMM_SETTINGS.modeName;
  return resolved === DSMM_STATUS_COMMAND ? DEFAULT_DSMM_SETTINGS.modeName : resolved;
}
```

Change only the `modeName` assignment in `resolveConfig()`:

```ts
modeName: normalizeModeName(config.modeName),
```

In `commands.ts`, replace the duplicate declaration while preserving its current public export:

```ts
import { DSMM_STATUS_COMMAND } from "./settings.js";
import type { DsmmSettings } from "./settings.js";
export { DSMM_STATUS_COMMAND } from "./settings.js";
```

Do not change `registerDeepworkCommand()`, `registerDsmmStatusCommand()`, `index.ts` installation order, schema defaults, or non-reserved command values.

- [ ] **Step 4: Run mirror GREEN and append the stale-output obligation**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 3
Invoke-DsmmRemediationMirrorTests -Tests @("test/settings.test.ts", "test/commands.test.ts")
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -eq $receipt.sourceIdentityBefore) { throw "Task 3 did not change the reviewed settings/commands source" }
if ($currentLibIdentity -ne $receipt.libIdentityBefore) { throw "Task 3 generated working-tree dsmm/lib" }
Remove-DsmmTaskReceipt -Task 3
```

Expected: reserved base/attached values normalize, dual registration has no collision, all other names remain exact, existing command API tests pass, and working-tree lib remains stale.

**Review boundary:** exact reserved-name normalization only; no general naming framework, schema migration, status handler change, or Git write.

---

### Task 4: Exact approved release-script policy

**Files:**
- Modify: `dsmm/test/release-readiness.test.ts:581-608`
- Modify: `dsmm/scripts/check-release-readiness.mjs:72-81,220-255`
- Verify: `dsmm/package.json:60-68`

**Interfaces:**
- Consumes: the exact eight-entry `expectedScripts` object already mirrored from `dsmm/package.json` and `isDeepStrictEqual` from `node:util`.
- Produces: deterministic preflight error `manifest.scripts must exactly equal the release script policy` for any added, removed, changed, non-object, or absent scripts value.
- Approved map: `build = "tsc -p tsconfig.json"`; `check:release = "node scripts/check-release-readiness.mjs"`; `typecheck = "tsc -p tsconfig.json --noEmit"`; `typecheck:test = "pnpm run build && tsc -p tsconfig.test.json --noEmit"`; `test = "pnpm run build && node --test --experimental-strip-types test/*.test.ts"`; `smoke:docker:build = "docker build --build-arg DSH_PACKAGE=@deepseek-ai/dsh@0.1.1-rc.2 -f docker/Dockerfile.smoke -t dsmm-dsh-smoke:0.1 .."`; `smoke:docker:run = "docker run --rm dsmm-dsh-smoke:0.1"`; `smoke:docker = "node scripts/docker-smoke.mjs"`.
- Receipt contract on preflight rejection: `name/version === null`; all five numeric pack-derived fields are `0`; `outcome === "failed"`; no lifecycle marker and no `.tgz` residue.

- [ ] **Step 1: Replace the mixed-defect fixture and add removed/changed regressions**

Replace the current author-plus-`prepack` fixture with this extra-script-only test. The manifest author and every other field remain valid:

```ts
test("release readiness checker rejects an extra lifecycle script before npm pack", () => {
  const fixtureRoot = createReleaseFixture();
  const markerPath = join(fixtureRoot, ".release-readiness-lifecycle-marker");
  try {
    updateFixtureManifest(fixtureRoot, (manifest) => {
      (manifest.scripts as Record<string, string>).prepack =
        "node -e \"require('node:fs').writeFileSync('.release-readiness-lifecycle-marker', 'ran')\"";
    });
    const tgzBefore = listTgzPaths(fixtureRoot);
    const { receipt, status } = runReleaseChecker(fixtureRoot);

    assertReceiptKeys(receipt);
    assert.equal(existsSync(markerPath), false, "extra lifecycle scripts are rejected before pack");
    assert.equal(status, 1);
    assert.equal(receipt.name, null);
    assert.equal(receipt.version, null);
    assert.equal(receipt.fileCount, 0);
    assert.equal(receipt.packedSize, 0);
    assert.equal(receipt.unpackedSize, 0);
    assert.equal(receipt.requiredSurfaceCount, 0);
    assert.equal(receipt.forbiddenSurfaceCount, 0);
    assert.equal(receipt.outcome, "failed");
    assert.deepEqual(receipt.errors, ["manifest.scripts must exactly equal the release script policy"]);
    assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore);
    const checkerSource = readFileSync(checkerPath, "utf8");
    assert.match(checkerSource, /npm\.cmd pack %DSMM_RELEASE_PACKAGE_ROOT% --dry-run --json --ignore-scripts/u);
    assert.match(checkerSource, /\["pack", packageRoot, "--dry-run", "--json", "--ignore-scripts"\]/u);
  } finally {
    removeReleaseFixture(fixtureRoot);
  }
});
```

Add this table-driven test for removed and changed approved entries:

```ts
test("release readiness checker rejects removed and changed release scripts before npm pack", () => {
  const mutations: Array<[string, (scripts: Record<string, string>) => void]> = [
    ["removed build", (scripts) => { delete scripts.build; }],
    ["changed build", (scripts) => { scripts.build = "tsc -p tsconfig.json --pretty false"; }]
  ];

  for (const [caseName, mutate] of mutations) {
    const fixtureRoot = createReleaseFixture();
    try {
      updateFixtureManifest(fixtureRoot, (manifest) => mutate(manifest.scripts as Record<string, string>));
      const tgzBefore = listTgzPaths(fixtureRoot);
      const { receipt, status } = runReleaseChecker(fixtureRoot);

      assert.equal(status, 1, caseName);
      assert.equal(receipt.name, null, caseName);
      assert.equal(receipt.version, null, caseName);
      assert.equal(receipt.fileCount, 0, caseName);
      assert.equal(receipt.packedSize, 0, caseName);
      assert.equal(receipt.unpackedSize, 0, caseName);
      assert.equal(receipt.requiredSurfaceCount, 0, caseName);
      assert.equal(receipt.forbiddenSurfaceCount, 0, caseName);
      assert.equal(receipt.outcome, "failed", caseName);
      assert.deepEqual(receipt.errors, ["manifest.scripts must exactly equal the release script policy"], caseName);
      assert.deepEqual(listTgzPaths(fixtureRoot), tgzBefore, caseName);
    } finally {
      removeReleaseFixture(fixtureRoot);
    }
  }
});
```

- [ ] **Step 2: Run the checker-policy RED**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
New-DsmmTaskReceipt -Task 4 -ExpectedSourceChange $false | Out-Null
$scriptPolicyRed = @(node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts" 2>&1)
$scriptPolicyRedExit = $LASTEXITCODE
$scriptPolicyRed
if ($scriptPolicyRedExit -eq 0) { Remove-DsmmTaskReceipt -Task 4; throw "EXPECTED RED: checker accepted an extra lifecycle script" }
if (($scriptPolicyRed -join "`n") -notlike "*release readiness checker rejects an extra lifecycle script before npm pack*") {
  Remove-DsmmTaskReceipt -Task 4
  throw "release-script RED did not fail at the named extra-lifecycle fixture"
}
```

Expected: the extra-script-only fixture fails because the current checker reaches pack and returns a ready receipt; marker remains absent because current pack already uses `--ignore-scripts`. Unrelated release contracts must pass.

- [ ] **Step 3: Replace per-key checks with exact structural equality**

In `validateManifest(manifest, errors)`, replace the per-entry loop with:

```js
if (!isDeepStrictEqual(manifest.scripts, expectedScripts)) {
  errors.push("manifest.scripts must exactly equal the release script policy");
}
```

Do not alter `expectedScripts`, `runPack()`, `--ignore-scripts`, error sorting, receipt fields, package metadata policy, or any other preflight rule.

- [ ] **Step 4: Run GREEN and prove pre-pack failure/preservation**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 4
$tgzBefore = @(fd --type f --extension tgz . ".\dsmm" | Sort-Object)
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "exact release-script policy tests failed" }
$tgzAfter = @(fd --type f --extension tgz . ".\dsmm" | Sort-Object)
if (($tgzBefore -join "`n") -ne ($tgzAfter -join "`n")) { throw "Task 4 changed tarball residue" }
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
if ($currentSourceIdentity -ne $receipt.sourceIdentityBefore) { throw "Task 4 changed dsmm/src" }
if ($currentLibIdentity -ne $receipt.libIdentityBefore) { throw "Task 4 changed working-tree dsmm/lib" }
Remove-DsmmTaskReceipt -Task 4
```

Expected: real manifest passes; extra/removed/changed scripts all fail with the one exact policy error before pack-derived fields can change; lifecycle marker and tarballs are absent.

**Review boundary:** exact scripts equality only; no approved command changes, lifecycle execution, package metadata relaxation, publication, or Git write.

---

### Task 5: Docker primary-error preservation

**Files:**
- Create: `dsmm/scripts/docker-cleanup-errors.mjs`
- Modify: `dsmm/test/docker-smoke-assets.test.ts:1-8,347-413`
- Modify: `dsmm/scripts/docker-smoke.mjs:1-10,159-185,187-320`

**Interfaces:**
- Consumes: optional `primaryError`, a readonly array of cleanup failures captured in execution order, and a stable aggregate message.
- Produces: conceptual typed signature `throwAfterCleanup(primaryError: unknown | undefined, cleanupErrors: readonly unknown[], message: string): void`, exported from the `.mjs` helper as `export function throwAfterCleanup(primaryError, cleanupErrors, message)`.
- Four-case contract: neither → return; primary only → throw identical primary; cleanup only → `AggregateError` with cleanup errors in order and no cause; both → `AggregateError` with primary first, cleanup errors after it, and `cause === primary`.
- Integration contract: outer message `failed to clean owned dsmm Docker image`; inner message `failed to clean owned dsmm Docker smoke resources`.

- [ ] **Step 1: Write the pure four-case test and static integration assertions**

Import `pathToFileURL` in `docker-smoke-assets.test.ts`, then load the `.mjs` helper through a runtime URL inside an async test so strict TypeScript does not require a declaration file:

```ts
test("Docker cleanup error helper preserves primary and cleanup outcomes", async () => {
  const helperUrl = pathToFileURL(join(packageRoot, "scripts", "docker-cleanup-errors.mjs")).href;
  const { throwAfterCleanup } = await import(helperUrl) as {
    throwAfterCleanup(primaryError: unknown | undefined, cleanupErrors: readonly unknown[], message: string): void;
  };
  const primary = new Error("primary");
  const cleanupA = new Error("cleanup-a");
  const cleanupB = new Error("cleanup-b");

  assert.doesNotThrow(() => throwAfterCleanup(undefined, [], "cleanup"));
  assert.throws(() => throwAfterCleanup(primary, [], "cleanup"), (error: unknown) => error === primary);
  assert.throws(() => throwAfterCleanup(undefined, [cleanupA, cleanupB], "cleanup"), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [cleanupA, cleanupB]);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.throws(() => throwAfterCleanup(primary, [cleanupA, cleanupB], "cleanup"), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [primary, cleanupA, cleanupB]);
    assert.equal(error.cause, primary);
    return true;
  });
});
```

In the existing static asset test, define `const cleanupHelper = join(packageRoot, "scripts", "docker-cleanup-errors.mjs");`, assert it exists, and replace the direct inner `throw new AggregateError(cleanupErrors...)` assertion with:

```ts
const cleanupHelper = join(packageRoot, "scripts", "docker-cleanup-errors.mjs");
assert.equal(existsSync(cleanupHelper), true);
assert.match(scriptText, /import \{ throwAfterCleanup \} from "\.\/docker-cleanup-errors\.mjs";/u);
const cleanupCalls = [...scriptText.matchAll(/throwAfterCleanup\(primaryError, cleanupErrors,/gu)];
assert.equal(cleanupCalls.length, 2, "outer and inner cleanup must both preserve the primary error");
const outerSmoke = scriptText.slice(scriptText.indexOf("async function runOuterSmoke()"), scriptText.indexOf("async function runInnerSmoke()"));
assert.match(outerSmoke, /throwAfterCleanup\(primaryError, cleanupErrors, "failed to clean owned dsmm Docker image"\)/u);
assert.match(outerSmoke, /"image", "rm", imageTag/u);
const innerCleanup = scriptText.slice(scriptText.indexOf("async function runInnerSmoke()"), scriptText.indexOf("function requireFromPinnedDsh()"));
assert.match(innerCleanup, /throwAfterCleanup\(primaryError, cleanupErrors, "failed to clean owned dsmm Docker smoke resources"\)/u);
assert.match(innerCleanup, /rmSync\(home, \{ recursive: true, force: true/u);
assert.match(innerCleanup, /rmSync\(workspace, \{ recursive: true, force: true/u);
```

Preserve all existing bans on stop/kill/prune and all 17 marker assertions.

- [ ] **Step 2: Run the missing-helper RED**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
New-DsmmTaskReceipt -Task 5 -ExpectedSourceChange $false | Out-Null
$dockerCleanupRed = @(node --test --experimental-strip-types ".\dsmm\test\docker-smoke-assets.test.ts" 2>&1)
$dockerCleanupRedExit = $LASTEXITCODE
$dockerCleanupRed
if ($dockerCleanupRedExit -eq 0) { Remove-DsmmTaskReceipt -Task 5; throw "EXPECTED RED: Docker cleanup helper existed before implementation" }
if (($dockerCleanupRed -join "`n") -notlike "*docker-cleanup-errors.mjs*") {
  Remove-DsmmTaskReceipt -Task 5
  throw "Docker cleanup RED did not fail at the missing helper"
}
```

Expected: failure is `ERR_MODULE_NOT_FOUND` for `docker-cleanup-errors.mjs` or the named missing static integration; existing Docker asset contracts otherwise remain unchanged. Do not run Docker in this task.

- [ ] **Step 3: Create the pure helper**

Create `dsmm/scripts/docker-cleanup-errors.mjs` with exactly one export:

```js
export function throwAfterCleanup(primaryError, cleanupErrors, message) {
  const failures = [...cleanupErrors];
  if (primaryError === undefined) {
    if (failures.length > 0) throw new AggregateError(failures, message);
    return;
  }
  if (failures.length === 0) throw primaryError;
  throw new AggregateError([primaryError, ...failures], message, { cause: primaryError });
}
```

The helper performs no logging, mutation, cleanup, process operation, or error serialization.

- [ ] **Step 4: Integrate outer and inner cleanup without changing resource ownership**

Import the helper from `./docker-cleanup-errors.mjs`. Replace `runOuterSmoke()` with this complete control flow:

```js
async function runOuterSmoke() {
  const imageTag = `dsmm-dsh-smoke:${String(process.pid)}-${randomUUID()}`;
  let imageOwned = false;
  let primaryError;
  const cleanupErrors = [];

  try {
    const build = spawnSync("docker", [
      "build",
      "--build-arg",
      "DSH_PACKAGE=@deepseek-ai/dsh@0.1.1-rc.2",
      "-f",
      "docker/Dockerfile.smoke",
      "-t",
      imageTag,
      ".."
    ], { cwd: root, stdio: "inherit" });
    requireSuccess(build, "docker build");
    imageOwned = true;

    const run = spawnSync("docker", ["run", "--rm", imageTag], { stdio: "inherit" });
    requireSuccess(run, "docker run");
  } catch (error) {
    primaryError = error;
  } finally {
    if (imageOwned) {
      try {
        const remove = spawnSync("docker", ["image", "rm", imageTag], { stdio: "inherit" });
        requireSuccess(remove, `docker image rm ${imageTag}`);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned dsmm Docker image");
}
```

For `runInnerSmoke()`, move `const cleanupErrors = [];` next to its existing `workspace`, `home`, and `passed` declarations and add `let primaryError;`. Insert this exact catch immediately before its current cleanup `finally`:

```js
  } catch (error) {
    primaryError = error;
  } finally {
```

Retain home cleanup before workspace cleanup and both existing `cleanupErrors.push(error)` statements. Replace the direct aggregate throw at the end of that `finally` with this exact epilogue:

```js
  }

  throwAfterCleanup(primaryError, cleanupErrors, "failed to clean owned dsmm Docker smoke resources");
  if (passed) console.log("DSMM_PACKAGED_RUNTIME_SMOKE_OK");
}
```

Do not add container/image pruning, process termination, broader paths, or force a successful primary operation after cleanup failure.

- [ ] **Step 5: Run test GREEN without Docker and preserve generated output**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 5
node --test --experimental-strip-types ".\dsmm\test\docker-smoke-assets.test.ts"
if ($LASTEXITCODE -ne 0) { throw "Docker cleanup helper/static integration tests failed" }
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
if ($currentSourceIdentity -ne $receipt.sourceIdentityBefore) { throw "Task 5 changed dsmm/src" }
if ($currentLibIdentity -ne $receipt.libIdentityBefore) { throw "Task 5 changed working-tree dsmm/lib" }
Remove-DsmmTaskReceipt -Task 5
```

Expected: all four helper outcomes pass by identity/order/cause, both outer and inner calls are present, prior cleanup ownership/static safety/17-marker contracts remain green, and Docker is not invoked.

**Review boundary:** pure error composition plus two cleanup call sites only; no smoke scope expansion, DSH upgrade, Docker execution, process termination, or Git write.

---

### Task 6: Authoritative generation, full gates, and identity-bound final review

**Files:**
- Regenerate when required for a new source identity: `dsmm/lib/**`
- Verify: every `dsmm/test/*.test.ts`, `dsmm/package.json`, `dsmm/docker/Dockerfile.smoke`, `dsmm/scripts/*.mjs`, root typecheck/test/build surfaces, and `skills/v1/requesting-code-review/SKILL.md`
- OS-temp only: deterministic Task 6 receipt and evidence directory returned by `Get-DsmmTaskReceiptPath -Task 6` and `Get-DsmmTaskEvidenceDirectory -Task 6`; both are deleted after final acceptance.

**Interfaces:**
- Consumes: Tasks 1-5 GREEN, current files, the fresh-process bootstrap, and the canonical identity module embedded in `skills/v1/requesting-code-review/SKILL.md`.
- Produces: Task 6 receipt fields `staleRedPassed`, `buildInvocationCount`, `authoritativeSourceIdentity`, `authoritativeLibIdentity`, per-gate output paths/digests, canonical identity, immutable review-input artifacts, one packet path/digest, and two external five-field review receipts.
- Invalidation interface: a source correction must preserve the previous authoritative lib, prove a named stale test against it, and re-arm one build for the new source identity; a non-source correction keeps the recorded source/lib identities but clears and reruns gates; any changed review input deletes the old OS-temp packet/artifacts and requires a new identity-bound capture.

- [ ] **Step 1: Verify final pre-generation state and reproduce the named stale-lib RED**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
New-DsmmTaskReceipt -Task 6 -ExpectedSourceChange $true | Out-Null
$receipt = Read-DsmmTaskReceipt -Task 6
$evidenceDirectory = Get-DsmmTaskEvidenceDirectory -Task 6
if (Test-Path -LiteralPath $evidenceDirectory) { Remove-DsmmTaskReceipt -Task 6; throw "Task 6 evidence directory already exists: $evidenceDirectory" }
New-Item -ItemType Directory -Path $evidenceDirectory | Out-Null
$staleTests = @(
  ".\dsmm\test\model-routing.test.ts",
  ".\dsmm\test\settings.test.ts",
  ".\dsmm\test\commands.test.ts"
)
$staleAssertions = @(
  "model routing contains throwing warning loggers and preserves downstream identity",
  "reserved dsmm-status mode names normalize for base, attached, and dual registration"
)
foreach ($testPath in $staleTests) {
  if (-not (Test-Path -LiteralPath $testPath -PathType Leaf)) { throw "stale test is missing: $testPath" }
}
$staleOutput = @(node --test --experimental-strip-types $staleTests 2>&1)
$staleExit = $LASTEXITCODE
$staleOutput
if ($staleExit -eq 0) {
  Remove-DsmmTaskEvidenceDirectory -Task 6
  Remove-DsmmTaskReceipt -Task 6
  throw "EXPECTED RED: remediated tests passed against stale generated lib"
}
foreach ($assertion in $staleAssertions) {
  $failurePattern = '(?m)^\s*not ok \d+ - ' + [regex]::Escape($assertion) + '\s*$'
  if (($staleOutput -join "`n") -notmatch $failurePattern) {
    Remove-DsmmTaskEvidenceDirectory -Task 6
    Remove-DsmmTaskReceipt -Task 6
    throw "stale generated failure omitted expected assertion: $assertion"
  }
}
$staleOutputPath = Join-Path $evidenceDirectory "01-stale-generated-red.txt"
[IO.File]::WriteAllLines($staleOutputPath, [string[]]$staleOutput, [Text.UTF8Encoding]::new($false))
$receipt.evidenceDirectory = $evidenceDirectory
$receipt.staleRedPassed = $true
$receipt.staleTests = $staleTests
$receipt.staleAssertions = $staleAssertions
$receipt.staleOutputPath = $staleOutputPath
$receipt.staleOutputDigest = Get-DsmmFileSha256 -Path $staleOutputPath
$receipt.buildInvocationCount = 0
$receipt.rootTestInvocationCount = 0
$receipt.rootBuildInvocationCount = 0
$receipt.generationReady = $false
$receipt.gatesValid = $false
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Expected: old working-tree lib fails both the throwing-logger containment and reserved-name registration tests by their exact names. Syntax/import/dependency or unrelated test failures do not satisfy this RED.

- [ ] **Step 2: Generate working-tree lib exactly once for this source identity**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.staleRedPassed -ne $true -or $receipt.generationReady -ne $false) { throw "Task 6 stale-generation precondition is absent" }
if ([int]$receipt.buildInvocationCount -ne 0) { throw "authoritative DSMM build was already invoked for this receipt" }
$sourceBefore = Get-DsmmTreeIdentity -Tree "dsmm/src"
$libBefore = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($sourceBefore -ne $receipt.sourceIdentityBefore -or $libBefore -ne $receipt.libIdentityBefore) { throw "source/lib changed after stale RED" }
$receipt.buildInvocationCount = 1
$receipt.buildSourceIdentity = $sourceBefore
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
$buildOutput = @(pnpm --filter dsmm build 2>&1)
$buildExit = $LASTEXITCODE
$buildOutput
$buildOutputPath = Join-Path $receipt.evidenceDirectory "02-authoritative-dsmm-build.txt"
[IO.File]::WriteAllLines($buildOutputPath, [string[]]$buildOutput, [Text.UTF8Encoding]::new($false))
if ($buildExit -ne 0) { throw "authoritative DSMM build failed; receipt prevents an automatic second invocation" }
$authoritativeSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$authoritativeLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($authoritativeSourceIdentity -ne $sourceBefore) { throw "source changed during authoritative DSMM build" }
if ($authoritativeLibIdentity -eq $libBefore) { throw "authoritative build did not refresh stale generated output" }
$receipt = Read-DsmmTaskReceipt -Task 6
$receipt.authoritativeSourceIdentity = $authoritativeSourceIdentity
$receipt.authoritativeLibIdentity = $authoritativeLibIdentity
$receipt.buildOutputPath = $buildOutputPath
$receipt.buildOutputDigest = Get-DsmmFileSha256 -Path $buildOutputPath
$receipt.generationReady = $true
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

The receipt sets `buildInvocationCount = 1` before the command. A second Step 2 process fails before invoking build. Do not run `pnpm --filter dsmm test` or `typecheck:test`, because both package scripts rebuild.

- [ ] **Step 3: Run DSMM noEmit and every DSMM test without rebuilding**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.generationReady -ne $true -or [int]$receipt.buildInvocationCount -ne 1) { throw "authoritative generation receipt is incomplete" }
if ((Get-DsmmTreeIdentity -Tree "dsmm/src") -ne $receipt.authoritativeSourceIdentity -or
    (Get-DsmmTreeIdentity -Tree "dsmm/lib") -ne $receipt.authoritativeLibIdentity) { throw "source/lib drifted after generation" }
$noEmitOutput = @(pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit 2>&1)
$noEmitExit = $LASTEXITCODE
$noEmitOutput
$noEmitPath = Join-Path $receipt.evidenceDirectory "03-dsmm-test-config-noemit.txt"
[IO.File]::WriteAllLines($noEmitPath, [string[]]$noEmitOutput, [Text.UTF8Encoding]::new($false))
if ($noEmitExit -ne 0) { throw "DSMM test-config typecheck failed" }
$dsmmTests = @(fd --type f --extension ts --glob "*.test.ts" ".\dsmm\test" | Sort-Object)
if ($LASTEXITCODE -ne 0 -or $dsmmTests.Count -eq 0) { throw "cannot enumerate DSMM tests" }
$testOutput = @(node --test --experimental-strip-types $dsmmTests 2>&1)
$testExit = $LASTEXITCODE
$testOutput
$testPath = Join-Path $receipt.evidenceDirectory "03-dsmm-all-tests.txt"
[IO.File]::WriteAllLines($testPath, [string[]]$testOutput, [Text.UTF8Encoding]::new($false))
if ($testExit -ne 0) { throw "DSMM all-tests gate failed" }
$receipt.dsmmNoEmit = "passed"
$receipt.dsmmNoEmitPath = $noEmitPath
$receipt.dsmmNoEmitDigest = Get-DsmmFileSha256 -Path $noEmitPath
$receipt.dsmmAllTests = "passed"
$receipt.dsmmAllTestsPath = $testPath
$receipt.dsmmAllTestsDigest = Get-DsmmFileSha256 -Path $testPath
$receipt.gatesValid = $false
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Expected: all DSMM suites pass against the one authoritative generated lib, including all five remediation regressions.

- [ ] **Step 4: Run the checker and validate its exact ready receipt**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.dsmmNoEmit -ne "passed" -or $receipt.dsmmAllTests -ne "passed") { throw "DSMM gates are incomplete" }
$releaseOutput = @(pnpm --filter dsmm check:release 2>&1)
$releaseExit = $LASTEXITCODE
$releaseOutput
if ($releaseExit -ne 0) { throw "DSMM release checker failed" }
$releaseReceiptLines = @($releaseOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_.StartsWith("{") -and $_.EndsWith("}") })
if ($releaseReceiptLines.Count -ne 1) { throw "expected exactly one JSON release receipt line" }
$releaseReceipt = $releaseReceiptLines[0] | ConvertFrom-Json
if ($releaseReceipt.name -ne "dsmm" -or $releaseReceipt.version -ne "1.0.0") { throw "release receipt identity mismatch" }
if ($releaseReceipt.fileCount -le 0 -or $releaseReceipt.packedSize -le 0 -or $releaseReceipt.unpackedSize -le 0 -or $releaseReceipt.requiredSurfaceCount -le 0) {
  throw "release receipt counts/sizes are invalid"
}
if ($releaseReceipt.forbiddenSurfaceCount -ne 0 -or $releaseReceipt.outcome -ne "ready" -or @($releaseReceipt.errors).Count -ne 0) {
  throw "release receipt is not ready"
}
$releasePath = Join-Path $receipt.evidenceDirectory "04-release-checker.txt"
[IO.File]::WriteAllLines($releasePath, [string[]]$releaseOutput, [Text.UTF8Encoding]::new($false))
$receipt.releaseChecker = "ready"
$receipt.releaseCheckerPath = $releasePath
$receipt.releaseCheckerDigest = Get-DsmmFileSha256 -Path $releasePath
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Expected: one `ready` receipt with positive counts/sizes, zero forbidden surfaces/errors, and no tarball.

- [ ] **Step 5: Independently run npm pack dry-run with scripts disabled and inspect the payload**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.releaseChecker -ne "ready") { throw "release checker receipt is missing" }
$tgzBefore = @(fd --type f --extension tgz . ".\dsmm" | Sort-Object)
$packJson = @(npm pack ".\dsmm" --dry-run --json --ignore-scripts)
if ($LASTEXITCODE -ne 0) { throw "independent DSMM npm pack dry-run failed" }
$pack = ($packJson -join "`n") | ConvertFrom-Json
if (@($pack).Count -ne 1 -or $pack[0].name -ne "dsmm" -or $pack[0].version -ne "1.0.0") { throw "unexpected npm pack identity" }
$paths = @($pack[0].files | ForEach-Object { $_.path.Replace('\', '/') })
$required = @(
  "LICENSE", "README.md", "package.json", "cordis.patch.yml",
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts",
  "docs/compatibility.md", "docs/migration-from-ocmm.md", "docs/releasing.md",
  "docs/model-routing.md", "docs/runtime-recovery.md", "docs/settings-status.md", "docs/roadmap.md"
)
foreach ($path in $required) { if ($paths -notcontains $path) { throw "packed DSMM artifact missing $path" } }
$forbidden = @($paths | Where-Object {
  $_ -match '(^|/)(src|test|tests)(/|$)' -or
  $_ -match '(^|/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$' -or
  $_ -match '\.map$' -or
  $_ -match '\.tgz$' -or
  $_ -match '(^|/)docs/implementation-plan-[^/]*\.md$' -or
  $_ -match '(^|/)superpowers(/|$)' -or
  $_ -match '(^|/)(\.npmrc|\.env(?:\..*)?|credentials?[^/]*|secrets?[^/]*|[^/]+\.(pem|key|p12|pfx))$'
})
if ($forbidden.Count -ne 0) { throw "forbidden packed paths: $($forbidden -join ', ')" }
$tgzAfter = @(fd --type f --extension tgz . ".\dsmm" | Sort-Object)
if (($tgzBefore -join "`n") -ne ($tgzAfter -join "`n")) { throw "independent dry-run changed tarball residue" }
$packPath = Join-Path $receipt.evidenceDirectory "05-independent-pack.json"
[IO.File]::WriteAllLines($packPath, [string[]]$packJson, [Text.UTF8Encoding]::new($false))
$receipt.independentPack = "passed-no-residue"
$receipt.independentPackPath = $packPath
$receipt.independentPackDigest = Get-DsmmFileSha256 -Path $packPath
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Expected: one exact `dsmm@1.0.0` dry-run receipt; required public surfaces present; source, tests, maps, plans, tarballs, and credential-like files absent; lifecycle scripts cannot execute.

- [ ] **Step 6: Run the pinned rc.2 Docker proof and verify all 17 markers plus preserved pre-existing state**

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.independentPack -ne "passed-no-residue") { throw "independent pack receipt is missing" }
$runningBefore = @(docker ps --no-trunc --format "{{.ID}}")
if ($LASTEXITCODE -ne 0) { throw "cannot capture pre-existing running containers" }
$imagesBefore = @(docker image ls --no-trunc --format "{{.ID}}" | Sort-Object -Unique)
if ($LASTEXITCODE -ne 0) { throw "cannot capture pre-existing Docker images" }
$dockerOutput = @(pnpm --filter dsmm smoke:docker 2>&1)
$dockerExit = $LASTEXITCODE
$dockerOutput
if ($dockerExit -ne 0) { throw "DSMM pinned @deepseek-ai/dsh@0.1.1-rc.2 Docker smoke failed" }
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
  "DSMM_V1_RELEASE_CHECK_OK",
  "DSMM_V1_PROFILE_INSTALL_OK",
  "DSMM_V1_PROFILE_REMOVE_OK",
  "DSMM_V1_GLOBAL_CONFIG_UNCHANGED",
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
foreach ($id in $runningBefore) { if ($runningAfter -notcontains $id) { throw "pre-existing running container disappeared: $id" } }
foreach ($id in $imagesBefore) { if ($imagesAfter -notcontains $id) { throw "pre-existing Docker image disappeared: $id" } }
$dockerPath = Join-Path $receipt.evidenceDirectory "06-pinned-docker-smoke.txt"
[IO.File]::WriteAllLines($dockerPath, [string[]]$dockerOutput, [Text.UTF8Encoding]::new($false))
$receipt.docker = "passed-17-markers"
$receipt.dockerPath = $dockerPath
$receipt.dockerDigest = Get-DsmmFileSha256 -Path $dockerPath
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Expected: packed-profile add/list/dump/remove/reinstall succeeds, all runtime and isolation markers occur once in order, helper-integrated cleanup removes only run-owned resources, and no pre-existing container/image disappears.

- [ ] **Step 7: Run diff, root typecheck, one prepared root test, and one matching-artifact root build**

At this point no further source/test/checker/Docker edit is allowed without invalidation. Capture the prepared identities, then run each root gate once:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.docker -ne "passed-17-markers") { throw "Docker gate receipt is missing" }
$preparedSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$preparedLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($preparedSourceIdentity -ne $receipt.authoritativeSourceIdentity -or $preparedLibIdentity -ne $receipt.authoritativeLibIdentity) {
  throw "artifact changed before prepared root gates"
}
$diffCheckPath = Join-Path $receipt.evidenceDirectory "07-git-diff-check.txt"
$rootTypecheckPath = Join-Path $receipt.evidenceDirectory "07-root-typecheck.txt"
$rootTestPath = Join-Path $receipt.evidenceDirectory "07-root-test.txt"
$rootBuildPath = Join-Path $receipt.evidenceDirectory "07-root-build.txt"
$diffCheckOutput = @(git diff --check 2>&1)
$diffCheckExit = $LASTEXITCODE
[IO.File]::WriteAllLines($diffCheckPath, [string[]]$diffCheckOutput, [Text.UTF8Encoding]::new($false))
if ($diffCheckExit -ne 0) { $diffCheckOutput; throw "git diff whitespace check failed" }
$rootTypecheckOutput = @(pnpm run typecheck 2>&1)
$rootTypecheckExit = $LASTEXITCODE
$rootTypecheckOutput
[IO.File]::WriteAllLines($rootTypecheckPath, [string[]]$rootTypecheckOutput, [Text.UTF8Encoding]::new($false))
if ($rootTypecheckExit -ne 0) { throw "root typecheck failed" }
$receipt = Read-DsmmTaskReceipt -Task 6
if ([int]$receipt.rootTestInvocationCount -ne 0) { throw "root test was already invoked for this complete revision" }
$receipt.rootTestInvocationCount = 1
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
$rootTestOutput = @(pnpm test 2>&1)
$rootTestExit = $LASTEXITCODE
$rootTestOutput
[IO.File]::WriteAllLines($rootTestPath, [string[]]$rootTestOutput, [Text.UTF8Encoding]::new($false))
if ($rootTestExit -ne 0) { throw "root tests failed; preserve output and do not retry unchanged inputs" }
$receipt = Read-DsmmTaskReceipt -Task 6
if ([int]$receipt.rootBuildInvocationCount -ne 0) { throw "root build was already invoked for this complete revision" }
$receipt.rootBuildInvocationCount = 1
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
$rootBuildOutput = @(pnpm run build 2>&1)
$rootBuildExit = $LASTEXITCODE
$rootBuildOutput
[IO.File]::WriteAllLines($rootBuildPath, [string[]]$rootBuildOutput, [Text.UTF8Encoding]::new($false))
if ($rootBuildExit -ne 0) {
  $rootBuildText = $rootBuildOutput -join "`n"
  $lockedBinary = $rootBuildText -match '(?i)\b(?:EPERM|EBUSY)\b' -and
    $rootBuildText -match '(?i)\b(?:delete|unlink|remove|rename)\b' -and
    $rootBuildText -match '(?i)dist[\\/]+bin[\\/]+ocmm-lsp(?:-[^\\/\s]+)?\.exe'
  if ($lockedBinary) {
    throw "BLOCKED_ROOT_BUILD_LOCK: close the unrelated process holding the staged Windows binary; do not kill it or retry automatically"
  }
  throw "root build failed; preserve output and do not substitute mirror commands"
}
$postBuildSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$postBuildLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($postBuildSourceIdentity -ne $preparedSourceIdentity -or $postBuildLibIdentity -ne $preparedLibIdentity) {
  throw "root gates changed the reviewed DSMM artifact"
}
$receipt = Read-DsmmTaskReceipt -Task 6
$receipt.diffCheck = "passed"
$receipt.diffCheckPath = $diffCheckPath
$receipt.diffCheckDigest = Get-DsmmFileSha256 -Path $diffCheckPath
$receipt.rootTypecheck = "passed"
$receipt.rootTypecheckPath = $rootTypecheckPath
$receipt.rootTypecheckDigest = Get-DsmmFileSha256 -Path $rootTypecheckPath
$receipt.rootTest = "passed-once"
$receipt.rootTestPath = $rootTestPath
$receipt.rootTestDigest = Get-DsmmFileSha256 -Path $rootTestPath
$receipt.rootBuild = "passed-once"
$receipt.rootBuildPath = $rootBuildPath
$receipt.rootBuildDigest = Get-DsmmFileSha256 -Path $rootBuildPath
$receipt.gatesValid = $true
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Expected: diff check, root typecheck, prepared root tests, and workspace root build exit `0` against the same source/lib identities. A qualifying locked-binary failure is `BLOCKED`, not passed; stop for the user and keep all earlier evidence provisional.

- [ ] **Step 8: Capture exact review-input bytes, bind them to identity, and write one immutable packet**

This block captures the actual binary diff bytes, raw HEAD bytes, and a bytewise-sorted untracked manifest whose binary records contain each path, entry type, and file/symlink bytes. The JSON summary contains sanitized path hex plus per-entry byte digests.

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.gatesValid -ne $true -or $receipt.rootBuild -ne "passed-once") { throw "complete current gates are required before review capture" }
if ([IO.Path]::GetFullPath($receipt.evidenceDirectory) -ne [IO.Path]::GetFullPath((Get-DsmmTaskEvidenceDirectory -Task 6))) { throw "Task 6 evidence path mismatch" }
if ((Get-DsmmTreeIdentity -Tree "dsmm/src") -ne $receipt.authoritativeSourceIdentity -or
    (Get-DsmmTreeIdentity -Tree "dsmm/lib") -ne $receipt.authoritativeLibIdentity) { throw "artifact drifted before review capture" }
$artifactIdentity = Get-DsmmCanonicalReviewIdentity
$reviewInputDirectory = Join-Path $receipt.evidenceDirectory "review-input"
if (Test-Path -LiteralPath $reviewInputDirectory) { throw "review-input directory already exists: $reviewInputDirectory" }
New-Item -ItemType Directory -Path $reviewInputDirectory | Out-Null
$headPath = Join-Path $reviewInputDirectory "head.bin"
$diffPath = Join-Path $reviewInputDirectory "tracked-diff.bin"
$manifestPath = Join-Path $reviewInputDirectory "untracked-manifest.bin"
$untrackedSummaryPath = Join-Path $reviewInputDirectory "untracked-summary.json"
$captureScript = @'
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { lstatSync, readFileSync, readlinkSync, writeFileSync } = require("node:fs");
const [headPath, diffPath, manifestPath, summaryPath] = process.argv.slice(1);
const runGit = (...args) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 });
const head = runGit("rev-parse", "HEAD");
const diff = runGit("diff", "--binary", "--no-ext-diff", "HEAD", "--");
writeFileSync(headPath, head);
writeFileSync(diffPath, diff);
const raw = runGit("ls-files", "--others", "--exclude-standard", "-z");
const paths = [];
let start = 0;
for (let index = 0; index < raw.length; index += 1) {
  if (raw[index] !== 0) continue;
  if (index === start) throw new Error("git untracked output contained an empty field");
  paths.push(raw.subarray(start, index));
  start = index + 1;
}
if (start !== raw.length) throw new Error("git untracked output was not NUL terminated");
paths.sort(Buffer.compare);
const nul = Buffer.from([0]);
const chunks = [Buffer.from("ocmm-review-untracked-v1", "ascii"), nul];
const entries = [];
const record = (tag, bytes) => {
  chunks.push(Buffer.from(tag, "ascii"), nul, Buffer.from(String(bytes.length), "ascii"), nul, bytes, nul);
};
for (const pathBytes of paths) {
  const path = pathBytes.toString("utf8");
  if (!Buffer.from(path, "utf8").equals(pathBytes)) throw new Error("untracked path was not valid UTF-8");
  const stat = lstatSync(path);
  let type;
  let bytes;
  if (stat.isFile()) {
    type = "file";
    bytes = readFileSync(path);
  } else if (stat.isSymbolicLink()) {
    type = "symlink";
    bytes = readlinkSync(path, { encoding: "buffer" });
  } else {
    throw new Error(`unsupported untracked entry type: ${path}`);
  }
  record("path", pathBytes);
  record("type", Buffer.from(type, "ascii"));
  record("bytes", bytes);
  entries.push({
    pathHex: pathBytes.toString("hex"),
    type,
    byteLength: bytes.length,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  });
}
writeFileSync(manifestPath, Buffer.concat(chunks));
writeFileSync(summaryPath, `${JSON.stringify({ schema: 1, sort: "Buffer.compare(pathBytes)", entryCount: entries.length, entries }, null, 2)}\n`);
'@
node -e $captureScript $headPath $diffPath $manifestPath $untrackedSummaryPath
if ($LASTEXITCODE -ne 0) { throw "exact review-input byte capture failed" }
$capturedHead = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($headPath)).Trim()
if ($capturedHead -ne $DsmmBaselineHead) { throw "captured HEAD bytes do not match baseline" }
$identityAfterCapture = Get-DsmmCanonicalReviewIdentity
if ($identityAfterCapture -ne $artifactIdentity) { throw "artifact changed during review-input capture" }
$untrackedSummary = [IO.File]::ReadAllText($untrackedSummaryPath) | ConvertFrom-Json
$reviewInputReceiptPath = Join-Path $reviewInputDirectory "review-input-receipt.json"
$reviewInputReceipt = [ordered]@{
  schema = 1
  artifactIdentity = $artifactIdentity
  head = [ordered]@{ path = $headPath; size = (Get-Item -LiteralPath $headPath).Length; digest = Get-DsmmFileSha256 -Path $headPath }
  trackedDiff = [ordered]@{ command = "git diff --binary --no-ext-diff HEAD --"; path = $diffPath; size = (Get-Item -LiteralPath $diffPath).Length; digest = Get-DsmmFileSha256 -Path $diffPath }
  untrackedManifest = [ordered]@{ command = "git ls-files --others --exclude-standard -z; bytewise Buffer.compare"; path = $manifestPath; size = (Get-Item -LiteralPath $manifestPath).Length; digest = Get-DsmmFileSha256 -Path $manifestPath; entryCount = $untrackedSummary.entryCount }
  untrackedSummary = [ordered]@{ path = $untrackedSummaryPath; size = (Get-Item -LiteralPath $untrackedSummaryPath).Length; digest = Get-DsmmFileSha256 -Path $untrackedSummaryPath }
}
[IO.File]::WriteAllText($reviewInputReceiptPath, ($reviewInputReceipt | ConvertTo-Json -Depth 10) + "`n", [Text.UTF8Encoding]::new($false))
$reviewInputReceiptDigest = Get-DsmmFileSha256 -Path $reviewInputReceiptPath
$receipt.artifactIdentity = $artifactIdentity
$gateSnapshotPath = Join-Path $reviewInputDirectory "gate-receipt.json"
[IO.File]::WriteAllText($gateSnapshotPath, ($receipt | ConvertTo-Json -Depth 20) + "`n", [Text.UTF8Encoding]::new($false))
$gateSnapshotDigest = Get-DsmmFileSha256 -Path $gateSnapshotPath
$globalStart = $planText.IndexOf("**Global Constraints:**", [StringComparison]::Ordinal)
$globalEnd = $planText.IndexOf("`n---", $globalStart, [StringComparison]::Ordinal)
if ($globalStart -lt 0 -or $globalEnd -lt 0) { throw "cannot extract verbatim Global Constraints" }
$globalConstraints = $planText.Substring($globalStart, $globalEnd - $globalStart).TrimEnd()
$packetPath = Join-Path $reviewInputDirectory "review-packet.txt"
$packetLines = @(
  "ARTIFACT_KIND: working-tree",
  "ARTIFACT_IDENTITY: $artifactIdentity",
  "DESCRIPTION: DSMM v1 review remediation: explicit release-test narrowing, exception-safe model-routing warnings, exact reserved dsmm-status normalization, exact release scripts policy, Docker primary/cleanup error preservation, and matching release-readiness evidence",
  "PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md and docs/superpowers/specs/2026-08-26-dsmm-v1-review-remediation-design.md",
  "BASELINE: HEAD cedd30b1abd03cf00b9ce330fa3b1805d76cb401; reviewed pre-remediation identity sha256:1e8ba331a1de558675112fd2c41cd4b5e1a1efe022f511ae33e232ea25b6f6fd; preserve the full reviewed v0.6-v1.0 dirty tree",
  "REVIEW_INPUT: receipt=$reviewInputReceiptPath; receipt_digest=$reviewInputReceiptDigest; tracked_diff_bytes=$diffPath; tracked_diff_digest=$($reviewInputReceipt.trackedDiff.digest); untracked_manifest_bytes=$manifestPath; untracked_manifest_digest=$($reviewInputReceipt.untrackedManifest.digest); untracked_summary=$untrackedSummaryPath; untracked_summary_digest=$($reviewInputReceipt.untrackedSummary.digest); untracked_entry_count=$($reviewInputReceipt.untrackedManifest.entryCount)",
  "VERIFICATION_EVIDENCE: immutable_gate_receipt=$gateSnapshotPath; immutable_gate_receipt_digest=$gateSnapshotDigest; evidence_directory=$($receipt.evidenceDirectory); gate snapshot and review-input receipt are stamped with ARTIFACT_IDENTITY and all review-input bytes were revalidated after capture",
  "INVALIDATION_RULE: any later product correction invalidates gates, packet, identity, and reviews; a dsmm/src correction also invalidates lib and requires named stale RED plus one build for the new source identity",
  "REQUIRED_VERDICT: unconditional approved or concrete blocking findings",
  "GLOBAL_CONSTRAINTS: verbatim authoritative plan section follows",
  $globalConstraints
)
[IO.File]::WriteAllLines($packetPath, [string[]]$packetLines, [Text.UTF8Encoding]::new($false))
$packetDigest = Get-DsmmFileSha256 -Path $packetPath
$receipt.reviewInputReceiptPath = $reviewInputReceiptPath
$receipt.reviewInputReceiptDigest = $reviewInputReceiptDigest
$receipt.gateSnapshotPath = $gateSnapshotPath
$receipt.gateSnapshotDigest = $gateSnapshotDigest
$receipt.packetPath = $packetPath
$receipt.packetDigest = $packetDigest
$receipt.reviewInputReady = $true
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
"packet=$packetPath"
"packet-digest=$packetDigest"
"artifact=$artifactIdentity"
```

Expected: the receipt points to actual binary bytes, not a prose description; every path is under the verified Task 6 OS-temp evidence directory; every artifact has size/digest; canonical identity is unchanged across capture.

- [ ] **Step 9: Send the same complete packet to exact `oracle-high` and `reviewer-high`, recomputing after each lane**

Verify both exact profiles are callable; otherwise stop. Read the exact `review-packet.txt` bytes from the Task 6 receipt and send that identical content and its recorded digest to both lanes. Do not regenerate, summarize, reorder, or specialize the packet per lane. Dispatch may be parallel, but after each result the parent runs this entire fresh-process block independently:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.reviewInputReady -ne $true) { throw "review-input receipt is incomplete" }
if ((Get-DsmmFileSha256 -Path $receipt.packetPath) -ne $receipt.packetDigest) { throw "review packet bytes changed" }
if ((Get-DsmmFileSha256 -Path $receipt.reviewInputReceiptPath) -ne $receipt.reviewInputReceiptDigest) { throw "review-input receipt bytes changed" }
if ((Get-DsmmFileSha256 -Path $receipt.gateSnapshotPath) -ne $receipt.gateSnapshotDigest) { throw "gate snapshot bytes changed" }
$reviewInput = [IO.File]::ReadAllText($receipt.reviewInputReceiptPath) | ConvertFrom-Json
foreach ($entry in @($reviewInput.head, $reviewInput.trackedDiff, $reviewInput.untrackedManifest, $reviewInput.untrackedSummary)) {
  if ((Get-DsmmFileSha256 -Path $entry.path) -ne $entry.digest) { throw "review-input artifact digest mismatch: $($entry.path)" }
}
$parentIdentity = Get-DsmmCanonicalReviewIdentity
if ($parentIdentity -ne $receipt.artifactIdentity) { throw "parent identity drifted after review lane: $parentIdentity" }
"artifact=$parentIdentity"
"packet=$($receipt.packetPath)"
"packet-digest=$($receipt.packetDigest)"
```

Run it once immediately after `oracle-high` returns and once immediately after `reviewer-high` returns. Reject timeout, partial output, conditional approval, a packet-digest mismatch, or any result lacking exactly these five fields in order:

```text
role/profile lane: oracle-high or reviewer-high
task_id or session receipt: durable task/session/result reference
artifact identity: the exact Task 6 receipt identity
verdict: approved
report artifact/source: task result or durable review report source
```

The two accepted task results, not shell variables, are the durable review receipts.

- [ ] **Step 10: Apply executable invalidation and correction routing if a gate or reviewer finds a defect**

Before any correction, run this fresh-process invalidation block. It records the current artifact, deletes only the exact review-input child, and invalidates review/gate fields without touching generated lib:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
$receipt.preCorrectionArtifactIdentity = Get-DsmmCanonicalReviewIdentity
$reviewInputDirectory = Join-Path $receipt.evidenceDirectory "review-input"
$expectedReviewInputDirectory = [IO.Path]::GetFullPath((Join-Path (Get-DsmmTaskEvidenceDirectory -Task 6) "review-input"))
if ([IO.Path]::GetFullPath($reviewInputDirectory) -ne $expectedReviewInputDirectory) { throw "review-input cleanup path mismatch" }
if (Test-Path -LiteralPath $reviewInputDirectory -PathType Container) { Remove-Item -LiteralPath $reviewInputDirectory -Recurse -Force }
if (Test-Path -LiteralPath $reviewInputDirectory) { throw "review-input cleanup failed" }
foreach ($key in @(
  "artifactIdentity", "reviewInputReceiptPath", "reviewInputReceiptDigest", "gateSnapshotPath", "gateSnapshotDigest", "packetPath", "packetDigest",
  "dsmmNoEmit", "dsmmAllTests", "releaseChecker", "independentPack", "docker", "diffCheck", "rootTypecheck", "rootTest", "rootBuild"
)) {
  $receipt.Remove($key)
}
$receipt.reviewInputReady = $false
$receipt.gatesValid = $false
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Return the concrete finding to Task 1-5 ownership and add the failing assertion to the existing named regression for that remediation before the smallest correction.

- **Source correction:** preserve `authoritativeLibIdentity` byte-for-byte while Task 2 or 3 runs its mirror RED/GREEN. Then run the following fresh-process re-arm block; the correction stays inside the existing two named source regressions:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
$currentArtifactIdentity = Get-DsmmCanonicalReviewIdentity
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentArtifactIdentity -eq $receipt.preCorrectionArtifactIdentity) { throw "source correction did not change the artifact" }
if ($currentSourceIdentity -eq $receipt.authoritativeSourceIdentity) { throw "source correction did not change dsmm/src" }
if ($currentLibIdentity -ne $receipt.authoritativeLibIdentity) { throw "source correction changed authoritative lib before re-generation" }
$staleTests = @(".\dsmm\test\model-routing.test.ts", ".\dsmm\test\settings.test.ts", ".\dsmm\test\commands.test.ts")
$candidateStaleAssertions = @(
  "model routing contains throwing warning loggers and preserves downstream identity",
  "reserved dsmm-status mode names normalize for base, attached, and dual registration"
)
$staleOutput = @(node --test --experimental-strip-types $staleTests 2>&1)
$staleExit = $LASTEXITCODE
$staleOutput
if ($staleExit -eq 0) { throw "corrected source passed against stale generated lib" }
$staleAssertions = @($candidateStaleAssertions | Where-Object {
  ($staleOutput -join "`n") -match ('(?m)^\s*not ok \d+ - ' + [regex]::Escape($_) + '\s*$')
})
if ($staleAssertions.Count -eq 0) { throw "source-correction stale RED did not fail an approved named source regression" }
$staleOutputPath = Join-Path $receipt.evidenceDirectory "01-correction-stale-generated-red.txt"
[IO.File]::WriteAllLines($staleOutputPath, [string[]]$staleOutput, [Text.UTF8Encoding]::new($false))
$receipt.sourceIdentityBefore = $currentSourceIdentity
$receipt.libIdentityBefore = $currentLibIdentity
$receipt.staleTests = $staleTests
$receipt.staleAssertions = $staleAssertions
$receipt.staleOutputPath = $staleOutputPath
$receipt.staleOutputDigest = Get-DsmmFileSha256 -Path $staleOutputPath
$receipt.staleRedPassed = $true
$receipt.buildInvocationCount = 0
$receipt.rootTestInvocationCount = 0
$receipt.rootBuildInvocationCount = 0
$receipt.generationReady = $false
$receipt.gatesValid = $false
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Resume Step 2. Its fresh-process checks authorize exactly one build for the changed current source identity.

- **Test/checker/Docker-only correction:** after Task 1, 4, or 5 GREEN, run this fresh-process re-arm block:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
$currentArtifactIdentity = Get-DsmmCanonicalReviewIdentity
if ($currentArtifactIdentity -eq $receipt.preCorrectionArtifactIdentity) { throw "non-source correction did not change the artifact" }
if ((Get-DsmmTreeIdentity -Tree "dsmm/src") -ne $receipt.authoritativeSourceIdentity -or
    (Get-DsmmTreeIdentity -Tree "dsmm/lib") -ne $receipt.authoritativeLibIdentity) { throw "non-source correction changed source/lib" }
$receipt.rootTestInvocationCount = 0
$receipt.rootBuildInvocationCount = 0
$receipt.gatesValid = $false
Write-DsmmTaskReceipt -Task 6 -Receipt $receipt
```

Keep `buildInvocationCount = 1` and `generationReady = true`; resume Step 3 without rebuilding.

Both branches rerun affected and downstream gates, create new review-input bytes/packet, and obtain two new receipts. Evidence-only omissions that change no workspace file rerun only the missing evidence and Steps 8-9.

- [ ] **Step 11: Final identity, preservation, and no-residue receipt**

After the parent has two complete approved five-field task results for the common identity, run this fresh-process cleanup block:

```powershell
$planPath = (Resolve-Path -LiteralPath "docs/superpowers/plans/2026-08-26-dsmm-v1-review-remediation.md").Path
$planText = [IO.File]::ReadAllText($planPath)
$bootstrapMarker = '<!-- dsmm-remediation-' + 'powershell-bootstrap -->'
$markerIndex = $planText.IndexOf($bootstrapMarker, [StringComparison]::Ordinal)
if ($markerIndex -lt 0 -or $planText.IndexOf($bootstrapMarker, $markerIndex + $bootstrapMarker.Length, [StringComparison]::Ordinal) -ge 0) { throw "remediation bootstrap marker is missing or duplicated" }
$following = $planText.Substring($markerIndex + $bootstrapMarker.Length)
$bootstrapMatch = [regex]::Match($following, '\A\r?\n```powershell\r?\n(?<body>[\s\S]*?)\r?\n```(?:\r?\n|$)')
if (-not $bootstrapMatch.Success) { throw "remediation bootstrap fence is missing or not adjacent" }
. ([scriptblock]::Create($bootstrapMatch.Groups['body'].Value))
$receipt = Read-DsmmTaskReceipt -Task 6
if ($receipt.gatesValid -ne $true -or $receipt.reviewInputReady -ne $true) { throw "final gate/review-input receipt is incomplete" }
$finalIdentity = Get-DsmmCanonicalReviewIdentity
if ($finalIdentity -ne $receipt.artifactIdentity) { throw "final identity does not match Task 6 receipt" }
if ((Get-DsmmFileSha256 -Path $receipt.packetPath) -ne $receipt.packetDigest) { throw "final packet digest mismatch" }
Assert-DsmmBaselineHead
$tarballResidue = @(fd --type f --extension tgz . ".\dsmm")
if ($LASTEXITCODE -ne 0 -or $tarballResidue.Count -ne 0) { throw "DSMM tarball residue remains" }
foreach ($task in 1..5) {
  if (Test-Path -LiteralPath (Get-DsmmTaskReceiptPath -Task $task)) { throw "completed task receipt remains: $task" }
}
git status --short
if ($LASTEXITCODE -ne 0) { throw "cannot capture final dirty tree" }
git diff --stat
git diff --check
if ($LASTEXITCODE -ne 0) { throw "final diff check failed" }
"artifact=$finalIdentity"
"source=$(Get-DsmmTreeIdentity -Tree 'dsmm/src')"
"lib=$(Get-DsmmTreeIdentity -Tree 'dsmm/lib')"
"packet-digest=$($receipt.packetDigest)"
Remove-DsmmTaskEvidenceDirectory -Task 6
Remove-DsmmTaskReceipt -Task 6
```

Expected: HEAD unchanged; both external review receipts already bind the printed identity; all reviewed dirty-tree work plus intended remediation and generated output remains unstaged; no tarball, install, publication, process termination, Docker/temp receipt/evidence residue, or Git write occurred.

**Review boundary:** this task generates and verifies only; it does not publish, declare a release, alter Git state, terminate processes, or install dependencies.

---

## Self-review

**Spec coverage:** Passed. Tasks 1-5 map one-to-one to all five confirmed remediations; Task 6 covers OS-temp/stale-lib discipline, one authoritative build per source identity, every specified DSMM/package/Docker/root gate, locked-binary blocking behavior, canonical identity, and exact `oracle-high` plus `reviewer-high` approvals.

**Placeholder scan:** Passed. Every file, function signature, error string, regression case, RED cause, GREEN command, invalidation branch, OS-temp artifact path formula, review-input byte artifact, packet field, and expected result is concrete. The full-plan red-flag search returned zero deferred markers, shorthand-by-reference steps, and unnamed review-input descriptions.

**Type and interface consistency:** Passed. `DSMM_STATUS_COMMAND` has one source binding and remains re-exported from `commands.ts`; `warnUnavailable(...)` keeps its existing signature; `throwAfterCleanup(primaryError, cleanupErrors, message)` has one four-case contract used at exactly two call sites; the Task 1-6 receipt schema, source/lib identity fields, invocation counts, gate fields, artifact digests, and stale-test names match every consumer.

**PowerShell syntax and safety:** Passed. Static `System.Management.Automation.Language.Parser` review found 25 PowerShell fences and zero parse errors; all 24 fences after the marked bootstrap contain the deterministic fresh-process loader. Commands use PowerShell arrays, `$LASTEXITCODE`, `Join-Path`, explicit path quoting, backtick continuation, and exact workspace-keyed OS-temp cleanup. There is no Bash environment assignment, `/dev/null`, shell wildcard dependence, `$home` custom variable, recursive deletion outside a verified OS-temp child, or process-kill command. The only `&&` text is inside the two exact quoted `package.json` script values being validated; it is not issued as a PowerShell command.

**Generated-output and identity consistency:** Passed. Tasks 1-5 capture pre-edit source/lib identities in task-local OS-temp receipts; Tasks 2-3 compile only mirrors and Tasks 1, 4, and 5 preserve source/lib as specified. Task 6 proves current stale output, records `buildInvocationCount = 1` before the sole build invocation, rejects a second invocation, distinguishes source from non-source corrections, and binds gates after generation without process-local state. It captures actual binary `git diff --binary --no-ext-diff HEAD --` bytes plus a bytewise-sorted typed untracked byte manifest, stamps their paths/digests and the immutable gate snapshot with canonical identity, sends one packet unchanged to both lanes, and independently recomputes parent identity after each result and at final acceptance.

**Scope and authorization:** Passed. The six tasks contain no broad refactor, behavior weakening, installation, publication, stage/commit/stash/reset/checkout/push/tag operation, release declaration, or process termination. Commit steps are intentionally absent.

**Plan-review receipt:** Waiting for orchestrator-owned plan-critic receipt; this planner performed the required self-review and did not dispatch a critic, reviewer, Oracle, implementation worker, test, build, or Docker command.
