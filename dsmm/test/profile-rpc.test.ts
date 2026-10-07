import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";
import * as Cordis from "@deepseek-ai/cordis";
import { Context } from "@deepseek-ai/cordis";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import type { ConnectionInstallOptions } from "@deepseek-ai/dsh-client-connection/client";
import { TYPERT_REMOTE } from "../lib/profile-remote.js";
import { registerProfilesRpc } from "../lib/profile-rpc.js";
import { ProfileStore } from "../lib/profile-store.js";
import { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { resolveConfig } from "../lib/settings.js";
import dsmmPlugin from "../lib/index.js";
import DsmmSessionPersistence, { DSMM_PERSISTENCE_COMPATIBILITY } from "../lib/session-persistence.js";
import { DeepworkModeController } from "../lib/state.js";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import { canReconcileSelection, ProfilesController } from "../lib/client/controller.js";

const require = createRequire(import.meta.url);
type NativeClientModule = { inject: string[]; apply(ctx: Context): void; installConnection?(ctx: Context, options: ConnectionInstallOptions): void };
async function nativeClient(packageName: string): Promise<NativeClientModule> {
  const source = await readFile(join(dirname(require.resolve(`${packageName}/package.json`)), "lib/client.js"), "utf8");
  let factory: ((require: (id: string) => unknown) => NativeClientModule) | undefined;
  const realm = createContext({ crypto: globalThis.crypto, AbortController, AbortSignal, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, console, window: { __ModuleLoader__: { load(row: { factory: typeof factory }) { factory = row.factory; } } } });
  runInContext(source, realm);
  // A real native module factory materializes in a non-browser in-process tree.
  delete realm.window;
  assert.ok(factory);
  return factory((id) => { assert.equal(id, "@deepseek-ai/cordis"); return Cordis; });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dsmm-profile-rpc-"));
  const host = new Context();
  const client = new Context();
  try {
  const hostTypert = host.plugin(TypertRegistry);
  const gatewayFiber = host.plugin(TypertGatewayService, {});
  const clientTypert = client.plugin(TypertRegistry);
  await Promise.all([hostTypert.await(), gatewayFiber.await(), clientTypert.await()]);
  const gateway = host.typertGateway;
  const store = new ProfileStore(join(root, "dsmm-profiles"));
  const runtime = new DsmmProfileRuntime(host as unknown as DshContext, resolveConfig(), store);
  await runtime.initialize();
  const rpcFiber = host.plugin({ name: "profile-rpc", inject: ["typert"], apply(ctx: Context) { registerProfilesRpc(ctx, runtime); } });
  assert.ok(rpcFiber);
  await rpcFiber.await();
  gateway.registerRemoteEvents(async function* (signal) { await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })); }, { home: "isolated-test" });
  const connection = await nativeClient("@deepseek-ai/dsh-client-connection");
  assert.ok(connection.installConnection);
  let offline = false;
  connection.installConnection(client, { transport: { ownsHost: true, rpc: {
    async call(channel, endpoint, payload, signal) {
      assert.equal(channel, "/api");
      if (offline) throw new Error("PRIVATE_TRANSPORT_SENTINEL");
      const [namespace, method] = endpoint.split("/");
      const args = (payload as { args: Record<string, unknown> }).args;
      try { return { ok: true, value: await gateway.invoke({ namespace, method, args, signal }) }; }
      catch (error) {
        const failure = remoteErrorOf(error);
        if (failure === undefined) throw error;
        return { ok: false, error: { code: failure.code, message: failure.message, details: failure.details } };
      }
    },
    async *open(channel, endpoint, payload, signal, uplink) {
      assert.equal(channel, "/api");
      yield* await gateway.wireStream.open(endpoint, payload, uplink ?? (async function* () {})(), undefined, signal);
    },
  } } });
  const remoteModule = await nativeClient("@deepseek-ai/dsh-api-gateway");
  const remoteFiber = client.plugin(remoteModule);
  assert.ok(remoteFiber);
  await remoteFiber.await();
  const remote: ClientRemote = client.remote;
  const unmount = await remote.$mount(TYPERT_REMOTE);
  return { host, client, gateway, store, runtime, remote, unmount, rpcFiber, offline(value: boolean) { offline = value; }, async dispose() { await client.fiber.dispose(); await host.fiber.dispose(); await rm(root, { recursive: true, force: true }); } };
  } catch (error) {
    await client.fiber.dispose(); await host.fiber.dispose(); await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function anotherHost(profileDir: string) {
  const host = new Context();
  try {
    const registry = host.plugin(TypertRegistry);
    const gateway = host.plugin(TypertGatewayService, {});
    await Promise.all([registry.await(), gateway.await()]);
    const runtime = new DsmmProfileRuntime(host as unknown as DshContext, resolveConfig(), new ProfileStore(profileDir));
    await runtime.initialize();
    const rpc = host.plugin({ name: "external-profile-rpc", inject: ["typert"], apply(ctx: Context) { registerProfilesRpc(ctx, runtime); } });
    await rpc.await();
    return { runtime, async select(id: string | null, revision?: string) {
      return host.typertGateway.invoke({ namespace: "dsmmProfiles", method: "select", args: { request: { id, ...(revision === undefined ? {} : { expectedRevision: revision }), expectedSelectionRevision: (await runtime.describe()).selectionRevision } } });
    }, dispose: () => host.fiber.dispose() };
  } catch (error) { await host.fiber.dispose(); throw error; }
}

async function savedPair(f: Awaited<ReturnType<typeof fixture>>) {
  const a = await f.remote.dsmmProfiles.save({ id: "a", content: '{"version":1,"id":"a","settings":{"workflow":{"reviewCap":1}}}', expectedRevision: null });
  const b = await f.remote.dsmmProfiles.save({ id: "b", content: '{"version":1,"id":"b","settings":{"workflow":{"reviewCap":4}}}', expectedRevision: null });
  assert.ok(a.ok && b.ok);
  return { a: a.value, b: b.value };
}

async function verifyProductionProfileInjection(plugin: typeof dsmmPlugin, durable = false): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "dsmm-production-rpc-"));
  const ctx = new Context();
  try {
    const registry = ctx.plugin(TypertRegistry);
    const gateway = ctx.plugin(TypertGatewayService, {});
    await Promise.all([registry.await(), gateway.await()]);
    ctx.provide("profileContext", { dir: root, startedBundles: [] });
    const storage = { root: join(root, "native-session-logs"), compression: "none" as const };
    const startupOrder: string[] = [];
    ctx.on("internal/status", (fiber) => {
      if (fiber.runtime?.callback === DsmmSessionPersistence && fiber.state === 2) startupOrder.push("storage-ready");
      if (fiber.runtime?.callback.name === "installProfiles" && fiber.state === 1) startupOrder.push("profiles-start");
    });
    // Only the declaration boundary is bridged: the production apply and its
    // internal profileContext/typert injection callbacks execute unchanged.
    const entry = ctx.plugin({
      name: "dsmm-production-rpc-regression", Config: plugin.Config, inject: [...plugin.inject],
      apply(ready: Context, config: Parameters<typeof plugin.apply>[1]) {
        return plugin.apply(ready as unknown as DshContext, config);
      },
    }, durable ? { sessionPersistence: storage } : {});
    await entry.await();
    const ownedByEntry = (candidate: Context["fiber"]): boolean => {
      let owner = candidate;
      while (owner.uid !== 0) {
        // These fibers all come from one registry. Cordis's awaitable entry
        // facade need not share object identity with its diagnostic Fiber.
        if (owner.uid === entry.uid) return true;
        owner = owner.parent.fiber;
      }
      return false;
    };
    const rpcFibers = [...ctx.registry.values()].flatMap((runtime) => [...runtime.fibers])
      .filter((fiber) => ownedByEntry(fiber) && Object.hasOwn(fiber.inject, "typert"));
    assert.equal(rpcFibers.length, 1, "the production profile owner must create one native Typert injection");
    // Parent startup alone can pass while a nested injection has failed. Await
    // the actual RPC child so an accidentally returned Service is observable.
    await rpcFibers[0].await();
    assert.equal(rpcFibers[0].state, 2, "the native RPC injection must remain ACTIVE");
    assert.ok(ctx.get("dsmmProfileRuntime"));
    assert.ok(ctx.get("dsmmProfiles"));
    assert.deepEqual(ctx.typert.local.list().filter((descriptor) => descriptor.service === "dsmmProfiles").map((descriptor) => descriptor.method), ["selectMode", "describe", "read", "save", "select", "describeSession", "selectSession"]);
    const described = await ctx.typertGateway.invoke({ namespace: "dsmmProfiles", method: "describe", args: {} }) as Awaited<ReturnType<DsmmProfileRuntime["describe"]>>;
    assert.deepEqual({ profiles: described.profiles, selectedId: described.selectedId, appliedRevision: described.appliedRevision, selectionRevision: described.selectionRevision }, {
      profiles: [], selectedId: null, appliedRevision: null, selectionRevision: "absent",
    });
    assert.equal(described.roles?.length, 12);
    assert.equal(described.editorDefaults?.strategy, "startup-lock");
    let persistedSession: Session | undefined;
    const storageFibers = [...ctx.registry.values()].flatMap((runtime) => [...runtime.fibers])
      .filter((fiber) => ownedByEntry(fiber) && fiber.runtime?.callback === DsmmSessionPersistence);
    if (durable) {
      assert.equal(storageFibers.length, 1, "the production entry owns one internal companion, not a second Loader entry");
      assert.equal(storageFibers[0].state, 2);
      assert.deepEqual(storageFibers[0].config, storage, "the explicit native root and compression must survive configuration");
      assert.ok(startupOrder.indexOf("storage-ready") >= 0);
      assert.ok(startupOrder.indexOf("profiles-start") > startupOrder.indexOf("storage-ready"), "native storage init must finish before profile runtime installation");
      const persistence = ctx.sessionPersistence;
      assert.equal(persistence.name, "dsmm-session-persistence");
      assert.deepEqual(Object.getOwnPropertyDescriptor(persistence, DSMM_PERSISTENCE_COMPATIBILITY), {
        value: true, writable: false, configurable: false, enumerable: false,
      });
      persistedSession = Session.create(SessionId("production-dsmm-storage-ready"));
      const writer = await persistence.create(persistedSession.header);
      await writer.append([persistedSession.append("deepwork/mode", { active: true })]);
      await writer.flush(); await writer.close();
      assert.equal((await persistence.stat(persistedSession.id))?.header.id, persistedSession.id);
    } else {
      assert.equal(entry.config.sessionPersistence, undefined, "absent optional storage configuration must remain absent");
      assert.equal(storageFibers.length, 0);
      assert.equal(ctx.get("sessionPersistence"), undefined, "an unconfigured ephemeral Host must not initialize a durable provider");
    }
    await entry.dispose();
    assert.equal(ctx.get("dsmmProfileRuntime"), undefined);
    assert.equal(ctx.get("dsmmProfiles"), undefined);
    assert.equal(ctx.typert.local.get("dsmmProfiles/describe"), undefined);
    assert.equal(ctx.typert.local.hasSeen("dsmmProfiles/describe"), true);
    await assert.rejects(ctx.typertGateway.invoke({ namespace: "dsmmProfiles", method: "describe", args: {} }),
      (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/definition-unavailable");
    if (durable) {
      assert.equal(ctx.get("sessionPersistence"), undefined, "the configured companion is owned by the production entry");
      const cold = new Context();
      try {
        await cold.plugin(JsonlSessionPersistence, storage).await();
        const reader = await cold.sessionPersistence.open(persistedSession!.id, "read");
        assert.equal((await reader.read()).events[0]?.ignorable, true, "production writes remain reopenable by the unmodified native reader");
        await reader.close();
      } finally { await cold.fiber.dispose(); }
    }
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
}

async function verifyProductionStorageInitializationFailure(plugin: typeof dsmmPlugin): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "dsmm-production-storage-failure-"));
  const ctx = new Context();
  try {
    const storageRoot = join(root, "not-a-directory");
    await writeFile(storageRoot, "retain native initialization refusal", "utf8");
    await ctx.plugin(TypertRegistry).await();
    ctx.provide("profileContext", { dir: root, startedBundles: [] });
    let profilesStarted = false;
    ctx.on("internal/plugin", (fiber) => {
      if (fiber.runtime?.callback.name === "installProfiles") profilesStarted = true;
    });
    const entry = ctx.plugin({
      name: "production-storage-failure", Config: plugin.Config, inject: [...plugin.inject],
      apply(ready: Context, config: Parameters<typeof plugin.apply>[1]) { return plugin.apply(ready as unknown as DshContext, config); },
    }, { sessionPersistence: { root: storageRoot, compression: "none" } });
    await assert.rejects(entry.await(), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "ENOTDIR");
    assert.equal(entry.state, 3, "a native initialization refusal fails production startup");
    assert.equal(profilesStarted, false, "storage failure cannot fall through to an ephemeral DSMM runtime");
    assert.equal(ctx.get("sessionPersistence"), undefined);
    assert.equal(ctx.get("dsmmProfileRuntime"), undefined);
    assert.equal(ctx.get("dsmmProfiles"), undefined);
    assert.equal(ctx.typert.local.hasSeen("dsmmProfiles/describe"), false);
    await assert.rejects(access(join(root, "dsmm-profiles")), { code: "ENOENT" });
    assert.equal(await readFile(storageRoot, "utf8"), "retain native initialization refusal");
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
}

