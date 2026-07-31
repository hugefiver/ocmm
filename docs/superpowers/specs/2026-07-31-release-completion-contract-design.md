# Release Fail-Closed Completion Contract Design

**Date:** 2026-07-31
**Status:** Approved direction; self-reviewed for implementation planning
**Scope:** Release completion checker, preventive release-workflow gates, shared publish protocol, generated Codex skill copy, and release documentation

## Goal

Make an ocmm release reportable as complete only when one immutable tag, its peeled commit, one matching `release.yml` run, the lane-specific job graph, the exact GitHub Release payload, every required registry package, and every required checksum are all independently proven. Any definite contract violation must return `FAILED`; any propagation, permission, rate-limit, or network state that cannot be proven before the deadline must return `UNRESOLVED`; neither state may be described as completion.

## Discovery Evidence

The discovery baseline is `6c88d55` on `master`, with a clean worktree and `master...origin/master [ahead 2]`. The two preceding independent feature commits are `c4ee569` and `6c88d55`.

- `.github/workflows/release.yml` defines two tag lanes. `ocmm-lsp-v*` runs `verify`, an eight-entry `native` matrix, `lsp-package`, and `github-release`; `v*` runs `verify`, `stage-pinned-lsp`, `ocmm-package`, and `github-release`.
- `.github/workflows/release.yml:523-560` currently lets `github-release` run when either package job succeeds. The intended lane is implicit rather than expressed as an exact active-success/inactive-skipped pair.
- LSP assets are assembled and npm packages are published before checksums exist. Main npm and GitHub Packages publication also occurs before checksums are generated. There is no reusable exact-set/checksum gate before those irreversible registry writes.
- `package.json` is currently `0.6.5`, pins `ocmm.lspVersion` to `0.3.2`, exposes the Node strip-types test command, and has no release-completion command.
- `scripts/check-release-version.ts` validates a tag against either root `package.json.version` or `crates/ocmm-lsp/Cargo.toml`. Its permissive `startsWith()` route is adequate for its current job, but the completion checker needs its own strict `A.B.C` grammar and a receipt without incidental console output.
- `scripts/lsp-package-manifest.ts` provides `readRootPackage()`, `lspVersion()`, and `pinnedOcmmLspVersion()`. `src/shared/ocmm-lsp-binary.ts` is the canonical ordered list of eight platform package names and standalone binary names.
- `src/release-package.test.ts` establishes the repository pattern of `node:test`, strict assertions, isolated OS-temporary fixtures, and cleanup in `finally`.
- `src/intent/skill-loader.ts:100-136` auto-discovers top-level `skills/*/SKILL.md` directories while excluding `skills/v1`. A new `skills/publish/SKILL.md` therefore needs no loader production-code change.
- `src/codex/plugin-generator.ts:336-379` copies every enabled shared skill into `plugins/deepwork/skills`, normalizes only its router, and adds the common Codex compatibility suffix. `src/codex/plugin-generator.test.ts:208-249` can prove source, fresh generation, and tracked generated trees agree.
- `README.md` and `AGENTS.md` describe the two release lanes and assets but treat workflow publication as the final step. Neither defines a machine-verifiable completion receipt or the immutable partial-publication policy.
- `docs/v1-maintenance.md:20-26` records provenance for shared, non-v1 skills even though its primary table covers `skills/v1`. The publish skill belongs in that shared-skill section and does not change `skills/v1` or `prompts/v1`.
- The upstream semantic reference `omo/.agents/skills/publish/SKILL.md` defines the useful invariant that triggering a workflow is not completion, requires terminal workflow and registry verification, and forbids fixing code during publication. Its Discord, LazyCodex, OMO package families, release-note mutation, bump automation, Bash commands, and repository-specific command copies are not applicable to ocmm and will not be copied.
- Existing release plans for `0.6.4` and `0.6.5` already bind a run ID, peeled tag SHA, relevant main-lane jobs, exact three assets, and npm visibility. The checker turns those manual one-release probes into a tested reusable contract and extends them to the LSP lane, downloaded hashes, GitHub Packages, retries, explicit uncertainty, and machine-readable receipts.

## Scope

### In scope

1. A dependency-free TypeScript checker whose stable public/direct-execution facade remains `scripts/check-release-completion.ts`, with focused internal modules under `scripts/release-completion/` for local staged-assets and remote completion responsibilities.
2. Local fixture/mock tests split by scenario domain under `src/release-completion-*.test.ts`, with shared deterministic fixtures in `src/release-completion-test-support.test.ts`; no test contacts GitHub, npmjs.org, or npm.pkg.github.com.
3. Exact pre-publication asset/checksum gates and exact lane routing in `.github/workflows/release.yml` without changing its two-lane OIDC architecture.
4. A shared `skills/publish/SKILL.md` that defines only the ocmm publication protocol.
5. Existing loader/generator tests proving shared-skill discovery and generated Codex inclusion.
6. `README.md`, `AGENTS.md`, and shared-skill provenance in `docs/v1-maintenance.md`.
7. Regeneration of the checked-in Codex bundle, including `plugins/deepwork/skills/publish/SKILL.md`.

### Out of scope

- No version bump, tag creation, workflow trigger, registry publication, GitHub Release mutation, or real completion check during implementation.
- No tag move, deletion, force-update, workstation republish, asset overwrite, or code repair after a publication failure.
- No release UI, release-note authoring, Discord, LazyCodex, OMO package surface, or LSP daemon work.
- No third-party runtime or test dependency and no software installation.
- No provider/model default, config schema, `schema.json`, prompt, `skills/v1`, or `prompts/v1` change.
- No redesign of npm Trusted Publishing, GitHub Packages authentication, GitHub Release creation, native build matrices, or pinned-LSP staging.
- No plan-critic activity in this subagent; the parent workflow owns that receipt.

## Approaches Considered

### 1. Hybrid preventive and observational closure — selected

Use one dependency-free TypeScript checker package behind the stable `scripts/check-release-completion.ts` facade. Focused internal modules own canonical lane/version/asset definitions, staged validation, HTTP/GitHub/registry proofs, remote orchestration, receipt finalization, and CLI composition. Staged mode blocks registry publication and artifact upload when local release assets are wrong; remote mode independently proves the immutable tag, fixed run, jobs, released bytes, checksums, and registries and emits a final receipt.

**Advantages:** Prevents known-bad payloads before irreversible writes while still detecting propagation, permission, workflow, and external-surface failures that CI cannot prevent. One asset definition covers both workflow staging and post-publication verification. The checker remains locally testable through injected I/O.

**Trade-off:** The checker owns several API response decoders and a bounded retry state machine. Strict external contracts mean a future job or asset inventory change must update tests and the checker in the same release change.

