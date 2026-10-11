import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join, relative, isAbsolute, resolve, sep } from "node:path";
import test from "node:test";

// Use the native Loader's existing parser without adding a dependency or changing the Root lock.
const require = createRequire(import.meta.url);
const preset = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const loader = createRequire(preset.resolve("@deepseek-ai/cordis-plugin-loader"));
const yaml = loader("js-yaml");

test("release Go/gopls configuration pins approved versions and confines source-tool writes to task-owned CI storage", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "dsmm-go-scope-test-"));
  try {
    const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/dsmm-release.yml", import.meta.url), "utf8"));
    const prepare = workflow.jobs.prepare;
    const paths = prepare.steps.find((step: { env?: Record<string, string> }) => step.env?.GOBIN !== undefined);
    assert.ok(paths);
    const environment = { ...workflow.env, ...prepare.env, ...paths.env };
    const expand = (value: string) => value.replace(/\$\{\{\s*(env|runner)\.(\w+)\s*\}\}/gu, (_match, context, key) => {
      const resolved = context === "runner" && key === "temp" ? root : context === "env" ? environment[key] : undefined;
      assert.equal(typeof resolved, "string"); return resolved;
    });
    assert.equal(environment.GO_VERSION, "1.27.2"); assert.equal(environment.GOPLS_VERSION, "v0.23.0");
    const directories = { GOBIN: "bin", GOPATH: "gopath", GOMODCACHE: "modules", GOCACHE: "cache", GOTMPDIR: "tmp" };
    for (const [key, directory] of Object.entries(directories)) {
      const path = resolve(expand(environment[key])), inside = relative(root, path);
      assert.ok(inside && inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside));
      assert.equal(path, join(root, "dsmm-source-go", directory));
    }
    for (const [key, expected] of [["GOENV", "off"], ["GOWORK", "off"], ["GOTOOLCHAIN", "local"]]) assert.equal(environment[key], expected);
    const setup = prepare.steps.filter((step: { uses?: string }) => step.uses?.startsWith("actions/setup-go@"));
    assert.equal(setup.length, 1);
    assert.equal(setup[0].uses, "actions/setup-go@924ae3a1cded613372ab5595356fb5720e22ba16");
    assert.equal(expand(setup[0].with["go-version"]), "1.27.2");
    assert.equal(setup[0].with["check-latest"], false); assert.equal(setup[0].with.cache, false);
    const toolcache = join(root, "dsmm-source-go", "toolchain");
    const setupEnvironment = {
      ...process.env,
      ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, expand(value as string)])),
      ...Object.fromEntries(Object.entries(setup[0].env).map(([key, value]) => [key, expand(value as string)])),
      RUNNER_TEMP: root,
      RUNNER_TOOL_CACHE: join(root, "runner-tool-cache"),
      GITHUB_ENV: join(root, "github-env"),
      GITHUB_PATH: join(root, "github-path"),
    };
    assert.equal(resolve(execFileSync(process.execPath, ["-p", "process.env.RUNNER_TOOL_CACHE"], { env: setupEnvironment, encoding: "utf8" }).trim()), toolcache);
    assert.equal(setup[0].if, "steps.context.outputs.mode == 'future'");
    assert.equal(paths.if, setup[0].if);
    assert.ok(prepare.steps.indexOf(paths) < prepare.steps.indexOf(setup[0]));
    const installation = prepare.steps.find((step: { run?: string }) => step.run?.includes('go install "golang.org/x/tools/gopls@${GOPLS_VERSION}"'));
    assert.ok(installation); assert.equal(installation.if, setup[0].if);
    assert.ok(prepare.steps.indexOf(installation) < prepare.steps.findIndex((step: { run?: string }) => step.run?.includes("pnpm --dir dsmm test")));
    assert.ok(installation.run.includes('test "$(go env GOVERSION)" = "go${GO_VERSION}"'));
    assert.ok(installation.run.includes('"$GOBIN/gopls" version'));
    assert.ok(installation.run.includes('test "$("$GOBIN/gopls" version)" = "golang.org/x/tools/gopls ${GOPLS_VERSION}"'));
    assert.ok(installation.run.includes('"$RUNNER_TEMP/dsmm-source-go/toolchain/"'));
    assert.ok(installation.run.includes('"$GOBIN" >> "$GITHUB_PATH"'));
    await t.test("all Go directories exist before setup-go starts", { skip: process.platform !== "linux" }, () => {
      writeFileSync(setupEnvironment.GITHUB_ENV, "");
      writeFileSync(setupEnvironment.GITHUB_PATH, "");
      execFileSync("bash", ["-e", "-o", "pipefail", "-c", paths.run], { env: setupEnvironment });
      for (const key of Object.keys(directories)) {
        const path = expand(environment[key]);
        assert.ok(statSync(path).isDirectory(), `${key} must exist before setup-go`);
        assert.ok(readFileSync(setupEnvironment.GITHUB_ENV, "utf8").split("\n").includes(`${key}=${path}`));
      }
      assert.ok(statSync(toolcache).isDirectory());
    });
    await t.test("official setup-go bundle installs the real pinned toolchain under task-owned storage", { skip: process.platform !== "linux" || !process.env.DSMM_SETUP_GO_ACTION }, () => {
      execFileSync(process.execPath, [process.env.DSMM_SETUP_GO_ACTION!], {
        env: { ...setupEnvironment, "INPUT_GO-VERSION": expand(setup[0].with["go-version"]), "INPUT_CHECK-LATEST": "false", INPUT_CACHE: "false" },
        stdio: "inherit",
      });
      const env = { ...setupEnvironment, PATH: [...readFileSync(setupEnvironment.GITHUB_PATH, "utf8").trim().split("\n"), process.env.PATH].join(delimiter) };
      assert.equal(execFileSync("go", ["env", "GOVERSION"], { env, encoding: "utf8" }).trim(), `go${environment.GO_VERSION}`);
      assert.equal(execFileSync("go", ["env", "GOROOT"], { env, encoding: "utf8" }).trim(), join(toolcache, "go", environment.GO_VERSION, process.arch));
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
