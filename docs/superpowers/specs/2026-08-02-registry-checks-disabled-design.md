# Registry Completion Checks Disabled Design

**Date:** 2026-08-02
**Status:** Approved by explicit user direction plus unambiguous self-review

## Goal

Keep npmjs and GitHub Packages publication attempts in the release workflow, but remove both registries from post-release completion verification. The checker must never contact either registry and must not let registry visibility affect its outcome or exit code.

## Behavior

- Remote receipts retain the existing `npm` and `githubPackages` surface fields for schema compatibility.
- Both surfaces are set to `SKIPPED` with explicit `*_completion_check_disabled` codes before remote polling begins.
- The checker does not request npmjs or GitHub Packages metadata and does not populate registry package observations.
- This applies to both the main `vX.Y.Z` lane and the `ocmm-lsp-vA.B.C` lane. The LSP lane no longer proves the eight native npm packages after publication.
- Registry publish jobs remain in `.github/workflows/release.yml`. Their workflow/job conclusions remain covered by the existing jobs hard gate.
- Historical receipts, including `v0.6.9`, remain immutable and are not reinterpreted.

## Remaining Completion Authority

`COMPLETED` still requires all applicable non-registry surfaces to pass or be legitimately skipped:

- release tag, peeled commit, fixed workflow run, and fixed attempt identity;
- lane-correct workflow and job conclusions;
- GitHub Release identity;
- exact non-empty release asset inventory;
- downloaded asset size and SHA-256 verification;
- the non-draft pinned LSP Release for the main lane.

Any failure or unresolved result on these surfaces remains outcome- and exit-code-blocking. Immutable-tag and no-in-place-repair rules remain unchanged.

## Implementation

- `setLaneSkippedSurfaces()` becomes the single source of the disabled registry statuses.
- `checkReleaseCompletion()` stops calling npmjs and GitHub Packages observers.
- Registry observation implementation that becomes unreachable is removed; pinned LSP Release observation remains.
- Tests prove that both lanes complete without registry routes, no registry request is emitted even when credentials exist, and core release failures still fail closed.
- Operational documentation and the generated Codex publish skill describe the new authority boundary.

## Non-Goals

- Do not remove npmjs or GitHub Packages publish steps from CI.
- Do not weaken workflow/job, GitHub Release, asset, checksum, identity, or pinned-LSP checks.
- Do not rewrite `v0.6.9`, move its tag, rerun its publication, or change its historical receipt.
- Do not add a configuration flag or compatibility fallback for the removed registry checks.
