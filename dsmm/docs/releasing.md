# DSMM release

Push a `dsmm-scoped-vX.Y.Z` tag to trigger `.github/workflows/dsmm-release.yml`.
The workflow sets the DSMM package version from the tag, builds DSMM, packs it once,
publishes that archive to npm, and attaches it to the matching GitHub Release.

## Build and publication

The workflow uses Node.js 24 and pnpm 11.9.0. It installs the locked dependencies,
materializes the declared frontend resources, builds DSMM and generates its role
assets. It does not build root OCMM, its native LSP binary or the Codex adapter.

The tag path does not invoke custom release contracts, version allowlists,
Docker acceptance, bootstrap imports, recovery selectors or receipt controllers.
The target runtime remains exactly DSH `0.2.1-rc.2`; publishing DSMM does not upgrade DSH.

npm publication uses GitHub Actions Trusted Publishing and provenance. Lifecycle
scripts are disabled for publication. GitHub Release receives the same packed
archive retained by the workflow. Published package versions and Release assets
are not overwritten.

## Completion

Inspect the workflow run for the exact tag. npm publication and GitHub Release
delivery are separate steps: success at npm does not prove GitHub delivery.
Report a failed or partial publication as such; do not move its tag or overwrite
published artifacts to repair it in place.

## Installation

Publication does not install the plugin. Desktop and CLI/TUI profiles have
independent carriers. Installation requires matching DSH `0.2.1-rc.2` and separate
authorization; it must preserve accounts, credentials, history and unrelated
configuration. Restarting active Desktop work requires authorization.
