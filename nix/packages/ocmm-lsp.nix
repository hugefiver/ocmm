{
  lib,
  nodejs_24,
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
  nativeCheckInputs = [ nodejs_24 ];

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
