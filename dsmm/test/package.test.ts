import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("package manifest exposes dsh bundle metadata", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsmm");
  assert.equal(pkg.main, "./lib/index.js");
  assert.equal(pkg.types, "./lib/index.d.ts");
  assert.deepEqual(pkg.exports["./preset-skills"], {
    types: "./lib/preset-skills.d.ts",
    default: "./lib/preset-skills.js"
  });
  assert.ok(pkg.files.includes("docs/agent-presets.md"));
  assert.ok(pkg.files.includes("docs/design.md"));
  assert.ok(pkg.files.includes("docs/implementation-plan-v*.md"));
  assert.ok(pkg.files.includes("docs/lsp.md"));
  assert.ok(pkg.files.includes("docs/research"));
  assert.ok(pkg.files.includes("docs/roadmap.md"));
  assert.ok(pkg.files.includes("docs/safety-guards.md"));
  assert.ok(pkg.files.includes("docs/skill-sync.md"));
  assert.equal(pkg.files.includes("docs"), false);
  assert.ok(pkg.files.includes("patches"));
  assert.equal(pkg.scripts["smoke:docker:build"], "docker build --build-arg DSH_PACKAGE=@deepseek-ai/dsh@0.1.1-rc.2 -f docker/Dockerfile.smoke -t dsmm-dsh-smoke:0.1 ..");

  for (const packageSection of [pkg.peerDependencies, pkg.devDependencies]) {
    assert.equal(packageSection["@deepseek-ai/cordis"], "^4.0.1");
    for (const name of ["attachment", "brand", "invariants", "llm", "timeout"]) {
      assert.equal(packageSection[`@deepseek-ai/dsh-${name}`], "^0.1.1-rc.2");
    }
  }

  assert.deepEqual(pkg.dsh, { bundle: { patch: "./cordis.patch.yml" } });
});

test("README local documentation links are shipped by the package", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
  const localDocs = [...new Set([...readme.matchAll(/\[[^\]]+\]\((docs\/[^)#]+)\)/gu)].map((match) => match[1]))];

  assert.deepEqual(localDocs, ["docs/agent-presets.md", "docs/safety-guards.md", "docs/lsp.md"]);
  for (const path of localDocs) {
    assert.ok(pkg.files.includes(path), `${path} is included in package files`);
    assert.equal(existsSync(join(packageRoot, path)), true, `${path} exists`);
  }
});

test("source entry exports a dsh plugin function and config schema", async () => {
  const mod = await import("../lib/index.js");
  assert.equal(mod.name, "dsmm");
  assert.deepEqual(mod.inject, ["systemPrompt"]);
  assert.equal(typeof mod.Config, "function");
  assert.equal(typeof mod.Config.toJSON, "function");
  assert.equal(typeof mod.apply, "function");
  assert.equal(mod.default, mod.apply);
});

test("preset-scoped skill plugin source entry exposes its Cordis contract", async () => {
  const mod = await import("../lib/preset-skills.js");

  assert.equal(mod.name, "dsmm/preset-skills");
  assert.deepEqual(mod.inject, ["skills"]);
  assert.equal(typeof mod.Config, "function");
  assert.equal(typeof mod.apply, "function");
  assert.equal(mod.default, mod.apply);
});

test("source includes the deepwork session event augmentation", () => {
  const declarations = readFileSync(join(packageRoot, "src", "dsh-events.ts"), "utf8");
  const entrypoint = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

  assert.match(declarations, /deepwork\/mode/);
  assert.match(entrypoint, /dsh-events\.js/);
});
