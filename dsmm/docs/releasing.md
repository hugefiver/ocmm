# DSMM v1.0 Release and Rollback

## Preflight

Run these local checks from the exact checkout/status selected for review; they are readiness evidence, not publication steps. Perform the npm-name ownership recheck before asking for publication authority: the registry lookup is current evidence and cannot reserve name ownership. Confirm DSH 0.1.1-rc.2 remains the compatibility authority, review license parity with the package contents, and complete artifact review of the dry-run pack manifest before any mutation.

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

The proposed DSMM tag convention is `dsmm-v1.0.0`. Publication requires explicit authorization and npm Trusted Publishing; the root release workflow has no DSMM lane. Every Git, tag, registry, and GitHub mutation requires new explicit authorization, even after all preflight evidence is green.

Treat both identities as immutable: never overwrite an npm version and never move, delete, or recreate an immutable tag. Readiness documentation and a local tarball do not authorize a publish.

## Post-publication verification

After an authorized publication, use a fresh isolated `DSH_HOME` and registry install the exact `dsmm@1.0.0` version into a new profile process. Check the plugin list and `--dump-config` from that profile, then use available host adapter status where the host exposes it; `/deepwork` and `/dsmm-status` are not headless task text.

Record the package integrity reported by the registry alongside the version, tarball identity, profile name, and verification time. The evidence must show that the installed package resolves from the registry rather than the working tree.

```powershell
$env:DSH_HOME = "$env:TEMP\dsmm-v1-verify"
dsh plugin --profile dsmm-v1-verify add dsmm@1.0.0
dsh plugin --profile dsmm-v1-verify list
dsh --profile dsmm-v1-verify --dump-config
npm view dsmm@1.0.0 dist.integrity --registry "https://registry.npmjs.org/"
```

## Rollback

For a profile-level rollback, run `dsh plugin --profile <name> remove dsmm`, add an exact known-good version, and restart the profile process. If a corrected package is needed, use a separately-authorized new patch version and repeat publication verification.

Never overwrite an npm version or rewrite a tag to repair a publication. Preserve the immutable evidence and select a new, authorized version instead.