async function replayUnawaitedStorageIndex(): Promise<typeof dsmmPlugin> {
  const index = new URL("../lib/index.js", import.meta.url);
  const compiled = await readFile(index, "utf8");
  const awaited = "return fiber.await().then(() => applyRuntime(ctx, config));";
  assert.ok(compiled.includes(awaited), "replay must alter the production storage-ready barrier only");
  const old = compiled.replace(awaited, "return applyRuntime(ctx, config);")
    .replaceAll('from "@deepseek-ai/cordis"', `from "${import.meta.resolve("@deepseek-ai/cordis")}"`)
    .replace(/from "(\.\/[^"\n]+)"/gu, (_match, relative: string) => `from "${new URL(relative, index).href}"`);
  const replay = await import(`data:text/javascript;base64,${Buffer.from(old).toString("base64")}`) as { default: typeof dsmmPlugin };
  return replay.default;
}

async function replayReturnedServiceIndex(): Promise<typeof dsmmPlugin> {
  const index = new URL("../lib/index.js", import.meta.url);
  const compiled = await readFile(index, "utf8");
  const fixed = /profileCtx\.inject\?\.\(\["typert"\], \(rpcCtx\) => \{\s*registerProfilesRpc\(rpcCtx, manager\);\s*\}\);/u;
  assert.ok(fixed.test(compiled), "replay must replace exactly the production Typert callback, not a fixture");
  const old = compiled.replace(fixed, 'profileCtx.inject?.(["typert"], (rpcCtx) => registerProfilesRpc(rpcCtx, manager));')
    .replaceAll('from "@deepseek-ai/cordis"', `from "${import.meta.resolve("@deepseek-ai/cordis")}"`)
    .replace(/from "(\.\/[^"\n]+)"/gu, (_match, relative: string) => `from "${new URL(relative, index).href}"`);
  // Read-only in-memory replay preserves every other production module and
  // callback. No generated file, checkout edit, or global runtime is changed.
  const replay = await import(`data:text/javascript;base64,${Buffer.from(old).toString("base64")}`) as { default: typeof dsmmPlugin };
  return replay.default;
}

