import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, realpath, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
// @ts-expect-error Native release harnesses are source-only modules.
import { digest, inspectStableProfileStorage } from "../scripts/stable-native-acceptance.mjs";
// @ts-expect-error Native release harnesses are source-only modules.
import { createStableNativeBridge } from "../scripts/profile-ui-harness-stable021-native.mjs";
// @ts-expect-error Native release contracts are source-only modules.
import { validateStableBootstrap } from "../scripts/release-contract.mjs";

test("stable cold profile inspection allows absent storage without materializing files and refuses redirected ownership", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "dsmm-stable-storage-")));
  try {
    const hostProfileDir = join(home, "profiles", "host"); await mkdir(hostProfileDir, { recursive: true });
    const identity = process.platform === "win32" ? hostProfileDir.toLowerCase() : hostProfileDir;
    const profileDir = join(home, "plugins", "dsmm", "profiles"), entryId = "include:dsmm";
    const stateDir = join(profileDir, ".state", digest(JSON.stringify([identity, entryId])));
    const observed = await inspectStableProfileStorage({ origin: "central", profileDir, stateDir }, { home, hostProfileDir, entryId });
    assert.equal(observed.pointerPath, join(stateDir, ".selection.json"));
    assert.deepEqual(await readdir(home), ["profiles"]);
    const redirect = join(home, "redirect"); await mkdir(redirect);
    await symlink(redirect, join(home, "plugins"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(inspectStableProfileStorage({ origin: "central", profileDir, stateDir }, { home, hostProfileDir, entryId }));
  } finally { await rm(home, { recursive: true, force: false }); }
});

test("stable native bootstrap refuses stock, duplicate, unready and legacy-enabled substrate proof", () => {
  const proof = { startedBundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@dsmm/dsmm"], stockSubagentDisabled: true,
    customRuntimeEntries: 1, mainEntries: 1, runtimeLoaded: true, mainLoaded: true, binding: "dsmm", deliveryFenceReady: true, restartRequired: false, experimentalLegacyRead: "unconfigured/unavailable",
    loader: [{ id: "include:dsmm", name: "@dsmm/dsmm", state: 2 }, { id: "include:dsmm-runtime", name: "@dsmm/dsmm/subagent-runtime", state: 2 }] };
  assert.equal(validateStableBootstrap(proof), proof);
  for (const change of [{ stockSubagentDisabled: false }, { customRuntimeEntries: 2 }, { mainEntries: 2 }, { loader: [] }, { runtimeLoaded: false }, { mainLoaded: false },
    { binding: "stock" }, { deliveryFenceReady: false }, { restartRequired: true }, { experimentalLegacyRead: "enabled" }]) {
    assert.throws(() => validateStableBootstrap({ ...proof, ...change }));
  }
  assert.equal(validateStableBootstrap({ ...proof, deliveryFenceReady: false, restartRequired: true }, { requireDeliveryFence: false }).binding, "dsmm");
});

test("stable carrier forwards only approved native operations with exact owner Peer and closes observed streams", async () => {
  const page = {}, peer = { id: "native-operator" }, source = { page, frame: { url: () => "http://127.0.0.1:1234/" } };
  const report = { nativeCalls: [] as Array<{ endpoint: string; receipt?: unknown }>, nativeStreams: [] as Array<{ frames: number; disposed?: boolean }> };
  const invoked: unknown[] = []; let signal: AbortSignal | undefined;
  const gateway = {
    async invoke(input: { peer: object }) { assert.equal(input.peer, peer); invoked.push(input); return { messageId: "accepted-native-message" }; },
    wireStream: { failure(error: Error) { return { code: "native/refused", message: error.message }; },
      async open(endpoint: string, payload: unknown, client: unknown, owner: object, control: AbortSignal) {
        assert.equal(owner, peer); signal = control;
        return { async *[Symbol.asyncIterator]() { yield { seq: 1 }; } };
      } },
  };
  const bridge = createStableNativeBridge({ gateway, peer, page, origin: "http://127.0.0.1:1234", report });
  try {
    const call = { operation: "call", id: "call", channel: "/api", endpoint: "dsmmChildren/prompt", payload: { args: { sessionId: "owned-parent" } } };
    assert.deepEqual(await bridge.invoke(source, call), { ok: true, value: { messageId: "accepted-native-message" } });
    assert.equal(invoked.length, 1); assert.equal(report.nativeCalls[0].endpoint, "dsmmChildren/prompt");
    for (const changed of [{ ...source, page: {} }, { ...source, frame: { url: () => "https://foreign.invalid/" } }]) await assert.rejects(bridge.invoke(changed, call));
    await assert.rejects(bridge.invoke(source, { ...call, endpoint: "dsmmConfig/save" }));
    await bridge.invoke(source, { operation: "open", id: "stream", channel: "/api", endpoint: "session/control", payload: {} });
    assert.equal((await bridge.invoke(source, { operation: "next", id: "stream" })).value.value.seq, 1);
    assert.equal(report.nativeStreams[0].frames, 1);
    bridge.close(); assert.equal(signal?.aborted, true); assert.equal(report.nativeStreams[0].disposed, true);
  } finally { bridge.close(); }
});