### 2. Remote checker only

Leave the workflow unchanged and verify publication afterward.

**Rejected because:** It can diagnose a missing or corrupt asset only after npm or GitHub Packages may already be published. It does not satisfy the requested preventive exact-set, non-empty, and checksum gate.

### 3. Workflow gates only

Validate staged files inside Actions and treat a successful run as completion.

**Rejected because:** A terminal-success workflow does not prove package propagation, GitHub Packages visibility, final Release bytes, downloaded hashes, tag/run identity, or monitoring permissions. It preserves the exact early-stop failure the completion contract is meant to remove.

## Behavior-Preserving Structural Decomposition

Tasks 1–8 produced a green behavioral implementation, but the resulting `scripts/check-release-completion.ts` is 2034 lines and `src/release-completion.test.ts` is 1960 lines. Before final release-feature verification, a structural-only refactor splits those responsibility concentrations. This does not add product behavior and must not change the receipt schema or ordering, public exports, package-script text, direct executable path, CLI text or exit codes, HTTP endpoints, request classification, safe error codes/details, outcomes, retry timing, workflow, skills, generated files, or documentation behavior established by Tasks 1–8.

### Stable facade and dependency direction

`scripts/check-release-completion.ts` remains the only public composition and direct-execution entry. It explicitly re-exports exactly the existing public value and type surface; wildcard exports are forbidden because they could accidentally publish internal helpers. It imports `main()` and retains the sole `import.meta.url === pathToFileURL(process.argv[1]).href` guard, so `package.json`, workflow invocations, existing imports, and direct child-process execution remain byte-for-byte compatible at their call sites.

Internal dependencies flow in one direction:

```text
contracts -> receipt -> target/checksums -> staged
contracts -> http -> github-identity/github-release/registries
receipt + target + http + proof modules -> remote -> cli -> public facade
```

No internal module imports the facade. There are no circular dependencies, pass-through wrapper functions, duplicated policy constants, or speculative extension points. The unexported and unreferenced `legacyCheckReleaseCompletion()` duplicate is removed rather than moved or exposed; deleting dead private code does not change the public or executable behavior.

### Production responsibility map

| File | Focused responsibility | Internal or public interfaces |
|---|---|---|
| `scripts/check-release-completion.ts` | Thin public re-export/composition facade and sole direct-execution guard. | Explicitly preserves all existing public exports and invokes imported `main()` only when executed directly. |
| `scripts/release-completion/contracts.ts` | Receipt, target, HTTP, clock, option, status, and shared proof-state types. | Produces `ReleaseLane`, `ReleaseTarget`, `CompletionOutcome`, `SurfaceStatus`, `SurfaceReceipt`, `ReleaseCompletionReceipt`, `HttpRequest`, `HttpResponse`, `HttpClient`, `Clock`, `CheckReleaseCompletionOptions`, `HttpService`, `HttpDisposition`, `SurfaceName`, and `RunEvent`; consumes no project module. |
| `scripts/release-completion/receipt.ts` | Fixed receipt construction, surface mutation, deterministic sorting/deduplication, skip/retry policy, and final outcome precedence. | Produces `makeReceipt`, `setSurface`, `addFailure`, `addUnresolved`, `finalizeReceipt`, staged/lane/dispatch skip helpers, retry marking, proof/failure predicates, and shared ordinal-name ordering; consumes only `contracts.ts`. |
| `scripts/release-completion/target.ts` | Strict tag/local-version parsing and canonical lane asset inventory. | Publicly produces `parseReleaseTarget()` and `expectedReleaseAssets()`; internally produces `CHECKSUM_NAME`; consumes `contracts.ts`, receipt ordering, `lsp-package-manifest.ts`, and `ocmm-lsp-binary.ts`. |
| `scripts/release-completion/checksums.ts` | Strict UTF-8 checksum grammar, canonical coverage, and safe checksum failure details shared by staged and remote proof. | Produces `parseChecksums`, `ChecksumContractError`, and `checksumFailureDetail`; consumes target checksum name and receipt ordering only. |
| `scripts/release-completion/staged.ts` | Local exact-set, regular/non-empty file, byte hash, checksum, and staged receipt proof. | Publicly produces `validateStagedReleaseAssets()`; consumes contracts, receipt, target, checksums, and Node filesystem/crypto APIs. |
| `scripts/release-completion/http.ts` | Production fetch adapter, normalized headers, status classification, safe JSON/byte requests, strict JSON primitives, repository/numeric/date validation, and registry URL construction. | Preserves public `normalizeResponseHeaders()`, `createProductionHttpClient()`, `classifyHttp()`, and `registryMetadataUrl()`; provides internal `requestJson`, `requestBytes`, strict decoder/validator helpers, safe origin constants, and `HttpContractError`; consumes only contracts and platform APIs. |
| `scripts/release-completion/github-identity.ts` | GitHub headers, annotated/lightweight tag peeling, run discovery/fixed identity decoding, lane job decoding, and bound-tag recheck. | Produces internal `peelTag`, `decodeRun`, `hasMatchingRunIdentity`, `decodeDiscovery`, `decodeJobs`, `githubHeaders`, and `ensureBoundTagUnchanged`; consumes contracts, receipt mutation, target, and HTTP helpers. |
| `scripts/release-completion/github-release.ts` | Strict GitHub Release metadata/asset decoding plus downloaded-size/checksum/digest observation. | Produces `ReleaseAssetState` and `observeReleaseProof`; consumes contracts, receipt, target, checksums, HTTP helpers, and Node crypto. |
| `scripts/release-completion/registries.ts` | npmjs.org, GitHub Packages, and pinned-LSP Release observations and canonical package rows. | Produces `observeNpmProof`, `observeGithubPackagesProof`, and `observePinnedLspRelease`; consumes contracts, receipt, target, HTTP helpers, and canonical platform package names. |
| `scripts/release-completion/remote.ts` | Bounded immutable-identity/retry orchestration only. | Publicly produces `checkReleaseCompletion()`; composes receipt, target, identity, Release, registry, and HTTP proof interfaces without reimplementing their policies. |
| `scripts/release-completion/cli.ts` | CLI option parsing, production clock/runtime composition, one-receipt stdout, and exit mapping. | Produces `CliRuntime`, `createProductionClock()`, `createProductionRuntime()`, and `main()`; consumes receipt, staged, remote, and HTTP composition interfaces. |

Each internal production module is kept at or below 250 nonblank, non-comment lines where practical; the facade is kept at or below 60 such lines. If extraction reveals a module would exceed that focused budget, the split follows an existing responsibility boundary above rather than adding wrappers or duplicating policy.