test("strict codecs reject authority, path, malformed revision, and unsupported result fields", () => {
  for (const descriptor of TYPERT_REMOTE.descriptors) {
    assert.equal(descriptor.result.mode, "strict");
    for (const parameter of descriptor.parameters) assert.equal(parameter.codec.mode, "strict");
  }
  const save = TYPERT_REMOTE.descriptors.find((item) => item.method === "save")!.parameters[0].codec;
  const select = TYPERT_REMOTE.descriptors.find((item) => item.method === "select")!.parameters[0].codec;
  assert.equal(save.mode, "strict"); assert.equal(select.mode, "strict");
  if (save.mode !== "strict" || select.mode !== "strict") return;
  const valid = { id: "example", content: "{}", expectedRevision: null };
  assert.deepEqual(save.create().parse(valid), valid);
  for (const request of [{ ...valid, path: "C:/private" }, { ...valid, peer: {} }, { ...valid, id: "../escape" }, { ...valid, expectedRevision: "bad" }, { ...valid, content: null }]) assert.throws(() => save.create().parse(request));
  assert.throws(() => select.create().parse({ id: "example", expectedSelectionRevision: "absent" }));
  assert.throws(() => select.create().parse({ id: null, expectedSelectionRevision: "unavailable" }));
  const result = TYPERT_REMOTE.descriptors[0].result;
  assert.equal(result.mode, "strict");
  if (result.mode !== "strict") return;
  assert.throws(() => result.create().parse({ profiles: [], selectedId: null, appliedRevision: null, selectionRevision: "absent", credentials: {} }));
  assert.throws(() => result.create().parse({ profiles: [{ id: "example", revision: false }], selectedId: null, appliedRevision: null, selectionRevision: "absent" }));
});

