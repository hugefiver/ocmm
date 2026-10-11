import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const preset = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const loader = createRequire(preset.resolve("@deepseek-ai/cordis-plugin-loader"));
const yaml = loader("js-yaml");

interface Step {
  name?: string;
  env?: Record<string, string>;
  run?: string;
}

interface Probe {
  env: Record<string, string>;
  jobEnv: Record<string, string>;
  enable: Step & { run: string };
  source: Step;
  version: string;
}

// Run the workflow shell unchanged; only Corepack's shim destination and offline seed are test-owned.
async function probeWorkflow(config: Probe) {
  const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { execFileSync, spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const root = process.env.DSMM_PROBE_ROOT!;
  const control = process.env.DSMM_PROBE_CONTROL!;
  const seed = process.env.DSMM_PROBE_SEED ?? path.join(root, "seed");
  const runner = path.join(root, "runner");
  const bin = path.join(root, "bin");
  const originalHome = path.join(root, "original-home");
  const githubEnv = path.join(root, "github-env");
  for (const directory of [runner, bin, originalHome]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(githubEnv, "");
  const expand = (values: Record<string, string>, runnerAvailable = true) => Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.replace(/\$\{\{\s*(env|runner)\.(\w+)\s*\}\}/gu, (_match, context, name) => {
      const result = context === "runner" && runnerAvailable && name === "temp" ? runner : context === "env" ? config.env[name] : undefined;
      assert.equal(typeof result, "string", `unsupported ${context}.${name} context`);
      return result!;
    })]),
  );
  const corepack = execFileSync("bash", ["-c", "command -v corepack"], { encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(bin, "corepack"), `#!/bin/sh
if [ "$1" = enable ]; then
  exec "$DSMM_PROBE_COREPACK" "$@" --install-directory "$DSMM_PROBE_BIN"
fi
if [ "$1" = prepare ]; then
  cache="\${COREPACK_HOME:-$XDG_CACHE_HOME/node/corepack}"
  mkdir -p "$cache/v1/pnpm"
  cp -R "$DSMM_PROBE_SEED" "$cache/v1/pnpm/${config.version}"
fi
exec "$DSMM_PROBE_COREPACK" "$@"
`, { mode: 0o700 });
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    ...config.env,
    ...expand(config.jobEnv, false),
    HOME: originalHome,
    XDG_CONFIG_HOME: path.join(originalHome, "config"),
    XDG_CACHE_HOME: path.join(originalHome, "cache"),
    XDG_DATA_HOME: path.join(originalHome, "data"),
    XDG_STATE_HOME: path.join(originalHome, "state"),
    RUNNER_TEMP: runner,
    GITHUB_ENV: githubEnv,
    PATH: `${bin}:${process.env.PATH}`,
    DSMM_PROBE_COREPACK: corepack,
    DSMM_PROBE_BIN: bin,
    DSMM_PROBE_SEED: seed,
    COREPACK_ENABLE_NETWORK: "0",
  };
  delete base.COREPACK_HOME;
  delete base.COREPACK_DEFAULT_TO_LATEST;
  const enabled: NodeJS.ProcessEnv = { ...base, ...expand(config.enable.env ?? {}) };
  const activation = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", config.enable.run], { env: enabled, encoding: "utf8" });
  assert.equal(activation.status, 0, activation.stdout + activation.stderr);
  const exported = Object.fromEntries(fs.readFileSync(githubEnv, "utf8").trim().split("\n").filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    assert.ok(index > 0);
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  const source: NodeJS.ProcessEnv = { ...base, ...exported, ...expand(config.source.env ?? {}) };
  delete source.COREPACK_ENABLE_NETWORK;
  for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]) fs.mkdirSync(source[key]!, { recursive: true });
  fs.cpSync(seed, path.join(source.XDG_CACHE_HOME!, "node/corepack/v1/pnpm", config.version), { recursive: true });
  process.chdir(control);
  const support = await import(pathToFileURL(path.join(control, "src/release-completion-test-support.test.ts")).href);
  const fixture = path.join(root, "package-script-smoke");
  fs.mkdirSync(path.join(fixture, "crates/ocmm-lsp"), { recursive: true });
  const product = JSON.parse(fs.readFileSync(path.join(control, "package.json"), "utf8"));
  support.writeJson(path.join(fixture, "package.json"), {
    name: "ocmm-release-cli-smoke", version: "0.6.6", type: "module",
    scripts: { "check:release-completion": product.scripts["check:release-completion"] },
    ocmm: { lspVersion: "0.3.2" },
  });
  fs.writeFileSync(path.join(fixture, "crates/ocmm-lsp/Cargo.toml"), '[package]\nname = "ocmm-lsp"\nversion = "0.3.2"\n');
  support.copyReleaseCheckerPackageFiles(fixture);
  const assets = support.writeValidStagedAssets(fixture, "v0.6.6");
  const preload = path.join(fixture, "network-denied.mjs");
  fs.writeFileSync(preload, 'globalThis.fetch = async () => { throw new Error("network-denied-sentinel") }\n');
  const smokeEnv = { ...source, GITHUB_TOKEN: "github-token-secret-sentinel", NODE_OPTIONS: [source.NODE_OPTIONS, `--import=${pathToFileURL(preload).href}`].filter(Boolean).join(" ") };
  const staged = support.runPackageScript(fixture, ["--mode", "staged", "--tag", "v0.6.6", "--assets-dir", assets], smokeEnv);
  const invalid = support.runPackageScript(fixture, ["--mode", "remote", "--repository", "invalid", "--tag", "v1.2.3"], smokeEnv);
  process.stdout.write(JSON.stringify({
    activation: { home: enabled.HOME, corepackHome: enabled.COREPACK_HOME, exported },
    source: Object.fromEntries(["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "COREPACK_HOME"].map((key) => [key, source[key]])),
    lastKnownGood: enabled.COREPACK_HOME ? JSON.parse(fs.readFileSync(path.join(enabled.COREPACK_HOME, "lastKnownGood.json"), "utf8")) : null,
    staged, invalid,
  }) + "\n");
}

test("release pnpm activation remains task-owned across the isolated source HOME and offline package-script smoke", (t) => {
  const control = fileURLToPath(new URL("../../", import.meta.url));
  const workflow = yaml.load(readFileSync(join(control, ".github/workflows/dsmm-release.yml"), "utf8"));
  const prepare = workflow.jobs.prepare;
  const enable = prepare.steps.find((step: Step) => step.name === "Enable pinned pnpm");
  const source = prepare.steps.find((step: Step) => step.name === "Verify future source with pnpm");
  assert.ok(enable?.run); assert.ok(source);
  assert.ok(prepare.steps.indexOf(enable) < prepare.steps.indexOf(source));
  const version = workflow.env.PNPM_VERSION;
  assert.equal(version, "11.9.0");
  const cli = process.env.DSMM_PNPM_SCOPE_CLI ?? process.env.npm_execpath;
  const image = process.env.DSMM_PNPM_SCOPE_IMAGE;
  if (!cli || (process.platform !== "linux" && !image)) {
    t.skip("requires an existing pnpm CLI and Linux, or DSMM_PNPM_SCOPE_CLI plus an existing DSMM_PNPM_SCOPE_IMAGE");
    return;
  }
  const packageRoot = dirname(dirname(resolve(cli)));
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.version, version);
  const root = mkdtempSync(join(tmpdir(), "dsmm-pnpm-scope-test-"));
  try {
    const seed = join(root, "seed");
    mkdirSync(seed);
    for (const entry of ["package.json", "bin", "dist"]) {
      if (existsSync(join(packageRoot, entry))) cpSync(join(packageRoot, entry), join(seed, entry), { recursive: true });
    }
    const cachedMetadata = join(packageRoot, ".corepack");
    const metadata = existsSync(cachedMetadata) ? JSON.parse(readFileSync(cachedMetadata, "utf8")) : {
      locator: { name: "pnpm", reference: version },
      bin: { pnpm: relative(packageRoot, cli).replaceAll("\\", "/") },
      hash: "sha512",
    };
    writeFileSync(join(seed, ".corepack"), JSON.stringify(metadata));
    const config: Probe = { env: workflow.env, jobEnv: prepare.env, enable, source, version };
    const script = join(root, "probe.mjs");
    writeFileSync(script, `await (${probeWorkflow.toString()})(${JSON.stringify(config)});\n`);
    const result = image
      ? spawnSync("docker", ["run", "--rm", "--pull=never", "--network=none", "--mount", `type=bind,source=${root},target=/scope,readonly`, "--mount", `type=bind,source=${control},target=/control,readonly`, "--env", "DSMM_PROBE_ROOT=/tmp/dsmm-pnpm-scope", "--env", "DSMM_PROBE_SEED=/scope/seed", "--env", "DSMM_PROBE_CONTROL=/control", image, "node", "--experimental-strip-types", "/scope/probe.mjs"], { encoding: "utf8", timeout: 120_000 })
      : spawnSync(process.execPath, ["--experimental-strip-types", script], { env: { ...process.env, DSMM_PROBE_ROOT: root, DSMM_PROBE_CONTROL: control }, encoding: "utf8", timeout: 120_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.staged.status, 0, receipt.staged.stdout + receipt.staged.stderr);
    assert.equal(receipt.staged.stderr, "");
    assert.equal(receipt.invalid.status, 1, receipt.invalid.stdout + receipt.invalid.stderr);
    for (const [execution, outcome] of [[receipt.staged, "COMPLETED"], [receipt.invalid, "FAILED"]] as const) {
      const value = JSON.parse(execution.stdout);
      assert.equal(execution.stdout, `${JSON.stringify(value, null, 2)}\n`);
      assert.equal(value.schemaVersion, 1); assert.equal(value.outcome, outcome);
      for (const sentinel of ["github-token-secret-sentinel", "network-denied-sentinel"]) {
        assert.equal((execution.stdout + execution.stderr).includes(sentinel), false);
      }
    }
    const staged = JSON.parse(receipt.staged.stdout);
    assert.equal(staged.repository, "local"); assert.equal(staged.lane, "ocmm");
    assert.equal(staged.tag, "v0.6.6"); assert.equal(staged.version, "0.6.6");
    assert.equal(Number.isFinite(Date.parse(staged.checkedAt)), true);
    const runtimeRoot = image ? "/tmp/dsmm-pnpm-scope" : root;
    const cache = `${runtimeRoot}/runner/dsmm-source-pnpm/corepack`;
    assert.equal(receipt.activation.corepackHome, cache);
    assert.equal(receipt.activation.exported.COREPACK_HOME, cache);
    assert.equal(receipt.source.COREPACK_HOME, cache);
    assert.equal(receipt.lastKnownGood.pnpm.split("+")[0], version);
    assert.notEqual(receipt.activation.home, receipt.source.HOME);
    const home = `${runtimeRoot}/runner/dsmm-source-pwsh/home`;
    assert.equal(receipt.source.HOME, home);
    for (const [key, directory] of Object.entries({ XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data", XDG_STATE_HOME: "state" })) assert.equal(receipt.source[key], `${home}/${directory}`);
    t.diagnostic(JSON.stringify({ pnpm: version, corepackHome: cache, staged: staged.outcome, invalidArguments: JSON.parse(receipt.invalid.stdout).outcome }));
  } finally {
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});