### Scenario-domain test map

The old `src/release-completion.test.ts` is deleted after all 46 existing test names and scenarios move unchanged:

| File | Existing scenarios moved intact |
|---|---|
| `src/release-completion-test-support.test.ts` | Shared deterministic root/staged fixtures, fake clock and exact HTTP router, GitHub/Release/registry route builders, receipt key contracts, and child-process helpers; it defines no independent behavior scenario. |
| `src/release-completion-target-staged.test.ts` | 5 strict target, inventory, staged file, and checksum scenarios. |
| `src/release-completion-remote-identity.test.ts` | 13 tag peel, run binding, polling, event, workflow, and lane-job scenarios. |
| `src/release-completion-release-assets.test.ts` | 3 exact GitHub Release metadata, asset, downloaded-size, and checksum scenarios. |
| `src/release-completion-registries-retry.test.ts` | 16 npm/GitHub Packages/pinned-LSP, partial publication, retry, deadline, status, authorization-scope, and rate-limit scenarios. |
| `src/release-completion-cli.test.ts` | 5 receipt/exit/clock/argument/token and real network-denied package-script scenarios. |
| `src/release-completion-workflow.test.ts` | 4 workflow ordering, lane-pair, and preserved-publication-invariant scenarios. |

All scenario tests continue importing production values and types only from `../scripts/check-release-completion.ts`, which makes the facade itself part of compatibility coverage. The real package-script fixture copies the complete `scripts/release-completion/` module tree in addition to the facade, `scripts/lsp-package-manifest.ts`, and `src/shared/ocmm-lsp-binary.ts`; it still executes the exact tracked package-script text. Test splitting occurs before production extraction and remains green, so structural concentration—not a fabricated behavior failure—is the RED evidence for this refactor.

## Contract Vocabulary

```ts
export type ReleaseLane = "ocmm" | "ocmm-lsp"
export type CompletionOutcome = "COMPLETED" | "FAILED" | "UNRESOLVED"
export type SurfaceStatus = "PASS" | "FAILED" | "UNRESOLVED" | "SKIPPED"

export interface ReleaseTarget {
  lane: ReleaseLane
  tag: string
  version: string
  pinnedLspVersion: string | null
}

export interface SurfaceReceipt {
  status: SurfaceStatus
  code: string
  detail: string
}
```

- `COMPLETED` means every required surface is `PASS` and every non-applicable surface is explicitly `SKIPPED`.
- `FAILED` means at least one definite invariant, terminal workflow, permanent HTTP, content, checksum, or identity failure exists. A definite failure takes precedence over simultaneous unresolved observations.
- `UNRESOLVED` means no definite failure exists, but at least one required surface remains unprovable because propagation, retryable HTTP, network failure, deadline expiry, or GitHub Packages authorization prevented proof.
- `SKIPPED` is legal only when the contract says a surface is not required: GitHub Packages and pinned LSP for the LSP lane, or GitHub Packages for a main `workflow_dispatch` run. A failed dependency does not turn a required surface into `SKIPPED`.
- Every receipt always contains all fixed surface keys. The checker never omits an unvisited surface and never calls a partial state complete.

## Strict Release Target Parsing

`parseReleaseTarget(tag, root)` accepts exactly these forms:

- `vA.B.C` for the main lane.
- `ocmm-lsp-vA.B.C` for the LSP lane.

Each numeric component is `0` or a non-zero digit followed by digits. Pre-release suffixes, build metadata, signs, whitespace, leading zeroes, missing components, extra components, and mixed prefixes are rejected.

The parsed version must equal exactly one local source:

- Main: the string `package.json.version`.
- LSP: the `[package]` version in `crates/ocmm-lsp/Cargo.toml` through `lspVersion(root)`.

For the main lane, `package.json.ocmm.lspVersion` is also parsed with the same strict version grammar and returned as `pinnedLspVersion`. The checker proves that `ocmm-lsp-v${pinnedLspVersion}` exists as a non-draft GitHub Release. It does not trigger, wait for, or revalidate the LSP lane's npm packages or full asset contract.

## Canonical Asset and Package Inventories

### Main lane

The exact GitHub Release asset set is:

1. `ocmm-opencode-plugin-A.B.C.tgz`
2. `deepwork-codex-plugin-A.B.C.tgz`
3. `SHA256SUMS.txt`

Required registry packages:

- npmjs.org: `ocmm@A.B.C`.
- GitHub Packages: `@owner/ocmm@A.B.C` when the bound workflow event is `push`.

For `workflow_dispatch`, GitHub Packages is `SKIPPED` because the run REST representation does not prove the `publish_github_package` input. A manually dispatched run is certifiable only when its run metadata is itself bound to the tag ref and peeled SHA; otherwise identity is `FAILED`.

### LSP lane

The exact GitHub Release asset set is the following seventeen files:

1. `ocmm-lsp-x86_64-unknown-linux-gnu`
2. `ocmm-lsp-aarch64-unknown-linux-gnu`
3. `ocmm-lsp-x86_64-unknown-linux-musl`
4. `ocmm-lsp-aarch64-unknown-linux-musl`
5. `ocmm-lsp-x86_64-pc-windows-msvc.exe`
6. `ocmm-lsp-aarch64-pc-windows-msvc.exe`
7. `ocmm-lsp-x86_64-apple-darwin`
8. `ocmm-lsp-aarch64-apple-darwin`
9. `ocmm-lsp-linux-x64-gnu-A.B.C.tgz`
10. `ocmm-lsp-linux-arm64-gnu-A.B.C.tgz`
11. `ocmm-lsp-linux-x64-musl-A.B.C.tgz`
12. `ocmm-lsp-linux-arm64-musl-A.B.C.tgz`
13. `ocmm-lsp-darwin-x64-A.B.C.tgz`
14. `ocmm-lsp-darwin-arm64-A.B.C.tgz`
15. `ocmm-lsp-windows-x64-A.B.C.tgz`
16. `ocmm-lsp-windows-arm64-A.B.C.tgz`
17. `SHA256SUMS.txt`

The first eight binary/package pairs come from `ocmmLspPlatformPackages()`, so their order and spelling are not duplicated in an independent handwritten implementation constant.

Required npmjs.org packages are the same eight `ocmm-lsp-*` package names at `A.B.C`. Main `ocmm`, GitHub Packages, and pinned-LSP verification are all `SKIPPED` for this lane.

## Staged-Assets Mode

The local mode is invoked through:

```powershell
pnpm --silent run check:release-completion -- --mode staged --tag v0.6.6 --assets-dir release-assets
```

The implementation command used inside Actions substitutes `${{ env.RELEASE_TAG }}` for the literal tag. The mode:

