import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { join, resolve } from "node:path";
// JS harnesses are test-only entrypoints, outside the emitted library program.
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { bootstrapFacade, carrierBootstrap, compositionBundle, createBootGraph } from "../scripts/profile-ui-harness-browser.mjs";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { extractNativeThemeStyles } from "../scripts/profile-ui-harness-server.mjs";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { nativeUiStartupPatch, validatedNativeStorage } from "../scripts/profile-ui-acceptance.mjs";

test("native UI startup retains runner-proved root/zstd and disables only the stock JSONL entry", () => {
  const home = resolve("owned-ui-profile");
  const nativeStorage = { root: join(home, "sessions"), compression: "zstd" };
  const auditConfig = { receipt: "owned-receipt" };
  const rows = nativeUiStartupPatch({ nativeStorage, env: { DSH_HOME: home }, auditConfig });
  assert.deepEqual(rows[0], { id: "session-persistence-jsonl", name: "@deepseek-ai/dsh-session-persistence-jsonl", disabled: true });
  assert.deepEqual(rows[1], { id: "dsmm", config: { sessionPersistence: nativeStorage, workflow: { reviewCap: 2 }, roles: { "dsmm-builder": false }, runtimeRecovery: { enabled: false } } });
  assert.equal(rows[3].insert[0].config, auditConfig);
  assert.equal(rows.filter((row: { id?: string }) => row.id === "dsmm").length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /@dsmm\/dsmm\/session-persistence|"id":"dsmm-session-persistence"/u);
  assert.notEqual(rows[1].config.sessionPersistence, nativeStorage, "patch must not retain a mutable caller config object");
});

test("UI startup rejects missing or changed baseline storage rather than inventing a path", () => {
  const home = resolve("owned-ui-profile");
  const env = { DSH_HOME: home };
  assert.throws(() => validatedNativeStorage(undefined, env), /passed by the Docker runner/u);
  assert.throws(() => validatedNativeStorage({ root: "relative", compression: "zstd" }, env), /absolute/u);
  assert.throws(() => validatedNativeStorage({ root: join(home, "other"), compression: "zstd" }, env), /differs/u);
  assert.throws(() => validatedNativeStorage({ root: join(home, "sessions"), compression: "none" }, env), /compression/u);
  assert.throws(() => validatedNativeStorage({ root: join(home, "sessions"), compression: "zstd" }, {}), /isolated DSH_HOME/u);
});

test("owned browser composition preserves native Connection, renderer and lazy DSMM module contracts", () => {
  const graph = createBootGraph([{ id: "@dsmm/dsmm", url: "/bundles/dsmm.js" }], "frozen-hash");
  assert.equal(graph.entries[0].id, "@dsmm/dsmm");
  assert.equal(graph.batches[0].entries[0], "@dsmm/dsmm");
  assert.match(compositionBundle(), /installConnection\(ctx,\{transport:\{rpc:window\.__dsmmOwnedCarrier,ownsHost:true\}\}\)/u);
  assert.match(compositionBundle(), /settings\.section/u);
  assert.match(bootstrapFacade(), /createClientModuleSystem/u);
  assert.match(carrierBootstrap(), /__dsmmNativeBridge/u);
  assert.doesNotMatch(carrierBootstrap(), /fetch\(|WebSocket\(|token=|document\.cookie|localStorage/u);
});

test("native theme extraction parses exact literals and fails closed without the native inventory", () => {
  const source = `var base_css_default = "body{font-family:system-ui}";
var design_css_default = ":root{--token:1}";
var focus_css_default = ":focus-visible{outline:2px solid black}";
var extra_css_default = "body{color:black}";
const STYLES = [["base.css", base_css_default],["design.css", design_css_default],["focus.css", focus_css_default],["extra.css", extra_css_default]];`;
  assert.equal(extractNativeThemeStyles(source), "body{font-family:system-ui}\n:root{--token:1}\n:focus-visible{outline:2px solid black}\nbody{color:black}");
  assert.throws(() => extractNativeThemeStyles("export default {}"), /inventory/u);
  assert.throws(() => extractNativeThemeStyles(source.replace("var base_css_default", "var missing")), /unavailable/u);
});

test("acceptance hook enters the real native Host after appReady and never imports the full plugin eagerly", async () => {
  const source = await readFile(new URL("../scripts/profile-ui-acceptance.mjs", import.meta.url), "utf8");
  assert.match(source, /get\("appReady"\)\.onReady/u);
  assert.match(source, /runtime = ctx\.get\("dsmmProfileRuntime"\)/u);
  assert.match(source, /peer = ctx\.get\("connection"\)\.operator/u);
  assert.match(source, /gateway\.invoke\(/u);
  assert.match(source, /browser\.newContext\(/u);
  assert.match(source, /persistence\[Symbol\.for\("dsmm\.sessionPersistence\.ignorable\.v1"\)\]/u);
  assert.match(source, /removeOwnedUiRoot/u);
  assert.doesNotMatch(source, /join\(packageRoot, "lib", "index\.js"\)/u);
  assert.doesNotMatch(source, /storageState|connectOverCDP|authenticatedUrl|authorizeIndex/u);
});
