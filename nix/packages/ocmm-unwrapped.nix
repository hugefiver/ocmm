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
  pnpm = pnpm_11.override { nodejs-slim = nodejs_24; };
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
    hash = "sha256-EEPPTS0a9bQ5iVCdNu2MBSnVrEDZ1f9pcl7FF9zAaqI=";
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

    pnpm --filter ocmm --offline --config.inject-workspace-packages=true \
      deploy "$out/lib/ocmm" --prod --no-optional
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
