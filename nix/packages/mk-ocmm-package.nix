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
  name = "ocmm-${ocmmPackage.version or "0.6.3"}";
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
