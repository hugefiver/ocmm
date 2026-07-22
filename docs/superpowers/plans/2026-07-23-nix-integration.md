# Nix Integration Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reproducible four-system Nix distribution for ocmm with native LSP and TypeScript packages, configurable OpenCode wrappers, Home Manager and NixOS modules, comprehensive checks, cache-aware CI, and user documentation.

**Architecture:** Keep runtime selection in one pure TypeScript resolver, build Rust and TypeScript in separate Nix derivations, and compose thin OpenCode wrappers through `lib.mkOcmmPackage` without rebuilding either base package. The root flake only composes focused files under `nix/packages/`, `nix/modules/`, and `nix/tests/`; Home Manager owns user OpenCode integration while NixOS only installs the selected wrapper.

**Tech Stack:** TypeScript 6 ESM, Node.js 24, Node `node:test`, pnpm 11.9.0 with lockfile v9, Nix flakes/nixpkgs, `fetchPnpmDeps` with `pnpmConfigHook` and `fetcherVersion = 4`, Rust/Cargo `buildRustPackage`, Home Manager, NixOS VM tests, GitHub Actions.

**Global Constraints:**
- Keep ocmm at `0.6.2` and native `ocmm-lsp` at `0.3.2`; this work does not bump either version.
- Support exactly `x86_64-linux`, `aarch64-linux`, `x86_64-darwin`, and `aarch64-darwin` in Nix outputs.
- Build `ocmm-lsp` from the repository `Cargo.lock`; do not consume npm platform binaries in Nix.
- Build TypeScript separately with pnpm 11, `fetchPnpmDeps`, `pnpmConfigHook`, `fetcherVersion = 4`, and an exact SRI fixed-output hash.
- Deploy only production JavaScript dependencies with `pnpm --filter ocmm deploy "$out/lib/ocmm" --legacy --prod --no-optional` inside the Nix install phase.
- Run `pnpm run gen:codex-plugin` after the clean TypeScript build; bind both root `dist/bin/ocmm-lsp` and `plugins/deepwork/dist/bin/ocmm-lsp` to the Nix-built native binary.
- Every root JavaScript launcher must set absolute `OCMM_LSP_COMMAND`; root and Codex plugin-local JavaScript `ocmm-lsp` launchers must resolve the native store binary without a same-named PATH lookup.
- Preserve the package's non-free `LicenseRef-AAAPL` metadata. Flake-owned package sets use a narrow `allowUnfreePredicate` for `ocmm`, `ocmm-unwrapped`, and `ocmm-lsp`; overlay, factory, Home Manager, and NixOS consumers must configure the equivalent predicate.
- Resolve OpenCode in this exact order: CLI, non-empty `OCMM_OPENCODE`, `shim.opencode`, non-empty `OCMM_NIX_OPENCODE`, non-empty `OCMM_PROGRAMS_OPENCODE`, PATH `opencode`.
- `opencodePackage` and `opencodeCommand` are mutually exclusive; `programsOpencodePackage` is lower priority than either explicit source.
- The default `ocmm` package injects `pkgs.opencode`; `nix run .` must not require a preinstalled OpenCode.
- The Home Manager module may append only ocmm's Nix-store plugin path to `programs.opencode.settings.plugin`; the NixOS module must not create a service or manage user files.
- Do not add `flake-parts`, change npm/GitHub Release publication, modify the config schema, or regenerate `schema.json`.
- Keep Nix build phases network-free after fixed-output dependency fetching; a missing or stale hash must fail closed.
- Run all source-sensitive Nix checks against the Git-filtered flake `.` after the orchestrator stages the current task files; never use `path:.`, and reject pre-existing `dist`, `node_modules`, or `target` in the Nix source.
- Do not hard-code a Cachix cache name, token, repository credential, or local WSL path in `README.md`.
- GitHub Actions permissions remain `contents: read`; cache failures are non-fatal, but build/test failures are fatal.
- All operator commands in this plan use PowerShell syntax. Shell fragments inside Nix derivation phases are Nix stdenv shell code, and `.github/workflows/nix.yml` explicitly uses `pwsh` for `run` steps.
- Implementation workers do not commit. After each task passes integration checks, the orchestrator performs the listed semantic commit using only that task's files.

---

## File Structure

- Modify: `src/cli/shim.ts` — export and use the pure OpenCode command resolver.
- Modify: `src/cli/shim.test.ts` — lock the six-level selection order, empty environment handling, and passthrough preservation.
- Create: `flake.nix` — pin inputs and compose packages, apps, overlay, factory, modules, and checks.
- Create: `flake.lock` — lock nixpkgs and Home Manager, with Home Manager following nixpkgs.
- Create: `nix/packages/ocmm-lsp.nix` — host-native Rust package built from `Cargo.lock`.
- Create: `nix/packages/ocmm-unwrapped.nix` — offline TypeScript build, production deployment, runtime data, and native-LSP-bound launchers.
- Create: `nix/packages/mk-ocmm-package.nix` — thin wrapper factory and OpenCode source validation.
- Create: `nix/packages/default.nix` — per-system package composition for `ocmm-lsp`, `ocmm-unwrapped`, `ocmm`, and `default`.
- Create: `nix/modules/common-options.nix` — shared `programs.ocmm` option declarations.
- Create: `nix/modules/home-manager.nix` — Home Manager package installation, programs fallback, and plugin setting integration.
- Create: `nix/modules/nixos.nix` — NixOS package installation with explicit OpenCode source support only.
- Create: `nix/tests/packages.nix` — native tools/list, launcher closure, factory conflict, exact fake OpenCode selection, and forwarding checks.
- Create: `nix/tests/cross-system.nix` — force all four systems' package `drvPath` values during native evaluation.
- Create: `nix/tests/modules.nix` — Home Manager activation/config/fallback/conflict checks and NixOS evaluation checks.
- Create: `nix/tests/nixos-vm.nix` — `x86_64-linux` VM runtime smoke test.
- Create: `.github/workflows/nix.yml` — pinned-action Nix CI, GitHub Actions store cache, optional Cachix, builds, and cross-system evaluation.
- Modify: `README.md` — Nix run/build, overlay, factory, Home Manager, NixOS, priority, and CI cache documentation.

---

### Task 1: Add the pure OpenCode resolution chain with TDD

**Files:**
- Modify: `src/cli/shim.test.ts`
- Modify: `src/cli/shim.ts`

**Interfaces:**
- Consumes: `ShimArgs.opencodeBin`, `Partial<ShimConfig>.opencode`, and `NodeJS.ProcessEnv`.
- Produces: `resolveOpencodeBin(args: Pick<ShimArgs, "opencodeBin">, defaults: Pick<Partial<ShimConfig>, "opencode">, env: NodeJS.ProcessEnv): string`, consumed by `main()` and all Nix wrappers.

- [ ] **Step 1: Write the failing resolver tests**

Add `resolveOpencodeBin` to the import from `./shim.ts`, then add the complete resolver test block shown below. Use one immutable passthrough vector and distinct command names so every adjacent priority edge is observable:

