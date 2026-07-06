# OCMM/LSP Versioned npm Packages Design

**Date:** 2026-07-06
**Status:** Approved design — pending implementation plan
**Author:** orchestrator

## Goal

Separate the `ocmm` plugin/package version from the native `ocmm-lsp` version, publish the LSP as per-platform npm optional dependencies, add npmjs.org CI publishing, and document which ocmm hooks are enabled by default and what they do.

## Background

The current repository treats version equality as a release convention: `package.json` is `ocmm`/plugin version, while `crates/ocmm-lsp/Cargo.toml` is the Rust LSP version exposed at runtime through `CARGO_PKG_VERSION`. TypeScript does not read `Cargo.toml`, and Rust does not read `package.json`; the coupling is mainly release scaffolding and documentation.

The current release workflow assumes a single version:

- Tags are `v*` and are checked against `package.json.version`.
- OpenCode/Codex release tarballs are named with `package.json.version`.
- The native job builds six LSP binaries: Linux GNU x64/arm64, Windows x64/arm64, and Darwin x64/arm64.
- `dist/bin` carries all native binaries, so the npm package is not platform-split.
- npmjs.org publishing does not exist yet; GitHub Release and optional GitHub Packages publishing exist.

The desired architecture is two version lines: `ocmm` ships plugin/runtime changes independently, and `ocmm-lsp` ships native server changes independently.

## Design Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Use separate tag namespaces: `vX.Y.Z` for the main package and `ocmm-lsp-vA.B.C` for the LSP | Avoids ambiguous generic tags and lets CI select the correct release path |
| 2 | Keep `package.json` as the canonical `ocmm` version and `crates/ocmm-lsp/Cargo.toml` as the canonical LSP version | Matches existing real ownership; removes only the release-time equality assumption |
| 3 | Publish eight non-scoped LSP platform packages as npm optional dependencies | User selected non-scoped names and required Linux musl x64/arm64 support |
| 4 | Main `ocmm` package pins all platform package optionalDependencies to the supported LSP version | Installing `ocmm` automatically installs the matching current-platform LSP package by npm platform filtering |
| 5 | LSP-only releases publish only platform packages and native assets; they do not republish `ocmm` | Preserves independent LSP version updates |
| 6 | `ocmm` releases publish the main package and generated OpenCode/Codex assets; they may reference an existing LSP version but do not rebuild LSP unless explicitly needed for release assets | Keeps main plugin releases focused and avoids accidental LSP version drift |
| 7 | The JS wrapper resolves platform package first, then bundled `dist/bin`, then emits actionable diagnostics | Supports npm installs, development builds, GitHub Release tarballs, and Codex bundle fallback |
| 8 | Document hook defaults without changing hook behavior | User asked to view defaults/effects; no hook default behavior change was requested |

## Package Architecture

### Main package

`package.json` remains:

- `name`: `ocmm`
- `version`: the `ocmm` plugin/runtime version
- `bin.ocmm-lsp`: JS wrapper entrypoint, not the native binary itself

It gains `optionalDependencies` for the eight platform packages, all pinned to the currently supported LSP version in published package metadata. In the source checkout, the dependencies may use pnpm `workspace:` protocol against checked-in platform package manifests so `pnpm install --frozen-lockfile` can bootstrap before the packages exist on npmjs.org. Release packaging must normalize these entries to exact `A.B.C` versions before publishing or creating GitHub Release install tarballs.

```json
{
  "optionalDependencies": {
    "ocmm-lsp-linux-x64-gnu": "A.B.C",
    "ocmm-lsp-linux-arm64-gnu": "A.B.C",
    "ocmm-lsp-linux-x64-musl": "A.B.C",
    "ocmm-lsp-linux-arm64-musl": "A.B.C",
    "ocmm-lsp-darwin-x64": "A.B.C",
    "ocmm-lsp-darwin-arm64": "A.B.C",
    "ocmm-lsp-win32-x64": "A.B.C",
    "ocmm-lsp-win32-arm64": "A.B.C"
  }
}
```

`A.B.C` is the LSP package version, sourced from `crates/ocmm-lsp/Cargo.toml` when generating package metadata. It does not need to equal `package.json.version`.

### Platform packages

Each platform package contains exactly one native binary plus minimal package metadata. The repository should keep package manifests under `packages/<package-name>/package.json` so local installs and lockfile generation do not depend on already-published npm packages. Release staging copies the matching native binary into `packages/<package-name>/bin/<binary-name>` before packing/publishing, and generated binaries are not committed. Package names and target mappings:

| npm package | npm constraints | Rust target | Binary filename |
|---|---|---|---|
| `ocmm-lsp-linux-x64-gnu` | `os: ["linux"]`, `cpu: ["x64"]`, `libc: ["glibc"]` | `x86_64-unknown-linux-gnu` | `ocmm-lsp-x86_64-unknown-linux-gnu` |
| `ocmm-lsp-linux-arm64-gnu` | `os: ["linux"]`, `cpu: ["arm64"]`, `libc: ["glibc"]` | `aarch64-unknown-linux-gnu` | `ocmm-lsp-aarch64-unknown-linux-gnu` |
| `ocmm-lsp-linux-x64-musl` | `os: ["linux"]`, `cpu: ["x64"]`, `libc: ["musl"]` | `x86_64-unknown-linux-musl` | `ocmm-lsp-x86_64-unknown-linux-musl` |
| `ocmm-lsp-linux-arm64-musl` | `os: ["linux"]`, `cpu: ["arm64"]`, `libc: ["musl"]` | `aarch64-unknown-linux-musl` | `ocmm-lsp-aarch64-unknown-linux-musl` |
| `ocmm-lsp-darwin-x64` | `os: ["darwin"]`, `cpu: ["x64"]` | `x86_64-apple-darwin` | `ocmm-lsp-x86_64-apple-darwin` |
| `ocmm-lsp-darwin-arm64` | `os: ["darwin"]`, `cpu: ["arm64"]` | `aarch64-apple-darwin` | `ocmm-lsp-aarch64-apple-darwin` |
| `ocmm-lsp-win32-x64` | `os: ["win32"]`, `cpu: ["x64"]` | `x86_64-pc-windows-msvc` | `ocmm-lsp-x86_64-pc-windows-msvc.exe` |
| `ocmm-lsp-win32-arm64` | `os: ["win32"]`, `cpu: ["arm64"]` | `aarch64-pc-windows-msvc` | `ocmm-lsp-aarch64-pc-windows-msvc.exe` |

The package payload must put the binary at `bin/<binary-name>`. The JS wrapper must not assume all platform package names exist on disk; npm will skip incompatible optional packages.

## Runtime Resolution

The `ocmm-lsp` JS wrapper must resolve in this order:

1. If `OCMM_LSP_COMMAND` is set in existing MCP resolution paths, preserve the current override behavior outside the wrapper.
2. Detect platform/arch/libc and compute the expected platform package name and target binary name.
3. Try `require.resolve("<platform-package>/package.json")`, then locate that package's `bin/<binary-name>`.
4. Fall back to existing bundled candidates under `dist/bin`: `ocmm-lsp-<target>` and `ocmm-lsp`.
5. If nothing is found, print an error including:
   - current detected platform, arch, and libc;
   - expected npm package name;
   - a note that optional dependencies may have been omitted via `--omit=optional` or package-manager config;
   - local build fallback: `pnpm run build:lsp` from a source checkout.

This preserves development behavior while making npm installs small and platform-specific.

## CI and Release Architecture

### Tag routing

The release workflow must route by tag prefix:

- `vX.Y.Z`: main package release.
- `ocmm-lsp-vA.B.C`: LSP release.
- `workflow_dispatch`: accepts an explicit release kind (`ocmm` or `ocmm-lsp`) and tag/version input for manual reruns.

The old `v*` single-version publishing path is removed. A generic or mismatched tag must not publish packages; CI may reject it with a message directing maintainers to `v*.*.*` or `ocmm-lsp-v*`.

### LSP release path

For `ocmm-lsp-vA.B.C`:

1. Check that the tag version equals `crates/ocmm-lsp/Cargo.toml` version.
2. Build/test Rust LSP.
3. Build eight native targets, including Linux GNU and musl x64/arm64.
4. Stage eight npm package directories from a generated template.
5. `npm pack --dry-run --json` each package to verify contents.
6. Publish platform packages to npmjs.org with `NODE_AUTH_TOKEN` / `NPM_TOKEN`.
7. Upload native binary assets and package tarball/checksum assets to a GitHub Release for that LSP tag.

Reruns must skip already-published package versions after verifying the existing version matches the intended package name/version, so partial CI failures can be safely retried.

### `ocmm` release path

For `vX.Y.Z`:

1. Check that the tag version equals `package.json.version`.
2. Verify the `optionalDependencies` LSP version is internally consistent across all eight packages.
3. Run TypeScript tests, Rust tests, build, Codex generation, and LSP wrapper smoke tests.
4. Publish `ocmm` to npmjs.org on tag releases.
5. Preserve GitHub Release assets and optional GitHub Packages publishing, adjusted to `vX.Y.Z` tags.

Main `ocmm` npm tarballs must not bundle native LSP binaries. GitHub Release OpenCode/Codex tarballs remain self-contained by staging the pinned LSP version's platform package binaries into `dist/bin`; this staging uses already-built/published LSP artifacts and does not republish LSP packages during an `v*` release.

### Version update workflows

LSP-only update:

1. Update `crates/ocmm-lsp/Cargo.toml` to `A.B.C`.
2. Run LSP tests/builds and platform package staging checks.
3. Tag `ocmm-lsp-vA.B.C`.
4. CI publishes the eight `ocmm-lsp-*` npm packages and LSP GitHub Release assets.

