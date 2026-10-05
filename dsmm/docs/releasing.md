# Deepwork 0.1.6 Release and Rollback

This is a future procedure for 0.1.6, not a completed-release receipt. The new identities are `@dsmm/dsmm@0.1.6`, tag `dsmm-scoped-v0.1.6`, and `dsmm-dsmm-0.1.6.tgz`. Deepwork/DW display names do not rename package or protocol IDs. Existing 0.1.1 and older releases remain immutable. The stopped 0.1.2 tag, frozen artifact and draft Release remain untouched and unpublished: do not dispatch its bootstrap publisher, finalize its draft, overwrite its bytes or move/delete/recreate its tag.

The `dsmm-scoped-v0.1.3` tag at `2bdea4b` is immutable too. Run `37235817488` failed **before pack/publish** because pnpm 11 ignored esbuild/koffi build scripts. Preserve that tag and its historical plan; do not reroute it to the successor. 0.1.6 must obtain its own fresh source, clean Linux build, packed bytes and receipt.

The completed 0.1.4 publication and its separately authorized continuation remain historical evidence: original run `37240470628/1` and continuation `37243216939/1` are not 0.1.6 proof. Their exact fourteen UI checks and nine installed compiled-file checks remain unchanged. The completed 0.1.5 publication, immutable package/tag/accepted bytes and its own terminal completion evidence also remain historical; do not republish it or relabel its receipt as 0.1.6 acceptance. New proof requirements are version-gated, never retroactively applied to either completed identity.

The mandatory sequence is **fresh CI pack → independent frozen-byte Docker acceptance → verified OIDC npm/GitHub publication and terminal completion → authorized official-carrier Desktop rollout**. No global/system DSH, Desktop configuration, account/provider, credential, or real-session writes may occur before terminal verified publication. Local readiness alone does not authorize publication or migration.

## Preflight

Run these checks from the exact source selected for review; they are readiness evidence, not publication steps. Confirm pinned DSH 0.2.0-rc.2 package/CLI identity, seven exact public exports, both metadata locale resources, peer/client exports, license parity and the exact packed file set. Recheck scoped npm authority and absence of the new version/tag before authorized publication; a registry lookup cannot reserve ownership. Do not change root ocmm/LSP versions or regenerate the unrelated Codex adapter.

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

The root typecheck, test and build must pass before committing. Build before generating static role assets, then verify generation is idempotent and the committed assets match. Inspect the preview for client/profile assets and exported `locale/en.json` / `locale/zh.json` with `{meta: {title: "Deepwork", description: <localized nonempty text>}}`; exclude secrets, test homes, tests, plans, sourcemaps and nested tarballs. Prove native `readPluginMeta` consumes the installed resources and all twelve DW display labels preserve IDs, mode, access and tool restrictions.

