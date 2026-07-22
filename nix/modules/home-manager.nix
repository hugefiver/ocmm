{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.ocmm;
  defaultPackage = self.packages.${pkgs.stdenv.hostPlatform.system}.ocmm-unwrapped;
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
