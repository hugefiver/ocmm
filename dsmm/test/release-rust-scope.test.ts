import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const preset = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const loader = createRequire(preset.resolve("@deepseek-ai/cordis-plugin-loader"));
const yaml = loader("js-yaml");

interface Step {
  name?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
  "working-directory"?: string;
}

const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
const probePaths = ["original-home", "runner", "control", "github-env", "github-path", "baseline.stdout", "baseline.stderr"];
const linkBorrowedRustup = 'ln -sT "$DSMM_BORROWED_HOME" "$HOME/.rustup"';

function withProbeCleanup(root: string, native: boolean, probe: () => void) {
  try { probe(); } finally {
    if (native) for (const path of probePaths) rmSync(join(root, path), { recursive: true, force: true });
  }
}

test("release source HOME retains the installed Rust toolchain with a task-owned Cargo cache", async (t) => {
  const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/dsmm-release.yml", import.meta.url), "utf8"));
  const prepare = workflow.jobs.prepare;
  const source: Step = prepare.steps.find((step: Step) => step.name === "Verify future source with pnpm");
  const rust: Step | undefined = prepare.steps.find((step: Step) => step.name === "Configure existing source-test Rust toolchain");
  assert.ok(source?.env);
  const image = process.env.DSMM_RUST_SCOPE_IMAGE;
  if (!image && process.platform !== "linux") {
    t.skip("requires existing Linux Rustup or an existing DSMM_RUST_SCOPE_IMAGE (never pulled)");
    return;
  }
  const borrowedHome = image ? "/usr/local/rustup" : execFileSync("rustup", ["show", "home"], {
    env: { ...process.env, RUSTUP_AUTO_INSTALL: "0" }, encoding: "utf8",
  }).trim();
  const settings = !image ? readFileSync(join(borrowedHome, "settings.toml")) : undefined;
  const root = mkdtempSync(join(process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir(), "dsmm-rust-scope-test-"));
  try {
    const runtimeRoot = image ? "/tmp/dsmm-rust-scope" : root;
    const run = (script: string, extra: Record<string, string> = {}) => {
      const env = {
        DSMM_PROBE_ROOT: runtimeRoot, DSMM_SCRIPTS: image ? "/scope/scripts" : join(root, "scripts"),
        DSMM_BORROWED_HOME: borrowedHome, ...extra,
      };
      const args = ["--noprofile", "--norc", "-e", "-o", "pipefail", `${env.DSMM_SCRIPTS}/${script}`];
      return image ? spawnSync("docker", [
        "run", "--rm", "--pull=never", "--network", "none", "--read-only", "--tmpfs", "/tmp:exec",
        "--mount", `type=bind,source=${root},target=/scope,readonly`,
        ...Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
        image, "bash", ...args,
      ], { encoding: "utf8", timeout: 120_000 }) : spawnSync("bash", args, { env: { ...process.env, ...env }, encoding: "utf8", timeout: 120_000 });
    };
    const runner = `${runtimeRoot}/runner`;
    const expand = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
      value.replace(/\$\{\{\s*(env|runner)\.(\w+)\s*\}\}/gu, (_match, context, name) => {
        const result = context === "runner" && name === "temp" ? runner : context === "env" ? workflow.env[name] : undefined;
        assert.equal(typeof result, "string", `unsupported ${context}.${name} context`);
        return result;
      }),
    ]));
    const exports = (values: Record<string, string>) => Object.entries(values).map(([key, value]) => `export ${key}=${quote(value)}`).join("\n");
    const sourceEnv = expand(source.env);
    const home = `${runner}/dsmm-source-pwsh/home`;
    const originalHome = `${runtimeRoot}/original-home`;
    const xdgDirectories = { XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data", XDG_STATE_HOME: "state" };
    const originalEnv = { HOME: originalHome, ...Object.fromEntries(Object.entries(xdgDirectories).map(([key, directory]) => [key, `${originalHome}/${directory}`])) };
    assert.equal(sourceEnv.HOME, home);
    for (const [key, directory] of Object.entries(xdgDirectories)) {
      assert.equal(sourceEnv[key], `${home}/${directory}`);
    }
    mkdirSync(join(root, "scripts"));
    // Execute the workflow's Rust shell and step environments.
    writeFileSync(join(root, "scripts", "configure.sh"), `${exports(expand(rust?.env ?? {}))}\n${rust?.run ?? ""}\n`);
    writeFileSync(join(root, "scripts", "source.sh"), `${exports(sourceEnv)}
cargo --version
test "$HOME" != "$DSMM_ORIGINAL_HOME"
test "$CARGO_HOME" = "$HOME/.cargo"
test "$RUSTUP_AUTO_INSTALL" = 0
test -x "$RUSTUP_TOOLCHAIN/bin/cargo"
test -x "$RUSTUP_TOOLCHAIN/bin/rustc"
test "$(rustup which cargo)" = "$RUSTUP_TOOLCHAIN/bin/cargo"
test "$(rustup which rustc)" = "$RUSTUP_TOOLCHAIN/bin/rustc"
rustc --version
cargo test --offline
test -d "$CARGO_HOME"
test ! -e "$DSMM_ORIGINAL_HOME/.cargo"
test -d target/debug
printf '%s\n' "DSMM_CARGO_HOME=$CARGO_HOME" "DSMM_RUSTUP_HOME=$RUSTUP_HOME" "DSMM_RUSTUP_TOOLCHAIN=$RUSTUP_TOOLCHAIN"
`);
    writeFileSync(join(root, "scripts", "probe.sh"), `${exports(expand({ ...workflow.env, ...prepare.env }))}
export RUNNER_TEMP=${quote(runner)}
export GITHUB_ENV=${quote(`${runtimeRoot}/github-env`)}
export GITHUB_PATH=${quote(`${runtimeRoot}/github-path`)}
export DSMM_ORIGINAL_HOME=${quote(originalHome)}
${exports(originalEnv)}
export CARGO_HOME="$DSMM_ORIGINAL_HOME/.cargo"
export RUSTUP_AUTO_INSTALL=0
unset RUSTUP_HOME RUSTUP_TOOLCHAIN CARGO_TARGET_DIR
mkdir -p "$HOME" "$RUNNER_TEMP" "$DSMM_PROBE_ROOT/control/src"
${linkBorrowedRustup}
if [ "$DSMM_EXPLICIT_HOME" = 1 ]; then export RUSTUP_HOME="$DSMM_BORROWED_HOME"; fi
cd "$DSMM_PROBE_ROOT/control"
printf '[package]\nname = "dsmm-rust-scope-smoke"\nversion = "0.0.0"\nedition = "2021"\n' > Cargo.toml
printf '#[test]\nfn installed_toolchain_works() { assert_eq!(2 + 2, 4); }\n' > src/lib.rs
cargo --version
rustc --version
${exports(sourceEnv)}
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"
if env -u RUSTUP_HOME -u RUSTUP_TOOLCHAIN cargo --version > "$DSMM_PROBE_ROOT/baseline.stdout" 2> "$DSMM_PROBE_ROOT/baseline.stderr"; then
  echo "fresh HOME unexpectedly found a default toolchain"; exit 1
fi
cat "$DSMM_PROBE_ROOT/baseline.stderr"
${exports(originalEnv)}
: > "$GITHUB_ENV"
: > "$GITHUB_PATH"
export RUSTUP_AUTO_INSTALL=1
if [ "$DSMM_MISSING_TOOLCHAIN" = 1 ]; then
  export RUSTUP_TOOLCHAIN=1.0.99
  if bash --noprofile --norc -e -o pipefail "$DSMM_SCRIPTS/configure.sh"; then
    echo "missing toolchain was accepted"; exit 1
  fi
  test ! -s "$GITHUB_ENV"
  test ! -e "$DSMM_BORROWED_HOME/toolchains/1.0.99-x86_64-unknown-linux-gnu"
  exit 0
fi
bash --noprofile --norc -e -o pipefail "$DSMM_SCRIPTS/configure.sh"
while IFS= read -r entry; do export "$entry"; done < "$GITHUB_ENV"
${exports(sourceEnv)}
# A separate child inherits GitHub's exported job environment and the source step's overrides.
bash --noprofile --norc -e -o pipefail "$DSMM_SCRIPTS/source.sh"
`);
    for (const [name, explicitHome, missingToolchain] of [
      ["HOME-derived Rustup store", "0", "0"],
      ["explicit RUSTUP_HOME", "1", "0"],
      ["uninstalled selection fails without installation or environment publication", "0", "1"],
    ]) {
      await t.test(name, () => withProbeCleanup(root, !image, () => {
        const result = run("probe.sh", { DSMM_EXPLICIT_HOME: explicitHome, DSMM_MISSING_TOOLCHAIN: missingToolchain });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /rustup could not choose a version of cargo/);
        if (missingToolchain === "0") {
          assert.match(result.stdout, /test result: ok\. 1 passed/);
          const published = Object.fromEntries(result.stdout.split("\n").filter((line) => line.startsWith("DSMM_")).map((line) => {
            const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
          }));
          assert.equal(published.DSMM_CARGO_HOME, `${home}/.cargo`);
          assert.equal(published.DSMM_RUSTUP_HOME, explicitHome === "1" ? borrowedHome : `${runtimeRoot}/original-home/.rustup`);
          t.diagnostic(result.stdout.trim());
        }
      }));
    }
    await t.test("native assertion failures clean up and existing Rustup targets are never followed", () => {
      const cleanupFixture = join(root, "scripts", "cleanup-failure.mjs");
      writeFileSync(cleanupFixture, `import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = ${JSON.stringify(join(root, "failure-probe"))};
const probePaths = ${JSON.stringify(probePaths)};
${withProbeCleanup.toString()}
test("native subtests", async (t) => {
  await t.test("first assertion fails", () => withProbeCleanup(root, true, () => {
    for (const path of probePaths) mkdirSync(join(root, path), { recursive: true });
    assert.fail("injected assertion failure");
  }));
  await t.test("next subtest starts clean", () => {
    for (const path of probePaths) assert.equal(existsSync(join(root, path)), false);
    withProbeCleanup(root, true, () => mkdirSync(join(root, "original-home")));
    assert.equal(existsSync(join(root, "original-home")), false);
    process.stdout.write("DSMM_NEXT_SUBTEST_CLEAN\\n");
  });
});
`);
      const failure = spawnSync(process.execPath, ["--test", cleanupFixture], {
        env: { ...process.env, NODE_TEST_CONTEXT: undefined }, encoding: "utf8", timeout: 30_000,
      });
      assert.ifError(failure.error);
      assert.equal(failure.status, 1, failure.stdout + failure.stderr);
      assert.ok(failure.stdout.includes("DSMM_NEXT_SUBTEST_CLEAN"), failure.stdout + failure.stderr);
      writeFileSync(join(root, "scripts", "link-safety.sh"), `export DSMM_BORROWED_HOME="$DSMM_PROBE_ROOT/borrowed-fixture"
mkdir -p "$DSMM_BORROWED_HOME"
printf sentinel > "$DSMM_BORROWED_HOME/sentinel"
for kind in symlink directory file dangling; do
  export HOME="$DSMM_PROBE_ROOT/existing-$kind"
  mkdir -p "$HOME"
  case "$kind" in
    directory) mkdir "$HOME/.rustup"; printf sentinel > "$HOME/.rustup/sentinel" ;;
    file) printf sentinel > "$HOME/.rustup" ;;
    symlink) ln -s "$DSMM_BORROWED_HOME" "$HOME/.rustup" ;;
    dangling) ln -s "$DSMM_PROBE_ROOT/absent" "$HOME/.rustup" ;;
  esac
  if ${linkBorrowedRustup}; then echo "existing $kind target accepted"; exit 1; fi
  test "$(ls -A "$DSMM_BORROWED_HOME")" = sentinel
  test "$(cat "$DSMM_BORROWED_HOME/sentinel")" = sentinel
  case "$kind" in
    directory) test "$(ls -A "$HOME/.rustup")" = sentinel ;;
    file) test "$(cat "$HOME/.rustup")" = sentinel ;;
    symlink) test "$(readlink "$HOME/.rustup")" = "$DSMM_BORROWED_HOME" ;;
    dangling) test "$(readlink "$HOME/.rustup")" = "$DSMM_PROBE_ROOT/absent" ;;
  esac
done
`);
      const links = run("link-safety.sh");
      assert.ifError(links.error);
      assert.equal(links.status, 0, links.stdout + links.stderr);
      t.diagnostic("assertion-failure cleanup and directory/file/live-link/dangling-link rejection verified");
    });
    assert.ok(rust?.run);
    assert.equal(rust.env?.RUSTUP_AUTO_INSTALL, "0");
    assert.equal(rust.if, source.if);
    assert.equal(rust["working-directory"], source["working-directory"]);
    assert.ok(prepare.steps.indexOf(rust) < prepare.steps.findIndex((step: Step) => step.env?.HOME));
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
    if (settings) assert.deepEqual(readFileSync(join(borrowedHome, "settings.toml")), settings);
  }
});
