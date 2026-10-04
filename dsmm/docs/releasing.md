# DSMM 0.1.2 Release and Rollback

This is a future procedure for the 0.1.2 source update, not a completed-release receipt. The new identities are `@dsmm/dsmm@0.1.2`, tag `dsmm-scoped-v0.1.2`, and `dsmm-dsmm-0.1.2.tgz`. Existing 0.1.1 and older package versions, tags and assets remain immutable.

The mandatory sequence is **independent Docker acceptance → verified npm/GitHub publication → authorized official-carrier Desktop rollout**. No global/system DSH, Desktop configuration, account/provider, credential, or installed-app writes may occur before both earlier gates pass. Local readiness alone does not authorize publication or migration.

## Preflight

Run these checks from the exact source selected for review; they are readiness evidence, not publication steps. Confirm pinned DSH 0.2.0-rc.2 package/CLI identity, peer/client exports, license parity and the exact packed file set. Recheck scoped npm authority and absence of the new version/tag before authorized publication; a registry lookup cannot reserve ownership. Do not change root ocmm/LSP versions or regenerate the unrelated Codex adapter.

```powershell
git rev-parse HEAD
git status --short
pnpm --dir dsmm typecheck:test
pnpm --dir dsmm test
pnpm --dir dsmm build
node dsmm/scripts/generate-role-assets.mjs
pnpm --dir dsmm check:release
npm pack ".\dsmm" --dry-run --json
pnpm --dir dsmm smoke:docker
pnpm run typecheck
pnpm test
pnpm run build
```

The root typecheck, test and build must pass before committing. Inspect the pack JSON for the exact shipped client/profile assets and exclude secrets, test homes, tests, plans, sourcemaps and nested tarballs. Source-checkout Docker runs are development evidence; final acceptance below must use an explicitly supplied frozen artifact and expected SHA256 without building or repacking. A checker or successful install is not runtime, UI, publication or Desktop proof.

## Phase 1: frozen artifact and independent Docker gate

From the final tested committed checkout, pack once to `dsmm-dsmm-0.1.2.tgz`, inspect its archive, compute SHA256 and npm-compatible integrity, and freeze it. Run the final Docker runner with that **explicit artifact path and expected SHA256**. It must fail closed if either is missing/mismatched and must not build, repack, or silently choose another tarball. The receipt's `packedSha256` must match the frozen file.

Use a fresh image/process/home and exact pinned DSH, installing the packed package rather than importing checkout code. Do not mount or copy Desktop/global configuration, sessions, credentials, account records, browser storage or user authentication. A deterministic test-owned no-auth model fixture may drive actual runtime operations; paid chat and schema inventories alone cannot replace these scenarios:

- Settled healthy native root audit; enabled Orchestrator/Builder/Planner only, disabled Builder absent, auxiliary roles excluded from the root roster; actual blank-session Agent preset selection.
- Actual enabled auxiliary delegation and native read-only denials, with exact role route/effort and aliased-parent `llm.resolveCallConfig` preflight against the fixture catalog.
- Same packaged compiled DSMM UI through native client/slots and supported in-process operator/Gateway RPC into real profile storage: create/read/edit/save/apply/reset, explicit deployment-only validation errors, revision conflict, pointer failure, and exact draft/immutable-revision/pointer bytes.
- Save without activation; new-Agent-only apply; existing even-blank Agent retention; inherited child/recovery settings; fresh-process pinned current selection despite a subsequently edited draft; truthful cold-resume/removed auxiliary-root limitations.

The native component/RPC/storage test uses a supported composition-owned in-process carrier, not an anonymous production route or copied login. It is distinct from authenticated Desktop activation. Preserve sanitized scenario evidence and inspect the full intended diff before parent-owned authorized release operations. If any required scenario fails or the frozen bytes change, stop before publication/global migration.

## Phase 2: authorized immutable publication

Publication requires explicit authorization for the new identity. Recheck that `@dsmm/dsmm@0.1.2` and `dsmm-scoped-v0.1.2` are absent and the maintainer retains scope authority. The existing authenticated npm maintainer flow is the release route. The root release workflow and `check:release-completion` have **no DSMM lane**; do not claim root checker coverage or configured npm Trusted Publishing, or add an unrelated CI lane.

The earlier unscoped `dsmm-v0.1.0` GitHub release, scoped 0.1.0 release and scoped 0.1.1 release stay intact. A new-release authorization covers ordinary commit/push/tag/npm/GitHub actions for 0.1.2 only, not rewriting prior publications, app upgrades, global package-manager changes or authentication workarounds.

