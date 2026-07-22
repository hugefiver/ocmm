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
        fileSystems."/".device = "none";
        fileSystems."/".fsType = "tmpfs";
        boot.loader.grub.devices = [ "nodev" ];
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
