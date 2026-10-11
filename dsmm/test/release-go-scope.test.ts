import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute, resolve, sep } from "node:path";
import test from "node:test";

// Use the native Loader's existing parser without adding a dependency or changing the Root lock.
const require = createRequire(import.meta.url);
const preset = createRequire(require.resolve("@deepseek-ai/dsh-agent-preset-registry"));
const loader = createRequire(preset.resolve("@deepseek-ai/cordis-plugin-loader"));
const yaml = loader("js-yaml");

test("release Go/gopls configuration pins approved versions and confines source-tool writes to task-owned CI storage", () => {
  const root = mkdtempSync(join(tmpdir(), "dsmm-go-scope-test-"));
  try {
    const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/dsmm-release.yml", import.meta.url), "utf8"));
    const prepare = workflow.jobs.prepare, environment = { ...workflow.env, ...prepare.env };
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
    assert.equal(resolve(expand(setup[0].env.RUNNER_TOOL_CACHE)), join(root, "dsmm-source-go", "toolchain"));
    assert.equal(setup[0].if, "steps.context.outputs.mode == 'future'");
    const installation = prepare.steps.find((step: { run?: string }) => step.run?.includes('go install "golang.org/x/tools/gopls@${GOPLS_VERSION}"'));
    assert.ok(installation); assert.equal(installation.if, setup[0].if);
    assert.ok(prepare.steps.indexOf(installation) < prepare.steps.findIndex((step: { run?: string }) => step.run?.includes("pnpm --dir dsmm test")));
    assert.ok(installation.run.includes('test "$(go env GOVERSION)" = "go${GO_VERSION}"'));
    assert.ok(installation.run.includes('"$GOBIN/gopls" version'));
    assert.ok(installation.run.includes('test "$("$GOBIN/gopls" version)" = "golang.org/x/tools/gopls ${GOPLS_VERSION}"'));
    assert.ok(installation.run.includes('"$RUNNER_TEMP/dsmm-source-go/toolchain/"'));
    assert.ok(installation.run.includes('"$GOBIN" >> "$GITHUB_PATH"'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
