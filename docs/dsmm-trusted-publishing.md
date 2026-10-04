# DSMM trusted publishing

This is the repository's DSMM release procedure. It is separate from the ocmm/LSP workflow and completion checker. The original packed DSMM 0.1.2 documentation is unchanged; this guide supersedes its prohibition on adding a CI lane under the maintainer's subsequent authorization.

## One-time npm setup

Keep account two-factor authentication enabled. In the existing `@dsmm/dsmm` package's settings, configure its trusted publisher:

- Provider: GitHub Actions
- Organization/user: `hugefiver`
- Repository: `ocmm`
- Workflow filename: `dsmm-release.yml` (not a path)
- Environment: empty
- Allow direct publication, not staging only

Package settings entry:
https://www.npmjs.com/package/@dsmm/dsmm/access

An existing, different publisher must not be silently replaced. Review that relationship before changing it. Administration can alternatively use a temporary npm CLI >=11.15.0, with mandatory account MFA:

```text
npm trust list @dsmm/dsmm
npm trust github @dsmm/dsmm --file dsmm-release.yml --repo hugefiver/ocmm --allow-publish
```

The new release controller uses npm only for this administrative interface. Project dependency installation, builds, tests, packing and publication use pinned pnpm **11.9.0**. Do not install npm globally, disable 2FA, retain a publishing token, or add `NPM_TOKEN`/`NODE_AUTH_TOKEN` to this workflow. The publishing job obtains a short-lived package-scoped credential through GitHub OIDC. A website login alone does not prove the publisher is bound correctly.

The established independent Docker acceptance image has its own pinned native-carrier toolchain and npm-based fixture provisioning. That test-runtime implementation is unchanged; it is not the project's dependency or publishing path and is not evidence that project publication uses npm CLI.

## Frozen 0.1.2 bootstrap

This retained contract protects the existing unpublished 0.1.2 candidate. The current release work targets a separately authorized future-tag 0.1.3 release; do not dispatch 0.1.2 bootstrap or change its frozen draft/assets in that phase.

The immutable `dsmm-scoped-v0.1.2` tag points at `6f82a2e5dc366c7bcf13efe67da4fd0c326d0b8a`. It predates the new workflow. If bootstrap is separately authorized in a later phase, dispatch from `master`; do not move or recreate the tag.

Use the existing draft Release `403185800`; its original asset identities are fixed:

| File | Asset ID | SHA256 policy |
| --- | --- | --- |
| `dsmm-dsmm-0.1.2.tgz` | `610552438` | `d3f270edb32c76766c805996f7a30993b45ba938263ff9c73d74f99040190bc7` |
| `docker-receipt-native-session-control.json` | `610552439` | `e0fb329bf21f7b32ac06ffdbe93c32dadcfd2bf9f078089eceb97e421f0e8f3c` |
| `SHA256SUMS.txt` | `610552442` | Exact deterministic checksum list binding both original files |

Do not recreate this draft, reupload its assets, or substitute identical bytes under new IDs. The same Release and asset IDs must survive public finalization. Before dispatch, recheck npm version absence and transport identity; never run simultaneous local and CI publishers. Draft transport is not publication completion.

GitHub's tag endpoint does not discover drafts, and authenticated draft-list access requires push permission. Bootstrap therefore starts with `import-bootstrap`, the only bootstrap-only job. Its job-local `contents: write` permits draft reads; its trusted helper performs only fixed-repository GETs and no install, build, pack, publication, tag or asset mutation. It has no OIDC permission. Bounded release-list pagination must be complete and unambiguous, followed by an exact numeric-ID re-fetch and the frozen-byte checks.

The importer uploads `dsmm-bootstrap-<run>-<attempt>`. `prepare` has only `contents: read`, downloads the exact importer artifact ID, and independently revalidates its context, archive, digests, checksums, original transport IDs and substantive Docker receipt. The import token is not included in the artifact or passed to prepare. Prepare runs for bootstrap only after successful import; future tags require the importer to be skipped, and use the unchanged source/Docker path. Explicit dependency-result checks preserve this future path without admitting failed or cancelled gates.

Bootstrap validates the previously completed independent Docker/browser/native proof. It does **not** rebuild, repack, rerun source tests, or claim that Docker ran in this CI attempt. The receipt must substantively prove both native carriers, all 14 UI checks, persistence/cold reopen, synthetic backup-first repair, LSP, lifecycle and cleanup. Failed sibling receipts are not alternatives.

Because this package was packed locally before CI existed, bootstrap explicitly disables build provenance while retaining OIDC authentication. Source commit and workflow control commit are recorded separately. Do not rewrite GitHub identity variables or claim a CI-build attestation for this package.

## Future versions

