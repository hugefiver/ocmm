# DSMM v1 Review Remediation Design

## Goal

Close every product defect confirmed by the identity-bound comprehensive review of DSMM v1.0 release readiness and obtain current, matching release evidence without publishing or performing any Git write.

## Baseline

- Baseline HEAD: `cedd30b1abd03cf00b9ce330fa3b1805d76cb401`.
- Reviewed pre-remediation working-tree identity: `sha256:1e8ba331a1de558675112fd2c41cd4b5e1a1efe022f511ae33e232ea25b6f6fd`.
- Preserve all reviewed v0.6-v1.0 source, tests, documentation, package metadata, and generated output.
- No `add`, `commit`, `stash`, `reset`, `checkout`, `push`, `tag`, publication, dependency installation, or unrelated process termination is authorized.

## Remediation

### 1. Release test type narrowing

Replace the nullable regex-result assertion in `dsmm/test/release-readiness.test.ts` with explicit control-flow narrowing. Missing matches or named captures fail with a deterministic assertion before dereference. This changes test correctness only.

### 2. Model-routing fail-open warnings

Change `dsmm/src/model-routing.ts` so warning emission cannot throw into `agent/request`. Resolver errors and unusable capability metadata still preserve the exact downstream config. A rejection from `next()` remains outside DSMM containment and propagates unchanged. Add regressions for throwing child and root loggers.

### 3. Reserved status command name

Treat the fixed `dsmm-status` command as reserved during settings normalization. If base configuration or attached settings select that exact name for `modeName`, normalize it to the default `deepwork` command name before resource installation. Keep all other command names unchanged. Test direct `resolveConfig`, attached settings, and actual dual-command registration.

### 4. Exact release script policy

Require `manifest.scripts` to equal the approved release script map exactly before invoking `npm pack`. Reject added, removed, or changed entries deterministically. Add a fixture whose only defect is an extra lifecycle script and prove the lifecycle marker is not created and pack-derived receipt fields remain zero.

### 5. Docker primary-error preservation

Extract a small pure helper under `dsmm/scripts/` that combines an optional primary error with cleanup failures:

- primary only: rethrow the primary error unchanged;
- cleanup only: throw an `AggregateError` containing cleanup failures;
- both: throw an `AggregateError` whose first error and cause are the primary error, followed by cleanup failures;
- neither: return normally.

Use it in both outer image cleanup and inner temporary-directory cleanup. Unit-test all four cases and retain existing fail-closed cleanup behavior.

## Generated Output and Evidence

Tasks that modify source must use OS-temp compilation for RED/GREEN and must not update working-tree `dsmm/lib/**`. After all product corrections are integrated, run one authoritative `pnpm --filter dsmm build` for that complete source revision. Any later source correction invalidates generated output, gates, identity, and review receipts and restarts final generation.

Final gates for the current revision:

1. DSMM test-config typecheck and all DSMM tests.
2. `check:release` and independent `npm pack --dry-run --ignore-scripts` with no tarball residue.
3. Pinned DSH `0.1.1-rc.2` Docker packed-profile lifecycle and all runtime markers.
4. `git diff --check`, root typecheck, one prepared root test run, and root build.
5. Canonical working-tree identity dispatched unchanged to Oracle-high and Reviewer-high.

If root build still fails solely because a pre-existing process locks the staged Windows binary, do not terminate it. Preserve the failure and stop for user action; release readiness is not approved without a clean matching-artifact build receipt.

## Non-goals

- No general command-name framework or broad settings refactor.
- No changes to model routing policy, provider selection, or reasoning semantics.
- No relaxation of release checks or test thresholds.
- No root release workflow changes.
- No commit, tag, push, npm publication, or release declaration.
