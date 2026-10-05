import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";
import * as Cordis from "@deepseek-ai/cordis";
import { Context } from "@deepseek-ai/cordis";
import * as SlotCore from "@deepseek-ai/dsh-client-ui-slots";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import type * as ConnectionClient from "@deepseek-ai/dsh-client-connection/client";
import type * as RendererClient from "@deepseek-ai/dsh-client-ui-renderer/client";
import type * as LocaleClient from "@deepseek-ai/dsh-client-locale/client";
import type { SlotComponent, ComposedProps } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesInjected } from "../lib/client/ProfilesSection.js";
import { NS, en, zh } from "../lib/client/locales.js";
import { registerProfilesRpc } from "../lib/profile-rpc.js";
import { ProfileStore } from "../lib/profile-store.js";
import { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { resolveConfig } from "../lib/settings.js";
import type { DshContext } from "../lib/dsh-types.js";

const require = createRequire(import.meta.url);
type ClientPlugin = { inject: string[]; apply(ctx: Context): void | Promise<void> };
type StyleNode = { dataset: Record<string, string>; textContent: string; remove(): void };

// Startup-only DOM/render seams. Real SlotRegistry, LocaleRuntime, Connection,
// Gateway, Typert codecs and Cordis fibers run unchanged; this is not browser QA.
function startupDocument() {
  const styles = new Set<StyleNode>();
  return { styles, document: {
    createElement(tag: string): StyleNode {
      assert.equal(tag, "style");
      const node = { dataset: {}, textContent: "", remove() { styles.delete(node); } };
      return node;
    },
    head: { append(node: StyleNode) { styles.add(node); } },
  } };
}

async function nativeClient<T>(packageName: string, document: ReturnType<typeof startupDocument>["document"], sourceOverride?: string): Promise<T> {
  const source = sourceOverride ?? await readFile(join(dirname(require.resolve(`${packageName}/package.json`)), "lib/client.js"), "utf8");
  let factory: ((require: (id: string) => unknown) => T) | undefined;
  const realm = createContext({ crypto: globalThis.crypto, AbortController, AbortSignal, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, console,
    ...(packageName === "@dsmm/dsmm" ? { document } : {}),
    window: { __ModuleLoader__: { load(row: { factory: typeof factory }) { factory = row.factory; } } },
  });
  runInContext(source, realm);
  delete realm.window;
  assert.ok(factory, `${packageName} must register its actual lazy-CJS factory`);
  const notRendering = () => { throw new Error("Startup regression must not pretend to render a browser UI"); };
  return factory((id) => {
    if (id === "@deepseek-ai/cordis") return Cordis;
    if (id === "@deepseek-ai/dsh-client-ui-slots") return SlotCore;
    if (id === "react-dom") return { flushSync: notRendering };
    if (id === "react-dom/client") return { createRoot: notRendering, hydrateRoot: notRendering };
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return { Button: notRendering, Input: notRendering };
    if (id === "@deepseek-ai/dsh-client-store") return { defineStore: notRendering };
    assert.ok(["react", "react/jsx-runtime"].includes(id), `unexpected native runtime dependency ${id}`);
    return require(id);
  });
}

const SettingsShell: SlotComponent<ComposedProps<"root", string, "settings.section" | "conversation.header.leading", undefined, object>> = (props) => [props.renderSlot("settings.section", { close() {} }), props.renderSlot("conversation.header.leading", {})];

async function fixture(sourceOverride?: string, deferUi = false) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-client-startup-"));
  const host = new Context();
  const client = new Context();
  const dom = startupDocument();
  try {
    await Promise.all([host.plugin(TypertRegistry).await(), host.plugin(TypertGatewayService, {}).await(), client.plugin(TypertRegistry).await()]);
    const store = new ProfileStore(join(root, "dsmm-profiles"));
    const runtime = new DsmmProfileRuntime(host as unknown as DshContext, resolveConfig(), store);
    await runtime.initialize();
    await host.plugin({ name: "native-profile-host", inject: ["typert"], apply(ctx: Context) { registerProfilesRpc(ctx, runtime); } }).await();
    const gateway = host.typertGateway;
    gateway.registerRemoteEvents(async function* (signal) { await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })); }, { home: "isolated-startup-test" });
    const calls: string[] = [];
    const connection = await nativeClient<typeof ConnectionClient>("@deepseek-ai/dsh-client-connection", dom.document);
    connection.installConnection(client, { transport: { ownsHost: true, rpc: {
      async call(channel, endpoint, payload, signal) {
        assert.equal(channel, "/api");
        if (endpoint.startsWith("dsmmProfiles/")) calls.push(endpoint);
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
    const remoteModule = await nativeClient<ClientPlugin>("@deepseek-ai/dsh-api-gateway", dom.document);
    const remoteFiber = client.plugin(remoteModule);
    await remoteFiber.await();
    const renderer = await nativeClient<typeof RendererClient>("@deepseek-ai/dsh-client-ui-renderer", dom.document);
    const locale = await nativeClient<typeof LocaleClient>("@deepseek-ai/dsh-client-locale", dom.document);
    const productionSource = sourceOverride ?? await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
    const production = await nativeClient<ClientPlugin>("@dsmm/dsmm", dom.document, productionSource);
    async function installUi() {
      await client.plugin(renderer).await();
      await client.plugin({ name: "native-standalone-locale", apply(ctx: Context) { ctx.provide("locale", new locale.LocaleRuntime(ctx)); } }).await();
    }
    if (!deferUi) await installUi();
    const entry = client.plugin(production);
    return { host, client, production, entry, remoteFiber, calls, styles: dom.styles, installUi,
      declareSettings: () => client.slots.register({ name: "root", children: { "settings.section": { kind: "list", scope: "root" }, "conversation.header.leading": { kind: "single", scope: "root" } } }, SettingsShell),
      async dispose() { await client.fiber.dispose(); await host.fiber.dispose(); await rm(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    await client.fiber.dispose(); await host.fiber.dispose(); await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function namespaceChild(f: Awaited<ReturnType<typeof fixture>>) {
  const fibers = [...f.client.registry.values()].flatMap((runtime) => [...runtime.fibers]);
  const children = fibers.filter((fiber) => fiber.parent.fiber.uid === f.entry.uid && Object.hasOwn(fiber.inject, "remote.dsmmProfiles"));
  assert.equal(children.length, 1, "the production entry must own exactly one native namespace injection");
  return children[0];
}

function profilesFace(f: Awaited<ReturnType<typeof fixture>>): ProfilesInjected {
  const entries = f.client.slots.entries("settings.section").filter((entry) => entry.options.id === "dsmm-profiles");
  assert.equal(entries.length, 1, "one native settings registration per declaration lifetime");
  assert.ok(entries[0].inject);
  const face = entries[0].inject();
  assert.ok("hooks" in face && "refresh" in face && "save" in face && "apply" in face);
  return face as unknown as ProfilesInjected;
}

async function settled(face: ProfilesInjected): Promise<void> {
  for (let round = 0; round < 1000 && face.hooks.profiles.getSnapshot().busy !== null; round++) await setImmediate();
  assert.equal(face.hooks.profiles.getSnapshot().busy, null, "native profile request must settle");
}

async function replayUninjectedClient(): Promise<string> {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  const start = source.indexOf("// src/client/index.ts");
  assert.ok(start >= 0);
  const apply = source.slice(start);
  const opening = 'await ctx.inject(["remote.dsmmProfiles"], (profileCtx) => {';
  const closing = "    void controller.refresh();\n  });";
  assert.ok(apply.includes(opening) && apply.includes(closing), "replay must remove exactly the production namespace injection");
  // Toggle only the production DI boundary in memory, preserving the real
  // mounted contribution, native services and every controller operation.
  return source.slice(0, start) + apply.replace(opening, "{").replace(closing, "    void controller.refresh();\n  }").replaceAll("profileCtx.", "ctx.");
}

test("profile locales use exact Deepwork display copy while preserving the technical namespace", () => {
  assert.equal(NS, "settings.dsmm-profiles");
  assert.equal(en.title, "Deepwork Profiles");
  assert.equal(zh.title, "Deepwork 配置档");
  assert.equal(en.unavailable, "The native profile service is unavailable. Your draft is kept. Refresh after the Host reconnects or Deepwork is enabled.");
  assert.equal(zh.unavailable, "原生配置档服务不可用。草稿已保留。Host 重新连接或启用 Deepwork 后请刷新。");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), "both locales retain the complete profile vocabulary");
});

test("compiled native settings metadata follows exact English and Chinese Deepwork labels under the original section ID", async () => {
  const f = await fixture();
  try {
    f.declareSettings();
    await f.entry.await();
    await namespaceChild(f).await();
    const rows = f.client.slots.entries("settings.section");
    assert.equal(rows.length, 1);
    const section = rows[0];
    assert.equal(section.options.id, "dsmm-profiles");
    assert.equal(section.options.order, 30);
    assert.equal(section.locale, "settings.dsmm-profiles");
    assert.equal(SlotCore.resolveSlotLabel(section.options.label), "Deepwork Profiles");
    f.client.locale.setLocale("zh");
    assert.equal(SlotCore.resolveSlotLabel(section.options.label), "Deepwork 配置档");
    assert.equal(f.client.slots.entries("settings.section").length, 1, "changing display locale must not duplicate the native section");
    f.client.locale.setLocale("en");
    assert.equal(SlotCore.resolveSlotLabel(section.options.label), "Deepwork Profiles");
    assert.equal(section.options.id, "dsmm-profiles");
    await settled(profilesFace(f));
  } finally { await f.dispose(); }
});

test("replaying the uninjected production client reproduces the frozen native startup refusal", async () => {
  const f = await fixture(await replayUninjectedClient());
  try {
    f.declareSettings();
    await assert.rejects(f.entry.await(), /cannot get property "remote\.dsmmProfiles" without inject/u);
    assert.equal(f.entry.state, 3);
    assert.deepEqual(f.calls, [], "dependency refusal happens before native business calls");
    assert.equal(f.styles.size, 0);
    assert.equal(f.client.slots.entries("settings.section").length, 0);
  } finally { await f.dispose(); }
});

test("production client activates after mounting the independently injected native profile namespace", async () => {
  const f = await fixture();
  try {
    const collapseSettings = f.declareSettings();
    await f.entry.await();
    assert.equal(f.entry.state, 2);
    assert.deepEqual(Array.from(f.production.inject), ["slots", "locale", "remote"], "the namespace cannot be an initial self-dependency");
    const child = namespaceChild(f);
    await child.await();
    assert.equal(child.state, 2);
    assert.equal(f.styles.size, 1);
    assert.equal(f.client.locale.bind(NS)("title"), en.title, "parent locale injection remains available in the native child");
    const face = profilesFace(f);
    await settled(face);
    assert.equal(face.hooks.profiles.getSnapshot().snapshot?.selectionRevision, "absent");
    assert.equal(face.hooks.profiles.getSnapshot().issue, null);
    assert.deepEqual(f.calls, ["dsmmProfiles/describe"]);
    await face.create();
    face.editId("native-startup");
    await face.save();
    assert.equal(face.hooks.profiles.getSnapshot().notice?.key, "saved");
    assert.equal(face.hooks.profiles.getSnapshot().snapshot?.selectedId, null, "saving is not applying");
    await face.apply();
    assert.equal(face.hooks.profiles.getSnapshot().snapshot?.selectedId, "native-startup");
    await collapseSettings();
    assert.equal(f.client.slots.entries("settings.section").length, 0);
    const collapseReplacement = f.declareSettings();
    assert.equal(profilesFace(f).hooks.profiles, face.hooks.profiles, "slot re-arrival does not duplicate the controller");
    await f.entry.dispose();
    assert.equal(f.styles.size, 0);
    assert.equal(f.client.locale.bind(NS)("title"), "title");
    assert.equal(f.client.slots.entries("settings.section").length, 0);
    assert.equal(f.client.get("remote.dsmmProfiles"), undefined, "the mounted contribution belongs to the production entry");
    const calls = f.calls.length;
    const snapshot = face.hooks.profiles.getSnapshot();
    await face.refresh(); await face.save(); await face.apply(); await face.reset();
    assert.equal(f.calls.length, calls, "retained actions cannot send requests after their owner disposes");
    assert.equal(face.hooks.profiles.getSnapshot(), snapshot);
    await collapseReplacement();
  } finally { await f.dispose(); }
});

test("profile icon uses the persistent root leading slot at fallback priority and yields to foreign navigation", async () => {
  const f = await fixture();
  try {
    f.declareSettings(); await f.entry.await(); await namespaceChild(f).await();
    const leading = f.client.slots.entries("conversation.header.leading"); assert.equal(leading.length, 1);
    assert.equal(f.client.slots.spec("conversation.header.leading")?.scope, "root");
    assert.equal(leading[0].options.priority, Number.MAX_SAFE_INTEGER, "native lowest-numeric winner gives this entry the lowest precedence");
    assert.deepEqual(f.client.slots.entriesOfSlot("conversation.header.leading"), leading);
    assert.equal(f.client.slots.entries("conversation.session.header.utilities").length, 0, "there is only one profile control, not an active-only duplicate");
    const ForeignNavigation = () => null;
    const withdrawForeign = f.client.slots.register({ name: "conversation.header.leading", priority: 0 }, ForeignNavigation);
    assert.equal(f.client.slots.entriesOfSlot("conversation.header.leading")[0].component, ForeignNavigation, "foreign native navigation remains the active owner");
    withdrawForeign(); assert.equal(f.client.slots.entriesOfSlot("conversation.header.leading")[0], leading[0]);
  } finally { await f.dispose(); }
});

test("production client waits for genuine native UI providers before mounting its namespace", async () => {
  const f = await fixture(undefined, true);
  try {
    await f.entry.await();
    assert.equal(f.entry.state, 0);
    assert.equal(f.client.get("remote.dsmmProfiles"), undefined);
    assert.equal(f.styles.size, 0);
    assert.deepEqual(f.calls, []);
    await f.installUi();
    await f.entry.await();
    await namespaceChild(f).await();
    assert.equal(f.entry.state, 2);
    assert.equal(f.client.slots.entries("settings.section").length, 0);
    f.declareSettings();
    await settled(profilesFace(f));
    assert.equal(f.styles.size, 1);
  } finally { await f.dispose(); }
});

test("native namespace withdrawal disposes its UI and remote re-arrival installs one fresh controller", async () => {
  const f = await fixture();
  try {
    f.declareSettings();
    await f.entry.await();
    const child = namespaceChild(f);
    await child.await();
    const old = profilesFace(f);
    await settled(old);
    let notifications = 0;
    old.hooks.profiles.subscribe(() => notifications++);
    const namespace = [...f.client.registry.values()].flatMap((runtime) => [...runtime.fibers])
      .find((fiber) => fiber.runtime?.name === "remote.dsmmProfiles");
    assert.ok(namespace);
    await namespace.dispose();
    await child.await();
    assert.equal(child.state, 0, "only the namespace-dependent child stops when that service withdraws");
    assert.equal(f.entry.state, 2);
    assert.equal(f.client.get("remote.dsmmProfiles"), undefined);
    assert.equal(f.styles.size, 0);
    assert.equal(f.client.locale.bind(NS)("title"), "title");
    assert.equal(f.client.slots.entries("settings.section").length, 0);
    const calls = f.calls.length;
    const snapshot = old.hooks.profiles.getSnapshot();
    await old.refresh(); await old.save(); await old.apply(); await old.reset();
    assert.equal(f.calls.length, calls);
    assert.equal(old.hooks.profiles.getSnapshot(), snapshot);
    assert.equal(notifications, 0);
    // Recreate the genuine Gateway provider, not a fabricated namespace value.
    await f.remoteFiber.restart();
    await f.entry.await();
    const replacement = namespaceChild(f);
    await replacement.await();
    assert.equal(replacement.state, 2);
    const current = profilesFace(f);
    assert.notEqual(current.hooks.profiles, old.hooks.profiles);
    await settled(current);
    assert.equal(current.hooks.profiles.getSnapshot().issue, null);
    assert.equal(f.styles.size, 1);
    assert.equal(f.client.locale.bind(NS)("title"), en.title);
    assert.deepEqual(f.calls, ["dsmmProfiles/describe", "dsmmProfiles/describe"]);
  } finally { await f.dispose(); }
});

test("unloading the client cancels a namespace-owned pending settings declaration wait", async () => {
  const f = await fixture();
  try {
    await f.entry.await();
    await namespaceChild(f).await();
    assert.equal(f.styles.size, 1);
    await f.entry.dispose();
    assert.equal(f.styles.size, 0);
    f.declareSettings();
    assert.equal(f.client.slots.entries("settings.section").length, 0);
    assert.equal(f.client.locale.bind(NS)("title"), "title");
  } finally { await f.dispose(); }
});
