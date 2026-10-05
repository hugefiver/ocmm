import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import test from "node:test";
// @ts-expect-error Owned diagnostic harnesses are not published library modules.
import { nativePickerClosure, pickerCompositionBundle, PICKER_ENTRY_PACKAGES } from "../scripts/native-picker-browser.mjs";
// @ts-expect-error Owned diagnostic harnesses are not published library modules.
import { decodeNativePickerArgs, nativePickerContract, nativePickerDiagnosticContract, pickerArtifactOptions, frozenPickerArtifactOptions, runFrozenNativePickerAcceptance, submitOwnedNativeFollowup, profileSwitchKeyboardKeys, heldProfileIntentCall, validateNativePickerAfterStep, validateCompactHeaderGeometry, validateNativeMenuGeometry, PICKER_ARTIFACT_SHA256, PICKER_ARTIFACT_URL } from "../scripts/native-picker-harness.mjs";

test("picker diagnostic decodes only the native singleton wire envelope without renaming strict descriptor fields", () => {
  const args = { request: { sessionId: "owned", provider: "fixture", model: "target" } };
  assert.equal(decodeNativePickerArgs({ args }), args);
  assert.deepEqual(decodeNativePickerArgs({ args: {} }), {});
  for (const invalid of [null, [], {}, { request: args.request }, { args, extra: true }, { args: [] }, { args: null }]) assert.throws(() => decodeNativePickerArgs(invalid));
});

test("cold mode reader mounts the actual stock persistence default plugin, never its ESM namespace", async () => {
  const native = await import("@deepseek-ai/dsh-session-persistence-jsonl");
  assert.equal(typeof native.default.apply, "function", "published native persistence default is the Cordis plugin");
  assert.equal(Reflect.get(native, "apply"), undefined, "the ESM namespace is not a Cordis plugin");
  const harness = await readFile(new URL("../scripts/native-picker-harness.mjs", import.meta.url), "utf8");
  assert.ok(/const \{ default: StockPersistence \} = await load\("@deepseek-ai\/dsh-session-persistence-jsonl"\)/u.test(harness), "cold mode reader must mount the native default export");
});

test("raw native mode roots dispatch a genuine user followup and await native idle, without a Workspace composer", async () => {
  const { createUserMessage } = await import("@deepseek-ai/dsh-llm");
  const events: string[] = [];
  await submitOwnedNativeFollowup({ followup(message: ReturnType<typeof createUserMessage>) {
    events.push("followup"); assert.deepEqual(message.content, [{ type: "text", text: "Owned native mode mode-off" }]); assert.deepEqual(message.source, { kind: "user" });
  }, async whenIdle() { events.push("idle"); } }, createUserMessage, "mode-off");
  assert.deepEqual(events, ["followup", "idle"]);
});

test("018 native keyboard profile selection traverses enabled mode and baseline rows; 017 keeps its original order", () => {
  const observed018Rows = ["Disable Deepwork", "deployment baseline", "Picker profile B"];
  const observed017Rows = ["deployment baseline", "Picker profile B"];
  for (const [modeCandidate, rows] of [[true, observed018Rows], [false, observed017Rows]] as const) {
    let focused = -1;
    const keys = profileSwitchKeyboardKeys(modeCandidate);
    for (const key of keys) focused = key === "Home" ? 0 : focused + 1;
    assert.equal(rows[focused], "Picker profile B", "native Home/ArrowDown must focus the actual Profile row, not the added mode or baseline row");
    assert.deepEqual(keys, modeCandidate ? ["Home", "ArrowDown", "ArrowDown"] : ["Home", "ArrowDown"]);
  }
});

test("view withdrawal waits on exact held old-session intent, never a settled new-session or metadata-refresh read", () => {
  const endpoint = "dsmmProfiles/describeSession";
  const refresh = { endpoint, result: "accepted", payload: { args: { sessionId: "old" } } };
  const held = { endpoint, ownedCarrierHold: true, result: "pending", payload: { args: { sessionId: "old" } } };
  const newer = { endpoint, result: "accepted", payload: { args: { sessionId: "new" } } };
  const correlated = heldProfileIntentCall([refresh, held, newer], endpoint, "old");
  assert.equal(correlated, held, "an accepted unrelated read must not settle the delayed old-session operation");
  assert.equal(correlated.result, "pending");
  held.result = "accepted"; assert.equal(correlated.result, "accepted", "wait must track this exact native RPC record");
  assert.throws(() => heldProfileIntentCall([refresh, newer], endpoint, "old"));
  assert.throws(() => heldProfileIntentCall([held, { ...held }], endpoint, "old"));
  const legacy = { endpoint: "dsmmProfiles/selectSession", ownedCarrierHold: true, result: "pending", payload: { args: { request: { sessionId: "old" } } } };
  assert.equal(heldProfileIntentCall([legacy], legacy.endpoint, "old"), legacy);
});

