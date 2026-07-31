# Release Fail-Closed Completion Contract Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependency-free fail-closed release checker, preventive workflow gates, and a shared publish protocol so an ocmm release is complete only after every lane-specific workflow, Release, checksum, npm, and required GitHub Packages surface is proven.

**Architecture:** The stable `scripts/check-release-completion.ts` facade preserves the public imports, package script, and direct executable while focused modules under `scripts/release-completion/` own contracts/receipt, target/checksum/staged validation, HTTP/GitHub/registry proofs, remote orchestration, and CLI composition. Six scenario-domain test files plus one focused test-support module retain all 46 behavioral scenarios; the release workflow and shared publish skill continue consuming the unchanged staged/remote contract.

**Tech Stack:** TypeScript, Node.js built-ins (`node:assert/strict`, `node:crypto`, `node:fs`, `node:path`, `node:test`, `node:url`), global `fetch`, GitHub REST, npm registry JSON APIs, GitHub Packages npm registry API, GitHub Actions YAML, PowerShell 7, pnpm, Cargo through repository scripts.

**Global Constraints:**
- Do not change a version, create or move a tag, trigger GitHub Actions, publish a package, mutate a GitHub Release, or contact a real registry during implementation.
- Do not add a third-party dependency or install software.
- Do not read, print, persist, or include credentials, Authorization headers, registry response bodies, or signed asset URLs in receipts or artifacts.
- Support `GITHUB_TOKEN` only as a process environment input; absence or insufficient GitHub Packages read permission must remain unproven rather than passing.
- Preserve the existing main/LSP lane split, OIDC Trusted Publishing, native matrix, package normalization, and conditional GitHub Packages publication.
- Main Release assets are exactly `ocmm-opencode-plugin-A.B.C.tgz`, `deepwork-codex-plugin-A.B.C.tgz`, and `SHA256SUMS.txt`.
- LSP Release assets are exactly eight canonical standalone binaries, eight `ocmm-lsp-<platform-package>-A.B.C.tgz` files, and `SHA256SUMS.txt`.
- Main push completion requires npm `ocmm@A.B.C`, GitHub Packages `@owner/ocmm@A.B.C`, and existence of the pinned `ocmm-lsp-vA.B.C` Release; it does not start or fully revalidate the LSP lane.
- LSP completion requires all eight npm platform packages and does not verify main npm, GitHub Packages, or main assets.
- A checker success requires an immutable tag/peeled SHA, one fixed run, terminal run success, lane-correct success/skipped jobs, exact non-empty assets, checksum coverage, downloaded digest equality, and every required package.
- Definite violations return JSON `FAILED` and exit `1`; deadline-limited propagation, retryable HTTP/network state, or unprovable GitHub Packages permission returns JSON `UNRESOLVED` and exit `2`; only full proof returns `COMPLETED` and exit `0`.
- Treat `404`, every `429`, `500` through `599`, and network exceptions as retryable. Treat GitHub REST `403` as retryable only with normalized credible `retry-after` or `x-ratelimit-remaining: 0` plus future `x-ratelimit-reset`; ordinary permission `403` is permanent `FAILED`. GitHub Packages `401`/`403` remains `UNRESOLVED` because package-read permission cannot prove absence.
- Every receipt timestamp comes from an explicit injected `Date`; staged validation, remote options, CLI failure handling, and receipt construction must not read ambient time.
- Tests must use local files, injected byte responses, and an injected clock only. They must not use live GitHub, npmjs.org, npm.pkg.github.com, or Actions.
- The publish skill is shared at `skills/publish/SKILL.md`; do not add or modify anything under `skills/v1` or `prompts/v1`.
- Generated files are never hand-edited. Run `pnpm run build:ts` before `pnpm run gen:codex-plugin` and include the generated `plugins/deepwork/skills/publish/SKILL.md`.
- Do not change provider/model defaults, config schema, `schema.json`, prompts, lockfiles, release UI, Discord, LazyCodex, or LSP daemon behavior.
- All implementation and verification commands in this plan use PowerShell syntax.
- Implementation subagents must not stage, commit, push, or tag. The parent owns the separately authorized final commit after review.
- The structural refactor must preserve exactly the existing receipt schema/order, public value/type exports, `package.json` script text, direct executable path/guard, CLI text and exit codes, HTTP endpoints/classification, safe errors/details, outcomes, retry timing, workflow, skills, generated files, and documentation behavior.
- Keep `scripts/check-release-completion.ts` at or below 60 nonblank, non-comment lines and each focused `scripts/release-completion/*.ts` module at or below 250 such lines where the approved responsibility boundaries make that practical; do not satisfy the limit with pass-through wrappers, duplicated policy, or speculative abstractions.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/check-release-completion.ts` | Create, then refactor in place | Thin explicit public re-export/composition facade and sole direct-execution guard. |
| `scripts/release-completion/contracts.ts` | Create | Receipt, target, HTTP, clock, option, status, and shared proof-state contracts. |
| `scripts/release-completion/receipt.ts` | Create | Receipt construction/mutation, deterministic finalization, ordering, skip, retry, and outcome policy. |
| `scripts/release-completion/target.ts` | Create | Strict target/local-version parsing and canonical asset inventory. |
| `scripts/release-completion/checksums.ts` | Create | Strict checksum grammar, coverage, and safe failure details. |
| `scripts/release-completion/staged.ts` | Create | Local exact-set, file, size, checksum, and hash proof. |
| `scripts/release-completion/http.ts` | Create | Production HTTP adapter, classification, strict decoders/validators, request helpers, and safe origins. |
| `scripts/release-completion/github-identity.ts` | Create | GitHub tag/run/event/attempt/job identity decoding and bound-tag proof. |
| `scripts/release-completion/github-release.ts` | Create | GitHub Release metadata, assets, downloaded sizes, and hash proof. |
| `scripts/release-completion/registries.ts` | Create | npmjs.org, GitHub Packages, and pinned-LSP proof. |
| `scripts/release-completion/remote.ts` | Create | Immutable remote orchestration and bounded retry state machine. |
| `scripts/release-completion/cli.ts` | Create | CLI parsing, production runtime composition, JSON output, and exit mapping. |
| `src/release-completion.test.ts` | Create in Tasks 1–8, then delete in Task 9 | Historical monolith; all 46 names/scenarios move intact before deletion. |
| `src/release-completion-test-support.test.ts` | Create | Shared deterministic fixture/root/clock/HTTP/Release/registry/receipt/child-process harness. |
| `src/release-completion-target-staged.test.ts` | Create | 5 target, inventory, staged-file, and checksum scenarios. |
| `src/release-completion-remote-identity.test.ts` | Create | 13 tag, run, event, workflow, and job identity scenarios. |
| `src/release-completion-release-assets.test.ts` | Create | 3 GitHub Release metadata/asset/download/hash scenarios. |
| `src/release-completion-registries-retry.test.ts` | Create | 16 registry, pinned-LSP, partial-state, retry, deadline, status, and authorization scenarios. |
| `src/release-completion-cli.test.ts` | Create | 5 CLI/runtime/redaction and real package-script child scenarios. |
| `src/release-completion-workflow.test.ts` | Create | 4 workflow ordering, lane-routing, and preserved-invariant scenarios. |
| `package.json` | Modify | Add `check:release-completion` only; preserve version, dependencies, and all other scripts. |
| `.github/workflows/release.yml` | Modify | Pack and checksum before publication, invoke staged validation, and require an exact selected-lane package-job pair before GitHub Release. |
| `skills/publish/SKILL.md` | Create | ocmm-only ship protocol requiring a terminal checker receipt and immutable partial-publication reporting. |
| `src/intent/skill-loader.test.ts` | Modify | Prove the real publish skill is shared, auto-discovered, semantically complete, and outside v1 injection/command lists. |
| `src/codex/plugin-generator.test.ts` | Modify | Prove source, fresh, and tracked generated publish skill trees agree. |
| `plugins/deepwork/skills/publish/SKILL.md` | Generate | Codex-normalized publish protocol with the canonical compatibility suffix. |
| `README.md` | Modify | User-facing remote checker command, status/exit semantics, token rule, and lane surface matrix. |
| `AGENTS.md` | Modify | Maintainer staging gate, post-run completion rule, immutable partial-state policy, and later `v0.6.6` acceptance command. |
| `docs/v1-maintenance.md` | Modify | Shared publish skill provenance and explicit rejection of OMO-only publication surfaces. |
| `docs/superpowers/specs/2026-07-31-release-completion-contract-design.md` | Reference | Approved behavioral and scope authority. |
| `docs/superpowers/plans/2026-07-31-release-completion-contract.md` | Reference | Ordered TDD handoff and verification authority. |

## Execution Order

1. Task 1 establishes strict release targets and canonical lane inventories.
2. Task 2 adds strict checksum parsing and local staged-asset validation.
3. Task 3 binds immutable GitHub tag/run identity and proves lane-specific jobs.
4. Task 4 verifies the final GitHub Release asset bytes and downloaded hashes.
5. Task 5 adds npm, GitHub Packages, pinned-LSP, retry, deadline, and partial-state behavior.
6. Task 6 exposes the stable CLI receipt, fixed exit codes, redaction, and package script.
7. Task 7 makes the workflow consume staged mode before irreversible writes and pins exact lane routing with source tests.
8. Task 8 adds the shared publish protocol, documentation, discovery tests, Codex generation, and generated-tree proof.
9. Task 9 performs the behavior-preserving structural split, keeping the behavioral suite green while replacing the two oversized responsibility concentrations.
10. Task 10 performs integrated verification, scope/secret/structure checks, and the parent-only commit handoff.

All tasks are sequential. Tasks 1 through 8 are already implemented and GREEN in the current uncommitted release feature. Their original checker/test paths and RED/GREEN instructions below are retained as implementation history, not as instructions to recreate the monolith. Task 9 supersedes only their physical file organization while preserving every behavior and test name; Task 10 starts only after the structural and behavioral gates pass.

### Task 1: Build strict release targets and canonical inventories

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Create: `scripts/check-release-completion.ts`
- Create: `src/release-completion.test.ts`
- Reference: `scripts/lsp-package-manifest.ts:32-65`
- Reference: `src/shared/ocmm-lsp-binary.ts:5-113`

**Interfaces:**
- Consumes: exact tag text, a project root containing `package.json` and `crates/ocmm-lsp/Cargo.toml`, and `ocmmLspPlatformPackages()`.
- Produces: `ReleaseLane`, `ReleaseTarget`, `parseReleaseTarget(tag: string, root: string): ReleaseTarget`, and `expectedReleaseAssets(target: ReleaseTarget): readonly string[]`.

- [ ] **Step 1: Write RED tests for strict parsing and both canonical inventories**

Create `src/release-completion.test.ts` with Node test imports, isolated-root helpers, and these exact initial test names:

```ts
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  expectedReleaseAssets,
  parseReleaseTarget,
} from "../scripts/check-release-completion.ts"
import { ocmmLspPlatformPackages } from "./shared/ocmm-lsp-binary.ts"

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function makeReleaseRoot(mainVersion = "1.2.3", lspVersion = "4.5.6", pinnedLspVersion = "4.5.6"): string {
  const root = mkdtempSync(join(tmpdir(), "ocmm-release-completion-"))
  writeJson(join(root, "package.json"), {
    name: "ocmm",
    version: mainVersion,
    ocmm: { lspVersion: pinnedLspVersion },
  })
  mkdirSync(join(root, "crates", "ocmm-lsp"), { recursive: true })
  writeFileSync(join(root, "crates", "ocmm-lsp", "Cargo.toml"), `[package]\nname = "ocmm-lsp"\nversion = "${lspVersion}"\n`)
  return root
}

