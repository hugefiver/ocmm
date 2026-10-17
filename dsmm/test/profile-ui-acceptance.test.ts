import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import test from "node:test";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import type { SubagentActivation } from "@deepseek-ai/dsh-subagent";
import type { DshAgent } from "../lib/dsh-types.js";
import { createProfileRuntime, DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { ProfileStore } from "../lib/profile-store.js";
import { resolveConfig } from "../lib/settings.js";
import { headerRoutes, nativeRoutingFixture } from "./native-routing-fixture.ts";
// JS harnesses are test-only entrypoints, outside the emitted library program.
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { bootstrapFacade, carrierBootstrap, compositionBundle, createBootGraph, nativeClientPreflight } from "../scripts/profile-ui-harness-browser.mjs";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { extractNativeThemeStyles, NATIVE_IDS, resolveNativeClientBundle } from "../scripts/profile-ui-harness-server.mjs";
// @ts-expect-error JavaScript acceptance hooks deliberately have no declarations.
import { nativeUiStartupPatch, readColdProfileSettings, startSuccessorReviewer, validatedNativeStorage, validatedProfileStorage, NATIVE_STREAM_ENDPOINTS } from "../scripts/profile-ui-acceptance.mjs";

const structural = (agent: Agent) => agent as unknown as DshAgent;

test("cold UI reads release native listeners before old-child/apply/new-reviewer admission", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, workflow: { reviewCap: 2 } });
  const runs: SubagentActivation[] = [];
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as unknown as DsmmProfileRuntime;
    const saved = await runtime.save({ id: "cold-ui", expectedRevision: null, content: JSON.stringify({ version: 1, id: "cold-ui", settings: { workflow: { reviewCap: 7 } } }) });
    await runtime.select({ id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const parent = await f.create();
    const before = runtime.admission(structural(parent));
    await runtime.save({ id: saved.id, expectedRevision: saved.revision, content: JSON.stringify({ version: 1, id: saved.id, settings: { workflow: { reviewCap: 9 } } }) });
    for (let index = 0; index < 2; index += 1) {
      const settings = await readColdProfileSettings(f.ctx, createProfileRuntime, resolveConfig({ workflow: { reviewCap: 2 } }), runtime.admission().deployment);
      assert.equal(settings.workflow.reviewCap, 7, "cold read must reopen the pinned disk revision, not the latest draft or baseline");
      assert.notEqual(settings, runtime.getSettings());
      assert.ok(Object.isFrozen(settings) && Object.isFrozen(settings.workflow));
    }
    const oldChild = await startSuccessorReviewer(f.ctx, parent, runs);
    const oldAdmission = runtime.admission(structural(oldChild));
    assert.equal(f.agents.isOwnedBy(oldChild.id, parent), true);
    assert.equal(oldAdmission.epoch, before.epoch);
    assert.equal(oldAdmission.childCapture!.parentSessionId, parent.id);
    assert.equal(oldAdmission.childCapture!.originalAdmissionEpoch, before.epoch);
    assert.equal((await runs[0]!.result).stopReason, "completed");
    assert.equal(f.agents.get(oldChild.id), undefined);
    assert.equal(f.agents.isOwnedBy(oldChild.id, parent), false);
    const reviewerRoute = { provider: "fixture", model: "ui-admitted-reviewer", reasoningEffort: "max" };
    const sessionProfile = await runtime.save({ id: "ui-session", expectedRevision: null, content: JSON.stringify({ version: 1, id: "ui-session", settings: {
      defaultActive: true, workflow: { reviewCap: 6 }, roleRouting: { "dsmm-reviewer": { primary: reviewerRoute } },
    } }) });
    const snapshot = await runtime.getSession(structural(parent));
    const applied = await runtime.selectSession({ sessionId: parent.id, id: sessionProfile.id, expectedRevision: sessionProfile.revision,
      expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch }, structural(parent));
    const newChild: Agent = await startSuccessorReviewer(f.ctx, parent, runs);
    const after = runtime.admission(structural(parent));
    assert.equal(after.epoch, applied.admissionEpoch);
    assert.notEqual(after.epoch, before.epoch);
    assert.equal(runtime.admission(structural(oldChild)), oldAdmission);
    const newAdmission = runtime.admission(structural(newChild));
    assert.equal(newAdmission.epoch, after.epoch);
    assert.equal(newAdmission.childCapture!.parentSessionId, parent.id);
    assert.equal(newAdmission.childCapture!.originalAdmissionEpoch, after.epoch);
    assert.equal(f.agents.get(newChild.id), newChild);
    assert.equal(f.agents.isOwnedBy(newChild.id, parent), true);
    assert.equal(foldSubagentDescriptor(newChild.session.snapshotEvents().slice(newChild.session.inheritedEventCount))!.provider, "dsmm-role-reviewer");
    const tools = newChild.ctx.get("tools")!;
    assert.equal(newAdmission.childCapture!.authorityCeiling.readOnly, true);
    for (const name of ["write", "edit", "bash", "pwsh"]) {
      assert.equal((await tools.execute({ callId: ToolCallId(`ui-read-only-${name}`), name, arguments: {}, agent: newChild, signal: new AbortController().signal })).isError, true);
    }
    assert.equal(f.agents.get(newChild.id), newChild);
    assert.equal(f.agents.isOwnedBy(newChild.id, parent), true);
    assert.equal((await runs[1]!.result).stopReason, "completed");
    assert.deepEqual(headerRoutes(newChild), [reviewerRoute]);
    assert.deepEqual(f.adapter.calls.map(({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort })), [
      { provider: "fixture", model: "native-default", reasoningEffort: "low" }, reviewerRoute,
    ]);
    assert.equal(f.agents.get(newChild.id), undefined);
    assert.equal(f.agents.isOwnedBy(newChild.id, parent), false);
    await runs[1]!.dispose();
    assert.equal(f.agents.get(newChild.id), undefined);
    assert.equal(f.agents.isOwnedBy(newChild.id, parent), false);
  } finally { for (const run of runs.reverse()) await run.dispose(); await f.dispose(); }
});