```ts
describe("shim resolveOpencodeBin", () => {
  const passthrough = ["run", "--model", "test/model", "two words"]

  it("uses CLI, user env, config, Nix, programs, and PATH in exact priority order", () => {
    const parsed = parseArgs(["--opencode", "cli-opencode", "--", ...passthrough])
    const env: NodeJS.ProcessEnv = {
      OCMM_OPENCODE: "user-opencode",
      OCMM_NIX_OPENCODE: "nix-opencode",
      OCMM_PROGRAMS_OPENCODE: "programs-opencode",
    }

    assert.equal(resolveOpencodeBin(parsed, { opencode: "config-opencode" }, env), "cli-opencode")
    assert.equal(resolveOpencodeBin({ opencodeBin: undefined }, { opencode: "config-opencode" }, env), "user-opencode")
    assert.equal(
      resolveOpencodeBin({ opencodeBin: undefined }, { opencode: "config-opencode" }, { ...env, OCMM_OPENCODE: undefined }),
      "config-opencode",
    )
    assert.equal(
      resolveOpencodeBin({ opencodeBin: undefined }, {}, { ...env, OCMM_OPENCODE: undefined }),
      "nix-opencode",
    )
    assert.equal(
      resolveOpencodeBin(
        { opencodeBin: undefined },
        {},
        { ...env, OCMM_OPENCODE: undefined, OCMM_NIX_OPENCODE: undefined },
      ),
      "programs-opencode",
    )
    assert.equal(resolveOpencodeBin({ opencodeBin: undefined }, {}, {}), "opencode")
    assert.deepEqual(parsed.passthrough, passthrough)
  })

  it("treats empty and whitespace-only environment values as absent", () => {
    assert.equal(
      resolveOpencodeBin(
        { opencodeBin: undefined },
        {},
        { OCMM_OPENCODE: "", OCMM_NIX_OPENCODE: "   ", OCMM_PROGRAMS_OPENCODE: "\t" },
      ),
      "opencode",
    )
  })

  it("keeps CLI and shim config values authoritative without rewriting them", () => {
    assert.equal(resolveOpencodeBin({ opencodeBin: "  cli value  " }, {}, {}), "  cli value  ")
    assert.equal(resolveOpencodeBin({ opencodeBin: undefined }, { opencode: "config value" }, {}), "config value")
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="shim resolveOpencodeBin" "src/cli/shim.test.ts"
if ($LASTEXITCODE -eq 0) { throw "resolver test unexpectedly passed before implementation" }
```

Expected: FAIL because `resolveOpencodeBin` is not exported by `src/cli/shim.ts`.

- [ ] **Step 3: Implement the minimal pure resolver and wire `main()`**

Add this helper near `buildChildEnv`:

```ts
function nonEmptyEnvironmentValue(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined
  return value
}

export function resolveOpencodeBin(
  args: Pick<ShimArgs, "opencodeBin">,
  defaults: Pick<Partial<ShimConfig>, "opencode">,
  env: NodeJS.ProcessEnv,
): string {
  return args.opencodeBin
    ?? nonEmptyEnvironmentValue(env.OCMM_OPENCODE)
    ?? defaults.opencode
    ?? nonEmptyEnvironmentValue(env.OCMM_NIX_OPENCODE)
    ?? nonEmptyEnvironmentValue(env.OCMM_PROGRAMS_OPENCODE)
    ?? "opencode"
}
```

Replace the existing selection in `main()` with:

```ts
const opencodeBin = resolveOpencodeBin(args, defaults, process.env)
```

Do not move OpenCode selection into `buildChildEnv`; the resolver reads parent values, while `buildChildEnv` continues to control the environment passed to the selected process.

- [ ] **Step 4: Run GREEN and adjacent regression gates**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="shim resolveOpencodeBin" "src/cli/shim.test.ts"
if ($LASTEXITCODE -ne 0) { throw "focused resolver tests failed" }
node --test --experimental-strip-types --test-reporter=spec "src/cli/shim.test.ts"
if ($LASTEXITCODE -ne 0) { throw "shim regression suite failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed after shim resolver change" }
```

Expected: focused tests PASS, all shim tests PASS, and TypeScript typecheck exits `0`.

- [ ] **Step 5: Integrate and commit at the orchestrator boundary**

The implementation worker reports the two changed files and test evidence. After reviewing the task diff, the orchestrator runs:

```powershell
git add -- "src/cli/shim.ts" "src/cli/shim.test.ts"
git commit -m "feat(cli): add Nix OpenCode fallbacks" -m "Resolve user, config, Nix wrapper, and Home Manager OpenCode sources in a tested priority chain."
```

Expected: one atomic commit containing only the resolver and its tests.

---

### Task 2: Add flake packages, wrapper factory, and package checks

**Files:**
- Create: `flake.nix`
- Create: `flake.lock`
- Create: `nix/packages/ocmm-lsp.nix`
- Create: `nix/packages/ocmm-unwrapped.nix`
- Create: `nix/packages/mk-ocmm-package.nix`
- Create: `nix/packages/default.nix`
- Create: `nix/tests/packages.nix`
- Create: `nix/tests/cross-system.nix`

**Interfaces:**
- Consumes: `Cargo.lock`, `crates/ocmm-lsp/Cargo.toml` version `0.3.2`, `package.json` version `0.6.2`, `pnpm-lock.yaml`, Task 1's runtime environment names, and the npm runtime file list.
- Produces: `ocmm-lsp`, `ocmm-unwrapped`, `ocmm`, and `default` under each supported system's `packages`; `ocmm` and `default` under each supported system's `apps`; `overlays.default`; `lib.mkOcmmPackage`; `ocmm-unwrapped.passthru.pluginPath`; and package checks consumed by Task 3 and Task 4.

- [ ] **Step 1: Establish the package-check RED baseline**

Run from Windows before adding the flake:

```powershell
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix flake show .
if ($LASTEXITCODE -eq 0) { throw "flake unexpectedly existed before package implementation" }
```

Expected: FAIL because `flake.nix` does not exist.

- [ ] **Step 2: Implement the host-native Rust package**

Create `nix/packages/ocmm-lsp.nix` with this package contract:

```nix
{
  lib,
  rustPlatform,
  src,
}:
rustPlatform.buildRustPackage {
  pname = "ocmm-lsp";
  version = "0.3.2";
  inherit src;

  cargoLock.lockFile = "${src}/Cargo.lock";
  cargoBuildFlags = [ "-p" "ocmm-lsp" ];
  cargoTestFlags = [ "-p" "ocmm-lsp" ];
  doCheck = true;

  postInstall = ''
    test -x "$out/bin/ocmm-lsp"
  '';

  meta = {
    description = "Project-owned stdio MCP server exposing LSP tools for ocmm";
    mainProgram = "ocmm-lsp";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    license = {
      fullName = "Anti-AI Academic Public License";
      spdxId = "LicenseRef-AAAPL";
      free = false;
    };
  };
}
```

The derivation must use the workspace lock and package selector shown above, run Rust tests, and install exactly one host-native `bin/ocmm-lsp`.

- [ ] **Step 3: Implement the TypeScript package with a deliberate fixed-output RED hash**

Create `nix/packages/ocmm-unwrapped.nix`. Use `nodejs_24`, a `pnpm_11` overridden to the same Node package, `pnpmConfigHook`, `makeWrapper`, and this build/install shape:

```nix
{
  lib,
  stdenv,
  nodejs_24,
  pnpm_11,
  fetchPnpmDeps,
  pnpmConfigHook,
  makeWrapper,
  src,
  ocmm-lsp,
}:
let
  pnpm = pnpm_11.override { nodejs = nodejs_24; };
  nativeLsp = lib.getExe ocmm-lsp;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "ocmm-unwrapped";
  version = "0.6.2";
  inherit src;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 4;
    hash = lib.fakeHash;
  };

  nativeBuildInputs = [
    nodejs_24
    pnpm
    pnpmConfigHook
    makeWrapper
  ];

  postUnpack = ''
    test ! -e "$sourceRoot/dist"
    test ! -e "$sourceRoot/node_modules"
    test ! -e "$sourceRoot/target"
  '';

  buildPhase = ''
    runHook preBuild
    test ! -e dist
    pnpm run build:ts
    mkdir -p dist/bin
    ln -s ${nativeLsp} dist/bin/ocmm-lsp
    pnpm run gen:codex-plugin
    test -f plugins/deepwork/dist/cli/ocmm-lsp.js
    test -d plugins/deepwork/dist/shared
    test -L plugins/deepwork/dist/bin/ocmm-lsp
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    pnpm --filter ocmm deploy "$out/lib/ocmm" --legacy --prod --no-optional
    mkdir -p "$out/bin"
    for runtime in "$out/lib/ocmm/dist" "$out/lib/ocmm/plugins/deepwork/dist"; do
      test -f "$runtime/cli/ocmm-lsp.js"
      test -d "$runtime/shared"
      rm -rf "$runtime/bin"
      mkdir -p "$runtime/bin"
      ln -s ${nativeLsp} "$runtime/bin/ocmm-lsp"
    done

    makeWrapper ${lib.getExe nodejs_24} "$out/bin/ocmm" \
      --add-flags "$out/lib/ocmm/dist/cli/shim.js" \
      --set OCMM_LSP_COMMAND ${lib.escapeShellArg nativeLsp}
    makeWrapper ${lib.getExe nodejs_24} "$out/bin/ocmm-profiles" \
      --add-flags "$out/lib/ocmm/dist/cli/profiles.js" \
      --set OCMM_LSP_COMMAND ${lib.escapeShellArg nativeLsp}
    makeWrapper ${lib.getExe nodejs_24} "$out/bin/ocmm-lsp" \
      --add-flags "$out/lib/ocmm/dist/cli/ocmm-lsp.js" \
      --set OCMM_LSP_COMMAND ${lib.escapeShellArg nativeLsp}

    runHook postInstall
  '';

  passthru = {
    inherit ocmm-lsp;
    pluginPath = "${finalAttrs.finalPackage}/lib/ocmm/dist/index.js";
  };

  meta = {
    description = "OpenCode Multi-Model Auto-Router plugin and command-line tools";
    mainProgram = "ocmm";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    license = {
      fullName = "Anti-AI Academic Public License";
      spdxId = "LicenseRef-AAAPL";
      free = false;
    };
  };
})
```

The build starts from the Git-filtered source, where ignored `dist`, `node_modules`, and `target` artifacts are absent. TypeScript compilation creates root runtime files; `gen:codex-plugin` then stages the same `dist/cli`, `dist/shared`, and native symlink into the generated Codex bundle. The install phase recreates both native links after deployment so pack/deploy symlink handling cannot change the target. The root wrapper environment independently binds plugin-created MCP commands to the same `nativeLsp`, while direct Codex startup resolves its plugin-local `dist/bin/ocmm-lsp`; no JavaScript launcher can find `$out/bin/ocmm-lsp` through PATH and call itself.

- [ ] **Step 4: Implement `lib.mkOcmmPackage` and per-system package composition**

Create `nix/packages/mk-ocmm-package.nix` as a source-bound function with this public argument set:

```nix
{ src }:
{
  pkgs,
  ocmmPackage ? pkgs.callPackage ./ocmm-unwrapped.nix {
    inherit src;
    ocmm-lsp = pkgs.callPackage ./ocmm-lsp.nix { inherit src; };
  },
  opencodePackage ? null,
  opencodeCommand ? null,
  programsOpencodePackage ? null,
}:
let
  lib = pkgs.lib;
  explicitConflict = opencodePackage != null && opencodeCommand != null;
  explicitCommand =
    if opencodePackage != null then lib.getExe opencodePackage
    else opencodeCommand;
  programsCommand =
    if explicitCommand == null && programsOpencodePackage != null
    then lib.getExe programsOpencodePackage
    else null;
  environmentName =
    if explicitCommand != null then "OCMM_NIX_OPENCODE"
    else if programsCommand != null then "OCMM_PROGRAMS_OPENCODE"
    else null;
  environmentValue = if explicitCommand != null then explicitCommand else programsCommand;
