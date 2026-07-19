# GPT-5.6 Prompt Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three oversized GPT-5.6 specialization prompts with compact additive calibrations, preserve effective composed behavior, commit the exact source/test/doc/generated change in an isolated worktree, and fast-forward it into `master` without altering unrelated main-checkout work.

**Architecture:** After a fresh plan-review receipt, create `feat/gpt-5-6-prompt-simplification` in a dedicated sibling worktree, copy only this task's untracked spec and plan into it, and execute every edit, test, generation, and commit there. Keep `loadAllPrompts()`, `deepworkPromptForAgent()`, category composition, routing, and schema unchanged; replace the specialization with one shared four-section calibration plus environment wrappers, lock it with effective-prompt and generated-profile tests, then integrate the verified commit into `master` only by a guarded fast-forward that preserves concurrent main-checkout work byte-for-byte.

**Tech Stack:** Markdown prompts, TypeScript 6 ESM, Node.js 22 built-in `node:test`, PowerShell 7, the main checkout's existing TypeScript binary, direct Node/Cargo script bodies, the existing Codex plugin generator, Git worktrees and semantic commits, SHA-256 repository-safety checks, fast-forward-only Git integration.

---

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md`. Read it through `## Repository Safety` before implementation and stop if repository evidence contradicts it.
- Do not start Task 1 until the orchestrator records a passing plan-review receipt for this exact plan revision. A receipt for an older revision, timeout, or partial review is not valid.
- Main checkout: `C:\Users\hugefiver\source\ocmm`. Dedicated worktree: `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`. Feature branch: `feat/gpt-5-6-prompt-simplification`. Integration branch: `master`.
- Every command is PowerShell 7-compatible. Each non-Git command block names an exact `Workdir`; every Git command uses `git -C <exact-path>`. Do not use Bash-only syntax or an implicit “repository root.”
- All implementation edits, tests, builds, generation, staging, and commits occur in the dedicated worktree. The main checkout is used only for preflight inspection, byte comparisons, deletion of its two byte-identical untracked task-artifact copies, fast-forward integration, and worktree/branch cleanup.
- Git writes authorized by the user are limited to: `git worktree add -b`, staging the exact task allowlist, semantic commits on the feature branch, an optional non-rebase merge of a newer `master` into the feature branch, `git merge --ff-only` into `master`, `git worktree remove`, and `git branch -d`. Never run `git push`, `git tag`, `git rebase`, `git reset`, `git checkout`, `git restore`, `git stash`, force options, or `git worktree prune`.
- Do not require the main checkout to be clean. Task 1 dynamically captures its complete porcelain-v1 status, index/worktree status codes, tracked index entries, and SHA-256 for every dirty regular file. Every captured concurrent dirty path remains in the main checkout and must be byte-for-byte and status-for-status unchanged through integration.
- The only baseline dirty paths allowed to overlap this task are the same-name untracked copies of this task's spec and plan. Every other baseline dirty path must be disjoint from the 54-path feature allowlist; all eight task-owned implementation paths and all tracked generated roots must be clean before the sibling worktree is created.
- Copy only this task's spec and plan from the main checkout into the worktree. Execution-evidence corrections may update those worktree copies, but the main copies must remain byte-identical to their captured baseline until deletion; commit the corrected worktree artifacts with the implementation.
- Main-checkout safety is equality to the dynamic Task 1 baseline, not cleanliness: no new or missing dirty path, no porcelain-code change, no index-entry change, and no regular-file SHA-256 change. Before deleting task copies, the complete baseline must match; after deleting them and after fast-forward integration, the same baseline minus those two task-artifact `??` entries must match.
- `C:\Users\hugefiver\source\ocmm\node_modules` is the only dependency source. Create a directory junction at the worktree's `node_modules`, do not run `pnpm install` or upgrade software, and remove the junction before removing the worktree.
- An unrelated prunable worktree exists. Record it for comparison, but never prune, remove, repair, lock, unlock, or otherwise touch it.
- The task delta must not modify `src/hooks/config.ts`, `src/intent/prompt-loader.ts`, `src/codex/plugin-generator.ts`, `src/config/schema.ts`, `schema.json`, `package.json`, any role/category/base prompt, or any skill. A dynamically captured concurrent main-checkout change at a non-feature path does not violate this task rule when its status, index entry, and bytes remain unchanged. No schema regeneration is required.
- Source/test/doc edits are limited to the eight implementation files listed in the File Structure table, plus evidence-only corrections to this task's spec and plan. Generated files are never hand-edited.
- Preserve model routing, native GPT-5.6 `max`, role permissions, approval gates, verification tiers, terminal delegation contracts, and Codex profile selection behavior.
- Keep every `prompts/v1/deepwork/*.md` and `prompts/codex/deepwork/*.md` envelope valid. The omo specialization remains unwrapped; v1 and Codex remain wrapped in exactly one `<deepwork-mode>` pair.
- Each specialization must be at most 3,500 JavaScript string characters and at most 60% of its baseline length: omo 6,742, v1 6,794, Codex 6,799.
- Clear `OCMM_PROFILE` and `OCMM_NO_PROFILE` only for the commands in this plan, then restore their prior values. Do not install or upgrade software.
- Before worktree generation, tracked generated roots `.agents/plugins/marketplace.json`, `.codex/agents/**`, and `plugins/deepwork/**` must be clean. If not, stop without running the worktree generator.
- Before worktree generation, generate a candidate under `C:\Users\hugefiver\AppData\Local\Temp\opencode` using the worktree as `projectRoot` and compare it with the worktree. Continue only if the tracked candidate delta is exactly the 44 expected prompt-derived TOML files. The sole exception is the 23 ignored candidate runtime files under `plugins/deepwork/dist/**`, mapped one-to-one to `dist/{cli,shared,bin}`, hash-equal, and explicitly ignored.
- After generation, any tracked generated file outside the 44 expected agent TOMLs is a blocker. The ignored runtime staging exception must be verified separately, never hand-edited, and never admitted to the tracked diff. Stop, retain evidence, and do not use a Git recovery command.
- A dirty main checkout is expected and is not itself a blocker. Any overlap between concurrent dirty paths and task-owned paths, baseline-state drift, merge conflict, non-fast-forward condition, unexpected generator delta, staging-scope escape, or cleanup precondition failure is a hard stop before the next destructive action. Report exact evidence and leave state in place; do not stash, reset, checkout, overwrite, force-remove, or otherwise recover automatically.
- Each native command must be followed immediately by a `$LASTEXITCODE` check before another native command runs.

### Execution Discoveries

- The worktree `node_modules` junction exposes an absolute `virtualStoreDir` in `.modules.yaml`; invoking `pnpm run` there triggers an install/purge. Do not invoke pnpm in the worktree. Use `node C:\Users\hugefiver\source\ocmm\node_modules\typescript\bin\tsc` for typechecking, direct Node test/script bodies, and direct Cargo commands instead.
- The captured base commit's complete TypeScript suite has exactly 24 fixed failures, all in `src/config/load.test.ts` and `src/config/profiles.test.ts`, which are protected concurrent config-task files. The replacement gate is targeted tests, all non-config TypeScript tests, typecheck, Rust tests, and build green, plus proof that the complete suite remains exactly at that 24-failure baseline.
- Task 7 creates `dist/{cli,shared,bin}`. `stageCodexRuntime()` copies 23 files into candidate or worktree `plugins/deepwork/dist/**`; `.gitignore:7` ignores them and none is tracked. Candidate comparison permits only that separately mapped and SHA-256-verified ignored-runtime set, while the tracked delta remains exactly 44 TOMLs and the complete 140-entry generated map remains deterministic across a second run.
- The required effective category assertion belongs in `src/hooks/config.category.test.ts`. The feature allowlist is therefore eight authoritative source/test/sync files, two task artifacts, and 44 generated TOMLs, or 54 paths total.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `prompts/omo/deepwork/gpt-5.6.md` | Modify | Unwrapped omo GPT-5.6 additive calibration. |
| `prompts/v1/deepwork/gpt-5.6.md` | Modify | Same shared doctrine inside the v1 `<deepwork-mode>` envelope, with injected-skill authority wording. |
| `prompts/codex/deepwork/gpt-5.6.md` | Modify | Same shared doctrine inside the Codex envelope, with ahead-of-runtime guard and Codex authority wording. |
| `src/intent/prompt-loader.test.ts` | Modify | Test source doctrine, size/reduction, wrapper differences, absent duplicate sections, and effective gpt/planner/category composition. |
| `src/hooks/config.category.test.ts` | Modify | Assert the effective category configuration retains the GPT-5.6 calibration and inherited category doctrine. |
| `src/codex/plugin-generator.test.ts` | Modify | Test generated profile outcome/waiting/revalidation calibration and isolate the GPT-5.6 segment before checking removed headings. |
| `docs/prompt-sync.md` | Modify | Record the GitHub source/PR evidence, additive boundary, inherited effective doctrine, and promoted waiting guidance for omo. |
| `docs/v1-maintenance.md` | Modify | Record the same simplification for v1 and the Codex adapter, including wrapper differences and generated-profile propagation. |
| `docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md` | Copy, record verified execution evidence, then commit | Approved design and repository-safety authority carried from the main checkout into the feature branch. |
| `docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md` | Copy, record verified execution discoveries, then commit | This executable worktree/commit/integration plan. |
| `.codex/agents/dw-{builder,clarifier,code-search,coding,complex,creative,deep,doc-search,documenting,explore,frontend,hard-reasoning,media-reader,normal-task,oracle,oracle-2nd,orchestrator,plan-critic,planner,quick,research,reviewer}.toml` | Regenerate | Project Codex profiles; only their generated developer-instruction calibration changes. |
| `plugins/deepwork/agents/dw-{builder,clarifier,code-search,coding,complex,creative,deep,doc-search,documenting,explore,frontend,hard-reasoning,media-reader,normal-task,oracle,oracle-2nd,orchestrator,plan-critic,planner,quick,research,reviewer}.toml` | Regenerate | Bundled copies of the same 22 generated profiles. |
| `.agents/plugins/marketplace.json` | Regenerate and verify unchanged | Generator-owned manifest; it must have no content delta. |
| `plugins/deepwork/**` outside `plugins/deepwork/agents/*.toml` | Regenerate and verify unchanged | Runtime, skills, manifests, package metadata, and README must not change. |
| `src/hooks/config.ts` | Inspect only | Existing composition source of truth; no assembly change is permitted. |
| `src/intent/prompt-loader.ts` | Inspect only | Existing loader/routing source; no change is permitted. |
| `src/codex/plugin-generator.ts` | Inspect only | Existing generator; no change is permitted. |

No new product, test-helper, config, or schema file is introduced. The already-authored task spec and plan become tracked in the feature commit.

## Requirement Coverage

| Requirement | Plan evidence |
|---|---|
| Complete additive GPT-5.6 doctrine | Task 3 source-doctrine tests; Task 5 exact prompt text. |
| ≤3,500 characters and ≥40% reduction | Task 3 baseline constants/assertions; Tasks 5 and 7 measured verification. |
| omo/v1/Codex intent synchronization | Task 3 shared-section equality; Task 5 exact shared body; Task 6 sync records. |
| Native `max`, explicit configuration, authorization, and conservative delegation | Task 3 regex contract; Task 5 applicability/authority and delegation sections. |
| Outcome/completion, safe defaults, waiting/backoff, changed-input revalidation | Tasks 3–5 source and generated assertions. |
| Shared doctrine retained without specialization duplication | Task 3 effective gpt/planner/category tests and removed-heading checks. |
| Generated Codex behavior | Task 4 generated-profile RED assertions; Task 8 candidate/worktree generation and real-surface probes. |
| GitHub evidence | Task 6 exact synchronization text naming repository, SHA, source paths, and PRs. |
| No unrelated files or schema changes | Tasks 1–2 dynamically capture and isolate all concurrent main-checkout dirt; Tasks 8–11 enforce generated, staging, disjoint-path, byte/hash, index, and integration scope. |
| Required repository gates | Task 2 captures the exact 24-failure TypeScript baseline; Task 7 runs targeted, typecheck, non-config TypeScript, Rust, and build gates; Task 8 deterministic generation; Task 10 revalidation after concurrent `master` integration when required. |
| Worktree-only implementation and committed task artifacts | Tasks 1–2 create/isolate the worktree and copy only the spec/plan; Task 9 stages and commits the exact allowlist. |
| No-interference fast-forward integration | Tasks 10–11 require feature/master/concurrent path disjointness, preserve the captured porcelain/index/SHA-256 snapshot, integrate newer `master` without rebase, remove only byte-identical task copies, fast-forward despite unrelated dirt, and clean up only this worktree/branch. |

## Execution and Review Boundaries

1. A fresh passing receipt for this exact plan revision is the gate into Task 1; no worktree is created during planning or review.
2. Tasks 1–2 capture the complete dynamic main-checkout dirty-state baseline, prove it is disjoint from task-owned paths except the task spec/plan copies, create the dedicated worktree from the captured `master` HEAD without cleaning main, copy only this task's spec/plan, attach the existing dependency tree by junction, and require green baseline typecheck/tests.
3. Tasks 3–4 establish RED contracts. Tasks 5–6 make the smallest GREEN prompt/doc changes.
4. Task 7 must be fully green before generated roots are touched. Task 8 is an atomic worktree-only generation boundary guarded by clean-root and worktree-sourced temp-candidate checks.
5. Task 9 audits, stages, and creates one semantic feature commit containing the spec, plan, implementation, tests, sync records, and exactly 44 generated TOMLs.
6. Task 10 first proves the feature change, any newer `base..master` change, and the captured concurrent dirty set are safely disjoint; it then handles an advanced `master` without rebase or force and revalidates before an optional merge commit. Any overlap or conflict stops without automatic recovery.
7. Task 11 proves the complete concurrent porcelain/index/SHA-256 baseline unchanged, removes only byte-identical untracked task copies, fast-forwards `master` while the disjoint dirt remains, proves that dirt unchanged again, then removes only this task's junction/worktree/branch.

### Task 1: Gate on the Receipt and Create the Isolated Worktree

**Files:**
- Read in main checkout: `docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md`
- Read in main checkout: `docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md`
- Create outside repositories: `C:\Users\hugefiver\AppData\Local\Temp\opencode\ocmm-gpt56-simplification-baseline\**`
- Create worktree: `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

**Interfaces:**
- Consumes: a passing receipt for this exact plan revision, approved design through `Repository Safety`, any current non-overlapping main-checkout dirt, and the existing worktree registry.
- Produces: immutable main HEAD/full-porcelain/index-entry/regular-file-SHA-256/worktree-list evidence, a proven disjoint 54-path task scope, and an isolated `feat/gpt-5-6-prompt-simplification` worktree at the captured `master` commit.

- [ ] **Step 1: Confirm the current-revision review receipt and re-read the design**

Before any command, confirm the orchestrator has recorded a passing receipt whose reviewed artifact hash/revision is this current plan. Then use the file-reading tool on:

```text
C:\Users\hugefiver\source\ocmm\docs\superpowers\specs\2026-07-19-gpt-5-6-prompt-simplification-design.md
```

Expected: the read reaches `## Repository Safety`, authorizes the sibling worktree/commit/fast-forward flow, and leaves no unresolved design choice. If the receipt is absent or stale, stop before creating any worktree.

- [ ] **Step 2: Capture the complete dynamic main-checkout baseline and prove task-scope disjointness**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$tempParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent)) { throw "Approved temp parent is missing: $tempParent" }
$baseline = Join-Path $tempParent "ocmm-gpt56-simplification-baseline"
if (Test-Path -LiteralPath $baseline) { throw "Baseline already exists: $baseline" }
New-Item -ItemType Directory -Path $baseline | Out-Null
$branchBeforeCapture = (git -C $main branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "pre-capture main branch query failed with exit $LASTEXITCODE" }
if ($branchBeforeCapture -ne "master") { throw "Expected main checkout on master, got $branchBeforeCapture" }
$headBeforeCapture = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "pre-capture main HEAD query failed with exit $LASTEXITCODE" }