Main `ocmm` update:

1. Update `package.json` to `X.Y.Z`.
2. Keep or update `optionalDependencies` to an already-published LSP version.
3. Regenerate Codex/plugin artifacts as required by the existing workflow.
4. Tag `vX.Y.Z`.
5. CI publishes `ocmm` and stages the pinned LSP binaries into self-contained GitHub Release tarballs.

Updating the default LSP used by `ocmm` requires an `ocmm` package release because the optional dependency versions live in `package.json`.

## Scaffolding Changes

Implementation must introduce a small set of reusable release/package helpers rather than hard-coding platform package metadata across YAML and TypeScript:

- A shared platform manifest defining package name, target triple, extension, npm `os`/`cpu`/`libc`, and asset name.
- A package manifest sync script that reads the LSP version from `Cargo.toml`, creates or updates checked-in `packages/ocmm-lsp-*` manifests, and keeps root `package.json.optionalDependencies` aligned to those workspace packages.
- A release staging script that copies corresponding native binaries into each platform package directory and writes publish-time package metadata with exact dependency versions.
- A main-package pack/publish normalization step that converts source checkout `workspace:` optional dependency ranges into exact LSP versions for npmjs.org and GitHub Release install tarballs.
- Release workflow steps that call those scripts instead of duplicating package metadata in shell snippets.

Use a TypeScript platform manifest for release/package staging and expose only the runtime-safe package-name/target mapping through `src/shared/ocmm-lsp-binary.ts`. Runtime code must not import release-only staging code.

## Hook Defaults Documentation

No hook defaults change. The documentation must state:

- `disabledHooks` default is `["directory-readme-injector"]`.
- Therefore `directory-readme-injector` is default-disabled.
- All other `HOOK_NAMES` entries are default-enabled unless user config disables them.

Hook behavior summary to document:

| Hook | Default | Effect |
|---|---|---|
| `directory-readme-injector` | Disabled | Inject nearest README content into directory read output |
| `directory-agents-injector` | Enabled | Inject directory `AGENTS.md` guidance/config |
| `write-existing-file-guard` | Enabled | Prevent unsafe direct writes/patches without required read policy |
| `notepad-write-guard` | Enabled | Protect internal notepad paths from writes |
| `bash-file-read-guard` | Enabled | Warn when shell is used for file reads that should use read tools |
| `bash-file-write-guard` | Enabled | Block shell write bypasses for existing project files |
| `question-label-truncator` | Enabled | Truncate overly long question option labels |
| `tasks-todowrite-disabler` | Enabled | Disable conflicting todo-read behavior while task tooling is active |
| `webfetch-redirect-guard` | Enabled | Rewrite webfetch requests to final redirected URL |
| `empty-task-response-detector` | Enabled | Replace empty subagent task output with a diagnostic warning |
| `comment-checker` | Enabled | Warn about AI-attribution comments in code output |
| `plan-format-validator` | Enabled | Warn on malformed plan checklist formatting |
| `read-image-resizer` | Enabled | Warn about large image read/resize constraints |
| `json-error-recovery` | Enabled | Append recovery guidance for JSON parse errors |
| `fsync-skip-warning` | Enabled | Surface warnings when fsync operations are skipped |
| `tool-output-truncator` | Enabled | Truncate oversized tool outputs |
| `todo-description-override` | Enabled | Override todowrite tool description with stricter format guidance |
| `commit-guard-injector` | Enabled | Inject no-automatic-git-commit instruction into system prompt |
| `subagent-git-guard` | Enabled | Block subagents from git write commands |

## Error Handling

- npm publish steps must fail clearly when `NPM_TOKEN`/`NODE_AUTH_TOKEN` is missing on tag releases.
- Package staging must fail if any expected native binary is absent.
- Release checks must fail if tag version and canonical version source differ.
- Wrapper diagnostics must distinguish unsupported platform, omitted optional dependency, and missing local build fallback.
- Linux libc detection must return GNU vs musl consistently; unsupported libc states must produce an explicit unsupported-platform error.

## Testing and Verification

Implementation must verify:

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- LSP MCP smoke test lists `status`, `diagnostics`, `goto_definition`, `find_references`, `symbols`, `prepare_rename`, and `rename`.
- Platform manifest unit tests cover all eight package/target mappings, including Linux musl.
- Wrapper resolution tests cover platform package success, bundled `dist/bin` fallback, and missing optional dependency diagnostics.
- Package staging tests or dry runs prove each platform package contains exactly the expected binary and metadata.
- Release workflow path checks prove `v*` validates `package.json.version` while `ocmm-lsp-v*` validates `Cargo.toml` version.

## Non-Goals

- Do not change hook behavior or defaults.
- Do not publish to npm during local implementation.
- Do not remove existing GitHub Release support.
- Do not require `ocmm` and `ocmm-lsp` versions to match.
- Do not add broad release-channel changes beyond npmjs.org and the version/tag split.
