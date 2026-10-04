# DSMM scoped first release: @dsmm/dsmm 0.1.0

## Approved outcome and boundaries

User: “先清理掉这些 用 @dsmm/dsmm 发布”. Publish the first public npm version `@dsmm/dsmm@0.1.0`, replace the superseded unscoped installation in the existing system Desktop profile, and remove obsolete active package references without losing profile settings or credentials. This is a package-identity migration, not a runtime feature release. Preserve the earlier requested 0.1.0 starting version, native DSH 0.2.0-rc.2 compatibility, existing Flash calibration, read-only role boundaries, presets, commands, and settings.

The prior GitHub tag/release `dsmm-v0.1.0` at `f7d5b2e8bb058c25c81cc2924c96daa8bf676e12` is already published and immutable. The unscoped npm publication was rejected, not completed. Use a distinct new tag, recommended `dsmm-scoped-v0.1.0`, for the changed package identity. Never move/delete/recreate the prior tag or overwrite its assets. Do not publish root ocmm or LSP, add an unrelated CI lane, resume npm Support correspondence, or implement per-role model/fallback features in this task.

Interpret cleanup narrowly: remove the old active `dsmm` dependency/bundle only as part of a verified replacement; preserve old release evidence, existing backups, unrelated working-tree files and profiles. Vague “这些” does not identify old releases, logs, the support draft, running app, or the `output_test` tree for deletion. Report retained material; obtain an exact destructive target if the user wants more removed. In particular, `output_test/dsmm-dsh-20261003/isolated-root-build/node_modules` is a junction to the real repository node_modules and must not be traversed for deletion. Do not route around earlier tool-policy cleanup denials.

Execution update from the orchestrator: only the known unsubmitted support draft has now been removed via apply_patch. The old test runtime, task-local Python and isolated root build remain needed by verification and must stay until that work completes. The proposed `dsmm-scoped-v0.1.0` tag has been checked absent.

## Current evidence and identity seams

Parent preflight establishes npm account `hugefiver`, `npm org ls dsmm` lists that account as owner, and lookup of `@dsmm/dsmm` returns E404. Recheck immediately before publication; these observations are not a reservation or publish permission proof. The authenticated maintainer bootstrap is the existing DSMM release route; Trusted Publishing is not configured evidence and the root completion checker has no DSMM lane.

Read-only discovery found:

| Surface | Required distinction/change |
| --- | --- |
| `dsmm/package.json` | Change npm `name` from `dsmm` to `@dsmm/dsmm`; keep version 0.1.0 and public registry/access, exports, peer pins, license and packaged surface. |
| `dsmm/cordis.patch.yml` | Loader `name` becomes `@dsmm/dsmm`; stable row `id: dsmm` remains unchanged so existing settings patches still apply. |
| `dsmm/src/roles.ts` | Renderer uses resolvable `@dsmm/dsmm/preset-skills` import instead of `dsmm/preset-skills`. Regenerate all twelve `agent-presets/*/agent.cordis.yml` through the generator. |
| Internal plugin names | `src/index.ts` exports `name = "dsmm"`; `src/preset-skills.ts` exports `name = "dsmm/preset-skills"`. These are runtime Cordis labels, not package lookup strings; retain unless actual host evidence proves the label must change. Keep settings namespace/provider/role IDs/tool names/managed markers stable. |
| `scripts/check-release-readiness.mjs` | Manifest expected name and dry-run pack receipt name currently require `dsmm`; require exact scoped name instead, with existing fail-closed file/license checks intact. |
| `scripts/docker-smoke.mjs` | Update dependency key, profile bundle name, list token matching, remove argument, root/subpath `resolve`, installed-manifest identity, and dumped loader name. Keep stable `id: dsmm`, sentinel checks, remove/reinstall ordering and all domain coverage. |
| Packed filename | npm convention for scoped package is `dsmm-dsmm-0.1.0.tgz`; use actual pack receipt filename, validate exact name/version rather than inferring identity from a permissive `dsmm-*.tgz` regex. |
| Live smoke | `scripts/live-dsh-smoke.mjs` accepts the artifact path and intentionally patches stable `id: dsmm`. Add/check installed scoped package identity where needed without renaming tools/probe markers or model routes. |
| Tests | `test/package.test.ts`, `release-readiness.test.ts`, `docker-smoke-assets.test.ts`, `roles.test.ts`, `agent-presets.test.ts`, `preset-materializer.test.ts` have identity/import/command assertions. `role-subagents.test.ts` includes a startedBundles fixture. Preserve tests asserting runtime names/settings/provider/commands. |
| Active documentation | README registry install/build/filter/packed filename; `docs/releasing.md` bootstrap/tag/verify/rollback; `docs/design.md` manifest example; any current install examples found by bounded search. Historical implementation plans and verification receipts describe actual old identities and are not bulk rewritten. |
| Workspace/lock | `pnpm-workspace.yaml` directory `dsmm` and `pnpm-lock.yaml` importer `dsmm` are paths, not npm names. Keep paths; regenerate lock only if package-manager output requires it. Prefer `pnpm --dir dsmm ...` or explicit scoped filters in active instructions. |
| Desktop | `C:/Users/hugefiver/.dsh/profiles/desktop/package.json` currently has `dsmm` dependency pointing to the old GitHub tarball and `dsmm` bundle alongside base/web-app. Existing patch includes `id: dsmm`, UI/account/model settings and a disabled builder role. Preserve their values. |

