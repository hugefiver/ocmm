import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
// @ts-expect-error Owned diagnostic harnesses are not published library modules.
import { nativePickerClosure, pickerCompositionBundle, PICKER_ENTRY_PACKAGES } from "../scripts/native-picker-browser.mjs";
// @ts-expect-error Owned diagnostic harnesses are not published library modules.
import { decodeNativePickerArgs, nativePickerContract, nativePickerDiagnosticContract, pickerArtifactOptions, frozenPickerArtifactOptions, runFrozenNativePickerAcceptance, validateNativePickerAfterStep, validateCompactHeaderGeometry, validateNativeMenuGeometry, PICKER_ARTIFACT_SHA256, PICKER_ARTIFACT_URL } from "../scripts/native-picker-harness.mjs";

test("picker diagnostic decodes only the native singleton wire envelope without renaming strict descriptor fields", () => {
  const args = { request: { sessionId: "owned", provider: "fixture", model: "target" } };
  assert.equal(decodeNativePickerArgs({ args }), args);
  assert.deepEqual(decodeNativePickerArgs({ args: {} }), {});
  for (const invalid of [null, [], {}, { request: args.request }, { args, extra: true }, { args: [] }, { args: null }]) assert.throws(() => decodeNativePickerArgs(invalid));
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

test("release identity selects only the exact reviewed 016 SELECT or 017 native-menu contract", () => {
  assert.equal(nativePickerContract("0.1.6"), "native-select-016"); assert.equal(nativePickerContract("0.1.7"), "native-menu-017");
  for (const version of ["0.1.5", "0.1.8", "0.2.0", "1.0.0", "0.1.7-beta", "0.1.07", undefined]) assert.throws(() => nativePickerContract(version));
});
test("historical source-after 015 diagnostics remain SELECT-only without admitting 015 or future versions to frozen CI", () => {
  assert.equal(nativePickerDiagnosticContract("0.1.5"), "native-select-016");
  assert.equal(nativePickerDiagnosticContract("0.1.6"), "native-select-016");
  assert.equal(nativePickerDiagnosticContract("0.1.7"), "native-menu-017");
  assert.throws(() => nativePickerContract("0.1.5")); assert.throws(() => nativePickerDiagnosticContract("0.1.8"));
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
