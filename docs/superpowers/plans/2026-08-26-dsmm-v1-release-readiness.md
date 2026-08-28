# DSMM v1.0 Release Readiness Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a public, locally proven `dsmm@1.0.0` artifact with exact compatibility, migration, release/rollback, fresh-profile isolation, and same-identity review evidence without publishing or performing any Git write.

**Architecture:** Write the three user-facing contracts before the package checker so the checker can require the complete stable payload without temporary documentation or placeholders. Then make the package public, validate `npm pack --dry-run --json` through one deterministic fail-closed checker, extend the existing packed Docker smoke without replacing any v0.6-v0.8 proof, and finish with one authoritative generated-lib/full-gate cycle plus Oracle and primary Reviewer receipts bound to one canonical working-tree identity.

**Tech Stack:** Node.js 22 ESM, TypeScript 6, `node:test` with `--experimental-strip-types`, npm pack JSON, pnpm workspace commands, PowerShell 7, Docker, Cordis `^4.0.1`, and DeepSeek Harness `@deepseek-ai/dsh@0.1.1-rc.2`.

**Spec:** `docs/superpowers/specs/2026-08-26-dsmm-v1-release-readiness-design.md`

**Global Constraints:**
- Baseline: `cedd30b1abd03cf00b9ce330fa3b1805d76cb401` plus the reviewed, uncommitted v0.6 model-routing, v0.7 runtime-recovery, and v0.8 settings/status working tree.
- This implementation produces a release-ready artifact but does not publish it.
- Commit, tag, push, npm publication, GitHub Release creation, and registry mutation remain separate actions requiring explicit authorization.
- The compatibility authority is `@deepseek-ai/dsh@0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.
- The fixed headless bundle submits its argument as a user message; it does not interpret `/deepwork` or `/dsmm-status` as host commands.
- A DSH bundle package must preserve `name: "dsmm"`, `type: "module"`, and `dsh.bundle.patch: "./cordis.patch.yml"`; the referenced patch must be shipped.
- The stable npm payload excludes `src`, tests, implementation plans, source/declaration maps, tarballs, credential-like files, and repository-only Superpowers artifacts.
- `dsmm/LICENSE` is an exact byte copy of the complete repository root `LICENSE` and package metadata identifies it as `LicenseRef-AAAPL`.
- The checker is read-only: it may run `npm pack --dry-run --json`, but it creates no tarball, publishes nothing, contacts no model provider, and modifies no Git state.
- Windows and macOS receive source/package evidence only unless separately proven; the Linux container owns the full packed-runtime evidence.
- Runtime recovery and LSP/MCP remain optional and disabled by default; DeepSeek V4 Pro calibration remains limited to the exact official route.
- The Docker smoke may remove only its unique run-owned home, workspace, container, and image; it must preserve pre-existing Docker state and the user's real `DSH_HOME`.
- No root release workflow lane, release-completion checker change, schema change, OpenCode runtime change, provider/model behavior change, DSH upgrade, dependency installation, paid provider call, frontend work, or package-name reservation claim is in scope.
- Do not overwrite, stash, reset, stage, or independently refactor the reviewed v0.6-v0.8 working tree.
- Tasks 1-5 must not generate working-tree `dsmm/lib/**`; Task 6 is the only authoritative working-tree generation point for each complete source revision.
- Any validated source/test/docs/package/smoke correction after authoritative generation invalidates generated-lib evidence, DSMM/pack/Docker/root gates, the identity packet, and both review receipts.
- Root `pnpm test` runs exactly once for each complete source revision reaching final review; an unchanged retry requires separate explicit user authorization for that exact recorded failure.
- All commands are PowerShell-safe; do not use Bash environment assignment, `export`, `&&`, `/dev/null`, or shell wildcard assumptions.

---

## Requirement and evidence map

| Approved requirement | Implementation task | Primary evidence |
|---|---|---|
| Explicit Node/DSH/peer/platform/host/LSP/recovery/calibration compatibility levels | Task 1 | exact compatibility table assertions in `dsmm/test/release-readiness.test.ts` |
| Truthful ocmm migration boundary, four-state feature table, and eight-step migration | Task 2 | exact feature classifications and ordered migration assertions |
| Release preflight, separately authorized publication, post-publication proof, rollback, and README guidance | Task 3 | four-section documentation contract and README link/headless assertions |
| Public `dsmm@1.0.0` metadata, full license, constrained payload, and deterministic release checker | Task 4 | package tests, checker success receipt, deliberate failure fixtures, and dry-run inventory |
| Fresh-profile add/list/dump/remove/reinstall plus global/sibling isolation | Task 5 | static smoke contract; Task 6's real ordered Docker receipt |
| Preserve all existing markers and add the four v1 markers in exact order | Task 5 | exact 17-marker source order/count test |
| Roadmap uses only the approved release-ready/publication-pending sentence | Task 6 | failing-first roadmap assertion and final package/docs tests |
| Initial generated-lib baseline and per-source-revision invalidation | Pre-task protocol and Task 6 | byte-sensitive source/lib identities, cycle-specific stale-output branch, one authoritative build |
| Authoritative DSMM/checker/pack/Docker/root gates | Task 6 | exact PowerShell commands and expected exit/receipt assertions |
| Oracle and primary Reviewer unconditionally approve the same current identity | Task 6 | two five-field receipts plus recomputation after each lane |
| No publication, root release lane, dependency install, or Git write | Global constraints, Tasks 3-6 | scope searches, final status/diff receipt, and review packet constraints |

## File map

### New focused files

- Create `dsmm/docs/compatibility.md` — pinned support/evidence matrix and host/headless boundaries.
- Create `dsmm/docs/migration-from-ocmm.md` — non-parity boundary, four-state feature table, and ordered migration path.
- Create `dsmm/docs/releasing.md` — preflight, authorization, post-publication, and rollback operator contract.
- Create `dsmm/LICENSE` — byte-identical copy of the repository root license.
- Create `dsmm/scripts/check-release-readiness.mjs` — deterministic npm dry-run inventory validator and JSON receipt emitter.
- Create `dsmm/test/release-readiness.test.ts` — compatibility, migration, release, license, checker, payload, and roadmap contracts.

### Existing package, docs, and runtime proof

- Modify `dsmm/README.md` — stable release-readiness links, local tarball flow, published-package boundary, and correct host/headless activation guidance.
- Modify `dsmm/package.json` — public 1.0 metadata, exact files patterns, npm publish metadata, and `check:release`.
- Modify `dsmm/test/package.test.ts` — public metadata, license, files patterns, exports/patch preservation, and complete README-link inventory.
- Modify `dsmm/scripts/docker-smoke.mjs` — v1 profile lifecycle, release checker call, sentinels, reinstall proof, and four markers.
- Modify `dsmm/test/docker-smoke-assets.test.ts` — exact lifecycle/static contracts and 17-marker order/count.
- Modify `dsmm/docs/roadmap.md` only in Task 6 — one exact v1.0 release-ready sentence.

### Generated and verify-only surfaces

- Regenerate only in Task 6: `dsmm/lib/**`; expected implementation scope does not change `dsmm/src/**`, so an unchanged-source authoritative build must reproduce the captured initial lib identity byte-for-byte.
- Verify only: root `LICENSE`, root package/build/test surfaces, `.github/workflows/release.yml`, release-completion scripts, schema/runtime/provider files, and all reviewed v0.6-v0.8 source/test/docs/generated work outside the exact ownership above.

## Dependency order and ownership

1. Tasks 1-3 create complete stable documentation first. This is intentionally earlier than the package task because Task 4's checker must require real final documents and cannot green against placeholders or missing future surfaces.
2. Task 4 owns all package/license/checker changes and consumes the final paths from Tasks 1-3.
3. Task 5 consumes the public package/checker and extends only the existing packed smoke lifecycle; it does not run the final Docker proof.
4. Task 6 adds the gated roadmap sentence, performs the only working-tree build, runs every authoritative gate including the real Docker proof once for the complete revision, and owns final review.
5. Shared `dsmm/test/release-readiness.test.ts` grows sequentially: Task 1 creates compatibility coverage, Task 2 adds migration coverage, Task 3 adds release/README coverage, Task 4 adds package/checker fixtures, and Task 6 adds the roadmap assertion. A worker must preserve all earlier assertions.
6. Suggested commit boundaries are review boundaries only. No task runs `git add`, `git commit`, `git push`, `git tag`, registry publication, or any other Git/registry write.

## Pre-task preservation receipt and invalidation protocol

Before Task 1, the orchestrator runs this read-only PowerShell receipt from the repository root and retains the literal source/lib identities in task state. Each Task 1-5 handoff receives the exact baseline HEAD, both identity values, the current task text, Global Constraints, and consumed interfaces.

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD: $head" }
git status --short

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

$dsmmSourceBaselineIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$dsmmLibBaselineIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
$expectedSourceIdentity = $dsmmSourceBaselineIdentity
$expectedLibIdentity = $dsmmLibBaselineIdentity
"source=$dsmmSourceBaselineIdentity"
"lib=$dsmmLibBaselineIdentity"
```

After every Task 1-5 GREEN, reassert both identities:

```powershell
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $expectedSourceIdentity) { throw "dsmm/src changed outside the approved v1 scope: $currentSourceIdentity" }
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed before Task 6: $currentLibIdentity" }
```

Initial Tasks 1-5 are docs/package/test/smoke-only, so neither identity may change. If a later validated correction changes compiled `dsmm/src/**`, freeze the then-current generated identity as `$correctionStaleLibIdentity`, set `$expectedLibIdentity` to it, record `$correctionChangesGeneratedSource = $true`, and require the owning task to return exact `$correctionStaleTests` and one `$correctionExpectedStaleAssertion`. The owning task performs RED and GREEN in an OS-temp mirror whose `lib` is built from the task's source revision; it must not rebuild or use the stale working-tree `dsmm/lib` for its GREEN. The working-tree stale lib remains byte-identical until Task 6 Step 3 runs those exact tests and confirms the named stale assertion, Step 4 generates once, and Step 5 proves the working tree GREEN. If a correction changes only tests/docs/package/smoke, set `$correctionChangesGeneratedSource = $false`, preserve the exact failing-first/GREEN evidence, and do not manufacture a stale-generated-output failure. Every correction invalidates all downstream gates, packet, and receipts and restarts Task 6 for a new complete revision; never restore older generated bytes.

For every RED, accept only the named missing file, old value, missing marker, or deliberate checker invariant as the expected failure. Compiler, dependency, environment, Docker, or unrelated reviewed v0.6-v0.8 failures are blockers rather than acceptable RED evidence.

---

### Task 1: Pinned compatibility contract

**Files:**
- Create: `dsmm/docs/compatibility.md`
- Create: `dsmm/test/release-readiness.test.ts`

**Interfaces:**
- Consumes: `dsmm/package.json` engine/peer ranges, the pinned DSH rc.2 contract in the approved spec, and existing `docs/settings-status.md`, `docs/lsp.md`, `docs/runtime-recovery.md`, and `docs/model-routing.md` boundaries.
- Produces: one `Compatibility matrix` table with columns `Surface`, `Version / mode`, `Level`, and `Boundary`; levels are exactly `verified`, `supported by contract`, `optional`, or `unavailable`.
- Integration boundary: documentation and contract tests only; no manifest, source, generated lib, runtime, Docker, or root release change.

- [ ] **Step 1: Write the failing compatibility contract test**

Create `release-readiness.test.ts` with `node:test`, `node:assert/strict`, `readFileSync`, and package-root resolution matching existing tests. Add a table parser that finds the first Markdown table after `## Compatibility matrix`, trims backticks/whitespace only for comparison, and returns body rows. Assert these exact row identities and levels:

```ts
const expectedCompatibility = [
  ["Node.js", ">=22", "verified"],
  ["DSH", "0.1.1-rc.2", "verified"],
  ["Cordis", "^4.0.1", "supported by contract"],
  ["DSH component peers", "^0.1.1-rc.2", "supported by contract"],
  ["Linux container", "Node 22 Bookworm", "verified"],
  ["Windows", "Node >=22", "supported by contract"],
  ["macOS", "Node >=22", "supported by contract"],
  ["Web", "host command/status", "supported by contract"],
  ["Headless", "file config and --dump-config", "verified"],
  ["TUI", "DSH 0.1.1-rc.2", "unavailable"],
  ["LSP/MCP", "external ocmm-lsp mcp", "optional"],
  ["Runtime recovery", "process-local", "optional"],
  ["DeepSeek V4 Pro calibration", "deepseek-official/deepseek-v4-pro", "optional"]
];
```

Also assert the document names all five peer packages, commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`, the exact sentence `Only DSH 0.1.1-rc.2 is verified; peer ranges are installation contracts, not compatibility claims for later DSH releases.`, and the headless/provider boundary. Require that `/deepwork` and `/dsmm-status` are described as host-adapter commands, never as headless task-text commands.

- [ ] **Step 2: Run the compatibility RED**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
```

Expected: FAIL only because `dsmm/docs/compatibility.md` does not exist. An unrelated syntax, import, or existing package failure blocks the task.

- [ ] **Step 3: Write the complete compatibility document**

Use these sections in order:

```md
# DSMM v1.0 Compatibility
## Compatibility authority
## Compatibility matrix
## Command and runtime boundaries
## Evidence limits
```

The table uses exactly the 13 rows above. The DSH component row names `@deepseek-ai/dsh-attachment`, `@deepseek-ai/dsh-brand`, `@deepseek-ai/dsh-invariants`, `@deepseek-ai/dsh-llm`, and `@deepseek-ai/dsh-timeout`. State that Linux owns full packed-runtime proof; Windows/macOS have source/package tests only; Web has the existing host command/status surface but no custom panel; headless uses `$DSH_HOME/settings.yaml` or profile files plus `--dump-config`, needs a separately configured provider for a real task, and uses `dsmm.defaultActive: true`; TUI has no official rc.2 bundle and can only consume the pure status API through a future adapter. Keep LSP/recovery disabled-by-default language and exact-route-only calibration explicit.

- [ ] **Step 4: Run GREEN and prove source/lib preservation**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "compatibility contract failed" }
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $expectedSourceIdentity) { throw "dsmm/src changed in Task 1" }
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed in Task 1" }
```

Expected: the compatibility suite passes; all 13 rows and four evidence levels are exact; source and generated identities remain unchanged.

**Suggested commit boundary (do not execute):** `docs(dsmm): define v1 compatibility contract`

---

### Task 2: Truthful migration from ocmm

**Files:**
- Create: `dsmm/docs/migration-from-ocmm.md`
- Modify: `dsmm/test/release-readiness.test.ts`

**Interfaces:**
- Consumes: Task 1 terminology; the existing seven skills, eight DSMM role presets, v0.6 routing, v0.7 recovery, v0.8 status/settings, and the approved non-parity boundary.
- Produces: one `Feature mapping` table with states exactly `equivalent core intent`, `redesigned for DSH`, `optional/manual`, and `unavailable`; one eight-step `Migration sequence`.
- Integration boundary: the guide maps current behavior only. It adds no compatibility shim, OpenCode hook, Oracle preset, Codex marketplace, provider configuration, or publication claim.

- [ ] **Step 1: Add the failing migration table and sequence tests**

Extend `release-readiness.test.ts` to assert this exact area/state mapping:

```ts
const expectedMigrationStates = new Map([
  ["Deepwork gates", "equivalent core intent"],
  ["Seven workflow skills", "equivalent core intent"],
  ["Eight role presets", "redesigned for DSH"],
  ["Model routing and DeepSeek calibration", "redesigned for DSH"],
  ["Safety guards", "redesigned for DSH"],
  ["LSP/MCP", "optional/manual"],
  ["Runtime fallback", "redesigned for DSH"],
  ["Idle continuation", "redesigned for DSH"],
  ["Subagent interruption recovery", "unavailable"],
  ["Settings/status", "redesigned for DSH"],
  ["Prompt/cache hooks", "unavailable"],
  ["OpenCode commands/hooks", "unavailable"],
  ["Model categories and Oracle tiers", "optional/manual"],
  ["Codex marketplace", "unavailable"],
  ["Release surfaces", "redesigned for DSH"]
]);
```

Parse the ordered list after `## Migration sequence` and require eight items containing, in order: isolated `DSH_HOME`/profile; pinned headless plus `dsmm@1.0.0` or reviewed tarball; provider/model through DSH; `defaultActive: true` or host `/deepwork`; optional preset materialization plus discovery root; optional LSP MCP patch; `/dsmm-status json` or `--dump-config`; retain ocmm until unavailable requirements have replacements. Assert the opening says `.opencode/ocmm.jsonc` cannot be copied and that the reviewed working tree is not already published.

- [ ] **Step 2: Run the migration RED**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
```

Expected: compatibility remains GREEN; the new migration test fails only because `dsmm/docs/migration-from-ocmm.md` is absent.

- [ ] **Step 3: Write the complete migration guide**

Use these sections in order:

```md
# Migrating from ocmm to DSMM v1.0
## Hard boundary
## Feature mapping
## Migration sequence
## Coexistence and cutover
```

Open with: `DSMM is a DSH-native Cordis bundle, not an OpenCode compatibility layer; .opencode/ocmm.jsonc cannot be copied into DSH.` Include all 15 exact table rows and explain each state without claiming feature parity. Name all seven skills and all eight presets. Explain that Oracle/model-category behavior must be configured through available DSH agents/models rather than assumed from ocmm, subagent interruption recovery and OpenCode prompt/cache hooks are unavailable, and release surfaces are local readiness/checklist evidence rather than the root ocmm release lane. The sequence must use the approved eight steps and distinguish headless configuration from host command execution.

- [ ] **Step 4: Run GREEN and prove source/lib preservation**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "migration contract failed" }
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $expectedSourceIdentity) { throw "dsmm/src changed in Task 2" }
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed in Task 2" }
```

Expected: compatibility and migration tests pass; every required feature has one state; no copied ocmm configuration or publication/parity claim appears; source/lib identities remain unchanged.

**Suggested commit boundary (do not execute):** `docs(dsmm): add ocmm migration guide`

---

### Task 3: Release, rollback, and stable README contract

**Files:**
- Create: `dsmm/docs/releasing.md`
- Modify: `dsmm/README.md`
- Modify: `dsmm/test/release-readiness.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2 links and terminology, DSH profile commands, package version target `1.0.0`, reserved tag identity `dsmm-v1.0.0`, and the immutable-version/non-publication constraints.
- Produces: four release sections named exactly `Preflight`, `Authorized publication`, `Post-publication verification`, and `Rollback`; README links to all three new stable docs and correct local/headless/host flows.
- Integration boundary: this task documents separately authorized operator actions but executes none. It does not add a root workflow lane, tag command, publish command, registry credential, remote receipt, or release claim.

- [ ] **Step 1: Add failing release-document and README assertions**

Extend `release-readiness.test.ts` to require the four exact `##` headings in order and these exact contracts:

```ts
const requiredReleasePhrases = [
  "dsmm-v1.0.0",
  "explicit authorization",
  "npm Trusted Publishing",
  "no DSMM lane",
  "never overwrite an npm version",
  "never move, delete, or recreate an immutable tag",
  "a successful local checker or Docker smoke is not proof of publication",
  "dsh plugin --profile <name> remove dsmm",
  "add an exact known-good version",
  "restart the profile process"
];
```

Require preflight references to exact checkout/status, npm-name ownership recheck, DSH rc.2, license parity, DSMM test/build/checker/pack/Docker gates, and artifact review. Require post-publication verification to create a fresh isolated `DSH_HOME`, install from registry, run plugin list and `--dump-config`, start a new profile process, inspect status through an available host adapter, and record package integrity. In README require links to `docs/compatibility.md`, `docs/migration-from-ocmm.md`, and `docs/releasing.md`; local tarball wording; publication-pending wording; headless `dsmm.defaultActive: true`; and host-adapter-only `/deepwork`/`/dsmm-status` semantics.

- [ ] **Step 2: Run the release-doc RED**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
```

Expected: prior compatibility/migration contracts remain GREEN; release/README assertions fail because `releasing.md` and stable README content are absent.

- [ ] **Step 3: Write the release and rollback guide**

Use exactly the four required sections. Preflight includes these read-only/local commands and labels their evidence, without running them during this task:

```powershell
git rev-parse HEAD
git status --short
npm view dsmm name version --registry "https://registry.npmjs.org/"
pnpm --filter dsmm build
pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit
pnpm --filter dsmm check:release
npm pack ".\dsmm" --dry-run --json
pnpm --filter dsmm smoke:docker
pnpm run typecheck
pnpm test
pnpm run build
```

State that the registry lookup is current evidence only and cannot reserve the name. The authorized-publication section describes the reserved tag convention, Trusted Publishing setup, immutable npm versions/tags, and the absence of a DSMM lane, but says every Git/tag/registry/GitHub mutation requires a new explicit authorization. Post-publication uses a fresh home/profile and package-integrity recording. Rollback removes `dsmm`, installs an exact known-good version, restarts the profile process, or publishes a separately authorized new patch version; it never overwrites a version or rewrites an immutable tag.

- [ ] **Step 4: Update README without claiming publication**

Add `## v1.0 release readiness` after v0.8. Link the three stable docs, say the reviewed package is prepared as `1.0.0` but publication remains pending separate authorization, and replace the disposable-profile section with two clearly labelled paths:

```text
Current reviewed artifact: install the locally packed dsmm-1.0.0.tgz.
After separately proven publication: install the exact dsmm@1.0.0 registry version.
```

Show `dsh plugin --profile <name> add <tarball-or-exact-version>`, `plugin list`, and `--dump-config`. State that headless tasks set `dsmm.defaultActive: true` in settings/profile files; `/deepwork` and `/dsmm-status` require an available host command adapter. Rename the Docker section to stable packed-runtime proof and describe add/list/dump/remove/reinstall/global-isolation coverage.

- [ ] **Step 5: Run GREEN and prove source/lib preservation**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "release documentation contract failed" }
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $expectedSourceIdentity) { throw "dsmm/src changed in Task 3" }
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed in Task 3" }
```

Expected: all three documentation groups pass; README contains truthful stable guidance and links; no publication, global slash-command, Git-write execution, or root-lane claim appears; source/lib identities remain unchanged.

**Suggested commit boundary (do not execute):** `docs(dsmm): add v1 release and rollback guidance`

---

### Task 4: Public package, full license, and fail-closed payload checker

**Files:**
- Create: `dsmm/LICENSE`
- Create: `dsmm/scripts/check-release-readiness.mjs`
- Modify: `dsmm/package.json`
- Modify: `dsmm/test/package.test.ts`
- Modify: `dsmm/test/release-readiness.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1-3 docs; repository `LICENSE`; npm `pack --dry-run --json`; existing `.`, `./preset-skills`, and `./package.json` exports; existing `dsh.bundle.patch`.
- Produces package metadata: `version: "1.0.0"`; no `private` key; `author: "Hugefiver"`; `license: "LicenseRef-AAAPL"`; repository `https://github.com/hugefiver/ocmm`; homepage `https://github.com/hugefiver/ocmm/tree/master/dsmm`; bugs `https://github.com/hugefiver/ocmm/issues`; keywords `deepseek-harness`, `dsh`, `dsh-plugin`, `deepwork`, `agentic-workflows`, `cordis`; `publishConfig.registry: "https://registry.npmjs.org/"`; `publishConfig.access: "public"`.
- Produces CLI: `node scripts/check-release-readiness.mjs [--package-root <absolute-or-relative-directory>]`; default package root is the parent of the script directory; unknown, repeated, or valueless arguments fail closed.
- Produces one JSON receipt on stdout with keys in this order: `name`, `version`, `fileCount`, `packedSize`, `unpackedSize`, `requiredSurfaceCount`, `forbiddenSurfaceCount`, `outcome`, `errors`. `outcome` is `ready` only with an empty `errors` array; every failure sets exit code `1`.
- Integration boundary: checker validation only. It does not repair files, write a tarball, use registry credentials, publish, call a provider, alter Git, or add a root release lane.

- [ ] **Step 1: Add failing package metadata, license, and files-pattern tests**

Extend `package.test.ts` to assert all exact metadata above, absence of `private`, preserved exports and patch, and this exact files policy:

```ts
const requiredFileEntries = [
  "lib/**/*.js",
  "lib/**/*.d.ts",
  "agent-presets",
  "docs/agent-presets.md",
  "docs/compatibility.md",
  "docs/design.md",
  "docs/lsp.md",
  "docs/migration-from-ocmm.md",
  "docs/model-routing.md",
  "docs/releasing.md",
  "docs/research",
  "docs/roadmap.md",
  "docs/runtime-recovery.md",
  "docs/safety-guards.md",
  "docs/settings-status.md",
  "docs/skill-sync.md",
  "patches",
  "prompts",
  "skills",
  "cordis.patch.yml",
  "LICENSE",
  "README.md"
];
```

Require exact equality, not subset matching. Assert `lib` and `docs/implementation-plan-v*.md` are absent. Update the README local-link expectation to append `docs/compatibility.md`, `docs/migration-from-ocmm.md`, and `docs/releasing.md` after the existing six links. Compare `readFileSync(root LICENSE)` and `readFileSync(dsmm/LICENSE)` as `Buffer` values. Assert `check:release` is exactly `node scripts/check-release-readiness.mjs`.

- [ ] **Step 2: Add failing black-box checker tests and fixture cleanup**

Extend `release-readiness.test.ts` with a `spawnSync(process.execPath, [checkerPath, "--package-root", root], { encoding: "utf8" })` helper that requires exactly one JSON line. Add:

1. a success case against the real package expecting `dsmm`, `1.0.0`, positive file/sizes/required counts, forbidden count `0`, `ready`, and `errors: []`;
2. a missing-license fixture expecting nonzero and `package LICENSE must be byte-identical to repository LICENSE`;
3. a same-length divergent-license fixture expecting the same invariant;
4. a wrong `dsh.bundle.patch` fixture expecting `manifest.dsh.bundle.patch must equal ./cordis.patch.yml`;
5. a broad-files fixture that adds `src/leak.ts`, `test/leak.test.ts`, `lib/leak.js.map`, `docs/Superpowers/leak.md`, `docs/implementation-plan-v9.md`, `.env`, and `nested-dsmm.tgz`, sets `files: ["**/*"]`, and expects a failed receipt whose forbidden count is positive and whose errors name every forbidden path that npm reports.

Create each fixture with `mkdtempSync(join(tmpdir(), "dsmm-release-readiness-test-"))`, `cpSync` while excluding `node_modules`, and a `finally` cleanup that resolves the fixture, requires it to remain directly under the OS temp prefix, and then calls `rmSync` on that exact path only. Before and after every checker run, assert the package root and fixture contain no newly created `*.tgz` file.

- [ ] **Step 3: Run the package/checker RED**

```powershell
node --test --experimental-strip-types ".\dsmm\test\package.test.ts" ".\dsmm\test\release-readiness.test.ts"
```

Expected: documentation tests remain GREEN; failures identify old `0.1.0`/`private`, missing package license/checker, broad `lib`, stale README-link inventory, and missing `check:release`. Dependency/import failures are not acceptable RED evidence.

- [ ] **Step 4: Make the manifest public and constrain the payload**

Apply the exact metadata and files array from the Interfaces/Step 1 blocks. Preserve `type`, `main`, `types`, all three exports, engines, dependencies, peer/dev ranges, DSH metadata, Docker scripts, and existing build/test semantics. Remove only `private`, broad `lib`, and implementation-plan packaging. Add `check:release` without adding a dependency or root script. Copy root `LICENSE` to `dsmm/LICENSE` byte-for-byte; do not copy `LICENSE.zh.md` or `LICENSE.bilingual.md` into the package.

- [ ] **Step 5: Implement the deterministic checker**

The checker performs these operations in order:

```js
const requiredExact = [
  "LICENSE", "README.md", "package.json", "cordis.patch.yml",
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts",
  "docs/agent-presets.md", "docs/compatibility.md", "docs/design.md", "docs/lsp.md",
  "docs/migration-from-ocmm.md", "docs/model-routing.md", "docs/releasing.md",
  "docs/roadmap.md", "docs/runtime-recovery.md", "docs/safety-guards.md",
  "docs/settings-status.md", "docs/skill-sync.md"
];
const requiredTrees = ["agent-presets", "docs/research", "patches", "prompts", "skills"];
```

- Parse the CLI strictly and resolve the package root without changing `cwd`.
- Read the candidate manifest and the authoritative repository license at `../../LICENSE` relative to this checker source.
- Enumerate every direct `src/*.ts` file and require corresponding `lib/<base>.js` and `lib/<base>.d.ts`; union those with `requiredExact` and every regular file under `requiredTrees`.
- Run `npm pack <packageRoot> --dry-run --json` with captured stdout/stderr and no inherited npm token override. Require one array entry named `dsmm` at `1.0.0`, numeric nonnegative sizes, and a files array.
- Require the manifest has no `private`, has the exact public metadata/files/publishConfig, preserves the three exports, and preserves `./cordis.patch.yml`.
- Compare package and repository license bytes, not normalized text.
- Normalize npm paths to `/`, sort them bytewise, and reject duplicates.
- Reject packed paths matching source/test directories, `*.test.*`/`*.spec.*`, `*.map`, `*.tgz`, `docs/implementation-plan-*.md`, any case of a `Superpowers` path segment, `.npmrc`, `.env`/`.env.*`, `credentials*`, `secrets*`, or `*.pem|*.key|*.p12|*.pfx`.
- Sort required and forbidden errors lexically. Emit exactly one one-line `JSON.stringify(receipt)` result. On spawn/JSON/internal failure, use `null` name/version, zero unavailable counts/sizes, `outcome: "failed"`, and a sanitized error string; do not echo environment values or npm credentials.

Receipt shape:

```js
{
  name: "dsmm",
  version: "1.0.0",
  fileCount: pack.files.length,
  packedSize: pack.size,
  unpackedSize: pack.unpackedSize,
  requiredSurfaceCount: requiredPaths.size,
  forbiddenSurfaceCount: forbiddenPaths.length,
  outcome: errors.length === 0 ? "ready" : "failed",
  errors
}
```

- [ ] **Step 6: Run GREEN, inspect the real receipt, and prove no tarball/lib/source mutation**

```powershell
node --test --experimental-strip-types ".\dsmm\test\package.test.ts" ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "public package/checker tests failed" }
$releaseOutput = @(pnpm --filter dsmm check:release 2>&1)
$releaseExit = $LASTEXITCODE
$releaseOutput
if ($releaseExit -ne 0) { throw "DSMM release checker failed" }
$releaseReceiptLines = @($releaseOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_.StartsWith("{") -and $_.EndsWith("}") })
if ($releaseReceiptLines.Count -ne 1) { throw "expected exactly one JSON release receipt line" }
$releaseReceipt = $releaseReceiptLines[0] | ConvertFrom-Json
if ($releaseReceipt.name -ne "dsmm" -or $releaseReceipt.version -ne "1.0.0" -or $releaseReceipt.outcome -ne "ready" -or $releaseReceipt.forbiddenSurfaceCount -ne 0 -or @($releaseReceipt.errors).Count -ne 0) {
  throw "invalid DSMM release receipt"
}
$tarballs = @(fd --type f --extension tgz . ".\dsmm")
if ($LASTEXITCODE -ne 0) { throw "cannot inspect DSMM tarballs" }
if ($tarballs.Count -ne 0) { throw "release checker created or retained a tarball: $($tarballs -join ', ')" }
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $expectedSourceIdentity) { throw "dsmm/src changed in Task 4" }
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed in Task 4" }
```

Expected: both suites pass; checker emits one ready receipt; fixture failures are fail-closed; no tarball exists; source/lib identities remain unchanged.

**Suggested commit boundary (do not execute):** `feat(dsmm): prepare public 1.0 package`

---

### Task 5: Fresh-profile packaged lifecycle and isolation contract

**Files:**
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: Task 4's reviewed tarball/checker; DSH commands `plugin --profile <name> add|remove|list`; profile manifest `dependencies` plus `dsh.profile.bundles`; existing packed resolution/runtime/status/LSP proof and cleanup.
- Produces: profile `dsmm-v1-smoke`; top-level `$DSH_HOME/cordis.patch.yml` sentinel; sibling profile package/patch sentinels; helpers that assert dependency/bundle/list/dump/resolution state; remove and same-tarball reinstall proof.
- Produces ordered markers immediately before the final marker: `DSMM_V1_RELEASE_CHECK_OK`, `DSMM_V1_PROFILE_INSTALL_OK`, `DSMM_V1_PROFILE_REMOVE_OK`, `DSMM_V1_GLOBAL_CONFIG_UNCHANGED`.
- Integration boundary: preserve every existing marker, runtime call, fake-provider zero-stream assertion, unique image lifecycle, and `AggregateError` cleanup. Do not publish, use credentials, call a model provider, mutate real `DSH_HOME`, prune Docker, or treat shared `$DSH_HOME/profiles/node_modules` resolution as global activation.

- [ ] **Step 1: Extend the static smoke test first**

Change the expected marker array to exactly:

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
  "DSMM_V1_RELEASE_CHECK_OK",
  "DSMM_V1_PROFILE_INSTALL_OK",
  "DSMM_V1_PROFILE_REMOVE_OK",
  "DSMM_V1_GLOBAL_CONFIG_UNCHANGED",
  "DSMM_PACKAGED_RUNTIME_SMOKE_OK"
];
```

Keep the existing exactly-once/order loop. Add static assertions for:

- `PROFILE = "dsmm-v1-smoke"`;
- add, list, `--dump-config`, remove, second add of the same `tarball`, second list, and second dump;
- profile `package.json` dependency `dsmm` and `dsh.profile.bundles` containing `dsmm` exactly once after add/reinstall and zero times after remove;
- installed `dsmm/package.json` version `1.0.0`, `dsh.bundle.patch`, and shipped patch existence;
- release checker execution and parsed `ready` receipt;
- `Buffer` snapshots/equality for home `cordis.patch.yml`, sibling `package.json`, and sibling `cordis.patch.yml`;
- no assertion that `createRequire(profilePackage).resolve("dsmm")` must fail after removal, because the DSH-owned shared resolution fallback may remain inside the run-owned home;
- reinstall resolution remains under the run-owned home and never equals the checkout.

- [ ] **Step 2: Run the smoke-contract RED**

```powershell
node --test --experimental-strip-types ".\dsmm\test\docker-smoke-assets.test.ts"
```

Expected: FAIL at the first missing v1 marker/profile lifecycle assertion while all existing v0.6-v0.8 static contracts remain satisfied.

- [ ] **Step 3: Create sentinels and exact profile-state helpers**

In `runInnerSmoke()`, after creating the owned home but before DSH commands:

```js
const globalPatch = join(home, "cordis.patch.yml");
const siblingDir = join(home, "profiles", "unrelated-smoke");
const siblingPackage = join(siblingDir, "package.json");
const siblingPatch = join(siblingDir, "cordis.patch.yml");
```

Create parent directories, write a comment-only valid global patch, write a valid private sibling profile manifest with only `@deepseek-ai/dsh-base` in `dsh.profile.bundles`, and write a comment-only sibling patch. Capture all three as `Buffer` values. Add helpers that parse the target profile manifest; require `dependencies.dsmm` and one `dsmm` bundle when installed; require both absent when removed; parse plugin-list output for a standalone `dsmm` package token; and compare all sentinel buffers byte-for-byte.

- [ ] **Step 4: Implement add/list/dump/check/remove/reinstall without disturbing current runtime proof**

Rename the target profile to `dsmm-v1-smoke`. After first add:

1. run `dsh plugin --profile dsmm-v1-smoke list` and require `dsmm`;
2. assert dependency and bundle membership, then resolve/import from the profile anchor and validate installed package `1.0.0` plus shipped patch;
3. run `--dump-config` and require `id: dsmm`;
4. run every existing routing/recovery/status/core/guard/LSP smoke in unchanged order;
5. run `node <source>/scripts/check-release-readiness.mjs --package-root <source>` and require one `ready`/zero-forbidden receipt, then print `DSMM_V1_RELEASE_CHECK_OK`;
6. print `DSMM_V1_PROFILE_INSTALL_OK` only after all initial install/runtime assertions pass;
7. run `dsh plugin --profile dsmm-v1-smoke remove dsmm`, require list/dependency/bundle absence, then print `DSMM_V1_PROFILE_REMOVE_OK`;
8. reinstall the exact same tarball path, require list/dependency/bundle/dump/profile-anchored resolution again, compare all sentinels, then print `DSMM_V1_GLOBAL_CONFIG_UNCHANGED`;
9. set `passed = true`; keep `DSMM_PACKAGED_RUNTIME_SMOKE_OK` after successful owned cleanup exactly as today.

Preserve `PNPM_CONFIG_AUTO_INSTALL_PEERS: "true"`, immediate `requireSuccess()` checks, owned-path assertions, fake adapter `streamCalls === 0`, and cleanup failure aggregation.

- [ ] **Step 5: Run static GREEN and prove source/lib preservation**

```powershell
node --test --experimental-strip-types ".\dsmm\test\docker-smoke-assets.test.ts" ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "Docker smoke contract tests failed" }
$currentSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$currentLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if ($currentSourceIdentity -ne $expectedSourceIdentity) { throw "dsmm/src changed in Task 5" }
if ($currentLibIdentity -ne $expectedLibIdentity) { throw "dsmm/lib changed in Task 5" }
```

Expected: static tests pass with all 17 markers exactly once/in order and complete lifecycle/sentinel/cleanup contracts; no working-tree generation occurs. The real Docker command is reserved for Task 6 so it runs once for the complete final source revision.

**Suggested commit boundary (do not execute):** `test(dsmm): prove v1 profile lifecycle isolation`

---

### Task 6: Roadmap, authoritative generation, full gates, and common-identity review

**Files:**
- Modify after Tasks 1-5 GREEN: `dsmm/test/release-readiness.test.ts`
- Modify after its RED: `dsmm/docs/roadmap.md`
- Regenerate exactly once per complete source revision: `dsmm/lib/**`
- Verify only: every Task 1-5 file, reviewed v0.6-v0.8 work, root gates, and excluded release/runtime surfaces.

**Interfaces:**
- Consumes: completed Tasks 1-5, unchanged baseline HEAD, initial source/lib identities or the current correction cycle's frozen identities, complete stable package/docs/smoke contracts, and canonical identity code from `skills/v1/requesting-code-review/SKILL.md`.
- Produces: exact roadmap status, one authoritative generated-lib identity, complete DSMM/checker/pack/Docker/root evidence, one canonical working-tree identity packet, and unconditional first-available Oracle plus primary Reviewer receipts for that same current identity.
- Integration boundary: this is the only working-tree generation and formal acceptance task. Any validated file correction exits the gate sequence, invalidates all later evidence/receipts, returns to the owning task, and restarts this task for a new complete revision.

- [ ] **Step 1: Add the failing roadmap release-state assertion**

Extend `release-readiness.test.ts` to isolate the `## v1.0 — Stable dsmm release` section and require the exact sentence exactly once:

```text
Status: release-ready as dsmm 1.0.0; publication is pending separate authorization.
```

Within that section, reject standalone status language using `released`, `published`, `available on npm`, or an already-created tag. Negative matching must allow the exact phrase `publication is pending separate authorization`.

- [ ] **Step 2: Run the roadmap RED, then add only the approved sentence**

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
```

Expected: all Task 1-4 contracts pass and only the missing exact roadmap status fails. Add the sentence directly below the v1.0 heading without changing deliverables/acceptance, then rerun:

```powershell
node --test --experimental-strip-types ".\dsmm\test\release-readiness.test.ts"
if ($LASTEXITCODE -ne 0) { throw "roadmap release-state contract failed" }
```

Expected: all release-readiness documentation/package/checker/roadmap contract tests pass.

- [ ] **Step 3: Run the cycle-appropriate generated-output precondition**

Reassert HEAD and source/lib state:

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD before final generation: $head" }
$preGenerationSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$preGenerationLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"

if (-not (Test-Path -LiteralPath "variable:correctionChangesGeneratedSource")) {
  if ($preGenerationSourceIdentity -ne $dsmmSourceBaselineIdentity) { throw "initial v1 scope changed compiled dsmm/src" }
  if ($preGenerationLibIdentity -ne $dsmmLibBaselineIdentity) { throw "working-tree dsmm/lib drifted before authoritative generation" }
  "INITIAL_GENERATED_RED_NOT_APPLICABLE"
} elseif ($correctionChangesGeneratedSource) {
  if ($preGenerationLibIdentity -ne $expectedLibIdentity) { throw "correction stale dsmm/lib drifted before generation" }
  if (-not (Test-Path -LiteralPath "variable:correctionStaleTests") -or
      -not (Test-Path -LiteralPath "variable:correctionExpectedStaleAssertion") -or
      @($correctionStaleTests).Count -eq 0 -or
      [string]::IsNullOrWhiteSpace($correctionExpectedStaleAssertion)) {
    throw "compiled-source correction must provide exact stale tests and expected assertion"
  }
  foreach ($testPath in @($correctionStaleTests)) {
    if (-not (Test-Path -LiteralPath $testPath -PathType Leaf)) { throw "correction stale test does not exist: $testPath" }
  }
  $staleTests = @($correctionStaleTests)
  $staleOutput = @(node --test --experimental-strip-types $staleTests 2>&1)
  $staleExit = $LASTEXITCODE
  $staleOutput
  if ($staleExit -eq 0) { throw "EXPECTED RED: corrected source passed against stale generated output" }
  if (($staleOutput -join "`n") -notlike ("*" + $correctionExpectedStaleAssertion + "*")) {
    throw "stale generated failure did not contain the owning-task assertion"
  }
} else {
  if ($preGenerationLibIdentity -ne $expectedLibIdentity) { throw "docs/package/smoke correction changed stale dsmm/lib" }
  "CORRECTION_GENERATED_RED_NOT_APPLICABLE"
}
```

Expected initial cycle: both identities equal the captured reviewed v0.8 baseline and the command prints `INITIAL_GENERATED_RED_NOT_APPLICABLE`; no artificial stale failure is created because v1 does not change compiled source. A source-correction cycle must fail only at its named stale-runtime assertion.

- [ ] **Step 4: Generate working-tree lib exactly once for this complete source revision**

```powershell
pnpm --filter dsmm build
if ($LASTEXITCODE -ne 0) { throw "authoritative DSMM build failed" }
$authoritativeSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$authoritativeLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
if (-not (Test-Path -LiteralPath "variable:correctionChangesGeneratedSource") -and $authoritativeLibIdentity -ne $dsmmLibBaselineIdentity) {
  throw "unchanged v1 source did not reproduce the initial generated-lib identity"
}
"source=$authoritativeSourceIdentity"
"lib=$authoritativeLibIdentity"
```

Do not run `pnpm --filter dsmm test`, `typecheck:test`, or another command that invokes the DSMM build script on this unchanged revision. Package/docs/test/smoke corrections still receive one authoritative build; unchanged source must reproduce identical generated bytes.

- [ ] **Step 5: Run DSMM test typecheck and every DSMM test without rebuilding**

```powershell
pnpm --dir ".\dsmm" exec tsc -p ".\tsconfig.test.json" --noEmit
if ($LASTEXITCODE -ne 0) { throw "DSMM test-config typecheck failed" }
$dsmmTests = @(fd --type f --extension ts --glob "*.test.ts" ".\dsmm\test" | Sort-Object)
if ($LASTEXITCODE -ne 0 -or $dsmmTests.Count -eq 0) { throw "cannot enumerate DSMM tests" }
node --test --experimental-strip-types $dsmmTests
if ($LASTEXITCODE -ne 0) { throw "DSMM tests failed" }
```

Expected: test-config typecheck and every DSMM suite pass, including release readiness, package, Docker assets, routing, recovery, settings/status, safety, presets, prompts, and LSP. Neither command rebuilds lib.

- [ ] **Step 6: Run the release checker and verify its exact ready receipt**

```powershell
$releaseOutput = @(pnpm --filter dsmm check:release 2>&1)
$releaseExit = $LASTEXITCODE
$releaseOutput
if ($releaseExit -ne 0) { throw "DSMM release checker failed" }
$releaseReceiptLines = @($releaseOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_.StartsWith("{") -and $_.EndsWith("}") })
if ($releaseReceiptLines.Count -ne 1) { throw "expected exactly one JSON release receipt line" }
$releaseReceipt = $releaseReceiptLines[0] | ConvertFrom-Json
if ($releaseReceipt.name -ne "dsmm" -or $releaseReceipt.version -ne "1.0.0") { throw "release receipt package identity mismatch" }
if ($releaseReceipt.fileCount -le 0 -or $releaseReceipt.packedSize -le 0 -or $releaseReceipt.unpackedSize -le 0 -or $releaseReceipt.requiredSurfaceCount -le 0) { throw "release receipt counts/sizes are invalid" }
if ($releaseReceipt.forbiddenSurfaceCount -ne 0 -or $releaseReceipt.outcome -ne "ready" -or @($releaseReceipt.errors).Count -ne 0) { throw "release receipt is not ready" }
```

Expected: one JSON receipt, positive counts/sizes, zero forbidden surfaces, `ready`, no tarball, no provider/network credential use, and no Git mutation.

- [ ] **Step 7: Independently verify npm dry-run inventory**

```powershell
$packJson = @(npm pack ".\dsmm" --dry-run --json)
if ($LASTEXITCODE -ne 0) { throw "DSMM npm pack dry-run failed" }
$pack = ($packJson -join "`n") | ConvertFrom-Json
if (@($pack).Count -ne 1 -or $pack[0].name -ne "dsmm" -or $pack[0].version -ne "1.0.0") { throw "unexpected npm pack identity" }
$paths = @($pack[0].files | ForEach-Object { $_.path.Replace('\', '/') })
$required = @(
  "LICENSE", "README.md", "package.json", "cordis.patch.yml",
  "lib/index.js", "lib/index.d.ts", "lib/preset-skills.js", "lib/preset-skills.d.ts",
  "docs/compatibility.md", "docs/migration-from-ocmm.md", "docs/releasing.md",
  "docs/model-routing.md", "docs/runtime-recovery.md", "docs/settings-status.md", "docs/roadmap.md"
)
foreach ($path in $required) { if ($paths -notcontains $path) { throw "packed dsmm artifact missing $path" } }
$forbidden = @($paths | Where-Object {
  $_ -match '(^|/)(src|test|tests)(/|$)' -or
  $_ -match '(^|/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$' -or
  $_ -match '\.map$' -or
  $_ -match '\.tgz$' -or
  $_ -match '(^|/)docs/implementation-plan-[^/]*\.md$' -or
  $_ -match '(^|/)Superpowers(/|$)' -or
  $_ -match '(^|/)(\.npmrc|\.env(?:\..*)?|credentials?[^/]*|secrets?[^/]*|[^/]+\.(pem|key|p12|pfx))$'
})
if ($forbidden.Count -ne 0) { throw "forbidden packed paths: $($forbidden -join ', ')" }
$tarballs = @(fd --type f --extension tgz . ".\dsmm")
if ($LASTEXITCODE -ne 0 -or $tarballs.Count -ne 0) { throw "dry-run created or retained a tarball" }
```

Expected: exactly one public package; full license/docs/runtime entry points are present; `src`, tests, maps, Superpowers/implementation plans, tarballs, and credential-like files are absent.

- [ ] **Step 8: Run the pinned Docker proof once and verify all 17 markers plus non-owned state**

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
```

Expected: the reviewed tarball is added/listed/dumped, all existing runtime proofs execute with zero real provider stream calls, release checker passes, removal clears profile dependency/bundle membership, same tarball reinstall restores profile resolution, global/sibling sentinels are byte-identical, all 17 markers occur once/in order, and only run-owned resources are removed.

- [ ] **Step 9: Run diff and root gates once for this complete source revision**

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff whitespace check failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "root typecheck failed" }
pnpm test
$rootTestExit = $LASTEXITCODE
if ($rootTestExit -ne 0) { throw "root tests failed; preserve exact output and do not retry this unchanged source revision" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "root build failed" }
```

Expected: diff check, root typecheck, the single root test run for this revision, and root build exit `0`. A failure is reported verbatim; do not retry unchanged code, serialize/alter tests, weaken thresholds, or inherit an earlier exception.

- [ ] **Step 10: Prove excluded surfaces and capture one canonical identity packet**

```powershell
$excludedChanges = @(git diff --name-only HEAD -- ".github/workflows/release.yml" "scripts/check-release-completion.ts" "scripts/release-completion" "src" "schema.json")
if ($LASTEXITCODE -ne 0) { throw "cannot inspect excluded release/runtime surfaces" }
if ($excludedChanges.Count -ne 0) { throw "out-of-scope root surface changed: $($excludedChanges -join ', ')" }

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

Construct one packet with these exact fields:

```text
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: the exact lowercase sha256 value printed by the canonical wrapper
DESCRIPTION: DSMM v1.0 public package/license/payload checker, compatibility and ocmm migration contracts, release/rollback guidance, fresh-profile add/list/dump/remove/reinstall/global-isolation proof, and release-ready roadmap state, preserving reviewed v0.6-v0.8 behavior
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-26-dsmm-v1-release-readiness.md and docs/superpowers/specs/2026-08-26-dsmm-v1-release-readiness-design.md
BASELINE: HEAD cedd30b1abd03cf00b9ce330fa3b1805d76cb401 plus reviewed uncommitted v0.6 model-routing, v0.7 runtime-recovery, and v0.8 settings/status work
REVIEW_INPUT: current binary diff from HEAD plus bytewise-sorted non-ignored untracked manifest, as required by requesting-code-review
VERIFICATION_EVIDENCE: authoritative generated-lib identity; DSMM test-config/all tests; ready release-check receipt; independent exact dry-run inventory; ordered 17-marker pinned Docker proof; diff check; root typecheck/single root test/build; all captured for this identity
GLOBAL_CONSTRAINTS: the complete Global Constraints section of this plan, verbatim
SOURCE_REVISION_RULE: any source/test/docs/package/smoke correction invalidates generated-lib and all DSMM/pack/Docker/root evidence, packet, and receipts, then restarts Task 6 for a new complete revision
```

- [ ] **Step 11: Obtain unconditional Oracle and primary Reviewer approval for the same identity**

Inspect currently callable profiles rather than generated/config examples. Because this is release-safety work, select the first available Oracle lane and primary `reviewer` in parallel at configured `max`, otherwise `high`, otherwise unsuffixed normal. Send the identical packet to both; Oracle/Reviewer review implementation, not this plan.

Immediately rerun the canonical identity wrapper after each lane returns. Reject timeout, partial output, missing field, conditional approval, stale/lost evidence, an older identity, or any identity mismatch. Each accepted receipt has exactly:

```text
role/profile lane: selected Oracle or primary Reviewer profile
task_id or session receipt: durable task/session/result reference
artifact identity: the common current sha256 identity
verdict: approved
report artifact/source: task result or durable review report source
```

If either lane reports a validated issue, capture `$correctionStaleLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"`, assign it to `$expectedLibIdentity`, classify whether compiled `dsmm/src/**` changes, return to the owning task with a fresh worker, and keep that working-tree lib byte-identical. Invalidate all gates, packet, and receipts. A compiled-source correction performs RED/GREEN only in its OS-temp mirror built from corrected source, then supplies exact `$correctionStaleTests` and `$correctionExpectedStaleAssertion` for Task 6 Step 3 to reproduce against the stale working-tree lib. A docs/package/test/smoke-only correction uses its own failing-first evidence and sets `$correctionChangesGeneratedSource = $false`. Restart Task 6 at Step 3, confirm the stale RED when applicable, perform exactly one new authoritative build in Step 4, prove GREEN in Step 5, and run root `pnpm test` exactly once for the new complete revision. Evidence-only omissions that change no file require recaptured evidence and new current receipts, never a remembered receipt.

Final acceptance requires both `approved` receipts and one final parent identity recomputation equal to their common identity.

- [ ] **Step 12: Record final preservation and cleanup receipt**

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "HEAD changed during DSMM v1 implementation" }
git status --short
git diff --stat
git diff --check
$finalSourceIdentity = Get-DsmmTreeIdentity -Tree "dsmm/src"
$finalLibIdentity = Get-DsmmTreeIdentity -Tree "dsmm/lib"
"source=$finalSourceIdentity"
"lib=$finalLibIdentity"
```

Expected: HEAD is unchanged; reviewed v0.6-v0.8 plus intended v1 spec/plan/license/package/tests/docs/smoke/generated state remain unstaged; no tarball, dependency install, credential, root release lane, unrelated runtime/schema/provider change, or owned Docker/temp residue remains. Report that publication and every Git write still require separate explicit authorization.

**Suggested commit boundary (do not execute):** `feat(dsmm): complete v1 release readiness`

---

## Self-review

**Spec coverage:** Passed. Tasks 1-4 cover every compatibility, migration, release/rollback, README, public package, full-license, payload, checker, and deliberate-failure requirement. Task 5 covers add/list/dump/remove/reinstall/global/sibling isolation and preserves all prior runtime markers. Task 6 covers the exact roadmap state, initial/current generated identities, one authoritative build per complete revision, DSMM/checker/pack/Docker/root gates, and same-current-identity Oracle plus primary Reviewer approval.

**Interface consistency:** Passed. The package is `dsmm@1.0.0` everywhere; DSH stays `0.1.1-rc.2`; the patch is always `./cordis.patch.yml`; compatibility levels and migration states have one exact vocabulary; checker CLI/receipt keys are fixed; the Docker profile is always `dsmm-v1-smoke`; and the final review packet uses the canonical requesting-code-review identity wrapper.

**Placeholder scan:** Passed. The plan contains no deferred implementation marker, unnamed interface, unspecified test, missing RED cause, or variable release authority. Angle-bracket command forms occur only as documented DSH/operator syntax, with their meanings defined in the surrounding step.

**PowerShell scan:** Passed. Commands use PowerShell arrays, `$LASTEXITCODE`, explicit test enumeration, and literal/verified deletion targets. There is no Bash environment assignment, `export`, `&&`, `/dev/null`, or assumed wildcard expansion. The only recursive cleanup described is a fail-closed OS-temp test fixture or run-owned Docker/home/workspace cleanup.

**Generated-output/invalidation scan:** Passed. Tasks 1-5 hash and preserve current reviewed source/lib. Task 6 distinguishes unchanged-source `RED_NOT_APPLICABLE` from a real compiled-source stale-runtime RED, performs one authoritative build per complete revision, requires unchanged source to reproduce the baseline lib identity, and invalidates all gates/receipts after every validated correction.

**Verification scan:** Passed. Final order is roadmap RED/GREEN, generated precondition, one DSMM build, test-config/all tests, release checker, independent package inventory, one real ordered 17-marker Docker proof, diff/root gates, canonical identity, Oracle+Reviewer receipts, and final preservation. Tests alone are not treated as packed-profile evidence.

**Scope and authorization scan:** Passed. No task implements or executes publication, package reservation, root release automation, a DSH upgrade, provider call, frontend/TUI/Web panel, dependency install, commit, tag, push, stage, reset, stash, or other Git/registry write. Release documentation labels those later operator actions as separately authorized and does not claim the working tree is published.

**Plan-review receipt:** Waiting for orchestrator-owned plan-critic receipt; this planner did not dispatch a plan critic or implementation/review worker.
