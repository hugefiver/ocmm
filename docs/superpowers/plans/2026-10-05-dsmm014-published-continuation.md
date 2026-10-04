# DSMM 0.1.4 published-origin continuation

## Outcome and scope

Complete the already-authorized same-identity `@dsmm/dsmm@0.1.4` release: fresh genuine registry/native verification, missing public GitHub Release, then DSMM terminal `COMPLETED` proof. Original CI remains truthfully failed; original accepted bytes and npm provenance remain original. Global rollout, Flash, Desktop and real-session work stay blocked until completion. Same-version retry authority is already granted; do not add another user-approval gate.

No registry upload/OIDC, rebuild/repack, product/version/generated changes, tag move/delete/recreation, accepted-artifact rewriting/reupload, asset replacement, bootstrap dispatch or normal-guard weakening. Main owns implementation/review and authorized Git/external actions. Planner owns only this file; others' changes are preserved.

## Fixed origin and current evidence

Live GitHub evidence inspected 2026-10-05; require these exact identities, not caller selections:

| Field | Frozen value |
| --- | --- |
| Repository/tag/version | `hugefiver/ocmm` / `dsmm-scoped-v0.1.4` / `0.1.4` |
| Original source/control SHA | `d133475c8f297f81ab20782d6b469e02eadefa2a` |
| Original workflow/run/attempt | `.github/workflows/dsmm-release.yml`, ID `374825007`, run `37240470628`, attempt `1`, push, completed/failure |
| Original accepted artifact | ID `11317741434`, `dsmm-accepted-37240470628-1`, 257969 bytes, unexpired |
| Accepted ZIP digest | `sha256:80ea8dc079a3196cdd159a212ba1f8e73ad94be90a5720a6290ba52af868b627` |
| Package filename/SHA256 | `dsmm-dsmm-0.1.4.tgz` / `3747bedef856278c30f3869081fed82f42fb15cd7178d464f6fdb30009fe2b61` |

Exact original jobs: `import-bootstrap` ID `111548000843` skipped; `prepare` ID `111548000008` success; `publish` ID `111548674992` success; `verify` ID `111548723962` failure; `github-release` ID `111548765501` skipped. Preserve every actual status/conclusion. Only prepare/publish supply successful original gates; failed downstream gates need real continuation evidence.

Original verify saw registry 404 immediately after publication. Registry now serves the exact bytes and original-run provenance. Main's unchanged Linux/Node24 native public install passed (`output_test/dsmm014-release/linux-native-probe/install.json`); Windows failed native plugin-list proof. These do not replace new CI proof or justify probe weakening. Remaining package/receipt hashes, size/integrity, source checks and full 14-check Docker acceptance come from the original digest-verified artifact. No screenshot-import framework is needed.

## Minimal implementation: five files

1. New `.github/workflows/dsmm-published-continuation.yml`: no-input dispatch-only workflow, exactly `verify` and `github-release`.
2. New `scripts/dsmm-release-continuation.mjs`: small fixed-origin `verify`/`finalize` controller; no publisher.
3. `scripts/check-dsmm-release-completion.mjs`: additive fixed-origin validators/shared archive helper and `terminal-continuation`; ordinary modes untouched.
4. New `src/dsmm-published-continuation.test.ts`: focused real seams using existing fixtures/injection patterns.
5. `docs/dsmm-trusted-publishing.md`: truthful continuation procedure and failure boundaries.

Keep shared fixed policy/evidence helpers in the checker, imported by the small controller, avoiding circular dependencies or a general release framework. No change to `scripts/dsmm-release.mjs` is needed. Main dispatches blocker-focused plan criticism before implementation.

## Wave 1 — validate origin and separate trusted control

Download only the fixed original artifact after checking original **attempt-specific** run/workflow, complete five-job and artifact inventories, exact job IDs/conclusions, artifact ID/name/non-expiry/source/size/digest. Verify actual ZIP digest and existing safe five-file membership before extraction. Require the immutable remote tag still peels to the frozen SHA.

Read original `context.json` and reuse `validateArtifactDirectory(directory, originContext)` (`scripts/dsmm-release.mjs:442`): identity, archive/digests/resources, substantive Docker receipt and deterministic checksums all remain original. Require future/ci-built/provenance true, source checks completed and no bootstrap import.

Separately resolve genuine continuation context: Actions, exact repository/default branch, workflow_dispatch with empty inputs, `refs/heads/master`, workflow ref `hugefiver/ocmm/.github/workflows/dsmm-published-continuation.yml@refs/heads/master`, positive run/attempt, and checkout HEAD = real workflow SHA = event SHA. Control must be in fetched default-branch history and contain the controls. Never replace origin fields or forge GitHub env variables. Normal `main()` at controller line 787 compares current event context to accepted origin, so cannot serve continuation; full rerun also correctly rejects the published version at `publishArtifact()` line 678.

## Wave 2 — genuine verification, then missing Release

