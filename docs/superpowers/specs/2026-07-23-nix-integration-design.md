# Nix Package, Modules, and Cache CI Design

## Goal

Add a reproducible Nix distribution surface for ocmm so users can run it directly with `nix run`, install it as a package, or enable it through Home Manager or NixOS modules. Users must be able to select an OpenCode derivation or executable while preserving runtime overrides. GitHub Actions must build and test the Nix surface, reuse a GitHub Actions Nix store cache, and support opt-in Cachix pushes without exposing credentials to pull requests.

## Scope

The implementation will add:

- a locked root flake with packages, apps, an overlay, a package factory, and module exports;
- separate host-native derivations for the Rust `ocmm-lsp` server and the TypeScript ocmm application;
- a default package and app that include nixpkgs OpenCode and therefore work through `nix run` without a prior OpenCode installation;
- Home Manager and NixOS modules with explicit OpenCode package/command selection;
- shim support for user and Nix fallback environment variables;
- Nix package, module, runtime-selection, and NixOS VM checks;
- a Nix GitHub Actions workflow with GitHub Actions store caching and optional Cachix upload;
- Nix usage and cache configuration documentation.

The Nix package targets `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, and `aarch64-darwin`. Existing npm platform packages and GitHub Release bundles remain responsible for Windows and the prebuilt eight-platform release matrix. Nix builds the Rust binary for the current host instead of consuming npm optional binary packages.

## Non-Goals

- Do not add a long-running NixOS service; ocmm and OpenCode remain interactive CLIs.
- Do not make the NixOS module manage per-user OpenCode settings.
- Do not replace the existing npm or GitHub Release publication paths.
- Do not hard-code a Cachix cache name, token, local WSL path, or repository credential.
- Do not reproduce OpenCode's package implementation; consume `pkgs.opencode` or a caller-provided compatible package.
- Do not introduce `flake-parts` solely to organize these outputs.

## Flake Architecture

The root `flake.nix` and `flake.lock` use pinned nixpkgs and Home Manager inputs. Home Manager follows the selected nixpkgs input so module evaluation uses one package set.

The flake exposes:

```text
packages.<system>.ocmm-lsp
packages.<system>.ocmm-unwrapped
packages.<system>.ocmm
packages.<system>.default
apps.<system>.ocmm
apps.<system>.default
overlays.default
lib.mkOcmmPackage
homeManagerModules.ocmm
homeManagerModules.default
nixosModules.ocmm
nixosModules.default
checks.<system>.*
```

`packages.<system>.default` and `apps.<system>.default` resolve to the OpenCode-enabled `ocmm` package. `nix run github:hugefiver/ocmm` therefore starts ocmm with the pinned nixpkgs OpenCode available. `meta.mainProgram` and the explicit app both identify the `ocmm` executable.

The implementation is split by responsibility under:

```text
nix/packages/
nix/modules/
nix/tests/
```

The root flake composes those files and contains no package build internals.

## Package Construction

### Native LSP

`ocmm-lsp` uses `rustPlatform.buildRustPackage` against the repository `Cargo.lock`, builds the `ocmm-lsp` workspace package, runs its Rust tests, and installs one host-native `bin/ocmm-lsp`. Cargo dependencies are vendored through the nixpkgs Rust hooks and remain network-free during the build.

### TypeScript application

`ocmm-unwrapped` means "not bound to an OpenCode source"; it is still bound to the Nix-built native LSP. It uses the repository's pnpm 11 lockfile with top-level nixpkgs `fetchPnpmDeps` and `pnpmConfigHook`, sets `fetcherVersion = 4`, builds TypeScript offline, and installs the production Node dependency closure plus every runtime data directory shipped by the npm package.

The package exposes `ocmm`, `ocmm-profiles`, and the JavaScript `ocmm-lsp` launcher. Its launchers set `OCMM_LSP_COMMAND` to the absolute native `ocmm-lsp` store path. They do not rely on a same-named PATH lookup, which would risk the JavaScript launcher resolving itself recursively.

### OpenCode wrapper factory

`lib.mkOcmmPackage` accepts a package set, an ocmm base package, and at most one explicit OpenCode source:

```nix
lib.mkOcmmPackage {
  pkgs = ...;
  ocmmPackage = ...;          # defaults to this flake's ocmm-unwrapped
  opencodePackage = ...;      # null or a derivation with meta.mainProgram/bin/opencode
  opencodeCommand = ...;      # null or an executable path/command string
  programsOpencodePackage = ...; # Home Manager fallback only
}
```

Supplying both `opencodePackage` and `opencodeCommand` is an evaluation error. A derivation is converted to its executable with `lib.getExe`; a command string is passed through unchanged. The factory produces a thin wrapper and preserves the base package's plugin path and metadata through `passthru`.

The default `ocmm` package is created from `ocmm-unwrapped` with `opencodePackage = pkgs.opencode`. Callers can create additional variants through `lib.mkOcmmPackage` without rebuilding the TypeScript or Rust derivations.

## Runtime OpenCode Resolution

The shim resolves OpenCode in this exact order:

```text
1. --opencode <path-or-name>
2. non-empty OCMM_OPENCODE
3. ocmm.json or ocmm.jsonc shim.opencode
4. non-empty OCMM_NIX_OPENCODE
5. non-empty OCMM_PROGRAMS_OPENCODE
6. opencode from PATH
```

The existing CLI option remains authoritative. `OCMM_OPENCODE` is the user-controlled environment override. Nix wrappers set only the lower-priority Nix variables, so they cannot override a user's command line, environment, or ocmm configuration. Empty environment variables are treated as absent. The selected process continues to receive the existing passthrough arguments, environment, stdio behavior, and exit status.

The package factory maps an explicit package or command to `OCMM_NIX_OPENCODE`. Home Manager maps a detected `programs.opencode.package` to `OCMM_PROGRAMS_OPENCODE`. If neither is available, normal PATH discovery remains the final fallback.

## Module Interfaces

Both modules define this common option shape:

```nix
programs.ocmm = {
  enable = true;
  package = <ocmm-unwrapped derivation>;
  opencode.package = <null or derivation>;
  opencode.command = <null or string>;
};
```

`package` is replaceable for downstream overlays or forks. The two OpenCode options are mutually exclusive. If neither explicit source is set, module-specific fallback behavior applies.

### Home Manager

The Home Manager module installs a package produced by `lib.mkOcmmPackage`. Its data flow is:

1. An explicit `programs.ocmm.opencode.package` or `.command` becomes `OCMM_NIX_OPENCODE`.
2. Otherwise, when `programs.opencode` is enabled with a non-null package, that package becomes `OCMM_PROGRAMS_OPENCODE`.
3. Otherwise, the wrapper uses PATH.

When both `programs.ocmm` and `programs.opencode` are enabled, the module appends the installed ocmm store plugin path to `programs.opencode.settings.plugin`. This permits both `ocmm ...` and direct `opencode ...` invocation to load ocmm. The module adds only its plugin entry and leaves all other OpenCode settings under the user's ownership.

### NixOS

The NixOS module installs the selected wrapper into `environment.systemPackages`. It supports the explicit OpenCode package and command options and otherwise leaves the shim to discover OpenCode on PATH. It does not create services, write user home files, or refer to Home Manager's `programs.opencode` option.

## Error Handling

- Module and factory evaluation fails with a clear assertion when both explicit OpenCode sources are set.
- A package without a resolvable executable fails during Nix evaluation through `lib.getExe`, rather than producing a broken runtime wrapper.
- Missing explicit command paths retain the shim's normal child-process spawn failure and non-zero status.
- Nix build phases are offline after fixed-output dependency fetches; missing dependency hashes fail the build rather than accessing the network.
- Cache restore/save failures use `continue-on-error` and never mask a Nix build or test failure.
- Cachix is skipped when no cache name is configured and never receives credentials on fork pull requests.

## Testing Strategy

Implementation follows RED-to-GREEN for the shim resolution changes and adds deterministic flake checks.

### TypeScript resolution tests

Extend `src/cli/shim.test.ts` to prove the complete precedence chain. Each source uses a distinguishable fake command, and the test verifies selection plus unchanged passthrough arguments. Adjacent regression coverage retains config-file discovery, isolation modes, process exit propagation, and PATH fallback.

### Nix package checks

- Build the native LSP and send a JSON-RPC `tools/list` request; require a valid tool list response.
- Execute each installed Node launcher sufficiently to prove its runtime dependency closure is complete.
- Run the packaged shim against a fake OpenCode executable and require exact argument forwarding.
- Verify the default package closes over nixpkgs OpenCode while a factory-built custom variant calls only its selected fake executable.

### Module checks

- Evaluate and build a Home Manager configuration using `programs.opencode.package`; assert the resulting OpenCode JSON contains the ocmm store plugin path and the ocmm wrapper uses the programs fallback.
- Evaluate explicit Home Manager package and command variants and reject the mutually exclusive combination.
- Evaluate a NixOS configuration and assert only the expected system package is added.
- Run an `x86_64-linux` NixOS VM smoke test that enables the NixOS module, invokes packaged ocmm, and observes a fake OpenCode executable receiving the expected arguments.

### Cross-system evaluation

Linux CI builds and runs checks for its native system. It also evaluates package derivations for all four supported systems so Darwin and aarch64 output regressions fail before merge without pretending that Linux can execute those binaries.

## GitHub Actions and Binary Caches

Add `.github/workflows/nix.yml` for pull requests, pushes to the primary branch, and manual dispatch. Keep it independent from tag-oriented `.github/workflows/release.yml`.

The workflow uses immutable full commit SHAs for third-party actions and grants only `contents: read`. Its order is:

1. checkout;
2. Determinate Nix installation, following the `hugefiver/ocsb` pinned-action pattern;
3. GitHub Actions Nix store restore/save through `nix-community/cache-nix-action@7df957e333c1e5da7721f60227dbba6d06080569`;
4. optional Cachix setup;
5. `nix flake check --print-build-logs`;
6. explicit `nix build .#ocmm .#ocmm-lsp --print-build-logs`;
7. cross-system derivation evaluation.