Rehash immediately before publication. Publish **the same frozen tarball** with `npm publish <reviewed-dsmm-dsmm-0.1.2.tgz> --access public --registry=https://registry.npmjs.org/`, and attach that tarball plus `SHA256SUMS.txt` to the new GitHub Release. Do not repack after Docker acceptance. Preserve any npm confirmation flow through its actual process and user-directed native authentication; a browser acknowledgement is not registry publication proof.

Treat both identities as immutable: never overwrite an npm version and never move, delete, or recreate an immutable tag. Readiness documentation and a local tarball do not authorize a publish.

### Publication identity verification

Verify the tag's peeled commit, exact npm name/version and `dist.integrity`, downloaded registry archive bytes, GitHub asset bytes and checksum list against the frozen artifact. Use a fresh isolated `DSH_HOME` for exact registry installation. Check root, `./preset-skills`, client/profile exports and native client assets resolve from the **installed registry package**, never the checkout. The Loader row remains `id: dsmm`. Initialize a fresh headless deployment profile first; `/deepwork` and `/dsmm-status` are not headless task text.

Record a DSMM-specific release receipt binding tag/commit, frozen SHA256/npm integrity, registry/GitHub downloaded identities and scenario results. A command/workflow conclusion alone cannot certify completion. Preserve any partial publication; do not overwrite assets, move/delete/recreate the tag, or repair in place. Use a separately authorized new version or a precisely authorized non-overwriting same-identity action.

```powershell
$env:DSH_HOME = "<fresh-task-owned-verification-home>"
dsh --profile dsmm-0.1.2-verify --from-default-profile headless --dump-config
dsh plugin --profile dsmm-0.1.2-verify add @dsmm/dsmm@0.1.2
dsh plugin --profile dsmm-0.1.2-verify list
dsh --profile dsmm-0.1.2-verify --dump-config
npm view @dsmm/dsmm@0.1.2 dist.integrity --registry "https://registry.npmjs.org/"
```

## Phase 3: official installed-carrier Desktop rollout

Only after both preceding gates pass may authorized global migration begin. Coordinate a fully quit Desktop, recheck concurrent edits, and preserve a recoverable local snapshot of only task-changed package-manager/DSMM-owned files—not the entire credential or session store. Use the exact installed official Desktop carrier to install `@dsmm/dsmm@0.1.2`. It may manage packages while the app is quit; it may **not** boot/dump the reserved Desktop profile. Never substitute standalone npm DSH, a renamed/copied profile, checkout imports, `app.asar` patches, global PATH/pnpm changes, or auth bypasses.

Preserve base/web bundles, deployment roles/skills, nine configured policies, disabled Builder, active mode, provider/model catalog, account state and UI preferences. Saving supported baseline settings as a runtime draft is explicit and reversible; it does not change structural configuration. Disclose current-selection cold resume and the unknown removed auxiliary-root ID limitation in [compatibility](compatibility.md) before rollout. Do not silently substitute personas or delete history.

After a supported restart, verify actual Desktop package 0.1.2 activation, healthy selectable intended roots, retained auxiliary delegation/read-only denial, and actual native profile UI create/edit/save/apply/reset with independent file/pointer bytes. Verify live even-blank Agents remain unchanged on apply and current pinned selection persists across restart. Check unrelated deployment/provider/account/UI state remained intact. If authenticated native Desktop behavior cannot be observed, report that pending boundary; disk files, headless tests and Docker UI proof alone are insufficient for complete integration.

## Rollback

Runtime rollback resets to the deployment baseline or explicitly reapplies a reviewed prior configuration with concurrency/revision checks. Never mutate immutable files or restore drafts over later user edits. Existing live Agents retain their snapshots.

For package rollback, use the official carrier to remove `@dsmm/dsmm`, add an exact known immutable version and restart through the supported path. Keep runtime drafts/revisions and unrelated settings. An old unscoped bundle must not coexist with the scoped bundle using the same `id: dsmm`. Desktop requires the installed carrier with the app fully quit; boot/dump remains unsupported. Do not restore credential files, sign out, delete sessions, remove old releases or perform broad recursive cleanup. Remove only exact task-owned temporary material when safe and retain release/recovery evidence.

Never overwrite an npm version or rewrite a tag to repair a publication. Preserve the immutable evidence and select a new, authorized version instead.
