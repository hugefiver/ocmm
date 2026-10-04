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

The immutable `dsmm-scoped-v0.1.2` tag points at `6f82a2e5dc366c7bcf13efe67da4fd0c326d0b8a`. It predates the new workflow. Dispatch the new workflow from `master`; do not move or recreate the tag.

The only approved transport files are:

| File | SHA256 |
| --- | --- |
| `dsmm-dsmm-0.1.2.tgz` | `d3f270edb32c76766c805996f7a30993b45ba938263ff9c73d74f99040190bc7` |
| `docker-receipt-native-session-control.json` | `e0fb329bf21f7b32ac06ffdbe93c32dadcfd2bf9f078089eceb97e421f0e8f3c` |

Stage those original bytes and deterministic `SHA256SUMS.txt` binding both files in a draft GitHub Release. Before writing, check that no npm 0.1.2 version or conflicting Release/assets exist. Never overwrite assets or run simultaneous local and CI publishers. Draft transport is not publication completion.

Bootstrap validates the previously completed independent Docker/browser/native proof. It does **not** rebuild, repack, rerun source tests, or claim that Docker ran in this CI attempt. The receipt must substantively prove both native carriers, all 14 UI checks, persistence/cold reopen, synthetic backup-first repair, LSP, lifecycle and cleanup. Failed sibling receipts are not alternatives.

Because this package was packed locally before CI existed, bootstrap explicitly disables build provenance while retaining OIDC authentication. Source commit and workflow control commit are recorded separately. Do not rewrite GitHub identity variables or claim a CI-build attestation for this package.

## Future versions

Only a maintainer-authorized stable `dsmm-scoped-vX.Y.Z` tag matching `dsmm/package.json` initiates a new version. Its workflow checks source identity, installs with the frozen lockfile, verifies/builds with pnpm, packs once, then runs independent full Docker acceptance against the frozen tarball. Publication receives the exact accepted run/attempt artifact, uses pnpm's native tarball publisher, and enables genuine CI provenance.

Future-tag controls use the trusted-repository-maintainer model: ancestry checks detect accidental wrong-source tags, not malicious repository writers who can replace the tagged workflow itself. This setup does not add or claim repository rulesets. Default-branch bootstrap dispatch has its own fixed identity checks.

The publication job alone has `id-token: write`; only the GitHub finalization job has `contents: write`. Registry authentication has no static-token fallback. Package-wide concurrency prevents competing workflow publication jobs and never automatically cancels a publisher.

After npm publication, verify metadata **and downloaded tarball bytes**, then install that exact registry version into a fresh native DSH `0.2.0-rc.2` headless home. Resolve every public export and compiled profile/client files from the installed package. Do not use the checkout, real accounts, global/Desktop profiles, production sessions, or paid model calls as substitutes. Finalize the non-overwriting draft only after this proof completes.

## Completion and failures

Run the DSMM-specific terminal checker after the fixed workflow run/attempt has finished:

```text
node scripts/check-dsmm-release-completion.mjs terminal --run-id <numeric-run-id> --run-attempt <numeric-attempt> --control-sha <exact-workflow-commit> --receipt <new-receipt-path>
```

The checker binds the repository/workflow, control and peeled tag commits, exact run/attempt and four job conclusions, accepted artifact, Docker evidence, public GitHub Release assets/checksums, npm metadata/downloaded bytes and isolated native install proof. It downloads the exact CI verification artifact by ID, checks its archive digest, and compares every installed export/profile/client file hash with the verified package bytes. Native install evidence originates in the Linux/Node 24 verification job; the terminal checker independently rechecks public bytes without repeating that installation on its own host. This does not claim a Windows/Desktop installation test. Only exit 0 with `COMPLETED` proves completion. A green workflow, npm command exit, draft Release or successful publisher setup alone does not.

`FAILED` (exit 1) and `UNRESOLVED` (exit 2) preserve all immutable identities. Report which surfaces already exist. Do not delete/recreate a tag, overwrite packages/assets or silently repair a partial release. Resuming publication requires explicit same-identity rerun authority; otherwise obtain authorization for a new version. No failure handler rolls back published data.

Global dsh rollout and the previously authorized real-session repair follow verified release completion in separate phases. Authenticated Desktop testing and paid DeepSeek Flash testing are not claimed by this keyless publication workflow.
