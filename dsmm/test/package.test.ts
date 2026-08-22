import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("package manifest exposes dsh bundle metadata", () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsmm");
  assert.equal(pkg.main, "./lib/index.js");
  assert.equal(pkg.types, "./lib/index.d.ts");
  assert.deepEqual(pkg.dsh, { bundle: { patch: "./cordis.patch.yml" } });
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

test("source includes the deepwork session event augmentation", () => {
  const declarations = readFileSync(join(packageRoot, "src", "dsh-events.ts"), "utf8");
  const entrypoint = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

  assert.match(declarations, /deepwork\/mode/);
  assert.match(entrypoint, /dsh-events\.js/);
});
