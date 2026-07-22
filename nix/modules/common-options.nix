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
