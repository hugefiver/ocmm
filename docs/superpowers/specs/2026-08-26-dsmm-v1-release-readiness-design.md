# DSMM v1.0 Release Readiness Design

**Status:** Approved by full-session user delegation (`你自主继续`) and an
unambiguous self-review

**Roadmap target:** DSMM v1.0 — Stable dsmm release

**Baseline:** `cedd30b1abd03cf00b9ce330fa3b1805d76cb401` plus the reviewed,
uncommitted v0.6 model-routing, v0.7 runtime-recovery, and v0.8 settings/status
working tree

## Goal

Prepare DSMM as a stable `1.0.0` npm package with a documented DSH compatibility
contract, a truthful migration guide from ocmm, reproducible fresh-profile install
and uninstall evidence, and an executable release/rollback checklist.

This implementation produces a release-ready artifact but does not publish it.
Commit, tag, push, npm publication, GitHub Release creation, and registry mutation
remain separate actions requiring explicit authorization.

The completed working tree must let a release operator:

- pack a public `dsmm@1.0.0` artifact whose payload contains only supported
  runtime files, declarations, documentation, bundle assets, and the full license;
- install the packed artifact into a new isolated DSH profile without enabling
  DSMM globally or changing a sibling profile;
- activate deepwork through the registered host command and inspect the installed
  bundle through `dsh --profile <name> --dump-config`;
- understand the exact supported DSH/Node/runtime matrix;
- migrate from ocmm without assuming unsupported parity;
- remove DSMM or reinstall a previously published version without overwriting an
  immutable npm version.

## Evidence and Constraints

### Repository evidence

- `dsmm/package.json` already exposes `lib/index.js`, declarations,
  `dsmm/preset-skills`, `cordis.patch.yml`, prompts, skills, patches, and user
  documentation, but it is still `private: true` and version `0.1.0`.
- `dsmm/scripts/docker-smoke.mjs` already packs the local package, installs the
  tarball into a temporary `DSH_HOME` profile, verifies `--dump-config`, resolves
  the installed package instead of the checkout, and executes the real DSH command,
  request, recovery, guard, preset, status, and LSP surfaces.
- The current package payload includes all of `lib`, including `.js.map` and
  `.d.ts.map`. The stable npm payload does not need maps and must exclude `src`.
- The package directory has no `LICENSE`, while the repository license requires
  every distributed package to include the complete license and identify it as
  `LicenseRef-AAAPL`.
- The root release workflow and release-completion checker support only `ocmm` and
  `ocmm-lsp`. Extending those release lanes is not necessary to make the DSMM
  package and checklist release-ready.
- The npm registry returned `404` for the unscoped name `dsmm` during discovery.
  This is evidence only for the current investigation; the release operator must
  recheck name ownership immediately before publication.

### Pinned DSH contract

The compatibility authority is `@deepseek-ai/dsh@0.1.1-rc.2` at commit
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

Documented profile commands are:

```text
dsh plugin --profile <name> add <package-or-tarball>
dsh plugin --profile <name> remove <package-name>
dsh plugin --profile <name> list
```

Profiles live under `$DSH_HOME/profiles/<name>`. Plugin add/remove updates only the
selected profile's dependency and bundle manifest. DSH may maintain its shared
`$DSH_HOME/profiles/node_modules` resolution fallback; this is not global bundle
activation. Bundle changes take effect in a new profile process.

A DSH bundle package must contain:

