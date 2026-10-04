# DSMM 0.1.0 Release and Rollback

## Preflight

Run these local checks from the exact checkout/status selected for review; they are readiness evidence, not publication steps. Perform the npm-name ownership recheck before publication: the registry lookup is current evidence and cannot reserve name ownership. Confirm the pinned DSH 0.2.0-rc.2 package/CLI identity, review license parity with the package contents, and complete artifact review of the dry-run pack manifest before any mutation. The user selected 0.1.0 for the initial package release; readiness alone does not authorize publishing or replacing an artifact.

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

The DSMM test, build, checker, pack, and Docker checks cover the package surface; run `pnpm --filter dsmm test` when completing the DSMM test check. The root typecheck, test, and build check the surrounding repository. Inspect the `npm pack` JSON for the intended artifacts, files, and license before treating the package as review-ready. Local evidence has one boundary: a successful local checker or Docker smoke is not proof of publication.

## Authorized publication

The initial DSMM tag is `dsmm-v0.1.0`. Publication requires explicit authorization; the root release workflow has no DSMM lane. The authorized first-release bootstrap uses the maintainer's authenticated npm account to publish the reviewed tarball. npm Trusted Publishing is a future CI option, not an authentication claim for this bootstrap. Release authorization covers normal commit, push, tag, npm publication and GitHub Release steps for this identity only; it does not authorize rewriting existing publications or adding unrelated release lanes.

Pack once after checks, publish that exact tarball with `npm publish <reviewed-dsmm-0.1.0.tgz> --access public --registry=https://registry.npmjs.org/`, and attach the same tarball plus `SHA256SUMS.txt` to the GitHub Release. Record the tag's peeled commit, npm integrity and downloaded asset checksums. A DSMM release is complete only when these identities agree and a fresh registry-installed profile loads successfully; the root ocmm completion checker does not cover DSMM.

Treat both identities as immutable: never overwrite an npm version and never move, delete, or recreate an immutable tag. Readiness documentation and a local tarball do not authorize a publish.

## Post-publication verification

After an authorized publication, use a fresh isolated `DSH_HOME` and registry install the exact `dsmm@0.1.0` version into a new profile process. Check the plugin list and `--dump-config` from that profile, then use available host adapter status where the host exposes it; `/deepwork` and `/dsmm-status` are not headless task text.

Record the package integrity reported by the registry alongside the version, tarball identity, profile name, and verification time. The evidence must show that the installed package resolves from the registry rather than the working tree.

```powershell
$env:DSH_HOME = "$env:TEMP\dsmm-0.1.0-verify"
dsh plugin --profile dsmm-0.1.0-verify add dsmm@0.1.0
dsh plugin --profile dsmm-0.1.0-verify list
dsh --profile dsmm-0.1.0-verify --dump-config
npm view dsmm@0.1.0 dist.integrity --registry "https://registry.npmjs.org/"
```

## Rollback

For a profile-level rollback, run `dsh plugin --profile <name> remove dsmm`, add an exact known-good version, and restart the profile process. If a corrected package is needed, use a separately-authorized new patch version and repeat publication verification.

Never overwrite an npm version or rewrite a tag to repair a publication. Preserve the immutable evidence and select a new, authorized version instead.