New workflow uses existing pinned actions, immutable workflow-SHA checkout/full history/no persisted credentials, Linux Node24, bounded timeouts and shared `dsmm-npm-publication` concurrency with cancellation disabled. Verify has contents/actions read; GitHub Release has contents write/actions read and runs only after successful verify. No id-token permission, static npm auth, source install/build/pack, bootstrap or upload-to-registry step.

Verify calls existing `verifyPublishedArtifact(originalIdentity)` (checker line 80), which checks public bytes/original provenance and runs the unchanged isolated native DSH0.2.0-rc.2/pnpm11.9.0 fresh install. Then `validateInstalledFileHashes()` (checker line 204) binds exports/profile/client and native locale metadata to accepted bytes. Any failed native/metadata/cleanup check stops; no byte-only substitute or weakened gate.

Upload one continuation envelope wrapping the raw origin-bound verification plus separate actual continuation context and fixed origin artifact ID/digest. Keep inner identity/provenance original. Artifact name `dsmm-registry-verification-<newRun>-<attempt>`, sole file `dsmm-registry-verification.json`, reuses existing safe ZIP membership. Ordinary raw-receipt validation must not mistake the wrapper for a normal receipt.

Release job independently reloads origin and exact new proof by actual artifact ID, run/attempt/name/digest; validates both contexts, inner verification and installed hashes. Use exported APIs `stageDraftTransport(directory, originContext)` (controller line 724) and `finalizeRelease(directory, originContext, innerVerification)` (line 756), not ordinary CLI. These preserve complete authenticated bounded draft discovery, immutable-tag rechecks, registry recheck, and exact draft-byte validation before public finalization.

Require no existing Release, including drafts, before initial staging. First upload of the missing original-byte Release is authorized; overwriting/reuploading is not. Exact assets: original tarball, `docker-receipt-native-session-control.json`, `SHA256SUMS.txt`. If a partial draft or existing Release appears, preserve/report its ID/assets and stop mutations, never silently adopt/repair it. Retry can repeat verification while absent; partial-state handling returns to main under existing same-identity authority without manufacturing approval or weakening absence/byte guards.

## Wave 3 — additive terminal authority

Add `terminal-continuation --run-id <actualNewRun> --run-attempt <actualAttempt> --control-sha <actualMasterControl> --receipt <newPath>`. Only continuation identity is caller-fixed; origin is frozen policy. Ordinary `verify`, `terminal`, `REQUIRED_JOBS`, `validateRunEvidence()` (checker line23), schemas/guards and bootstrap rules stay intact.

Terminal independently rechecks fixed original attempt/history/archive/Docker bytes; genuine new workflow file/ID/repository/master dispatch/control ancestry and exactly two successful fixed-attempt jobs; exact new proof ZIP/envelope and installed hashes; immutable peeled tag; public stable Release with exact assets/IDs/checksum/original bytes; current registry bytes and original provenance. Reuse private `defaultDownloadArtifact()` (line236) and asset fetch/validation where useful; expose narrowly rather than duplicate checks. Preserve original attempt selection even if latest-attempt metadata changes. As existing terminal does, fresh install comes from validated Linux CI proof, not a redundant terminal-host install.

Use an explicit continuation terminal receipt (e.g. schema2/mode published-continuation) containing separate `originWorkflow` with actual failure/all five jobs; `continuationWorkflow` with actual success/two jobs/control; `originAcceptedArtifact` original ID/archive digest; `verificationProof` new ID/archive digest/run/attempt; original `artifact`/publication provenance; public `githubRelease` asset IDs; actual CI fresh-install evidence and nonclaims. Never flatten this into a green original workflow or change provenance invocation to new run. Do not introduce unrelated signatures/receipt hashes. Only exit0/COMPLETED unlocks later phases; FAILED1/UNRESOLVED2 preserve/report all surfaces.

## Acceptance and handoff

Focused tests must prove two-run success and rejection of wrong origin/version/tag/job/attempt/control, expired/ambiguous/mismatched ZIPs or unsafe files, wrong dispatch/ref/input/ancestry, incomplete/duplicate/extra or failed new jobs, tampered wrapper/provenance/install/locale hashes, changed tag, existing/partial drafts, asset/checksum/registry divergence. Assert no mutation before successful evidence; YAML enforces two jobs/permissions/concurrency/dependencies and no publish/OIDC/pack/clobber. Ordinary terminal still rejects failed original run; all existing release/probe tests remain green.

Before authorized commit run focused Node tests, `pnpm run typecheck`, `pnpm test`, `pnpm run build`; review only bounded control changes and unchanged guards. Main makes reviewed controls available on trusted master, records actual control SHA, dispatches only new workflow and captures actual run/attempt/proof. Run terminal-continuation only after genuine termination. No future identifier is invented here. Noncompleted results remain blockers, with immutable state preserved.

Self-review: exact original bytes/provenance and failed history survive; new successful proof is genuine and separately bound; mutation is create-only missing Release; fresh native gating and normal guards remain strict. Return this file to main/critic; planner performs no implementation or release action.
