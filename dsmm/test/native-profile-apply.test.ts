import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import * as Cordis from "@deepseek-ai/cordis";
import { Context } from "@deepseek-ai/cordis";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import type {} from "@deepseek-ai/dsh-api-gateway/client";
import * as NativeConnection from "@deepseek-ai/dsh-client-connection";
import { LlmError, LlmRuntime, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { LlmResolvedModelInfo } from "@deepseek-ai/dsh-llm";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { build } from "esbuild";
import type { DshAgent } from "../src/dsh-types.ts";
import type { DsmmProfilesRemote } from "../src/profile-remote.ts";
import type { DsmmProfileRuntime } from "../src/profile-runtime.ts";
import { ProfileStore } from "../src/profile-store.ts";
import type { ProfileSnapshot, SessionProfileSnapshot } from "../src/profile-types.ts";
import type { DsmmProfileOverlay } from "../src/profiles.ts";
import type { DsmmPluginConfig } from "../src/settings.ts";
import "./profile-apply-source-loader.mjs";

const { RoutingFixtureAdapter, nativeFixturePlugin, nativeRoutingFixture } = await import("./native-routing-fixture.ts");

const require = createRequire(import.meta.url);
const nativeRequire = createRequire(require.resolve("@deepseek-ai/dsh-client-connection/package.json"));
const { CredentialProvider } = nativeRequire("@deepseek-ai/dsh-credentials");

class MemoryCredentials extends CredentialProvider {
  private readonly records = new Map<string, unknown>();
  async modifyRecord(key: string, modify: (value: unknown) => Promise<unknown>) {
    const value = await modify(this.records.get(key));
    if (value !== undefined) this.records.set(key, value);
    return this.records.get(key);
  }
}

/** Finite provider/model metadata; no unlisted route is considered available. */
class CatalogAdapter extends RoutingFixtureAdapter {
  beforeResolve?: (provider: string, model: string) => Promise<void>;
  readonly resolutions: Array<{ provider: string; model: string; code?: string }> = [];
  readonly catalog = new Map([
    ["fixture/native-default", ["low", "high"]],
    ["fixture/profile-a", ["high"]],
    ["fixture/profile-b", ["low", "high"]],
  ]);
  override async listModels(provider: string) {
    return Promise.all([...this.catalog.keys()].filter(key => key.startsWith(`${provider}/`))
      .map(key => this.resolveModel(provider, key.slice(provider.length + 1))));
  }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    await this.beforeResolve?.(provider, model);
    const efforts = this.catalog.get(`${provider}/${model}`);
    this.resolutions.push({ provider, model, ...(efforts === undefined ? { code: "UNKNOWN_MODEL" } : {}) });
    if (efforts === undefined) throw new LlmError("Unlisted fixture route", "UNKNOWN_MODEL");
    return { provider, id: model, name: model, inputModalities: ["text"],
      reasoning: { efforts: efforts.map(id => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } };
  }
}

async function fixture(config: DsmmPluginConfig = {}, metadataOnly = false) {
  const adapter = new CatalogAdapter();
  const metadataFailures: Array<{ code?: string; provider: string; model: string; reasoningEffort?: string }> = [];
  const metadataCalls: Array<{ provider: string; model: string; reasoningEffort?: string }> = [];
  const native = await nativeRoutingFixture(config, { adapter, headless: true, nativePresets: !metadataOnly, persistence: true,
    nativeFs: !metadataOnly, nativeJobs: !metadataOnly, async beforeDsmm(ctx) {
      if (metadataOnly) return;
      for (const [name, peer, config] of [
        ["dsh-subprocess-local", undefined, {}],
        ["dsh-pwsh-local", undefined, { cwd: ctx.get("profileContext")!.dir }],
        ["dsh-shell-env", undefined, { dshHome: ctx.get("profileContext")!.home }],
        ["dsh-web", "@deepseek-ai/dsh-tool-web", {}],
      ] as const) {
        const plugin = await nativeFixturePlugin(`@deepseek-ai/${name}`, peer);
        await ctx.plugin(plugin.default ?? plugin, config).await();
      }
    } });
  const resolve = LlmRuntime.prototype.resolveCallConfig;
  const observation = mock.method(LlmRuntime.prototype, "resolveCallConfig", async function (this: LlmRuntime, ...args: Parameters<typeof resolve>) {
    metadataCalls.push({ ...args[0] });
    try { return await resolve.apply(this, args); }
    catch (error) {
      metadataFailures.push({ provider: args[0].provider, model: args[0].model, reasoningEffort: args[0].reasoningEffort,
        code: error instanceof LlmError ? error.code : undefined });
      throw error;
    }
  });
  const client = new Context();
  try {
    await Promise.all([native.ctx.plugin(TypertRegistry).await(), native.ctx.plugin(TypertGatewayService, {}).await(), client.plugin(TypertRegistry).await()]);
    await native.ctx.plugin(MemoryCredentials).await();
    await native.ctx.plugin(NativeConnection).await();
    const gateway = native.ctx.typertGateway;
    gateway.registerRemoteEvents(async function* (signal) {
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    }, { home: "isolated-profile-apply" });
    const realm = createContext({ crypto: globalThis.crypto, AbortController, AbortSignal, URL, TextEncoder, TextDecoder,
      setTimeout, clearTimeout, queueMicrotask, console });
    const clone = runInContext("value => JSON.parse(value)", realm) as (value: string) => unknown;
    async function loadClient(packageName: string) {
      let factory: ((require: (id: string) => unknown) => any) | undefined;
      realm.window = { __ModuleLoader__: { load(row: { factory: typeof factory }) { factory = row.factory; } } };
      runInContext(await readFile(join(dirname(require.resolve(`${packageName}/package.json`)), "lib/client.js"), "utf8"), realm);
      delete realm.window;
      assert.ok(factory);
      return factory(id => { assert.equal(id, "@deepseek-ai/cordis"); return Cordis; });
    }
    const connection = await loadClient("@deepseek-ai/dsh-client-connection");
    connection.installConnection(client, { transport: { ownsHost: true, rpc: {
      async call(channel: string, endpoint: string, payload: { args: Record<string, unknown> }, signal: AbortSignal) {
        assert.equal(channel, "/api");
        const [namespace, method] = endpoint.split("/");
        try {
          const value = await gateway.invoke({ namespace, method, args: JSON.parse(JSON.stringify(payload.args)), signal });
          return clone(JSON.stringify({ ok: true, value }));
        } catch (error) {
          const failure = remoteErrorOf(error);
          if (failure === undefined) throw error;
          return clone(JSON.stringify({ ok: false, error: { code: failure.code, message: failure.message, details: failure.details } }));
        }
      },
      async *open(channel: string, endpoint: string, payload: unknown, signal: AbortSignal, uplink?: AsyncIterable<unknown>) {
        assert.equal(channel, "/api");
        yield* await gateway.wireStream.open(endpoint, payload, uplink ?? (async function* () {})(), undefined, signal);
      },
    } } });
    await client.plugin(await loadClient("@deepseek-ai/dsh-api-gateway")).await();
    const codecs = await build({ entryPoints: [fileURLToPath(new URL("../src/profile-remote.ts", import.meta.url))],
      bundle: true, write: false, format: "iife", globalName: "DsmmCodec", platform: "browser" });
    runInContext(codecs.outputFiles[0].text, realm);
    await client.remote.$mount(realm.DsmmCodec.TYPERT_REMOTE);
    const remote = client.remote.dsmmProfiles as DsmmProfilesRemote;
    const runtime = native.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    assert.ok(runtime);
    if (!metadataOnly) {
      const preset = await native.ctx.get("agentPresets")!.resolve("dsmm-orchestrator");
      assert.equal(preset.broken, undefined);
    }
    const store = ProfileStore.fromCentral(native.home, native.profileDir, runtime.admission().deployment!.entryId);
    return { native, adapter, runtime, remote, clone, store, metadataFailures, metadataCalls,
      async dispose() { observation.mock.restore(); await client.fiber.dispose(); await native.dispose(); } };
  } catch (error) { observation.mock.restore(); await client.fiber.dispose(); await native.dispose(); throw error; }
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}

test("finite native Gateway and cross-VM strict client save/read raw route JSON and preserve route metadata without completion", async () => {
  const parameters = { temperature: 0, maxTokens: 1, stop: [], custom_flag: false, custom_zero: 0, custom_null: null,
    custom_nested: { rows: [false, 0, null, {}, []] }, customParameters: { original_name: "data" } };
  const primary = { provider: "fixture", model: "profile-a", ...parameters };
  const f = await fixture({ defaultActive: true, roleRouting: { "dsmm-orchestrator": { primary } } }, true);
  try {
    const settings = { modelParameters: { passthrough: false }, roleRouting: { "dsmm-reviewer": { primary: { ...primary, reasoningEffort: "medium" },
      fallbackRoutes: [{ ...primary, custom_flag: true }, primary] } } };
    const saved = await save(f, "raw-route-data", settings);
    const read = value(await f.remote.read(saved.id));
    assert.deepEqual(JSON.parse(read.content).settings, settings);
    assert.equal((await ProfileStore.fromCentral(f.native.home, f.native.profileDir, f.runtime.admission().deployment!.entryId).read(saved.id)).content, saved.content);
    const root = await f.native.create({ agentPreset: "standard" });
    const snapshot = value(await f.remote.describeSession(root.id));
    const routing = snapshot.configuration!.settings.roleRouting as { "dsmm-orchestrator": { primary: unknown } };
    assert.deepEqual(JSON.parse(JSON.stringify(routing["dsmm-orchestrator"].primary)), primary);
    assert.deepEqual(f.runtime.admission(root as unknown as DshAgent).settings.roleRouting["dsmm-orchestrator"]!.primary, primary);
    assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});

function overlay(model: string): DsmmProfileOverlay {
  return { workflow: { reviewCap: model === "profile-a" ? 1 : 4 },
    roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model, reasoningEffort: "high" } } } };
}