test("native Store is an installed library consumed by ModelDirectory, not a declared client-plugin asset", async () => {
  const nativeRequire = createRequire(import.meta.url);
  const manifest = JSON.parse(await readFile(nativeRequire.resolve("@deepseek-ai/dsh-client-store/package.json"), "utf8"));
  assert.equal(manifest.version, "0.2.0-rc.2"); assert.equal(manifest.dsh?.client, undefined);
  const store = await import("@deepseek-ai/dsh-client-store");
  assert.equal(typeof store.defineStore, "function"); assert.equal(typeof store.createSnapshotStore, "function");
  const modelClient = await readFile(nativeRequire.resolve("@deepseek-ai/dsh-client-ui-model-selection/client"), "utf8");
  assert.ok(modelClient.includes('require("@deepseek-ai/dsh-client-store")'), "unchanged native ModelDirectory must consume the seeded library");
});

test("owned picker composition installs only the supported carrier and locale; native Layout/Conversation/ModelSelect own slots", () => {
  const bundle = pickerCompositionBundle();
  assert.match(bundle, /installConnection\(ctx,\{transport:\{rpc:window\.__dsmmOwnedCarrier,ownsHost:true\}\}\)/u);
  assert.match(bundle, /LocaleRuntime/u);
  assert.doesNotMatch(bundle, /slots\.register|ModelSelect|selectModel|fetch\(|WebSocket|cookie|localStorage|sessionStorage/u);
  assert.deepEqual(PICKER_ENTRY_PACKAGES, ["@deepseek-ai/dsh-client-ui-model-selection", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-layout"]);
});

test("native picker dependency closure follows published metadata exactly and tolerates native prefetch cycles", async () => {
  const owned = await mkdtemp(join(tmpdir(), "dsmm-picker-closure-"));
  const paths = new Map<string, string>();
  try {
    const ids = [...PICKER_ENTRY_PACKAGES, "@deepseek-ai/dsh-owned-shared"];
    for (const [index, id] of ids.entries()) {
      const directory = join(owned, String(index)); await mkdir(directory);
      const path = join(directory, "package.json"); paths.set(`${id}/package.json`, path);
      await writeFile(path, JSON.stringify({ version: "0.2.0-rc.2", dsh: { client: { inject: index < 3 ? [ids[3]] : [ids[0]] } } }));
    }
    const resolver = { resolve(specifier: string) { const path = paths.get(specifier); assert.ok(path); return path; } };
    const closure = await nativePickerClosure(resolver);
    assert.equal(closure.size, 4);
    assert.deepEqual([...closure.keys()].sort(), [...ids].sort());
    const first = paths.get(`${ids[0]}/package.json`)!;
    const original = JSON.parse(await readFile(first, "utf8"));
    await writeFile(first, JSON.stringify({ ...original, version: "0.2.1" }));
    await assert.rejects(nativePickerClosure(resolver));
  } finally { await rm(owned, { recursive: true, force: false }); }
});

test("before-fix picker artifact is the exact immutable public 0.1.5 registry identity", () => {
  assert.equal(PICKER_ARTIFACT_URL, "https://registry.npmjs.org/@dsmm/dsmm/-/dsmm-0.1.5.tgz");
  assert.equal(PICKER_ARTIFACT_SHA256, "c42d2e3f799e677258e1624a752fc0928286747e292c26b908524218b8751c9f");
});

test("source-after picker requires an explicit distinct artifact digest and source identity without changing the public before identity", () => {
  assert.deepEqual(pickerArtifactOptions([]), { kind: "published-before", url: PICKER_ARTIFACT_URL, sha256: PICKER_ARTIFACT_SHA256, lanes: ["absent", "present"], receiptName: "picker-ab-receipt.json" });
  const source = ["--source-artifact", "/owned/source.tgz", "--source-sha256", "a".repeat(64), "--source-identity", "owned-current-worktree-20261005"];
  assert.deepEqual(pickerArtifactOptions(source), { kind: "local-current-source", artifact: "/owned/source.tgz", sha256: "a".repeat(64), sourceIdentity: "owned-current-worktree-20261005", lanes: ["present"], receiptName: "picker-after-receipt.json" });
  for (const invalid of [source.slice(0, 2), source.slice(2), [...source, "--extra", "x"], [...source, "--source-artifact", "/other.tgz"], source.map((value) => value === "a".repeat(64) ? PICKER_ARTIFACT_SHA256 : value), source.map((value) => value === "a".repeat(64) ? "no-hash" : value)]) assert.throws(() => pickerArtifactOptions(invalid));
});

test("CI picker binds explicit frozen bytes and trusted stable version without a registry BEFORE fallback", async () => {
  const input = { artifact: join(tmpdir(), "frozen-dsmm.tgz"), sha256: "a".repeat(64), packageVersion: "0.1.6" };
  assert.deepEqual(frozenPickerArtifactOptions(input), { kind: "ci-frozen-artifact", ...input, lanes: ["present"], receiptName: "picker-frozen-receipt.json" });
  for (const mutation of [{ artifact: undefined }, { artifact: "relative.tgz" }, { sha256: undefined }, { sha256: "bad" }, { packageVersion: undefined }, { packageVersion: "0.1.5" }, { packageVersion: "0.1.6-beta" }]) {
    assert.throws(() => frozenPickerArtifactOptions({ ...input, ...mutation }));
  }
  await assert.rejects(runFrozenNativePickerAcceptance(input), /explicit absolute dshManifest/u);
});

test("source-after picker claims need the real no-RPC route, native header and converged picker evidence", () => {
  const target = { provider: "dsmm-picker-fixture", model: "target", reasoningEffort: "high" };
  const step = { phase: "direct-target-new", modelRpcs: [], actualCalls: [{ ...target, header: target }], afterRequest: { actualCurrentHeader: target, directory: { current: target } } };
  assert.doesNotThrow(() => validateNativePickerAfterStep(step));
  for (const mutation of [
    { modelRpcs: [{ endpoint: "session/selectModel" }] },
    { actualCalls: [{ ...target, model: "configured-default", header: target }] },
    { afterRequest: { ...step.afterRequest, directory: { current: { ...target, reasoningEffort: "max" } } } },
  ]) assert.throws(() => validateNativePickerAfterStep({ ...step, ...mutation }));
});

test("compact geometry rejects native-seat clipping even when the document and own box hide horizontal overflow", () => {
  const root = { kind: "profile-root", left: 87, right: 334, clientWidth: 247, scrollWidth: 247, focused: false, outlineExtent: 0 };
  const geometry = { focus: true, selectHeight: 32, clientWidth: 247, scrollWidth: 247, viewportWidth: 375, seat: { left: 56, right: 375 }, root,
    elements: [{ kind: "select", left: 135, right: 330, clientWidth: 195, scrollWidth: 195, focused: true, outlineExtent: 4 }] };
  assert.doesNotThrow(() => validateCompactHeaderGeometry(geometry));
  assert.throws(() => validateCompactHeaderGeometry({ ...geometry, root: { ...root, right: 475.3125, clientWidth: 388, scrollWidth: 388 }, clientWidth: 388, scrollWidth: 388 }));
  assert.throws(() => validateCompactHeaderGeometry({ ...geometry, elements: [{ ...geometry.elements[0], right: 374 }] }));
});

test("release identity preserves 016/017 and carries the identical reviewed 018 mode grammar into exact 019", () => {
  assert.equal(nativePickerContract("0.1.6"), "native-select-016"); assert.equal(nativePickerContract("0.1.7"), "native-menu-017");
  assert.equal(nativePickerContract("0.1.8"), "native-menu-mode-018");
  assert.equal(nativePickerContract("0.1.9"), "native-menu-mode-018");
  for (const version of ["0.1.5", "0.1.10", "0.2.0", "1.0.0", "0.1.7-beta", "0.1.07", "9007199254740992.0.0", undefined]) assert.throws(() => nativePickerContract(version));
});
test("historical source-after 015 diagnostics remain SELECT-only without admitting 015 or future versions to frozen CI", () => {
  assert.equal(nativePickerDiagnosticContract("0.1.5"), "native-select-016");
  assert.equal(nativePickerDiagnosticContract("0.1.6"), "native-select-016");
  assert.equal(nativePickerDiagnosticContract("0.1.7"), "native-menu-017");
  assert.throws(() => nativePickerContract("0.1.5")); assert.equal(nativePickerDiagnosticContract("0.1.8"), "native-menu-mode-018");
});
test("menu geometry rejects portal clipping, missing keyboard focus, unreadable labels and coercible coordinates", () => {
  const shape = { kind: "label", left: 40, right: 320, top: 90, bottom: 112, clientWidth: 280, scrollWidth: 280, focused: false, outlineExtent: 0, fontSize: 14, lineHeight: 22 };
  const geometry = { viewportWidth: 375, viewportHeight: 900, seat: { left: 20, right: 375 }, triggerHeight: 28, focus: true, portaled: true,
    trigger: { ...shape, kind: "trigger", left: 30, right: 58, top: 20, bottom: 48, clientWidth: 28, scrollWidth: 28, focused: true, outlineExtent: 4 },
    menu: { ...shape, kind: "menu", left: 30, right: 330, top: 60, bottom: 760, clientWidth: 300, scrollWidth: 300 }, labels: [shape, shape, shape] };
  assert.doesNotThrow(() => validateNativeMenuGeometry(geometry));
  for (const mutation of [{ portaled: false }, { focus: false }, { trigger: { ...geometry.trigger, outlineExtent: 0 } },
    { menu: { ...geometry.menu, right: 476 } }, { viewportWidth: "375" }, { labels: [{ ...shape, fontSize: 11 }, shape, shape] },
    { labels: [{ ...shape, scrollWidth: 480 }, shape, shape] }]) assert.throws(() => validateNativeMenuGeometry({ ...geometry, ...mutation }));
});