in
if explicitConflict then
  throw "lib.mkOcmmPackage: opencodePackage and opencodeCommand are mutually exclusive"
else
pkgs.symlinkJoin {
  name = "ocmm-${ocmmPackage.version or "0.6.2"}";
  paths = [ ocmmPackage ];
  nativeBuildInputs = [ pkgs.makeWrapper ];
  postBuild = lib.optionalString (environmentName != null) ''
    wrapProgram "$out/bin/ocmm" \
      --set ${environmentName} ${lib.escapeShellArg environmentValue}
  '';
  passthru = (ocmmPackage.passthru or { }) // {
    unwrapped = ocmmPackage;
    inherit opencodePackage opencodeCommand programsOpencodePackage;
    pluginPath = ocmmPackage.passthru.pluginPath;
  };
  meta = (ocmmPackage.meta or { }) // { mainProgram = "ocmm"; };
}
```

Create `nix/packages/default.nix` to construct one Rust package, one TypeScript package, and a default OpenCode-enabled wrapper:

```nix
{
  pkgs,
  src,
  mkOcmmPackage,
}:
let
  ocmm-lsp = pkgs.callPackage ./ocmm-lsp.nix { inherit src; };
  ocmm-unwrapped = pkgs.callPackage ./ocmm-unwrapped.nix { inherit src ocmm-lsp; };
  ocmm = mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = ocmm-unwrapped;
    opencodePackage = pkgs.opencode;
  };
in
{
  inherit ocmm-lsp ocmm-unwrapped ocmm;
  default = ocmm;
}
```

The factory must ignore `programsOpencodePackage` when either explicit source is present. Only `ocmm` is rewrapped; `ocmm-profiles` and `ocmm-lsp` remain the native-LSP-bound launchers from `ocmm-unwrapped`.

- [ ] **Step 5: Add deterministic package and cross-system checks**

Create `nix/tests/packages.nix` returning these named derivations:

```nix
{
  lib,
  pkgs,
  packages,
  mkOcmmPackage,
}:
let
  fakeNix = pkgs.writeShellApplication {
    name = "fake-nix-opencode";
    text = ''
      printf '%s\n' "$@" > "$OCMM_TEST_LOG"
    '';
  };
  fakeUser = pkgs.writeShellApplication {
    name = "fake-user-opencode";
    text = ''
      printf '%s\n' "$@" > "$OCMM_TEST_LOG"
    '';
  };
  custom = mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = packages.ocmm-unwrapped;
    opencodePackage = fakeNix;
  };
  conflict = builtins.tryEval ((mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = packages.ocmm-unwrapped;
    opencodePackage = fakeNix;
    opencodeCommand = lib.getExe fakeUser;
  }).drvPath);