test("failed cold UI plugin startup releases native listeners before subsequent child creation", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  const runs: SubagentActivation[] = [];
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as unknown as DsmmProfileRuntime;
    const parent = await f.create();
    const failure = new Error("cold reader plugin startup failure");
    let released = false;
    const failingReader: typeof createProfileRuntime = async (readerCtx, baseline, options) => {
      readerCtx.effect!(() => async () => { await Promise.resolve(); released = true; });
      await createProfileRuntime(readerCtx, baseline, options);
      throw failure;
    };
    await assert.rejects(readColdProfileSettings(f.ctx, failingReader, resolveConfig(), runtime.admission().deployment), (error: unknown) => error === failure);
    assert.equal(released, true, "failed reader cleanup must be awaited before returning");
    const child = await startSuccessorReviewer(f.ctx, parent, runs);
    assert.equal(f.agents.isOwnedBy(child.id, parent), true);
    const admission = runtime.admission(structural(child));
    assert.equal(admission.epoch, runtime.admission(structural(parent)).epoch);
    assert.equal(admission.childCapture!.parentSessionId, parent.id);
    assert.equal(admission.childCapture!.originalAdmissionEpoch, runtime.admission(structural(parent)).epoch);
    assert.equal((await runs[0]!.result).stopReason, "completed");
    assert.equal(f.agents.get(child.id), undefined);
    assert.equal(f.agents.isOwnedBy(child.id, parent), false);
  } finally { for (const run of runs.reverse()) await run.dispose(); await f.dispose(); }
});

test("a refused native reviewer result retains its real run disposer for acceptance cleanup", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  const runs: SubagentActivation[] = [];
  try {
    const parent = await f.create();
    f.adapter.failModels.add("native-default");
    const child = await startSuccessorReviewer(f.ctx, parent, runs);
    assert.equal(runs.length, 1);
    assert.equal(f.agents.get(runs[0]!.childId), child);
    assert.equal(f.agents.isOwnedBy(child.id, parent), true);
    assert.notEqual((await runs[0]!.result).stopReason, "completed");
    assert.equal(f.agents.get(child.id), undefined);
    assert.equal(f.agents.isOwnedBy(child.id, parent), false);
    await runs[0]!.dispose();
    assert.equal(f.agents.get(child.id), undefined);
    assert.equal(f.agents.isOwnedBy(child.id, parent), false);
  } finally { for (const run of runs.reverse()) await run.dispose(); await f.dispose(); }
});