1. Parses and validates the tag against the checked-out version source.
2. Requires `assets-dir` to be one directory whose top level contains only regular files.
3. Compares sorted actual names with the exact lane inventory. A subdirectory, symlink, missing file, or extra file is a failure.
4. Requires every file, including `SHA256SUMS.txt`, to have a byte length greater than zero.
5. Parses checksum rows as exactly 64 hexadecimal characters, two spaces, and one basename. Paths, duplicate names, duplicate digests for the same name, malformed rows, empty rows, and an entry for `SHA256SUMS.txt` are failures.
6. Requires exactly one checksum row for every non-checksum asset and no other row.
7. Computes SHA-256 for every non-checksum file and compares lower-case hexadecimal digests.
8. Emits one JSON receipt and exits `0` on `COMPLETED`; local contract failures emit `FAILED` and exit `1`. This mode has no retryable external state and never emits `UNRESOLVED`.

## Remote Completion Architecture

### Public interfaces

```ts
export interface HttpRequest {
  url: string
  headers: Readonly<Record<string, string>>
}

export interface HttpResponse {
  status: number
  headers: Readonly<Record<string, string>>
  body: Uint8Array
}

export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>

export interface Clock {
  now(): Date
  sleep(ms: number): Promise<void>
}

export interface CheckReleaseCompletionOptions {
  root: string
  repository: string
  tag: string
  runId?: number
  deadlineMs: number
  pollIntervalMs: number
  githubToken?: string
  checkedAt: Date
  http: HttpClient
  clock: Clock
}

export interface CliRuntime {
  clock: Clock
  check(options: Omit<CheckReleaseCompletionOptions, "http">): Promise<ReleaseCompletionReceipt>
  validateStaged(root: string, assetsDir: string, tag: string, checkedAt: Date): ReleaseCompletionReceipt
  writeStdout(text: string): void
}

export function parseReleaseTarget(tag: string, root: string): ReleaseTarget
export function expectedReleaseAssets(target: ReleaseTarget): readonly string[]
export function validateStagedReleaseAssets(root: string, assetsDir: string, tag: string, checkedAt: Date): ReleaseCompletionReceipt
export async function checkReleaseCompletion(options: CheckReleaseCompletionOptions): Promise<ReleaseCompletionReceipt>
export async function main(argv?: readonly string[], env?: NodeJS.ProcessEnv, runtime?: CliRuntime): Promise<number>
```

`checkedAt` is explicit on every receipt-producing path. `main()` obtains it once from `runtime.clock.now()` and passes that same `Date` to staged validation, remote options, or pre-network CLI-failure receipt construction. `makeReceipt(identity, checkedAt: Date)` validates the date and serializes it immediately with `toISOString()`; it never calls `Date.now()`, `new Date()`, or another clock. `checkReleaseCompletion()` derives `deadlineAt` from `options.checkedAt.getTime() + deadlineMs` and consults only `options.clock.now().getTime()` afterward.

There is no module-level production clock. When `main()` receives no runtime, that CLI composition root calls `createProductionClock()` and passes the resulting clock into `createProductionRuntime(clock)`. Among production paths, only `createProductionClock()` may call zero-argument `new Date()` and `setTimeout`; production HTTP uses global `fetch`. Tests always inject an in-memory HTTP router plus a clock whose `now()` returns a fresh copy of a fixed `Date` and whose `sleep()` advances deterministically. Unit tests do not read ambient time.

### CLI

Remote mode is:

```powershell
pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.6 --deadline-ms 5400000 --poll-ms 15000
```

`--run-id` is optional for a `push` event and required for `workflow_dispatch`. Without it, the checker queries only push runs for `.github/workflows/release.yml`. A successful discovery body must have a non-negative integer `total_count` equal to the returned `workflow_runs` length and no more than `100`; an incomplete page returns immediate `UNRESOLVED` code `run_discovery_page_incomplete`. The checker filters the complete page by exact tag branch and peeled SHA, requires one match, and binds its numeric ID and positive integer `run_attempt` once. With an explicit run ID, the first identity-valid fixed-run response binds its positive integer `run_attempt`. Every later request uses only that fixed ID/attempt pair. Zero discovery matches are retried; multiple matches are `FAILED` because binding is ambiguous.

`repository` is exactly `owner/name`. Each segment must match `[A-Za-z0-9][A-Za-z0-9._-]*`; percent escapes, whitespace, empty segments, and additional `/` characters are rejected. `run-id`, `deadline-ms`, and `poll-ms` are positive safe integers. `deadline-ms` is a duration captured once as `deadlineAt = checkedAt.getTime() + deadlineMs` at remote-check entry, not an absolute timestamp; `checkedAt` must be a valid `Date` and the addition must remain a safe integer. Unknown, duplicate, or missing CLI options are `FAILED` before network access.

`GITHUB_TOKEN` is optional for public GitHub reads and required to prove GitHub Packages for a main push. Request builders may send it only to the exact origins `https://api.github.com` and `https://npm.pkg.github.com`; npmjs.org and every `browser_download_url` request are unauthenticated. The token is never placed in a URL, response detail, thrown message, JSON receipt, or artifact, and caught transport errors are converted to safe codes without serializing their messages. The checker process's stdout contains exactly one pretty-printed JSON object plus a trailing newline. Documented package-script invocations use `pnpm --silent run` so lifecycle banners do not contaminate that machine-readable stream. Exit codes are fixed:

- `0`: `COMPLETED`
- `1`: `FAILED`
- `2`: `UNRESOLVED`

### Identity and tag peeling

The checker reads `refs/tags/${tag}` through the GitHub Git Data REST API. A lightweight tag's commit SHA is already peeled. An annotated tag is dereferenced through `git/tags/{sha}` until a commit is reached. A cycle, malformed SHA, missing object, or object type other than `tag`/`commit` is `FAILED`. The final 40-character lower-case commit SHA is the sole `headSha` in the receipt.

The bound workflow run must have all of:

- the requested numeric run ID;
- one positive integer `run_attempt`, fixed for the receipt;
- `path === ".github/workflows/release.yml"`;
- `head_sha === headSha`;
- `head_branch === tag`;
- `event` equal to `push` or `workflow_dispatch`;
- a lane-consistent `Verify (lane)` job;
- `status === "completed"` and `conclusion === "success"` before completion.

After the first successful peel, the checker stores the commit SHA and never replaces it. Every retry cycle after binding and the final completion attempt resolve the tag again; a different peeled commit is `FAILED` with `tag_head_changed`. A transient retryable response during this recheck follows the normal deadline rules but can never pass. Any fixed-run identity field, including `run_attempt`, changing on a later poll is also `FAILED`; the checker never rebinds. The jobs request uses `/actions/runs/{runId}/attempts/{runAttempt}/jobs?per_page=100`, never the mutable latest-attempt endpoint. A terminal non-success conclusion is `FAILED`, but the checker still makes one bounded observation of independent release and registry surfaces so the receipt describes partial publication.

