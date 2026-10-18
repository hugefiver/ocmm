# DSMM source readiness and release

DSMM uses `.github/workflows/dsmm-release.yml` and the controls under `dsmm/scripts/`. The root ocmm completion checker is not its completion authority. This document defines the current working-source contract; it does not authorize a commit, push, tag, workflow dispatch, publication or installation.

## Source and package boundary

`@dsmm/dsmm@0.3.1` targets exactly DSH `0.2.1-rc.2`, tag `dsmm-scoped-v0.3.1` and archive `dsmm-dsmm-0.3.1.tgz`. Its runtime composition uses the official `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-subagent` and `@deepseek-ai/dsh-session-persistence-jsonl` packages at that exact version. The published `0.3.0` tag, archive and release policy retain their original rc.1 identity and custom-owner acceptance grammar; they are historical evidence, not a policy fallback for 0.3.1. Public runtime requires Node.js 22 or later.

The 0.3.1 release contract does not freeze a guessed compiled-file inventory. It requires the main, client, preset-skill, package metadata and locale resources, validates every declared public module/resource target against the packed archive, and follows relative module imports to delivered targets. Additional public entries are admitted only through this resolvable manifest contract. Retired custom-owner entries (`./agent-registry`, `./subagent-runtime`, `./session-persistence` and `./legacy-read-host`) are not valid 0.3.1 public entries. Historical release metadata and compiled inventories remain version-bound.

## Build-only release preparation

The exact 0.3.1 release lane builds and packs without running test suites, test typechecks, source-content comparisons, Docker/browser acceptance or fresh-install tests. Compilation and resource generation remain required. This exception is not a future-version range: unreviewed versions remain rejected. Use the existing approved toolchain and platform-matching dependencies; do not change root ocmm/LSP versions or the unrelated Codex adapter for a DSMM release.

A cold checkout may lack ignored frontend resources. Explicitly authorized preparation uses:

```powershell
node dsmm/scripts/materialize-frontend.mjs --sync
pnpm run build
pnpm --dir dsmm build
pnpm --dir dsmm generate:roles
```

Only explicit `--sync` fetches declared immutable upstream resources and verifies their provenance. Existing local resource bodies are not locked by file-content hashes. Normal build/check commands remain offline. [Source synchronization](skill-sync.md) describes presence, closure, attribution and path-safety requirements. Build output is not runtime verification.

Release preparation resolves the trusted tag, peeled product source, workflow/control commit, event and fixed run/attempt. Pack once from the selected source checkout with pinned pnpm between the source guards. Freeze that exact tarball; never substitute a development package, repack accepted bytes or adopt another run's receipt.

For exact 0.3.1, `freeze` does not require a native `--receipt`. It produces an `artifact-integrity-only` receipt from the actual package bytes, recording `sourceChecks`, native acceptance and fresh installation as `NOT_RUN_RELEASE_POLICY`. The existing receipt asset filename is a transport identity, not a claim that Docker tests ran. Package digests, tag/run identity, official runtime dependency pins, genuine provenance and non-overwrite protection remain mandatory. Exact 0.3.0 retains its own historical build-only identity; earlier versions retain their native acceptance requirements.

## Current npm publication completion

The working-source topology `split-publication-v1` has six jobs: `import-bootstrap`, `prepare`, `publish`, `prepare-recovery-022`, `publish-recovery-022` and `github-release`. The selected prepare/publish pair must succeed and the other pair must be skipped. Bootstrap import succeeds only for bootstrap and is otherwise skipped. Missing or duplicate jobs, wrong identity, cancelled workflow or an unsuccessful selected publisher cannot complete.

The guarded publisher uses the unchanged accepted tarball, ignored lifecycle scripts, GitHub Actions OIDC and genuine provenance. Static-token fallback, forged CI identity, implicit publish retry and package overwrite are forbidden.

After an authorized matching run terminates, use its trusted control checkout and a new receipt path:

```powershell
node dsmm/scripts/check-dsmm-release-completion.mjs terminal-publication --run-id <run> --run-attempt <attempt> --control-sha <trusted-control-head> --receipt <new-publication-receipt.json>
```