The GitHub Actions cache follows the ocsb two-level key design:

- primary key includes runner OS, `hashFiles('flake.lock')`, and commit SHA;
- restore prefixes fall back first to the same lock hash and then the same OS;
- Linux Nix store data is capped at 5 GiB;
- chunks are 64 MiB;
- cache action failures are non-fatal, while Nix command failures remain fatal.

Cachix uses `vars.CACHIX_CACHE_NAME` as the opt-in cache selector and `secrets.CACHIX_AUTH_TOKEN` for push authorization. With no cache name, the step is skipped and the repository's default behavior is no Cachix access or push. Pull requests are read-only and never receive the token. A configured trusted primary-branch push or manual dispatch may push build outputs through the pinned Cachix action. No OIDC permission is added because Cachix action authentication uses its token secret.

## Local Verification

The real Nix surface is exercised through the available NixOS WSL distribution from the repository mounted under `/mnt/c`:

```text
wsl.exe -d nixos -- nix flake check --print-build-logs
wsl.exe -d nixos -- nix build .#ocmm .#ocmm-lsp --print-build-logs
wsl.exe -d nixos -- nix run . -- --help
```

Commands run from the translated repository path. Verification also runs the project-standard `pnpm run typecheck`, `pnpm test`, and `pnpm run build` on Windows. Temporary Nix or fake-command artifacts are created outside tracked source and removed after use.

## Acceptance Criteria

- `nix run .` starts the packaged shim with nixpkgs OpenCode available without a prior OpenCode installation.
- `packages.ocmm-lsp`, `packages.ocmm-unwrapped`, `packages.ocmm`, the default app, overlay, library factory, Home Manager module, and NixOS module all evaluate under their documented names.
- The four supported Linux/Darwin architecture outputs evaluate; native Linux packages and checks build successfully in WSL and CI.
- A user-selected OpenCode package or command is called exactly, while CLI, user environment, and ocmm config overrides retain the documented higher priority.
- Direct Home Manager-managed OpenCode loads the ocmm plugin from the Nix store.
- The NixOS module installs a working CLI wrapper without creating a service or user configuration.
- The native LSP is built from source and its JSON-RPC smoke check passes.
- GitHub Actions restores/saves the Nix store cache using the ocsb-style keys, and cache failures do not hide test failures.
- Cachix remains disabled by default, does not expose secrets to pull requests, and pushes on trusted events only after repository operators configure both the cache variable and token secret.
- `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `nix flake check`, explicit Nix builds, runtime smoke tests, and final implementation review all pass before push.