in
{
  lsp-tools-list = pkgs.runCommand "ocmm-lsp-tools-list" { nativeBuildInputs = [ pkgs.jq ]; } ''
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
      | ${lib.getExe packages.ocmm-lsp} mcp > response.json
    jq -e '.id == 1 and (.result.tools | length == 8)' response.json > /dev/null
    jq -r '.result.tools[].name' response.json | sort > names
    printf '%s\n' diagnostics find_references find_symbol_related goto_definition prepare_rename rename status symbols | sort > expected
    diff -u expected names
    touch "$out"
  '';

  launchers = pkgs.runCommand "ocmm-launchers" {
    nativeBuildInputs = [ pkgs.jq pkgs.nodejs_24 ];
  } ''
    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$TMPDIR/xdg"
    mkdir -p "$HOME" "$XDG_CONFIG_HOME"
    ${packages.ocmm-unwrapped}/bin/ocmm --help > /dev/null
    ${packages.ocmm-unwrapped}/bin/ocmm-profiles help > /dev/null
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
      | ${packages.ocmm-unwrapped}/bin/ocmm-lsp mcp > response.json
    grep -F '"id":1' response.json > /dev/null
    for entry in .agents .codex dist plugins prompts skills README.md package.json node_modules; do
      test -e "${packages.ocmm-unwrapped}/lib/ocmm/$entry"
    done
    test -d ${packages.ocmm-unwrapped}/lib/ocmm/node_modules/zod
    if find ${packages.ocmm-unwrapped}/lib/ocmm/node_modules -maxdepth 1 -name 'ocmm-lsp-*' | grep -q .; then
      echo "npm optional LSP package leaked into the Nix closure" >&2
      exit 1
    fi
    for runtime in \
      ${packages.ocmm-unwrapped}/lib/ocmm/dist \
      ${packages.ocmm-unwrapped}/lib/ocmm/plugins/deepwork/dist; do
      test -f "$runtime/cli/ocmm-lsp.js"
      test -d "$runtime/shared"
      test -L "$runtime/bin/ocmm-lsp"
      test "$(readlink "$runtime/bin/ocmm-lsp")" = ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)}
      test "$(ls -1 "$runtime/bin" | wc -l)" -eq 1
      printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
        | (cd "$(dirname "$runtime")" && node ./dist/cli/ocmm-lsp.js mcp) > plugin-response.json
      jq -e '.id == 1 and (.result.tools | length == 8)' plugin-response.json > /dev/null
    done
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)} ${packages.ocmm-unwrapped}/bin/ocmm > /dev/null
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)} ${packages.ocmm-unwrapped}/bin/ocmm-profiles > /dev/null
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)} ${packages.ocmm-unwrapped}/bin/ocmm-lsp > /dev/null
    touch "$out"
  '';

  opencode-selection = pkgs.runCommand "ocmm-opencode-selection" { } ''
    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$TMPDIR/xdg"
    export OCMM_TEST_LOG="$TMPDIR/args"
    mkdir -p "$HOME" "$XDG_CONFIG_HOME"
    ${custom}/bin/ocmm --no-providers --no-plugins -- alpha 'two words'
    printf '%s\n' alpha 'two words' > expected
    diff -u expected "$OCMM_TEST_LOG"
    grep -F ${lib.escapeShellArg (lib.getExe fakeNix)} ${custom}/bin/ocmm > /dev/null
    OCMM_OPENCODE=${lib.escapeShellArg (lib.getExe fakeUser)} \
      ${custom}/bin/ocmm --no-providers --no-plugins -- user-env
    printf '%s\n' user-env > expected-user
    diff -u expected-user "$OCMM_TEST_LOG"
    ${custom}/bin/ocmm --opencode ${lib.escapeShellArg (lib.getExe fakeUser)} \
      --no-providers --no-plugins -- cli-source
    printf '%s\n' cli-source > expected-cli
    diff -u expected-cli "$OCMM_TEST_LOG"
    grep -F ${lib.escapeShellArg (lib.getExe pkgs.opencode)} ${packages.ocmm}/bin/ocmm > /dev/null
    touch "$out"
  '';

  factory-conflict = assert !conflict.success; pkgs.runCommand "ocmm-factory-conflict" { } ''
    touch "$out"
  '';
}
```

The production closure assertions are mandatory: `pnpm deploy` must include runtime `zod`, while `--no-optional` excludes every npm native-LSP package. Root and Codex plugin-local runtimes must each contain the CLI/shared files, exactly one generic native symlink, and a direct JavaScript-launcher `tools/list` smoke that reaches the Nix-built server.

Create `nix/tests/cross-system.nix` so evaluation forces every package derivation without executing foreign binaries:

```nix
{
  lib,
  pkgs,
  packageSets,
}:
let
  systems = [
    "x86_64-linux"
    "aarch64-linux"
    "x86_64-darwin"
    "aarch64-darwin"
  ];
  packageNames = [ "ocmm-lsp" "ocmm-unwrapped" "ocmm" "default" ];
  drvPaths = lib.genAttrs systems (
    system: lib.genAttrs packageNames (name: packageSets.${system}.${name}.drvPath)
  );
in
pkgs.runCommand "ocmm-cross-system-drv-paths" {
  nativeBuildInputs = [ pkgs.jq ];
  passAsFile = [ "drvPaths" ];
  drvPaths = builtins.toJSON drvPaths;
} ''
  jq -e 'length == 4 and all(.[]; length == 4)' "$drvPathsPath" > /dev/null
  cp "$drvPathsPath" "$out"
''
```

- [ ] **Step 6: Compose the initial flake, overlay, apps, and checks**

Create `flake.nix` with pinned nixpkgs and Home Manager inputs, with `home-manager.inputs.nixpkgs.follows = "nixpkgs"`. Its initial output composition must follow this exact shape; Task 3 adds module exports and module checks without moving package internals into the root:

```nix
{
  description = "ocmm packages, modules, and checks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, home-manager }:
    let
      lib = nixpkgs.lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = lib.genAttrs systems;
      allowedUnfreeNames = [ "ocmm-lsp" "ocmm-unwrapped" "ocmm" ];
      mkPkgs = system: import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = package:
          builtins.elem (lib.getName package) allowedUnfreeNames;
      };
      mkOcmmPackage = import ./nix/packages/mk-ocmm-package.nix { src = self; };
      packageSets = forAllSystems (system:
        let pkgs = mkPkgs system;
        in import ./nix/packages/default.nix {
          inherit pkgs mkOcmmPackage;
          src = self;
        });
    in
    {
      packages = packageSets;

      apps = forAllSystems (system: {
        ocmm = {
          type = "app";
          program = lib.getExe packageSets.${system}.ocmm;
        };
        default = {
          type = "app";
          program = lib.getExe packageSets.${system}.ocmm;
        };
      });

      overlays.default = final: prev:
        let packages = import ./nix/packages/default.nix {
          pkgs = final;
          src = self;
          inherit mkOcmmPackage;
        };
        in {
          inherit (packages) ocmm-lsp ocmm-unwrapped ocmm;
        };

      lib.mkOcmmPackage = mkOcmmPackage;

      checks = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          packageChecks = import ./nix/tests/packages.nix {
            inherit lib pkgs mkOcmmPackage;
            packages = packageSets.${system};
          };
        in packageChecks // {
          cross-system-evaluation = import ./nix/tests/cross-system.nix {
            inherit lib pkgs packageSets;
          };
        });
    };
}
```

The narrow flake-owned predicate permits only this repository's three AAAPL package names, so direct package/app evaluation works without ambient `NIXPKGS_ALLOW_UNFREE`; it does not globally enable unfree nixpkgs packages. Overlay, factory, and module consumers still use their own `pkgs` and must opt into the equivalent predicate, which Task 4 documents.

The unused `home-manager` binding is intentional in this revision because the input is locked now and consumed in Task 3. Before any lock or build command, the orchestrator stages the current package-layer files so Nix reads the canonical Git-filtered flake and excludes ignored Windows artifacts:

```powershell
git add -- "flake.nix" "nix/packages" "nix/tests/packages.nix" "nix/tests/cross-system.nix"
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "staged package layer has whitespace errors" }
```

Generate `flake.lock` only through Nix, then stage it before the next Nix command:

```powershell
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix flake lock .
if ($LASTEXITCODE -ne 0) { throw "flake lock generation failed" }
git add -- "flake.lock"
```

Expected: `flake.lock` pins both inputs and records Home Manager's nixpkgs follow relationship.

- [ ] **Step 7: Obtain and install the one exact pnpm dependency hash**

With the staged Git-filtered `.#ocmm-unwrapped` now evaluable, leave the one deliberate `lib.fakeHash` from Step 3 in place and run:

```powershell
$hashLog = Join-Path $env:TEMP "ocmm-nix-pnpm-hash.log"
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix build .#ocmm-unwrapped --no-link --print-build-logs 2>&1 | Tee-Object -FilePath $hashLog
if ($LASTEXITCODE -eq 0) { throw "fake pnpm hash unexpectedly produced a successful build" }
$gotHash = @(rg -o --replace '$1' 'got:\s+(sha256-[A-Za-z0-9+/=]+)' $hashLog)
if ($gotHash.Count -ne 1) { throw "expected exactly one pnpm got: SRI hash, found $($gotHash.Count)" }
$gotHash[0]
```

Expected: the build fails only with a fixed-output mismatch and prints exactly one `got:` SRI value beginning with `sha256-`. Replace `lib.fakeHash` in `nix/packages/ocmm-unwrapped.nix` with that exact printed value, then remove the temporary log:

```powershell
Remove-Item -LiteralPath $hashLog -Force
git add -- "nix/packages/ocmm-unwrapped.nix"
rg -n 'lib\.fakeHash|hash\s*=\s*""' "nix" "flake.nix"
if ($LASTEXITCODE -eq 0) { throw "temporary or empty Nix hash remains" }
if ($LASTEXITCODE -ne 1) { throw "hash scan failed" }
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix build .#ocmm-unwrapped --no-link --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "ocmm-unwrapped did not build with the exact pnpm hash" }
```

Expected: no fake/empty hash match and `ocmm-unwrapped` builds offline from the fetched pnpm store. Do not change `package.json` or `pnpm-lock.yaml` while deriving this hash.

- [ ] **Step 8: Run package GREEN and real-surface checks**

Run all checks against the staged Git-filtered flake. Before each rerun after a Nix-file correction, the orchestrator restages that file so `.` and the eventual commit have identical content:

```powershell
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix flake show .
if ($LASTEXITCODE -ne 0) { throw "flake outputs did not evaluate" }
wsl.exe -d nixos --cd $wslRepo -- nix flake check . --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "package checks failed" }
wsl.exe -d nixos --cd $wslRepo -- nix build .#ocmm .#ocmm-lsp --no-link --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "explicit package builds failed" }
wsl.exe -d nixos --cd $wslRepo -- nix run . -- --version
if ($LASTEXITCODE -ne 0) { throw "default app did not execute its packaged OpenCode" }
```

Expected: package/app/overlay/factory output names evaluate, all package checks pass, both explicit builds succeed, and the default app prints the packaged OpenCode version without requiring host OpenCode.

- [ ] **Step 9: Integrate and commit at the orchestrator boundary**

After verifying that `package.json`, `pnpm-lock.yaml`, and release files are unchanged, the orchestrator runs:

```powershell
git add -- "flake.nix" "flake.lock" "nix/packages" "nix/tests/packages.nix" "nix/tests/cross-system.nix"
git commit -m "feat(nix): add flake packages and checks" -m "Build native LSP and TypeScript closures, expose wrappers and apps, and verify package behavior across supported systems."
```

Expected: one package-layer commit. `nix/modules/`, module tests, CI, and README are absent from this commit.

---

### Task 3: Add Home Manager and NixOS modules with evaluation and VM checks

**Files:**
- Create: `nix/modules/common-options.nix`
- Create: `nix/modules/home-manager.nix`
- Create: `nix/modules/nixos.nix`
- Create: `nix/tests/modules.nix`
- Create: `nix/tests/nixos-vm.nix`
- Modify: `flake.nix`

**Interfaces:**
- Consumes: `self.lib.mkOcmmPackage`, `self.packages.${pkgs.system}.ocmm-unwrapped`, `ocmm-unwrapped.passthru.pluginPath`, Home Manager's `programs.opencode.{enable,package,settings}`, and Task 1's lower-priority wrapper variables.
- Produces: `homeManagerModules.{ocmm,default}`, `nixosModules.{ocmm,default}`, Home Manager installed wrappers and plugin settings, NixOS installed wrappers, and module/VM checks.

- [ ] **Step 1: Confirm the module outputs are missing before implementation**

Run:

```powershell
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix eval .#homeManagerModules.ocmm --apply 'value: builtins.typeOf value'
if ($LASTEXITCODE -eq 0) { throw "Home Manager module output unexpectedly existed before implementation" }
wsl.exe -d nixos --cd $wslRepo -- nix eval .#nixosModules.ocmm --apply 'value: builtins.typeOf value'
if ($LASTEXITCODE -eq 0) { throw "NixOS module output unexpectedly existed before implementation" }
```

Expected: evaluation FAILS because the module outputs do not exist yet.

- [ ] **Step 2: Define the shared option contract and Home Manager behavior**

Create `nix/modules/common-options.nix`:

```nix
{
  lib,
  defaultPackage,
}:
{
  enable = lib.mkEnableOption "ocmm";
  package = lib.mkOption {
    type = lib.types.package;
    default = defaultPackage;
    defaultText = lib.literalExpression "self.packages.\${pkgs.system}.ocmm-unwrapped";
    description = "Base ocmm package to wrap and install.";
  };
  opencode.package = lib.mkOption {
    type = lib.types.nullOr lib.types.package;
    default = null;
    description = "Explicit OpenCode package used by the ocmm wrapper.";
  };
  opencode.command = lib.mkOption {
    type = lib.types.nullOr lib.types.str;
    default = null;
    description = "Explicit OpenCode executable path or command name used by the ocmm wrapper.";
  };
}
```

Create `nix/modules/home-manager.nix` as a source-bound Home Manager module:

```nix
{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.ocmm;
  defaultPackage = self.packages.${pkgs.system}.ocmm-unwrapped;
  explicitSource = cfg.opencode.package != null || cfg.opencode.command != null;
  programsPackage =
    if !explicitSource && config.programs.opencode.enable
    then config.programs.opencode.package
    else null;
  finalPackage = self.lib.mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = cfg.package;
    opencodePackage = cfg.opencode.package;
    opencodeCommand = cfg.opencode.command;
    programsOpencodePackage = programsPackage;
  };
in
{
  options.programs.ocmm = import ./common-options.nix {
    inherit lib defaultPackage;
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !(cfg.opencode.package != null && cfg.opencode.command != null);
        message = "programs.ocmm.opencode.package and programs.ocmm.opencode.command are mutually exclusive";
      }
    ];

    home.packages = [ finalPackage ];

    programs.opencode.settings.plugin = lib.mkIf config.programs.opencode.enable (
      lib.mkAfter [ finalPackage.passthru.pluginPath ]
    );
  };
}
```

The module appends one plugin string only when OpenCode is enabled. It never replaces existing plugin entries and never sets `OCMM_PROGRAMS_OPENCODE` when an explicit ocmm source exists.

- [ ] **Step 3: Implement the NixOS install-only module**

Create `nix/modules/nixos.nix`:

```nix
{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.ocmm;
  defaultPackage = self.packages.${pkgs.system}.ocmm-unwrapped;
  finalPackage = self.lib.mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = cfg.package;
    opencodePackage = cfg.opencode.package;
    opencodeCommand = cfg.opencode.command;
  };
in
{
  options.programs.ocmm = import ./common-options.nix {
    inherit lib defaultPackage;
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !(cfg.opencode.package != null && cfg.opencode.command != null);
        message = "programs.ocmm.opencode.package and programs.ocmm.opencode.command are mutually exclusive";
      }
    ];
    environment.systemPackages = [ finalPackage ];
  };
}
```

Do not reference `programs.opencode`, `home.*`, `xdg.*`, or `systemd.services` in this file.

- [ ] **Step 4: Implement Home Manager and NixOS evaluation checks**

Create `nix/tests/modules.nix` with reusable fake packages and configuration constructors. The checks must force the following facts:

```nix
{
  self,
  nixpkgs,
  home-manager,
  system,
  pkgs,
}:
let
  lib = pkgs.lib;
  fakePrograms = pkgs.writeShellApplication {
    name = "fake-programs-opencode";
    text = ''
      printf '%s\n' "$@" > "$OCMM_TEST_LOG"
    '';
  };
  fakeExplicit = pkgs.writeShellApplication {
    name = "fake-explicit-opencode";
    text = ''
      printf '%s\n' "$@" > "$OCMM_TEST_LOG"
    '';
  };
  mkHome = extraModule: home-manager.lib.homeManagerConfiguration {
    inherit pkgs;
    modules = [
      self.homeManagerModules.ocmm
      {
        home.username = "ocmm-test";
        home.homeDirectory = "/home/ocmm-test";
        home.stateVersion = "25.11";
      }
      extraModule
    ];
  };
  programsHome = mkHome {
    programs.ocmm.enable = true;
    programs.opencode = {
      enable = true;
      package = fakePrograms;
      settings.plugin = [ "existing-plugin" ];
    };
  };
  explicitPackageHome = mkHome {
    programs.ocmm = {
      enable = true;
      opencode.package = fakeExplicit;
    };
  };
  explicitCommandHome = mkHome {
    programs.ocmm = {
      enable = true;
      opencode.command = lib.getExe fakeExplicit;
    };
  };
  conflictHome = builtins.tryEval ((mkHome {
    programs.ocmm = {
      enable = true;
      opencode.package = fakeExplicit;
      opencode.command = lib.getExe fakeExplicit;
    };
  }).activationPackage.drvPath);
  installedOcmm = lib.findFirst
    (package: (package.meta.mainProgram or "") == "ocmm")
    (throw "Home Manager did not install an ocmm wrapper")
    programsHome.config.home.packages;
  opencodeJson = programsHome.config.xdg.configFile."opencode/opencode.json".source;
  nixosConfig = nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [
      self.nixosModules.ocmm
      { nixpkgs.pkgs = pkgs; }
      {
        system.stateVersion = "25.11";
        programs.ocmm = {
          enable = true;
          opencode.command = lib.getExe fakeExplicit;
        };
      }
    ];
  };
  nixosBaseline = nixpkgs.lib.nixosSystem {
    inherit system;
    modules = [
      { nixpkgs.pkgs = pkgs; }
      { system.stateVersion = "25.11"; }
    ];
  };
  nixosOcmm = lib.findFirst
    (package: (package.meta.mainProgram or "") == "ocmm")
    (throw "NixOS did not install an ocmm wrapper")
    nixosConfig.config.environment.systemPackages;
  addedNixosPackages = lib.subtractLists
    nixosBaseline.config.environment.systemPackages
    nixosConfig.config.environment.systemPackages;
in
{
  home-manager = pkgs.runCommand "ocmm-home-manager" { nativeBuildInputs = [ pkgs.jq ]; } ''
    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$TMPDIR/xdg"
    export OCMM_TEST_LOG="$TMPDIR/args"
    mkdir -p "$HOME" "$XDG_CONFIG_HOME"
    test -e ${programsHome.activationPackage}
    jq -e --arg plugin ${lib.escapeShellArg installedOcmm.passthru.pluginPath} \
      '.plugin == ["existing-plugin", $plugin]' ${opencodeJson} > /dev/null
    grep -F ${lib.escapeShellArg (lib.getExe fakePrograms)} ${installedOcmm}/bin/ocmm > /dev/null
    ${installedOcmm}/bin/ocmm --no-providers --no-plugins -- hm-fallback
    printf '%s\n' hm-fallback > expected
    diff -u expected "$OCMM_TEST_LOG"
    test -e ${explicitPackageHome.activationPackage}
    test -e ${explicitCommandHome.activationPackage}
    touch "$out"
  '';

  module-conflict = assert !conflictHome.success; pkgs.runCommand "ocmm-module-conflict" { } ''
    touch "$out"
  '';

  nixos-evaluation =
    assert !(nixosConfig.config.systemd.services ? ocmm);
    assert builtins.length addedNixosPackages == 1;
    assert builtins.head addedNixosPackages == nixosOcmm;
    pkgs.runCommand "ocmm-nixos-evaluation" { } ''
      test -e ${nixosConfig.config.system.build.toplevel}
      grep -F ${lib.escapeShellArg (lib.getExe fakeExplicit)} ${nixosOcmm}/bin/ocmm > /dev/null
      touch "$out"
    '';
}
```

The check must read `xdg.configFile."opencode/opencode.json".source` from the pinned Home Manager input and retain the exact two-element plugin assertion. Both NixOS systems bind the passed flake-owned `pkgs` through `nixpkgs.pkgs`, so their ocmm wrappers use the narrow AAAPL predicate instead of silently creating a rejecting package set. Do not replace this with a text-only module inspection.

- [ ] **Step 5: Add the x86_64-linux NixOS VM runtime smoke**

Create `nix/tests/nixos-vm.nix`:

```nix
{
  self,
  pkgs,
}:
let
  fakeOpencode = pkgs.writeShellApplication {
    name = "fake-vm-opencode";
    text = ''
      printf '%s\n' "$@"
    '';
  };
in
pkgs.testers.runNixOSTest {
  name = "ocmm-nixos-vm";
  nodes.machine = {
    imports = [ self.nixosModules.ocmm ];
    nixpkgs.pkgs = pkgs.lib.mkForce pkgs;
    programs.ocmm = {
      enable = true;
      opencode.command = pkgs.lib.getExe fakeOpencode;
    };
    system.stateVersion = "25.11";
  };
  testScript = ''
    machine.start()
    machine.wait_for_unit("multi-user.target")
    machine.succeed("ocmm --no-providers --no-plugins -- vm-smoke | grep -Fx vm-smoke")
  '';
}
```

Expose this check only for `x86_64-linux`; do not pretend to execute it for foreign systems. `pkgs.lib.mkForce pkgs` explicitly overrides `runNixOSTest`'s unique default node package set, making the VM use the same flake-owned narrow AAAPL predicate as the check derivation without a duplicate-definition failure.

- [ ] **Step 6: Export modules and merge module checks in `flake.nix`**

Add these top-level outputs:

```nix
homeManagerModules = {
  ocmm = import ./nix/modules/home-manager.nix { inherit self; };
  default = self.homeManagerModules.ocmm;
};

nixosModules = {
  ocmm = import ./nix/modules/nixos.nix { inherit self; };
  default = self.nixosModules.ocmm;
};
```

Under each system's `checks`, evaluate module checks only on `x86_64-linux`, passing the already bound `inputs.home-manager`. This keeps NixOS evaluation on a NixOS-supported host while package `drvPath` evaluation still covers all four systems:

```nix
moduleChecks = lib.optionalAttrs (system == "x86_64-linux") (
  import ./nix/tests/modules.nix {
    inherit self nixpkgs system pkgs;
    home-manager = inputs.home-manager;
  }
);
```

```nix
packageChecks
// moduleChecks
// {
  cross-system-evaluation = import ./nix/tests/cross-system.nix {
    inherit lib pkgs packageSets;
  };
}
// lib.optionalAttrs (system == "x86_64-linux") {
  nixos-vm = import ./nix/tests/nixos-vm.nix { inherit self pkgs; };
}
```

Keep the package/app/overlay/factory names from Task 2 unchanged.

Before module GREEN commands, the orchestrator stages the Task 3 files so the Git-filtered flake evaluates the exact candidate commit:

```powershell
git add -- "flake.nix" "nix/modules" "nix/tests/modules.nix" "nix/tests/nixos-vm.nix"
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "staged module layer has whitespace errors" }
```

- [ ] **Step 7: Run module GREEN, VM, and output-name checks**

Run:

```powershell
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix flake check . --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "module or package checks failed" }
wsl.exe -d nixos --cd $wslRepo -- nix build .#checks.x86_64-linux.nixos-vm --no-link --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "NixOS VM smoke failed" }
$attrs = @(
  "homeManagerModules.ocmm",
  "homeManagerModules.default",
  "nixosModules.ocmm",
  "nixosModules.default",
  "lib.mkOcmmPackage"
)
foreach ($attr in $attrs) {
  wsl.exe -d nixos --cd $wslRepo -- nix eval ".#$attr" --apply 'value: builtins.typeOf value'
  if ($LASTEXITCODE -ne 0) { throw "flake output failed to evaluate: $attr" }
}
```

Expected: all checks pass, the VM observes `vm-smoke`, module aliases evaluate, Home Manager preserves the existing plugin before appending the store plugin, the programs fallback executes exactly, conflict evaluation fails as intended, and NixOS has no `ocmm` service.

- [ ] **Step 8: Integrate and commit at the orchestrator boundary**

After reviewing the module and test diff, the orchestrator runs:

```powershell
git add -- "flake.nix" "nix/modules" "nix/tests/modules.nix" "nix/tests/nixos-vm.nix"
git commit -m "feat(nix): add Home Manager and NixOS modules" -m "Install configurable ocmm wrappers, integrate the Home Manager plugin path, and verify evaluation and VM behavior."
```

Expected: one module-layer commit containing no CI or README changes.

---

### Task 4: Add pinned Nix CI, documentation, and final acceptance gates

**Files:**
- Create: `.github/workflows/nix.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: every flake output and check from Tasks 2-3, the exact action commits, repository variable `CACHIX_CACHE_NAME`, and secret `CACHIX_AUTH_TOKEN`.
- Produces: PR/master/manual Nix CI; ocsb-style GitHub Actions store caching; opt-in trusted-event Cachix pushes; user-facing package, overlay, module, priority, and cache documentation.

- [ ] **Step 1: Record the documentation/CI RED baseline**

Run:

```powershell
if (Test-Path -LiteralPath ".github/workflows/nix.yml") { throw "Nix workflow unexpectedly exists before implementation" }
rg -n --fixed-strings "## Nix" "README.md"
if ($LASTEXITCODE -eq 0) { throw "README Nix section unexpectedly exists before implementation" }
if ($LASTEXITCODE -ne 1) { throw "README baseline scan failed" }
```

Expected: workflow absent and no Nix section.

- [ ] **Step 2: Create the pinned, read-only workflow**

Create `.github/workflows/nix.yml` with one Ubuntu job and PowerShell run steps:

```yaml
name: Nix

