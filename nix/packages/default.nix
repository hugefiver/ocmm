{
  pkgs,
  src,
  mkOcmmPackage,
  opencodePackage ? pkgs.opencode,
}:
let
  ocmm-lsp = pkgs.callPackage ./ocmm-lsp.nix { inherit src; };
  ocmm-unwrapped = pkgs.callPackage ./ocmm-unwrapped.nix { inherit src ocmm-lsp; };
  ocmm = mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = ocmm-unwrapped;
    inherit opencodePackage;
  };
in
{
  inherit ocmm-lsp ocmm-unwrapped ocmm;
  default = ocmm;
}