test("UI storage uses shared native documents and entry-scoped selection and session files", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "dsmm-ui-storage-")));
  try {
    const hostProfileDir = join(home, "profiles", "owned");
    await mkdir(hostProfileDir, { recursive: true });
    const options = { env: { DSH_HOME: home }, hostProfileDir, entryId: "actual-dsmm-owner", version: "0.2.0" };
    const store = ProfileStore.fromCentral(home, hostProfileDir, options.entryId, { lockTimeoutMs: 0 });
    const other = ProfileStore.fromCentral(home, hostProfileDir, "other-entry");
    const content = '{"version":1,"id":"owned","settings":{"defaultActive":true}}\n';
    const saved = await store.save({ id: "owned", content, expectedRevision: null });
    await store.select({ id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: "absent" });
    await other.select({ id: null, expectedSelectionRevision: "absent" });
    const storage = await validatedProfileStorage(store, options);
    const otherStorage = await validatedProfileStorage(other, { ...options, entryId: "other-entry" });
    assert.equal(storage.profileDir, otherStorage.profileDir);
    assert.notEqual(storage.stateDir, otherStorage.stateDir);
    assert.equal(storage.profileDir, store.profileDir);
    assert.equal(storage.stateDir, store.stateDir);
    assert.equal(await readFile(join(storage.profileDir, "owned.jsonc"), "utf8"), content);
    assert.equal(JSON.parse(await readFile(storage.pointerPath, "utf8")).id, saved.id);
    assert.equal(JSON.parse(await readFile(otherStorage.pointerPath, "utf8")).id, null);
    const sessionId = "owned-session", epoch = "e".repeat(64);
    await store.selectSession({ sessionId, id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: "absent", expectedAdmissionEpoch: epoch }, epoch,
      () => undefined, { assertCurrent() {}, committed() {} });
    const sidecar = join(storage.stateDir, ".sessions", `${createHash("sha256").update(sessionId).digest("hex")}.json`);
    assert.equal(JSON.parse(await readFile(sidecar, "utf8")).epoch, epoch);
    assert.equal((await other.loadSessionSelection(sessionId)).admissionEpoch, null);
    const pointerBefore = await readFile(storage.pointerPath);
    const lockOwner = "owned-ui-write-refusal\n";
    await writeFile(storage.lockPath, lockOwner, { flag: "wx" });
    try {
      assert.equal((await store.read(saved.id)).content, content);
      assert.equal((await store.loadSelection()).appliedRevision, saved.revision);
      await assert.rejects(store.save({ id: saved.id, content, expectedRevision: saved.revision }), { code: "lock-timeout" });
      assert.equal(await readFile(storage.lockPath, "utf8"), lockOwner);
      assert.deepEqual(await readFile(storage.pointerPath), pointerBefore);
      assert.equal(await readFile(join(storage.profileDir, "owned.jsonc"), "utf8"), content);
    } finally { await unlink(storage.lockPath); }
    await mkdir(storage.lockPath);
    try {
      await assert.rejects(store.save({ id: saved.id, content, expectedRevision: saved.revision }), { code: "unsafe-path" });
      assert.equal(await readFile(join(storage.profileDir, "owned.jsonc"), "utf8"), content);
    } finally { await rmdir(storage.lockPath); }
  } finally { await rm(home, { recursive: true, force: false }); }
});