Only a maintainer-authorized stable `dsmm-scoped-vX.Y.Z` tag matching `dsmm/package.json` initiates a new version. Its workflow checks source identity, installs with the frozen lockfile, verifies/builds with pnpm, packs once, then runs independent full Docker acceptance against the frozen tarball. Publication receives the exact accepted run/attempt artifact, uses pnpm's native tarball publisher, and enables genuine CI provenance.

Human-facing plugin/preset labels use `Deepwork` / `DW Role`; package and protocol identities remain stable: `@dsmm/dsmm`, config ID `dsmm`, `dsmmProfiles` RPCs, role/tool/event IDs and the persistence provider. The controller selects a strict versioned resource policy independently of the source readiness helper's current 0.1.3 assertion. Historical 0.1.1/0.1.2 packages retain exactly five exports and no metadata locale resources. From 0.1.3, exactly seven exports are required: the existing five plus string exports `./locale/en.json` and `./locale/zh.json` to those exact resource paths. Both JSON resources contain only `meta.title` (`Deepwork`) and a nonempty localized `meta.description`; extra languages, fields or exports are rejected. Locale JSON is a resource, not executable compiled output.

Future-tag controls use the trusted-repository-maintainer model: ancestry checks detect accidental wrong-source tags, not malicious repository writers who can replace the tagged workflow itself. This setup does not add or claim repository rulesets. Default-branch bootstrap dispatch has its own fixed identity checks.

The publication job alone has `id-token: write`. `contents: write` is limited to bootstrap draft import and GitHub finalization; prepare, publish and registry verification stay read-only for repository contents. The importer is not applicable to future-tag releases. Registry authentication has no static-token fallback. Package-wide concurrency prevents competing workflow publication jobs and never automatically cancels a publisher.

After npm publication, verify metadata **and downloaded tarball bytes**, then install that exact registry version into a fresh native DSH `0.2.0-rc.2` headless home. Resolve every public export and compiled profile/client files from the installed package. Do not use the checkout, real accounts, global/Desktop profiles, production sessions, or paid model calls as substitutes. Finalize the non-overwriting draft only after this proof completes.

For 0.1.3 and later, Docker evidence must also bind all twelve exact DW preset labels, the two existing web roots' actual native display names, and the native plugin title. Registry installation hashes both installed locale exports and invokes the pinned public native `@deepseek-ai/dsh-app-boot/readPluginMeta` in a fresh isolated child process against the profile-owned installed package. Its English/Chinese title and description results must match those exact installed JSON bytes; a manifest `displayName`, checkout-only check or synthetic reader is not proof. The receipt includes reader identity/hash, execution hashes, locale resource hashes and both metadata checks. Terminal completion compares those locale metadata values and hashes with the verified tarball as well.

## Completion and failures

Run the DSMM-specific terminal checker after the fixed workflow run/attempt has finished:

```text
node scripts/check-dsmm-release-completion.mjs terminal --run-id <numeric-run-id> --run-attempt <numeric-attempt> --control-sha <exact-workflow-commit> --receipt <new-receipt-path>
```

The checker requires exactly five jobs: `import-bootstrap`, `prepare`, `publish`, `verify`, and `github-release`. Import must succeed for bootstrap; for future tags its actual conclusion must be `skipped`, recorded as `NOT_APPLICABLE`, never as successful imported evidence. The other four jobs must succeed in both modes, all bound to the fixed run and attempt.

Proof binds the repository/workflow, control and peeled tag commits, accepted artifact, Docker evidence, public GitHub Release assets/checksums, npm metadata/downloaded bytes and isolated native install proof. For bootstrap it downloads the exact same-run/attempt import artifact by ID, verifies its archive digest, compares all five transported files with prepare's accepted artifact, and retains its ID/digest plus the original draft/asset ID map in the terminal receipt. It also downloads the exact CI verification artifact, checks its archive digest, and compares every installed export/profile/client file hash with verified package bytes. Native install evidence originates in the Linux/Node 24 verification job; the terminal checker independently rechecks public bytes without repeating that installation on its own host. This does not claim a Windows/Desktop installation test. Only exit 0 with `COMPLETED` proves completion. A green workflow, npm command exit, draft Release or successful publisher setup alone does not.

`FAILED` (exit 1) and `UNRESOLVED` (exit 2) preserve all immutable identities. Report which surfaces already exist. Do not delete/recreate a tag, overwrite packages/assets or silently repair a partial release. Resuming publication requires explicit same-identity rerun authority; otherwise obtain authorization for a new version. No failure handler rolls back published data.

Global dsh rollout and the previously authorized real-session repair follow verified release completion in separate phases. Authenticated Desktop testing and paid DeepSeek Flash testing are not claimed by this keyless publication workflow.