## Job-Level Contract

The jobs endpoint is read with `per_page=100`, sufficient for the current graph. Its successful body must have a non-negative integer `total_count` equal to the returned jobs-array length and no more than `100`; otherwise the checker returns definite `FAILED` code `jobs_page_incomplete` rather than accepting a partial graph. Overall run success is necessary but not sufficient.

### Main push or dispatch

Exactly one of each must exist with the stated conclusion:

| Job name | Conclusion |
|---|---|
| `Verify (ocmm)` | `success` |
| `Download pinned ocmm-lsp binaries` | `success` |
| `Package and publish ocmm` | `success` |
| `Package and publish ocmm-lsp packages` | `skipped` |
| `GitHub Release` | `success` |

If the jobs API exposes any `Native ocmm-lsp (` entries for the inactive matrix, every one must be `skipped`; none may be successful, failed, cancelled, or in progress. `Verify (ocmm-lsp)` is forbidden.

### LSP push or dispatch

Exactly one of each must exist with the stated conclusion:

| Job name | Conclusion |
|---|---|
| `Verify (ocmm-lsp)` | `success` |
| `Native ocmm-lsp (linux-x64-gnu)` | `success` |
| `Native ocmm-lsp (linux-arm64-gnu)` | `success` |
| `Native ocmm-lsp (linux-x64-musl)` | `success` |
| `Native ocmm-lsp (linux-arm64-musl)` | `success` |
| `Native ocmm-lsp (win32-x64)` | `success` |
| `Native ocmm-lsp (win32-arm64)` | `success` |
| `Native ocmm-lsp (darwin-x64)` | `success` |
| `Native ocmm-lsp (darwin-arm64)` | `success` |
| `Package and publish ocmm-lsp packages` | `success` |
| `Download pinned ocmm-lsp binaries` | `skipped` |
| `Package and publish ocmm` | `skipped` |
| `GitHub Release` | `success` |

`Verify (ocmm)` is forbidden. Duplicate required names, missing required names, unexpected active jobs, or any conclusion outside the lane table is `FAILED`.

## GitHub Release and Downloaded Hash Contract

After the run reaches terminal success, the checker reads the Release by exact tag and requires:

- `tag_name` equals the requested tag;
- `draft` is `false`;
- asset names equal the canonical lane set with no duplicate, missing, or extra name;
- every asset metadata size is positive;
- every expected `browser_download_url` is present, HTTPS, and not copied into the receipt.

`prerelease` is reported but is not a failure because the workflow explicitly supports prereleases and the approved contract requires non-draft, not stable-only.

The checker downloads `SHA256SUMS.txt` and every non-checksum asset into memory through the injected HTTP client. It applies the same strict checksum grammar and coverage rules as staged mode, requires downloaded byte length to equal positive Release metadata size, computes Node `createHash("sha256")`, and compares each digest. A visible Release with a wrong final set, empty asset, malformed checksum, size mismatch, or digest mismatch is `FAILED`.

## Registry Contracts

### npmjs.org

For each required package, request exact package metadata from `https://registry.npmjs.org/` using a percent-encoded package name. A `200` response passes only when the `versions` object has an own property equal to the requested version and that version's manifest has the same `name` and `version`.

A `200` response without the requested version is treated as propagation and retried to the deadline. The receipt contains one item per package in canonical order and never substitutes the `latest` dist-tag for exact-version proof.

### GitHub Packages

For a main push, request the scoped package metadata from `https://npm.pkg.github.com/` using `@owner/ocmm`, the lower-case repository owner, and `GITHUB_TOKEN`. The exact version/name rules match npmjs.org.

- Missing token is immediately `UNRESOLVED` with code `github_packages_token_missing`.
- `401` or `403` is `UNRESOLVED` with code `github_packages_permission_unproven`; lack of read permission is not proof that the package is absent.
- A `404` or a `200` without the exact version is retryable propagation.
- This request's URL, headers, and body are never echoed.

The LSP lane and main manual-dispatch lane record GitHub Packages as `SKIPPED` with a lane/event-specific code.

## HTTP and Retry Classification

All calls use the injected HTTP client. Every adapter first normalizes response headers by lower-casing ASCII names, trimming surrounding spaces/tabs from values, rejecting names/values containing control characters, and rejecting duplicate normalized names when the source exposes them separately. A Fetch-combined comma value remains one value but cannot satisfy either exact rate-limit grammar below. The classifier receives the status, normalized headers, and an explicit context `{ service, now }`, where `service` is one of `github-api`, `github-packages`, `npmjs`, or `release-asset`, and `now` is a valid `Date` obtained from the injected clock. Response bodies are decoded only after status classification, and malformed required JSON on a successful status is `FAILED`.

The internal classifier contract is:

```ts
type HttpService = "github-api" | "github-packages" | "npmjs" | "release-asset"
type HttpDisposition = "success" | "retry" | "failed" | "github-packages-unresolved"

function classifyHttp(
  response: Pick<HttpResponse, "status" | "headers">,
  context: { service: HttpService; now: Date },
): HttpDisposition
```

For a GitHub REST `403`, credible rate-limit evidence is deliberately header-only and is exactly either:

1. normalized `retry-after` containing one positive base-10 safe-integer delta-seconds value; or
2. normalized `x-ratelimit-remaining` exactly `0` plus normalized `x-ratelimit-reset` containing one positive base-10 safe-integer Unix-seconds value strictly later than `context.now.getTime() / 1000`.

Comma-joined, signed, fractional, empty, stale, malformed, or duplicated evidence does not qualify. The checker intentionally does not inspect a `403` response body for secondary-rate-limit phrases: bodies can contain sensitive or attacker-controlled text, and header-only behavior is deterministic and locally testable. Header names, values, and response bodies are never copied into receipts or safe errors.

| Observation | Classification |
|---|---|
| Expected `200` with valid schema and matching content | Evaluate surface invariant |
| `404` on a not-yet-visible tag, run, Release, asset, or registry version | Retry until deadline, then `UNRESOLVED` |
| `429` in any service context, with or without rate-limit headers | Retry until deadline, then `UNRESOLVED` |
| GitHub REST `403` with either exact credible header pattern above | Retry until deadline, then `UNRESOLVED` |
| GitHub REST `403` without credible rate-limit headers | Immediate `FAILED` as permission/authorization denial |
| `500` through `599` | Retry until deadline, then `UNRESOLVED` |
| Network exception | Retry until deadline, then `UNRESOLVED` |
| `401`/`403` from required GitHub Packages proof | Immediate `UNRESOLVED` |
| Any other `400` through `499` | Immediate `FAILED` |
| Successful response with malformed schema | Immediate `FAILED` |
| Any other status, including an exposed redirect or unexpected `1xx`/`2xx`/`3xx` | Immediate `FAILED` |
| Deadline reached with a retryable required observation | `UNRESOLVED` |