test("production native DSMM profile injection owns a live RPC child and withdraws service/codecs", async () => {
  await verifyProductionProfileInjection(dsmmPlugin);
  // RED replay: the same production lifecycle assertions reject the old bare
  // returned-Service callback with native Cordis's exact Invalid effect error.
  await assert.rejects(verifyProductionProfileInjection(await replayReturnedServiceIndex()), /Invalid effect/u);
});

test("production startup awaits its configured native storage companion before enabling profile RPC", async () => {
  await verifyProductionProfileInjection(dsmmPlugin, true);
});

test("production storage initialization failure rejects before any ephemeral DSMM runtime is installed", async () => {
  await verifyProductionStorageInitializationFailure(dsmmPlugin);
  // The same failure case detects removing the real startup await, without
  // changing index.ts, dependencies, or any preexisting Host configuration.
  await assert.rejects(verifyProductionStorageInitializationFailure(await replayUnawaitedStorageIndex()), /Missing expected rejection/u);
});

test("production startup refuses a preexisting incompatible native JSONL backend without hot replacement or unsafe metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "dsmm-production-existing-storage-"));
  const ctx = new Context();
  try {
    await ctx.plugin(TypertRegistry).await();
    const native = ctx.plugin(JsonlSessionPersistence, { root: join(root, "original-native-logs"), compression: "none" });
    await native.await();
    const before = ctx.sessionPersistence;
    const originalProvider = Reflect.get(before, Cordis.symbols.original);
    ctx.provide("profileContext", { dir: root, startedBundles: [] });
    const entry = ctx.plugin({
      name: "production-existing-storage-refusal", Config: dsmmPlugin.Config, inject: [...dsmmPlugin.inject],
      apply(ready: Context, config: Parameters<typeof dsmmPlugin.apply>[1]) { return dsmmPlugin.apply(ready as unknown as DshContext, config); },
    }, { sessionPersistence: { root: join(root, "requested-dsmm-logs"), compression: "none" } });
    await assert.rejects(entry.await(), /existing JSONL entry.*live replacement is refused/u);
    assert.equal(entry.state, 3);
    assert.equal(native.state, 2);
    assert.equal(Reflect.get(ctx.sessionPersistence, Cordis.symbols.original), originalProvider, "the existing provider must not be replaced");
    assert.equal(ctx.get("dsmmProfileRuntime"), undefined);
    assert.equal(ctx.get("dsmmProfiles"), undefined);
    assert.equal(ctx.typert.local.hasSeen("dsmmProfiles/describe"), false);
    assert.equal([...ctx.registry.values()].some((runtime) => runtime.callback === DsmmSessionPersistence), false);
    const session = Session.create(SessionId("production-incompatible-storage"));
    const controller = new DeepworkModeController(ctx as unknown as DshContext);
    await assert.rejects(controller.selectIdle({ session } as unknown as DshAgent, true, false), /no unsafe event was appended/u);
    assert.equal(session.snapshotEvents().length, 0);
    assert.deepEqual(await before.list(), []);
    await assert.rejects(access(join(root, "requested-dsmm-logs")), { code: "ENOENT" });
    await assert.rejects(access(join(root, "dsmm-profiles")), { code: "ENOENT" });
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test("genuine Gateway supplies the operator invocation; save is not apply and conflicts retain state", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.host.dsmmProfiles.describe(), (error: unknown) => remoteErrorOf(error)?.code === "dsmm-profiles/peer-required");
    await assert.rejects(f.gateway.invoke({ namespace: "dsmmProfiles", method: "save", args: { request: { id: "../escape", content: "{}", expectedRevision: null } } }), (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/input-invalid");
    await assert.rejects(f.gateway.invoke({ namespace: "dsmmProfiles", method: "describe", args: { peer: { id: "forged" } } }), (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/arguments-invalid");
    assert.equal((await f.store.describe()).profiles.length, 0);
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh();
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, null);
    await controller.actions.create();
    controller.actions.editId("everyday");
    await controller.actions.save();
    const saved = controller.store.getSnapshot();
    assert.equal(saved.notice?.key, "saved");
    assert.equal(saved.snapshot?.selectedId, null);
    assert.equal(saved.dirty, false);
    assert.ok(saved.editor?.revision);
    await controller.actions.apply();
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, "everyday");
    assert.equal(controller.store.getSnapshot().notice?.key, "applied");
    controller.actions.editContent(controller.store.getSnapshot().editor!.content.replace("true", "false"));
    const draft = controller.store.getSnapshot().editor!.content;
    await f.store.save({ id: "everyday", content: draft + "\n", expectedRevision: saved.editor!.revision });
    await controller.actions.save();
    assert.equal(controller.store.getSnapshot().issue?.code, "conflict");
    assert.equal(controller.store.getSnapshot().editor?.content, draft);
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, "everyday");
    assert.equal(controller.store.getSnapshot().notice, null);
    controller.dispose();
  } finally { await f.dispose(); }
});