on:
  pull_request:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    env:
      CACHIX_AUTH_TOKEN: ${{ (((github.event_name == 'push' && github.ref == 'refs/heads/master') || github.event_name == 'workflow_dispatch') && secrets.CACHIX_AUTH_TOKEN) || '' }}
    defaults:
      run:
        shell: pwsh
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09
        with:
          persist-credentials: false

      - uses: DeterminateSystems/nix-installer-action@00199f951aeb9404028a6e4b95ad42546f73296a

      - name: Restore and save Nix store
        uses: nix-community/cache-nix-action@7df957e333c1e5da7721f60227dbba6d06080569
        continue-on-error: true
        with:
          primary-key: nix-${{ runner.os }}-${{ hashFiles('flake.lock') }}-${{ github.sha }}
          restore-prefixes-first-match: |
            nix-${{ runner.os }}-${{ hashFiles('flake.lock') }}-
            nix-${{ runner.os }}-
          gc-max-store-size-linux: 5G
          upload-chunk-size: 67108864

      - name: Configure optional Cachix
        if: ${{ vars.CACHIX_CACHE_NAME != '' }}
        uses: cachix/cachix-action@5f2d7c5294214f71b873db4b969586b980625e71
        with:
          name: ${{ vars.CACHIX_CACHE_NAME }}
          authToken: '${{ env.CACHIX_AUTH_TOKEN }}'

      - name: Check flake
        run: |
          nix flake check --print-build-logs
          if ($LASTEXITCODE -ne 0) { throw "nix flake check failed" }

      - name: Build primary packages
        run: |
          nix build .#ocmm .#ocmm-lsp --no-link --print-build-logs
          if ($LASTEXITCODE -ne 0) { throw "explicit Nix builds failed" }

      - name: Evaluate all supported package derivations
        run: |
          $systems = @("x86_64-linux", "aarch64-linux", "x86_64-darwin", "aarch64-darwin")
          $packages = @("ocmm-lsp", "ocmm-unwrapped", "ocmm", "default")
          foreach ($system in $systems) {
            foreach ($package in $packages) {
              nix eval --raw ".#packages.$system.$package.drvPath"
              if ($LASTEXITCODE -ne 0) { throw "failed to evaluate $system $package" }
            }
          }

      - name: Smoke default app
        run: |
          nix run . -- --version
          if ($LASTEXITCODE -ne 0) { throw "default app did not execute its packaged OpenCode" }
```

The cache step precedes Cachix to match the required workflow order. With no `CACHIX_CACHE_NAME`, Cachix is not configured. Pull requests always receive an empty token; configured master pushes and manual dispatches may push through the action's authenticated post-build hook.

- [ ] **Step 3: Document all Nix user surfaces**

Add a `## Nix` section after the install overview in `README.md`. Include these exact topics and executable examples:

````markdown
## Nix

Run or build the default OpenCode-enabled package:

```console
nix run github:hugefiver/ocmm
nix build github:hugefiver/ocmm#ocmm
nix build github:hugefiver/ocmm#ocmm-lsp
```

The default package injects nixpkgs OpenCode. `ocmm-unwrapped` contains the plugin and native LSP but leaves OpenCode selection to CLI/config/environment/PATH.
````

State that direct flake packages/apps carry a narrow internal AAAPL allowance, so `nix run github:hugefiver/ocmm` needs no ambient `NIXPKGS_ALLOW_UNFREE`. Because AAAPL is non-free, consumers constructing packages through the overlay, `lib.mkOcmmPackage`, Home Manager module, or NixOS module must explicitly configure:

```nix
nixpkgs.config.allowUnfreePredicate = package:
  builtins.elem (lib.getName package) [
    "ocmm-lsp"
    "ocmm-unwrapped"
    "ocmm"
  ];
```

For standalone Home Manager, apply the same predicate to the nixpkgs instance passed to `homeManagerConfiguration`. Do not recommend global `allowUnfree = true`.

Document an overlay consumer with `inputs.ocmm.url = "github:hugefiver/ocmm"`, `inputs.ocmm.inputs.nixpkgs.follows = "nixpkgs"`, the narrow predicate above, `nixpkgs.overlays = [ inputs.ocmm.overlays.default ]`, and `environment.systemPackages = [ pkgs.ocmm ]`.

Document the factory with one package example and one command example:

```nix
inputs.ocmm.lib.mkOcmmPackage {
  inherit pkgs;
  opencodePackage = pkgs.opencode;
}
```

```nix
inputs.ocmm.lib.mkOcmmPackage {
  inherit pkgs;
  opencodeCommand = "/opt/opencode/bin/opencode";
}
```

State that the two explicit fields are mutually exclusive and list this resolution table verbatim:

```text
1. --opencode
2. non-empty OCMM_OPENCODE
3. ocmm.json or ocmm.jsonc shim.opencode
4. non-empty OCMM_NIX_OPENCODE
5. non-empty OCMM_PROGRAMS_OPENCODE
6. opencode from PATH
```

Add Home Manager and NixOS examples:

```nix
imports = [ inputs.ocmm.homeManagerModules.default ];
programs.ocmm.enable = true;
programs.opencode.enable = true;
```

```nix
imports = [ inputs.ocmm.nixosModules.default ];
programs.ocmm = {
  enable = true;
  opencode.package = pkgs.opencode;
};
```

Explain that Home Manager detects an enabled non-null `programs.opencode.package`, installs the wrapper, and appends the ocmm store plugin path to the user's existing plugin list. Explain that NixOS only installs the package/wrapper and never creates a service or user OpenCode configuration.

Finally document CI cache configuration: `CACHIX_CACHE_NAME` is an optional repository variable, `CACHIX_AUTH_TOKEN` is an optional repository secret, no Cachix cache is used by default, pull requests never receive the token, and only trusted master pushes or manual dispatches can authenticate pushes. Keep local WSL paths and concrete cache names out of `README.md`.

Before static and full acceptance gates, the orchestrator stages both Task 4 files. This makes README—the package's shipped documentation—part of the same Git-filtered source that CI will build:

```powershell
git add -- ".github/workflows/nix.yml" "README.md"
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "staged CI/documentation layer has whitespace errors" }
```

- [ ] **Step 4: Run static workflow and documentation checks**

Run:

```powershell
$pins = @(
  "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09",
  "DeterminateSystems/nix-installer-action@00199f951aeb9404028a6e4b95ad42546f73296a",
  "nix-community/cache-nix-action@7df957e333c1e5da7721f60227dbba6d06080569",
  "cachix/cachix-action@5f2d7c5294214f71b873db4b969586b980625e71"
)
foreach ($pin in $pins) {
  rg -n --fixed-strings $pin ".github/workflows/nix.yml"
  if ($LASTEXITCODE -ne 0) { throw "missing pinned action: $pin" }
}
rg -n --fixed-strings "permissions:" ".github/workflows/nix.yml"
if ($LASTEXITCODE -ne 0) { throw "workflow permissions missing" }
rg -n --fixed-strings "contents: read" ".github/workflows/nix.yml"
if ($LASTEXITCODE -ne 0) { throw "workflow contents permission is not read-only" }
rg -n --fixed-strings "continue-on-error: true" ".github/workflows/nix.yml"
if ($LASTEXITCODE -ne 0) { throw "cache failure policy missing" }
rg -n --fixed-strings "upload-chunk-size: 67108864" ".github/workflows/nix.yml"
if ($LASTEXITCODE -ne 0) { throw "64 MiB cache chunks missing" }
rg -n '/mnt/[a-zA-Z]/Users/|[A-Za-z]:\\Users\\' "README.md"
if ($LASTEXITCODE -eq 0) { throw "local user path leaked into README" }
if ($LASTEXITCODE -ne 1) { throw "README local-path scan failed" }
rg -n --fixed-strings "CACHIX_CACHE_NAME" "README.md" ".github/workflows/nix.yml"
if ($LASTEXITCODE -ne 0) { throw "Cachix cache variable documentation is missing" }
rg -n --fixed-strings "CACHIX_AUTH_TOKEN" "README.md" ".github/workflows/nix.yml"
if ($LASTEXITCODE -ne 0) { throw "Cachix token documentation is missing" }
rg -n --fixed-strings "allowUnfreePredicate" "README.md" "flake.nix"
if ($LASTEXITCODE -ne 0) { throw "narrow AAAPL predicate is missing" }
rg -n --fixed-strings "allowUnfree = true" "README.md"
if ($LASTEXITCODE -eq 0) { throw "README must not recommend global unfree enablement" }
if ($LASTEXITCODE -ne 1) { throw "README global-unfree scan failed" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "diff contains whitespace errors" }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "staged diff contains whitespace errors" }
```

