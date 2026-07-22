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
    system:
    lib.genAttrs packageNames (
      name: builtins.unsafeDiscardStringContext packageSets.${system}.${name}.drvPath
    )
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