The checker sleeps only when at least one required observation is retryable and the deadline has not expired. Each sleep is `Math.min(pollIntervalMs, deadlineAt - clock.now().getTime())`, so injected or wall-clock execution never intentionally sleeps past the captured deadline. Tests prove retry counts and elapsed clock changes without wall-clock waiting. No retry changes the bound tag SHA, run ID, or run attempt.

## Receipt Schema and Ordering

```ts
export interface ReleaseCompletionReceipt {
  schemaVersion: 1
  outcome: CompletionOutcome
  checkedAt: string
  repository: string | null
  lane: ReleaseLane | null
  tag: string | null
  version: string | null
  headSha: string | null
  runId: number | null
  runAttempt: number | null
  runUrl: string | null
  prerelease: boolean | null
  surfaces: {
    identity: SurfaceReceipt
    workflow: SurfaceReceipt
    jobs: SurfaceReceipt
    githubRelease: SurfaceReceipt
    releaseAssets: SurfaceReceipt
    checksums: SurfaceReceipt
    npm: SurfaceReceipt
    githubPackages: SurfaceReceipt
    pinnedLspRelease: SurfaceReceipt
  }
  jobs: ReadonlyArray<{ name: string; conclusion: string }>
  assets: ReadonlyArray<{ name: string; size: number; downloadedSize: number | null; sha256: string | null }>
  packages: ReadonlyArray<{ registry: "npmjs" | "github"; name: string; version: string; status: SurfaceStatus }>
  errors: ReadonlyArray<{ surface: keyof ReleaseCompletionReceipt["surfaces"]; code: string; message: string; retryable: boolean }>
}
```

Object keys are created in the interface order. Jobs sort by ordinal `name` then `conclusion`; assets sort by ordinal `name`; packages sort by registry rank `npmjs` before `github`, then ordinal `name` and `version`; errors sort by the fixed surface declaration order, then ordinal `code`, ordinal `message`, and `retryable` (`false` before `true`). Exact duplicate rows are removed before serialization. Error messages contain contract facts only: status code, surface, expected identifier, and safe name. They exclude transport exception messages, response bodies, headers, signed download URLs, and credentials. `runUrl` is constructed from the validated repository and fixed run ID as `https://github.com/{owner}/{name}/actions/runs/{runId}` rather than copied from remote JSON.

The four identity fields are nullable only for a CLI-input failure that occurs before a valid target/repository can be constructed. Every staged or remote probe receipt has non-null `repository` (`"local"` for staged mode), `lane`, `tag`, and `version`; `COMPLETED` is impossible while any identity field is null.

`checkedAt` is the ISO-8601 serialization of the explicit `Date` passed into the receipt builder. For CLI execution that `Date` comes only from the composition-root clock; staged validation, remote checking, and pre-network argument failures never read ambient time. The exact JSON is written once after all probes settle. The CLI itself emits no progress lines.

## Preventive Workflow Gates

The workflow retains its triggers, permissions, OIDC, setup actions, native matrix, package normalization, and GitHub Release mechanism.

### LSP package job

Split the current combined pack/publish step into:

1. Stage native binaries and package directories.
2. Pack all eight npm package tarballs into `release-assets` without publishing.
3. Generate `SHA256SUMS.txt`.
4. Run staged mode for the LSP tag; failure blocks all registry and artifact writes.
5. Publish or idempotently skip the eight npm packages using the existing Trusted Publishing logic.
6. Upload the already-validated `github-release-assets` artifact.

### Main package job

Keep package normalization and tarball construction, then order irreversible steps as:

1. Build both GitHub Release tarballs.
2. Generate `SHA256SUMS.txt`.
3. Run staged mode for the main tag; failure blocks npmjs.org, GitHub Packages, and artifact upload.
4. Publish or idempotently skip `ocmm` on npmjs.org.
5. Conditionally publish or skip `@owner/ocmm` on GitHub Packages through the existing condition.
6. Upload the validated artifact.

### GitHub Release job routing

Replace the “either package job succeeded” condition with two explicit accepted states:

- LSP route selected, `lsp-package == success`, `ocmm-package == skipped`.
- Main route selected, `lsp-package == skipped`, `ocmm-package == success`.

A cancelled job, failed active job, successful inactive job, unknown route, or any other pair prevents the Release job. The implementation must express the existing push/dispatch route predicates directly in the condition rather than relying on an unproven environment substitution.

## Shared Publish Skill

`skills/publish/SKILL.md` is a shared skill with frontmatter name `publish`. It defines this ocmm-only protocol:

1. Treat publication as ship-only: do not enter code-fix or review loops while publishing.
2. Treat tag creation and workflow terminal success as intermediate states.
3. Bind and wait for one checker receipt. Report completion only for `outcome: "COMPLETED"`.
4. On `FAILED`, report the immutable tag, peeled SHA, fixed run ID/attempt, every surface status, and the non-destructive next action. Do not move or recreate the tag.
5. On `UNRESOLVED`, report which surfaces lack proof and retain the immutable tag/SHA/run-ID/run-attempt identity for a later checker rerun.
6. Never print credentials, registry response bodies, Authorization headers, or signed asset URLs.
7. Do not trigger a workflow, publish, or mutate a Release merely because the skill was loaded; those actions still require explicit user authorization.

It does not include Discord, release-note mutation, OMO package names, LazyCodex, direct `gh` dependence, Bash-only commands, automatic bumping, or duplicated command files. Existing shared-skill discovery registers it for OpenCode. `pnpm run gen:codex-plugin` creates the normalized Codex copy.

## Testing Strategy

### Pure target and staged tests

- Strict main and LSP tag grammar, local version equality, and strict pinned version.
- Exact main and LSP inventories derived in canonical order.
- Successful local fixtures for both lanes with an explicit fixed `checkedAt`; receipts equal that timestamp even when ambient time differs.
- Missing, extra, non-regular, empty, duplicate, malformed, incomplete, and hash-mismatched assets.

### Remote identity and workflow tests