async function save(f: Awaited<ReturnType<typeof fixture>>, id: string, settings: DsmmProfileOverlay) {
  return value(await f.remote.save(f.clone(JSON.stringify({ id, expectedRevision: null,
    content: JSON.stringify({ version: 1, id, settings }) })) as Parameters<DsmmProfilesRemote["save"]>[0]));
}

async function select(f: Awaited<ReturnType<typeof fixture>>, id: string, revision: string): Promise<ProfileSnapshot> {
  const before = value(await f.remote.describe());
  return value(await f.remote.select(f.clone(JSON.stringify({ id, expectedRevision: revision,
    expectedSelectionRevision: before.selectionRevision })) as Parameters<DsmmProfilesRemote["select"]>[0]));
}

test("finite native catalog and cross-VM RPC Apply default with no root and idle roots preserves old admissions", async () => {
  const f = await fixture();
  try {
    const a = await save(f, "a", overlay("profile-a"));
    const b = await save(f, "b", { ...overlay("profile-b"), modelParameters: { passthrough: false } });
    assert.equal(f.native.agents.list().length, 0);
    assert.equal((await select(f, "a", a.revision)).selectedId, "a");
    const oldRoot = await f.native.create({ agentPreset: "standard" });
    assert.equal(oldRoot.status, "idle");
    const nativeChoice = structuredClone(oldRoot.options);
    const oldAdmission = f.runtime.admission(oldRoot as unknown as DshAgent);
    assert.equal((await select(f, "b", b.revision)).selectedId, "b");
    const newRoot = await f.native.create({ agentPreset: "standard" });
    assert.equal(f.runtime.admission(oldRoot as unknown as DshAgent), oldAdmission);
    assert.equal(oldAdmission.profile?.id, "a");
    assert.equal(f.runtime.admission(newRoot as unknown as DshAgent).profile?.id, "b");
    assert.equal(oldAdmission.settings.modelParameters.passthrough, true);
    assert.equal(value(await f.remote.describeSession(newRoot.id)).configuration!.modelParameterPolicy?.mode, "native-defaults");
    assert.deepEqual(JSON.parse(JSON.stringify(value(await f.remote.describeSession(newRoot.id)).configuration!.settings.modelParameters)), { passthrough: false });
    assert.equal(f.metadataCalls.length, 0);
    assert.deepEqual(oldRoot.options, nativeChoice);
    assert.equal(f.adapter.resolutions.length, 0);
    assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});

test("finite native catalog and cross-VM RPC session Apply uses native maintenance without changing default or another root", async () => {
  const f = await fixture();
  try {
    const a = await save(f, "a", overlay("profile-a"));
    const b = await save(f, "b", { ...overlay("profile-b"), modelParameters: { passthrough: false } });
    await select(f, "a", a.revision);
    const root = await f.native.create({ agentPreset: "standard" });
    const other = await f.native.create({ agentPreset: "standard" });
    const nativeChoice = structuredClone(root.options);
    const otherAdmission = f.runtime.admission(other as unknown as DshAgent);
    const global = value(await f.remote.describe());
    const before = value(await f.remote.describeSession(root.id));
    const request = f.clone(JSON.stringify({ sessionId: root.id, id: "b", expectedRevision: b.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch })) as Parameters<DsmmProfilesRemote["selectSession"]>[1];
    const applied: SessionProfileSnapshot = value(await f.remote.selectSession(root.id, request));
    assert.equal(applied.selection.selectedId, "b");
    assert.notEqual(applied.admissionEpoch, before.admissionEpoch);
    assert.equal(applied.scope, "session-override");
    assert.equal(applied.configuration!.modelParameterPolicy?.mode, "native-defaults");
    assert.deepEqual(JSON.parse(JSON.stringify(applied.configuration!.settings.modelParameters)), { passthrough: false });
    assert.equal(otherAdmission.settings.modelParameters.passthrough, true);
    assert.equal(f.metadataCalls.length, 0);
    assert.equal(f.runtime.admission(root as unknown as DshAgent).profile?.id, "b");
    assert.equal(f.runtime.admission(other as unknown as DshAgent), otherAdmission);
    assert.deepEqual(root.options, nativeChoice);
    assert.deepEqual(value(await f.remote.describe()), global);
    const stale = await f.remote.selectSession(root.id, request);
    assert.ok(!stale.ok);
    const failure = remoteErrorOf(stale.error);
    assert.ok(failure?.code === "dsmm-profiles/refused");
    assert.equal(failure.details.code, "conflict");
    assert.equal(f.adapter.calls.length, 0);
    await f.native.disposeAgent(root);
    const resumed = await f.native.agents.resume({ resumeSessionId: root.id, agentOptions: root.options,
      async setup(scope) { await f.native.ctx.get("agentPresets")!.mount(scope, "standard"); } });
    try {
      assert.notEqual(resumed.agent, root);
      const reopened = value(await f.remote.describeSession(resumed.agent.id));
      assert.equal(reopened.admissionEpoch, applied.admissionEpoch);
      assert.equal(reopened.selection.appliedRevision, b.revision);
      assert.equal(reopened.scope, "session-override");
    } finally { await resumed.dispose(); }
  } finally { await f.dispose(); }
});

test("cross-VM Apply preserves unknown provider/model and unadvertised effort without metadata I/O", async () => {
  const f = await fixture();
  try {
    const a = await save(f, "a", overlay("profile-a"));
    await select(f, "a", a.revision);
    const root = await f.native.create({ agentPreset: "standard" });
    for (const [id, route] of [
      ["provider", { provider: "unregistered", model: "profile-b", reasoningEffort: "high" }],
      ["model", { provider: "fixture", model: "unlisted", reasoningEffort: "high" }],
      ["effort", { provider: "fixture", model: "profile-a", reasoningEffort: "max" }],
    ] as const) {
      const draft = await save(f, id, { roleRouting: { "dsmm-reviewer": { primary: route } } });
      for (const entry of ["default", "session"] as const) {
        const admitted = f.runtime.admission(root as unknown as DshAgent);
        const global = value(await f.remote.describe());
        const session = value(await f.remote.describeSession(root.id));
        const request = { id, expectedRevision: draft.revision, expectedSelectionRevision: entry === "default" ? global.selectionRevision : session.selection.selectionRevision };
        const result = entry === "default" ? await f.remote.select(request)
          : await f.remote.selectSession(root.id, { ...request, sessionId: root.id, expectedAdmissionEpoch: session.admissionEpoch });
        assert.ok(result.ok, JSON.stringify(result));
        assert.deepEqual(f.runtime.admission(entry === "default" ? undefined : root as unknown as DshAgent).settings.roleRouting["dsmm-reviewer"]?.primary, route);
        if (entry === "default") assert.equal(f.runtime.admission(root as unknown as DshAgent), admitted);
        else assert.equal((await f.store.loadSelection()).selectionRevision, global.selectionRevision);
        assert.equal(f.metadataCalls.length, 0);
        assert.equal(f.metadataFailures.length, 0);
      }
    }
  } finally { await f.dispose(); }
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test("pending native session Apply fails closed on draft edits, cancellation, operator change and Agent disposal", async t => {
  for (const change of ["draft", "cancel", "operator", "dispose"] as const) {
    await t.test(change, async t => {
      const f = await fixture();
      const entered = gate(), held = gate();
      let pending: Promise<unknown> | undefined;
      let disposing: Promise<void> | undefined;
      try {
        const draft = await save(f, "b", overlay("profile-b"));
        const root = await f.native.create({ agentPreset: "standard" });
        const admitted = f.runtime.admission(root as unknown as DshAgent);
        const before = value(await f.remote.describeSession(root.id));
        // Pause the real transaction after candidate validation, before its commit fence.
        const selectSession = ProfileStore.prototype.selectSession;
        t.mock.method(ProfileStore.prototype, "selectSession", function (this: ProfileStore, ...args: Parameters<ProfileStore["selectSession"]>) {
          const [request, epoch, validateCandidate, commit] = args;
          return selectSession.call(this, request, epoch, async document => {
            const prepared = await validateCandidate(document);
            entered.release();
            await held.promise;
            return prepared;
          }, commit);
        });
        const request = { sessionId: root.id, id: "b", expectedRevision: draft.revision,
          expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch };
        const controller = new AbortController();
        const applying = f.native.ctx.typertGateway.invoke({ namespace: "dsmmProfiles", method: "selectSession",
          args: { sessionId: root.id, request }, signal: controller.signal }).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
        pending = applying;
        assert.equal(await Promise.race([entered.promise.then(() => true), applying.then(() => false)]), true,
          "Apply must reach candidate validation before the concurrent change");
        if (change === "draft") await writeFile(join(f.store.profileDir, "b.jsonc"), JSON.stringify({ version: 1, id: "b", settings: overlay("profile-a") }));
        else if (change === "cancel") controller.abort();
        else if (change === "operator") {
          const connection = Reflect.get(f.native.ctx.connection, Cordis.symbols.original) ?? f.native.ctx.connection;
          Reflect.set(connection, "operator", { id: connection.operator.id, ctx: f.native.ctx, async dispose() {} });
        } else { disposing = f.native.disposeAgent(root); await setImmediate(); }
        held.release();
        const result = await applying;
        await disposing;
        assert.ok(!result.ok, `${change} must not publish a late session admission`);
        assert.equal((await f.store.loadSessionSelection(root.id)).admissionEpoch, null);
        assert.equal((await f.store.loadSelection()).selectedId, null);
        if (change !== "dispose") assert.equal(f.runtime.admission(root as unknown as DshAgent), admitted);
      } finally {
        held.release();
        try { await pending; await disposing; }
        finally { await f.dispose(); }
      }
    });
  }
});

test("documenting baseline and named overlay retain exact routes independently without metadata I/O", async () => {
  const baselineRoute = { provider: "fixture", model: "profile-b", reasoningEffort: "low" };
  const overlayRoute = { provider: "fixture", model: "profile-a", reasoningEffort: "high" };
  const f = await fixture({ roleRouting: { "dsmm-documenting": { primary: baselineRoute } } });
  try {
    assert.deepEqual(f.runtime.admission().settings.roleRouting["dsmm-documenting"]?.primary, baselineRoute);
    const inherited = await save(f, "inherited-doc", {});
    const overridden = await save(f, "overridden-doc", { roleRouting: { "dsmm-documenting": { primary: overlayRoute } } });
    await select(f, inherited.id, inherited.revision);
    assert.equal(f.metadataCalls.length, 0);
    const root = await f.native.create({ agentPreset: "standard" });
    const oldAdmission = f.runtime.admission(root as unknown as DshAgent);
    f.metadataCalls.length = 0;
    await select(f, overridden.id, overridden.revision);
    assert.deepEqual(f.runtime.admission().settings.roleRouting["dsmm-documenting"]?.primary, overlayRoute);
    assert.equal(f.metadataCalls.length, 0);
    assert.equal(f.metadataCalls.some(route => route.model === baselineRoute.model), false);
    assert.equal(f.runtime.admission(root as unknown as DshAgent), oldAdmission);
    const before = value(await f.remote.describeSession(root.id));
    f.metadataCalls.length = 0;
    value(await f.remote.selectSession(root.id, { sessionId: root.id, id: overridden.id, expectedRevision: overridden.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }));
    assert.deepEqual(f.runtime.admission(root as unknown as DshAgent).settings.roleRouting["dsmm-documenting"]?.primary, overlayRoute);
    assert.equal(f.metadataCalls.length, 0);
    assert.equal(f.metadataCalls.some(route => route.model === baselineRoute.model), false);
    const omittedRoute = { provider: "fixture", model: "profile-a" };
    const omitted = await save(f, "omitted-doc", { roleRouting: { "dsmm-documenting": { primary: omittedRoute } } });
    f.metadataCalls.length = 0;
    await select(f, omitted.id, omitted.revision);
    assert.deepEqual(f.runtime.admission().settings.roleRouting["dsmm-documenting"]?.primary, omittedRoute);
    assert.equal(f.metadataCalls.length, 0);
    const session = value(await f.remote.describeSession(root.id));
    f.metadataCalls.length = 0;
    value(await f.remote.selectSession(root.id, { sessionId: root.id, id: omitted.id, expectedRevision: omitted.revision,
      expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch }));
    assert.deepEqual(f.runtime.admission(root as unknown as DshAgent).settings.roleRouting["dsmm-documenting"]?.primary, omittedRoute);
    assert.equal(f.metadataCalls.length, 0);
    assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});

test("documenting role toggles preserve configured effort without model validation in either Apply domain", async () => {
  const f = await fixture({ roleRouting: { "dsmm-documenting": { primary: { provider: "fixture", model: "profile-a", reasoningEffort: "max" } } } });
  try {
    const draft = await save(f, "disabled-doc", { roles: { "dsmm-documenting": false } });
    await select(f, draft.id, draft.revision);
    assert.equal(f.runtime.admission().settings.roles["dsmm-documenting"], false);
    assert.equal(f.metadataCalls.some(route => route.model === "profile-a"), false);
    const root = await f.native.create({ agentPreset: "standard" });
    const before = value(await f.remote.describeSession(root.id));
    f.metadataCalls.length = 0;
    value(await f.remote.selectSession(root.id, { sessionId: root.id, id: draft.id, expectedRevision: draft.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }));
    assert.equal(f.runtime.admission(root as unknown as DshAgent).settings.roles["dsmm-documenting"], false);
    assert.equal(f.metadataCalls.some(route => route.model === "profile-a"), false);
    assert.equal(f.metadataFailures.length, 0);
    const enabled = await save(f, "enabled-doc", {});
    const current = value(await f.remote.describe());
    const admitted = f.runtime.admission(root as unknown as DshAgent);
    const session = value(await f.remote.describeSession(root.id));
    for (const domain of ["default", "session"] as const) {
      f.metadataFailures.length = 0;
      const request = { id: enabled.id, expectedRevision: enabled.revision,
        expectedSelectionRevision: domain === "default" ? current.selectionRevision : session.selection.selectionRevision };
      const result = domain === "default" ? await f.remote.select(request)
        : await f.remote.selectSession(root.id, { ...request, sessionId: root.id, expectedAdmissionEpoch: session.admissionEpoch });
      assert.ok(result.ok, JSON.stringify(result));
      assert.equal(f.metadataFailures.length, 0);
      assert.equal(f.metadataCalls.length, 0);
      assert.equal((await f.store.loadSelection()).selectedId, enabled.id);
      if (domain === "default") assert.equal(f.runtime.admission(root as unknown as DshAgent), admitted);
      else assert.equal(f.runtime.admission(root as unknown as DshAgent).settings.roles["dsmm-documenting"], true);
    }
  } finally { await f.dispose(); }
});

test("enabled documenting preserves unresolved routes in both Apply domains without consulting the model owner", async () => {
  const f = await fixture();
  try {
    const root = await f.native.create({ agentPreset: "standard" });
    for (const [id, route] of [
      ["doc-provider", { provider: "unregistered", model: "profile-b", reasoningEffort: "low" }],
      ["doc-model", { provider: "fixture", model: "unlisted-doc", reasoningEffort: "high" }],
      ["doc-effort", { provider: "fixture", model: "profile-a", reasoningEffort: "max" }],
    ] as const) {
      const draft = await save(f, id, { roleRouting: { "dsmm-documenting": { primary: route } } });
      for (const domain of ["default", "session"] as const) {
        const global = value(await f.remote.describe());
        const session = value(await f.remote.describeSession(root.id));
        f.metadataFailures.length = 0;
        const request = { id, expectedRevision: draft.revision,
          expectedSelectionRevision: domain === "default" ? global.selectionRevision : session.selection.selectionRevision };
        const result = domain === "default" ? await f.remote.select(request)
          : await f.remote.selectSession(root.id, { ...request, sessionId: root.id, expectedAdmissionEpoch: session.admissionEpoch });
        assert.ok(result.ok, JSON.stringify(result));
        assert.equal(f.metadataFailures.length, 0);
        assert.equal(f.metadataCalls.length, 0);
        assert.deepEqual(f.runtime.admission(domain === "default" ? undefined : root as unknown as DshAgent).settings.roleRouting["dsmm-documenting"]?.primary, route);
      }
    }
    assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});

test("documenting Apply preserves ordered unresolved primary and fallback parameters", async () => {
  const f = await fixture();
  try {
    const primary = { provider: "fixture", model: "unlisted-doc", reasoningEffort: "high" };
    const fallback = { provider: "fixture", model: "profile-a", reasoningEffort: "high" };
    const available = await save(f, "doc-fallback", { roleRouting: { "dsmm-documenting": { primary, fallbackRoutes: [fallback] } } });
    await select(f, available.id, available.revision);
    const root = await f.native.create({ agentPreset: "standard" });
    const before = value(await f.remote.describeSession(root.id));
    value(await f.remote.selectSession(root.id, { sessionId: root.id, id: available.id, expectedRevision: available.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }));
    const admitted = f.runtime.admission(root as unknown as DshAgent);
    const global = value(await f.remote.describe());
    const session = value(await f.remote.describeSession(root.id));
    const invalidFallback = { ...fallback, reasoningEffort: "max" };
    const invalid = await save(f, "doc-invalid-fallback", { roleRouting: { "dsmm-documenting": { primary, fallbackRoutes: [invalidFallback] } } });
    for (const domain of ["default", "session"] as const) {
      f.metadataFailures.length = 0;
      const request = { id: invalid.id, expectedRevision: invalid.revision,
        expectedSelectionRevision: domain === "default" ? global.selectionRevision : session.selection.selectionRevision };
      const result = domain === "default" ? await f.remote.select(request)
        : await f.remote.selectSession(root.id, { ...request, sessionId: root.id, expectedAdmissionEpoch: session.admissionEpoch });
      assert.ok(result.ok, JSON.stringify(result));
      assert.equal(f.metadataFailures.length, 0);
      assert.equal(f.metadataCalls.length, 0);
      assert.deepEqual(f.runtime.admission(domain === "default" ? undefined : root as unknown as DshAgent).settings.roleRouting["dsmm-documenting"], { primary, fallbackRoutes: [invalidFallback] });
      if (domain === "default") assert.equal(f.runtime.admission(root as unknown as DshAgent), admitted);
    }
  } finally { await f.dispose(); }
});

const documentingChain = {
  primary: { provider: "apai", model: "gpt-6.1-sol", reasoningEffort: "medium" },
  fallbackRoutes: [
    { provider: "apai", model: "gpt-5.6-terra", reasoningEffort: "high" },
    { provider: "apai", model: "gpt-5.6-luna", reasoningEffort: "high" },
  ],
};

async function installedPiAdapter() {
  // The installed adapter shares the fixture's native peer/error identity.
  const llm = pathToFileURL(require.resolve("@deepseek-ai/dsh-llm")).href;
  const peers = registerHooks({ resolve(specifier, context, next) {
    return specifier === "@deepseek-ai/dsh-llm" ? { url: llm, shortCircuit: true } : next(specifier, context);
  } });
  try { return await nativeFixturePlugin("@deepseek-ai/dsh-llm-pi-ai"); }
  finally { peers.deregister(); }
}

test("installed PiAiAdapter metadata does not gate Apply or normalize requested effort and routes", async t => {
  const pi = await installedPiAdapter();
  for (const scenario of ["unregistered", "undeclared-efforts", "high-only", "missing-primary", "declared-efforts"] as const) {
    await t.test(scenario, async () => {
      const f = await fixture();
      const network = mock.method(globalThis, "fetch", async () => { throw new Error("Metadata Apply must not access a network"); });
      const completion = mock.method(pi.PiAiAdapter.prototype, "stream", () => { throw new Error("Metadata Apply must not request completion"); });
      try {
        const allModels = [documentingChain.primary, ...documentingChain.fallbackRoutes].map(route => ({ id: route.model }));
        const models = scenario === "undeclared-efforts" ? allModels
          : allModels.filter(model => scenario !== "missing-primary" || model.id !== documentingChain.primary.model)
            .map(model => ({ ...model, reasoningEfforts: scenario === "declared-efforts" && model.id === documentingChain.primary.model
              ? { medium: "medium", high: "high" } : { high: "high" } }));
        if (scenario !== "unregistered") {
          await f.native.ctx.plugin(pi, { providers: { apai: { api: "openai-responses", baseURL: "https://metadata-only.invalid/v1", models } } }).await();
        }
        const nativeLlm = f.native.ctx.get("llm")!;
        if (scenario !== "unregistered" && scenario !== "missing-primary") {
          const info = await nativeLlm.resolveModelInfo("apai", documentingChain.primary.model);
          assert.equal(info.reasoning?.efforts.some(effort => effort.id === "medium") ?? false, scenario === "declared-efforts");
        }
        const draft = await save(f, "apai-doc", { roleRouting: { "dsmm-documenting": documentingChain } });
        const beforeGlobal = value(await f.remote.describe());
        assert.equal(beforeGlobal.roles?.find(role => role.id === "dsmm-documenting")?.enabled, true);
        for (const domain of ["default", "session"] as const) {
          const root = domain === "session" ? await f.native.create({ agentPreset: "standard" }) : undefined;
          const before = root === undefined ? undefined : value(await f.remote.describeSession(root.id));
          f.metadataCalls.length = 0;
          f.metadataFailures.length = 0;
          const request = { id: draft.id, expectedRevision: draft.revision,
            expectedSelectionRevision: before?.selection.selectionRevision ?? beforeGlobal.selectionRevision };
          const result = root === undefined ? await f.remote.select(request)
            : await f.remote.selectSession(root.id, { ...request, sessionId: root.id, expectedAdmissionEpoch: before!.admissionEpoch });
          assert.deepEqual(f.metadataFailures, []);
          assert.deepEqual(f.metadataCalls, []);
          assert.ok(result.ok, JSON.stringify(result));
          assert.deepEqual(f.runtime.admission(root as unknown as DshAgent | undefined).settings.roleRouting["dsmm-documenting"], documentingChain);
        }
        assert.equal(network.mock.callCount(), 0);
        assert.equal(completion.mock.callCount(), 0);
        assert.equal(f.adapter.calls.length, 0);
      } finally {
        network.mock.restore(); completion.mock.restore();
        await f.dispose();
      }
    });
  }
});