test("native RemoteResult transport failure and withdrawn assembly retain drafts and no success claim", async () => {
  const f = await fixture();
  try {
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh(); await controller.actions.create();
    const draft = controller.store.getSnapshot().editor!.content;
    f.offline(true);
    await controller.actions.save();
    assert.equal(controller.store.getSnapshot().issue?.kind, "transport");
    assert.equal(JSON.stringify(controller.store.getSnapshot()).includes("PRIVATE_TRANSPORT_SENTINEL"), false);
    assert.equal(controller.store.getSnapshot().editor?.content, draft);
    assert.equal(controller.store.getSnapshot().notice, null);
    f.offline(false);
    await f.unmount();
    await controller.actions.save();
    assert.equal(controller.store.getSnapshot().issue?.kind, "assembly");
    assert.equal(controller.store.getSnapshot().dirty, true);
    assert.equal(controller.store.getSnapshot().editor?.content, draft);
    controller.dispose();
  } finally { await f.dispose(); }
});

test("editor switching requires explicit discard and disposal ignores late native response", async () => {
  const f = await fixture();
  try {
    const document = await f.store.save({ id: "saved", content: '{"version":1,"id":"saved","settings":{}}', expectedRevision: null });
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh(); await controller.actions.create();
    const draft = controller.store.getSnapshot().editor!.content;
    await controller.actions.open(document.id);
    assert.equal(controller.store.getSnapshot().pendingEditor, "saved");
    controller.actions.cancelDiscard();
    assert.equal(controller.store.getSnapshot().editor?.content, draft);
    await controller.actions.open(document.id); await controller.actions.discardAndOpen();
    assert.equal(controller.store.getSnapshot().editor?.revision, document.revision);
    controller.actions.editContent("invalid JSONC");
    await controller.actions.save();
    assert.equal(controller.store.getSnapshot().issue?.code, "validation");
    assert.equal(controller.store.getSnapshot().editor?.content, "invalid JSONC");
    const pending = controller.refresh();
    controller.dispose();
    const before = controller.store.getSnapshot();
    await pending;
    assert.strictEqual(controller.store.getSnapshot(), before);
    await f.rpcFiber.dispose();
    await assert.rejects(f.gateway.invoke({ namespace: "dsmmProfiles", method: "describe", args: {} }), (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/definition-unavailable");
  } finally { await f.dispose(); }
});

test("native controller reconciles a valid external selection while retaining existing Agent policy", async () => {
  const f = await fixture();
  let external: Awaited<ReturnType<typeof anotherHost>> | undefined;
  try {
    const { a, b } = await savedPair(f);
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh(); await controller.open(a.id); await controller.apply();
    const existing = { session: Session.create(SessionId("cross-host-existing-a")) } as unknown as DshAgent;
    assert.equal(f.runtime.getSettings(existing).workflow.reviewCap, 1);
    external = await anotherHost(f.store.profileDir);
    await external.select(b.id, b.revision);
    await controller.refresh();
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, "a");
    assert.equal(controller.store.getSnapshot().snapshot?.selectionError?.code, "conflict");
    assert.equal(canReconcileSelection(controller.store.getSnapshot().snapshot), true);
    await controller.open(b.id); await controller.apply();
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, "b");
    assert.equal(controller.store.getSnapshot().snapshot?.selectionError, undefined);
    assert.equal(controller.store.getSnapshot().notice?.key, "applied");
    assert.equal(f.runtime.getSettings({ session: Session.create(SessionId("cross-host-new-b")) } as unknown as DshAgent).workflow.reviewCap, 4);
    assert.equal(f.runtime.getSettings(existing).workflow.reviewCap, 1);
    controller.dispose();
  } finally { await external?.dispose(); await f.dispose(); }
});