Working tree at discovery contains existing untracked system-configuration plan and `output_test/`; this plan adds only its own markdown file. Neither should be incidentally removed/staged. `dsmm/lib` is generated and tracked; regenerate with tsc, never edit by hand.

## Wave 1 — Cohesive scoped artifact and loader migration

Change only package identity and dependent lookup paths, tests and current documentation. Do not perform a global replacement of `dsmm`. Update release guide to distinguish the preserved old GitHub-only release from the new scoped publication and require a new immutable tag, same reviewed artifact on npm/GitHub, and exact registry-installed validation. Keep authorization and failure semantics explicit.

Build TypeScript, run `node dsmm/scripts/generate-role-assets.mjs`, and confirm regeneration produces only intended scoped preset imports. Use deterministic assertions for the regression-prone boundaries: exact manifest name/version, patched loader name with stable ID, scoped subpath in generated presets, rejection of old unscoped identity by readiness checks, and no duplicated bundle identity. Maintain the existing security tests rather than replacing them with text-only presence checks.

Useful evidence: scoped readiness receipt passes; pack includes correct metadata/exports and complete allowed files with no source secrets/test artifacts; old unscoped fixture fails closed; preset generation matches source; runtime label/settings assertions remain green. Do not weaken the checker to accept both names merely to make tests pass.

## Wave 2 — Verify install surfaces before public mutation

Run package typecheck, test-typecheck, full tests, build and readiness with explicit package selection. Run the existing complete Docker smoke using pinned DSH and pnpm 12.8.1: install packed scoped artifact, list, dump, scoped root/subpath resolution from isolated profile rather than repository, native domains, remove, disappearance of dependency/bundle and `id: dsmm`, reinstall, and unchanged unrelated config sentinels. DSH supports many existing scoped native bundles, but that is not proof this renamed package resolves correctly.

Run real native account Flash smoke against the reviewed scoped artifact, including a read-only reviewer child, to prove package composition and prompts survived the renamed import route. Schedule this paid model test after Wave 3 freezes the final tarball from the committed checkout and before publishing it; no candidate tarball receipt may substitute for the final artifact. Preserve native route `deepseek-account/deepseek-flash`, actual effort evidence, successful tools/results, unchanged source credentials and temporary-home cleanup. Use sanitized receipts only. Never claim prior unscoped live evidence proves the changed scoped artifact.

Root AGENTS requires `pnpm run typecheck`, `pnpm test`, and `pnpm run build` before committing. Retain existing task-local Python setup if needed for root tests. If pre-existing locked LSP binaries block staging, do not terminate user processes: use the established isolated-copy build approach with identical selected inputs and record precisely that distinction, or obtain a user-coordinated close. Do not label a failed original-directory build successful.

The parent has confirmed pre-existing PIDs 24680 and 36780 are still live and the original dist executable differs from target/release, so this run must keep full root build staging isolated. Do not kill those processes or rename their binary. The existing isolated copy has unchanged root build inputs and a node_modules junction but no DSMM copy: use it only as root-build evidence, with DSMM build/tests verified separately against the current scoped source.

Before commit, inspect full diff and generated inventory, stage only this migration's intended files, and exclude `output_test`, credentials, unrelated plan changes and app state. Publication authorization covers ordinary scoped-release commit/push/tag operations; no separate planning commit is required. Hashes are used for release artifact integrity, not planning ceremony.

## Wave 3 — Immutable scoped publication and evidence

From the exact tested committed checkout, recheck scoped name/version absence, owner/account and the proposed new remote tag absence. If the package/version or tag exists unexpectedly, inspect ownership/identity and stop rather than overwrite or assume success. Pack once into a dedicated owned artifact location, inspect the receipt and archive manifest, calculate SHA256 and npm-compatible integrity, and freeze this artifact. It must contain `@dsmm/dsmm@0.1.0` and resolve scoped imports. Run the real Flash delegate smoke on this frozen file and assert its successful receipt's `packedSha256` equals the frozen tarball SHA256. Rehash the file immediately before publication; mismatch or failed smoke stops publication. Publish/upload this exact file, without repacking or editing it after the smoke.