```json
{
  "name": "dsmm",
  "type": "module",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

The referenced patch must be shipped. A missing patch is a startup error rather
than an ignored optional feature.

The fixed headless bundle submits its argument as a user message; it does not
interpret `/deepwork` or `/dsmm-status` as host commands. Stable documentation
must not claim otherwise. Web/host command adapters may execute those commands;
headless users enable deepwork with profile settings such as
`dsmm.defaultActive: true` before running a task.

## Alternatives

### A. Complete release readiness without publication — selected

Prepare `dsmm@1.0.0`, constrain and verify the npm payload, add compatibility,
migration, release, and rollback documentation, and strengthen the packed-profile
Docker proof. Keep publication as an explicit later operation.

Benefits:

- completes every code and documentation prerequisite without mutating a registry;
- provides reproducible evidence independent of an unpublished package URL;
- avoids coupling DSMM's first stable artifact to the root ocmm release lane;
- preserves immutable-version and rollback discipline;
- leaves a small, explicit authorization boundary for commit/tag/publish.

### B. Add a third root release workflow lane

Deferred. A `dsmm-v*` CI lane and remote completion checker would be useful after
the first stable release contract is proven, but they would expand root release
identity, workflow jobs, Trusted Publishing setup, and receipt semantics. The
roadmap requires an npm-ready package and release checklist, not a new repository
release subsystem.

### C. Documentation-only stable declaration

Rejected. Leaving `private: true`, version `0.1.0`, unbounded package maps, and no
fresh-profile removal proof would not be npm-ready and would not satisfy the
roadmap acceptance criteria.

## Architecture

### 1. Stable package manifest and payload

Update `dsmm/package.json`:

- set `version` to `1.0.0`;
- remove `private: true`;
- add `author`, `license: "LicenseRef-AAAPL"`, `repository`, `homepage`, `bugs`,
  and stable DSMM/DSH/deepwork keywords;
- add `publishConfig.registry` for npmjs and `publishConfig.access: "public"`;
- preserve the existing main/types/exports/DSH bundle metadata;
- replace the broad `lib` files entry with JavaScript and declaration patterns so
  `.js.map` and `.d.ts.map` remain development artifacts but are absent from the
  npm tarball;
- ship `LICENSE`, compatibility, migration, and release documentation;
- add a read-only `check:release` script.

Create `dsmm/LICENSE` as an exact byte copy of the repository root `LICENSE`.
Tests must reject a missing, shortened, or divergent package license.

Create `dsmm/scripts/check-release-readiness.mjs`. It is a deterministic local
checker, not a publisher. It runs `npm pack --dry-run --json` against the DSMM
package and fails closed unless:

- exactly one package named `dsmm` at version `1.0.0` is reported;
- `private` is absent;
- `LICENSE`, `README.md`, `package.json`, `cordis.patch.yml`, required runtime
  JavaScript/declarations, user docs, prompts, skills, presets, and patches exist;
- no `src/`, test file, implementation plan, source map, declaration map, tarball,
  credential-like file, or repository-only Superpowers artifact is present;
- the packed package has the expected public exports and DSH bundle patch path.

The checker prints a concise JSON receipt containing package name/version, file
count, packed/unpacked sizes reported by npm, required-surface count, forbidden
surface count, and outcome. It must not create a tarball, publish, contact a
provider, or modify Git state.

### 2. Compatibility matrix

Create `dsmm/docs/compatibility.md` with explicit tested/support levels:

- Node.js `>=22` — required by package engines;
- DSH `0.1.1-rc.2` — pinned and Docker-verified;
- Cordis `^4.0.1` and the five DSH component peer ranges — install contract;
- Linux container — full packed-runtime verification;
- Windows/macOS — source/package tests only unless separately evidenced;
- Web — host command/status compatibility without a custom client panel;
- headless — file configuration and `--dump-config`; task execution requires a
  separately configured provider;
- TUI — no official rc.2 bundle, pure status API only;
- LSP/MCP — optional, disabled by default, external `ocmm-lsp` command required;
- runtime recovery — process-local and disabled by default;
- DeepSeek V4 Pro calibration — exact official route only.

The matrix must distinguish `verified`, `supported by contract`, `optional`, and
`unavailable`. It must not turn a peer range into a claim that untested future DSH
versions are compatible.

### 3. Migration guide from ocmm

Create `dsmm/docs/migration-from-ocmm.md`.

The guide begins with the hard boundary: DSMM is a DSH-native Cordis bundle, not
an OpenCode compatibility layer, and `.opencode/ocmm.jsonc` cannot be copied.

It includes a feature table with four states:

- equivalent core intent;
- redesigned for DSH;
- optional/manual;
- unavailable.

At minimum, the table covers deepwork gates, seven skills, eight presets, model
routing/calibration, safety guards, LSP/MCP, runtime fallback, idle continuation,
subagent interruption recovery, settings/status, prompt/cache hooks, OpenCode
commands/hooks, model categories and Oracle tiers, Codex marketplace, and release
surfaces.

The guide provides a migration sequence:

1. create an isolated `DSH_HOME` and profile;
2. install the pinned headless bundle and `dsmm@1.0.0` or the reviewed tarball;
3. configure provider/model through DSH, not DSMM;
4. set `dsmm.defaultActive: true` for headless deepwork tasks or use `/deepwork`
   through a host command adapter;
5. optionally materialize presets and separately add their discovery root;
6. optionally configure the LSP MCP patch;
7. use `/dsmm-status json` or `--dump-config` for inspection;
8. retain ocmm until required unavailable features have an explicit replacement.

No claim may describe the reviewed working tree as already published.

### 4. Stable install, release, and rollback guide

Create `dsmm/docs/releasing.md` with four sections:

1. **Preflight** — exact clean release checkout, version and npm-name ownership,
   DSH pin, license, typecheck/tests/build, release checker, packed Docker smoke,
   and artifact review.
2. **Authorized publication** — reserved tag convention `dsmm-v1.0.0`, npm Trusted
   Publishing prerequisites, immutable version rule, and explicit statement that
   current repository automation has no DSMM lane.
3. **Post-publication verification** — fresh isolated `DSH_HOME`, install from
   registry, list/dump config, start a newly configured profile, inspect status
   through an available host adapter, and record package integrity.
4. **Rollback** — stop using the affected profile, remove `dsmm`, add an exact
   known-good version, restart the profile process, or publish a new patch version.
   Never overwrite an npm version or move/delete/recreate an immutable tag after
   publication begins.

The checklist must label all Git, tag, registry, and GitHub actions as requiring
explicit authorization. A successful local checker or Docker run is not proof of
publication.

### 5. Fresh-profile packaged runtime proof

Extend `dsmm/scripts/docker-smoke.mjs` and its static contract test.

The outer Docker lifecycle remains unchanged: one unique run-owned image tag,
exact cleanup in `finally`, and preservation of pre-existing Docker state.

Inside the isolated container:

1. create a temporary `DSH_HOME` with a top-level sentinel config and an unrelated
   sibling profile sentinel;
2. pack DSMM to a temporary workspace;
3. install the tarball into a new `dsmm-v1-smoke` profile with `dsh plugin add`;
4. verify `plugin list`, profile `package.json`, profile bundle manifest,
   installed-package resolution, and `--dump-config` all identify DSMM from the
   profile installation rather than the checkout;
5. execute the existing real host `/deepwork` command proof and all current
   runtime markers;
6. run the release-readiness checker against the package source;
7. remove DSMM from that profile, verify it is absent from the dependency and
   bundle lists, and verify top-level and sibling-profile sentinels are byte-identical;
8. reinstall the same reviewed tarball and verify profile-local resolution again;
9. clean only run-owned home/workspace/image/container resources.

Add ordered markers before the final success marker:

```text
DSMM_V1_RELEASE_CHECK_OK
DSMM_V1_PROFILE_INSTALL_OK
DSMM_V1_PROFILE_REMOVE_OK
DSMM_V1_GLOBAL_CONFIG_UNCHANGED
```

The smoke must not publish to npm, use registry credentials, call a model provider,
or mutate the user's real `DSH_HOME`.

### 6. Roadmap and release-state semantics

After the package, documentation, checker, and smoke implementation tasks are
GREEN—but before authoritative generated output, full gates, canonical identity,
and final review—update v1.0 in `dsmm/docs/roadmap.md` with exactly one status
sentence:

```text
Status: release-ready as dsmm 1.0.0; publication is pending separate authorization.
```

Do not use `released`, `published`, or equivalent wording until registry and tag
surfaces have been separately authorized and proven. The roadmap sentence is part
of the identity-bound review artifact; changing it after review invalidates both
receipts.

## Data and Error Flow

The release checker reads npm's dry-run JSON and package files, validates exact
invariants, emits one receipt, and exits nonzero on any mismatch. It does not
repair the package.

The Docker smoke owns one temporary home and profile. Each external command is
checked immediately. Failure enters exact `finally` cleanup and preserves the
original failure plus cleanup failures through `AggregateError` where applicable.

Profile isolation is proved by byte comparison, not by assuming that a temporary
home is sufficient. Shared DSH dependency-resolution artifacts are allowed only
inside the run-owned temporary home.

Documentation treats registry publication and rollback as operator actions.
Neither tests nor smoke scripts infer authorization.

## Testing and Verification

### Package contract tests

Tests cover:

- version, public/private state, license and metadata;
- exact package-license parity with the repository license;
- constrained `files` patterns and required documents;
- release checker success and deliberate fixture failures;
- no maps, source, tests, Superpowers docs, or tarball in dry-run inventory;
- README links resolve to shipped files.

### Documentation contract tests

Tests lock:

- compatibility rows and evidence levels;
- migration feature classifications and hard incompatibilities;
- install/configuration examples that do not treat headless task text as a slash
  command adapter;
- release authorization, immutable version, post-publication proof, and rollback
  language.

### Runtime proof

The pinned Docker smoke proves packed install/list/dump/remove/reinstall,
profile/global isolation, deepwork command behavior, all prior runtime markers,
and zero provider stream/network calls.

### Final gates

For each complete source revision:

1. prove the current generated `dsmm/lib/**` is stale when source changes require
   regeneration;
2. run one authoritative `pnpm --filter dsmm build`;
3. run DSMM test typecheck and all DSMM tests;
4. run `pnpm --filter dsmm check:release`;
5. run npm pack dry-run inventory checks;
6. run the pinned Docker smoke once;
7. run `git diff --check`;
8. run root typecheck, tests, and build;
9. create one canonical working-tree identity packet;
10. obtain unconditional approval from one Oracle lane and the primary Reviewer
    lane for that same identity;
11. recompute the identity after each lane and reject stale receipts.

No final gate stages, commits, tags, pushes, publishes, installs host software, or
creates a release.

## File Plan

Create:

- `docs/superpowers/specs/2026-08-26-dsmm-v1-release-readiness-design.md`
- `dsmm/LICENSE`
- `dsmm/docs/compatibility.md`
- `dsmm/docs/migration-from-ocmm.md`
- `dsmm/docs/releasing.md`
- `dsmm/scripts/check-release-readiness.mjs`
- `dsmm/test/release-readiness.test.ts`

Modify:

- `dsmm/package.json`
- `dsmm/README.md`
- `dsmm/docs/roadmap.md`
- `dsmm/scripts/docker-smoke.mjs`
- `dsmm/test/package.test.ts`
- `dsmm/test/docker-smoke-assets.test.ts`
- generated `dsmm/lib/**` only at the final authoritative generation point if
  source files changed

No root release workflow, release-completion checker, schema, OpenCode runtime,
or provider/model behavior changes are part of this work.

## Non-Goals

- No npm, GitHub Packages, or GitHub Release publication.
- No commit, tag, push, branch rewrite, or release workflow dispatch.
- No new root `release.yml` lane or remote completion checker.
- No package-name reservation claim based only on the current registry `404`.
- No DSH upgrade beyond pinned rc.2.
- No automatic provider configuration or paid model call.
- No custom Web panel or TUI bundle.
- No claim of feature parity with ocmm.
- No deletion of development source maps solely to shape the npm payload.

## Self-Review

- Placeholder scan: no `TBD`, `TODO`, incomplete checkbox, or unspecified release
  authority remains.
- Consistency: package `1.0.0`, roadmap `release-ready`, and publication-pending
  language agree throughout.
- Scope: the design prepares one package and its evidence; it does not expand the
  root release subsystem.
- Ambiguity: actual registry/tag mutation is explicitly excluded, while all local
  stable-release prerequisites and acceptance evidence are included.