test("controller can reapply its Host-current profile and reset baseline after a valid external change", async () => {
  const f = await fixture();
  let external: Awaited<ReturnType<typeof anotherHost>> | undefined;
  try {
    const { a, b } = await savedPair(f);
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh(); await controller.open(a.id); await controller.apply();
    external = await anotherHost(f.store.profileDir);
    await external.select(b.id, b.revision); await controller.refresh(); await controller.apply();
    assert.equal(controller.store.getSnapshot().snapshot?.selectionError, undefined);
    assert.equal((await f.store.describe()).selectedId, "a");
    await controller.reset();
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, null);
    await external.select(b.id, b.revision); await controller.refresh();
    assert.equal(controller.store.getSnapshot().snapshot?.selectedId, null);
    assert.equal(controller.store.getSnapshot().snapshot?.selectionError?.code, "conflict");
    await controller.reset();
    assert.equal(controller.store.getSnapshot().notice?.key, "reset");
    assert.equal(controller.store.getSnapshot().snapshot?.selectionError, undefined);
    assert.equal((await f.store.describe()).selectedId, null);
    controller.dispose();
  } finally { await external?.dispose(); await f.dispose(); }
});

test("corrupt selection remains immutable and an errored selection response never announces apply", async () => {
  const f = await fixture();
  let external: Awaited<ReturnType<typeof anotherHost>> | undefined;
  try {
    const { a, b } = await savedPair(f);
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh(); await controller.open(a.id); await controller.apply();
    external = await anotherHost(f.store.profileDir);
    const describe = f.store.describe.bind(f.store);
    let changeOnDescribe = true;
    f.store.describe = async () => {
      if (changeOnDescribe) { changeOnDescribe = false; await external!.select(b.id, b.revision); }
      return describe();
    };
    await controller.apply();
    assert.equal(controller.store.getSnapshot().snapshot?.selectionError?.code, "conflict");
    assert.equal(controller.store.getSnapshot().notice, null);
    assert.equal(controller.store.getSnapshot().issue?.code, "conflict");
    const pointer = join(f.store.profileDir, ".selection.json");
    await writeFile(pointer, "corrupt selection", "utf8");
    await controller.refresh();
    assert.equal(controller.store.getSnapshot().snapshot?.selectionRevision, "unavailable");
    assert.equal(canReconcileSelection(controller.store.getSnapshot().snapshot), false);
    await controller.apply(); await controller.reset();
    assert.equal(await readFile(pointer, "utf8"), "corrupt selection");
    assert.equal(controller.store.getSnapshot().notice, null);
    controller.dispose();
  } finally { await external?.dispose(); await f.dispose(); }
});