$safetyHelper = Join-Path $baseline "main-safety.mjs"
@'
import { createHash } from "node:crypto"
import { lstatSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"

const [mode, main, snapshotPath] = process.argv.slice(2)
if (!mode || !main || !snapshotPath) throw new Error("usage: node main-safety.mjs <capture|verify|verify-without-task-artifacts> <main> <snapshot>")

const taskArtifacts = [
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md",
]
const agentNames = [
  "dw-builder", "dw-clarifier", "dw-code-search", "dw-coding", "dw-complex", "dw-creative",
  "dw-deep", "dw-doc-search", "dw-documenting", "dw-explore", "dw-frontend", "dw-hard-reasoning",
  "dw-media-reader", "dw-normal-task", "dw-oracle", "dw-oracle-2nd", "dw-orchestrator",
  "dw-plan-critic", "dw-planner", "dw-quick", "dw-research", "dw-reviewer",
]
const taskImplementationPaths = [
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
   "prompts/codex/deepwork/gpt-5.6.md",
   "src/intent/prompt-loader.test.ts",
   "src/hooks/config.category.test.ts",
   "src/codex/plugin-generator.test.ts",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
]
const generatedPaths = agentNames.flatMap((name) => [
  `.codex/agents/${name}.toml`,
  `plugins/deepwork/agents/${name}.toml`,
])
const featurePaths = [...taskImplementationPaths, ...taskArtifacts, ...generatedPaths].sort()
const generatedRoots = [".agents/plugins/marketplace.json", ".codex/agents", "plugins/deepwork"]
if (featurePaths.length !== 54) throw new Error(`expected 54 feature paths, got ${featurePaths.length}`)

function git(args) {
  const result = spawnSync("git", ["-C", main, ...args], { encoding: null, windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit ${result.status}: ${result.stderr.toString("utf8")}`)
  }
  return result.stdout
}

function statusBuffer(pathspec = []) {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all", ...(pathspec.length ? ["--", ...pathspec] : [])])
}

function parseStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0")
  if (fields.at(-1) === "") fields.pop()
  const entries = []
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index]
    if (record.length < 4 || record[2] !== " ") throw new Error(`unexpected porcelain-v1 record: ${JSON.stringify(record)}`)
    const code = record.slice(0, 2)
    const path = record.slice(3)
    const hasOriginalPath = code.includes("R") || code.includes("C")
    const originalPath = hasOriginalPath ? fields[++index] : null
    if (hasOriginalPath && originalPath === undefined) throw new Error(`rename/copy record is missing its original path: ${path}`)
    entries.push({
      code,
      path,
      originalPath,
      indexCode: code[0],
      worktreeCode: code[1],
      staged: code[0] !== " " && code[0] !== "?",
      unstaged: code[1] !== " " && code[1] !== "?",
      untracked: code === "??",
    })
  }
  return entries
}

function safeAbsolute(relative) {
  const root = resolve(main)
  const absolute = resolve(root, relative)
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error(`dirty path escapes repository: ${relative}`)
  return absolute
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase()
}

function snapshot({ requireTaskArtifacts }) {
  const rawStatus = statusBuffer()
  const entries = parseStatus(rawStatus)
  const dirtyPaths = [...new Set(entries.flatMap((entry) => [entry.path, entry.originalPath].filter(Boolean)))].sort()
  const taskSet = new Set(taskArtifacts)
  const featureSet = new Set(featurePaths)

  if (requireTaskArtifacts) {
    for (const taskArtifact of taskArtifacts) {
      const matches = entries.filter((entry) => entry.path === taskArtifact && entry.originalPath === null)
      if (matches.length !== 1 || matches[0].code !== "??") {
        throw new Error(`task artifact must be one same-name untracked copy: ${taskArtifact}`)
      }
    }
  } else {
    const dirtyTaskArtifacts = dirtyPaths.filter((path) => taskSet.has(path))
    if (dirtyTaskArtifacts.length) throw new Error(`task artifacts still appear dirty after deletion/integration: ${dirtyTaskArtifacts.join(", ")}`)
  }

  const concurrentPaths = dirtyPaths.filter((path) => !taskSet.has(path)).sort()
  const overlap = concurrentPaths.filter((path) => featureSet.has(path))
  if (overlap.length) throw new Error(`concurrent dirty paths overlap the feature allowlist: ${overlap.join(", ")}`)

  const generatedStatus = parseStatus(statusBuffer(generatedRoots))
  if (generatedStatus.length) {
    throw new Error(`tracked generated roots are dirty: ${generatedStatus.map((entry) => `${entry.code} ${entry.path}`).join(", ")}`)
  }

  const files = dirtyPaths.map((relative) => {
    const absolute = safeAbsolute(relative)
    let exists = false
    let regular = false
    let digest = null
    try {
      const stat = lstatSync(absolute)
      exists = true
      regular = stat.isFile()
      if (regular) digest = sha256(absolute)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
    const indexEntry = git(["ls-files", "--stage", "--", relative]).toString("utf8").trimEnd()
    return { path: relative, exists, regular, sha256: digest, indexEntry, taskArtifact: taskSet.has(relative) }
  })

  return {
    statusBase64: rawStatus.toString("base64"),
    statusSha256: createHash("sha256").update(rawStatus).digest("hex").toUpperCase(),
    entries,
    files,
    concurrentPaths,
    taskArtifacts,
    featurePaths,
  }
}

function comparable(value, omitTaskArtifacts) {
  const taskSet = new Set(taskArtifacts)
  return {
    entries: value.entries.filter((entry) => !omitTaskArtifacts || (!taskSet.has(entry.path) && !taskSet.has(entry.originalPath))),
    files: value.files.filter((file) => !omitTaskArtifacts || !taskSet.has(file.path)),
    concurrentPaths: value.concurrentPaths,
    featurePaths: value.featurePaths,
  }
}

if (mode === "capture") {
  const value = snapshot({ requireTaskArtifacts: true })
  writeFileSync(snapshotPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  writeFileSync(snapshotPath.replace(/\.json$/, ".porcelain-v1.bin"), Buffer.from(value.statusBase64, "base64"))
  console.log(`captured ${value.entries.length} porcelain entries across ${value.files.length} dirty paths; ${value.concurrentPaths.length} are concurrent non-task paths`)
} else if (mode === "verify" || mode === "verify-without-task-artifacts") {
  const omitTaskArtifacts = mode === "verify-without-task-artifacts"
  const expected = JSON.parse(readFileSync(snapshotPath, "utf8"))
  const actual = snapshot({ requireTaskArtifacts: !omitTaskArtifacts })
  if (!omitTaskArtifacts && actual.statusBase64 !== expected.statusBase64) throw new Error("complete main porcelain status changed from baseline")
  if (JSON.stringify(comparable(actual, omitTaskArtifacts)) !== JSON.stringify(comparable(expected, omitTaskArtifacts))) {
    throw new Error(`main dirty paths, porcelain codes, index entries, or regular-file SHA-256 values changed (${mode})`)
  }
  console.log(`${mode}: concurrent main dirty state is byte-for-byte and status-for-status unchanged`)
} else {
  throw new Error(`unknown mode: ${mode}`)
}
'@ | Set-Content -LiteralPath $safetyHelper -Encoding utf8

$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
node $safetyHelper capture $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "dynamic main-safety capture failed with exit $LASTEXITCODE" }

$mainBranch = (git -C $main branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "main branch query failed with exit $LASTEXITCODE" }
if ($mainBranch -ne "master") { throw "Expected main checkout on master, got $mainBranch" }
$baseCommit = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "main HEAD query failed with exit $LASTEXITCODE" }
if ($mainBranch -ne $branchBeforeCapture -or $baseCommit -ne $headBeforeCapture) { throw "Main branch or HEAD changed during dynamic baseline capture" }
$baseCommit | Set-Content -LiteralPath (Join-Path $baseline "base-commit.txt") -Encoding ascii

$gitDir = (git -C $main rev-parse --git-dir).Trim()
if ($LASTEXITCODE -ne 0) { throw "git-dir query failed with exit $LASTEXITCODE" }
$commonDir = (git -C $main rev-parse --git-common-dir).Trim()
if ($LASTEXITCODE -ne 0) { throw "git-common-dir query failed with exit $LASTEXITCODE" }
if ($gitDir -ne ".git" -or $commonDir -ne ".git") { throw "Main checkout is unexpectedly a linked worktree: gitDir=$gitDir commonDir=$commonDir" }

git -C $main worktree list --porcelain | Tee-Object -FilePath (Join-Path $baseline "worktrees-before.txt")
if ($LASTEXITCODE -ne 0) { throw "worktree inventory failed with exit $LASTEXITCODE" }
$inventory = Get-Content -LiteralPath (Join-Path $baseline "worktrees-before.txt") -Raw
$mainPrefixes = @("worktree $main", "worktree $($main.Replace('\', '/'))")
$unrelatedBlocks = @(
  $inventory -split "(?:\r?\n){2,}" | Where-Object {
    $block = $_.Trim()
    $block.Length -gt 0 -and -not ($mainPrefixes | Where-Object { $block.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })
  }
)
if ($unrelatedBlocks.Count -lt 1) { throw "Expected at least one pre-existing unrelated worktree block" }
($unrelatedBlocks -join "`n`n") | Set-Content -LiteralPath (Join-Path $baseline "unrelated-worktrees-before.txt") -Encoding utf8
```

Expected: the current concurrent tracked/untracked changes are accepted and captured dynamically, including exact staged/unstaged porcelain codes, tracked index entries, and SHA-256 for every existing dirty regular file. The task spec/plan are the only allowed dirty task paths, all other dirty paths are disjoint from the 54 feature paths, generated roots are clean, the main checkout is not linked, and the unrelated prunable worktree is only recorded—not modified. No future execution assumes a fixed dirty-path list.

- [ ] **Step 3: Verify the target path, branch, parent, and dependency source are safe**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$branch = "feat/gpt-5-6-prompt-simplification"
$parent = Split-Path -Parent $worktree
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "Worktree parent is missing: $parent" }
if (Test-Path -LiteralPath $worktree) { throw "Worktree target already exists: $worktree" }
if (-not (Test-Path -LiteralPath (Join-Path $main "node_modules") -PathType Container)) { throw "Main node_modules is missing" }
git -C $main show-ref --verify --quiet "refs/heads/$branch"
$branchExit = $LASTEXITCODE
if ($branchExit -eq 0) { throw "Feature branch already exists: $branch" }
if ($branchExit -ne 1) { throw "Feature-branch preflight failed with exit $branchExit" }
```

Expected: parent and main `node_modules` exist; target path and feature branch do not.

- [ ] **Step 4: Create the feature branch and sibling worktree**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$branch = "feat/gpt-5-6-prompt-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$baseCommit = (Get-Content -LiteralPath (Join-Path $baseline "base-commit.txt") -Raw).Trim()
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
$currentHead = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "immediate pre-add HEAD query failed with exit $LASTEXITCODE" }
if ($currentHead -ne $baseCommit) { throw "Main HEAD changed before worktree add" }
$currentBranch = (git -C $main branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "immediate pre-add branch query failed with exit $LASTEXITCODE" }
if ($currentBranch -ne "master") { throw "Main checkout left master before worktree add" }
node $safetyHelper verify $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state changed before worktree add" }
git -C $main worktree add -b $branch $worktree $baseCommit
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed with exit $LASTEXITCODE" }
node $safetyHelper verify $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state changed during worktree add" }
```

Expected: with the captured dirty main state still present, Git creates the feature branch explicitly from the captured `master` HEAD, checks it out only at the sibling path, and leaves every main dirty file, index entry, staged/unstaged code, and SHA-256 unchanged. Main-checkout cleanliness is neither required nor attempted.

- [ ] **Step 5: Verify worktree identity and preserve the unrelated worktree inventory**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$baseCommit = (Get-Content -LiteralPath (Join-Path $baseline "base-commit.txt") -Raw).Trim()
$worktreeCommit = (git -C $worktree rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "worktree HEAD query failed with exit $LASTEXITCODE" }
if ($worktreeCommit -ne $baseCommit) { throw "Worktree started at $worktreeCommit instead of $baseCommit" }
$worktreeBranch = (git -C $worktree branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "worktree branch query failed with exit $LASTEXITCODE" }
if ($worktreeBranch -ne "feat/gpt-5-6-prompt-simplification") { throw "Unexpected worktree branch: $worktreeBranch" }
$worktreeStatus = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "new worktree status failed with exit $LASTEXITCODE" }
if ($worktreeStatus.Count -ne 0) { $worktreeStatus; throw "New worktree is not clean" }
git -C $main worktree list --porcelain | Tee-Object -FilePath (Join-Path $baseline "worktrees-after-add.txt")
if ($LASTEXITCODE -ne 0) { throw "post-add worktree inventory failed with exit $LASTEXITCODE" }
$worktreeInventoryPath = $worktree.Replace('\', '/')
$worktreeFound =
  (Select-String -LiteralPath (Join-Path $baseline "worktrees-after-add.txt") -SimpleMatch $worktree -Quiet) -or
  (Select-String -LiteralPath (Join-Path $baseline "worktrees-after-add.txt") -SimpleMatch $worktreeInventoryPath -Quiet)
if (-not $worktreeFound) { throw "New worktree is absent from inventory" }
$afterInventory = Get-Content -LiteralPath (Join-Path $baseline "worktrees-after-add.txt") -Raw
$excludedPrefixes = @(
  "worktree $main", "worktree $($main.Replace('\', '/'))",
  "worktree $worktree", "worktree $($worktree.Replace('\', '/'))"
)
$afterUnrelated = @(
  $afterInventory -split "(?:\r?\n){2,}" | Where-Object {
    $block = $_.Trim()
    $block.Length -gt 0 -and -not ($excludedPrefixes | Where-Object { $block.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })
  }
) -join "`n`n"
$beforeUnrelated = (Get-Content -LiteralPath (Join-Path $baseline "unrelated-worktrees-before.txt") -Raw).Trim()
if ($afterUnrelated.Trim() -ne $beforeUnrelated) { throw "An unrelated worktree inventory block changed during worktree add" }
```

Expected: feature worktree is clean at the recorded baseline commit; the inventory differs only by addition of this worktree, and no prune/remove operation has run.

### Task 2: Copy Task Artifacts, Attach Dependencies, and Prove a Green Baseline

**Files:**
- Copy, then permit evidence-only corrections: `docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md`
- Copy, then permit execution-discovery corrections: `docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md`
- Create junction: `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification\node_modules`

**Interfaces:**
- Consumes: isolated clean worktree, two main-checkout task artifacts, existing main `node_modules`.
- Produces: exactly two untracked task artifacts in the worktree, a verified dependency junction, green baseline typecheck/non-config/Rust tests, an exact 24-failure complete-TypeScript baseline, original prompt-length evidence, and no change to the dynamically captured concurrent main state.

- [ ] **Step 1: Copy only this task's spec and plan into the worktree**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$branch = "feat/gpt-5-6-prompt-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$taskArtifacts = @(
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$snapshot = Get-Content -LiteralPath (Join-Path $baseline "main-safety-baseline.json") -Raw | ConvertFrom-Json
$recordedTaskHashes = @{}
foreach ($record in @($snapshot.files | Where-Object { $_.taskArtifact })) {
  if (-not $record.regular -or -not $record.sha256) { throw "Task artifact was not captured as a regular file: $($record.path)" }
  $recordedTaskHashes[$record.path] = $record.sha256
}
if ($recordedTaskHashes.Count -ne 2) { throw "Expected two captured task-artifact hashes, got $($recordedTaskHashes.Count)" }
foreach ($relative in $taskArtifacts) {
  $source = Join-Path $main $relative
  $destination = Join-Path $worktree $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Task artifact missing: $source" }
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $recordedTaskHashes[$relative]) { throw "Main task artifact changed after receipt: $relative" }
  if (Test-Path -LiteralPath $destination) { throw "Worktree task artifact already exists: $destination" }
  $destinationParent = Split-Path -Parent $destination
  if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) { throw "Tracked destination parent missing: $destinationParent" }
  Copy-Item -LiteralPath $source -Destination $destination
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) { throw "Copied artifact differs: $relative" }
}
```

Expected: only the current task's spec and plan are copied byte-for-byte; every dynamically captured concurrent path remains solely in the main checkout and is not read as a copy source.

- [ ] **Step 2: Create and verify the `node_modules` directory junction**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$mainModules = "C:\Users\hugefiver\source\ocmm\node_modules"
$worktreeModules = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification\node_modules"
if (-not (Test-Path -LiteralPath $mainModules -PathType Container)) { throw "Main node_modules is missing: $mainModules" }
if (Test-Path -LiteralPath $worktreeModules) { throw "Worktree node_modules already exists: $worktreeModules" }
New-Item -ItemType Junction -Path $worktreeModules -Target $mainModules | Out-Null
$junction = Get-Item -LiteralPath $worktreeModules -Force
if ($junction.LinkType -ne "Junction") { throw "Worktree node_modules is not a junction" }
$resolvedTarget = [IO.Path]::GetFullPath([string]$junction.Target)
if ($resolvedTarget -ne [IO.Path]::GetFullPath($mainModules)) { throw "Junction target mismatch: $resolvedTarget" }
```

Expected: worktree `node_modules` resolves to the main checkout's existing dependency tree. Do not run `pnpm install`.

- [ ] **Step 3: Verify the isolated pre-edit status contains only the two task artifacts**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$expected = @(
  "?? docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md",
  "?? docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md"
) | Sort-Object
$actual = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "worktree baseline status failed with exit $LASTEXITCODE" }
$comparison = @(Compare-Object -ReferenceObject $expected -DifferenceObject @($actual | Sort-Object))
if ($comparison.Count -ne 0) { $comparison; throw "Worktree baseline contains unexpected paths" }
```

Expected: no tracked delta, no copied unrelated document, and no visible `node_modules` entry.

- [ ] **Step 4: Run baseline strict typechecking**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
node C:\Users\hugefiver\source\ocmm\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { throw "baseline typecheck failed with exit $LASTEXITCODE" }
```

Expected: the main checkout's existing TypeScript binary runs `tsc -p tsconfig.json --noEmit` and exits 0. Any failure is a hard stop before implementation.

- [ ] **Step 5: Establish the complete TypeScript baseline and run non-config/Rust tests**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$allTests = @(Get-ChildItem -LiteralPath src -Recurse -Filter *.test.ts | ForEach-Object FullName)
$nonConfigTests = @($allTests | Where-Object { $_ -notmatch '[\\/]src[\\/]config[\\/](load|profiles)\.test\.ts$' })
node --test --experimental-strip-types --test-reporter=spec $nonConfigTests
if ($LASTEXITCODE -ne 0) { throw "baseline non-config TypeScript tests failed with exit $LASTEXITCODE" }
cargo test -p ocmm-lsp
if ($LASTEXITCODE -ne 0) { throw "baseline Rust tests failed with exit $LASTEXITCODE" }
$completeOutput = @(node --test --experimental-strip-types --test-reporter=spec $allTests 2>&1)
$completeExit = $LASTEXITCODE
$completeText = $completeOutput -join "`n"
if ($completeExit -eq 0) { throw "complete TypeScript suite unexpectedly passed; expected the captured 24-failure baseline" }
if ($completeText -notmatch '# fail 24' -or $completeText -notmatch 'src[\\/]config[\\/]load\.test\.ts' -or $completeText -notmatch 'src[\\/]config[\\/]profiles\.test\.ts') {
  $completeOutput
  throw "complete TypeScript suite does not match the captured 24-failure config baseline"
}
```

Expected: every non-config TypeScript test and `cargo test -p ocmm-lsp` pass. The complete TypeScript suite reports exactly 24 failures, all in `src/config/load.test.ts` and `src/config/profiles.test.ts`; any different count or source is a hard stop before implementation.

- [ ] **Step 6: Verify exact pre-change prompt lengths in the worktree**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
node -e "const fs=require('node:fs'); const expected={omo:6742,v1:6794,codex:6799}; for (const [workflow,length] of Object.entries(expected)) { const path='prompts/'+workflow+'/deepwork/gpt-5.6.md'; const actual=fs.readFileSync(path,'utf8').length; if (actual!==length) throw new Error(path+' expected '+length+' chars, got '+actual); console.log(path+': '+actual); }"
if ($LASTEXITCODE -ne 0) { throw "GPT-5.6 baseline length check failed with exit $LASTEXITCODE" }
```

Expected:

```text
prompts/omo/deepwork/gpt-5.6.md: 6742
prompts/v1/deepwork/gpt-5.6.md: 6794
prompts/codex/deepwork/gpt-5.6.md: 6799
```

### Task 3: RED — Specify Additive Source and Effective-Prompt Contracts

**Files:**
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `src/hooks/config.category.test.ts`
- Inspect only: `prompts/{omo,v1,codex}/deepwork/{gpt,planner}.md`
- Inspect only: `prompts/{omo,v1,codex}/category/coding.md`

**Interfaces:**
- Consumes: current loader getters, existing base/planner/category prompt doctrine, original length constants, approved four-section contract.
- Produces: failing tests for source size/doctrine/synchronization/no-duplication and effective gpt/planner/category composition.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Add GPT-5.6 test constants and composition helpers**

Insert after `makeTempRoot()`:

```ts
const GPT56_WORKFLOWS = ["omo", "v1", "codex"] as const
type Gpt56Workflow = (typeof GPT56_WORKFLOWS)[number]

const GPT56_BASELINE_CHARS: Record<Gpt56Workflow, number> = {
  omo: 6742,
  v1: 6794,
  codex: 6799,
}

const REMOVED_GPT56_SECTION_HEADINGS = [
  "## Shell Adaptation",
  "## Discovery Before Planning",
  "## Planner Trigger",
  "## Answer-When-Answerable",
  "## Scope",
  "## Workflow-role composition",
] as const

function effectiveGpt56Prompt(base: "gpt" | "planner"): string {
  return `${getDeepworkPrompt(base)}\n\n---\n\n${getDeepworkPrompt("gpt-5.6")}`
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function sharedGpt56Doctrine(text: string): string {
  const start = text.indexOf("## Outcome-first execution")
  assert.notEqual(start, -1, "missing shared GPT-5.6 doctrine start")
  const closingTag = text.indexOf("</deepwork-mode>", start)
  return text.slice(start, closingTag === -1 ? undefined : closingTag).trim()
}
```

- [ ] **Step 2: Make the shell test inspect the effective GPT-5.6 prompt**

Replace the deepwork-variant loop inside `real workflows include shell adaptation in every effective prompt path` with:

```ts
    for (const variant of ["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"] as const) {
      const prompt = variant === "gpt-5.6"
        ? effectiveGpt56Prompt("gpt")
        : getDeepworkPrompt(variant)
      assert.match(prompt, /## Shell Adaptation/, `${workflow}/${variant} missing effective shell adaptation`)
    }
```

Expected: shell adaptation remains an effective-path invariant without forcing a copy into the specialization.

- [ ] **Step 3: Replace the flat-ownership specialization assertions**

Replace the complete `planner and GPT-5.6 prompts keep delegation and review ownership flat` test with:

```ts
test("planner owns flat review composition while GPT-5.6 keeps only the delegation threshold", () => {
  const root = join(process.cwd(), "prompts")
  try {
    for (const workflow of GPT56_WORKFLOWS) {
      loadAllPrompts(root, workflow)
      const planner = getAgentPrompt("planner")
      assert.match(planner, /Use direct tools first/)
      assert.match(planner, /Return the completed plan to the orchestrator/)
      assert.match(planner, /exactly (?:the )?unsuffixed `reviewer` at most once.*concrete blocking architecture, security, or performance decision/i)
      assert.match(planner, /Do not dispatch `plan-critic`, any Reviewer tier \(`reviewer-low`, `reviewer-high`, `reviewer-max`\), or any Oracle profile \(`oracle`, `oracle-2nd`, configured `oracle-3rd`…`oracle-9th`, and their `low`\/`high`\/`max` tier variants\)/)

      const specialization = getDeepworkPrompt("gpt-5.6")
      const effective = effectiveGpt56Prompt("gpt")
      assert.match(effective, /Multiple steps, routine confirmation, or (?:a desire for|wanting) another opinion are insufficient reasons to delegate/i)
      assert.match(effective, /effective role\/delegation contract permits it/i)
      assert.doesNotMatch(specialization, /Utility leaf agents never dispatch/)
      assert.doesNotMatch(specialization, /Read-only workflow agents never call `quick`/)
      assert.doesNotMatch(specialization, /Formal planner dispatch, the `plan-critic` loop, review dispatch, and final acceptance review remain orchestrator-owned/)
      assert.doesNotMatch(specialization, /\| Current role \| Allowed nested work \|/)
    }
  } finally {
    loadAllPrompts(root, "omo")
  }
})
```

- [ ] **Step 4: Replace direct specialization checks with effective composition checks**

Replace the complete `real deepwork prompts contain ocmm-native workflow semantics per variant` test with:

```ts
test("real effective deepwork prompts retain ocmm-native workflow semantics per variant", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of GPT56_WORKFLOWS) {
    loadAllPrompts(root, workflow)
    for (const variant of ["default", "gpt", "gpt-5.6", "gemini", "glm", "codex", "planner"] as const) {
      const specialization = getDeepworkPrompt("gpt-5.6")
      const prompt = variant === "gpt-5.6"
        ? effectiveGpt56Prompt("gpt")
        : getDeepworkPrompt(variant)
      const label = `${workflow}/${variant}`

      assert.match(
        prompt,
        /discovery.{0,120}(before|precede).{0,80}decomposition|first discovery wave/i,
        `${label} missing discovery-before-planning semantics`,
      )
      assert.match(
        prompt,
        /relatively complex|clear purpose|unclear boundaries|lightweight contextual plan/i,
        `${label} missing planner-trigger semantics`,
      )
      if (variant !== "planner") {
        assert.match(
          prompt,
          /answer[- ]when[- ]answerable|answer when you have enough evidence|stop and answer/i,
          `${label} missing answer-when-answerable semantics`,
        )
        assert.match(prompt, /\[product\]/i, `${label} missing [product] review label`)
        assert.match(prompt, /\[evidence\]/i, `${label} missing [evidence] review label`)
      }
      assert.match(
        prompt,
        /full requested outcome|deliver exactly what was asked|requested outcome/i,
        `${label} missing full-request scope semantics`,
      )
      assert.doesNotMatch(
        prompt,
        /(?<!not\s)default\s+(?:to\s+)?(?:a\s+)?(?:minimum viable|MVP|phase-1)/i,
        `${label} contains default scope reduction language`,
      )
      assert.ok(prompt.includes("## Shell Adaptation"), `${label} missing effective shell adaptation`)

      if (variant === "gpt-5.6") {
        assert.match(specialization, /GPT-5\.6 EXECUTION CALIBRATION/)
        assert.match(specialization, /Delegate only when.*materially improves completion/is)
        assert.equal(countOccurrences(prompt, "## Discovery Before Planning"), 1, `${label} duplicates discovery doctrine`)
        assert.equal(countOccurrences(prompt, "## Planner Trigger"), 1, `${label} duplicates planner doctrine`)
        assert.equal(countOccurrences(prompt, "## Answer-When-Answerable"), 1, `${label} duplicates answer doctrine`)
        assert.equal(countOccurrences(prompt, "## Shell Adaptation"), 1, `${label} duplicates shell doctrine`)
      } else {
        assert.doesNotMatch(
          prompt,
          /GPT-5\.6-only|speculative nested delegation|subagent depth limit/i,
          `${label} incorrectly contains GPT-5.6-only restraint`,
        )
      }
    }
  }
})
```

- [ ] **Step 5: Add planner/category effective-path coverage**

Add immediately after the effective-variant test:

```ts
test("GPT-5.6 planner and category paths retain their base doctrine", () => {
  const root = join(process.cwd(), "prompts")
  for (const workflow of GPT56_WORKFLOWS) {
    loadAllPrompts(root, workflow)
    const specialization = getDeepworkPrompt("gpt-5.6")
    const planner = effectiveGpt56Prompt("planner")
    const category = `${getCategoryPrompt("coding")}\n\n---\n\n${specialization}`

    assert.match(planner, /# Deepwork Planner Injection/, `${workflow}/planner role doctrine`)
    assert.match(planner, /first discovery wave/i, `${workflow}/planner discovery doctrine`)
    assert.match(planner, /## Shell Adaptation/, `${workflow}/planner shell doctrine`)
    assert.match(planner, /## Outcome-first execution/, `${workflow}/planner GPT-5.6 calibration`)
    assert.equal(countOccurrences(planner, "## Shell Adaptation"), 1, `${workflow}/planner duplicate shell doctrine`)

    assert.ok(getCategoryPrompt("coding").length > 0, `${workflow}/coding role missing`)
    assert.match(category, /## Shell Adaptation/, `${workflow}/coding shell doctrine`)
    assert.match(category, /## Outcome-first execution/, `${workflow}/coding GPT-5.6 calibration`)
    assert.equal(countOccurrences(category, "## Shell Adaptation"), 1, `${workflow}/coding duplicate shell doctrine`)
  }
})
```

- [ ] **Step 6: Add the effective category assertion in `src/hooks/config.category.test.ts`**

Add the required effective-category assertion to the existing category configuration coverage. It must exercise the assembled GPT-5.6 category prompt rather than a raw specialization file, prove the category retains its inherited doctrine and the GPT-5.6 calibration, and reject a duplicate `## Shell Adaptation` heading. This test is authoritative because category composition is owned by `src/hooks/config.category.test.ts`.

- [ ] **Step 7: Replace the question-threshold test and add doctrine/size/no-duplication coverage**

Replace the complete `GPT-5.6 prompts proceed under clear facts and ask only deliverable-changing questions` test, then append the compact-calibration test:

```ts
test("GPT-5.6 prompts proceed under clear facts and ask only material questions", () => {
  for (const workflow of GPT56_WORKFLOWS) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "deepwork", "gpt-5.6.md"), "utf8")
    assert.match(text, /When facts are clear, answer or proceed directly/i, workflow)
    assert.match(text, /otherwise state a safe assumption and continue/i, workflow)
    assert.match(text, /choice changes the deliverable/i, workflow)
    assert.match(text, /required information.*unavailable.*tools/i, workflow)
    assert.match(text, /action is destructive/i, workflow)
    assert.match(text, /material rework/i, workflow)
  }
})

test("GPT-5.6 specializations are compact additive calibrations synchronized across workflows", () => {
  const shared = new Map<Gpt56Workflow, string>()

  for (const workflow of GPT56_WORKFLOWS) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "deepwork", "gpt-5.6.md"), "utf8")
    const label = `${workflow}/gpt-5.6`
    assert.ok(text.length <= 3500, `${label} is ${text.length} characters; expected <= 3500`)
    assert.ok(
      text.length <= Math.floor(GPT56_BASELINE_CHARS[workflow] * 0.6),
      `${label} did not shrink by at least 40% from ${GPT56_BASELINE_CHARS[workflow]}`,
    )

    assert.match(text, /GPT-5\.6 supports native `max`/i, `${label} native max`)
    assert.match(text, /explicit user configuration.*authoritative/is, `${label} authority`)
    assert.match(text, /authorization.*verification policy.*delegation contract.*authoritative/is, `${label} authority chain`)
    assert.match(text, /concrete requested outcome.*observable completion condition/is, `${label} outcome`)
    assert.match(text, /Continue until.*required verification.*hold.*then stop/is, `${label} stopping rule`)
    assert.match(text, /Delegate only when.*effective role\/delegation contract permits it.*materially improves completion/is, `${label} delegation threshold`)
    assert.match(text, /Multiple steps, routine confirmation, or (?:a desire for|wanting) another opinion are insufficient reasons to delegate/i, `${label} anti-speculation threshold`)
    assert.match(text, /`GOAL`.*`STOP WHEN`.*`EVIDENCE`.*scope.*non-goals/is, `${label} bounded delegation`)
    assert.match(text, /suitable timeout.*completion signal/is, `${label} waiting`)
    assert.match(text, /do not repeatedly poll unchanged state|empty short-interval reads/i, `${label} polling restraint`)
    assert.match(text, /After two unchanged checks.*increase the wait|After two unchanged checks.*completion signal/is, `${label} backoff`)
    assert.match(text, /Rerun validation only when relevant inputs changed after the last green result/i, `${label} revalidation`)
    assert.match(text, /Lead with the outcome.*evidence.*residual risk.*unverified/is, `${label} reporting priority`)
    assert.match(text, /Do not infer permission to modify/i, `${label} authorization boundary`)

    for (const heading of REMOVED_GPT56_SECTION_HEADINGS) {
      assert.equal(text.includes(heading), false, `${label} duplicates ${heading}`)
    }
    assert.doesNotMatch(text, /\| Current role \| Allowed nested work \|/, `${label} contains role matrix`)
    assert.doesNotMatch(text, /Utility leaf agents never dispatch|Read-only workflow agents never call `quick`/, `${label} contains role allowlist`)
    assert.doesNotMatch(text, /\[product\]|\[evidence\]/i, `${label} duplicates review-label doctrine`)

    if (workflow === "omo") {
      assert.doesNotMatch(text, /^<deepwork-mode>/, `${label} must remain unwrapped`)
    } else {
      assert.match(text, /^<deepwork-mode>\s*/, `${label} opening wrapper`)
      assert.match(text, /<\/deepwork-mode>\s*$/, `${label} closing wrapper`)
    }
    if (workflow === "codex") {
      assert.match(text, /Codex profiles may carry this layer ahead of runtime model selection/i)
      assert.match(text, /embedded skills.*Codex tool-compatibility rules/is)
    }

    shared.set(workflow, sharedGpt56Doctrine(text))
  }

  assert.equal(shared.get("v1"), shared.get("omo"), "v1 shared doctrine drifted from omo")
  assert.equal(shared.get("codex"), shared.get("omo"), "Codex shared doctrine drifted from omo")
})
```

- [ ] **Step 8: Run the source and category contract tests in RED state**

```powershell
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED prompt-loader test unexpectedly passed" }
node --test --experimental-strip-types src/hooks/config.category.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED category configuration test unexpectedly passed" }
```

Expected: FAIL. The compact-calibration test reports `omo/gpt-5.6 is 6742 characters; expected <= 3500`; waiting/revalidation, absent-heading, and effective-category assertions also remain red against the old prompt.

### Task 4: RED — Specify Generated Codex Calibration

**Files:**
- Modify: `src/codex/plugin-generator.test.ts`
- Inspect only: `src/codex/plugin-generator.ts`

**Interfaces:**
- Consumes: `buildCodexAgents()` plain instructions, temp-generated raw TOML, the GPT-5.6 marker/envelope.
- Produces: failing assertions that inspect only the specialization segment for outcome, waiting/backoff, changed-input revalidation, reporting priority, and removed headings.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Add a generated-calibration extractor and removed-heading list**

Insert after `extractDelegationContract()`:

```ts
const REMOVED_GPT56_SECTION_HEADINGS = [
  "## Shell Adaptation",
  "## Discovery Before Planning",
  "## Planner Trigger",
  "## Answer-When-Answerable",
  "## Scope",
  "## Workflow-role composition",
] as const

function extractGpt56Calibration(instructions: string): string {
  const marker = "# GPT-5.6 EXECUTION CALIBRATION"
  const start = instructions.indexOf(marker)
  assert.notEqual(start, -1, "generated instructions are missing the GPT-5.6 calibration")
  const end = instructions.indexOf("</deepwork-mode>", start)
  assert.notEqual(end, -1, "generated GPT-5.6 calibration is missing its closing wrapper")
  return instructions.slice(start, end)
}

function assertCompactGpt56Calibration(instructions: string, label: string): void {
  const calibration = extractGpt56Calibration(instructions)
  assert.match(calibration, /concrete requested outcome.*observable completion condition/is, `${label} outcome`)
  assert.match(calibration, /suitable timeout.*completion signal/is, `${label} waiting`)
  assert.match(calibration, /After two unchanged checks.*increase the wait|After two unchanged checks.*completion signal/is, `${label} backoff`)
  assert.match(calibration, /Rerun validation only when relevant inputs changed after the last green result/i, `${label} revalidation`)
  assert.match(calibration, /Lead with the outcome.*evidence.*residual risk.*unverified/is, `${label} reporting priority`)
  for (const heading of REMOVED_GPT56_SECTION_HEADINGS) {
    assert.equal(calibration.includes(heading), false, `${label} duplicates ${heading}`)
  }
  assert.doesNotMatch(calibration, /\[product\]|\[evidence\]/i, `${label} duplicates review-label doctrine`)
}
```

The extractor starts at the specialization marker before checking removed headings because `gpt.md` legitimately retains shared headings in the complete generated profile.

- [ ] **Step 2: Replace the in-memory applicability assertion and assert the generated calibration**

In `Codex agents are generated from Deepwork prompts and Codex-compatible fallback models`, replace the old applicability assertion:

```ts
  assert.match(orchestrator.developerInstructions, /Apply this layer only when the selected model identifies as part of the GPT-5\.6 family/)
```

with the new ahead-of-runtime guard, then append the compact-calibration assertion:

```ts
  assert.match(
    orchestrator.developerInstructions,
    /Codex profiles may carry this layer ahead of runtime model selection; models outside the GPT-5\.6 family ignore it/,
  )
  assertCompactGpt56Calibration(orchestrator.developerInstructions, "in-memory orchestrator")
```

- [ ] **Step 3: Replace the stale generated-TOML assertion**

In `generateCodexPlugin writes a self-contained bundle`, replace both stale assertions:

```ts
    assert.match(orchestrator, /two independent waves add no useful evidence/)
    assert.match(orchestrator, /Apply this layer only when the selected model identifies as part of the GPT-5\.6 family/)
```

with:

```ts
    assertCompactGpt56Calibration(orchestrator, "generated orchestrator TOML")
    assert.match(
      orchestrator,
      /Codex profiles may carry this layer ahead of runtime model selection; models outside the GPT-5\.6 family ignore it/,
    )
```

Keep the adjacent `GPT-5.6 EXECUTION CALIBRATION` assertion.

- [ ] **Step 4: Run the generator contract test in RED state**

```powershell
node --test --experimental-strip-types src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED Codex generator test unexpectedly passed" }
```

Expected: FAIL with the `in-memory orchestrator outcome` or `waiting` assertion because the old specialization has no observable completion condition or bounded waiting doctrine.

### Task 5: GREEN — Replace the Three Specializations with the Approved Text

**Files:**
- Modify: `prompts/omo/deepwork/gpt-5.6.md`
- Modify: `prompts/v1/deepwork/gpt-5.6.md`
- Modify: `prompts/codex/deepwork/gpt-5.6.md`

**Interfaces:**
- Consumes: RED source/generated tests and the approved four-section prompt contract.
- Produces: three compact files with identical shared doctrine and environment-specific applicability/authority wrappers only.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Replace the omo specialization with this complete text**

```markdown
# GPT-5.6 EXECUTION CALIBRATION

Apply this layer only when the selected model belongs to the GPT-5.6 family. Concrete model or lane names are references only; the user's explicit configuration and current model catalog decide the actual model. GPT-5.6 supports native `max` reasoning effort; treat local `max` as a real GPT-5.6 level, not an alias for `xhigh`. The role prompt, explicit user configuration and authorization, Deepwork task tiers, available skills, local verification policy, and effective terminal delegation contract remain authoritative.

## Outcome-first execution

- For each non-trivial task, identify the concrete requested outcome and an observable completion condition before acting.
- Continue until that condition and required verification hold, then stop instead of adding process that does not change the result.
- Preserve the complete requested deliverable. Concision removes repetition and ceremony, not requested content, evidence, or artifacts.
- When facts are clear, answer or proceed directly. Ask only when a choice changes the deliverable, required information is unavailable through tools, the action is destructive, or proceeding risks material rework; otherwise state a safe assumption and continue.

## Retrieval and delegation

- Prefer direct tools, and stop retrieval when evidence is sufficient to act or answer.
- Delegate only when the effective role/delegation contract permits it and a bounded result materially improves completion.
- Multiple steps, routine confirmation, or a desire for another opinion are insufficient reasons to delegate.
- Every delegated task must state `GOAL`, `STOP WHEN`, `EVIDENCE`, scope, and non-goals. The parent verifies returned evidence instead of trusting a completion claim.

## Context-efficient waiting and validation

- Run long commands with a suitable timeout or use one completion signal; do not repeatedly poll unchanged state or issue empty short-interval reads.
- After two unchanged checks, increase the wait or switch to a completion signal.
- Rerun validation only when relevant inputs changed after the last green result; perform one appropriate final pass instead of repeating identical gates.

## Reporting priority

- Lead with the outcome, then evidence, residual risk, and any unverified item.
- For review work, retain the role-defined verdict or finding format.
- Trim process narration, request restatements, generic reassurance, and non-actionable commentary before trimming required facts or artifacts.
- Do not infer permission to modify from an explanation, research, diagnosis, review, or planning request.
```

- [ ] **Step 2: Replace the v1 specialization with this complete text**

```markdown
<deepwork-mode>

# GPT-5.6 EXECUTION CALIBRATION

Apply this layer only when the selected model belongs to the GPT-5.6 family. Concrete model or lane names are references only; the user's explicit configuration and current model catalog decide the actual model. GPT-5.6 supports native `max` reasoning effort; treat local `max` as a real GPT-5.6 level, not an alias for `xhigh`. The role prompt, explicit user configuration and authorization, Deepwork task tiers, injected skills, local verification policy, and effective terminal delegation contract remain authoritative.

## Outcome-first execution

- For each non-trivial task, identify the concrete requested outcome and an observable completion condition before acting.
- Continue until that condition and required verification hold, then stop instead of adding process that does not change the result.
- Preserve the complete requested deliverable. Concision removes repetition and ceremony, not requested content, evidence, or artifacts.
- When facts are clear, answer or proceed directly. Ask only when a choice changes the deliverable, required information is unavailable through tools, the action is destructive, or proceeding risks material rework; otherwise state a safe assumption and continue.

## Retrieval and delegation

- Prefer direct tools, and stop retrieval when evidence is sufficient to act or answer.
- Delegate only when the effective role/delegation contract permits it and a bounded result materially improves completion.
- Multiple steps, routine confirmation, or a desire for another opinion are insufficient reasons to delegate.
- Every delegated task must state `GOAL`, `STOP WHEN`, `EVIDENCE`, scope, and non-goals. The parent verifies returned evidence instead of trusting a completion claim.

## Context-efficient waiting and validation

- Run long commands with a suitable timeout or use one completion signal; do not repeatedly poll unchanged state or issue empty short-interval reads.
- After two unchanged checks, increase the wait or switch to a completion signal.
- Rerun validation only when relevant inputs changed after the last green result; perform one appropriate final pass instead of repeating identical gates.

## Reporting priority

- Lead with the outcome, then evidence, residual risk, and any unverified item.
- For review work, retain the role-defined verdict or finding format.
- Trim process narration, request restatements, generic reassurance, and non-actionable commentary before trimming required facts or artifacts.
- Do not infer permission to modify from an explanation, research, diagnosis, review, or planning request.

</deepwork-mode>
```

- [ ] **Step 3: Replace the Codex specialization with this complete text**

```markdown
<deepwork-mode>

# GPT-5.6 EXECUTION CALIBRATION

Codex profiles may carry this layer ahead of runtime model selection; models outside the GPT-5.6 family ignore it. Concrete model or lane names are references only; the user's explicit configuration and current model catalog decide the actual model. GPT-5.6 supports native `max` reasoning effort; treat local `max` as a real GPT-5.6 level, not an alias for `xhigh`. The role prompt, explicit user configuration and authorization, Deepwork task tiers, embedded skills, local verification policy, Codex tool-compatibility rules, and effective terminal delegation contract remain authoritative.

## Outcome-first execution

- For each non-trivial task, identify the concrete requested outcome and an observable completion condition before acting.
- Continue until that condition and required verification hold, then stop instead of adding process that does not change the result.
- Preserve the complete requested deliverable. Concision removes repetition and ceremony, not requested content, evidence, or artifacts.
- When facts are clear, answer or proceed directly. Ask only when a choice changes the deliverable, required information is unavailable through tools, the action is destructive, or proceeding risks material rework; otherwise state a safe assumption and continue.

## Retrieval and delegation

- Prefer direct tools, and stop retrieval when evidence is sufficient to act or answer.
- Delegate only when the effective role/delegation contract permits it and a bounded result materially improves completion.
- Multiple steps, routine confirmation, or a desire for another opinion are insufficient reasons to delegate.
- Every delegated task must state `GOAL`, `STOP WHEN`, `EVIDENCE`, scope, and non-goals. The parent verifies returned evidence instead of trusting a completion claim.

## Context-efficient waiting and validation

- Run long commands with a suitable timeout or use one completion signal; do not repeatedly poll unchanged state or issue empty short-interval reads.
- After two unchanged checks, increase the wait or switch to a completion signal.
- Rerun validation only when relevant inputs changed after the last green result; perform one appropriate final pass instead of repeating identical gates.

## Reporting priority

- Lead with the outcome, then evidence, residual risk, and any unverified item.
- For review work, retain the role-defined verdict or finding format.
- Trim process narration, request restatements, generic reassurance, and non-actionable commentary before trimming required facts or artifacts.
- Do not infer permission to modify from an explanation, research, diagnosis, review, or planning request.

</deepwork-mode>
```

- [ ] **Step 4: Measure the three prompt files before running tests**

```powershell
node -e "const fs=require('node:fs'); const baseline={omo:6742,v1:6794,codex:6799}; for (const [workflow,oldLength] of Object.entries(baseline)) { const path='prompts/'+workflow+'/deepwork/gpt-5.6.md'; const text=fs.readFileSync(path,'utf8'); const reduction=1-text.length/oldLength; if (text.length>3500) throw new Error(path+' exceeds 3500: '+text.length); if (reduction<0.4) throw new Error(path+' reduction is '+(reduction*100).toFixed(2)+'%'); console.log(path+': '+text.length+' chars; reduction='+(reduction*100).toFixed(2)+'%'); }"
if ($LASTEXITCODE -ne 0) { throw "GPT-5.6 size/reduction check failed with exit $LASTEXITCODE" }
```

Expected: all three lengths are below 3,500 and every reduction is greater than 40%.

- [ ] **Step 5: Run all targeted test files in GREEN state**

```powershell
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "prompt-loader tests failed with exit $LASTEXITCODE" }
node --test --experimental-strip-types src/hooks/config.category.test.ts
if ($LASTEXITCODE -ne 0) { throw "category configuration tests failed with exit $LASTEXITCODE" }
node --test --experimental-strip-types src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "Codex generator tests failed with exit $LASTEXITCODE" }
```

Expected: all three files PASS; the category test confirms effective composition, and generated-profile tests find waiting/revalidation/outcome guidance and find none of the removed headings inside the extracted GPT-5.6 segment.

### Task 6: Synchronize omo, v1, and Codex Maintenance Records

**Files:**
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: final prompt contract, GitHub dev SHA `e8d842a38a7e0ed3edd5fc74f88247f8b63075ad`, PRs #6012/#6010/#6100/#6151, source paths from the approved design.
- Produces: non-contradictory sync records for omo plus v1/Codex adaptations; no historical design/plan edits.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Update the GPT-5.6 row and maintenance invariant in `docs/prompt-sync.md`**

Replace the `deepwork/gpt-5.6.md` mapping row with this complete row:

```markdown
| `deepwork/gpt-5.6.md` | `packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts`, `packages/omo-codex/plugin/components/rules/bundled-rules/hephaestus/gpt-5.6.md`, and `packages/omo-opencode/src/agents/momus-gpt-5-6.ts` | Additive GPT-5.6 calibration only: applicability/authority, outcome-first completion, conservative retrieval/delegation, context-efficient waiting/revalidation, and reporting priority. Shared discovery, planner trigger, answerability, scope, shell, review labels, and exact role permissions remain in effective base/role/category/skill/terminal-contract layers rather than being duplicated here. **2026-07-19 simplification:** preserves native `max`, safe defaults, authorization, observable delegation evidence, backed-off waiting, and changed-input validation while removing the role matrix and detailed allowlists. |
```

Replace maintenance rule 12 with:

```markdown
12. GPT-5.6-specific additive calibration belongs only in `deepwork/gpt-5.6.md`. Do not copy its outcome/waiting/revalidation layer into generic GPT/Gemini/GLM/Codex/default prompts. Conversely, do not restore generic discovery, planner-trigger, answerability, scope, shell, review-label, workflow-role matrix, or detailed allowlist copies inside the specialization; those remain authoritative in effective base/role/category/skill prompts and terminal delegation contracts.
```

- [ ] **Step 2: Add the current GitHub evidence and remove the obsolete polling observation**

Insert before `## ocmm-Native Workflow Adaptation (2026-07-13)`:

```markdown
## GPT-5.6 Prompt Simplification (2026-07-19)

- GitHub source of truth: `code-yeongyu/oh-my-openagent`, branch `dev`, commit `e8d842a38a7e0ed3edd5fc74f88247f8b63075ad`.
- Reviewed sources: `packages/omo-opencode/src/agents/hephaestus/gpt-5-6.ts`, `packages/omo-codex/plugin/components/rules/bundled-rules/hephaestus/gpt-5.6.md`, and `packages/omo-opencode/src/agents/momus-gpt-5-6.ts`.
- Merged evidence: PR #6012 (shorter outcome-first prompts and prioritization), #6010 (shorter role-specific review contract), #6100 (`GOAL` / `STOP WHEN` / `EVIDENCE` delegation outcomes), and #6151 (no empty polling, backed-off waiting, and changed-input revalidation).
- Local result: the three specialization sources keep one shared four-section doctrine and environment-specific applicability/authority wording only. Effective base-plus-specialization prompts retain discovery, planning, answerability, scope, shell, and review behavior without a second copy in the specialization.
- Source budgets: omo 6,742, v1 6,794, and Codex 6,799 baseline characters; each replacement is capped at 3,500 characters and at 60% of its baseline.
- Codex generated profiles carry the compact calibration ahead of runtime model selection; non-GPT-5.6 models ignore it. Generated agent instructions are refreshed only after clean-root and prompt-only candidate-diff checks.
```

Under `## Observation-Only Upstream Items (2026-07-13)`, delete only this now-obsolete bullet:

```markdown
- **Polling/backoff mechanics (item 7)**: no polling/backoff guidance added to prompts or skills. Revisit if a task explicitly involves polling loops, retry/backoff design, or rate-limit handling.
```

Replace the `Shell Adaptation preserved` bullet in the 2026-07-13 adaptation section with:

```markdown
- **Shell Adaptation preserved effectively**: base `gpt.md`, `planner.md`, and category prompts retain shell adaptation. The additive GPT-5.6 specialization no longer repeats that section, and tests verify each effective composed path still contains it exactly once.
```

- [ ] **Step 3: Correct the flat-workflow record in `docs/prompt-sync.md`**

Replace the two GPT-5.6 bullets under `## Flat Workflow Subagent Policy (2026-07-17)` with:

```markdown
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` keep only the shared conservative decision threshold: direct tools first; delegation requires effective-role permission and a bounded result that materially improves completion; multiple steps, routine confirmation, or another opinion are insufficient.
- Exact utility/specialist allowlists, utility-leaf termination, planner's once-only unsuffixed-reviewer exception, and orchestrator-owned formal review remain in role prompts and effective terminal delegation contracts, not in the model calibration.
- `prompts/{omo,v1,codex}/deepwork/gpt-5.6.md` retain explicit safe-default question thresholds: proceed under clear facts; ask only for deliverable-changing choices, unavailable required information, destructive actions, or material-rework risk.
```

- [ ] **Step 4: Update the v1 source row and Codex adapter section in `docs/v1-maintenance.md`**

Replace the complete `deepwork/gpt-5.6.md` row in the Prompt Source Mapping table with:

```markdown
| deepwork/gpt-5.6.md | omo GPT-5.6 Hephaestus prompt doctrine plus current Momus review calibration | outcome-first completion, conditional retrieval/delegation, evidence-first reporting, native `max`, and authorization priority | generic discovery/planner/answer/scope/shell/review copies, workflow-role matrix, detailed utility/specialist allowlists, and orchestrator-owned workflow lists | Additive four-section GPT-5.6 calibration. v1 keeps the `<deepwork-mode>` wrapper and injected-skill authority wording; shared doctrine comes from effective `gpt.md`/`planner.md`, role/category prompts, skills, and terminal delegation contracts. **2026-07-19 simplification:** source checked at `code-yeongyu/oh-my-openagent` `dev@e8d842a38a7e0ed3edd5fc74f88247f8b63075ad`; PR #6012/#6010/#6100/#6151 support shorter outcome-first contracts, observable delegated outcomes, no empty polling, backed-off waiting, and changed-input revalidation. Each workflow source is capped at 3,500 characters and 60% of its baseline. |
```

Add this bullet under `## Codex Plugin Prompts (prompts/codex/)`:

```markdown
- **GPT-5.6 compact calibration (2026-07-19)**: `prompts/codex/deepwork/gpt-5.6.md` shares the v1/omo four-section doctrine, keeps the Codex `<deepwork-mode>` wrapper, says profiles may carry the layer ahead of runtime selection, and names embedded skills plus Codex tool-compatibility rules as authoritative. Generated `dw-*` profiles must contain outcome/waiting/revalidation guidance without reintroducing removed headings inside the specialization segment.
```

- [ ] **Step 5: Add a v1/Codex evidence section and correct the flat-policy source statement**

Insert before `## Shared Characteristics`:

```markdown
## GPT-5.6 Prompt Simplification (2026-07-19)

- Authority: `code-yeongyu/oh-my-openagent` `dev@e8d842a38a7e0ed3edd5fc74f88247f8b63075ad`; reviewed Hephaestus OpenCode/Codex sources and the GPT-5.6 Momus source.
- Evidence: PR #6012 and #6010 favor shorter role-preserving prompts; PR #6100 requires observable `GOAL` / `STOP WHEN` / `EVIDENCE`; PR #6151 avoids empty polling and unchanged-input revalidation.
- v1 difference: retains one `<deepwork-mode>` wrapper and makes injected skills authoritative.
- Codex difference: retains one wrapper, guards ahead-of-runtime carriage for non-GPT-5.6 models, and makes embedded skills plus Codex tool-compatibility rules authoritative.
- Shared body: outcome-first completion, conservative retrieval/delegation, context-efficient waiting/revalidation, and reporting priority. Generic workflow and exact permission doctrine remain in their existing authoritative layers.
```

Replace the final source-contract bullet under `## Flat Workflow Subagent Policy (2026-07-17)` with:

```markdown
- `prompts/v1/agents/planner.md`, effective terminal delegation contracts, `skills/v1/subagent-driven-development/SKILL.md`, `skills/v1/subagent-driven-development/implementer-prompt.md`, and `skills/v1/requesting-code-review/SKILL.md` carry exact role permissions and ownership. `prompts/v1/deepwork/gpt-5.6.md` carries only the conservative model-level threshold; Codex generated profiles and copied skills are refreshed from those sources.
```

- [ ] **Step 6: Verify both synchronization records contain the complete evidence and no stale matrix claim**

```powershell
rg -n "e8d842a38a7e0ed3edd5fc74f88247f8b63075ad|PR #6012|#6010|#6100|#6151|Context-efficient waiting|changed-input revalidation|3,500|workflow-role matrix" docs/prompt-sync.md docs/v1-maintenance.md
if ($LASTEXITCODE -ne 0) { throw "sync evidence search failed with exit $LASTEXITCODE" }
rg -n "no polling/backoff guidance added|questions-and-safe-defaults threshold and workflow-role composition matrix are also exclusive" docs/prompt-sync.md docs/v1-maintenance.md
$staleExit = $LASTEXITCODE
if ($staleExit -eq 0) { throw "stale GPT-5.6 synchronization wording remains" }
if ($staleExit -ne 1) { throw "stale-wording search failed with exit $staleExit" }
```

Expected: the first search shows the SHA, all four PRs, waiting/revalidation, budgets, and removed-duplication boundary; the second search returns no matches.

### Task 7: Run GREEN Verification Gates Before Generation

**Files:**
- Verify: `prompts/omo/deepwork/gpt-5.6.md`
- Verify: `prompts/v1/deepwork/gpt-5.6.md`
- Verify: `prompts/codex/deepwork/gpt-5.6.md`
- Verify: `src/intent/prompt-loader.test.ts`
- Verify: `src/hooks/config.category.test.ts`, the authoritative effective-category assertion
- Verify: `src/codex/plugin-generator.test.ts`
- Verify: `docs/prompt-sync.md`
- Verify: `docs/v1-maintenance.md`
- Verify unchanged: `src/hooks/config.ts`, `src/intent/prompt-loader.ts`, `src/codex/plugin-generator.ts`, `src/config/schema.ts`, `schema.json`

**Interfaces:**
- Consumes: GREEN prompt/test/doc changes.
- Produces: targeted, typecheck, non-config-suite, exact 24-failure baseline, Rust, and build evidence required before generated roots may be touched.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Run all targeted Node test files**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
try {
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "prompt-loader tests failed with exit $LASTEXITCODE" }
node --test --experimental-strip-types src/hooks/config.category.test.ts
if ($LASTEXITCODE -ne 0) { throw "category configuration tests failed with exit $LASTEXITCODE" }
node --test --experimental-strip-types src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw "Codex generator tests failed with exit $LASTEXITCODE" }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: all three test files PASS with no skipped or cancelled tests.

- [ ] **Step 2: Run strict typechecking**

```powershell
node C:\Users\hugefiver\source\ocmm\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { throw "typecheck failed with exit $LASTEXITCODE" }
```

Expected: `tsc -p tsconfig.json --noEmit` exits 0 with no diagnostics.

- [ ] **Step 3: Run non-config TypeScript and Rust tests, then prove the complete-suite baseline**

```powershell
$allTests = @(Get-ChildItem -LiteralPath src -Recurse -Filter *.test.ts | ForEach-Object FullName)
$nonConfigTests = @($allTests | Where-Object { $_ -notmatch '[\\/]src[\\/]config[\\/](load|profiles)\.test\.ts$' })
node --test --experimental-strip-types --test-reporter=spec $nonConfigTests
if ($LASTEXITCODE -ne 0) { throw "non-config TypeScript tests failed with exit $LASTEXITCODE" }
cargo test -p ocmm-lsp
if ($LASTEXITCODE -ne 0) { throw "Rust tests failed with exit $LASTEXITCODE" }
$completeOutput = @(node --test --experimental-strip-types --test-reporter=spec $allTests 2>&1)
$completeExit = $LASTEXITCODE
$completeText = $completeOutput -join "`n"
if ($completeExit -eq 0) { throw "complete TypeScript suite unexpectedly passed; expected 24 captured baseline failures" }
if ($completeText -notmatch '# fail 24' -or $completeText -notmatch 'src[\\/]config[\\/]load\.test\.ts' -or $completeText -notmatch 'src[\\/]config[\\/]profiles\.test\.ts') {
  $completeOutput
  throw "complete TypeScript suite differs from the captured 24-failure config baseline"
}
```

Expected: all non-config TypeScript tests and `cargo test -p ocmm-lsp` pass. The complete TypeScript suite retains exactly 24 failures in `src/config/load.test.ts` and `src/config/profiles.test.ts`; no new failure is accepted.

- [ ] **Step 4: Run the complete build**

```powershell
node C:\Users\hugefiver\source\ocmm\node_modules\typescript\bin\tsc -p tsconfig.json
if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed with exit $LASTEXITCODE" }
node --experimental-strip-types scripts/build-ocmm-lsp.ts
if ($LASTEXITCODE -ne 0) { throw "build failed with exit $LASTEXITCODE" }
```

Expected: TypeScript build and release-mode `ocmm-lsp` build exit 0. Task 7 creates `dist/{cli,shared,bin}`; it may update ignored `dist/**` but must not yet change tracked generated roots.

- [ ] **Step 5: Reconfirm protected implementation files remain untouched**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
git -C $worktree diff --exit-code -- src/hooks/config.ts src/intent/prompt-loader.ts src/codex/plugin-generator.ts src/config/schema.ts schema.json package.json
if ($LASTEXITCODE -ne 0) { throw "forbidden implementation/schema/package diff detected" }
```

Expected: exit 0 and no output. Any failure is reported exactly and blocks generation; do not alter forbidden files to make this task green.

### Task 8: Guard, Regenerate, and Verify the Codex Bundle

**Files:**
- Regenerate: the 44 exact agent TOMLs listed in File Structure
- Verify unchanged: `.agents/plugins/marketplace.json`
- Verify unchanged: all `plugins/deepwork/**` files outside `plugins/deepwork/agents/*.toml`
- Create/delete outside repository: `C:\Users\hugefiver\AppData\Local\Temp\opencode\ocmm-gpt56-codex-candidate\**`

**Interfaces:**
- Consumes: successful Task 7 build, clean tracked generated roots in the worktree, current worktree prompt sources, generator APIs.
- Produces: prompt-only candidate proof, regenerated worktree profiles, deterministic second-run evidence, and a representative real-surface calibration probe.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Persist the exact expected generated-file set and hash helper outside the repository**

Create one helper under the Task 1 baseline so every later PowerShell process can load the same exact scope:

```powershell
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
if (-not (Test-Path -LiteralPath $baseline)) { throw "Task 1 baseline is missing: $baseline" }
$scopeScript = Join-Path $baseline "generated-scope.ps1"
@'
$agentNames = @(
  "dw-builder", "dw-clarifier", "dw-code-search", "dw-coding", "dw-complex", "dw-creative",
  "dw-deep", "dw-doc-search", "dw-documenting", "dw-explore", "dw-frontend", "dw-hard-reasoning",
  "dw-media-reader", "dw-normal-task", "dw-oracle", "dw-oracle-2nd", "dw-orchestrator",
  "dw-plan-critic", "dw-planner", "dw-quick", "dw-research", "dw-reviewer"
)
$expectedGeneratedDiff = @(
  foreach ($name in $agentNames) {
    ".codex/agents/$name.toml"
    "plugins/deepwork/agents/$name.toml"
  }
) | Sort-Object
$generatedRoots = @(".agents/plugins/marketplace.json", ".codex/agents", "plugins/deepwork")

function Get-GeneratedHashes([string]$base, [switch]$IncludeIgnoredRuntime) {
  $map = @{}
  foreach ($relativeRoot in $generatedRoots) {
    $absoluteRoot = Join-Path $base $relativeRoot
    if (-not (Test-Path -LiteralPath $absoluteRoot)) { throw "Generated path missing: $absoluteRoot" }
    $item = Get-Item -LiteralPath $absoluteRoot
    $files = if ($item.PSIsContainer) {
      @(Get-ChildItem -LiteralPath $absoluteRoot -Recurse -File)
    } else {
      @($item)
    }
    foreach ($file in $files) {
      $relative = [IO.Path]::GetRelativePath($base, $file.FullName).Replace("\", "/")
      if (-not $IncludeIgnoredRuntime -and $relative.StartsWith("plugins/deepwork/dist/", [StringComparison]::Ordinal)) { continue }
      $map[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
  }
  return $map
}
$candidateRoot = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-codex-candidate"
'@ | Set-Content -LiteralPath $scopeScript -Encoding utf8
. $scopeScript
if ($expectedGeneratedDiff.Count -ne 44) { throw "Expected 44 generated agent paths, got $($expectedGeneratedDiff.Count)" }
```

Expected: `$expectedGeneratedDiff.Count` is 44; `generated-scope.ps1` exists only under the approved OS temp baseline; no repository file changes.

- [ ] **Step 2: Stop unless the tracked generated roots are clean immediately before generation**

```powershell
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$generatedStatus = @(git -C $worktree status --short -- .agents/plugins/marketplace.json .codex/agents plugins/deepwork)
if ($LASTEXITCODE -ne 0) { throw "generated-root status check failed with exit $LASTEXITCODE" }
if ($generatedStatus.Count -ne 0) {
  $generatedStatus | ForEach-Object { $_ }
  throw "Tracked generated roots are not clean; stop without running the worktree generator"
}
```

Expected: no output. Any output is a hard stop; do not overwrite or recover those paths.

- [ ] **Step 3: Generate a complete candidate under the approved OS temp parent**

```powershell
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$candidateParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
if (-not (Test-Path -LiteralPath $candidateParent)) { throw "Approved temp parent is missing: $candidateParent" }
if (Test-Path -LiteralPath $candidateRoot) { throw "Candidate path already exists: $candidateRoot" }
New-Item -ItemType Directory -Path $candidateRoot | Out-Null
$savedCandidateRoot = $env:OCMM_GPT56_CANDIDATE_ROOT
$savedSourceRoot = $env:OCMM_GPT56_SOURCE_ROOT
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
$env:OCMM_GPT56_CANDIDATE_ROOT = $candidateRoot
$env:OCMM_GPT56_SOURCE_ROOT = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
try {
  node --experimental-strip-types -e "import('./src/codex/plugin-generator.ts').then(async ({generateCodexPlugin})=>{const path=await import('node:path');const root=process.env.OCMM_GPT56_CANDIDATE_ROOT;const source=process.env.OCMM_GPT56_SOURCE_ROOT;if(!root)throw new Error('missing candidate root');if(!source)throw new Error('missing worktree source root');await generateCodexPlugin({projectRoot:source,pluginRoot:path.join(root,'plugins','deepwork'),marketplacePath:path.join(root,'.agents','plugins','marketplace.json'),projectAgentsRoot:path.join(root,'.codex','agents')});})"
  if ($LASTEXITCODE -ne 0) { throw "temp candidate generation failed with exit $LASTEXITCODE" }
} finally {
  $env:OCMM_GPT56_CANDIDATE_ROOT = $savedCandidateRoot
  $env:OCMM_GPT56_SOURCE_ROOT = $savedSourceRoot
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: candidate generation exits 0 and writes only under `$candidateRoot`; worktree status remains unchanged.

- [ ] **Step 4: Compare the complete candidate and stop before overwrite on any unexpected delta**

```powershell
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$repositoryHashes = Get-GeneratedHashes $worktree -IncludeIgnoredRuntime
$candidateHashes = Get-GeneratedHashes $candidateRoot -IncludeIgnoredRuntime
$allGeneratedPaths = @($repositoryHashes.Keys + $candidateHashes.Keys) | Sort-Object -Unique
$candidateDelta = @(
  $allGeneratedPaths | Where-Object {
    -not $repositoryHashes.ContainsKey($_) -or
    -not $candidateHashes.ContainsKey($_) -or
    $repositoryHashes[$_] -ne $candidateHashes[$_]
  }
) | Sort-Object
$runtimePrefix = "plugins/deepwork/dist/"
$candidateRuntime = @($candidateDelta | Where-Object { $_.StartsWith($runtimePrefix, [StringComparison]::Ordinal) }) | Sort-Object
$sourceRuntime = @(
  foreach ($directory in @("cli", "shared", "bin")) {
    $sourceDirectory = Join-Path (Join-Path $worktree "dist") $directory
    if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) { throw "Missing Task 7 runtime directory: $sourceDirectory" }
    Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File |
      ForEach-Object { "plugins/deepwork/dist/$([IO.Path]::GetRelativePath((Join-Path $worktree 'dist'), $_.FullName).Replace('\', '/'))" }
  }
) | Sort-Object
if ($candidateRuntime.Count -ne 23) { $candidateRuntime; throw "Expected 23 ignored candidate runtime files, got $($candidateRuntime.Count)" }
$runtimeComparison = @(Compare-Object -ReferenceObject $sourceRuntime -DifferenceObject $candidateRuntime)
if ($runtimeComparison.Count -ne 0) { $runtimeComparison; throw "Candidate ignored-runtime files do not map one-to-one from dist/{cli,shared,bin}" }
foreach ($runtimePath in $candidateRuntime) {
  if ($repositoryHashes.ContainsKey($runtimePath)) { throw "Ignored runtime path unexpectedly exists in the worktree map: $runtimePath" }
  $sourceRelative = "dist/" + $runtimePath.Substring($runtimePrefix.Length)
  $sourcePath = Join-Path $worktree $sourceRelative
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Missing runtime source for candidate staging: $sourceRelative" }
  if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $candidateHashes[$runtimePath]) { throw "Runtime SHA-256 differs from staged candidate file: $runtimePath" }
  git -C $worktree ls-files --error-unmatch -- $runtimePath *> $null
  if ($LASTEXITCODE -eq 0) { throw "Ignored runtime path is tracked: $runtimePath" }
  if ($LASTEXITCODE -ne 1) { throw "Tracked-runtime probe failed for $runtimePath with exit $LASTEXITCODE" }
  git -C $worktree check-ignore -q -- $runtimePath
  if ($LASTEXITCODE -ne 0) { throw "Ignored runtime path is not explicitly ignored: $runtimePath" }
}
$trackedCandidateDelta = @($candidateDelta | Where-Object { -not $_.StartsWith($runtimePrefix, [StringComparison]::Ordinal) }) | Sort-Object
$candidateComparison = @(Compare-Object -ReferenceObject $expectedGeneratedDiff -DifferenceObject $trackedCandidateDelta)
if ($candidateComparison.Count -ne 0) {
  "Expected prompt-derived paths:"
  $expectedGeneratedDiff
  "Actual tracked candidate paths:"
  $trackedCandidateDelta
  "Set comparison:"
  $candidateComparison
  throw "Candidate tracked generation is not limited to the 44 expected agent TOMLs; worktree generation is blocked"
}
```

Expected: exactly 44 tracked candidate deltas and exactly 23 candidate-only runtime files. Each runtime file maps from `dist/{cli,shared,bin}`, has the same SHA-256 as its source, is untracked, and is explicitly ignored under `plugins/deepwork/dist/**`. Any other runtime, manifest, skill, README, package, or marketplace delta means the candidate escaped the prompt-only boundary; stop here without running the direct generator script in the worktree.

- [ ] **Step 5: Run the worktree generator only after the clean/candidate gates pass**

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
try {
  node --experimental-strip-types scripts/gen-codex-plugin.ts
  if ($LASTEXITCODE -ne 0) { throw "worktree Codex generation failed with exit $LASTEXITCODE" }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: the script reports the plugin root, 22 agents, skills/MCP counts, `.codex/agents`, and marketplace path.

- [ ] **Step 6: Enforce the exact post-generation changed-file set**

```powershell
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$actualGeneratedDiff = @(git -C $worktree diff --name-only -- .agents/plugins/marketplace.json .codex/agents plugins/deepwork) | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "generated diff listing failed with exit $LASTEXITCODE" }
$generatedComparison = @(Compare-Object -ReferenceObject $expectedGeneratedDiff -DifferenceObject $actualGeneratedDiff)
if ($generatedComparison.Count -ne 0) {
  "Expected generated diff:"
  $expectedGeneratedDiff
  "Actual generated diff:"
  $actualGeneratedDiff
  "Set comparison:"
  $generatedComparison
  throw "Worktree generated diff escaped the prompt-derived 44-file boundary"
}
```

Expected: exactly the two copies of all 22 `dw-*` TOML profiles changed. `plugins/deepwork/dist/**` may exist as ignored runtime staging, but it does not enter this tracked Git diff; marketplace, other runtime paths, skills, manifests, package metadata, and README remain unchanged.

- [ ] **Step 7: Probe the real generated instruction surface**

```powershell
$representatives = @(
  ".codex/agents/dw-orchestrator.toml",
  ".codex/agents/dw-planner.toml",
  ".codex/agents/dw-coding.toml",
  "plugins/deepwork/agents/dw-orchestrator.toml"
)
$removed = @(
  "## Shell Adaptation",
  "## Discovery Before Planning",
  "## Planner Trigger",
  "## Answer-When-Answerable",
  "## Scope",
  "## Workflow-role composition"
)
foreach ($path in $representatives) {
  $worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
  $text = [IO.File]::ReadAllText((Join-Path $worktree $path))
  $start = $text.IndexOf("# GPT-5.6 EXECUTION CALIBRATION")
  $end = $text.IndexOf("</deepwork-mode>", $start)
  if ($start -lt 0 -or $end -lt 0) { throw "$path has no bounded GPT-5.6 calibration" }
  $calibration = $text.Substring($start, $end - $start)
  foreach ($required in @("observable completion condition", "After two unchanged checks", "Rerun validation only when relevant inputs changed", "Lead with the outcome")) {
    if (-not $calibration.Contains($required)) { throw "$path is missing: $required" }
  }
  foreach ($heading in $removed) {
    if ($calibration.Contains($heading)) { throw "$path specialization duplicates: $heading" }
  }
  "${path}: compact GPT-5.6 calibration verified"
}
```

Expected: four verification lines and no exception. The complete profiles may contain shared headings before the GPT-5.6 marker; the extracted specialization segment may not.

- [ ] **Step 8: Prove a second generator run is byte-for-byte deterministic**

```powershell
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$beforeSecondRun = Get-GeneratedHashes $worktree
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
try {
  node --experimental-strip-types scripts/gen-codex-plugin.ts
  if ($LASTEXITCODE -ne 0) { throw "second Codex generation failed with exit $LASTEXITCODE" }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
$afterSecondRun = Get-GeneratedHashes $worktree
$beforeSecondRunCount = $beforeSecondRun.Count
$afterSecondRunCount = $afterSecondRun.Count
if ($beforeSecondRunCount -ne 140 -or $afterSecondRunCount -ne 140) { throw "Expected a 140-entry tracked generated map before and after the second run, got $beforeSecondRunCount and $afterSecondRunCount" }
$allSecondRunPaths = @($beforeSecondRun.Keys + $afterSecondRun.Keys) | Sort-Object -Unique
$secondRunDelta = @(
  $allSecondRunPaths | Where-Object {
    -not $beforeSecondRun.ContainsKey($_) -or
    -not $afterSecondRun.ContainsKey($_) -or
    $beforeSecondRun[$_] -ne $afterSecondRun[$_]
  }
)
if ($secondRunDelta.Count -ne 0) {
  $secondRunDelta
  throw "second generator run changed generated content"
}
```

Expected: second generation exits 0, both tracked generated maps contain exactly 140 entries, and `$secondRunDelta` is empty.

- [ ] **Step 9: Remove only the temp candidate after evidence is captured**

```powershell
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
if (-not $candidateRoot.StartsWith((Join-Path $env:LOCALAPPDATA "Temp\opencode"), [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to remove unexpected candidate path: $candidateRoot"
}
Remove-Item -LiteralPath $candidateRoot -Recurse -Force
if (Test-Path -LiteralPath $candidateRoot) { throw "Candidate cleanup failed: $candidateRoot" }
```

Expected: the candidate directory is gone; no main-checkout or worktree path is removed.

### Task 9: Audit and Commit the Exact Worktree Change

**Files:**
- Stage and commit: the eight authoritative prompt/test/sync files, this task's spec and plan, and exactly 44 generated agent TOMLs.
- Inspect only: all forbidden implementation/schema/package paths and all generated paths outside the 44-file allowlist.

**Interfaces:**
- Consumes: all GREEN evidence, deterministic generated output, exact generated-scope helper, unchanged task artifacts.
- Produces: one semantic feature commit whose tree changes are exactly the 54 allowed task paths and a clean feature worktree.

**Command workdir for every step in this task:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

- [ ] **Step 1: Re-run all targeted tests against the generated state**

```powershell
node --test --experimental-strip-types src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "final prompt-loader tests failed with exit $LASTEXITCODE" }
node --test --experimental-strip-types src/hooks/config.category.test.ts
if ($LASTEXITCODE -ne 0) { throw "final category configuration tests failed with exit $LASTEXITCODE" }
node --test --experimental-strip-types src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "final Codex generator tests failed with exit $LASTEXITCODE" }
```

Expected: all three files pass against the source, effective-category, and generated-profile behavior.

- [ ] **Step 2: Run whitespace and forbidden-path checks in the worktree**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
git -C $worktree diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed with exit $LASTEXITCODE" }
git -C $worktree diff --exit-code -- src/hooks/config.ts src/intent/prompt-loader.ts src/codex/plugin-generator.ts src/config/schema.ts schema.json package.json
if ($LASTEXITCODE -ne 0) { throw "forbidden implementation/schema/package diff detected" }
```

Expected: both commands exit 0 with no output.

- [ ] **Step 3: Enforce the complete 54-path pre-stage allowlist**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$authoritative = @(
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
  "prompts/codex/deepwork/gpt-5.6.md",
  "src/intent/prompt-loader.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.test.ts",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$allowed = @($authoritative + $expectedGeneratedDiff) | Sort-Object
if ($allowed.Count -ne 54) { throw "Expected 54 task paths, got $($allowed.Count)" }
$statusLines = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "worktree status failed with exit $LASTEXITCODE" }
$statusPaths = @($statusLines | ForEach-Object { $_.Substring(3) }) | Sort-Object
$comparison = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $statusPaths)
if ($comparison.Count -ne 0) { $comparison; throw "Worktree status does not equal the exact 54-path allowlist" }
$prematurelyStaged = @($statusLines | Where-Object { $_[0] -notin @(' ', '?') })
if ($prematurelyStaged.Count -ne 0) { $prematurelyStaged; throw "Paths were staged before the required inspection" }
```

Expected: exactly eight modified source/test/sync files, two untracked task artifacts, and 44 modified generated TOMLs; nothing is staged yet.

- [ ] **Step 4: Perform the required pre-commit status, diff, and history inspection**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
git -C $worktree status --short
if ($LASTEXITCODE -ne 0) { throw "pre-commit status failed with exit $LASTEXITCODE" }
git -C $worktree diff --stat
if ($LASTEXITCODE -ne 0) { throw "pre-commit diff stat failed with exit $LASTEXITCODE" }
git -C $worktree diff -- prompts/omo/deepwork/gpt-5.6.md prompts/v1/deepwork/gpt-5.6.md prompts/codex/deepwork/gpt-5.6.md src/intent/prompt-loader.test.ts src/hooks/config.category.test.ts src/codex/plugin-generator.test.ts docs/prompt-sync.md docs/v1-maintenance.md
if ($LASTEXITCODE -ne 0) { throw "authoritative diff inspection failed with exit $LASTEXITCODE" }
git -C $worktree diff -- .codex/agents/dw-orchestrator.toml .codex/agents/dw-planner.toml plugins/deepwork/agents/dw-orchestrator.toml
if ($LASTEXITCODE -ne 0) { throw "representative generated diff inspection failed with exit $LASTEXITCODE" }
git -C $worktree log --oneline -10
if ($LASTEXITCODE -ne 0) { throw "pre-commit history inspection failed with exit $LASTEXITCODE" }
```

Expected: inspection shows only the compact calibration/test/sync/generated changes and current repository commit style; no unrelated delta is accepted.

- [ ] **Step 5: Stage only the exact 54-path allowlist and verify the index**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
. $scopeScript
$authoritative = @(
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
  "prompts/codex/deepwork/gpt-5.6.md",
  "src/intent/prompt-loader.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.test.ts",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$allowed = @($authoritative + $expectedGeneratedDiff) | Sort-Object
git -C $worktree add -- $allowed
if ($LASTEXITCODE -ne 0) { throw "exact-scope staging failed with exit $LASTEXITCODE" }
$staged = @(git -C $worktree diff --cached --name-only) | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "staged-name audit failed with exit $LASTEXITCODE" }
$comparison = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $staged)
if ($comparison.Count -ne 0) { $comparison; throw "Index does not contain exactly the 54 task paths" }
$unstaged = @(git -C $worktree diff --name-only)
if ($LASTEXITCODE -ne 0) { throw "unstaged-name audit failed with exit $LASTEXITCODE" }
if ($unstaged.Count -ne 0) { $unstaged; throw "Unstaged tracked changes remain" }
$untracked = @(git -C $worktree ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw "untracked-name audit failed with exit $LASTEXITCODE" }
if ($untracked.Count -ne 0) { $untracked; throw "Untracked worktree files remain" }
```

Expected: the index contains exactly 54 paths; no unstaged or untracked task file remains.

- [ ] **Step 6: Create the semantic feature commit**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
git -C $worktree commit -m "refactor(prompts): simplify GPT-5.6 calibration" -m "Reduce duplicated calibration doctrine, update effective-prompt coverage, and refresh generated Codex profiles."
if ($LASTEXITCODE -ne 0) { throw "feature commit failed with exit $LASTEXITCODE" }
```

Expected: one semantic commit with a concise body and no footers, trailers, or AI attribution.

- [ ] **Step 7: Verify the committed tree and clean feature worktree**

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$scopeScript = Join-Path (Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline") "generated-scope.ps1"
. $scopeScript
$authoritative = @(
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
  "prompts/codex/deepwork/gpt-5.6.md",
  "src/intent/prompt-loader.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.test.ts",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$allowed = @($authoritative + $expectedGeneratedDiff) | Sort-Object
$committed = @(git -C $worktree diff-tree --no-commit-id --name-only -r HEAD) | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "committed-tree audit failed with exit $LASTEXITCODE" }
$comparison = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $committed)
if ($comparison.Count -ne 0) { $comparison; throw "Feature commit does not contain exactly the 54 task paths" }
$status = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "post-commit status failed with exit $LASTEXITCODE" }
if ($status.Count -ne 0) { $status; throw "Feature worktree is not clean after commit" }
git -C $worktree log -1 --format=fuller
if ($LASTEXITCODE -ne 0) { throw "feature commit inspection failed with exit $LASTEXITCODE" }
```

Expected: committed path set is exact, both task artifacts are tracked, worktree is clean, and the commit message has no forbidden footer.

### Task 10: Reconcile a Concurrently Advanced `master` Without Rebase

**Files:**
- Inspect: main checkout HEAD plus the complete dynamic porcelain/index/SHA-256 baseline.
- Optionally merge into feature branch: the captured newer `master` commit.
- Never edit automatically on conflict.

**Interfaces:**
- Consumes: clean committed feature worktree, Task 1 dynamic concurrent-state snapshot, baseline commit, and current main checkout with that exact captured dirt still present.
- Produces: proof that concurrent dirt, feature paths, and any newer `base..master` paths are safely disjoint; then either the unchanged feature tip or a verified semantic merge commit containing current `master`. Any overlap, divergence, conflict, or baseline drift produces a non-destructive stop.

- [ ] **Step 1: Revalidate the dynamic main baseline, prove path coordination, and classify HEAD movement**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$baseCommit = (Get-Content -LiteralPath (Join-Path $baseline "base-commit.txt") -Raw).Trim()
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
node $safetyHelper verify $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state drifted before master reconciliation" }
$mainBranch = (git -C $main branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "main integration-preflight branch query failed with exit $LASTEXITCODE" }
if ($mainBranch -ne "master") { throw "Main checkout left master; stop before merge preparation" }
$mainHead = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "main integration-preflight HEAD query failed with exit $LASTEXITCODE" }
git -C $main merge-base --is-ancestor $baseCommit $mainHead
$ancestorExit = $LASTEXITCODE
if ($ancestorExit -eq 1) { throw "master no longer descends from worktree baseline; stop without rebase or force" }
if ($ancestorExit -ne 0) { throw "master ancestry check failed with exit $ancestorExit" }

$worktreeStatus = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "feature status failed with exit $LASTEXITCODE" }
if ($worktreeStatus.Count -ne 0) { $worktreeStatus; throw "Feature worktree is not clean before master reconciliation" }
$featureCommit = (git -C $worktree rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "feature commit query failed with exit $LASTEXITCODE" }

$scopeScript = Join-Path $baseline "generated-scope.ps1"
if (-not (Test-Path -LiteralPath $scopeScript)) { throw "Generated-scope helper is missing: $scopeScript" }
. $scopeScript
$authoritative = @(
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
  "prompts/codex/deepwork/gpt-5.6.md",
  "src/intent/prompt-loader.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.test.ts",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$allowed = @($authoritative + $expectedGeneratedDiff) | Sort-Object
$featureChanged = @(git -C $worktree diff --name-only "$baseCommit..$featureCommit") | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "feature changed-path query failed with exit $LASTEXITCODE" }
$featureComparison = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $featureChanged)
if ($featureComparison.Count -ne 0) { $featureComparison; throw "Feature history does not contain exactly the 54 task paths" }

$snapshot = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json
$concurrentPaths = @($snapshot.concurrentPaths) | Sort-Object
$featureDirtyOverlap = @($featureChanged | Where-Object { $concurrentPaths -contains $_ })
if ($featureDirtyOverlap.Count -ne 0) { $featureDirtyOverlap; throw "Feature paths overlap baseline concurrent dirty paths" }

$mainChanged = @()
if ($mainHead -ne $baseCommit) {
  $mainChanged = @(git -C $main diff --name-only "$baseCommit..$mainHead") | Sort-Object -Unique
  if ($LASTEXITCODE -ne 0) { throw "advanced-master changed-path query failed with exit $LASTEXITCODE" }
  $masterDirtyOverlap = @($mainChanged | Where-Object { $concurrentPaths -contains $_ })
  if ($masterDirtyOverlap.Count -ne 0) { $masterDirtyOverlap; throw "Advanced master paths overlap baseline concurrent dirty paths" }
  $masterFeatureOverlap = @($mainChanged | Where-Object { $featureChanged -contains $_ })
  if ($masterFeatureOverlap.Count -ne 0) { $masterFeatureOverlap; throw "Advanced master paths overlap feature paths; safe automatic coordination is not proven" }
}
$featureChanged | Set-Content -LiteralPath (Join-Path $baseline "feature-paths-before-master-merge.txt") -Encoding utf8
$mainChanged | Set-Content -LiteralPath (Join-Path $baseline "advanced-master-paths.txt") -Encoding utf8
$mainHead | Set-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Encoding ascii
$mode = if ($mainHead -eq $baseCommit) { "unchanged" } else { "merge" }
$mode | Set-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Encoding ascii
"master integration mode: $mode; HEAD=$mainHead"
```

Expected: main may remain dirty. Its complete baseline dirty path set, porcelain codes, staging/index entries, and regular-file SHA-256 values are unchanged with no new path; the exact 54 feature paths are disjoint from concurrent dirt; any advanced `base..master` paths are disjoint from both sets; and `master` is unchanged or a descendant of the captured baseline. Any failed disjointness check stops before a merge attempt.

- [ ] **Step 2: If `master` advanced, begin a non-rebase merge without auto-commit**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$mode = (Get-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Raw).Trim()
$mainHead = (Get-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Raw).Trim()
if ($mode -eq "unchanged") {
  "master unchanged; no feature-branch merge required"
} else {
  $status = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { throw "feature pre-merge status failed with exit $LASTEXITCODE" }
  if ($status.Count -ne 0) { $status; throw "Feature worktree is not clean before master merge" }
  git -C $worktree merge --no-ff --no-commit $mainHead
  $mergeExit = $LASTEXITCODE
  if ($mergeExit -ne 0) {
    $conflicts = @(git -C $worktree diff --name-only --diff-filter=U)
    if ($LASTEXITCODE -ne 0) { throw "Conflict inventory failed with exit $LASTEXITCODE" }
    $conflicts
    throw "master merge conflicted; stop in place without abort/reset/checkout. Only task-owned files could ever be resolved, and this plan performs no automatic conflict resolution"
  }
}
```

Expected: unchanged mode is a no-op. Advanced mode enters a conflict-free pending merge. Any conflict—including one in a task file—is reported and left untouched for explicit owner direction.

- [ ] **Step 3: Re-run targeted tests and typecheck for a pending merge**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$mode = (Get-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Raw).Trim()
if ($mode -eq "merge") {
  node --test --experimental-strip-types src/intent/prompt-loader.test.ts
  if ($LASTEXITCODE -ne 0) { throw "post-master prompt-loader tests failed with exit $LASTEXITCODE" }
  node --test --experimental-strip-types src/hooks/config.category.test.ts
  if ($LASTEXITCODE -ne 0) { throw "post-master category configuration tests failed with exit $LASTEXITCODE" }
  node --test --experimental-strip-types src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw "post-master generator tests failed with exit $LASTEXITCODE" }
  node C:\Users\hugefiver\source\ocmm\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit
  if ($LASTEXITCODE -ne 0) { throw "post-master typecheck failed with exit $LASTEXITCODE" }
} else {
  "master unchanged; earlier targeted/typecheck evidence remains current"
}
```

Expected: pending-merge targeted tests and strict typecheck pass, or unchanged mode performs no command.

- [ ] **Step 4: Re-run non-config/Rust tests and prove the complete baseline for a pending merge**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$mode = (Get-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Raw).Trim()
if ($mode -eq "merge") {
  $allTests = @(Get-ChildItem -LiteralPath src -Recurse -Filter *.test.ts | ForEach-Object FullName)
  $nonConfigTests = @($allTests | Where-Object { $_ -notmatch '[\\/]src[\\/]config[\\/](load|profiles)\.test\.ts$' })
  node --test --experimental-strip-types --test-reporter=spec $nonConfigTests
  if ($LASTEXITCODE -ne 0) { throw "post-master non-config TypeScript tests failed with exit $LASTEXITCODE" }
  cargo test -p ocmm-lsp
  if ($LASTEXITCODE -ne 0) { throw "post-master Rust tests failed with exit $LASTEXITCODE" }
  $completeOutput = @(node --test --experimental-strip-types --test-reporter=spec $allTests 2>&1)
  $completeExit = $LASTEXITCODE
  $completeText = $completeOutput -join "`n"
  if ($completeExit -eq 0 -or $completeText -notmatch '# fail 24' -or $completeText -notmatch 'src[\\/]config[\\/]load\.test\.ts' -or $completeText -notmatch 'src[\\/]config[\\/]profiles\.test\.ts') {
    $completeOutput
    throw "post-master complete TypeScript suite differs from the captured 24-failure config baseline"
  }
} else {
  "master unchanged; earlier non-config/Rust and 24-failure baseline evidence remains current"
}
```

Expected: all non-config TypeScript and Rust tests pass when `master` advanced, and the complete TypeScript suite remains exactly at the captured 24-failure config baseline.

- [ ] **Step 5: Re-run the build for a pending merge**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$mode = (Get-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Raw).Trim()
if ($mode -eq "merge") {
  node C:\Users\hugefiver\source\ocmm\node_modules\typescript\bin\tsc -p tsconfig.json
  if ($LASTEXITCODE -ne 0) { throw "post-master TypeScript build failed with exit $LASTEXITCODE" }
  node --experimental-strip-types scripts/build-ocmm-lsp.ts
  if ($LASTEXITCODE -ne 0) { throw "post-master build failed with exit $LASTEXITCODE" }
} else {
  "master unchanged; earlier build evidence remains current"
}
```

Expected: complete build passes when `master` advanced.

- [ ] **Step 6: Prove post-merge generation remains byte-identical**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$mode = (Get-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Raw).Trim()
if ($mode -eq "merge") {
  $scopeScript = Join-Path $baseline "generated-scope.ps1"
  . $scopeScript
  $before = Get-GeneratedHashes $worktree
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  try {
    node --experimental-strip-types scripts/gen-codex-plugin.ts
    if ($LASTEXITCODE -ne 0) { throw "post-master Codex generation failed with exit $LASTEXITCODE" }
  } finally {
    $env:OCMM_PROFILE = $savedProfile
    $env:OCMM_NO_PROFILE = $savedNoProfile
  }
  $after = Get-GeneratedHashes $worktree
  $paths = @($before.Keys + $after.Keys) | Sort-Object -Unique
  $delta = @($paths | Where-Object { -not $before.ContainsKey($_) -or -not $after.ContainsKey($_) -or $before[$_] -ne $after[$_] })
  if ($delta.Count -ne 0) { $delta; throw "Post-master generator changed content; stop before merge commit" }
  $unstaged = @(git -C $worktree diff --name-only)
  if ($LASTEXITCODE -ne 0) { throw "post-master unstaged audit failed with exit $LASTEXITCODE" }
  if ($unstaged.Count -ne 0) { $unstaged; throw "Post-master verification produced unstaged changes" }
} else {
  "master unchanged; deterministic generation evidence remains current"
}
```

Expected: a pending merge regenerates byte-identically and produces no unstaged changes; any delta blocks the merge commit.

- [ ] **Step 7: Inspect and commit the conflict-free verified merge when needed**

**Workdir:** `C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification`

```powershell
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$mode = (Get-Content -LiteralPath (Join-Path $baseline "master-integration-mode.txt") -Raw).Trim()
if ($mode -eq "merge") {
  git -C $worktree status --short
  if ($LASTEXITCODE -ne 0) { throw "pending-merge status failed with exit $LASTEXITCODE" }
  git -C $worktree diff --cached --stat
  if ($LASTEXITCODE -ne 0) { throw "pending-merge diff inspection failed with exit $LASTEXITCODE" }
  git -C $worktree log --oneline -10
  if ($LASTEXITCODE -ne 0) { throw "pending-merge history inspection failed with exit $LASTEXITCODE" }
  git -C $worktree commit -m "chore: merge latest master" -m "Integrate concurrent master changes before fast-forwarding the GPT-5.6 simplification."
  if ($LASTEXITCODE -ne 0) { throw "master merge commit failed with exit $LASTEXITCODE" }
}
$status = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "post-reconciliation status failed with exit $LASTEXITCODE" }
if ($status.Count -ne 0) { $status; throw "Feature worktree is not clean after master reconciliation" }
$featureTip = (git -C $worktree rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "feature-tip query failed with exit $LASTEXITCODE" }
$mainHead = (Get-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Raw).Trim()
$scopeScript = Join-Path $baseline "generated-scope.ps1"
. $scopeScript
$authoritative = @(
  "prompts/omo/deepwork/gpt-5.6.md",
  "prompts/v1/deepwork/gpt-5.6.md",
  "prompts/codex/deepwork/gpt-5.6.md",
  "src/intent/prompt-loader.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.test.ts",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$allowed = @($authoritative + $expectedGeneratedDiff) | Sort-Object
$integrationFeaturePaths = @(git -C $worktree diff --name-only "$mainHead..$featureTip") | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "integration feature-path query failed with exit $LASTEXITCODE" }
$comparison = @(Compare-Object -ReferenceObject $allowed -DifferenceObject $integrationFeaturePaths)
if ($comparison.Count -ne 0) { $comparison; throw "Feature tip is not exactly the 54-path delta from captured master" }
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
$snapshot = Get-Content -LiteralPath $snapshotPath -Raw | ConvertFrom-Json
$concurrentPaths = @($snapshot.concurrentPaths)
$overlap = @($integrationFeaturePaths | Where-Object { $concurrentPaths -contains $_ })
if ($overlap.Count -ne 0) { $overlap; throw "Final feature delta overlaps baseline concurrent dirty paths" }
$integrationFeaturePaths | Set-Content -LiteralPath (Join-Path $baseline "feature-paths-for-integration.txt") -Encoding utf8
$safetyHelper = Join-Path $baseline "main-safety.mjs"
node $safetyHelper verify "C:\Users\hugefiver\source\ocmm" $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state drifted during master reconciliation" }
$featureTip | Set-Content -LiteralPath (Join-Path $baseline "feature-tip.txt") -Encoding ascii
```

Expected: unchanged `master` leaves the original feature commit as tip; advanced `master` produces one verified semantic merge commit. In either case the worktree is clean, the feature tip differs from the captured integration HEAD by exactly the 54 task paths, those paths remain disjoint from every baseline concurrent dirty path, and the main concurrent snapshot is still exact.

### Task 11: Fast-Forward `master` and Remove Only This Worktree

**Files:**
- Delete from main checkout only after comparing them with their captured baseline hashes: this task's original untracked spec and plan copies.
- Fast-forward into main checkout: committed task files from the feature branch.
- Remove: worktree `node_modules` junction, this sibling worktree, and this feature branch.
- Preserve byte-for-byte and status-for-status: every dynamically captured concurrent dirty path, its index entry/staging state, and the main `node_modules` target.

**Interfaces:**
- Consumes: clean feature tip, unchanged captured main HEAD/full-porcelain/index/SHA-256 snapshot, disjoint feature/concurrent path sets, and main task-artifact copies that remain byte-identical to their captured pre-execution hashes.
- Produces: `master` pointing exactly at the feature tip, task files tracked, every concurrent main file and index state unchanged despite the HEAD move, and only this task's worktree/branch removed.

- [ ] **Step 1: Recheck main HEAD and the complete dynamic concurrent-state baseline immediately before deletion**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
$expectedHead = (Get-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Raw).Trim()
$actualHead = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "final main HEAD query failed with exit $LASTEXITCODE" }
if ($actualHead -ne $expectedHead) { throw "Main HEAD advanced again from $expectedHead to $actualHead; stop before deleting task copies" }
$mainBranch = (git -C $main branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "final main branch query failed with exit $LASTEXITCODE" }
if ($mainBranch -ne "master") { throw "Main checkout left master before task-copy deletion" }
node $safetyHelper verify $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state drifted before task-copy deletion" }
```

Expected: main HEAD is the exact captured integration HEAD while all baseline concurrent tracked/untracked paths remain present with identical porcelain codes, staged/unstaged state, index entries, and regular-file SHA-256 values. No new dirty path exists. A dirty main checkout is expected and accepted.

- [ ] **Step 2: Prove the main task copies still match their captured pre-execution hashes**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$branch = "feat/gpt-5-6-prompt-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$taskArtifacts = @(
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)
$worktreeStatus = @(git -C $worktree status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw "feature cleanliness query failed with exit $LASTEXITCODE" }
if ($worktreeStatus.Count -ne 0) { $worktreeStatus; throw "Feature worktree changed before integration" }
$recordedFeatureTip = (Get-Content -LiteralPath (Join-Path $baseline "feature-tip.txt") -Raw).Trim()
$branchTip = (git -C $worktree rev-parse $branch).Trim()
if ($LASTEXITCODE -ne 0) { throw "feature branch tip query failed with exit $LASTEXITCODE" }
if ($branchTip -ne $recordedFeatureTip) { throw "Feature branch moved from $recordedFeatureTip to $branchTip" }
$integrationBase = (Get-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Raw).Trim()
git -C $main merge-base --is-ancestor $integrationBase $recordedFeatureTip
$fastForwardExit = $LASTEXITCODE
if ($fastForwardExit -eq 1) { throw "Feature tip is not a fast-forward descendant of the captured master HEAD; stop before deleting task copies" }
if ($fastForwardExit -ne 0) { throw "Pre-deletion fast-forward proof failed with exit $fastForwardExit" }
$snapshot = Get-Content -LiteralPath (Join-Path $baseline "main-safety-baseline.json") -Raw | ConvertFrom-Json
$recordedTaskHashes = @{}
foreach ($record in @($snapshot.files | Where-Object { $_.taskArtifact })) {
  if (-not $record.sha256) { throw "Captured task artifact has no SHA-256: $($record.path)" }
  $recordedTaskHashes[$record.path] = $record.sha256
}
if ($recordedTaskHashes.Count -ne 2) { throw "Expected two captured task-artifact hashes, got $($recordedTaskHashes.Count)" }
foreach ($relative in $taskArtifacts) {
  git -C $worktree ls-files --error-unmatch -- $relative *> $null
  if ($LASTEXITCODE -ne 0) { throw "Task artifact is not committed: $relative" }
  $mainPath = Join-Path $main $relative
  $mainHash = (Get-FileHash -LiteralPath $mainPath -Algorithm SHA256).Hash
  if ($mainHash -ne $recordedTaskHashes[$relative]) { throw "Main task copy changed after baseline capture: $relative" }
}
$recordedFeaturePaths = @(Get-Content -LiteralPath (Join-Path $baseline "feature-paths-for-integration.txt")) | Sort-Object
$concurrentPaths = @($snapshot.concurrentPaths)
$overlap = @($recordedFeaturePaths | Where-Object { $concurrentPaths -contains $_ })
if ($overlap.Count -ne 0) { $overlap; throw "Feature changed-path set overlaps baseline concurrent dirty paths" }
$actualFeaturePaths = @(git -C $worktree diff --name-only "$integrationBase..$recordedFeatureTip") | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "pre-integration feature-path query failed with exit $LASTEXITCODE" }
$pathComparison = @(Compare-Object -ReferenceObject $recordedFeaturePaths -DifferenceObject $actualFeaturePaths)
if ($pathComparison.Count -ne 0) { $pathComparison; throw "Feature changed-path set moved after reconciliation" }
```

Expected: feature worktree is clean, both corrected task artifacts are committed, the two original main copies still match their captured pre-execution hashes, the recorded 54-path feature delta is unchanged, and it has an empty intersection with every baseline concurrent dirty path other than the two task copies that will be deleted.

- [ ] **Step 3: Delete exactly the two baseline-verified main-checkout task copies with file-editing tools**

Use the file-editing delete operation—not PowerShell, shell redirection, or Git—to delete exactly:

```text
C:\Users\hugefiver\source\ocmm\docs\superpowers\specs\2026-07-19-gpt-5-6-prompt-simplification-design.md
C:\Users\hugefiver\source\ocmm\docs\superpowers\plans\2026-07-19-gpt-5-6-prompt-simplification.md
```

Expected: those two untracked copies are absent from the main checkout. No other document is deleted or edited.

- [ ] **Step 4: Require the exact dynamic baseline minus the two task-artifact entries after deletion**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
node $safetyHelper verify-without-task-artifacts $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state changed while deleting task copies" }
foreach ($relative in @(
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)) {
  if (Test-Path -LiteralPath (Join-Path $main $relative)) { throw "Task artifact still exists after deletion: $relative" }
}
```

Expected: the complete baseline remains exact after removing only the two task-artifact `??` entries. Existing concurrent tracked and untracked changes, including their staged/unstaged porcelain codes and index entries, remain allowed and unchanged; there is no new dirty path.

- [ ] **Step 5: Fast-forward `master` to the feature tip and refuse any non-fast-forward**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$branch = "feat/gpt-5-6-prompt-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
$expectedHead = (Get-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Raw).Trim()
$actualHead = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "immediate pre-merge HEAD query failed with exit $LASTEXITCODE" }
if ($actualHead -ne $expectedHead) { throw "Main HEAD changed immediately before fast-forward; stop" }
$mainBranch = (git -C $main branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw "immediate pre-merge branch query failed with exit $LASTEXITCODE" }
if ($mainBranch -ne "master") { throw "Main checkout left master immediately before fast-forward" }
node $safetyHelper verify-without-task-artifacts $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Main concurrent state changed immediately before fast-forward" }
$recordedFeatureTip = (Get-Content -LiteralPath (Join-Path $baseline "feature-tip.txt") -Raw).Trim()
$currentFeatureTip = (git -C $main rev-parse $branch).Trim()
if ($LASTEXITCODE -ne 0) { throw "immediate pre-merge feature-tip query failed with exit $LASTEXITCODE" }
if ($currentFeatureTip -ne $recordedFeatureTip) { throw "Feature branch changed immediately before fast-forward" }
git -C $main merge-base --is-ancestor $actualHead $currentFeatureTip
$fastForwardExit = $LASTEXITCODE
if ($fastForwardExit -eq 1) { throw "Feature branch is no longer a fast-forward descendant of master" }
if ($fastForwardExit -ne 0) { throw "Immediate fast-forward proof failed with exit $fastForwardExit" }
git -C $main merge --ff-only $branch
if ($LASTEXITCODE -ne 0) { throw "fast-forward-only integration failed, possibly because Git rejected the dirty tree; stop without stash/reset/checkout or merge recovery" }
```

Expected: `master` advances without a merge commit created in the main checkout even though disjoint concurrent dirt remains. Fast-forward moves HEAD and installs only the task delta; it must not change any concurrent file content, index entry, staging state, or porcelain code. A non-fast-forward or Git dirty-tree refusal exits nonzero and triggers no stash, reset, fallback merge, or other recovery.

- [ ] **Step 6: Verify integrated HEAD, tracked task artifacts, and unchanged concurrent state**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$featureTip = (Get-Content -LiteralPath (Join-Path $baseline "feature-tip.txt") -Raw).Trim()
$mainHead = (git -C $main rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "post-merge main HEAD query failed with exit $LASTEXITCODE" }
if ($mainHead -ne $featureTip) { throw "master HEAD $mainHead does not equal feature tip $featureTip" }
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
node $safetyHelper verify-without-task-artifacts $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Fast-forward changed concurrent main content, index state, or porcelain status" }
$integrationBase = (Get-Content -LiteralPath (Join-Path $baseline "main-head-for-integration.txt") -Raw).Trim()
$recordedFeaturePaths = @(Get-Content -LiteralPath (Join-Path $baseline "feature-paths-for-integration.txt")) | Sort-Object
$landedPaths = @(git -C $main diff --name-only "$integrationBase..$mainHead") | Sort-Object
if ($LASTEXITCODE -ne 0) { throw "post-integration landed-path query failed with exit $LASTEXITCODE" }
$landedComparison = @(Compare-Object -ReferenceObject $recordedFeaturePaths -DifferenceObject $landedPaths)
if ($landedComparison.Count -ne 0) { $landedComparison; throw "Fast-forward landed paths outside the recorded feature set" }
$featureStatus = @(git -C $main status --porcelain=v1 --untracked-files=all -- $recordedFeaturePaths)
if ($LASTEXITCODE -ne 0) { throw "post-integration feature status failed with exit $LASTEXITCODE" }
if ($featureStatus.Count -ne 0) { $featureStatus; throw "A feature path is dirty after integration" }
foreach ($relative in @(
  "docs/superpowers/specs/2026-07-19-gpt-5-6-prompt-simplification-design.md",
  "docs/superpowers/plans/2026-07-19-gpt-5-6-prompt-simplification.md"
)) {
  git -C $main ls-files --error-unmatch -- $relative *> $null
  if ($LASTEXITCODE -ne 0) { throw "Integrated task artifact is not tracked: $relative" }
}
```

Expected: `master` equals the feature tip, the HEAD movement lands exactly the recorded 54 feature paths, every feature path is clean, and task spec/plan are tracked. Every pre-existing concurrent tracked/untracked file remains byte-identical, its index entry and staged/unstaged state are identical, its porcelain code is identical, and no new dirty path exists. The only dirty-status transition was removal of the two task-artifact `??` entries before merge; those paths are now clean and tracked.

- [ ] **Step 7: Remove the worktree junction without touching main `node_modules`**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$mainModules = "C:\Users\hugefiver\source\ocmm\node_modules"
$worktreeModules = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification\node_modules"
$junction = Get-Item -LiteralPath $worktreeModules -Force
if ($junction.LinkType -ne "Junction") { throw "Refusing to remove non-junction path: $worktreeModules" }
$resolvedTarget = [IO.Path]::GetFullPath([string]$junction.Target)
if ($resolvedTarget -ne [IO.Path]::GetFullPath($mainModules)) { throw "Refusing to remove junction with unexpected target: $resolvedTarget" }
Remove-Item -LiteralPath $worktreeModules
if (Test-Path -LiteralPath $worktreeModules) { throw "Worktree node_modules junction still exists" }
if (-not (Test-Path -LiteralPath $mainModules -PathType Container)) { throw "Main node_modules target was disturbed" }
```

Expected: only the junction entry is removed; main `node_modules` still exists.

- [ ] **Step 8: Remove only this worktree and delete only this merged branch**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$branch = "feat/gpt-5-6-prompt-simplification"
git -C $main worktree remove $worktree
if ($LASTEXITCODE -ne 0) { throw "worktree removal failed; stop without --force or prune" }
git -C $main branch -d $branch
if ($LASTEXITCODE -ne 0) { throw "merged feature-branch deletion failed; stop without force deletion" }
```

Expected: sibling worktree path and merged feature branch are removed. No `worktree prune` command runs, so the unrelated prunable worktree remains untouched.

- [ ] **Step 9: Record final evidence, clean only the task temp baseline, and hand off**

**Workdir:** `C:\Users\hugefiver\source\ocmm`

```powershell
$main = "C:\Users\hugefiver\source\ocmm"
$worktree = "C:\Users\hugefiver\source\ocmm-wt-gpt56-simplification"
$baseline = Join-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode") "ocmm-gpt56-simplification-baseline"
$safetyHelper = Join-Path $baseline "main-safety.mjs"
$snapshotPath = Join-Path $baseline "main-safety-baseline.json"
node $safetyHelper verify-without-task-artifacts $main $snapshotPath
if ($LASTEXITCODE -ne 0) { throw "Final concurrent main-state verification failed" }
git -C $main status --short
if ($LASTEXITCODE -ne 0) { throw "final main status failed with exit $LASTEXITCODE" }
git -C $main log --oneline -3
if ($LASTEXITCODE -ne 0) { throw "final main history failed with exit $LASTEXITCODE" }
$finalWorktrees = @(git -C $main worktree list --porcelain)
if ($LASTEXITCODE -ne 0) { throw "final worktree inventory failed with exit $LASTEXITCODE" }
if ($finalWorktrees -contains "worktree $worktree") { throw "Task worktree remains registered" }
$finalInventory = $finalWorktrees -join "`n"
$mainPrefixes = @("worktree $main", "worktree $($main.Replace('\', '/'))")
$finalUnrelated = @(
  $finalInventory -split "(?:\r?\n){2,}" | Where-Object {
    $block = $_.Trim()
    $block.Length -gt 0 -and -not ($mainPrefixes | Where-Object { $block.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })
  }
) -join "`n`n"
$beforeUnrelated = (Get-Content -LiteralPath (Join-Path $baseline "unrelated-worktrees-before.txt") -Raw).Trim()
if ($finalUnrelated.Trim() -ne $beforeUnrelated) { throw "An unrelated worktree inventory block changed during this task" }
if (-not $baseline.StartsWith((Join-Path $env:LOCALAPPDATA "Temp\opencode"), [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove unexpected baseline: $baseline" }
Remove-Item -LiteralPath $baseline -Recurse -Force
if (Test-Path -LiteralPath $baseline) { throw "Task baseline cleanup failed" }
```

Report:

```text
Outcome: compact GPT-5.6 calibration committed and fast-forwarded into master without disturbing concurrent main-checkout work.
Evidence: feature/merge commit hashes; final character counts; targeted tests; typecheck; non-config TypeScript and Rust tests; the unchanged 24 baseline failures; build; exact 44-file tracked generation plus the separately hash-verified ignored runtime staging; deterministic 140-entry regeneration; main HEAD equality; dynamic baseline/final porcelain, index-entry, staged/unstaged, and SHA-256 equality; final status/worktree inventory.
Integration: master updated with --ff-only; task spec and plan tracked; no push or tag performed.
Cleanup: task node_modules junction, sibling worktree, feature branch, candidate, and baseline removed; unrelated prunable worktree untouched.
Residual risk or blocker: name the first failed gate and retained state exactly; otherwise state none.
```

Expected: evidence is reported after successful integration/cleanup; no push, tag, prune, force, stash, reset, checkout, or rebase occurred.

## Final Acceptance Checklist

- [ ] Every approved-design requirement maps to a completed task and concrete evidence.
- [ ] All three specialization files are ≤3,500 characters and ≥40% smaller than baseline.
- [ ] Shared doctrine from `## Outcome-first execution` onward is byte-identical across omo, v1, and Codex sources.
- [ ] Effective gpt/planner/category prompts retain shared discovery/planning/scope/shell/review behavior.
- [ ] Removed GPT-5.6 headings, workflow-role matrix, and detailed allowlists are absent from each specialization segment.
- [ ] Native `max`, explicit configuration/authorization, safe defaults, delegation threshold, waiting/backoff, changed-input revalidation, and reporting priority are present.
- [ ] Targeted tests, direct TypeScript typecheck, all non-config TypeScript tests, Rust tests, and direct build bodies pass; the complete TypeScript suite remains at exactly 24 baseline failures in `src/config/load.test.ts` and `src/config/profiles.test.ts`, with no new failure.
- [ ] Candidate and worktree tracked generation are limited to the same exact 44 agent TOMLs. The only candidate exception is 23 ignored `plugins/deepwork/dist/**` runtime files, each mapped to `dist/{cli,shared,bin}`, SHA-256-equal, and explicitly ignored; the complete 140-entry generated map is byte-identical after a second run.
- [ ] Sync docs contain the GitHub repository, branch SHA, three source paths, and PR #6012/#6010/#6100/#6151 evidence.
- [ ] The feature commit contains exactly eight implementation source/test/sync files, two unchanged task artifacts, and 44 generated TOMLs, for 54 paths total, with no footer or AI attribution.
- [ ] If `master` advanced from the worktree baseline, it was merged into the feature branch without rebase/force and fully revalidated before the merge commit; any conflict caused a hard stop.
- [ ] Main integration used `git merge --ff-only`; `master` equals the recorded feature tip and both task artifacts are tracked.
- [ ] Every dynamically captured concurrent dirty path except the deleted task copies has identical porcelain code, staged/unstaged state, tracked index entry, and regular-file SHA-256 before and after integration; there is no new dirty path.
- [ ] The exact feature changed-path set is disjoint from baseline concurrent dirty paths; if `master` advanced, its `base..master` paths were also proven disjoint from both before merge and full revalidation.
- [ ] The task junction was removed before the task worktree; only the merged feature branch was deleted; the unrelated prunable worktree was not touched.
- [ ] No install, push, tag, rebase, reset, checkout, restore, stash, force operation, or worktree prune occurred.