Use pnpm for actual install/build/test/**pack/publish**. The `npm pack --dry-run --json` above is only the existing read-only, size-rich metadata diagnostic, not release packaging. Do not blindly substitute pnpm's differently shaped preview JSON or fabricate missing size fields. Source-checkout Docker runs are development evidence; final acceptance must use the CI-frozen artifact and expected SHA256 without building or repacking. A checker or successful install is not runtime, UI, publication or Desktop proof.

For 0.1.6, clean Linux install/build verification must exercise the reviewed pnpm `allowBuilds` policy for exactly `esbuild@0.25.12` and `koffi@3.1.1`, with `strictDepBuilds: true`. A cached native binary or pre-existing `lib` tree cannot establish that the ignored-script failure is repaired. This is distinct from the deliberately script-free metadata dry-run above; do not weaken that diagnostic's lifecycle-script protection or approve all dependency scripts.

## Phase 1: frozen artifact and independent Docker gate

Use the dedicated `.github/workflows/dsmm-release.yml` **future tag path** for the authorized `dsmm-scoped-v0.1.6` push, not the old bootstrap dispatch. Tag/version, peeled source commit, control commit and event identity must agree. CI uses pinned Node 24 / pnpm 11.9.0, checks/builds the exact source, verifies generated assets, and packs **one new actual tarball** with pnpm. Inspect `dsmm-dsmm-0.1.6.tgz`, record its actual size/SHA256/SHA1/SHA512 integrity, and freeze it. Never reuse the old 0.1.2 hash/receipt/artifact or any completed successor's bytes.

Run the full independent Docker runner with that **explicit artifact path and expected SHA256**, required compiled-UI hook and trusted support files. It must fail closed if required inputs are missing/mismatched and must not build, repack, or silently choose another tarball. The new completed receipt's `packedSha256` must match the fresh frozen file and its run/attempt/source identity. Only these accepted unchanged bytes may proceed to publish.

Use a fresh image/process/home and exact pinned DSH, installing the packed package rather than importing checkout code. Do not mount or copy Desktop/global configuration, sessions, credentials, account records, browser storage or user authentication. A deterministic test-owned no-auth model fixture may drive actual runtime operations; paid chat and schema inventories alone cannot replace these scenarios:

- Native metadata reader yields Deepwork from both packaged locales; all twelve DW display names and unchanged technical IDs are correct; settled healthy root audit includes enabled DW Orchestrator/Builder/Planner only, disabled Builder absent, auxiliary roles excluded; actual blank-session Agent preset selection.
- Actual enabled auxiliary delegation and native read-only denials, with exact role route/effort and aliased-parent `llm.resolveCallConfig` preflight against the fixture catalog.
- Same packaged compiled Deepwork Profiles UI through native client/slots and supported in-process operator/Gateway RPC into real profile storage: create/read/edit/save/apply/reset, explicit deployment-only validation errors, revision conflict, pointer failure, and exact draft/immutable-revision/pointer bytes.
- Save without activation; new-Agent-only apply; existing even-blank Agent retention; inherited child/recovery settings; fresh-process pinned current selection despite a subsequently edited draft; truthful cold-resume/removed auxiliary-root limitations.
- Existing native web/headless, session-persistence/history compatibility, LSP, sentinel and cleanup scenarios remain required; naming checks do not replace these runtime contracts.

Successor acceptance additionally requires the compiled structured editor's native catalog round-trip, comment/unrelated-setting preservation, ordered fallback controls, unlisted native-resolvable routes, and invalid raw retention. Exercise real current-session UI apply, two independent roots, sidecar CAS and fresh epochs, busy/maintenance/child refusal, old/new child isolation and same-revision reapply. Cold-resume the exact pinned sidecar after changing the global default, then compare stock native visible history and request headers. Place an owned regular profile lock **before** a second real native Loader starts; prove visible refusal and unchanged pointer/lock ownership, with a truthful observed root-roster disposition.

Actual native `followup/whenIdle` requests must prove primary/first-available startup locks, finite same-route rate-limit exhaustion, threshold-ordered rollover, same-profile/different-role and different-profile isolation, first-request unavailable versus partial/later refusal, and both strategies' partial-text/tool-fragment no-retry fences. Bind each real provider call to its native request header, live attempt ID, matching durable stream and settlement; successful outputs and terminal outcomes must agree. A competing native always-retry handler must remain unused and tools must not replay. The added native model-selection scenario must invoke strict public `session/selectModel`, demonstrate a route different from the Orchestrator profile primary, exact effort-only changes and subsequent-request retention, and validate the final native headers rather than an acknowledgement alone.

For 0.1.6, ordinary roots are native-owned: their initial provider/model/exact effort remain authoritative even before any explicit model-selection event. Profile-role primary and fallback chains apply to genuinely owned delegated children, not silently to the root. Prove this with actual native request headers before and after explicit model/effort changes, profile reapply and cold resume; retain supported explicit child overrides and native read-only permissions. Startup failure evidence must identify the failed `installProfiles` child through its public parent-fiber ownership of the actual Loader entry, preserve the native failure exit, and observe absent runtime/zero request preparations/tools; never fabricate an outer Loader failure or accept a foreign failed fiber.

Exercise the compact current-session header profile selector with a real native Session. Normal profile switching keeps the current model and native model default unchanged. The distinct explicit “Switch and use profile model” action calls native `session/selectModel` after profile commit and has the same native-default persistence consequence as the Models tab. Missing profile primary, unconfirmed model changes or a newer native choice must produce truthful feedback without undoing a committed profile or silently overriding the newer choice. Global-default Apply and draft Save retain their separate scopes. Owned component/endpoint proof does not establish authenticated Desktop or production model-picker interaction; retain explicit nonclaims for any unexercised surface.

Bind the hook and all three support files explicitly: `profile-ui-harness-server.mjs`, `profile-ui-harness-browser.mjs`, and `profile-ui-harness-native.mjs`. The successor receipt's exact check and installed compiled-file inventories are version-gated; historical receipt grammars are not expanded. CI source/pack/publish/installed verification uses Node 24 / pnpm 11.9.0; the independent borrowed Docker runtime uses its recorded Node 22 / pnpm 12.8.1 environment. These are distinct evidence surfaces, not interchangeable build claims.

The native component/RPC/storage test uses a supported composition-owned in-process carrier, not an anonymous production route or copied login. It is distinct from authenticated Desktop activation. Preserve sanitized scenario evidence and inspect the full intended diff before parent-owned authorized release operations. If any required scenario fails or the frozen bytes change, stop before publication/global migration.

## Phase 2: authorized immutable publication

Publication requires explicit authorization for the new identity. Recheck `@dsmm/dsmm@0.1.6` and `dsmm-scoped-v0.1.6` are absent. Confirm the one-time npm Trusted Publisher registration for repository `hugefiver/ocmm`, workflow filename `dsmm-release.yml`, with direct publish allowed. If supported setup/MFA is still missing, request that step; do not add a static token fallback or recurring manual release gate. The main ocmm workflow/checker does not cover DSMM: its dedicated workflow and DSMM terminal checker do.

The earlier unscoped `dsmm-v0.1.0` GitHub release, scoped 0.1.0 release and scoped 0.1.1 release stay intact. A new-release authorization covers ordinary commit/push/tag/npm/GitHub actions for 0.1.6 only, not rewriting prior publications, the old 0.1.2 draft, app upgrades, global package-manager changes or authentication workarounds. The separately authorized official-carrier DSMM upgrade still waits for terminal completion of this exact new identity.

The future publish job revalidates the accepted run/attempt-bound bytes and publishes **that exact tarball with native pnpm**, public npmjs access, lifecycle scripts ignored, OIDC and genuine provenance enabled. Do not forge GitHub identity variables, use the old bootstrap's `provenance=false`, or repack after acceptance. Preserve non-canceling package-wide publication concurrency and least-permission separated jobs. Registry byte/integrity and fresh installed-package verification precede non-overwriting public GitHub finalization with the same tarball and `SHA256SUMS.txt`.

Treat both identities as immutable: never overwrite an npm version and never move, delete, or recreate an immutable tag. Readiness documentation and a local tarball do not authorize a publish.

### Publication identity verification

Verify the tag's peeled commit, exact npm name/version and `dist.integrity`, genuine provenance, downloaded registry archive bytes, GitHub asset bytes and checksum list against the frozen artifact. Use a fresh isolated `DSH_HOME` for exact registry installation. Check all seven exports, including both metadata JSON resources, resolve and match bytes from the **installed registry package**, never the checkout. Native `readPluginMeta` must yield Deepwork; JSON resources are metadata, not executable code. The Loader row remains `id: dsmm`. Initialize a fresh headless deployment profile first; `/deepwork` and `/dsmm-status` are not headless task text.

After the matching workflow terminates, run `scripts/check-dsmm-release-completion.mjs` for its exact run ID, attempt and control SHA. It must bind source/Docker proof, tag/commit, frozen bytes, registry/provenance/install evidence, GitHub assets/checksums and every required job. The future path has `import-bootstrap` **skipped / NOT_APPLICABLE**, `bootstrapImport: null` and no bootstrap import artifact; this is not missing evidence. Only terminal outcome `COMPLETED` authorizes later rollout. Workflow success alone is insufficient. Preserve any partial or ambiguous publication; do not overwrite assets, move/delete/recreate the tag, implicitly retry uploads or repair in place.

```powershell
$env:DSH_HOME = "<fresh-task-owned-verification-home>"
dsh --profile dsmm-0.1.6-verify --from-default-profile headless --dump-config
dsh plugin --profile dsmm-0.1.6-verify add @dsmm/dsmm@0.1.6
dsh plugin --profile dsmm-0.1.6-verify list
dsh --profile dsmm-0.1.6-verify --dump-config
npm view @dsmm/dsmm@0.1.6 dist.integrity --registry "https://registry.npmjs.org/"
```

### Published 0.1.6 continuation (separately authorized)

The original `dsmm-scoped-v0.1.6` publication run `37281521750/1` published the immutable npm bytes but failed its verify job; its GitHub Release job was skipped. Preserve that failed history, original source/tag at `d2e499b3a61ef76033d417efbec3402a4739a8fe`, and original npm provenance. Supplemental verification does not rerun that workflow or republish npm.

Only the dedicated no-input `.github/workflows/dsmm-published-continuation-016.yml` may continue this separately authorized identity. Its fixed `--origin-version 0.1.6` policy binds accepted artifact `11332299033`, archive size `359262`, archive digest `sha256:3fedc92c35a88f0a75fdfc6ac8ef9a37ef138d902e5698f90ac969f66f6f4eb9`, and tarball SHA256 `b7b36fc69e892fb22b06a2428d360181d33bd95526ee2bc403c04b6307ed6c35`. The two jobs independently reload original acceptance and verify current registry bytes/provenance plus a fresh isolated Linux/Node 24 native install, then create/finalize only the missing original-byte GitHub Release. Any existing public Release or partial draft stops without adoption, repair, overwrite or deletion. No source pack/build, npm publisher/OIDC, tag mutation, full-workflow rerun or global install belongs to this continuation.

After the dedicated run terminates, use its actual run/attempt/control SHA and a new receipt path:

```powershell
node scripts/check-dsmm-release-completion.mjs terminal-continuation --origin-version 0.1.6 --run-id <actual-continuation-run> --run-attempt <actual-attempt> --control-sha <trusted-continuation-control-sha> --receipt <new-016-continuation-receipt.json>
```

Only exit `0` with `COMPLETED` establishes the two-run terminal proof and permits the separately authorized rollout below. A green supplemental run alone is insufficient; `FAILED`/`UNRESOLVED` preserve immutable partial state. The omitted-selector APIs/CLI and old continuation workflow remain fixed to historical 0.1.4; neither that receipt nor its archive/provenance can establish 0.1.6 completion.

## Phase 3: official installed-carrier Desktop rollout

Only after terminal 0.1.6 completion may authorized global migration begin. First perform the separately bounded isolated real-model/tool check against the exact registry package. Coordinate a fully quit Desktop, recheck concurrent edits, and preserve a recoverable local snapshot of only task-changed package-manager/DSMM-owned files—not the entire credential or session store. Use the exact installed official Desktop carrier to install `@dsmm/dsmm@0.1.6`. It may manage packages while the app is quit; it may **not** boot/dump the reserved Desktop profile. Never substitute standalone npm DSH, a renamed/copied profile, checkout imports, `app.asar` patches, global PATH/pnpm changes, or auth bypasses.

Preserve base/web bundles, deployment roles/skills, all configured policies, disabled Builder, active mode, provider/model catalog, account state and UI preferences. Saving supported baseline settings as a runtime draft is explicit and reversible; it does not change structural configuration. Disclose committed-sidecar versus absent-sidecar cold resume and the unknown removed auxiliary-root ID limitation in [compatibility](compatibility.md) before rollout. Do not silently substitute personas or delete history.

Any old unmarked-log repair remains a separately authorized exact private target, native-lease-held, same-directory backup-first, metadata-only operation with concurrency checks and actual installed-reader parity. The naming release does not itself authorize session edits, and an old observed digest is not permission to overwrite newer history.

After a supported restart, verify actual Desktop package 0.1.6 activation, native Deepwork metadata, healthy selectable DW root names, retained auxiliary delegation/read-only denial, and actual Deepwork Profiles UI create/edit/save/apply/reset with independent file/pointer bytes. Verify live even-blank Agents remain unchanged on global Apply and current pinned selection persists across restart. Check the compact header selector and explicit model/effort authority, including normal profile switching versus explicit switch-and-use-model. Check unrelated deployment/provider/account/UI state remained intact. If authenticated native Desktop behavior cannot be observed, report that pending boundary; disk files, native metadata reads, headless tests and Docker component proof alone are insufficient for complete integration.

## Rollback

Runtime rollback resets to the deployment baseline or explicitly reapplies a reviewed prior configuration with concurrency/revision checks. Never mutate immutable files or restore drafts over later user edits. Existing live Agents retain their snapshots.

For package rollback, use the official carrier to remove `@dsmm/dsmm`, add an exact known immutable version and restart through the supported path. Keep runtime drafts/revisions and unrelated settings. An old unscoped bundle must not coexist with the scoped bundle using the same `id: dsmm`. Desktop requires the installed carrier with the app fully quit; boot/dump remains unsupported. Do not restore credential files, sign out, delete sessions, remove old releases or perform broad recursive cleanup. Remove only exact task-owned temporary material when safe and retain release/recovery evidence.

Never overwrite an npm version or rewrite a tag to repair a publication. Preserve the immutable evidence and select a new, authorized version instead.