Only exit 0 with `mode: npm-publication` and `outcome: COMPLETED` proves npm publication complete. The checker binds repository, workflow ID/path, trusted ancestry, event/ref, package/tag/peeled source, accepted bytes and checksums to the successful selected publisher. Ordinary source equals control; fixed recovery keeps separate product and control identities.

This topology has no post-publication `verify` job, registry-proof artifact, registry readback or fresh registry reinstall. It records workflow and `github-release` conclusions separately. Successful npm publication does not imply a complete public GitHub Release or passing functional tests.

## Independent GitHub Release delivery

`github-release` depends on both prepare/publish pairs with cancellation and selected-success/other-skipped guards. Empty or dual accepted-artifact outputs refuse before download. Transport creates only an absent draft and uploads the original tarball, integrity/acceptance receipt and `SHA256SUMS.txt`.

`transport --output <new-file>` records the draft and asset IDs created by that invocation. `finalize --transport <file>` binds those IDs to accepted source/control/run/attempt and package digests, validates all three assets/checksums and the remote tag, then makes only that draft public. It cannot adopt another Release, overwrite assets or repair partial delivery. The fixed historical bootstrap draft is the sole policy exception.

Exit 1 (`FAILED`) or 2 (`UNRESOLVED`) requires reporting the partial or unknown state. Preserve tags, packages, assets and receipts. Do not move/delete/recreate a tag, repack, overwrite, adopt another run's proof or repair in place. A new version or same-identity rerun requires separate authorization. Report GitHub delivery failure independently of npm publication.

## Historical proof and restricted recovery

Historical five-job and seven-job `split-recovery-022-v1` runs keep their own `terminal` completion requirements, including their original verification surfaces. Use the exact released checkout and run identity:

```powershell
node dsmm/scripts/check-dsmm-release-completion.mjs terminal --run-id <run> --run-attempt <attempt> --control-sha <released-control-head> --receipt <new-terminal-receipt.json>
```

New six-job controls cannot retrospectively reinterpret an earlier run. Historical metadata, exports, native receipt grammars, provenance, assets and job identities remain version-bound. Existing 0.3.0 and new 0.3.1 integrity-only receipts never establish native or browser execution.

The restricted `recovery=unpublished-0.2.2` selector binds original workflow `374825007`, run `38822000490`, attempt `1`, failed prepare, skipped other jobs and no accepted artifact. It requires the original immutable tag/source and complete authenticated absence of npm and public/draft Release publication at entry and immediately before publish. **An already published version is ineligible.** Unknown selectors or extra inputs refuse; omitted/empty dispatch retains the frozen bootstrap policy.

Recovery uses independent control and original-product checkouts. `assert-source`, `pack` and recovery `freeze` require `--source-root`. Provenance names the actual new dispatch/control commit, while the receipt separately binds `productSourceSha` and `attestedControlSha`. No control repair is copied into the fixed product artifact.

Independent registry verification is reserved for historical or explicitly requested checks. Metadata, archive and provenance share the version's deadline: normally 120,000 ms, at most 300,000 ms explicitly; historical 0.1.9 alone permits twenty minutes. Only post-publication HTTP 404 reads may wait. Other transport, byte, provenance or identity failures refuse. Absence checks remain single-shot. Legacy finalization requires `--verification`.

## Installation and rollback

Publication does not authorize installation, migration, login or session repair. Desktop and CLI/TUI profiles are independent. Separately authorized installation uses the target carrier/profile and preserves providers, accounts, native model/effort, unrelated Loader rows, roles, UI preferences and history. Package installation is not proof of Electron activation.

Runtime rollback explicitly selects a reviewed prior configuration under revision and ownership checks. Package rollback uses supported carrier operations and an exact immutable version. Neither operation may overwrite later drafts, restore credentials, sign out, delete sessions or perform broad cleanup. Scoped and old unscoped bundles must not compete for the same `dsmm` entry. Clean only exact task-owned temporary resources.