- Lightweight and multi-level annotated tag peeling.
- A second peel with the same SHA passes; a moved tag after binding fails without rebinding.
- Exact run discovery and one-time binding.
- Incomplete run discovery cannot prove uniqueness; a changed run attempt fails rather than switching job graphs.
- Tag/head/path/event/run mismatches and ambiguous discovery.
- Non-terminal polling, terminal success, terminal failure, and immutable identity across polls.
- Main success/skipped job combination and LSP thirteen-job combination.
- Missing, duplicate, unexpected, active-inactive, failed, and in-progress jobs.

### Remote surface tests

- Main success including exact three assets, downloaded hashes, npm, GitHub Packages, and pinned LSP Release.
- LSP success including seventeen assets, eight npm packages, and explicit skipped main-only surfaces.
- Draft Release, wrong tag, extra/missing/empty asset, downloaded size mismatch, malformed checksum, incomplete coverage, and digest mismatch.
- npm exact-version proof rather than dist-tag proof.
- GitHub Packages missing token and permission-denied uncertainty.

### Retry and CLI tests

- A `404`, `429`, `500`, and thrown network error each retry and then pass when a valid response appears.
- A normalized GitHub REST `403` with `remaining=0` plus future reset, and a separate `403` with valid `retry-after`, retry then pass.
- A GitHub REST permission `403` with missing, malformed, stale, or body-only rate-limit claims fails immediately without retry; header/body sentinel values never enter the receipt.
- The same retryable observations become `UNRESOLVED` at the injected deadline.
- A permanent `400` fails without a sleep or retry.
- Unexpected `204`/`302` statuses fail without retry, and a final partial sleep stops exactly at the injected deadline.
- Injected CLI tests prove staged, remote, and argument-failure receipts all use the supplied clock date; stdout is one parseable receipt; exit codes are `0`, `1`, and `2`; a sentinel token never appears in serialized output or errors.
- The sentinel Authorization value appears only on injected `api.github.com` and `npm.pkg.github.com` requests, never npmjs.org or asset-download requests.

### Real staged package-script test

`src/release-completion-cli.test.ts` contains the named test `real staged package-script smoke is network-free and machine-readable`. It does not call injected `main()`. The test:

1. Creates one root with `mkdtempSync()` and removes it unconditionally with `rmSync(root, { recursive: true, force: true })` in `finally`.
2. Asserts the tracked root package script is exactly `node --experimental-strip-types scripts/check-release-completion.ts`, then writes a temporary package at version `0.6.6` whose same script entry points to the product checker by absolute path. This permits the required `v0.6.6` staged proof without changing the repository version.
3. Writes exactly `deepwork-codex-plugin-0.6.6.tgz`, `ocmm-opencode-plugin-0.6.6.tgz`, and a strict `SHA256SUMS.txt` with correct local digests.
4. Writes a temporary ESM preload module that replaces `globalThis.fetch` with a function throwing `STAGED_NETWORK_ATTEMPT_SENTINEL`, and passes it through `NODE_OPTIONS=--import=<file-url>`.
5. Uses `spawnSync` with `pnpm.cmd` on standard Windows installations, a `pnpm.exe` fallback for this repository's Scoop shim, and `pnpm` elsewhere to execute the exact argument sequence `pnpm --silent run check:release-completion -- --mode staged --tag v0.6.6 --assets-dir <temp-assets>`.
6. Requires child exit `0`, no signal/error, empty stderr, stdout ending in one newline and accepted in full by one `JSON.parse`, schema `1`, outcome `COMPLETED`, repository `local`, lane `ocmm`, tag/version `v0.6.6`/`0.6.6`, a valid ISO `checkedAt`, and absence of both token and network sentinels.

The child uses the production CLI composition root, not an injected runtime. The test itself never reads ambient current time or contacts a service; it validates only that the child-produced timestamp is a valid ISO serialization. Exit `0` plus the throwing fetch preload proves staged completion does not require network.

### Workflow and skill tests

- Static workflow assertions prove each staged gate occurs after checksum generation and before the first publish/upload action in its job.
- Static workflow assertions prove the exact active-success/inactive-skipped GitHub Release condition.
- `loadSharedSkills()` discovers `publish` outside `skills/v1`; the source protocol contains required completion/immutability language and excludes OMO-only surfaces.
- Fresh Codex generation and the tracked generated `publish` tree match the normalized source.