test("parseReleaseTarget accepts only exact local main and LSP stable tags", () => {
  const root = makeReleaseRoot()
  try {
    assert.deepEqual(parseReleaseTarget("v1.2.3", root), {
      lane: "ocmm",
      tag: "v1.2.3",
      version: "1.2.3",
      pinnedLspVersion: "4.5.6",
    })
    assert.deepEqual(parseReleaseTarget("ocmm-lsp-v4.5.6", root), {
      lane: "ocmm-lsp",
      tag: "ocmm-lsp-v4.5.6",
      version: "4.5.6",
      pinnedLspVersion: null,
    })
    for (const tag of ["v1.2", "v01.2.3", "v1.2.3-beta.1", "v1.2.3+build", "ocmm-lsp-v4.5", " ocmm-lsp-v4.5.6"] as const) {
      assert.throws(() => parseReleaseTarget(tag, root), /strict release tag/)
    }
    assert.throws(() => parseReleaseTarget("v9.9.9", root), /does not match root package version/)
    assert.throws(() => parseReleaseTarget("ocmm-lsp-v9.9.9", root), /does not match ocmm-lsp Cargo version/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("expectedReleaseAssets returns the exact main and seventeen-file LSP inventories", () => {
  const root = makeReleaseRoot()
  try {
    const main = parseReleaseTarget("v1.2.3", root)
    assert.deepEqual(expectedReleaseAssets(main), [
      "SHA256SUMS.txt",
      "deepwork-codex-plugin-1.2.3.tgz",
      "ocmm-opencode-plugin-1.2.3.tgz",
    ])

    const lsp = parseReleaseTarget("ocmm-lsp-v4.5.6", root)
    const expected = [
      ...ocmmLspPlatformPackages().map((platform) => platform.binaryName),
      ...ocmmLspPlatformPackages().map((platform) => `${platform.packageName}-4.5.6.tgz`),
      "SHA256SUMS.txt",
    ].sort()
    assert.equal(expected.length, 17)
    assert.deepEqual(expectedReleaseAssets(lsp), expected)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Add assertions that non-string/missing root versions, malformed `ocmm.lspVersion`, and strict pinned-version failures throw stable messages. Do not weaken strict version parsing to reuse `startsWith()`.

- [ ] **Step 2: Run the target tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="parseReleaseTarget|expectedReleaseAssets" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: release target module unexpectedly exists" }
```

Expected: nonzero exit with `ERR_MODULE_NOT_FOUND` for `scripts/check-release-completion.ts` or missing named exports. No network request occurs.

- [ ] **Step 3: Add the target types, strict parser, and canonical inventory implementation**

Create `scripts/check-release-completion.ts`. Import only Node built-ins, `lspVersion`, `pinnedOcmmLspVersion`, `readRootPackage`, and `ocmmLspPlatformPackages`. Define `ReleaseLane` and `ReleaseTarget` exactly as the design and use this strict version source:

```ts
const STRICT_VERSION = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)"
const MAIN_TAG = new RegExp(`^v(${STRICT_VERSION})$`)
const LSP_TAG = new RegExp(`^ocmm-lsp-v(${STRICT_VERSION})$`)

function sortNames(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}
```

Do not use the outer capture indexes from the composed expression to obtain the version. Strip the exact lane prefix after a successful regex test, then compare that complete string to the local source. Validate the pinned value with `new RegExp(`^${STRICT_VERSION}$`)` before returning it.

Implement `expectedReleaseAssets()` from `ocmmLspPlatformPackages()` for the LSP lane and from the three exact names for main. Return a newly sorted array so callers cannot mutate module-owned state.

- [ ] **Step 4: Run target tests and verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="parseReleaseTarget|expectedReleaseAssets" src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "release target tests failed" }
```

Expected: the two named tests and their sub-assertions pass; zero failures.

### Task 2: Validate staged assets and checksums before any publication

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Modify: `scripts/check-release-completion.ts`
- Modify: `src/release-completion.test.ts`

**Interfaces:**
- Consumes: Task 1 `ReleaseTarget`, `expectedReleaseAssets()`, one local `release-assets` directory, and strict `shasum -a 256` rows.
- Produces: `ReleaseCompletionReceipt`, strict checksum parser, fixed receipt skeleton/finalizer, and `validateStagedReleaseAssets(root: string, assetsDir: string, tag: string, checkedAt: Date): ReleaseCompletionReceipt`.

- [ ] **Step 1: Add RED staged-fixture tests for exact files, strict checksums, and hashes**

Add `validateStagedReleaseAssets` to the existing checker import, then add these helpers and tests to `src/release-completion.test.ts`:

```ts
const FIXED_CHECKED_AT = new Date("2027-01-02T03:04:05.000Z")

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function writeValidStagedAssets(root: string, tag: string): string {
  const assetsDir = join(root, "release-assets")
  mkdirSync(assetsDir, { recursive: true })
  const target = parseReleaseTarget(tag, root)
  const payloads = expectedReleaseAssets(target).filter((name) => name !== "SHA256SUMS.txt")
  const rows: string[] = []
  for (const [index, name] of payloads.entries()) {
    const bytes = Buffer.from(`asset-${index}-${name}\n`)
    writeFileSync(join(assetsDir, name), bytes)
    rows.push(`${sha256(bytes)}  ${name}`)
  }
  writeFileSync(join(assetsDir, "SHA256SUMS.txt"), `${rows.join("\n")}\n`)
  return assetsDir
}

test("validateStagedReleaseAssets completes exact main and LSP fixtures", () => {
  for (const tag of ["v1.2.3", "ocmm-lsp-v4.5.6"] as const) {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, tag)
      const receipt = validateStagedReleaseAssets(root, assetsDir, tag, FIXED_CHECKED_AT)
      assert.equal(receipt.outcome, "COMPLETED")
      assert.equal(receipt.checkedAt, "2027-01-02T03:04:05.000Z")
      assert.equal(receipt.surfaces.releaseAssets.status, "PASS")
      assert.equal(receipt.surfaces.checksums.status, "PASS")
      assert.equal(receipt.assets.length, expectedReleaseAssets(parseReleaseTarget(tag, root)).length)
      assert.equal(statSync(join(assetsDir, "SHA256SUMS.txt")).size > 0, true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("validateStagedReleaseAssets rejects missing extra empty and non-regular assets", () => {
  const mutations: ReadonlyArray<(root: string, assetsDir: string) => void> = [
    (_root, assetsDir) => rmSync(join(assetsDir, "ocmm-opencode-plugin-1.2.3.tgz")),
    (_root, assetsDir) => writeFileSync(join(assetsDir, "unexpected.tgz"), "extra"),
    (_root, assetsDir) => writeFileSync(join(assetsDir, "ocmm-opencode-plugin-1.2.3.tgz"), ""),
    (_root, assetsDir) => mkdirSync(join(assetsDir, "nested")),
  ]
  for (const mutate of mutations) {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, "v1.2.3")
      mutate(root, assetsDir)
      const receipt = validateStagedReleaseAssets(root, assetsDir, "v1.2.3", FIXED_CHECKED_AT)
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.releaseAssets.status, "FAILED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test("validateStagedReleaseAssets rejects malformed incomplete duplicate and mismatched checksums", () => {
  const checksumBodies = [
    "not-a-checksum\n",
    `${"0".repeat(64)}  ocmm-opencode-plugin-1.2.3.tgz\n`,
    `${"0".repeat(64)}  ocmm-opencode-plugin-1.2.3.tgz\n${"1".repeat(64)}  ocmm-opencode-plugin-1.2.3.tgz\n`,
    `${"0".repeat(64)}  nested/ocmm-opencode-plugin-1.2.3.tgz\n`,
    `${"0".repeat(64)}  SHA256SUMS.txt\n`,
  ]
  for (const body of checksumBodies) {
    const root = makeReleaseRoot()
    try {
      const assetsDir = writeValidStagedAssets(root, "v1.2.3")
      writeFileSync(join(assetsDir, "SHA256SUMS.txt"), body)
      const receipt = validateStagedReleaseAssets(root, assetsDir, "v1.2.3", FIXED_CHECKED_AT)
      assert.equal(receipt.outcome, "FAILED")
      assert.equal(receipt.surfaces.checksums.status, "FAILED")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
```

Also add a Windows-capable symlink test only when `symlinkSync()` succeeds inside the fixture; otherwise record the platform inability with `t.skip()`. Never require elevation merely to run the suite.

- [ ] **Step 2: Run staged tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="validateStagedReleaseAssets" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: staged validator accepted unimplemented behavior" }
```

Expected: nonzero exit because `validateStagedReleaseAssets` is absent or its deliberate initial failure cannot satisfy the success fixture.

- [ ] **Step 3: Implement strict checksum parsing, staged validation, and the fixed receipt skeleton**

Define the receipt types exactly as the design. Add these private invariants:

```ts
const CHECKSUM_NAME = "SHA256SUMS.txt"
const CHECKSUM_ROW = /^([0-9a-fA-F]{64})  ([^\\/\r\n]+)$/

type ParsedChecksums = ReadonlyMap<string, string>

function parseChecksums(bytes: Uint8Array, expectedPayloads: readonly string[]): ParsedChecksums
function makeReceipt(identity: { target?: ReleaseTarget; repository?: string }, checkedAt: Date): ReleaseCompletionReceipt
function finalizeReceipt(receipt: ReleaseCompletionReceipt): ReleaseCompletionReceipt
```

`parseChecksums()` must decode UTF-8 with `TextDecoder("utf-8", { fatal: true })`, require one trailing newline, reject every empty row, normalize digests to lower case, reject duplicate names, reject `SHA256SUMS.txt`, compare sorted names exactly to `expectedPayloads`, and return an insertion-ordered map in canonical payload order.

`validateStagedReleaseAssets(root, assetsDir, tag, checkedAt)` must pass the explicit `Date` unchanged to `makeReceipt()` and catch expected contract errors into a complete `FAILED` receipt rather than throw. CLI-argument and programmer errors may throw only before a target exists; the later CLI wrapper converts them to a full failure receipt using its already captured injected date. Use `lstatSync()` plus `isFile()` so directories and symlinks fail. Read and hash each payload with `createHash("sha256")`. Populate every fixed surface; remote-only surfaces receive `SKIPPED` code `staged_mode_not_applicable`.

`makeReceipt()` requires a valid `Date`, serializes it immediately with `checkedAt.toISOString()`, uses null repository/lane/tag/version only for pre-target CLI input failures, and uses repository `"local"` for staged mode. Neither it nor staged validation may call `Date.now()`, `new Date()`, or a clock. `finalizeReceipt()` makes `COMPLETED` impossible when an identity field is null; otherwise it applies outcome precedence `FAILED`, then `UNRESOLVED`, then `COMPLETED`, based only on required surface states already recorded. It sorts jobs, assets, packages, and errors with explicit ordinal comparison.

- [ ] **Step 4: Run the complete Task 2 GREEN gate**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 2 checker tests failed" }
```

Expected: every strict target, inventory, staged-file, and checksum test passes; no live network output appears.

### Task 3: Bind immutable GitHub identity and enforce lane-specific jobs

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Modify: `scripts/check-release-completion.ts`
- Modify: `src/release-completion.test.ts`
- Reference: `.github/workflows/release.yml:43-207,281-339,523-560`

**Interfaces:**
- Consumes: Task 1 `ReleaseTarget`, Task 2 receipt skeleton, injected `HttpClient`, injected `Clock`, and GitHub tag/ref, annotated-tag, workflow-runs, fixed-run, and run-jobs JSON responses.
- Produces: `HttpRequest`, normalized-header `HttpResponse`, `HttpClient`, `Clock.now(): Date`, explicit `CheckReleaseCompletionOptions.checkedAt`, contextual HTTP classifier types, one peeled `headSha`, one fixed `runId`/`runAttempt` pair, immutable run identity, terminal workflow state, canonical job rows, and populated `identity`, `workflow`, and `jobs` surfaces.

- [ ] **Step 1: Add deterministic HTTP and clock fixtures**

Append these fixture shapes to `src/release-completion.test.ts`:

```ts
type PlannedResponse =
  | { status: number; json: unknown; headers?: Readonly<Record<string, string>> }
  | { status: number; bytes: Uint8Array; headers?: Readonly<Record<string, string>> }
  | { error: Error }

class FakeClock {
  currentMs = Date.parse("2027-01-15T08:00:00.000Z")
  readonly sleeps: number[] = []

  now(): Date {
    return new Date(this.currentMs)
  }

  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms)
    this.currentMs += ms
  }
}

function jsonResponse(status: number, value: unknown, headers: Readonly<Record<string, string>> = {}): PlannedResponse {
  return { status, json: value, headers }
}

function createHttpFixture(routes: Readonly<Record<string, readonly PlannedResponse[]>>): {
  http: import("../scripts/check-release-completion.ts").HttpClient
  requests: Array<{ url: string; headers: Readonly<Record<string, string>> }>
} {
  const queues = new Map(Object.entries(routes).map(([url, responses]) => [url, [...responses]]))
  const requests: Array<{ url: string; headers: Readonly<Record<string, string>> }> = []
  return {
    requests,
    http: async (request) => {
      requests.push({ url: request.url, headers: request.headers })
      const next = queues.get(request.url)?.shift()
      assert.ok(next, `unexpected HTTP request ${request.url}`)
      if ("error" in next) throw next.error
      const body = "json" in next
        ? Buffer.from(JSON.stringify(next.json))
        : Buffer.from(next.bytes)
      const normalizedHeaders = Object.fromEntries(
        Object.entries(next.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value.trim()]),
      )
      return { status: next.status, headers: normalizedHeaders, body }
    },
  }
}
```

Keep URL strings exact in fixtures. Never implement wildcard matching that could let the checker call an unintended endpoint without a test failure.
Every remote-options fixture must set `checkedAt: clock.now()` explicitly. Assertions compare receipt `checkedAt` to `clock.now().toISOString()` before any simulated sleep; no test calls ambient `Date.now()` or zero-argument `new Date()`.

- [ ] **Step 2: Write RED tests for tag peeling, fixed run binding, polling, and both job graphs**

Import `checkReleaseCompletion`, `HttpClient`, and `Clock`. Add exact tests:

1. `checkReleaseCompletion peels an annotated tag and binds one main push run once`
2. `checkReleaseCompletion accepts a lightweight LSP tag and all eight native jobs`
3. `checkReleaseCompletion retries run discovery and a nonterminal fixed run without rebinding`
4. `checkReleaseCompletion fails when a tag moves after binding without rebinding`
5. `checkReleaseCompletion fails tag head path branch event and fixed run identity mismatches`
6. `checkReleaseCompletion fails ambiguous run discovery`
7. `checkReleaseCompletion leaves incomplete run discovery UNRESOLVED`
8. `checkReleaseCompletion fails a changed run attempt without changing job graphs`
9. `checkReleaseCompletion fails terminal workflow failure after recording partial identity`
10. `checkReleaseCompletion rejects missing duplicate unexpected and wrong-conclusion main jobs`
11. `checkReleaseCompletion rejects missing or failed LSP matrix jobs and active main jobs`
12. `checkReleaseCompletion rejects an incomplete jobs page`

For the main success test, use these exact job rows:

```ts
const mainJobs = [
  { name: "Verify (ocmm)", conclusion: "success" },
  { name: "Download pinned ocmm-lsp binaries", conclusion: "success" },
  { name: "Package and publish ocmm", conclusion: "success" },
  { name: "Package and publish ocmm-lsp packages", conclusion: "skipped" },
  { name: "GitHub Release", conclusion: "success" },
]
```

For LSP, construct the eight native names from this fixed platform list and require all thirteen rows described by the spec:

```ts
const nativePlatforms = [
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "linux-x64-musl",
  "linux-arm64-musl",
  "win32-x64",
  "win32-arm64",
  "darwin-x64",
  "darwin-arm64",
] as const
```

The initial remote implementation may return a receipt whose later surfaces are `UNRESOLVED`; Task 3 assertions inspect identity/workflow/jobs only. Every successful fixture queues both the initial and final tag resolution. Assert that the final peel matches the bound SHA, a changed final peel yields `tag_head_changed`, the bound run URL is constructed from validated repository plus numeric ID, discovery happens once after binding, and every subsequent run response retains the same positive `run_attempt`. The jobs URL must contain the same numeric ID and `/attempts/{runAttempt}/jobs`; changing the attempt yields `run_attempt_changed` before another job graph is accepted. For discovery and jobs JSON, require `total_count` to equal the corresponding array length and no more than `100`; incomplete discovery is `UNRESOLVED` code `run_discovery_page_incomplete`, while an incomplete fixed job graph is `FAILED` code `jobs_page_incomplete`.

- [ ] **Step 3: Run Task 3 tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="peels an annotated|lightweight LSP|run discovery|tag moves|identity mismatches|ambiguous run|run attempt|terminal workflow|main jobs|LSP matrix|jobs page" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: remote identity and job behavior unexpectedly passes" }
```

Expected: nonzero exit because `checkReleaseCompletion` or its GitHub identity/job behavior is not implemented.

- [ ] **Step 4: Implement HTTP decoding, tag peeling, one-time run binding, and terminal polling**

Add only the production HTTP adapter in this task, without invoking it at module import. Use one header normalizer for all production responses:

```ts
function normalizeResponseHeaders(entries: Iterable<readonly [string, string]>): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {}
  for (const [rawName, rawValue] of entries) {
    const name = rawName.toLowerCase()
    const value = rawValue.replace(/^[ \t]+|[ \t]+$/g, "")
    if (!/^[a-z0-9-]+$/.test(name) || /[\u0000-\u001f\u007f]/.test(value) || Object.hasOwn(normalized, name)) {
      throw new Error("invalid normalized HTTP headers")
    }
    normalized[name] = value
  }
  return normalized
}

const productionHttp: HttpClient = async ({ url, headers }) => {
  const response = await fetch(url, { headers, redirect: "follow" })
  return {
    status: response.status,
    headers: normalizeResponseHeaders(response.headers.entries()),
    body: new Uint8Array(await response.arrayBuffer()),
  }
}
```

Create GitHub headers with `Accept`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: ocmm-release-completion`, and optional `Authorization: Bearer ...`. Do not copy the header map into the receipt.

Implement status classification once and reuse it:

```ts
type HttpService = "github-api" | "github-packages" | "npmjs" | "release-asset"
type HttpDisposition = "success" | "retry" | "failed" | "github-packages-unresolved"

function classifyHttp(
  response: Pick<HttpResponse, "status" | "headers">,
  context: { service: HttpService; now: Date },
): HttpDisposition
```

Require normalized lower-case header names and trimmed values at every adapter boundary; reject control characters and separately exposed duplicate names rather than preserving them. A Fetch-combined comma value remains a string but cannot pass the exact single-value rate-limit parsers added in Task 5. The classifier does not inspect response bodies. For Task 3, only `success`, `retry`, and `failed` are exercised. A successful JSON decoder must require object/array/string/number fields explicitly; do not cast remote JSON directly to trusted interfaces.

Peel `git/ref/tags/{tag}` recursively. Track visited object SHAs, require 40 lower-case hexadecimal characters after normalization, and stop only at `type: "commit"`. Use `encodeURIComponent(tag)` for the path segment. Store the first peeled commit. Resolve the tag again on every retry cycle after binding and immediately before a `COMPLETED` finalization; require exact equality or record `tag_head_changed` without changing `headSha` or `runId`.

If `options.runId` exists, bind it immediately after tag peeling and never query the runs list. Otherwise query:

```text
https://api.github.com/repos/owner/name/actions/workflows/release.yml/runs?event=push&branch=encoded-tag&per_page=100
```

Require discovery `total_count` to equal the returned array length and be no greater than `100`; otherwise return immediate `UNRESOLVED` code `run_discovery_page_incomplete` because uniqueness is unprovable. Filter decoded runs by `event === "push"`, `head_branch === tag`, and `head_sha === headSha`. Retry zero matches and fail multiple matches. For the sole match, require and bind its numeric ID plus positive safe-integer `run_attempt`. A manually dispatched run is accepted only through explicit `runId`; because no attempt is supplied by the CLI, bind `run_attempt` from the first successful fixed-run response after it proves `head_branch === tag` and `head_sha === headSha`.

Poll only:

```text
https://api.github.com/repos/owner/name/actions/runs/fixed-id
```

Require the invariant fields and one positive safe-integer `run_attempt` on every successful response. For auto-discovery it must equal the already bound discovery attempt; for an explicit run ID, only the first identity-valid response establishes it. Every later difference fails with `run_attempt_changed`; never accept jobs from a replacement attempt. On `status !== "completed"`, sleep only if time remains. On terminal completion, record conclusion; a non-success conclusion is a definite failure.

- [ ] **Step 5: Implement exact main and LSP job validation**

Fetch:

```text
https://api.github.com/repos/owner/name/actions/runs/fixed-id/attempts/fixed-attempt/jobs?per_page=100
```

Require a non-negative integer `total_count` equal to the jobs-array length and no greater than `100`, unique names, and string conclusions. Return `jobs_page_incomplete` for a count/length mismatch or larger graph. Main requires the five exact rows in Step 2. It permits extra names only when they start with `Native ocmm-lsp (` and every such row is `skipped`; it forbids `Verify (ocmm-lsp)`. LSP requires exactly the thirteen names from the design and forbids `Verify (ocmm)`.

Reject `null`, missing, queued, in-progress, cancelled, duplicate, or unknown active jobs. Store canonical sorted `{ name, conclusion }` rows in the receipt. Do not infer a job from overall run success.

When workflow identity or jobs fail, preserve required later surfaces as `UNRESOLVED` rather than `SKIPPED`; Tasks 4-5 add independent partial-state observations before finalizing.

- [ ] **Step 6: Run Task 3 GREEN and Tasks 1-2 regression gates**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 3 checker tests failed" }
```

Expected: target, staged, tag-peeling, run-binding, polling, terminal-failure, and both lane job suites pass; zero failures and zero live HTTP requests.

### Task 4: Verify the final GitHub Release bytes and downloaded hashes

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Modify: `scripts/check-release-completion.ts`
- Modify: `src/release-completion.test.ts`

**Interfaces:**
- Consumes: Task 3 fixed tag SHA/run/job result, GitHub Release JSON, HTTPS asset bytes, Task 2 checksum parser, and injected HTTP.
- Produces: populated `githubRelease`, `releaseAssets`, and `checksums` surfaces plus canonical asset rows with downloaded SHA-256 values.

- [ ] **Step 1: Add RED Release success fixtures for main and LSP**

Create fixture builders that derive asset names from `expectedReleaseAssets()` and deterministic bytes from each name. Generate checksum bytes with the Task 2 hash helper. Route exact URLs for `releases/tags/{tag}` and each `browser_download_url` under `https://downloads.example.invalid/`.

Add `checkReleaseCompletion verifies exact main Release bytes and checksums` and assert three canonical assets, `draft: false`, reported prerelease state, positive metadata/download sizes, `PASS` for all three Release surfaces, and one computed digest per non-checksum asset. Add `checkReleaseCompletion verifies all seventeen LSP Release assets` and assert the exact seventeen canonical names and sixteen computed digests.

- [ ] **Step 2: Add RED Release failure cases**

Add one mutation per fixture and assert `FAILED`, the named failed surface, and the exact safe code:

| Mutation | Surface | Code |
|---|---|---|
| Release tag differs | `githubRelease` | `release_tag_mismatch` |
| `draft: true` | `githubRelease` | `release_is_draft` |
| Missing or extra asset | `releaseAssets` | `release_asset_set_mismatch` |
| Duplicate asset name | `releaseAssets` | `release_asset_duplicate` |
| Metadata size zero | `releaseAssets` | `release_asset_empty` |
| Downloaded size differs | `releaseAssets` | `release_asset_size_mismatch` |
| Checksum malformed | `checksums` | `checksum_format_invalid` |
| Checksum omits an asset | `checksums` | `checksum_coverage_mismatch` |
| Download digest differs | `checksums` | `checksum_digest_mismatch` |

Assert every receipt retains all fixed surface keys and excludes download URLs and response bodies.

- [ ] **Step 3: Run Release tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="Release bytes|Release assets|Release failure|checksum" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: final Release proof unexpectedly passes" }
```

Expected: nonzero exit because remote Release decoding/download verification is absent.

- [ ] **Step 4: Implement exact Release metadata, download-size, and digest proof**

Decode the Release by exact tag. Require `tag_name`, boolean `draft`, boolean `prerelease`, and an asset array containing unique `name`, positive integer `size`, and HTTPS `browser_download_url`. Compare canonical names exactly.

Download checksum bytes first, require its downloaded length to equal its metadata size, parse through Task 2's shared parser, then download every non-checksum asset in canonical order. Require each downloaded payload length to equal its own metadata size and compute `createHash("sha256")`. Populate checksum asset with `sha256: null`; populate every payload with its lower-case digest. Never copy remote URLs into receipts or errors.

A visible Release with wrong final content is definite `FAILED`. A Release/asset `404`, `429`, `5xx`, or network exception remains retryable for Task 5's loop.

- [ ] **Step 5: Run Task 4 GREEN and prior regression gates**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 4 Release proof tests failed" }
```

Expected: Tasks 1-4 tests pass with zero failures and no live HTTP.

### Task 5: Prove registries and pinned LSP with bounded uncertainty

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Modify: `scripts/check-release-completion.ts`
- Modify: `src/release-completion.test.ts`

**Interfaces:**
- Consumes: Task 4 Release proof, normalized response headers plus `HttpService` context, npm/GitHub Packages metadata, optional `GITHUB_TOKEN`, main pinned-LSP Release JSON, explicit `checkedAt`, and injected deadline clock.
- Produces: populated `npm`, `githubPackages`, and `pinnedLspRelease` surfaces; header-proven GitHub REST rate-limit classification; canonical package/error arrays; retry/deadline state machine; final `COMPLETED`, `FAILED`, or `UNRESOLVED` remote receipt.

- [ ] **Step 1: Add RED main, LSP, and manual-dispatch registry tests**

Add these exact tests and assertions:

- `checkReleaseCompletion completes every required main push surface`: full main fixture, npm `ocmm@1.2.3`, GitHub Packages `@owner/ocmm@1.2.3`, non-draft pinned `ocmm-lsp-v4.5.6`, every required surface `PASS`, and final `COMPLETED`.
- `checkReleaseCompletion completes eight LSP npm packages and skips main-only surfaces`: exact eight canonical package names at `4.5.6`, `githubPackages` and `pinnedLspRelease` `SKIPPED`, and final `COMPLETED`.
- `checkReleaseCompletion skips GitHub Packages for a bound main workflow_dispatch run`: explicit run ID and tag-bound dispatch metadata, npm/pinned LSP `PASS`, GitHub Packages `SKIPPED`, and no npm.pkg.github.com request.

Use `githubToken: "sentinel-secret-token"` only in the injected fixture. Assert the serialized receipt excludes that sentinel.

- [ ] **Step 2: Add RED registry, retry, deadline, and permission cases**

Add exact tests:

1. `checkReleaseCompletion fails a registry manifest name or version mismatch`
2. `checkReleaseCompletion fails a draft pinned LSP Release`
3. `checkReleaseCompletion retries 404 429 5xx and network errors then completes`
4. `checkReleaseCompletion returns UNRESOLVED when retryable propagation reaches the deadline`
5. `checkReleaseCompletion fails a permanent 400 without sleeping`
6. `checkReleaseCompletion returns UNRESOLVED when GitHub Packages token is missing`
7. `checkReleaseCompletion returns UNRESOLVED when GitHub Packages permission is unproven`
8. `checkReleaseCompletion retries a 200 registry response without the exact version`
9. `checkReleaseCompletion fails unexpected HTTP statuses without retry`
10. `checkReleaseCompletion scopes Authorization to GitHub API and Packages origins`
11. `checkReleaseCompletion retries header-proven GitHub rate-limit 403 responses`
12. `checkReleaseCompletion fails a GitHub permission 403 without credible rate-limit headers`

For retry success, place one `404`, `429`, `500`, and thrown network error before valid responses on separate required routes. Assert fixed-interval sleeps and no sleep after proof. For deadline, set `checkedAt: clock.now()`, use `deadlineMs: 25` and `pollIntervalMs: 10`, assert sleeps `[10, 10, 5]`, and prove `clock.now().getTime()` stops exactly at `checkedAt.getTime() + 25`. For permanent `400` and unexpected `204`/`302`, assert one request and no sleep. GitHub Packages `401` and `403` must both produce `github_packages_permission_unproven` without claiming package absence. With `githubToken: "sentinel-secret-token"`, assert an Authorization header is present only for exact `https://api.github.com` and `https://npm.pkg.github.com` origins and absent from npmjs.org plus every asset URL.

For GitHub REST `403`, use two local retry-then-success subcases: normalized `{ "x-ratelimit-remaining": "0", "x-ratelimit-reset": futureUnixSeconds }` and normalized `{ "retry-after": "1" }`. Assert each sleeps and eventually passes. Use permission-failure subcases with no headers, `remaining` without reset, stale/malformed/signed/comma-joined values, and a body-only `{"message":"You have exceeded a secondary rate limit"}` claim; each must make exactly one request to the failing route, sleep zero times, and return `FAILED` after the contract's one-shot observations of other independent surfaces. Include response header `x-test-secret: response-secret-sentinel` and sensitive body text, then assert neither sentinel nor any header/body value appears in serialized receipts or errors. The implementation intentionally has no body-signal branch.

- [ ] **Step 3: Run Task 5 tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="required main push|eight LSP npm|workflow_dispatch|registry|pinned LSP|retries|UNRESOLVED|permanent 400|GitHub Packages|exact version|rate-limit 403|permission 403" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: registry and uncertainty behavior unexpectedly passes" }
```

Expected: nonzero exit because registry/pinned-LSP probes and the final retry loop are absent.

- [ ] **Step 4: Implement exact npm, GitHub Packages, and pinned-LSP proof**

Use:

```ts
function registryMetadataUrl(registry: "https://registry.npmjs.org" | "https://npm.pkg.github.com", packageName: string): string {
  return `${registry}/${encodeURIComponent(packageName)}`
}
```

Decode a top-level object with `versions`. Pass only when `Object.hasOwn(versions, version)` and the matching manifest has exact `name` and `version`; never accept `dist-tags.latest`. A `200` without the exact version remains propagation.

Main npm is `ocmm`. LSP npm names come from `ocmmLspPlatformPackages()`. Main push GitHub Packages is `@${owner.toLowerCase()}/ocmm` and requires the token. Scope the token to request builders for exact origins `https://api.github.com` and `https://npm.pkg.github.com`; never attach it to registry.npmjs.org or browser download URLs. Discard caught transport exception messages and record only safe retry codes. For main, require exact non-draft `releases/tags/ocmm-lsp-v${target.pinnedLspVersion}` without querying its assets, packages, or workflow.

- [ ] **Step 5: Implement retry/deadline and partial-state finalization**

Implement exact header-only GitHub rate-limit evidence:

```ts
const POSITIVE_DECIMAL = /^[1-9]\d*$/

function parsePositiveSafeInteger(value: string | undefined): number | null {
  if (value === undefined || !POSITIVE_DECIMAL.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function hasCredibleGitHubRateLimit(headers: Readonly<Record<string, string>>, now: Date): boolean {
  if (!Number.isFinite(now.getTime())) return false
  if (parsePositiveSafeInteger(headers["retry-after"]) !== null) return true
  if (headers["x-ratelimit-remaining"] !== "0") return false
  const resetSeconds = parsePositiveSafeInteger(headers["x-ratelimit-reset"])
  if (resetSeconds === null || !Number.isSafeInteger(resetSeconds * 1000)) return false
  return resetSeconds * 1000 > now.getTime()
}
```

In `classifyHttp(response, context)`, classify every `429` as `retry`; classify `403` as `retry` only when `context.service === "github-api"` and `hasCredibleGitHubRateLimit(response.headers, context.now)` is true. A GitHub REST `403` without that evidence is `failed`. Preserve the separate GitHub Packages `401`/`403` result `github-packages-unresolved`; npmjs and asset `403` responses are `failed`. Do not read `response.body`, copy header values, or serialize transport errors while deciding.

Make probes return `PASS`, definite `FAILED`, or retryable `UNRESOLVED`. Validate `options.checkedAt` as a valid `Date`; capture `deadlineAt = options.checkedAt.getTime() + deadlineMs` once at function entry after validating that the duration, interval, and sum are positive safe integers. Bind tag SHA and run ID once. Repeat only unresolved probes, while re-resolving the tag and comparing it to the bound SHA on every cycle. Return immediately on full proof only after a final matching peel. On definite workflow/content failure, observe every independent surface once and finalize `FAILED` without sleeping. When only retryable states remain, compute `nowMs = clock.now().getTime()` from the injected clock and sleep `Math.min(pollIntervalMs, deadlineAt - nowMs)` only when the remainder is positive; at the deadline finalize `UNRESOLVED`. Never erase prior definite errors or rebind identity. Treat every status outside expected `200`, retryable `404`/`429`/`5xx`, header-proven GitHub REST rate-limit `403`, and GitHub-Packages-only `401`/`403` as definite `FAILED`.

- [ ] **Step 6: Run Task 5 GREEN and all remote regression tests**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 5 registry and retry tests failed" }
```

Expected: Tasks 1-5 pass; main and LSP receipts complete only with every required surface; retryable uncertainty never passes.

### Task 6: Expose the stable CLI receipt and fixed exit codes

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Modify: `scripts/check-release-completion.ts`
- Modify: `src/release-completion.test.ts`
- Modify: `package.json:33-50`

**Interfaces:**
- Consumes: Task 5 finalized receipts, CLI arguments, `NodeJS.ProcessEnv`, injected `CliRuntime.clock`, `CliRuntime.validateStaged(root, assetsDir, tag, checkedAt)`, and the real package-manager executable.
- Produces: `main(argv?, env?, runtime?): Promise<number>`, `createProductionClock()`, `createProductionRuntime(clock)`, one explicit checked-at date per invocation, one stdout JSON object, exits `0/1/2`, token redaction, direct-execution guard, and a tested silent child-process package-script invocation.

- [ ] **Step 1: Add RED CLI parsing, JSON, exit-code, and token-redaction tests**

Use an injected `CliRuntime` whose `clock.now()` returns `new Date("2027-02-03T04:05:06.000Z")`. Add `main writes one stable JSON receipt and maps all outcomes to fixed exit codes`; invoke runtimes returning each outcome and assert one JSON object plus newline, exit `0/1/2`, and the exact fixed `surfaces` key order. Add `main passes one injected checkedAt to staged remote and argument-failure receipts`; assert staged `validateStaged` receives that exact `Date`, remote `check` receives `options.checkedAt` and the same clock, and invalid arguments emit `checkedAt: "2027-02-03T04:05:06.000Z"` without calling either checker. Add `main rejects missing duplicate unknown and invalid CLI options before remote checking`; cover mode, repository, tag, run-id, deadline-ms, poll-ms, and assets-dir, asserting `FAILED`/exit `1` and zero remote calls. Add `main never serializes GITHUB_TOKEN`; pass `sentinel-secret-token` through env and assert no output or safe error contains it.

Duplicate options fail rather than last-one-wins. Validate repository with exactly two `/`-separated segments, each matching `[A-Za-z0-9][A-Za-z0-9._-]*`. Remote defaults are duration `deadline-ms=5400000` and interval `poll-ms=15000`; both and their `checkedAt.getTime()` deadline sum must be positive safe integers. Staged mode requires `assets-dir`; remote mode requires `repository` and forbids `assets-dir`.

Also add this exact real-process regression test to `src/release-completion.test.ts`. Extend imports with `spawnSync` from `node:child_process`, `existsSync` from `node:fs`, `delimiter` from `node:path`, and `pathToFileURL` from `node:url`:

```ts
function resolvePnpmExecutable(): string {
  if (process.platform !== "win32") return "pnpm"
  const pathValue = process.env.Path ?? process.env.PATH ?? ""
  const directories = pathValue.split(delimiter).map((entry) => entry.replace(/^"|"$/g, ""))
  for (const executable of ["pnpm.cmd", "pnpm.exe"] as const) {
    for (const directory of directories) {
      if (directory.length === 0) continue
      const candidate = join(directory, executable)
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
  }
  throw new Error("pnpm.cmd or pnpm.exe is not available on PATH")
}

test("real staged package-script smoke is network-free and machine-readable", () => {
  const root = mkdtempSync(join(tmpdir(), "ocmm-real-staged-smoke-"))
  try {
    const productRoot = process.cwd()
    const productPackage = JSON.parse(readFileSync(join(productRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    assert.equal(
      productPackage.scripts?.["check:release-completion"],
      "node --experimental-strip-types scripts/check-release-completion.ts",
    )

    const checkerPath = join(productRoot, "scripts", "check-release-completion.ts").replace(/\\/g, "/")
    writeJson(join(root, "package.json"), {
      name: "ocmm-release-completion-smoke",
      private: true,
      version: "0.6.6",
      ocmm: { lspVersion: "0.3.2" },
      scripts: {
        "check:release-completion": `node --experimental-strip-types ${JSON.stringify(checkerPath)}`,
      },
    })

    const assetsDir = join(root, "release-assets")
    mkdirSync(assetsDir)
    const payloadNames = [
      "deepwork-codex-plugin-0.6.6.tgz",
      "ocmm-opencode-plugin-0.6.6.tgz",
    ] as const
    const checksumRows: string[] = []
    for (const [index, name] of payloadNames.entries()) {
      const bytes = Buffer.from(`real-staged-smoke-${index}-${name}\n`)
      writeFileSync(join(assetsDir, name), bytes)
      checksumRows.push(`${sha256(bytes)}  ${name}`)
    }
    writeFileSync(join(assetsDir, "SHA256SUMS.txt"), `${checksumRows.join("\n")}\n`)

    const networkSentinel = "STAGED_NETWORK_ATTEMPT_SENTINEL"
    const secretSentinel = "staged-child-secret-sentinel"
    const preloadPath = join(root, "deny-network.mjs")
    writeFileSync(
      preloadPath,
      `globalThis.fetch = () => { throw new Error(${JSON.stringify(networkSentinel)}) }\n`,
    )

    const pnpmExecutable = resolvePnpmExecutable()
    const pnpmArgs = [
      "--silent",
      "run",
      "check:release-completion",
      "--",
      "--mode",
      "staged",
      "--tag",
      "v0.6.6",
      "--assets-dir",
      assetsDir,
    ]
    const childOptions = {
      cwd: root,
      encoding: "utf8" as const,
      env: {
        ...process.env,
        GITHUB_TOKEN: secretSentinel,
        NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
      },
      timeout: 30_000,
      windowsHide: true,
    }
    const child = process.platform === "win32" && pnpmExecutable.toLowerCase().endsWith(".cmd")
      ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", pnpmExecutable, ...pnpmArgs], childOptions)
      : spawnSync(pnpmExecutable, pnpmArgs, childOptions)

    assert.ifError(child.error)
    assert.equal(child.signal, null)
    assert.equal(child.status, 0, `staged child failed: ${child.stderr}`)
    assert.equal(child.stderr, "")
    assert.equal(child.stdout.endsWith("\n"), true)
    const receipt = JSON.parse(child.stdout) as Record<string, unknown>
    assert.equal(receipt.schemaVersion, 1)
    assert.equal(receipt.outcome, "COMPLETED")
    assert.equal(receipt.repository, "local")
    assert.equal(receipt.lane, "ocmm")
    assert.equal(receipt.tag, "v0.6.6")
    assert.equal(receipt.version, "0.6.6")
    assert.equal(typeof receipt.checkedAt, "string")
    assert.equal(new Date(receipt.checkedAt as string).toISOString(), receipt.checkedAt)
    const output = `${child.stdout}${child.stderr}`
    assert.equal(output.includes(secretSentinel), false)
    assert.equal(output.includes(networkSentinel), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

This test invokes the exact `pnpm --silent run check:release-completion -- --mode staged --tag v0.6.6 --assets-dir <temp-assets>` argument sequence in a temporary `0.6.6` package root. On Windows it prefers `pnpm.cmd` and supports this repository's Scoop `pnpm.exe` shim; elsewhere it uses `pnpm`. The temporary package asserts the tracked product script text before pointing the same Node entry point at the temporary root. `JSON.parse(child.stdout)` rejects banners or a second JSON value, the ESM preload makes any `fetch` call throw, exit `0` proves staged mode did not depend on network, and `finally` removes every fixture even on failure.

- [ ] **Step 2: Run CLI tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="main writes|main passes one injected|main rejects|main never|real staged package-script" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: CLI behavior unexpectedly passes" }
```

Expected: nonzero exit because `CliRuntime`/`main()` are absent or incomplete and the tracked `check:release-completion` package script has not yet been added; the real child-process test cannot produce one `COMPLETED` receipt.

- [ ] **Step 3: Implement CLI parsing, production runtime, direct execution, and package script**

Define the runtime exactly as the design:

```ts
function createProductionClock(): Clock {
  return {
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

function createProductionRuntime(clock: Clock): CliRuntime {
  return {
    clock,
    check: checkReleaseCompletion,
    validateStaged: validateStagedReleaseAssets,
    writeStdout: (text) => process.stdout.write(text),
  }
}
```

Implement `main(argv = process.argv.slice(2), env = process.env, runtime?: CliRuntime)`. Inside this composition root, set `effectiveRuntime = runtime ?? createProductionRuntime(createProductionClock())` and capture `checkedAt = effectiveRuntime.clock.now()` exactly once before argument parsing. Validate that date once. Pass it to `makeReceipt()` for argument failures, to `effectiveRuntime.validateStaged(root, assetsDir, tag, checkedAt)`, or as `CheckReleaseCompletionOptions.checkedAt` together with the same `effectiveRuntime.clock`. No other production function constructs a date or reads ambient time; tests control clock/check/validation/stdout.

Serialize after finalization:

```ts
effectiveRuntime.writeStdout(`${JSON.stringify(receipt, null, 2)}\n`)
return receipt.outcome === "COMPLETED" ? 0 : receipt.outcome === "FAILED" ? 1 : 2
```

Use the repository ESM guard:

```ts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
```

Add only:

```json
"check:release-completion": "node --experimental-strip-types scripts/check-release-completion.ts"
```

Preserve package version, pinned LSP version, dependencies, and all other scripts.

- [ ] **Step 4: Run Task 6 GREEN and direct invalid-input smoke**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 6 CLI tests failed" }

pnpm --silent run check:release-completion -- --mode remote --repository invalid --tag v1.2.3
if ($LASTEXITCODE -ne 1) { throw "invalid CLI input did not return FAILED exit 1" }
```

Expected: all checker tests pass, including the real child-process staged package script with exact `v0.6.6` assets and network denial; invalid repository syntax emits one JSON failure receipt and exits `1` before any network call.

### Task 7: Put exact staged gates before irreversible workflow writes

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Modify: `src/release-completion.test.ts`
- Modify: `.github/workflows/release.yml:201-279,332-521,523-560`

**Interfaces:**
- Consumes: Task 6 `pnpm --silent run check:release-completion -- --mode staged`; existing LSP package staging, main normalized package staging, npm Trusted Publishing, conditional GitHub Packages publication, and artifact upload.
- Produces: one LSP staged validation before eight npm publishes/artifact upload; one main staged validation before npm/GitHub Packages/artifact upload; exact GitHub Release selected-lane success/inactive-lane skipped routing.

- [ ] **Step 1: Add RED workflow source assertions without a YAML dependency**

Import `readFileSync` if not already present. Add helpers that slice the source from one exact job key to the next; fail when either boundary appears zero or multiple times:

```ts
function workflowJob(source: string, job: string, nextJob: string): string {
  const startMarker = `  ${job}:\n`
  const endMarker = `  ${nextJob}:\n`
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `missing workflow job ${job}`)
  assert.notEqual(end, -1, `missing workflow job boundary ${nextJob}`)
  return source.slice(start, end)
}
```

Add exact tests:

```ts
test("release workflow validates LSP assets before publish and upload", () => {
  const source = readFileSync(join(process.cwd(), ".github", "workflows", "release.yml"), "utf8")
  const job = workflowJob(source, "lsp-package", "stage-pinned-lsp")
  const checksum = job.indexOf("- name: Generate checksums")
  const validate = job.indexOf("- name: Validate staged release assets")
  const publish = job.indexOf("npm publish")
  const upload = job.indexOf("name: github-release-assets")
  assert.equal(checksum >= 0 && checksum < validate, true)
  assert.equal(validate < publish && validate < upload, true)
  assert.match(job, /--mode staged --tag "\$\{\{ env\.RELEASE_TAG \}\}" --assets-dir release-assets/)
})

test("release workflow validates main assets before npm GitHub Packages and upload", () => {
  const source = readFileSync(join(process.cwd(), ".github", "workflows", "release.yml"), "utf8")
  const job = workflowJob(source, "ocmm-package", "github-release")
  const checksum = job.indexOf("- name: Generate checksums")
  const validate = job.indexOf("- name: Validate staged release assets")
  assert.equal(checksum >= 0 && checksum < validate, true)
  for (const marker of ["Publish ocmm to npmjs.org", "Publish scoped package to GitHub Packages", "name: github-release-assets"] as const) {
    assert.equal(validate < job.indexOf(marker), true, `${marker} occurs before staged validation`)
  }
})

test("release workflow publishes a GitHub Release only for one exact lane pair", () => {
  const source = readFileSync(join(process.cwd(), ".github", "workflows", "release.yml"), "utf8")
  const job = source.slice(source.indexOf("  github-release:\n"))
  assert.match(job, /needs\.lsp-package\.result == 'success'.*needs\.ocmm-package\.result == 'skipped'/s)
  assert.match(job, /needs\.lsp-package\.result == 'skipped'.*needs\.ocmm-package\.result == 'success'/s)
  assert.doesNotMatch(job, /needs\.lsp-package\.result == 'success' \|\| needs\.ocmm-package\.result == 'success'/)
})
```

Also assert the workflow still contains `id-token: write`, both tag patterns, all eight matrix platforms, npmjs.org, npm.pkg.github.com, and these exact existing action versions: `actions/checkout@v7`, `actions/setup-node@v6`, `goto-bus-stop/setup-zig@v2`, `actions/download-artifact@v8`, and `actions/upload-artifact@v7`.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="release workflow" src/release-completion.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: workflow already satisfies the new staged contract" }
```

Expected: nonzero exit because staged validation steps are absent, checksums occur after publication, and the GitHub Release condition uses the old OR expression.

- [ ] **Step 3: Split LSP packing from publishing and add its staged gate**

In `lsp-package`, preserve checkout/setup/install/version/staging. Replace `Pack and publish npmjs.org platform packages` with two named steps:

1. `Pack npmjs.org platform packages` retains package-name/version reads, copies each package to its existing `$RUNNER_TEMP/npm-publish/$name` directory, and runs `npm pack` into `release-assets`; remove only the `npm view`/`npm publish` branch from this step.
2. Move `Generate checksums` immediately after packing.
3. Add the exact validation step:

```yaml
      - name: Validate staged release assets
        shell: pwsh
        run: |
          pnpm --silent run check:release-completion -- --mode staged --tag "${{ env.RELEASE_TAG }}" --assets-dir release-assets
          if ($LASTEXITCODE -ne 0) { throw "LSP staged release assets failed the completion contract" }
```

4. Add `Publish npmjs.org platform packages` after validation. Iterate the same eight `packages/ocmm-lsp-*` directories, recompute the exact name/version, reuse the corresponding prepared publish directory, and preserve the current `npm view` idempotent-skip plus `npm publish --registry=https://registry.npmjs.org --access public` behavior.
5. Keep `actions/upload-artifact@v7` after publication. It uploads only the already validated `release-assets/*`.

Do not change package contents, OIDC, action versions, registry URLs, or platform order.

- [ ] **Step 4: Move main checksums and staged validation before both registries**

In `ocmm-package`, preserve tarball construction and content smoke checks. Move `Generate checksums` from after GitHub Packages to immediately after `Build GitHub Release tarballs`. Add the same validation step with the main-specific failure message:

```yaml
      - name: Validate staged release assets
        shell: pwsh
        run: |
          pnpm --silent run check:release-completion -- --mode staged --tag "${{ env.RELEASE_TAG }}" --assets-dir release-assets
          if ($LASTEXITCODE -ne 0) { throw "Main staged release assets failed the completion contract" }
```

Keep `Publish ocmm to npmjs.org`, conditional `Publish scoped package to GitHub Packages`, and `actions/upload-artifact@v7` in that order after validation. Preserve their current script bodies and conditions.

- [ ] **Step 5: Replace the GitHub Release OR condition with explicit lane pairs**

Keep `always()` and cancellation protection. Express both existing route predicates directly:

```yaml
    if: >-
      ${{ always() && !cancelled() && (
        (((github.event_name == 'workflow_dispatch' && inputs.release_kind == 'ocmm-lsp') || (github.event_name != 'workflow_dispatch' && startsWith(github.ref_name, 'ocmm-lsp-v'))) && needs.lsp-package.result == 'success' && needs.ocmm-package.result == 'skipped') ||
        (((github.event_name == 'workflow_dispatch' && inputs.release_kind == 'ocmm') || (github.event_name != 'workflow_dispatch' && startsWith(github.ref_name, 'v') && !startsWith(github.ref_name, 'ocmm-lsp-v'))) && needs.lsp-package.result == 'skipped' && needs.ocmm-package.result == 'success')
      ) }}
```

Do not add `verify` or matrix jobs to `github-release.needs`; package-job results already transitively represent those active dependencies. Keep Release mutation/upload behavior unchanged.

- [ ] **Step 6: Run workflow GREEN and full checker regression tests**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/release-completion.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 7 release completion and workflow tests failed" }
```

Expected: staged ordering, exact lane pair, preserved workflow invariants, and all checker tests pass; zero failures.

### Task 8: Add and distribute the ocmm publish completion protocol

**Status:** Implemented and GREEN before the Task 9 structural refactor.

**Files:**
- Create: `skills/publish/SKILL.md`
- Modify: `src/intent/skill-loader.test.ts`
- Modify: `src/codex/plugin-generator.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/v1-maintenance.md`
- Generate: `plugins/deepwork/skills/publish/SKILL.md`
- Verify unchanged unless canonical generation requires otherwise: `.agents/plugins/marketplace.json`, `.codex/agents/**`, all other `plugins/deepwork/**`

**Interfaces:**
- Consumes: Task 6 remote CLI/receipt/exit contract, `loadSharedSkills()`, `generateCodexPlugin()`, the common Codex compatibility suffix, and the upstream publish skill's workflow-not-complete semantic.
- Produces: shared OpenCode `publish` skill; generated Codex `publish` skill; source/fresh/tracked equality tests; maintainer/user documentation; shared-skill provenance.

- [ ] **Step 1: Add RED shared-skill discovery and protocol tests**

In `src/intent/skill-loader.test.ts`, add `readFileSync` to the `node:fs` import and append:

```ts
test("shared publish skill is auto-discovered and defines the ocmm completion contract", () => {
  const publish = loadSharedSkills().find((skill) => skill.name === "publish")
  assert.ok(publish)
  assert.equal(publish.path.includes(join("skills", "v1")), false)
  const source = readFileSync(join(publish.path, "SKILL.md"), "utf8")
  assert.match(source, /^---\nname: publish\n/m)
  assert.match(source, /workflow terminal success is not release completion/i)
  assert.match(source, /check:release-completion/)
  assert.match(source, /COMPLETED/)
  assert.match(source, /FAILED/)
  assert.match(source, /UNRESOLVED/)
  assert.match(source, /never move, delete, or recreate the immutable tag/i)
  assert.doesNotMatch(source, /Discord|lazycodex|oh-my-opencode|oh-my-openagent|agent-discord/i)
  assert.equal(V1_INJECTED_SKILLS.includes("publish" as never), false)
  assert.equal(V1_COMMAND_SKILLS.includes("publish" as never), false)
})
```

The casts are test-only membership checks against readonly literal tuples; do not widen the production tuples.

- [ ] **Step 2: Add RED Codex source/fresh/tracked tree proof**

In `src/codex/plugin-generator.test.ts`, rename the test `Codex generated debugging and frontend skill trees mirror source inventory and bytes` to include publish. Extend its exact cases to:

```ts
for (const [name, requiredFile] of [
  ["debugging", "references/methodology/03-flaky-triage.md"],
  ["frontend", "references/design/interaction-skill.md"],
  ["publish", "SKILL.md"],
] as const) {
```

Keep `assertGeneratedSharedSkillTree()` unchanged. Preserve the existing debugging/frontend comparison and add `assert.equal(suffixes.get("debugging"), suffixes.get("publish"), "normalized shared-skill routers must carry the same canonical compatibility suffix")`, proving publish receives the same canonical Codex compatibility contract.

- [ ] **Step 3: Run skill tests and verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="shared publish skill|generated debugging.*publish" src/intent/skill-loader.test.ts src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -eq 0) { throw "RED failed: publish skill unexpectedly exists in source and generated bundle" }
```

Expected: nonzero exit because `skills/publish/SKILL.md` and its tracked generated tree do not exist.

- [ ] **Step 4: Create the shared ocmm-only publish skill**

Create `skills/publish/SKILL.md` with this source contract. Keep the frontmatter as the first bytes:

````markdown
---
name: publish
description: "Use for an explicitly authorized ocmm release. Treat publication as incomplete until the fail-closed completion checker proves every required surface; never repair code or move an immutable tag during publishing."
---

# Publish ocmm

Use this skill only after the user explicitly authorizes an ocmm release action. Loading the skill does not authorize a version change, Git write, workflow trigger, package publish, or GitHub Release mutation.

## Completion contract

Workflow terminal success is not release completion. A release is complete only when `pnpm --silent run check:release-completion` returns exit `0` and its JSON receipt has `outcome: "COMPLETED"`.

The receipt must bind one lane, exact tag/version, peeled tag commit, fixed `release.yml` run, lane-correct job conclusions, exact non-empty Release assets, complete downloaded SHA-256 verification, npm visibility, and every lane-required additional surface. Main tag pushes require GitHub Packages proof. Main releases also require the pinned LSP Release to exist. LSP releases require all eight npm platform packages and do not require main package surfaces.

Never describe `FAILED`, `UNRESOLVED`, a nonterminal run, terminal workflow success without post-publication proof, or a partial surface set as complete.

## Ship-only behavior

- Do not start a code review, change code, repair a failed workflow, or open a fix loop while publishing.
- Do not use a workstation to overwrite registry packages or GitHub Release assets.
- Never move, delete, or recreate the immutable tag after publication starts.
- A repair is a separately authorized normal commit and new version/tag, or an explicitly authorized workflow rerun that preserves the same tag identity.
- Continue observing independent surfaces after one surface fails so the final report describes the full partial state.

## Required invocation

For a main tag push, run from the exact released checkout after the tag and matching run exist:

```powershell
if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) { throw "GITHUB_TOKEN with Actions and package read access is required" }
pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.6 --deadline-ms 5400000 --poll-ms 15000
```

Use the actual authorized tag for releases after `v0.6.6`. For a manually dispatched run, also pass its numeric `--run-id`; the run must itself be bound to the tag branch and peeled SHA.

Do not echo the token. Do not paste registry bodies, Authorization headers, or signed asset URLs into chat or evidence.

## Outcome handling

### COMPLETED

Report the tag, peeled SHA, fixed run ID/attempt/URL, lane, exact asset names, package names/versions, and checksum status from the receipt. Only this outcome permits the phrase “release complete.”

### FAILED

Report every surface status and safe error code. State that the immutable tag remains fixed. Do not repair or republish inside the publish session.

### UNRESOLVED

Report every surface lacking proof, the retained tag/SHA/run-ID/run-attempt identity, and whether the cause is propagation, retryable HTTP/network state, deadline, missing token, or package-read permission. A later checker rerun may resume proof without changing the tag.
````

Do not add command copies, helper scripts, OMO package names, chat announcements, release-note mutation, or direct `gh` requirements.

- [ ] **Step 5: Update release documentation and provenance**

Update `README.md` in the Release section with:

- workflow success is intermediate;
- the exact PowerShell main example from the design;
- exit `0/1/2` and `COMPLETED`/`FAILED`/`UNRESOLVED` meanings;
- main/LSP required-surface matrix;
- token redaction and main-push GitHub Packages proof;
- immutable-tag behavior after partial publication.

Update `AGENTS.md` Release Workflow and Publishing a new release sections with:

- both jobs' new staged gate before registry/artifact writes;
- post-run checker as the completion authority;
- exact job-level verification rather than run conclusion only;
- no tag movement/repair after partial publication;
- the later real `v0.6.6` PowerShell command, explicitly labeled as a release-stage command not to run during feature implementation.

Correct the existing main asset typo in `AGENTS.md` from `ocmm-codex-plugin-<version>.tgz` to the actual `deepwork-codex-plugin-<version>.tgz` while touching that paragraph.

Add this shared-skill provenance fact to `docs/v1-maintenance.md` alongside the other shared-skill paragraphs:

- `skills/publish/SKILL.md` is adapted from `omo/.agents/skills/publish/SKILL.md` as of 2026-07-31.
- Kept: workflow trigger/terminal state is not completion, ship-only no-fix behavior, post-publication verification, and complete/partial reporting.
- Replaced: ad hoc commands with the ocmm checker and receipt.
- Rejected: Discord, LazyCodex, OMO package families, bump automation, release-note mutation, duplicate command files, and Bash-only syntax.
- It is shared, auto-discovered, not injected, not under `skills/v1`, and copied into the generated Codex bundle.

- [ ] **Step 6: Build TypeScript and regenerate the Codex bundle**

Run:

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  pnpm run build:ts
  if ($LASTEXITCODE -ne 0) { throw "build:ts failed before Codex generation" }
  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "Codex generation failed" }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: `plugins/deepwork/skills/publish/SKILL.md` is generated. No user-global profile is consumed. Do not hand-edit the generated file.

- [ ] **Step 7: Run skill/generator tests and verify GREEN**

Run:

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  node --test --experimental-strip-types --test-reporter=spec src/intent/skill-loader.test.ts src/codex/plugin-generator.test.ts
  if ($LASTEXITCODE -ne 0) { throw "publish skill discovery or Codex mirror tests failed" }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: publish is discovered as a shared skill, excluded from v1 lists, contains the required contract, excludes OMO-only surfaces, and source/fresh/tracked generated trees pass.

- [ ] **Step 8: Prove generation is deterministic without using Git as a clean-tree oracle**

Run:

```powershell
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "approved temp parent is missing" }
$snapshot = Join-Path $tempParent ("ocmm-release-completion-generated-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $snapshot | Out-Null
try {
  cp.exe -R ".agents/plugins" (Join-Path $snapshot "agents-plugins")
  if ($LASTEXITCODE -ne 0) { throw "marketplace snapshot copy failed" }
  cp.exe -R ".codex/agents" (Join-Path $snapshot "codex-agents")
  if ($LASTEXITCODE -ne 0) { throw "Codex agent snapshot copy failed" }
  cp.exe -R "plugins/deepwork" (Join-Path $snapshot "deepwork")
  if ($LASTEXITCODE -ne 0) { throw "Codex plugin snapshot copy failed" }

  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  try {
    $env:OCMM_PROFILE = $null
    $env:OCMM_NO_PROFILE = $null
    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "second Codex generation failed" }
  } finally {
    $env:OCMM_PROFILE = $savedProfile
    $env:OCMM_NO_PROFILE = $savedNoProfile
  }

  diff.exe -r (Join-Path $snapshot "agents-plugins") ".agents/plugins"
  if ($LASTEXITCODE -ne 0) { throw "marketplace generation is not deterministic" }
  diff.exe -r (Join-Path $snapshot "codex-agents") ".codex/agents"
  if ($LASTEXITCODE -ne 0) { throw "Codex agent generation is not deterministic" }
  diff.exe -r (Join-Path $snapshot "deepwork") "plugins/deepwork"
  if ($LASTEXITCODE -ne 0) { throw "Codex plugin generation is not deterministic" }
} finally {
  if (Test-Path -LiteralPath $snapshot) { Remove-Item -LiteralPath $snapshot -Recurse -Force }
}
```

Expected: all three recursive comparisons exit `0`; the temporary snapshot is removed.

### Task 9: Split the checker and tests by responsibility without changing behavior

**Status:** Pending; execute before integrated final verification.

**Files:**
- Modify in place: `scripts/check-release-completion.ts`
- Create: `scripts/release-completion/contracts.ts`
- Create: `scripts/release-completion/receipt.ts`
- Create: `scripts/release-completion/target.ts`
- Create: `scripts/release-completion/checksums.ts`
- Create: `scripts/release-completion/staged.ts`
- Create: `scripts/release-completion/http.ts`
- Create: `scripts/release-completion/github-identity.ts`
- Create: `scripts/release-completion/github-release.ts`
- Create: `scripts/release-completion/registries.ts`
- Create: `scripts/release-completion/remote.ts`
- Create: `scripts/release-completion/cli.ts`
- Delete after scenario moves: `src/release-completion.test.ts`
- Create: `src/release-completion-test-support.test.ts`
- Create: `src/release-completion-target-staged.test.ts`
- Create: `src/release-completion-remote-identity.test.ts`
- Create: `src/release-completion-release-assets.test.ts`
- Create: `src/release-completion-registries-retry.test.ts`
- Create: `src/release-completion-cli.test.ts`
- Create: `src/release-completion-workflow.test.ts`
- Preserve unchanged: `package.json`, `.github/workflows/release.yml`, `skills/publish/SKILL.md`, `plugins/deepwork/skills/publish/SKILL.md`, `README.md`, `AGENTS.md`, `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: the implemented and GREEN Task 1–8 behavior in the current 2034-line checker and 1960-line test file, the exact existing public exports, the package script `node --experimental-strip-types scripts/check-release-completion.ts`, and all 46 existing test names/scenarios.
- Produces: the exact production/test file map above, a facade with the same public/direct-execution contract, an acyclic internal dependency graph, the same 46 passing behavior scenarios grouped by domain, and structural/diagnostic evidence suitable for Task 10.

- [ ] **Step 1: Record structural RED and a GREEN behavioral baseline**

This refactor's RED is responsibility concentration, not a fabricated behavior failure. Before moving code, record and assert the current physical sizes, list the concentrated declarations, and prove the existing behavior is green:

```powershell
$checkerLines = [int](((& wc.exe -l -- "scripts/check-release-completion.ts").Trim() -split '\s+')[0])
$testLines = [int](((& wc.exe -l -- "src/release-completion.test.ts").Trim() -split '\s+')[0])
if ($checkerLines -ne 2034 -or $testLines -ne 1960) {
  throw "unexpected structural baseline: checker=$checkerLines test=$testLines"
}

rg -n '^(export\s+)?(interface|type|class|const|function|async function)\s+' -- "scripts/check-release-completion.ts"
if ($LASTEXITCODE -ne 0) { throw "checker declaration inventory failed" }

node --test --experimental-strip-types --test-reporter=spec "src/release-completion.test.ts"
if ($LASTEXITCODE -ne 0) { throw "pre-refactor release-completion baseline is not GREEN" }
```

Expected: the recorded baseline is exactly 2034 production lines concentrated in one checker and 1960 test lines concentrated in one scenario file; all 46 existing tests pass with no live network request. Do not add a behavior assertion whose purpose is to fail.

- [ ] **Step 2: Move all tests into scenario domains before moving production implementation**

Create `src/release-completion-test-support.test.ts` with only fixtures shared by two or more domains: `writeJson`, `makeReleaseRoot`, `replaceRootPackage`, `FIXED_CHECKED_AT`, `sha256`, `writeValidStagedAssets`, `validateStaged`, `PlannedResponse`, `FakeClock`, `jsonResponse`, `createHttpFixture`, the shared repository/tag/SHA/job constants and URL builders, lightweight/annotated tag routes, `workflowRun`, `remoteOptions`, `combineRoutes`, `RemoteReleaseAsset`, `RemoteReleaseFixture`, Release URL/fixture mutation builders, `receiptSurfaceKeys`, and `successfulWorkflowRoutes`. It must define no `test()` scenario and must not become a second policy implementation.

Move without renaming scenarios or changing assertion semantics. Type-only narrowing may replace an assertion with an equivalent null-safe form when the strict Compiler API proves the original expression unsafe; specifically, change `asset.downloadedSize > 0` to `asset.downloadedSize !== null && asset.downloadedSize > 0` while preserving the same positive-size requirement:

1. The 5 tests currently at `src/release-completion.test.ts:94-288` to `src/release-completion-target-staged.test.ts`.
2. The 13 tests at `src/release-completion.test.ts:548-1014` to `src/release-completion-remote-identity.test.ts`.
3. The 3 tests at `src/release-completion.test.ts:1016-1202` to `src/release-completion-release-assets.test.ts`.
4. Registry-only constants/builders at `src/release-completion.test.ts:1204-1263` and the 16 tests at `src/release-completion.test.ts:1265-1585` to `src/release-completion-registries-retry.test.ts`.
5. CLI receipt/runtime helpers at `src/release-completion.test.ts:1587-1635`, the 4 injected CLI tests at `src/release-completion.test.ts:1637-1777`, child-process helpers at `src/release-completion.test.ts:1779-1824`, and the named real smoke at `src/release-completion.test.ts:1826-1884` to `src/release-completion-cli.test.ts`.
6. Workflow source/boundary helpers at `src/release-completion.test.ts:26-46` and the 4 tests at `src/release-completion.test.ts:1886-1960` to `src/release-completion-workflow.test.ts`.

Every scenario file must import production values/types only from `../scripts/check-release-completion.ts`; use the support module only for deterministic fixtures. Remove `src/release-completion.test.ts` only after all test names are present in the new files. Then run the split suite while production is still in the original checker:

```powershell
$releaseTests = @(
  "src/release-completion-test-support.test.ts",
  "src/release-completion-target-staged.test.ts",
  "src/release-completion-remote-identity.test.ts",
  "src/release-completion-release-assets.test.ts",
  "src/release-completion-registries-retry.test.ts",
  "src/release-completion-cli.test.ts",
  "src/release-completion-workflow.test.ts"
)
node --test --experimental-strip-types --test-reporter=spec @releaseTests
if ($LASTEXITCODE -ne 0) { throw "test-domain split changed behavior before production extraction" }
if (Test-Path -LiteralPath "src/release-completion.test.ts") { throw "old monolithic test file still exists" }
```

Expected: 46 tests pass under the same facade; the support file adds no scenario; the historical monolithic test path is gone.

- [ ] **Step 3: Extract contracts, receipt policy, target, checksums, and staged validation**

Move definitions, preserving their bodies and signatures rather than wrapping or copying them:

1. `contracts.ts` receives `ReleaseLane`, `ReleaseTarget`, `CompletionOutcome`, `SurfaceStatus`, `SurfaceReceipt`, `ReleaseCompletionSurfaces`, `ReleaseCompletionReceipt`, `HttpRequest`, `HttpResponse`, `HttpClient`, `Clock`, `CheckReleaseCompletionOptions`, `HttpService`, `HttpDisposition`, `SurfaceName`, and `RunEvent`. Only the types that were already public are later re-exported from the facade.
2. `receipt.ts` receives `SURFACE_KEYS`, ordinal sort/exact-name helpers, unresolved/staged surface constructors, `setSurface`, `addFailure`, `addUnresolved`, `setStagedRemoteSurfaces`, `makeReceipt`, deterministic deduplication/finalization, `markRetryable`, `allSurfacesProven`, `hasDefiniteFailure`, `setLaneSkippedSurfaces`, and `setDispatchGithubPackagesSkipped`.
3. `target.ts` receives strict version/tag constants, root/pinned version readers, `CHECKSUM_NAME`, `parseReleaseTarget()`, and `expectedReleaseAssets()`; adjust relative imports to `../lsp-package-manifest.ts` and `../../src/shared/ocmm-lsp-binary.ts`.
4. `checksums.ts` receives `CHECKSUM_ROW`, `ParsedChecksums`, `ChecksumContractError`, `checksumFailureDetail()`, and `parseChecksums()` and consumes the one canonical `CHECKSUM_NAME` from `target.ts`.
5. `staged.ts` receives `validateStagedReleaseAssets()` and only its Node filesystem/crypto imports.

The dependency direction is `contracts -> receipt -> target/checksums -> staged`; neither contracts nor receipt may import an adapter/proof/orchestration module. Update the facade to import/re-export moved public symbols explicitly and run all seven split test paths from Step 2 before continuing. Expected: all 46 scenarios remain GREEN.

- [ ] **Step 4: Extract HTTP, GitHub identity, Release, and registry proof modules**

Move the live definitions exactly once:

1. `http.ts` receives `HttpContractError`, date/integer/object/string/SHA/repository validation primitives, safe origin constants, `normalizeResponseHeaders()`, `createProductionHttpClient()`, rate-limit parsing, `classifyHttp()`, `registryMetadataUrl()`, strict JSON decoding, and `requestJson()`/`requestBytes()`.
2. `github-identity.ts` receives GitHub request headers, tag/run/discovery/jobs result types and decoders, `peelTag()`, `hasMatchingRunIdentity()`, lane-specific job validation, and `ensureBoundTagUnchanged()`.
3. `github-release.ts` receives Release metadata/asset types and decoders, `ReleaseAssetState`, and `observeReleaseProof()` including downloaded-size and checksum/digest verification.
4. `registries.ts` receives package headers/status/manifest decoding, `observeRegistryPackage()`, `observeNpmProof()`, `observeGithubPackagesProof()`, and `observePinnedLspRelease()`.

HTTP and decoder policy must have one owner. Proof modules consume receipt mutations and HTTP results; they do not create alternate finalizers or retry loops. Run all seven split test paths from Step 2 again. Expected: all 46 scenarios remain GREEN with the same URLs, headers, safe codes/details, receipt rows, sleeps, and outcomes.

- [ ] **Step 5: Extract remote orchestration and CLI, finalize the facade, and update the real smoke fixture**

Move the live `checkReleaseCompletion()` state machine to `remote.ts`; it composes the proof modules but does not duplicate their decoders or policies. Move `CliOptions`, option/default parsing, CLI failure/exit mapping, `CliRuntime`, `createProductionClock()`, `createProductionRuntime()`, and `main()` to `cli.ts`.

Delete the private, unexported, unreferenced `legacyCheckReleaseCompletion()` body instead of creating a legacy module. Replace `scripts/check-release-completion.ts` with a thin facade that:

- explicitly re-exports values `parseReleaseTarget`, `expectedReleaseAssets`, `validateStagedReleaseAssets`, `normalizeResponseHeaders`, `createProductionHttpClient`, `classifyHttp`, `registryMetadataUrl`, `checkReleaseCompletion`, `createProductionClock`, `createProductionRuntime`, and `main`;
- explicitly re-exports types `ReleaseLane`, `ReleaseTarget`, `CompletionOutcome`, `SurfaceStatus`, `SurfaceReceipt`, `ReleaseCompletionReceipt`, `HttpRequest`, `HttpResponse`, `HttpClient`, `Clock`, `CheckReleaseCompletionOptions`, `HttpService`, `HttpDisposition`, and `CliRuntime`;
- uses no `export *` and adds no new public export;
- imports `main` and `pathToFileURL`, then retains the sole existing direct-execution guard without changing its behavior.

In the CLI test's `copyReleaseCheckerPackageFiles()`, add `cpSync` and recursively copy `scripts/release-completion/` into the temporary package, while retaining copies of the facade, `scripts/lsp-package-manifest.ts`, and `src/shared/ocmm-lsp-binary.ts`. Do not alter the asserted package-script string or child arguments. Run all seven split test paths from Step 2. Expected: all 46 scenarios, including the real network-denied package-script child, remain GREEN.

- [ ] **Step 6: Prove the structural contract and exact runtime export surface**

```powershell
$productionModules = @(
  "scripts/release-completion/contracts.ts",
  "scripts/release-completion/receipt.ts",
  "scripts/release-completion/target.ts",
  "scripts/release-completion/checksums.ts",
  "scripts/release-completion/staged.ts",
  "scripts/release-completion/http.ts",
  "scripts/release-completion/github-identity.ts",
  "scripts/release-completion/github-release.ts",
  "scripts/release-completion/registries.ts",
  "scripts/release-completion/remote.ts",
  "scripts/release-completion/cli.ts"
)

function Get-PureLineCount([string]$Path) {
  $source = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path))
  $withoutBlocks = [regex]::Replace($source, '(?s)/\*.*?\*/', '')
  return @(($withoutBlocks -split "`r?`n") | Where-Object {
    $_.Trim().Length -gt 0 -and -not $_.TrimStart().StartsWith('//')
  }).Count
}

$facadeLines = Get-PureLineCount "scripts/check-release-completion.ts"
if ($facadeLines -gt 60) { throw "public facade is not thin: $facadeLines pure lines" }
foreach ($path in $productionModules) {
  $count = Get-PureLineCount $path
  if ($count -gt 250) { throw "$path exceeds the focused 250-pure-line budget: $count" }
}

$expectedScenarioCounts = [ordered]@{
  "src/release-completion-target-staged.test.ts" = 5
  "src/release-completion-remote-identity.test.ts" = 13
  "src/release-completion-release-assets.test.ts" = 3
  "src/release-completion-registries-retry.test.ts" = 16
  "src/release-completion-cli.test.ts" = 5
  "src/release-completion-workflow.test.ts" = 4
}
foreach ($entry in $expectedScenarioCounts.GetEnumerator()) {
  $count = [int](& rg -c '^test\("' -- $entry.Key)
  if ($LASTEXITCODE -ne 0 -or $count -ne $entry.Value) {
    throw "$($entry.Key) has $count tests; expected $($entry.Value)"
  }
}
rg -n '^test\("' -- "src/release-completion-test-support.test.ts"
if ($LASTEXITCODE -eq 0) { throw "test support contains an independent scenario" }
if ($LASTEXITCODE -ne 1) { throw "test support scenario scan failed" }
if (Test-Path -LiteralPath "src/release-completion.test.ts") { throw "old monolithic test still exists" }

rg -n 'legacyCheckReleaseCompletion' -- "scripts"
if ($LASTEXITCODE -eq 0) { throw "dead legacy checker duplicate still exists" }
if ($LASTEXITCODE -ne 1) { throw "legacy checker scan failed" }

node --experimental-strip-types -e "const module = await import('./scripts/check-release-completion.ts'); const expected = ['checkReleaseCompletion','classifyHttp','createProductionClock','createProductionHttpClient','createProductionRuntime','expectedReleaseAssets','main','normalizeResponseHeaders','parseReleaseTarget','registryMetadataUrl','validateStagedReleaseAssets'].sort(); const actual = Object.keys(module).sort(); if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('runtime export surface changed: ' + JSON.stringify(actual))"
if ($LASTEXITCODE -ne 0) { throw "checker runtime export compatibility failed" }

rg -n 'export\s+\*' -- "scripts/check-release-completion.ts"
if ($LASTEXITCODE -eq 0) { throw "facade must use explicit exports" }
if ($LASTEXITCODE -ne 1) { throw "facade wildcard-export scan failed" }
```

Expected: the facade is at most 60 pure lines, every internal production module is at most 250 pure lines, scenario counts are exactly `5 + 13 + 3 + 16 + 5 + 4 = 46`, the support module contains no `test()`, the old test and private legacy duplicate are absent, and the facade has exactly the pre-refactor runtime values with no wildcard export.

- [ ] **Step 7: Run all split tests, compiler diagnostics, typecheck, build, and diff hygiene**

The current environment has no configured TypeScript language server, so use the already installed TypeScript Compiler API over every changed production/test path; do not install anything:

```powershell
$changedTs = @(
  "scripts/check-release-completion.ts",
  "scripts/release-completion/contracts.ts",
  "scripts/release-completion/receipt.ts",
  "scripts/release-completion/target.ts",
  "scripts/release-completion/checksums.ts",
  "scripts/release-completion/staged.ts",
  "scripts/release-completion/http.ts",
  "scripts/release-completion/github-identity.ts",
  "scripts/release-completion/github-release.ts",
  "scripts/release-completion/registries.ts",
  "scripts/release-completion/remote.ts",
  "scripts/release-completion/cli.ts",
  "src/release-completion-test-support.test.ts",
  "src/release-completion-target-staged.test.ts",
  "src/release-completion-remote-identity.test.ts",
  "src/release-completion-release-assets.test.ts",
  "src/release-completion-registries-retry.test.ts",
  "src/release-completion-cli.test.ts",
  "src/release-completion-workflow.test.ts"
)
$releaseTests = @($changedTs | Where-Object { $_ -like "src/*.test.ts" })
node --test --experimental-strip-types --test-reporter=spec @releaseTests
if ($LASTEXITCODE -ne 0) { throw "split release-completion tests failed" }

$savedDiagnosticFiles = $env:OCMM_RELEASE_COMPLETION_TS_FILES
try {
  $env:OCMM_RELEASE_COMPLETION_TS_FILES = $changedTs | ConvertTo-Json -Compress
  node --experimental-strip-types -e "import ts from 'typescript'; import fs from 'node:fs'; const files=JSON.parse(process.env.OCMM_RELEASE_COMPLETION_TS_FILES); const converted=ts.convertCompilerOptionsFromJson(JSON.parse(fs.readFileSync('tsconfig.json','utf8')).compilerOptions,'.'); const options={...converted.options,noEmit:true,rootDir:undefined,allowImportingTsExtensions:true}; const program=ts.createProgram(files,options); const diagnostics=[...converted.errors,...ts.getPreEmitDiagnostics(program)]; for(const diagnostic of diagnostics){ const where=diagnostic.file&&diagnostic.start!==undefined?diagnostic.file.fileName+':'+diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line+': ':''; console.error(where+ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n')) } process.exitCode=diagnostics.length===0?0:1"
  if ($LASTEXITCODE -ne 0) { throw "changed TypeScript compiler diagnostics failed" }
} finally {
  $env:OCMM_RELEASE_COMPLETION_TS_FILES = $savedDiagnosticFiles
}

pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed after structural refactor" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "build failed after structural refactor" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "diff whitespace check failed after structural refactor" }
```

Expected: all split tests pass; Compiler API diagnostics are empty for all 19 changed TS/test paths; typecheck and full TypeScript/Cargo build exit `0`; `git diff --check` passes. No implementation worker stages or commits—this remains part of the parent's one release-feature commit.

### Task 10: Run integrated gates and hand the accepted diff to the parent

**Status:** Pending; final verification only after Task 9 is GREEN.

**Files:**
- Verify all File Map implementation paths
- Verify unchanged protected paths: `src/intent/skill-loader.ts`, `src/codex/plugin-generator.ts`, `skills/v1/**`, `prompts/v1/**`, `src/config/schema.ts`, `schema.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: GREEN outputs from Tasks 1 through 9 and the complete working-tree diff.
- Produces: exact command evidence for all split tests, the real network-denied staged package-script smoke, typecheck, full tests, build, generator determinism, diagnostics over every checker/test module, structural responsibility limits, exact scope/secret safety, and a parent-only commit recommendation.

- [ ] **Step 1: Run the targeted release and distribution suites**

Run:

```powershell
$savedProfile = $env:OCMM_PROFILE
$savedNoProfile = $env:OCMM_NO_PROFILE
try {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $releaseTests = @(
    "src/release-completion-test-support.test.ts",
    "src/release-completion-target-staged.test.ts",
    "src/release-completion-remote-identity.test.ts",
    "src/release-completion-release-assets.test.ts",
    "src/release-completion-registries-retry.test.ts",
    "src/release-completion-cli.test.ts",
    "src/release-completion-workflow.test.ts"
  )
  node --test --experimental-strip-types --test-reporter=spec @releaseTests "src/intent/skill-loader.test.ts" "src/codex/plugin-generator.test.ts"
  if ($LASTEXITCODE -ne 0) { throw "targeted release completion suites failed" }
} finally {
  $env:OCMM_PROFILE = $savedProfile
  $env:OCMM_NO_PROFILE = $savedNoProfile
}
```

Expected: all seven split release-completion paths plus both distribution test files pass with zero failures; the six scenario files retain exactly 46 tests, injected tests report no unexpected URL, the named real staged child passes under its throwing fetch preload, and no live service is contacted.

- [ ] **Step 2: Run repository typecheck, full tests, and build**

Run each gate only once after the final relevant input change:

```powershell
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }

pnpm test
if ($LASTEXITCODE -ne 0) { throw "full Node/Cargo tests failed" }

pnpm run build
if ($LASTEXITCODE -ne 0) { throw "full TypeScript/Cargo build failed" }
```

Expected: each command exits `0`; TypeScript diagnostics are empty, Node tests have zero failures, Cargo tests pass, and release binaries build.

- [ ] **Step 3: Run direct script smoke tests without network**

Run the named test that creates exact temporary `v0.6.6` assets/checksums and launches the real package script in a child process with its ESM fetch-denial preload:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="real staged package-script smoke is network-free and machine-readable" "src/release-completion-cli.test.ts"
if ($LASTEXITCODE -ne 0) { throw "real staged package-script smoke failed" }

$output = pnpm --silent run check:release-completion -- --mode remote --repository invalid --tag v0.6.6 2>&1
$exit = $LASTEXITCODE
if ($exit -ne 1) { throw "invalid remote CLI did not exit 1" }
$text = $output -join "`n"
$receipt = $text | ConvertFrom-Json -ErrorAction Stop
if ($receipt.outcome -ne "FAILED" -or $receipt.schemaVersion -ne 1) { throw "invalid remote CLI did not emit a schema-v1 FAILED receipt" }
```

Expected: the named test passes only after a real child process runs `pnpm --silent run check:release-completion -- --mode staged --tag v0.6.6 --assets-dir <temp-assets>`, exits `0`, emits empty stderr and exactly one parseable `COMPLETED` receipt, and leaks neither the token nor fetch sentinel; its `finally` removes the temporary package, preload, assets, checksums, and captured process state. The invalid remote child invocation separately exits `1` with one schema-v1 `FAILED` receipt before HTTP. Do not run the documented real remote `v0.6.6` completion command in this implementation task.

- [ ] **Step 4: Check installed-compiler diagnostics for every checker and split-test path**

The current environment reports that `typescript-language-server` is unavailable. Do not install it; run the installed TypeScript Compiler API against the facade, all eleven internal modules, and all seven split test/support paths:

```powershell
$changedTs = @(
  "scripts/check-release-completion.ts",
  "scripts/release-completion/contracts.ts",
  "scripts/release-completion/receipt.ts",
  "scripts/release-completion/target.ts",
  "scripts/release-completion/checksums.ts",
  "scripts/release-completion/staged.ts",
  "scripts/release-completion/http.ts",
  "scripts/release-completion/github-identity.ts",
  "scripts/release-completion/github-release.ts",
  "scripts/release-completion/registries.ts",
  "scripts/release-completion/remote.ts",
  "scripts/release-completion/cli.ts",
  "src/release-completion-test-support.test.ts",
  "src/release-completion-target-staged.test.ts",
  "src/release-completion-remote-identity.test.ts",
  "src/release-completion-release-assets.test.ts",
  "src/release-completion-registries-retry.test.ts",
  "src/release-completion-cli.test.ts",
  "src/release-completion-workflow.test.ts"
)
$savedDiagnosticFiles = $env:OCMM_RELEASE_COMPLETION_TS_FILES
try {
  $env:OCMM_RELEASE_COMPLETION_TS_FILES = $changedTs | ConvertTo-Json -Compress
  node --experimental-strip-types -e "import ts from 'typescript'; import fs from 'node:fs'; const files=JSON.parse(process.env.OCMM_RELEASE_COMPLETION_TS_FILES); const converted=ts.convertCompilerOptionsFromJson(JSON.parse(fs.readFileSync('tsconfig.json','utf8')).compilerOptions,'.'); const options={...converted.options,noEmit:true,rootDir:undefined,allowImportingTsExtensions:true}; const program=ts.createProgram(files,options); const diagnostics=[...converted.errors,...ts.getPreEmitDiagnostics(program)]; for(const diagnostic of diagnostics){ const where=diagnostic.file&&diagnostic.start!==undefined?diagnostic.file.fileName+':'+diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line+': ':''; console.error(where+ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n')) } process.exitCode=diagnostics.length===0?0:1"
  if ($LASTEXITCODE -ne 0) { throw "changed TypeScript compiler diagnostics failed" }
} finally {
  $env:OCMM_RELEASE_COMPLETION_TS_FILES = $savedDiagnosticFiles
}
```

Expected: exit `0` and no diagnostic output for all 19 paths.

- [ ] **Step 5: Prove exact scope, structure, generated inventory, documentation sync, and secret safety**

Run:

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "diff whitespace check failed" }

$allowed = @(
  ".github/workflows/release.yml",
  "AGENTS.md",
  "README.md",
  "docs/superpowers/plans/2026-07-31-release-completion-contract.md",
  "docs/superpowers/specs/2026-07-31-release-completion-contract-design.md",
  "docs/v1-maintenance.md",
  "package.json",
  "plugins/deepwork/skills/publish/SKILL.md",
  "scripts/check-release-completion.ts",
  "scripts/release-completion/checksums.ts",
  "scripts/release-completion/cli.ts",
  "scripts/release-completion/contracts.ts",
  "scripts/release-completion/github-identity.ts",
  "scripts/release-completion/github-release.ts",
  "scripts/release-completion/http.ts",
  "scripts/release-completion/receipt.ts",
  "scripts/release-completion/registries.ts",
  "scripts/release-completion/remote.ts",
  "scripts/release-completion/staged.ts",
  "scripts/release-completion/target.ts",
  "skills/publish/SKILL.md",
  "src/codex/plugin-generator.test.ts",
  "src/intent/skill-loader.test.ts",
  "src/release-completion-cli.test.ts",
  "src/release-completion-release-assets.test.ts",
  "src/release-completion-registries-retry.test.ts",
  "src/release-completion-remote-identity.test.ts",
  "src/release-completion-target-staged.test.ts",
  "src/release-completion-test-support.test.ts",
  "src/release-completion-workflow.test.ts"
)
$changed = @(git status --short --untracked-files=all | ForEach-Object { $_.Substring(3).Replace("\", "/") } | Sort-Object -Unique)
$unexpected = @(Compare-Object ($allowed | Sort-Object -Unique) $changed | Where-Object SideIndicator -eq "=>" | ForEach-Object InputObject)
if ($unexpected.Count -gt 0) { throw "unexpected changed paths: $($unexpected -join ', ')" }
$missing = @(Compare-Object ($allowed | Sort-Object -Unique) $changed | Where-Object SideIndicator -eq "<=" | ForEach-Object InputObject)
if ($missing.Count -gt 0) { throw "required changed paths are missing: $($missing -join ', ')" }

rg -n '[ \t]+$' -- $changed
if ($LASTEXITCODE -eq 0) { throw "trailing whitespace found in changed files" }
if ($LASTEXITCODE -ne 1) { throw "changed-file whitespace scan failed" }

git diff --exit-code -- "src/intent/skill-loader.ts" "src/codex/plugin-generator.ts" "skills/v1" "prompts/v1" "src/config/schema.ts" "schema.json" "pnpm-lock.yaml"
if ($LASTEXITCODE -ne 0) { throw "a protected path changed" }

$secretPatterns = 'gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|Authorization:\s*(Bearer|token)\s+[A-Za-z0-9_.-]+'
$releaseSensitivePaths = @(
  "scripts/check-release-completion.ts",
  "scripts/release-completion/checksums.ts",
  "scripts/release-completion/cli.ts",
  "scripts/release-completion/contracts.ts",
  "scripts/release-completion/github-identity.ts",
  "scripts/release-completion/github-release.ts",
  "scripts/release-completion/http.ts",
  "scripts/release-completion/receipt.ts",
  "scripts/release-completion/registries.ts",
  "scripts/release-completion/remote.ts",
  "scripts/release-completion/staged.ts",
  "scripts/release-completion/target.ts",
  "src/release-completion-cli.test.ts",
  "src/release-completion-release-assets.test.ts",
  "src/release-completion-registries-retry.test.ts",
  "src/release-completion-remote-identity.test.ts",
  "src/release-completion-target-staged.test.ts",
  "src/release-completion-test-support.test.ts",
  "src/release-completion-workflow.test.ts",
  "skills/publish/SKILL.md",
  "plugins/deepwork/skills/publish/SKILL.md"
)
rg -n --pcre2 $secretPatterns -- $releaseSensitivePaths
if ($LASTEXITCODE -eq 0) { throw "secret-like credential material found in release completion files" }
if ($LASTEXITCODE -ne 1) { throw "secret scan failed to execute" }

function Get-PureLineCount([string]$Path) {
  $source = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path))
  $withoutBlocks = [regex]::Replace($source, '(?s)/\*.*?\*/', '')
  return @(($withoutBlocks -split "`r?`n") | Where-Object {
    $_.Trim().Length -gt 0 -and -not $_.TrimStart().StartsWith('//')
  }).Count
}
$productionModules = @(
  "scripts/release-completion/contracts.ts",
  "scripts/release-completion/receipt.ts",
  "scripts/release-completion/target.ts",
  "scripts/release-completion/checksums.ts",
  "scripts/release-completion/staged.ts",
  "scripts/release-completion/http.ts",
  "scripts/release-completion/github-identity.ts",
  "scripts/release-completion/github-release.ts",
  "scripts/release-completion/registries.ts",
  "scripts/release-completion/remote.ts",
  "scripts/release-completion/cli.ts"
)
if ((Get-PureLineCount "scripts/check-release-completion.ts") -gt 60) { throw "checker facade exceeds 60 pure lines" }
foreach ($path in $productionModules) {
  $count = Get-PureLineCount $path
  if ($count -gt 250) { throw "$path exceeds 250 pure lines: $count" }
}

$expectedScenarioCounts = [ordered]@{
  "src/release-completion-target-staged.test.ts" = 5
  "src/release-completion-remote-identity.test.ts" = 13
  "src/release-completion-release-assets.test.ts" = 3
  "src/release-completion-registries-retry.test.ts" = 16
  "src/release-completion-cli.test.ts" = 5
  "src/release-completion-workflow.test.ts" = 4
}
foreach ($entry in $expectedScenarioCounts.GetEnumerator()) {
  $count = [int](& rg -c '^test\("' -- $entry.Key)
  if ($LASTEXITCODE -ne 0 -or $count -ne $entry.Value) { throw "$($entry.Key) scenario count changed" }
}
rg -n '^test\("' -- "src/release-completion-test-support.test.ts"
if ($LASTEXITCODE -eq 0) { throw "test support contains an independent scenario" }
if ($LASTEXITCODE -ne 1) { throw "test support scenario scan failed" }
if (Test-Path -LiteralPath "src/release-completion.test.ts") { throw "old monolithic test still exists" }

rg -n 'legacyCheckReleaseCompletion' -- "scripts"
if ($LASTEXITCODE -eq 0) { throw "dead legacy checker duplicate still exists" }
if ($LASTEXITCODE -ne 1) { throw "legacy checker scan failed" }
rg -n 'export\s+\*' -- "scripts/check-release-completion.ts"
if ($LASTEXITCODE -eq 0) { throw "facade contains a wildcard export" }
if ($LASTEXITCODE -ne 1) { throw "facade wildcard-export scan failed" }

node --experimental-strip-types -e "const module = await import('./scripts/check-release-completion.ts'); const expected = ['checkReleaseCompletion','classifyHttp','createProductionClock','createProductionHttpClient','createProductionRuntime','expectedReleaseAssets','main','normalizeResponseHeaders','parseReleaseTarget','registryMetadataUrl','validateStagedReleaseAssets'].sort(); const actual = Object.keys(module).sort(); if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('runtime export surface changed: ' + JSON.stringify(actual))"
if ($LASTEXITCODE -ne 0) { throw "checker runtime export compatibility failed" }

$packageJson = [IO.File]::ReadAllText((Resolve-Path -LiteralPath "package.json")) | ConvertFrom-Json
if ($packageJson.scripts.'check:release-completion' -ne 'node --experimental-strip-types scripts/check-release-completion.ts') {
  throw "public package script text changed"
}

$deferredMarkers = @("T" + "BD", "T" + "ODO", "implement " + "later", "fill " + "in details")
foreach ($marker in $deferredMarkers) {
  rg -n --fixed-strings $marker "docs/superpowers/specs/2026-07-31-release-completion-contract-design.md" "docs/superpowers/plans/2026-07-31-release-completion-contract.md"
  if ($LASTEXITCODE -eq 0) { throw "deferred marker found: $marker" }
  if ($LASTEXITCODE -ne 1) { throw "deferred marker scan failed" }
}
```

Expected: whitespace and protected-path checks pass; changed paths equal the exact required allowlist including all eleven internal modules and seven split test/support paths but not the deleted monolith; facade/internal line budgets and `5 + 13 + 3 + 16 + 5 + 4 = 46` scenario counts pass; public runtime exports and package-script text are unchanged; no legacy duplicate, wildcard export, lockfile/schema/prompt/v1 skill/loader production/generator production delta, credential pattern, or deferred marker is found.

- [ ] **Step 6: Inspect the final diff and return the parent-owned commit boundary**

Run read-only inspection:

```powershell
git status --short --branch --untracked-files=all
git diff --stat
git diff -- ".github/workflows/release.yml" "package.json" "scripts/check-release-completion.ts" "scripts/release-completion" "src/release-completion-*.test.ts" "skills/publish/SKILL.md" "src/intent/skill-loader.test.ts" "src/codex/plugin-generator.test.ts" "plugins/deepwork/skills/publish/SKILL.md" "README.md" "AGENTS.md" "docs/v1-maintenance.md" "docs/superpowers/specs/2026-07-31-release-completion-contract-design.md" "docs/superpowers/plans/2026-07-31-release-completion-contract.md"
```

Then use the Read tool to inspect every `??` path reported by `git status`, specifically the checker facade, every internal checker module, every split test/support file, source/generated publish skills, design, and plan. Confirm `src/release-completion.test.ts` is absent. `git diff` does not display untracked files, so do not treat its output as complete evidence for those paths.

Expected: the tracked diff plus direct reads of all untracked paths show one coherent release-safety feature; no unrelated later feature, real release artifact, credential, version bump, or generated drift.

Return to the parent:

- changed-file list;
- targeted/full verification command results and counts;
- structural line/scenario-count and exact-public-export results;
- generator determinism result;
- receipt/exit/token-redaction test result;
- any residual risk, especially that live propagation is intentionally deferred to the real release;
- recommended parent-only semantic commit message `feat: enforce release completion contract`.

Do not stage or commit. The parent performs the configured release-safety reviewer/Oracle acceptance and, using the user's separate authorization, creates the feature's single commit.

## Requirement-to-Task Coverage

| Requirement | Implemented and proved by |
|---|---|
| Strict lane/tag/version/pinned-version parsing | Task 1 Steps 1-4 |
| Exact main and LSP asset/package inventories | Task 1 Steps 1-4; Task 5 Steps 1 and 4 |
| Staged exact/non-empty/checksum/hash gate | Task 2 Steps 1-4; Task 6 Steps 1-4; Task 7 Steps 3-4; Task 9 Steps 2-7; Task 10 Step 3 |
| Peeled immutable tag SHA and fixed run | Task 3 Steps 2-6 |
| Terminal success plus lane-specific job combinations | Task 3 Steps 2-6 |
| Exact non-draft Release and downloaded digest proof | Task 4 Steps 1-5 |
| npm, GitHub Packages, and pinned LSP proof | Task 5 Steps 1-6 |
| `404`/`429`/`5xx`/network retry and permanent `4xx` failure | Task 5 Steps 2-6 |
| Header-proven GitHub REST rate-limit `403` retries; ordinary permission `403` fails without leaking headers/body | Task 5 Steps 2-6 |
| Permission-unproven GitHub Packages is unresolved | Task 5 Steps 2 and 4-6 |
| Explicit injected `Date` supplies every staged/remote/CLI-failure `checkedAt` | Task 2 Steps 1-4; Task 3 Steps 1-6; Task 5 Steps 2-6; Task 6 Steps 1-4 |
| Stable all-surface JSON receipt, redaction, exits `0/1/2` | Task 6 Steps 1-4 |
| Real child-process staged package script is network-denied and machine-readable | Task 6 Steps 1-4; Task 9 Steps 5 and 7; Task 10 Step 3 |
| Workflow pre-publication ordering and exact route pair | Task 7 Steps 1-6 |
| Shared publish skill, no OMO-only surfaces | Task 8 Steps 1-5 |
| Loader auto-discovery and Codex generated copy | Task 8 Steps 1-3 and 6-8 |
| README/AGENTS/provenance updates | Task 8 Step 5 |
| Focused production modules, thin stable facade, no cycles/wrappers/duplicate policy, and removed private legacy duplicate | Task 9 Steps 1 and 3-6; Task 10 Steps 4-6 |
| All 46 existing test names/scenarios grouped by domain with one focused support module and no old monolith | Task 9 Steps 1-2 and 5-7; Task 10 Steps 1 and 5 |
| Exact public exports, package-script/direct-execution surface, receipt/CLI/HTTP/error/outcome behavior preserved | Global Constraints; Task 9 Steps 3-7; Task 10 Steps 1-5 |
| No real publication, dependency, Git write, or scope expansion | Global Constraints; Tasks 9-10 |
| Real remote `v0.6.6` completion check remains deferred to the later release stage | Design verification boundary; Task 8 docs; Task 10 Steps 3 and 6 |

## Plan Self-Review

- **Spec coverage:** Every behavioral acceptance criterion remains mapped to its implemented Task 1–8 history, while structural decomposition/public compatibility maps to Task 9 and is repeated in Task 10 final verification.
- **Completion-marker scan:** All production/test paths, moved symbol groups, exported signatures, scenario counts, endpoint shapes, jobs, assets, status codes, commands, expected outcomes, generated boundaries, and parent handoff details are concrete; no deferred implementation marker remains.
- **Type consistency:** `Clock.now(): Date`, `CheckReleaseCompletionOptions.checkedAt: Date`, `CliRuntime.clock`, `CliRuntime.validateStaged(root, assetsDir, tag, checkedAt)`, `makeReceipt(identity, checkedAt)`, `validateStagedReleaseAssets(root, assetsDir, tag, checkedAt)`, `classifyHttp(response, context)`, and the remaining receipt/checker interfaces retain the same names and signatures across all tasks.
- **Task sizing:** Tasks 1–8 preserve their original behavior history. Task 9 is one independently rejectable structural boundary with GREEN checks after test and production extraction waves; Task 10 performs integration only.
- **Scope consistency:** Product runtime, schema, prompts, v1 skills, model defaults, versioning, real publication, and implementation-subagent Git writes remain excluded.
- **QA executability:** Every command is PowerShell-compatible, has an expected exit/result, uses installed repository tooling, and requires no user confirmation or live credential during implementation. Task 9 and Task 10 enumerate all 19 changed TS/test paths for installed-compiler diagnostics, all split tests, exact structural limits, and the named real child-process staged package-script test; staged verification is not satisfied only by injected `main()` tests.
