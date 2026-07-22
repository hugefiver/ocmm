{
  description = "ocmm packages, modules, and checks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-bun.url = "github:NixOS/nixpkgs/7149c06513f335be57f26fcbbbe34afda923882b";
    nixpkgs-x86_64-darwin.url = "github:NixOS/nixpkgs/nixpkgs-26.05-darwin";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ self, nixpkgs, nixpkgs-bun, nixpkgs-x86_64-darwin, home-manager }:
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
      mkPkgs = system:
        let
          nixpkgsForSystem =
            if system == "x86_64-darwin" then nixpkgs-x86_64-darwin else nixpkgs;
        in import nixpkgsForSystem {
          inherit system;
          config.allowUnfreePredicate = package:
            builtins.elem (lib.getName package) allowedUnfreeNames;
          config.allowDeprecatedx86_64Darwin = system == "x86_64-darwin";
        };
      mkOpencodePackage = pkgs:
        if pkgs.stdenv.hostPlatform.isLinux then
          pkgs.opencode.override {
            bun = nixpkgs-bun.legacyPackages.${pkgs.stdenv.hostPlatform.system}.bun;
          }
        else
          pkgs.opencode;
      mkOcmmPackage = import ./nix/packages/mk-ocmm-package.nix { src = self; };
      packageSets = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          opencodePackage = mkOpencodePackage pkgs;
        in import ./nix/packages/default.nix {
          inherit pkgs mkOcmmPackage opencodePackage;
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
        let
          opencodePackage = mkOpencodePackage final;
          packages = import ./nix/packages/default.nix {
            pkgs = final;
            src = self;
            inherit mkOcmmPackage opencodePackage;
          };
        in {
          inherit (packages) ocmm-lsp ocmm-unwrapped ocmm;
        };

      lib.mkOcmmPackage = mkOcmmPackage;

      homeManagerModules = {
        ocmm = import ./nix/modules/home-manager.nix { inherit self; };
        default = self.homeManagerModules.ocmm;
      };

      nixosModules = {
        ocmm = import ./nix/modules/nixos.nix { inherit self; };
        default = self.nixosModules.ocmm;
      };

      checks = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          packageChecks = import ./nix/tests/packages.nix {
            inherit lib pkgs mkOcmmPackage;
            packages = packageSets.${system};
          };
          moduleChecks = lib.optionalAttrs (system == "x86_64-linux") (
            import ./nix/tests/modules.nix {
              inherit self nixpkgs system pkgs;
              home-manager = inputs.home-manager;
            }
          );
        in
        packageChecks
        // moduleChecks
        // {
          cross-system-evaluation = import ./nix/tests/cross-system.nix {
            inherit lib pkgs packageSets;
          };
        }
        // lib.optionalAttrs (system == "x86_64-linux") {
          nixos-vm = import ./nix/tests/nixos-vm.nix { inherit self pkgs; };
        });
    };
}