All unit contract tests use local files, byte fixtures, injected responses, and injected time. The named child-process smoke uses only temporary local files and the production composition root, while its test assertions never read ambient current time. No test triggers Actions, publishes, resolves a live registry, requires a real token, or permits a network request.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/check-release-completion.ts` | Create, then refactor in place | Stable explicit public re-export/composition facade and sole direct-execution guard. |
| `scripts/release-completion/contracts.ts` | Create during structural refactor | Shared public/internal checker contracts with no behavior. |
| `scripts/release-completion/receipt.ts` | Create during structural refactor | Receipt mutation, deterministic finalization, and shared ordering/skip/retry policy. |
| `scripts/release-completion/target.ts` | Create during structural refactor | Strict release target parsing and canonical asset inventory. |
| `scripts/release-completion/checksums.ts` | Create during structural refactor | Shared strict checksum grammar and safe failure classification. |
| `scripts/release-completion/staged.ts` | Create during structural refactor | Local staged asset/checksum validation. |
| `scripts/release-completion/http.ts` | Create during structural refactor | HTTP adapter/classification, strict decoding primitives, and request helpers. |
| `scripts/release-completion/github-identity.ts` | Create during structural refactor | Tag, run, event, attempt, and lane-job identity proof. |
| `scripts/release-completion/github-release.ts` | Create during structural refactor | GitHub Release metadata, asset bytes, sizes, and digest proof. |
| `scripts/release-completion/registries.ts` | Create during structural refactor | npm, GitHub Packages, and pinned-LSP observations. |
| `scripts/release-completion/remote.ts` | Create during structural refactor | Bounded immutable remote orchestration and retry state machine. |
| `scripts/release-completion/cli.ts` | Create during structural refactor | CLI parsing, runtime composition, receipt output, and exit mapping. |
| `src/release-completion.test.ts` | Create, then delete during structural refactor | Historical Tasks 1–8 monolith; all 46 scenarios move without renaming. |
| `src/release-completion-test-support.test.ts` | Create during structural refactor | Shared deterministic test harness and child-process fixture support. |
| `src/release-completion-target-staged.test.ts` | Create during structural refactor | Strict target, inventory, staged file, and checksum scenarios. |
| `src/release-completion-remote-identity.test.ts` | Create during structural refactor | GitHub tag/run/event/workflow/job identity scenarios. |
| `src/release-completion-release-assets.test.ts` | Create during structural refactor | GitHub Release metadata/asset/download/hash scenarios. |
| `src/release-completion-registries-retry.test.ts` | Create during structural refactor | Registry, pinned-LSP, retry, deadline, permission, and partial-state scenarios. |
| `src/release-completion-cli.test.ts` | Create during structural refactor | CLI/runtime/redaction and real package-script child scenarios. |
| `src/release-completion-workflow.test.ts` | Create during structural refactor | Static release workflow ordering/routing/invariant scenarios. |
| `package.json` | Modify | Add `check:release-completion` using Node strip-types; no dependency or version change. |
| `.github/workflows/release.yml` | Modify | Reorder packing/checksums/gates before publication and express exact lane completion routing. |
| `skills/publish/SKILL.md` | Create | ocmm ship-only, checker-required, immutable partial-publication protocol. |
| `src/intent/skill-loader.test.ts` | Modify | Real shared publish discovery and protocol regression. |
| `src/codex/plugin-generator.test.ts` | Modify | Publish shared-skill source/fresh/tracked generated-tree equality. |
| `plugins/deepwork/skills/publish/SKILL.md` | Generate | Codex-normalized shared publish skill plus canonical compatibility suffix. |
| `README.md` | Modify | User-facing completion command, outcomes, credentials, and lane requirements. |
| `AGENTS.md` | Modify | Maintainer workflow: staged gate, checker receipt, immutable failure policy, and final `v0.6.6` use. |
| `docs/v1-maintenance.md` | Modify | Shared, non-v1 publish skill provenance and rejected OMO-only surfaces. |

`.agents/plugins/marketplace.json`, `.codex/agents/**`, and other `plugins/deepwork/**` files are regenerated only by the canonical generator and are expected to remain byte-identical unless the generator's shared-skill inventory requires the new publish path. They are not hand-edited.

## Verification and Real-Surface Boundary

Implementation verification runs, in order:

1. All seven split release-completion paths: six scenario-domain files (including the dedicated workflow-source file) plus the focused test-support module.
2. `node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="real staged package-script smoke is network-free and machine-readable" src/release-completion-cli.test.ts`, which launches the exact staged package script against temporary assets/checksums with a preloaded fetch-denial guard, one parseable `COMPLETED` receipt, empty stderr, and unconditional cleanup.
3. Skill loader and Codex generator tests.
4. `pnpm run build:ts`, then `pnpm run gen:codex-plugin` twice with a byte-inventory comparison proving deterministic output.
5. `pnpm run typecheck`.
6. `pnpm test`.
7. `pnpm run build`.
8. Installed TypeScript Compiler API diagnostics over the facade, every `scripts/release-completion/*.ts` module, every split release-completion test/support file, `git diff --check`, exact changed-path inspection, secret-pattern scan across all checker/test modules and generated skill, and structural checks proving the facade/internal line budgets, 46-scenario distribution, deleted monolithic test, and absent legacy duplicate.

No implementation test performs a valid remote probe or contacts a remote service. The invalid-argument remote CLI smoke stops before HTTP; the real staged child is guarded against fetch. During the later, separately authorized real release, after the version has become `0.6.6`, the immutable tag has been pushed, and the matching run exists, the release owner runs:

```powershell
if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) { throw "GITHUB_TOKEN with Actions and package read access is required" }
pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.6 --deadline-ms 5400000 --poll-ms 15000
if ($LASTEXITCODE -ne 0) { throw "v0.6.6 release is not proven complete; preserve the tag and inspect the JSON receipt" }
```

That later command is an acceptance surface, not an implementation step. It must not run before the real tag exists and must not be simulated against live services.

## Commit and Review Boundary

This feature is one independent release-safety change. Implementation subagents must not stage or commit. After implementation, integration checks, and the parent-owned reviewer/Oracle acceptance complete, the parent may use the user's separate authorization to create one semantic commit containing this feature only. No later `models[]`, dead-chain diagnostics, or coding-agent-sessions work belongs in that commit.

## Acceptance Criteria

1. Strict lane/tag/version parsing rejects every form outside exact stable `A.B.C` tags and local version equality.
2. Main and LSP asset/package inventories exactly match this design.
3. The checker peels and fixes one tag SHA, binds one run ID/attempt pair, never rebinds, waits for terminal success, and validates that attempt's lane-specific job combinations.
4. A successful run alone can never produce `COMPLETED`.
5. Release assets are non-draft, exact, non-empty, checksum-complete, downloaded, size-checked, and hash-checked.
6. npm exact versions are visible; main push GitHub Packages is proven or the outcome is not complete; main pinned LSP Release existence is proven without starting an LSP lane.
7. Retryable propagation/network states and header-proven GitHub REST rate limits return exit `2` and `UNRESOLVED` at deadline; ordinary permission `403` responses return exit `1` and `FAILED` while GitHub Packages permission remains explicitly unproven.
8. Every receipt includes every fixed surface, canonical ordered jobs/assets/packages/errors, no secret-bearing data, and a `checkedAt` sourced only from an explicit injected `Date`.
9. Both package jobs validate staged exact sets, non-empty files, checksum coverage, and hashes before any npm/GitHub Packages publish or artifact upload.
10. `github-release` runs only for the exact selected-lane success/inactive-lane skipped pair.
11. The shared publish skill requires the checker and immutable partial-state reporting, is auto-discovered, and appears in the generated Codex bundle without OMO-only surfaces.
12. The 2034-line checker and 1960-line test concentration are replaced by the exact focused production/test map above; the facade preserves exactly the pre-refactor public/direct-execution surface, every existing test name remains in its scenario domain, and no internal production module exceeds 250 nonblank, non-comment lines where the stated responsibility boundaries make that practical.
13. All tests are local fixtures/mocks, the real staged package-script smoke passes under a fetch-denial guard, all repository gates pass, and implementation performs no real publication or Git write.

## Design Self-Review

- **Completion-marker scan:** Every required interface, status, exit code, retry class, asset, package, job, command, and file is defined; no deferred implementation marker remains.
- **Internal consistency:** The same target and asset definitions drive staged and remote modes; only externally unprovable states become `UNRESOLVED`; a definite invariant violation always dominates the final outcome.
- **Scope:** The design changes one checker facade plus focused internal modules, splits one historical test monolith into one support module and six scenario files, and retains the existing workflow, shared skill/generated copy, two existing distribution tests, one manifest script entry, and three release documents. It excludes versioning and publication.
- **Ambiguity:** Tag grammar, workflow identity, manual-dispatch limitation, job combinations, asset/checksum grammar, registry proof, header-only GitHub `403` rate-limit evidence, injected timestamp ownership, real staged child-process wiring, receipt ordering, credentials, exit codes, exact structural file boundaries, public-facade compatibility, scenario counts, dead legacy-code removal, and parent-only commit ownership each have one explicit behavior.