test("invalid new IDs produce field validation without a native RPC write", async () => {
  const f = await fixture();
  try {
    const controller = new ProfilesController(f.remote.dsmmProfiles);
    await controller.refresh(); await controller.actions.create();
    // If the client attempts transport, this becomes a transport error instead.
    f.offline(true);
    for (const id of ["Uppercase", "con", "a".repeat(65)]) {
      controller.actions.editId(id); await controller.save();
      assert.equal(controller.store.getSnapshot().issue?.kind, "domain");
      assert.equal(controller.store.getSnapshot().issue?.code, "validation");
      assert.equal(controller.store.getSnapshot().issue?.field, "id");
      assert.equal(controller.store.getSnapshot().editor?.id, id);
      assert.equal(controller.store.getSnapshot().notice, null);
    }
    assert.equal((await f.store.describe()).profiles.length, 0);
    controller.dispose();
  } finally { await f.dispose(); }
});

test("genuine native Remote refuses unpaired UTF16 without changing bytes or admitted selection", async () => {
  const f = await fixture();
  try {
    const { a } = await savedPair(f);
    const selection = await f.remote.dsmmProfiles.select({ id: a.id, expectedRevision: a.revision, expectedSelectionRevision: (await f.runtime.describe()).selectionRevision });
    assert.ok(selection.ok);
    const bytes = await readFile(join(f.store.profileDir, "a.jsonc"));
    const pointer = await readFile(join(f.store.profileDir, ".selection.json"));
    for (const content of [`{"version":1,"id":"a","label":"\uD800","settings":{}}`, a.content + `\n// \uD800\n`]) {
      const response = await f.remote.dsmmProfiles.save({ id: a.id, content, expectedRevision: a.revision });
      assert.equal(response.ok, false);
      if (response.ok || response.error.code !== "dsmm-profiles/refused") assert.fail("Expected structured profile validation refusal");
      assert.equal(response.error.details.code, "validation");
      assert.equal(response.error.details.field, "content");
      assert.deepEqual(await readFile(join(f.store.profileDir, "a.jsonc")), bytes);
      assert.deepEqual(await readFile(join(f.store.profileDir, ".selection.json")), pointer);
      assert.equal((await f.runtime.describe()).appliedRevision, a.revision);
    }
  } finally { await f.dispose(); }
});