Use the existing authenticated npm bootstrap to publish that tarball with `--access public --registry=https://registry.npmjs.org/`; no fake OIDC/provenance claims. Preserve the publish process for any requested browser confirmation, send the actual fresh URL as plain text, and verify terminal result plus registry metadata instead of equating a web acknowledgement with success. Do not repeat package-name support attempts.

Publish the new immutable tag/release `dsmm-scoped-v0.1.0` for the exact tested commit and attach the identical scoped tarball plus `SHA256SUMS.txt`; never attach replacements to `dsmm-v0.1.0`. The precise npm/tag/GitHub ordering may follow practical authentication constraints, but every partial public state must be recorded. After any surface becomes public, no in-place artifact/tag repair: report discrepancy and ask for a separately authorized new version or other precise recovery action.

Completion evidence binds new tag and peeled commit; scoped package/version and dist integrity; reviewed artifact SHA256; downloaded GitHub tarball/checksum bytes; registry-downloaded tarball identity and integrity; and fresh isolated exact registry install resolving both exported modules and composing stable `id: dsmm`. Root ocmm completion checker and a successful command/CI conclusion alone cannot certify this DSMM release. No DSMM workflow changes are needed for the maintainer bootstrap.

## Wave 4 — Replace active Desktop package and bounded cleanup

After registry verification succeeds, make a fresh recoverable snapshot of Desktop manifest, lock and patch before mutations; preserve existing backups and account credentials. Confirm live app use before restart/termination: PID 32104 was initially task-started but may now be user-used, so do not forcibly close it based only on stale ownership. Offline installation/config verification may proceed if host lifecycle supports it; clearly separate disk configuration from observed running Desktop activation.

Use the actual supported desktop carrier `C:/Users/hugefiver/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd` after the app is fully quit, to remove the old unscoped package and add exact `@dsmm/dsmm@0.1.0`, avoiding a concurrently composed duplicate `id: dsmm`. The ordinary standalone CLI cannot manage Desktop. Retain base/web-app bundles and existing patch bytes/settings. If removal/add fails, restore the backed-up profile via supported installation of the exact old artifact; do not blindly overwrite a profile the running app/user has changed. Package-manager exit status must complete, not merely print Done.

Verify package manifest has exactly one scoped dependency/bundle and no old active dependency, installed package name/version and resolved subpath are scoped, and disk config/schema parsing retain existing DSMM settings and UI/account/default-model values without rewriting credentials. Desktop boot/config dump is still prohibited even through its supported carrier; do not use it as a Desktop verification command. No repository/tarball-source fallback may mask a failed registry install. Existing stable patch ID should require no settings rewrite. Verify a fresh process loads; Desktop live activation is complete only after a safe restart and authenticated native inventory observation, otherwise report restart pending honestly. A process/listener alone is not loaded-plugin proof.

Remove only this run's explicitly owned temporary publish/install files and processes when safe and policy-permitted, with exact resolved targets; keep release receipts and rollback backups. Do not remove old immutable releases, historical evidence, broad temp roots or the earlier junction tree. A follow-up exact-target question is only needed for additional cleanup, not to reauthorize scoped publication.

## Handoff and acceptance

Orchestrator owns blocker-focused plan criticism, execution, review and final publication acceptance. Executors may use equivalent bounded steps when they preserve all identities, permissions, isolation and evidence requirements; record consequential deviations. No arbitrary model/provider changes or new public APIs are part of this release.

Final report should distinguish: published scoped package/version and plain URLs; new tag/commit and integrity evidence; Desktop replacement/activation status; old release retained; temporary artifacts actually removed versus retained; and remaining per-role model/fallback configuration from the prior task, which this identity migration does not pretend to solve.

## Implementation preflight evidence

The implemented scoped identity change passed source/test typecheck, build and all 278 DSMM tests. Readiness reports @dsmm/dsmm 0.1.0, 125 files and zero forbidden surfaces. Complete Docker verification passed twice; the final run includes the added post-remove config dump proving id: dsmm disappears, then reinstall/root+subpath resolution, native contracts, MCP diagnostics/format and unchanged unrelated config sentinels. Owned images/containers were removed by the runner.

Root typecheck, TypeScript 1406/1406 and Rust 28/28 + 21/21 passed on this run. Full build passed in the existing isolated root copy with unchanged root build inputs; original locked dist staging was not claimed to pass or modified. Independent implementation review found no blocking loader/identity defect; its post-remove evidence gap was closed and the affected suite/Docker checks passed. Final frozen-artifact Flash, npm/GitHub publication and Desktop replacement are still release-stage work, not claimed complete here.
