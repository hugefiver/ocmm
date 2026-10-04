import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
// JS harnesses are test-only entrypoints, outside the emitted library program.
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { bootstrapFacade, carrierBootstrap, compositionBundle, createBootGraph, nativeClientPreflight } from "../scripts/profile-ui-harness-browser.mjs";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { extractNativeThemeStyles, NATIVE_IDS } from "../scripts/profile-ui-harness-server.mjs";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { acceptanceChromium, nativeUiStartupPatch, validatedNativeStorage, NATIVE_STREAM_ENDPOINTS } from "../scripts/profile-ui-acceptance.mjs";

test("acceptance tools load the real required CommonJS face when no synthetic chromium export exists", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "dsmm-playwright-interop-"));
  try {
    const packageRoot = join(temporaryRoot, "node_modules", "playwright");
    await mkdir(packageRoot, { recursive: true });
    const toolsManifest = join(temporaryRoot, "package.json");
    await writeFile(toolsManifest, '{"private":true}\n');
    await writeFile(join(packageRoot, "package.json"), '{"name":"playwright","type":"commonjs","main":"index.js"}\n');
    await writeFile(join(packageRoot, "index.js"), 'const api = { chromium: { launch() { return "required-face"; } } }; module.exports = api;\n');
    const toolsRequire = createRequire(toolsManifest);
    const namespace = await import(pathToFileURL(toolsRequire.resolve("playwright")).href);
    assert.equal(namespace.chromium, undefined, "fixture must reproduce Playwright's indirect CommonJS export shape");
    const chromium = await acceptanceChromium(toolsManifest);
    assert.equal(chromium.launch(), "required-face");
    assert.equal(chromium, toolsRequire("playwright").chromium, "loader must use the actual required API, not reconstruct a browser face");
  } finally { await rm(temporaryRoot, { recursive: true, force: false }); }
});

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

test("native browser Gateway boots with its real Typert registry provider", () => {
  assert.ok(NATIVE_IDS.includes("@deepseek-ai/dsh-typert-registry"), "native client Gateway requires the real typert service before it can activate");
  assert.equal(new Set(NATIVE_IDS).size, NATIVE_IDS.length, "native client providers must materialize once");
});

test("native root renderer receives the real optional Session scope provider and its complete closure", () => {
  for (const id of ["@deepseek-ai/dsh-api-remotes", "@deepseek-ai/dsh-client-file-upload", "@deepseek-ai/dsh-api-session-controller", "@deepseek-ai/dsh-client-ui-session"]) {
    assert.ok(NATIVE_IDS.includes(id), `native session-maybe rendering requires the real provider closure: ${id}`);
  }
  assert.doesNotMatch(compositionBundle(), /installScope\(|provide\(['"](?:sessions|uiSession)['"]/u, "the harness must not synthesize a replacement Session provider or adapter");
});

test("owned native carrier admits the genuine Session observer without broadening stream endpoints", () => {
  assert.deepEqual(NATIVE_STREAM_ENDPOINTS, ["$events", "session/control"]);
  assert.doesNotMatch(carrierBootstrap(), /const id='(?:call|stream)-'/u, "reloads must not reuse an outstanding native stream identity");
});

test("native client preflight reports all actual service requirements and public startup errors", async () => {
  const startupError = new Error("native client causal failure");
  let failedAwaitCalls = 0;
  const activeFiber = { name: "native-provider", state: 2, await() { throw new Error("must not re-await active plugins"); } };
  const failedFiber = { name: "dsmm-client", state: 3, async await() { failedAwaitCalls += 1; throw startupError; } };
  const providers = { [Symbol("slots")]: { name: "slots", fiber: activeFiber } };
  const loader = { entries: () => [
    { id: "native", options: { name: "native" }, fiber: activeFiber },
    { id: "dsmm", options: { name: "@dsmm/dsmm" }, fiber: failedFiber },
  ] };
  const root = { reflect: { store: providers }, get(name: string) { return name === "loader" ? loader : name === "slots" ? {} : undefined; } };
  const modules = { manifest: { plugins: [{ id: "native", inject: [] }, { id: "@dsmm/dsmm", inject: ["native"] }] },
    loadCache: new Map([["native", { exports: { inject: ["slots"] } }], ["@dsmm/dsmm", { exports: { inject: { locale: null, remote: null } } }]]),
    entries: { state: { getSnapshot: () => ({ syncing: false, failures: [] }) } }, importError: () => undefined };
  const report = await nativeClientPreflight({ __dsmmNativeModules: modules, __dsmmUiContext: { root } });
  assert.deepEqual(report.missingServices, [{ id: "@dsmm/dsmm", service: "locale" }, { id: "@dsmm/dsmm", service: "remote" }]);
  assert.deepEqual(report.pluginGraph[1].requiredServices, ["locale", "remote"], "package graph edges are not service aliases");
  assert.deepEqual(report.providers, [{ service: "slots", provider: "native-provider", state: 2 }]);
  assert.equal(report.entries[1].startupError.message, startupError.message);
  assert.match(report.entries[1].startupError.stack, /native client causal failure/u);
  assert.equal(failedAwaitCalls, 1);
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
  assert.match(source, /getByRole\("heading", \{ name: "Deepwork Profiles", exact: true \}\)/u);
  assert.match(source, /persistence\[Symbol\.for\("dsmm\.sessionPersistence\.ignorable\.v1"\)\]/u);
  assert.match(source, /removeOwnedUiRoot/u);
  assert.doesNotMatch(source, /join\(packageRoot, "lib", "index\.js"\)/u);
  assert.doesNotMatch(source, /storageState|connectOverCDP|authenticatedUrl|authorizeIndex/u);
});
