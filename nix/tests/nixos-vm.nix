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
