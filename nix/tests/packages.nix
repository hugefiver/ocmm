{
  lib,
  pkgs,
  packages,
  mkOcmmPackage,
}:
let
  fakeNix = pkgs.writeShellApplication {
    name = "fake-nix-opencode";
    text = ''
      printf '%s\n' "$@" > "$OCMM_TEST_LOG"
    '';
  };
  fakeUser = pkgs.writeShellApplication {
    name = "fake-user-opencode";
    text = ''
      printf '%s\n' "$@" > "$OCMM_TEST_LOG"
    '';
  };
  custom = mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = packages.ocmm-unwrapped;
    opencodePackage = fakeNix;
  };
  conflict = builtins.tryEval ((mkOcmmPackage {
    inherit pkgs;
    ocmmPackage = packages.ocmm-unwrapped;
    opencodePackage = fakeNix;
    opencodeCommand = lib.getExe fakeUser;
  }).drvPath);
in
{
  lsp-tools-list = pkgs.runCommand "ocmm-lsp-tools-list" { nativeBuildInputs = [ pkgs.jq ]; } ''
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
      | ${lib.getExe packages.ocmm-lsp} mcp > response.json
    jq -e '.id == 1 and (.result.tools | length == 8)' response.json > /dev/null
    jq -r '.result.tools[].name' response.json | sort > names
    printf '%s\n' diagnostics find_references find_symbol_related goto_definition prepare_rename rename status symbols | sort > expected
    diff -u expected names
    touch "$out"
  '';

  launchers = pkgs.runCommand "ocmm-launchers" {
    nativeBuildInputs = [ pkgs.jq pkgs.nodejs_24 ];
  } ''
    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$TMPDIR/xdg"
    mkdir -p "$HOME" "$XDG_CONFIG_HOME"
    ${packages.ocmm-unwrapped}/bin/ocmm --help > /dev/null
    ${packages.ocmm-unwrapped}/bin/ocmm-profiles help > /dev/null
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
      | ${packages.ocmm-unwrapped}/bin/ocmm-lsp mcp > response.json
    grep -F '"id":1' response.json > /dev/null
    for entry in .agents .codex dist plugins prompts skills README.md package.json node_modules; do
      test -e "${packages.ocmm-unwrapped}/lib/ocmm/$entry"
    done
    test -d ${packages.ocmm-unwrapped}/lib/ocmm/node_modules/zod
    if find ${packages.ocmm-unwrapped}/lib/ocmm/node_modules -maxdepth 1 -name 'ocmm-lsp-*' | grep -q .; then
      echo "npm optional LSP package leaked into the Nix closure" >&2
      exit 1
    fi
    for runtime in \
      ${packages.ocmm-unwrapped}/lib/ocmm/dist \
      ${packages.ocmm-unwrapped}/lib/ocmm/plugins/deepwork/dist; do
      test -f "$runtime/cli/ocmm-lsp.js"
      test -d "$runtime/shared"
      test -L "$runtime/bin/ocmm-lsp"
      test "$(readlink "$runtime/bin/ocmm-lsp")" = ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)}
      test "$(ls -1 "$runtime/bin" | wc -l)" -eq 1
      printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
        | (cd "$(dirname "$runtime")" && node ./dist/cli/ocmm-lsp.js mcp) > plugin-response.json
      jq -e '.id == 1 and (.result.tools | length == 8)' plugin-response.json > /dev/null
    done
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)} ${packages.ocmm-unwrapped}/bin/ocmm > /dev/null
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)} ${packages.ocmm-unwrapped}/bin/ocmm-profiles > /dev/null
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm-lsp)} ${packages.ocmm-unwrapped}/bin/ocmm-lsp > /dev/null
    touch "$out"
  '';

  opencode-runtime = pkgs.runCommand "ocmm-opencode-runtime" { } ''
    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$TMPDIR/xdg-config"
    export XDG_DATA_HOME="$TMPDIR/xdg-data"
    export XDG_STATE_HOME="$TMPDIR/xdg-state"
    export XDG_CACHE_HOME="$TMPDIR/xdg-cache"
    mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME"
    actual="$(${lib.getExe packages.ocmm.opencodePackage} --version)"
    test "$actual" = ${lib.escapeShellArg packages.ocmm.opencodePackage.version}
    touch "$out"
  '';

  opencode-selection = pkgs.runCommand "ocmm-opencode-selection" { } ''
    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$TMPDIR/xdg"
    export OCMM_TEST_LOG="$TMPDIR/args"
    mkdir -p "$HOME" "$XDG_CONFIG_HOME"
    ${custom}/bin/ocmm --no-providers --no-plugins -- alpha 'two words'
    printf '%s\n' alpha 'two words' > expected
    diff -u expected "$OCMM_TEST_LOG"
    grep -F ${lib.escapeShellArg (lib.getExe fakeNix)} ${custom}/bin/ocmm > /dev/null
    OCMM_OPENCODE=${lib.escapeShellArg (lib.getExe fakeUser)} \
      ${custom}/bin/ocmm --no-providers --no-plugins -- user-env
    printf '%s\n' user-env > expected-user
    diff -u expected-user "$OCMM_TEST_LOG"
    ${custom}/bin/ocmm --opencode ${lib.escapeShellArg (lib.getExe fakeUser)} \
      --no-providers --no-plugins -- cli-source
    printf '%s\n' cli-source > expected-cli
    diff -u expected-cli "$OCMM_TEST_LOG"
    grep -F ${lib.escapeShellArg (lib.getExe packages.ocmm.opencodePackage)} ${packages.ocmm}/bin/ocmm > /dev/null
    touch "$out"
  '';

  factory-conflict = assert !conflict.success; pkgs.runCommand "ocmm-factory-conflict" { } ''
    touch "$out"
  '';
}