Expected: every action appears only at its immutable commit, cache settings and read-only permissions are present, README contains no local path, both Cachix controls are documented, and `git diff --check` is clean.

- [ ] **Step 5: Run all Windows and real Nix acceptance gates**

Run the project-standard Windows gates:

```powershell
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
pnpm test
if ($LASTEXITCODE -ne 0) { throw "test suite failed" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }
```

Run the canonical committed-tree Nix gates through NixOS WSL:

```powershell
$windowsRepo = (Get-Location).Path.Replace('\', '/')
$wslRepo = (wsl.exe -d nixos -- wslpath -a -u $windowsRepo).Trim()
if (-not $wslRepo.StartsWith('/')) { throw "could not translate repository path for WSL" }
wsl.exe -d nixos --cd $wslRepo -- nix flake check --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "nix flake check failed" }
wsl.exe -d nixos --cd $wslRepo -- nix build .#ocmm .#ocmm-lsp --no-link --print-build-logs
if ($LASTEXITCODE -ne 0) { throw "explicit Nix builds failed" }
wsl.exe -d nixos --cd $wslRepo -- nix run . -- --version
if ($LASTEXITCODE -ne 0) { throw "nix run did not execute packaged OpenCode" }
$systems = @("x86_64-linux", "aarch64-linux", "x86_64-darwin", "aarch64-darwin")
$packages = @("ocmm-lsp", "ocmm-unwrapped", "ocmm", "default")
foreach ($system in $systems) {
  foreach ($package in $packages) {
    wsl.exe -d nixos --cd $wslRepo -- nix eval --raw ".#packages.$system.$package.drvPath"
    if ($LASTEXITCODE -ne 0) { throw "drvPath evaluation failed for $system $package" }
  }
}
```

Expected: all standard gates pass; native Linux packages/checks and the VM build; `nix run . -- --version` prints the packaged OpenCode version; all 16 package/system `drvPath` evaluations print `/nix/store/` derivation paths.

Run source diagnostics and final diff checks:

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "final diff check failed" }
git status --short
```

Attempt `lsp_diagnostics` on `src/cli/shim.ts` and `src/cli/shim.test.ts`. The current workspace reports the TypeScript language-server command as unavailable; record that tool result and use the successful strict `pnpm run typecheck` as the authoritative TypeScript diagnostic gate rather than installing software. Review both unstaged and staged state with `git diff --stat`, `git diff --cached --stat`, `git diff -- src/cli/shim.ts src/cli/shim.test.ts`, `git diff --cached -- src/cli/shim.ts src/cli/shim.test.ts`, `git diff -- flake.nix nix`, `git diff --cached -- flake.nix nix`, `git diff -- .github/workflows/nix.yml README.md`, and `git diff --cached -- .github/workflows/nix.yml README.md`; confirm there are no generated bundle, schema, npm package, release workflow, version, or lockfile changes other than the new `flake.lock`.

- [ ] **Step 6: Integrate, commit, review, and push only from the orchestrator**

After all Task 4 and full-repository gates are green, the orchestrator runs:

```powershell
git add -- ".github/workflows/nix.yml" "README.md"
git commit -m "ci(nix): verify and document Nix integration" -m "Add pinned cache-aware Nix CI and document packages, modules, wrapper priority, and optional Cachix configuration."
```

Then request one final implementation acceptance review over the complete diff and all four task commits. If review changes code, rerun only the gates affected by that change plus one final `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `nix flake check`, explicit Nix build, runtime smoke, diagnostics, and `git diff --check`; commit the correction semantically. The orchestrator alone pushes after the final review accepts the current revision.

---

## Verification Summary

### Exact task order and commit boundaries

1. Task 1 — TypeScript resolver and tests; commit `feat(cli): add Nix OpenCode fallbacks`.
2. Task 2 — flake packages, apps, overlay, factory, package checks, and `flake.lock`; commit `feat(nix): add flake packages and checks`.
3. Task 3 — Home Manager/NixOS modules and module/VM checks; commit `feat(nix): add Home Manager and NixOS modules`.
4. Task 4 — pinned Nix CI, README, full gates, and final review; commit `ci(nix): verify and document Nix integration`.

### Observable completion evidence

- `pnpm run typecheck`, `pnpm test`, and `pnpm run build` exit `0` on Windows.
- `nix flake check --print-build-logs` exits `0` in the NixOS WSL distribution.
- `nix build .#ocmm .#ocmm-lsp --no-link --print-build-logs` exits `0`.
- `nix run . -- --version` executes the packaged OpenCode, prints its version, and exits `0`.
- Native LSP `tools/list` returns exactly the eight expected tool names.
- Fake OpenCode checks prove exact command selection and argument forwarding for factory, user environment, CLI, Home Manager programs fallback, and NixOS VM command sources.
- Home Manager's generated OpenCode JSON retains an existing plugin entry and appends exactly the ocmm Nix-store plugin path.
- Factory and module conflicts fail evaluation; NixOS installs the wrapper and has no `ocmm` service.
- All four systems expose derivations for `ocmm-lsp`, `ocmm-unwrapped`, `ocmm`, and `default`.
- Workflow pins, cache keys, 5 GiB Linux cap, 64 MiB chunks, non-fatal cache behavior, Cachix trust boundary, and `contents: read` pass static inspection.
- Strict TypeScript typecheck and `git diff --check` are clean; the unavailable TypeScript language-server result is recorded without installing software, and final review accepts the current complete diff.

## Plan Self-Review

- **Spec coverage:** Task 1 covers the complete runtime priority chain. Task 2 covers all package/app/overlay/factory outputs, native and TypeScript builds, production closure, generated Codex runtime, both absolute native-LSP bindings, narrow AAAPL evaluation, package checks, and four-system evaluation. Task 3 covers both module interfaces, Home Manager plugin/fallback behavior, conflict handling, NixOS evaluation, and the Linux VM. Task 4 covers consumer non-free configuration, CI, cache security, documentation, all local gates, and final review.
- **File-map consistency:** Every created or modified implementation path appears in exactly one primary task except `flake.nix`, which is intentionally created for package composition in Task 2 and extended with module composition in Task 3.
- **Interface consistency:** `resolveOpencodeBin` environment names match `mkOcmmPackage`; `pluginPath` flows from `ocmm-unwrapped` through wrapper passthru into Home Manager; module options match the approved common shape; package/check/output names are identical across flake, tests, CI, README, and verification commands.
- **Hash consistency:** The only temporary hash state is the deliberate `lib.fakeHash` mismatch used to obtain one exact SRI value; the task requires replacing it, removing the log, scanning for temporary/empty hashes, and rebuilding before integration.
- **Source consistency:** Every Nix lock/build/check runs against staged Git-filtered `.` content, uses `--no-link` for builds, and rejects ignored local build directories in the derivation source; `path:.` is explicitly prohibited.
- **Scope consistency:** No task modifies npm publication, `.github/workflows/release.yml`, versions, config schema, `schema.json`, generated bundles, `package.json`, `pnpm-lock.yaml`, Cargo manifests, or the approved design.
- **Placeholder scan:** The plan contains no deferred implementation markers, no omitted-code instructions, and no cross-task shorthand. Conditional notes identify concrete evidence and preserve the same acceptance assertion.
- **Command consistency:** Operator commands are PowerShell-compatible; Nix stdenv phase snippets are isolated inside Nix expressions; CI explicitly selects `pwsh`; README examples remain repository-location-independent.