test("UI storage validation rejects foreign identity, unknown origin and redirected owned paths", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "dsmm-ui-storage-boundary-")));
  try {
    const hostProfileDir = join(home, "profiles", "owned");
    await mkdir(hostProfileDir, { recursive: true });
    const options = { env: { DSH_HOME: home }, hostProfileDir, entryId: "actual-entry", version: "0.2.0" };
    const store = ProfileStore.fromCentral(home, hostProfileDir, options.entryId);
    await store.select({ id: null, expectedSelectionRevision: "absent" });
    await validatedProfileStorage(store, options);
    for (const candidate of [
      { ...store, origin: "unknown" },
      { ...store, profileDir: join(home, "..", "foreign-profiles") },
      { ...store, profileDir: join(home, "plugins", "foreign", "profiles") },
      { ...store, stateDir: ProfileStore.fromCentral(home, hostProfileDir, "foreign-entry").stateDir },
    ]) await assert.rejects(validatedProfileStorage(candidate, options));
    await assert.rejects(validatedProfileStorage(store, { ...options, env: {} }));
    await assert.rejects(validatedProfileStorage({ profileDir: store.profileDir }, options));
    const redirectedHome = join(home, "redirected");
    await symlink(home, redirectedHome, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(validatedProfileStorage(store, { ...options, env: { DSH_HOME: redirectedHome } }));
    await unlink(redirectedHome);
    const stateBackup = join(home, "state-backup");
    await rename(store.stateDir, stateBackup);
    await symlink(stateBackup, store.stateDir, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(validatedProfileStorage(store, options));
    await unlink(store.stateDir);
  } finally { await rm(home, { recursive: true, force: false }); }
});

test("historical explicit UI storage keeps its read-lock contract while current legacy remains read-only", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "dsmm-ui-storage-historical-")));
  try {
    const hostProfileDir = join(home, "profiles", "owned"), profileDir = join(hostProfileDir, "dsmm-profiles");
    await mkdir(profileDir, { recursive: true });
    const store = new ProfileStore(profileDir, { lockTimeoutMs: 0 });
    const content = '{"version":1,"id":"historical","settings":{}}\n';
    const saved = await store.save({ id: "historical", content, expectedRevision: null });
    await store.select({ id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: "absent" });
    const options = { env: { DSH_HOME: home }, hostProfileDir, version: "0.1.8" };
    const historical = await validatedProfileStorage({ profileDir: store.profileDir }, options);
    assert.equal(historical.pointerPath, join(profileDir, ".selection.json"));
    assert.equal(historical.lockPath, join(profileDir, ".lock"));
    await writeFile(historical.lockPath, "owned-historical-lock\n", { flag: "wx" });
    try {
      await assert.rejects(store.loadSelection(), { code: "lock-timeout" });
      const legacy = ProfileStore.fromLegacy(profileDir);
      const storage = await validatedProfileStorage(legacy, { ...options, version: "0.2.0" });
      assert.equal(storage.origin, "legacy");
      assert.equal((await legacy.loadSelection()).appliedRevision, saved.revision);
      await assert.rejects(legacy.save({ id: saved.id, content, expectedRevision: saved.revision }), { code: "unavailable" });
    } finally { await unlink(historical.lockPath); }
  } finally { await rm(home, { recursive: true, force: false }); }
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

test("native client bundle resolution selects the browser export instead of the Node condition", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsmm-native-client-export-"));
  try {
    const manifestPath = join(root, "package.json");
    await writeFile(manifestPath, JSON.stringify({ exports: { "./client": { node: "./client.node.js", browser: "./client.browser.js", default: "./client.browser.js" } } }));
    await writeFile(join(root, "client.node.js"), "import 'node:fs';\n");
    await writeFile(join(root, "client.browser.js"), "window.__ModuleLoader__.load({});\n");
    const nativeRequire = { resolve(specifier: string) { assert.equal(specifier, "@fixture/native/package.json"); return manifestPath; } };
    const resolved = await resolveNativeClientBundle(nativeRequire, "@fixture/native");
    assert.equal(resolved.filename, await realpath(join(root, "client.browser.js")));
  } finally { await rm(root, { recursive: true, force: false }); }
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
  assert.match(source, /gateway\.invoke\(/u);
  assert.match(source, /browser\.newContext\(/u);
  assert.match(source, /getByRole\("heading", \{ name: "Deepwork Profiles", exact: true \}\)/u);
  assert.match(source, /persistence\[Symbol\.for\("dsmm\.sessionPersistence\.ignorable\.v1"\)\]/u);
  assert.match(source, /removeOwnedUiRoot/u);
  assert.doesNotMatch(source, /join\(packageRoot, "lib", "index\.js"\)/u);
  assert.doesNotMatch(source, /storageState|connectOverCDP|authenticatedUrl|authorizeIndex/u);
});
