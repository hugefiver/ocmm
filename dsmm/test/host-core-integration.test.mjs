import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, unlink } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { Context, symbols } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { DsmmAgentRegistry } from "../src/agent-registry.ts";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmRuntime, ReasoningEffortId, ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SessionQueryEngine } from "@deepseek-ai/dsh-session-query";
import { SkillRegistry } from "@deepseek-ai/dsh-skill";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import * as Control from "@deepseek-ai/dsh-tool-subagent-control";
import * as Jobs from "@deepseek-ai/dsh-jobs-local";
import * as JobTools from "@deepseek-ai/dsh-tool-jobs";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import WorkingDirectory from "@deepseek-ai/dsh-working-directory";
import * as NativeObservation from "@deepseek-ai/dsh-fs-observation-policy";
import * as NativeFs from "@deepseek-ai/dsh-tool-fs";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import RemoteAccess from "@deepseek-ai/dsh-api-remote-access";
import * as Connection from "@deepseek-ai/dsh-client-connection";
import { CredentialProvider } from "@deepseek-ai/dsh-credentials";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import Dsmm from "../src/index.ts";
import Startup, { DsmmSubagentRuntime } from "../src/runtime-integration.ts";
import Persistence from "../src/session-persistence.ts";
import { ProfileStore } from "../src/profile-store.ts";
import Loader from "@deepseek-ai/cordis-plugin-loader";

function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
function exact(service) { return Reflect.get(service, symbols.original) ?? service; }
function assemblyState(call, section) {
  const text = call.messages.flatMap(message => typeof message.content === "string" ? [message.content]
    : message.content?.flatMap(block => block.type === "text" ? [block.text] : []) ?? []).join("\n");
  const start = text.indexOf(`<${section}>`) + section.length + 2, end = text.indexOf(`</${section}>`, start);
  return JSON.parse(text.slice(start, end));
}
class ExactQuery extends SessionQueryEngine {
  beforeObserve;
  async observeSession(id, options) { await this.beforeObserve?.(id, options); options.signal?.throwIfAborted(); return super.observeSession(id, options); }
  async searchSessions() { throw new Error("This fixture only reads exact native children"); }
  async searchEvents() { throw new Error("This fixture only reads exact native children"); }
}
class MemoryCredentials extends CredentialProvider {
  records = new Map();
  async modifyRecord(key, modify) { const value = await modify(this.records.get(key)); if (value !== undefined) this.records.set(key, value); return this.records.get(key); }
}
class UsefulAdapter extends LlmAdapter {
  calls = [];
  modelCalls = 0;
  beforeStream;
  async resolveModel(provider, model) { this.modelCalls++; return { provider, id: model, name: model, inputModalities: ["text"],
    reasoning: { efforts: ["low", "high"].map(id => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } }; }
  async *stream(options) {
    this.calls.push(options); await this.beforeStream?.(options); options.signal?.throwIfAborted();
    const text = `useful main-host result from ${options.model}`;
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text };
    yield { type: "block-end", index: 0, block: { type: "text", text } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

async function host({ binding = "dsmm", off = false, active = !off, lateSpawn = false, loaderStartup = false, withConnection = true, retainedStock = false, heldNative, selectedDefaultActive, retainedDsmmMarker = false, nativeFs = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-main-host-"));
  const ctx = new Context(), handles = [], bodies = { read: 0, write: 0, pwsh: 0 }, adapter = new UsefulAdapter();
  let retainedRun, retainedRunParent;
  const dispose = async () => {
    heldNative?.output.release();
    adapter.beforeStream = undefined;
    const query = ctx.get("sessionQuery"), agents = ctx.get("agents");
    if (query !== undefined) query.beforeObserve = undefined;
    const integration = ctx.get("dsmmRuntimeIntegration");
    try {
      for (const handle of [...handles].reverse()) {
        const originalDispose = async () => {
          try { if (handle.agent === retainedRunParent) await retainedRun.dispose(); }
          finally { await handle.dispose(); }
        };
        if (integration !== undefined) await integration.revokeBeforeDispose(handle.agent, originalDispose);
        else await originalDispose();
      }
    } finally {
      try { await ctx.fiber.dispose(); assert.deepEqual(agents?.list() ?? [], []); }
      finally { await rm(root, { recursive: true, force: true }); }
    }
  };
  let setupComplete = false;
  try {
  await mkdir(join(root, "home"), { recursive: true }); await mkdir(join(root, "profile"), { recursive: true });
  await mkdir(join(root, "home", "plugins", "dsmm"), { recursive: true });
  await writeFile(join(root, "home", "plugins", "dsmm", "config.json"), JSON.stringify({ modules: { deepwork: { enabled: !off } } }));
  const file = join(root, "useful.txt"); await writeFile(file, "real useful body under the package MAIN");
  await Promise.all([ctx.plugin(binding === "dsmm" ? DsmmAgentRegistry : AgentRegistry).await(), ctx.plugin(SessionStore).await(), ctx.plugin(SessionProjectionRegistry).await(),
    ctx.plugin(LlmRuntime).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await(),
    ctx.plugin(TypertRegistry).await(), ctx.plugin(TypertGatewayService, {}).await(), ctx.plugin(MemoryCredentials).await(), ctx.plugin(SkillRegistry, {}).await()]);
  await ctx.plugin(ExactQuery).await(); let connectionFiber;
  await ctx.plugin(RemoteAccess).await();
  if (withConnection) { connectionFiber = ctx.plugin(Connection, {}); await connectionFiber.await(); }
  await ctx.plugin(Persistence, { root: join(root, "sessions"), compression: "none" }).await();
   let subagentFiber, spawnFiber;
  if (binding !== "unavailable" && !loaderStartup) {
    subagentFiber = ctx.plugin(binding === "dsmm" ? Startup : SubagentRuntime, { maxDepth: 3, maxActiveSubagents: 8 });
    await subagentFiber.await();
  }
  await ctx.plugin(AgentLoop, {}).await();
  if (binding !== "unavailable" && !lateSpawn && !loaderStartup) {
    spawnFiber = ctx.plugin(Spawn, { providerName: "spawn" }); await spawnFiber.await();
  }
  if (binding !== "unavailable" && !loaderStartup) await ctx.plugin(Control).await();
  await ctx.plugin(Jobs.default, {}).await(); await ctx.plugin(JobTools, { completionDelivery: "quiet" }).await();
  ctx.llm.registerAdapter(["fixture"], adapter);
  if (nativeFs) {
    class CountedFs extends LocalFileSystem {
      async readText(target, signal) { bodies.read++; return super.readText(target, signal); }
      async streamText(target, signal) { bodies.read++; return super.streamText(target, signal); }
    }
    await ctx.plugin(CountedFs, { cwd: root }).await();
    const readConfig = Object.freeze({ readLimit: 8, readMaxBytes: 2048, readMaxLineLength: 200, readStreamMinSize: 1000000 });
    await ctx.plugin(NativeObservation).await();
    await ctx.plugin(NativeFs, readConfig).await();
  } else await ctx.plugin(LocalFileSystem, { cwd: root }).await();
  await ctx.plugin(WorkingDirectory, { defaultDirectory: root }).await();
  for (const name of nativeFs ? ["pwsh", "integration_write", "integration_shell", "integration_delegate"] : ["read", "write", "pwsh"]) ctx.tools.register({ name, description: "Task-owned useful file / non-side-effecting denied counter",
    parameters: { type: "object", properties: { command: { type: "string" } } }, output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute() { bodies[name === "integration_write" ? "write" : name.startsWith("integration_") ? "pwsh" : name]++; return name === "read" ? readFile(file, "utf8") : "must not execute for a read-only child"; } });
  ctx.provide("profileContext", { home: join(root, "home"), dir: join(root, "profile"), installAnchor: process.env.DSMM_TEST_DSH_ENTRY,
    startedBundles: ["@deepseek-ai/dsh-headless"], baseUrl: new URL("../", import.meta.url).href });
  const config = { defaultActive: active, locale: "ja", presets: { materialize: false },
    runtimeRecovery: { enabled: false }, guards: { gitWriteGuard: "deny" },
    subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 },
    roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "reviewer-original", reasoningEffort: "high" } },
      "dsmm-builder": { primary: { provider: "fixture", model: "builder-original", reasoningEffort: "high" } },
      "dsmm-code-search": { primary: { provider: "fixture", model: "search-original", reasoningEffort: "high" } } } };
  let unpublished, retained;
  if (retainedStock || heldNative !== undefined) {
    const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: root },
      agentOptions: { provider: "fixture", model: "native-root", reasoningEffort: ReasoningEffortId("low") } });
    handles.push(handle);
    const stock = exact(ctx.subagents), parent = handle.agent;
    let child;
    if (heldNative === undefined) {
      const started = await stock.startActivation({ provider: "spawn", label: "retained ordinary child", delivery: "parent", signal: new AbortController().signal,
        request: { parent, prompt: [{ type: "text", text: "useful work before MAIN" }], agentOptions: { provider: "fixture", model: "native-retained-child" } } });
      child = ctx.agents.get(started.childId); await child.whenIdle();
    } else {
      adapter.beforeStream = async options => { if (options.model === "native-held-child") { heldNative.entered.release(); await heldNative.output.promise; } };
      retainedRunParent = parent;
      retainedRun = await stock.startActivation({ provider: "spawn", label: "held ordinary native child", delivery: "caller",
        request: { parent, prompt: [{ type: "text", text: "hold useful native work" }], agentOptions: { provider: "fixture", model: "native-held-child" } },
        signal: new AbortController().signal });
      await heldNative.entered.promise; child = ctx.agents.get(retainedRun.childId);
    }
    retained = { parent, child, stock };
    if (retainedDsmmMarker) await child.session.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: null });
  }
  if (selectedDefaultActive !== undefined) {
    const store = ProfileStore.fromCentral(join(root, "home"), join(root, "profile"), "trusted-direct");
    const saved = await store.save({ id: "premount-mode", expectedRevision: null,
      content: JSON.stringify({ version: 1, id: "premount-mode", settings: { defaultActive: selectedDefaultActive } }) });
    await store.select({ id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: (await store.describe()).selectionRevision });
  }
  if (lateSpawn) {
    const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: root, agentPreset: "dsmm-orchestrator" },
      agentOptions: { provider: "fixture", model: "native-root", reasoningEffort: ReasoningEffortId("low") } });
    handles.push(handle); unpublished = handle.agent;
  }
  let mainFiber, initialized, loader;
  if (loaderStartup) {
    await ctx.plugin(Loader, { baseUrl: new URL(".", pathToFileURL(process.env.DSMM_TEST_DSH_ENTRY)).href }).await();
    loader = ctx.get("loader");
    loader.builtins["main-source"] = { default: Dsmm };
    loader.builtins["startup-source"] = { default: Startup };
    initialized = loader.root.update([
      { id: "dsmm", name: "cordis:main-source", inject: ["subagents"], config },
      { id: "spawn", name: "@deepseek-ai/dsh-subagent-spawn-in-process", config: { providerName: "spawn" } },
      { id: "fork", name: "@deepseek-ai/dsh-subagent-fork-in-process", config: { providerName: "fork" } },
      { id: "model-controls", name: "@deepseek-ai/dsh-tool-subagent-control" },
      { id: "subagent", name: "@deepseek-ai/dsh-subagent", disabled: true },
      { id: "dsmm-subagent-runtime", name: "cordis:startup-source", inject: ["agents"], config: { maxDepth: 3, maxActiveSubagents: 8 } },
    ]).then(() => { mainFiber = loader.resolve("dsmm").fiber; subagentFiber = loader.resolve("dsmm-subagent-runtime").fiber; });
  } else {
    mainFiber = ctx.plugin(binding === "dsmm" ? { ...Dsmm, inject: [...Dsmm.inject, "subagents"] } : Dsmm, config);
    initialized = mainFiber.await();
  }
  const complete = async () => {
    await initialized;
    for (const registration of ctx.registry.values()) for (const fiber of registration.fibers) {
      if ("connection" in fiber.inject || "typert" in fiber.inject || "profileContext" in fiber.inject) await fiber.await();
    }
    assert.ok(ctx.get("dsmmProfileRuntime"));
  };
  if (!lateSpawn) await complete();
  const create = async (meta = {}) => {
    const handle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: root, ...meta },
      agentOptions: { provider: "fixture", model: "native-root", reasoningEffort: ReasoningEffortId("low") } });
    handles.push(handle); return handle.agent;
  };
  const execute = (agent, name, arguments_ = {}, caller = new AbortController()) => agent.ctx.tools.execute({ agent, name, arguments: arguments_, callId: ToolCallId(randomUUID()), signal: caller.signal });
  const runtime = () => ctx.get("dsmmProfileRuntime");
  const invoke = (namespace, method, args, signal) => ctx.typertGateway.invoke({ peer: ctx.connection?.browserPeer, namespace, method, args, ...(signal === undefined ? {} : { signal }) });
  const named = async (parent, settings, id = `named-${randomUUID()}`) => {
    const saved = await runtime().save({ id, expectedRevision: null, content: JSON.stringify({ version: 1, id, settings }) });
    const snapshot = await runtime().getSession(parent);
    return { sessionId: parent.id, id, expectedRevision: saved.revision, expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch };
  };
  setupComplete = true;
  return { ctx, root, bodies, adapter, unpublished, retained, retainedRun, get mainFiber() { return mainFiber; }, get subagentFiber() { return subagentFiber; }, get spawnFiber() { return spawnFiber; }, loader, create, execute, runtime, invoke, named, complete,
    async spawn() { spawnFiber = ctx.plugin(Spawn, { providerName: "spawn" }); await spawnFiber.await(); },
    async replaceConnection() {
      await connectionFiber.dispose(); connectionFiber = ctx.plugin(Connection, {}); await connectionFiber.await();
      for (const registration of ctx.registry.values()) for (const fiber of registration.fibers) if ("connection" in fiber.inject) await fiber.await();
    },
    dispose };
  } finally { if (!setupComplete) await dispose(); }
}

test("package MAIN publishes completed Core admission before spawn while DW delivery remains fenced", { timeout: 15000 }, async () => {
  const f = await host({ lateSpawn: true, active: false });
  try {
    const native = exact(f.ctx.subagents);
    assert.ok(native instanceof DsmmSubagentRuntime);
    assert.equal(native.authority.view().deliveryFenceReady, false);
    await Promise.race([f.complete(), new Promise((_, reject) => setTimeout(() => reject(new Error("Core boot waited for DW spawn")), 1000))]);
    assert.ok(f.ctx.get("dsmmProfileRuntime"));
    assert.ok(f.ctx.get("dsmmCoreLlmOwner"));
    const core = await f.create(), before = f.runtime().admission(core);
    assert.throws(() => native.authority.acquireParentTicket(core), { code: "UNAUTHORIZED" });
    assert.equal((await f.execute(f.unpublished, "read")).isError, true);
    assert.equal(f.bodies.read, 0, "the already registered tool body stays behind the DW fence");
    const request = await f.named(core, { locale: "en", roleRouting: { "dsmm-orchestrator": { primary: { provider: "missing", model: "future", reasoningEffort: "future" } } } });
    const calls = f.adapter.calls.length;
    const models = f.adapter.modelCalls;
    const result = await f.invoke("dsmmProfiles", "selectSession", { sessionId: core.id, request });
    assert.equal(result.admissionEpoch, f.runtime().admission(core).epoch);
    assert.notEqual(f.runtime().admission(core), before);
    assert.equal((await f.runtime().getSession(core)).admittedSelection.selectedId, request.id);
    assert.equal(f.adapter.calls.length, calls);
    assert.equal(f.adapter.modelCalls, models);
    assert.throws(() => native.authority.acquireParentTicket(core), { code: "UNAUTHORIZED" });
    await assert.rejects(native.sendMessage(f.unpublished, SessionId(randomUUID()), [{ type: "text", text: "not admitted yet" }], { signal: new AbortController().signal }), error => error.code === "UNAUTHORIZED");
    await f.spawn(); await f.ctx.dsmmRuntimeIntegration.ready();
    assert.equal(native.authority.acquireParentTicket(core).admission, f.runtime().admission(core));
    const ticket = native.authority.acquireParentTicket(core);
    await f.runtime().selectSession(await f.named(core, { locale: "ja" }), core);
    assert.equal(ticket.signal.aborted, true);
    assert.equal(native.authority.view().deliveryFenceReady, true);
    const parent = await f.create(), admission = f.runtime().admission(parent);
    assert.equal(native.authority.acquireParentTicket(parent).admission, admission);
    assert.equal(f.ctx.dsmmRuntimeIntegration.owner, native.authority.acquireParentTicket(parent).owner);
    assert.ok(f.ctx.typert.local.get("dsmmChildren/describe"));
    assert.ok(f.ctx.typert.local.get("subagents/prompt"));
  } finally { await f.dispose(); }
});

for (const failure of ["cancel", "draft-conflict", "owner-revoked"]) test(`Core-only CurrentApply preserves its exact admission and durable choice after ${failure} while spawn is absent`, { timeout: 15000 }, async () => {
  const f = await host({ lateSpawn: true, active: false });
  let lock;
  try {
    await f.complete();
    const parent = await f.create(), admission = f.runtime().admission(parent);
    const request = await f.named(parent, { locale: "en" });
    const store = ProfileStore.fromCentral(join(f.root, "home"), join(f.root, "profile"), "trusted-direct");
    const choice = await store.loadSessionSelection(parent.id);
    lock = join(store.profileDir, ".lock");
    await writeFile(lock, "owned pending CoreApply fixture", { flag: "wx" });
    const caller = new AbortController();
    const pending = f.invoke("dsmmProfiles", "selectSession", { sessionId: parent.id, request }, caller.signal);
    const refused = assert.rejects(pending);
    await setImmediate();
    if (failure === "cancel") caller.abort();
    if (failure === "draft-conflict") await writeFile(join(store.profileDir, `${request.id}.jsonc`), JSON.stringify({ version: 1, id: request.id, settings: { locale: "ja" } }));
    if (failure === "owner-revoked") f.ctx.dsmmRuntimeIntegration.runtime.authority.revokeOwner(f.ctx.dsmmRuntimeIntegration.owner, "owned-test-revocation");
    await unlink(lock); lock = undefined;
    await refused;
    assert.equal(f.runtime().admission(parent), admission);
    assert.deepEqual(await store.loadSessionSelection(parent.id), choice);
    assert.equal(f.adapter.calls.length, 0); assert.equal(f.adapter.modelCalls, 0);
    assert.throws(() => f.ctx.dsmmRuntimeIntegration.runtime.authority.acquireParentTicket(parent), { code: "UNAUTHORIZED" });
  } finally { if (lock !== undefined) await unlink(lock); await f.dispose(); }
});

test("DW startup continuation disposal settles before spawn and cannot publish late role tools or a Core owner", { timeout: 15000 }, async () => {
  const f = await host({ lateSpawn: true, active: false });
  try {
    await f.complete();
    const integration = f.ctx.dsmmRuntimeIntegration;
    const refused = assert.rejects(integration.ready());
    await f.mainFiber.dispose(); await refused;
    await f.spawn();
    assert.equal(integration.runtime.authority.view().deliveryFenceReady, false);
    assert.equal(f.ctx.get("dsmmCoreLlmOwner"), undefined);
    assert.equal(f.ctx.get("dsmmProfileRuntime"), undefined);
    assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
});

test("native read decision survives unrelated DW delivery retirement while the next call remains predecision-fenced", { timeout: 15000 }, async () => {
  const f = await host(), entered = gate(), release = gate();
  let pending;
  try {
    const parent = await f.create();
    f.ctx.on("tools/execute", async (exec, next) => {
      if (exec.agent === parent && exec.name === "read") { entered.release(); await release.promise; }
      return next();
    }, { global: true });
    const definition = parent.ctx.tools.get("read", parent);
    assert.ok(definition);
    pending = f.execute(parent, "read");
    await Promise.race([entered.promise, pending.then(result => { throw new Error(`Read settled before native dispatch: ${JSON.stringify(result)}`); })]);
    await f.spawnFiber.dispose();
    assert.equal(f.ctx.dsmmRuntimeIntegration.runtime.authority.view().deliveryFenceReady, false);
    assert.equal(parent.ctx.tools.get("read", parent), definition);
    release.release();
    const result = await pending;
    assert.equal(result.isError, false); assert.equal(result.value, "real useful body under the package MAIN");
    assert.equal(f.bodies.read, 1);
    assert.equal((await f.execute(parent, "read")).isError, true); assert.equal(f.bodies.read, 1);
  } finally { release.release(); if (pending !== undefined) await Promise.allSettled([pending]); await f.dispose(); }
});

test("native caller cancellation after the decision prevents the registered read body from entering", { timeout: 15000 }, async () => {
  const f = await host(), entered = gate(), release = gate(), caller = new AbortController();
  let pending;
  try {
    const parent = await f.create();
    f.ctx.on("tools/execute", async (exec, next) => {
      if (exec.agent === parent && exec.name === "read") { entered.release(); await release.promise; }
      return next();
    }, { global: true });
    pending = f.execute(parent, "read", {}, caller);
    await Promise.race([entered.promise, pending.then(result => { throw new Error(`Read settled before native dispatch: ${JSON.stringify(result)}`); })]);
    caller.abort(); release.release();
    assert.equal((await pending).isError, true); assert.equal(f.bodies.read, 0);
  } finally { release.release(); if (pending !== undefined) await Promise.allSettled([pending]); await f.dispose(); }
});

test("DW tool initialization enrolls a concurrently entered Root only after its existing awaited admission completes", { timeout: 15000 }, async () => {
  const f = await host({ lateSpawn: true }), entered = gate(), release = gate();
  let pending, handle;
  try {
    await f.complete();
    const id = SessionId(randomUUID());
    f.ctx.on("agent/created", async ({ agent }) => { if (agent.id === id) { entered.release(); await release.promise; } }, { global: true, prepend: true });
    pending = f.ctx.agents.create({ sessionId: id, meta: { cwd: f.root }, agentOptions: { provider: "fixture", model: "native-root" } });
    pending.then(value => { handle = value; }, () => {});
    await entered.promise;
    assert.throws(() => f.runtime().admission(f.ctx.agents.get(id)), { code: "activation" });
    await f.spawn(); await f.ctx.dsmmRuntimeIntegration.ready();
    release.release(); handle = await pending;
    assert.equal(f.ctx.dsmmRuntimeIntegration.runtime.authority.acquireParentTicket(handle.agent).admission, f.runtime().admission(handle.agent));
    assert.ok(handle.agent.ctx.tools.get("dsmm_reviewer", handle.agent));
  } finally {
    release.release();
    if (pending !== undefined) await Promise.allSettled([pending]);
    await handle?.dispose(); await f.dispose();
  }
});

test("MAIN captured child executes useful read, denies write/shell, preserves original epoch/route and uses native model/Gateway delivery", { timeout: 20000 }, async () => {
  const f = await host();
  try {
    const parent = await f.create();
    const initial = f.runtime().admission(parent), native = exact(f.ctx.subagents);
    const started = await f.execute(parent, "dsmm_reviewer", { description: "useful captured reviewer", prompt: "inspect useful work" });
    assert.equal(started.isError, false); assert.equal(started.value.kind, "continuable");
    const childId = started.value.subagentId, child = f.ctx.agents.get(childId);
    await child.whenIdle();
    const original = f.runtime().admission(child);
    assert.equal(original.epoch, initial.epoch); assert.equal(original.settings.locale, "ja");
    assert.equal(native.authority.acquireParentTicket(child).admission, original);
    assert.equal(await f.runtime().completeAdmission(child), original, "retained exact child completes idempotently without rebinding to current root policy");
    const useful = await f.execute(child, "read"); assert.equal(useful.isError, false); assert.equal(useful.value, "real useful body under the package MAIN");
    assert.equal((await f.execute(child, "write")).isError, true); assert.equal((await f.execute(child, "pwsh", { command: "git push" })).isError, true);
    assert.deepEqual(f.bodies, { read: 1, write: 0, pwsh: 0 });
    const ticket = native.authority.acquireParentTicket(parent);
    const request = await f.named(parent, { locale: "en", guards: { gitWriteGuard: "off" } });
    await f.runtime().selectSession(request, parent);
    assert.equal(ticket.signal.aborted, true); assert.equal(f.runtime().admission(child), original);
    const after = native.authority.acquireParentTicket(parent);
    await assert.rejects(f.runtime().selectSession(request, parent)); assert.equal(after.signal.aborted, false);
    const delivered = await f.execute(parent, "send_message", { agent_id: childId, message: "same-ID native followup" });
    assert.equal(delivered.isError, false, JSON.stringify(delivered)); await child.whenIdle();
    const receipt = await f.invoke("subagents", "prompt", { request: { requestId: randomUUID(), parentSessionId: parent.id, childSessionId: childId,
      mode: "continuable", delivery: "queue", content: [{ type: "text", text: "same-ID native browser followup" }] } });
    assert.equal(typeof receipt.messageId, "string"); await child.whenIdle();
    assert.equal(f.ctx.agents.get(childId), child);
    assert.ok(f.adapter.calls.filter(call => call.model === "reviewer-original").length >= 3);
    assert.equal(parent.options.model, "native-root"); assert.equal(parent.options.reasoningEffort, "low");
    const snapshot = await f.invoke("dsmmChildren", "describe", { sessionId: parent.id });
    assert.equal(snapshot.children[0].evidence.originalAdmissionEpoch, original.epoch);
    assert.equal(snapshot.children[0].evidence.parentAdmissionEpoch, after.parentEpoch);
    assert.equal(snapshot.children[0].routeComparison.initialRoute.route.model, "reviewer-original");
    assert.equal(snapshot.children[0].routeComparison.liveRoute.route.model, "reviewer-original");
    const call = f.adapter.calls.findLast(call => call.model === "reviewer-original");
    const evidence = assemblyState(call, "dsmm-child-evidence"), lifecycle = assemblyState(call, "dsmm-child-lifecycle-state");
    assert.equal(evidence.originalAdmissionEpoch, original.epoch); assert.equal(evidence.parentAdmissionEpoch, after.parentEpoch);
    assert.equal(lifecycle.managedChildDelivery, true);
    const blocked = await f.named(parent, { roles: { "dsmm-reviewer": false } }); await f.runtime().selectSession(blocked, parent);
    const count = child.session.snapshotEvents().length;
    assert.equal((await f.execute(parent, "send_message", { agent_id: childId, message: "must not enter inbox" })).isError, true);
    await assert.rejects(f.invoke("subagents", "prompt", { request: { requestId: randomUUID(), parentSessionId: parent.id, childSessionId: childId,
      mode: "continuable", delivery: "queue", content: [{ type: "text", text: "must not enter inbox" }] } }), error => remoteErrorOf(error)?.code === "subagent/unauthorized");
    assert.equal(child.session.snapshotEvents().length, count);
  } finally { await f.dispose(); }
});

test("MAIN admits retained ordinary stock roots before classifying their live native children", { timeout: 20000 }, async () => {
  const f = await host({ binding: "stock", off: true, active: false, retainedStock: true });
  try {
    const { parent, child, stock } = f.retained;
    assert.equal(exact(f.ctx.subagents), stock); assert.equal(f.ctx.agents.get(parent.id), parent); assert.equal(f.ctx.agents.get(child.id), child);
    assert.equal(child.status, "idle"); assert.equal(f.adapter.calls.filter(call => call.model === "native-retained-child").length, 1);
    const request = await f.named(parent, { locale: "en" });
    assert.equal(JSON.parse((await f.runtime().read(request.id)).content).id, request.id);
    await f.runtime().selectSession(request, parent); assert.equal(f.runtime().getSettings(parent).locale, "en");
    const useful = await f.execute(parent, "read"); assert.equal(useful.isError, false); assert.equal(useful.value, "real useful body under the package MAIN");
    await stock.sendMessage(parent, child.id, [{ type: "text", text: "continue the exact retained child" }], { signal: new AbortController().signal });
    await child.whenIdle();
    assert.equal(f.ctx.agents.get(child.id), child); assert.equal(exact(f.ctx.subagents), stock);
    assert.equal(f.adapter.calls.filter(call => call.model === "native-retained-child").length, 2);
    assert.match(JSON.stringify(child.session.snapshotEvents()), /useful main-host result from native-retained-child/u);
  } finally { await f.dispose(); }
});

test("MAIN same native foreground holder hands off through real operator RPC and cleans its owner once", { timeout: 20000 }, async () => {
  const f = await host(), entered = gate(), output = gate();
  try {
    const parent = await f.create();
    f.adapter.beforeStream = async options => { if (options.model === "reviewer-original") { entered.release(); await output.promise; } };
    const pending = f.execute(parent, "dsmm_reviewer", { description: "same holder", prompt: "produce useful output", run_in_background: false });
    await entered.promise;
    const snapshot = await f.invoke("dsmmChildren", "describe", { sessionId: parent.id }), row = snapshot.runs[0];
    assert.equal(row.state, "running"); assert.equal(row.background.enabled, true);
    const child = f.ctx.agents.get(row.invocation.childId);
    const address = { sessionId: parent.id, toolCallId: row.toolCallId, runId: row.invocation.runId, expectedAdmissionEpoch: snapshot.admissionEpoch };
    const handoff = await f.invoke("dsmmChildren", "background", { sessionId: parent.id, request: address });
    assert.equal(handoff.status, "background"); assert.equal((await pending).value.jobId, handoff.jobId);
    assert.equal(f.ctx.agents.get(row.invocation.childId), child);
    const again = await f.invoke("dsmmChildren", "background", { sessionId: parent.id, request: address }); assert.equal(again.jobId, handoff.jobId);
    output.release();
    const done = await f.ctx.jobs.wait(handoff.jobId, 5000, parent.id); assert.equal(done.status, "completed");
    assert.match(f.ctx.jobs.read(handoff.jobId, parent.id).result, /useful main-host result/u);
    assert.equal(f.adapter.calls.filter(call => call.model === "reviewer-original").length, 1);
    assert.equal(f.ctx.agents.get(row.invocation.childId), undefined);
    assert.equal(f.ctx.dsmmRuntimeIntegration.registry.list(parent, f.ctx.dsmmRuntimeIntegration.owner).length, 0);
  } finally { output.release(); await f.dispose(); }
});

test("MAIN retained native classification uses its completed named-profile parent admission rather than startup defaultActive", { timeout: 20000 }, async () => {
  const f = await host({ binding: "stock", off: false, active: true, retainedStock: true, selectedDefaultActive: false });
  try {
    const { parent, child, stock } = f.retained;
    assert.equal(f.runtime().admission(parent).settings.modules.deepwork.enabled, true);
    assert.equal(f.runtime().admission(parent).settings.defaultActive, false);
    assert.equal((await f.runtime().getSession(parent)).admittedSelection.selectedId, "premount-mode");
    assert.equal(f.ctx.agents.get(parent.id), parent); assert.equal(f.ctx.agents.get(child.id), child); assert.equal(exact(f.ctx.subagents), stock);
    assert.equal((await f.execute(parent, "read")).isError, false);
    await stock.sendMessage(parent, child.id, [{ type: "text", text: "continue under the actual inactive parent admission" }], { signal: new AbortController().signal });
    await child.whenIdle();
    assert.equal(f.ctx.agents.get(child.id), child); assert.equal(exact(f.ctx.subagents), stock);
    assert.equal(f.adapter.calls.filter(call => call.model === "native-retained-child").length, 2);
    assert.match(JSON.stringify(child.session.snapshotEvents()), /useful main-host result from native-retained-child/u);
    assert.deepEqual(f.bodies, { read: 1, write: 0, pwsh: 0 });
  } finally { await f.dispose(); }
});

test("MAIN does not skip controlled retained children when the selected parent profile activates a startup-inactive root", { timeout: 20000 }, async () => {
  await assert.rejects(host({ binding: "stock", off: false, active: false, retainedStock: true, selectedDefaultActive: true }),
    error => error.code === "unavailable" || error.code === "not-owned");
});

test("MAIN refuses a DSMM-marked retained child even when the selected parent profile is inactive", { timeout: 20000 }, async () => {
  await assert.rejects(host({ binding: "stock", off: false, active: true, retainedStock: true, selectedDefaultActive: false, retainedDsmmMarker: true }),
    error => error.code === "unavailable" || error.code === "not-owned");
});

test("MAIN activation holder pre-revokes its exact admitted child and descendants before native disposal enters", { timeout: 20000 }, async () => {
  const f = await host(), entered = gate(), output = gate();
  try {
    const parent = await f.create(), native = exact(f.ctx.subagents), integration = f.ctx.dsmmRuntimeIntegration;
    let starts = 0;
    f.ctx.on("subagent/start", info => { if (info.provider === "dsmm-role-builder") starts++; }, { global: true });
    f.adapter.beforeStream = async options => { if (options.model === "builder-original") { entered.release(); await output.promise; } };
    const pending = f.execute(parent, "dsmm_builder", { description: "opaque real holder", prompt: "hold useful work", run_in_background: false });
    await Promise.race([entered.promise, pending.then(result => { throw new Error(`Opaque native run settled before a useful turn: ${JSON.stringify(result)}`); })]);
    const builder = f.ctx.agents.list().find(agent => f.ctx.agents.isOwnedBy(agent.id, parent));
    assert.ok(builder);
    const holder = integration.registry.list(parent, integration.owner)[0];
    assert.equal(holder.invocation.childId, builder.id);
    const described = await f.invoke("dsmmChildren", "describe", { sessionId: parent.id });
    assert.equal(described.runs[0].invocation.route.model, "builder-original");
    const started = await f.execute(builder, "dsmm_code_search", { description: "opaque holder direct descendant", prompt: "useful native search" });
    assert.equal(started.isError, false, JSON.stringify(started));
    const grandchild = f.ctx.agents.get(started.value.subagentId); await grandchild.whenIdle();
    assert.equal((await f.execute(grandchild, "read")).isError, false);
    assert.equal((await f.execute(grandchild, "write")).isError, true);
    assert.equal((await f.execute(grandchild, "pwsh", { command: "git push" })).isError, true);
    const builderTicket = native.authority.acquireParentTicket(builder), grandchildTicket = native.authority.acquireParentTicket(grandchild);
    assert.equal(builderTicket.signal.aborted, false); assert.equal(grandchildTicket.signal.aborted, false);
    let disposals = 0;
    builder.ctx.effect(() => () => {
      disposals++;
      assert.equal(builderTicket.signal.aborted, true); assert.equal(grandchildTicket.signal.aborted, true);
    });
    output.release(); const result = await pending;
    assert.equal(result.isError, false, JSON.stringify(result)); assert.match(JSON.stringify(result.content), /useful main-host result/u);
    assert.equal(disposals, 1);
    assert.equal(starts, 1);
    assert.deepEqual(f.bodies, { read: 1, write: 0, pwsh: 0 });
    assert.equal(f.ctx.agents.get(builder.id), undefined); assert.equal(f.ctx.agents.get(grandchild.id), undefined);
    assert.equal(integration.registry.list(parent, integration.owner).length, 0);
  } finally { output.release(); await f.dispose(); }
});

for (const binding of ["stock", "unavailable"]) test(`MAIN ${binding} cold-off Core stays usable and reports actual restart-required capability`, { timeout: 15000 }, async () => {
  const f = await host({ binding, off: true });
  try {
    const parent = await f.create(), runtime = f.runtime(), before = runtime.admission(parent);
    assert.equal(before.settings.modules.deepwork.enabled, false);
    const view = (await runtime.getSession(parent)).subagentRuntime;
    assert.equal(view.binding, binding); assert.equal(view.deliveryFenceReady, false); assert.equal(view.restartRequired, true);
    assert.equal(f.ctx.get("dsmmRuntimeIntegration"), undefined);
    const request = await f.named(parent, { locale: "en" }); await runtime.selectSession(request, parent);
    assert.equal(runtime.getSettings(parent).locale, "en");
    parent.followup(createUserMessage({ content: [{ type: "text", text: "ordinary native root result" }], source: { kind: "user" } }));
    await parent.whenIdle(); assert.equal(f.adapter.calls.at(-1).model, "native-root");
    assert.equal((await f.execute(parent, "read")).isError, false);
    assert.ok(f.ctx.typert.local.get("dsmmChildren/describe"));
    await assert.rejects(f.invoke("dsmmChildren", "describe", { sessionId: parent.id }), error => {
      const failure = remoteErrorOf(error);
      return failure?.code === "dsmm-children/refused" && failure.details.code === "unavailable" && failure.details.reason === "delivery-fence-unavailable";
    });
    if (binding === "stock") {
      const child = await f.ctx.subagents.startActivation({ provider: "spawn", label: "ordinary native", delivery: "parent", signal: new AbortController().signal,
        request: { parent, prompt: [{ type: "text", text: "native body" }], agentOptions: { provider: "fixture", model: "native-child" } } });
      const resident = f.ctx.agents.get(child.childId); await resident.whenIdle();
      await f.ctx.subagents.sendMessage(parent, child.childId, [{ type: "text", text: "ordinary native followup" }], { signal: new AbortController().signal });
      await resident.whenIdle(); assert.equal((await f.execute(resident, "read")).isError, false);
    }
  } finally { await f.dispose(); }
});

test("actual concurrent Loader mounts package MAIN with one subclass while retaining spawn/fork/native controls", { timeout: 20000 }, async () => {
  const f = await host({ loaderStartup: true });
  try {
    const native = exact(f.ctx.subagents);
    assert.ok(native instanceof DsmmSubagentRuntime); assert.equal(f.loader.resolve("subagent").fiber, undefined);
    await native.waitForProvider("fork"); assert.ok(native.getProvider("spawn"));
    const parent = await f.create();
    const result = await f.execute(parent, "dsmm_reviewer", { description: "Loader real body", prompt: "return useful evidence" });
    assert.equal(result.isError, false, JSON.stringify(result));
    const child = f.ctx.agents.get(result.value.subagentId); await child.whenIdle();
    assert.equal((await f.execute(parent, "send_message", { agent_id: child.id, message: "Loader same-ID" })).isError, false);
    await child.whenIdle();
    assert.equal(exact(f.ctx.subagents), native);
    assert.match(f.adapter.calls.at(-1).model, /reviewer-original/u);
  } finally { await f.dispose(); }
});

test("MAIN unavailable cold Core loads its remote contribution without a Connection or subagents dependency", { timeout: 15000 }, async () => {
  const f = await host({ binding: "unavailable", off: true, withConnection: false });
  try {
    assert.equal(f.ctx.get("connection"), undefined); assert.equal(f.ctx.get("subagents"), undefined);
    assert.ok(f.ctx.typert.local.get("dsmmChildren/describe"));
    const parent = await f.create();
    assert.equal((await f.runtime().getSession(parent)).subagentRuntime.restartRequired, true);
    const result = await f.execute(parent, "read");
    assert.equal(result.isError, false); assert.equal(result.value, "real useful body under the package MAIN");
  } finally { await f.dispose(); }
});

test("MAIN direct delegating child owns grandchild authority; ancestor cannot borrow it; opaque teardown pre-revokes and cold recovery keeps IDs", { timeout: 25000 }, async () => {
  const f = await host(), coldRunning = gate(), coldOutput = gate(), grandchildRunning = gate(), grandchildOutput = gate();
  try {
    const root = await f.create(), native = exact(f.ctx.subagents), integration = f.ctx.dsmmRuntimeIntegration;
    const first = await f.execute(root, "dsmm_builder", { description: "delegating builder", prompt: "delegate within your actual authority" });
    assert.equal(first.isError, false, JSON.stringify(first));
    const builder = f.ctx.agents.get(first.value.subagentId); await builder.whenIdle();
    const second = await f.execute(builder, "dsmm_code_search", { description: "direct grandchild", prompt: "produce useful search" });
    assert.equal(second.isError, false, JSON.stringify(second));
    const grandchild = f.ctx.agents.get(second.value.subagentId); await grandchild.whenIdle();
    const original = f.runtime().admission(builder), childOriginal = f.runtime().admission(grandchild);
    const builderTicket = native.authority.acquireParentTicket(builder), grandchildTicket = native.authority.acquireParentTicket(grandchild);
    await assert.rejects(native.sendMessage(root, grandchild.id, [{ type: "text", text: "ancestor cannot impersonate adjacency" }], { signal: new AbortController().signal }));
    await native.sendMessage(builder, grandchild.id, [{ type: "text", text: "exact direct parent" }], { signal: new AbortController().signal }); await grandchild.whenIdle();
    const seen = gate(), finish = gate();
    const detach = builder.ctx.effect(() => async () => { seen.release(); await finish.promise; });
    const teardown = integration.revokeBeforeDispose(builder, () => {
      assert.equal(builderTicket.signal.aborted, true); assert.equal(grandchildTicket.signal.aborted, true);
      return native.drainChildren(root, [builder.id]);
    });
    await seen.promise; assert.equal(builderTicket.signal.aborted, true); assert.equal(grandchildTicket.signal.aborted, true);
    finish.release(); await teardown; detach();
    assert.equal(f.ctx.agents.get(builder.id), undefined); assert.equal(f.ctx.agents.get(grandchild.id), undefined);
    f.adapter.beforeStream = async options => {
      if (options.model === "builder-original") { coldRunning.release(); await coldOutput.promise; }
      if (options.model === "search-original") { grandchildRunning.release(); await grandchildOutput.promise; }
    };
    await native.sendMessage(root, builder.id, [{ type: "text", text: "cold same builder" }], { signal: new AbortController().signal });
    const cold = f.ctx.agents.get(builder.id); assert.notEqual(cold, builder); await coldRunning.promise;
    assert.equal(f.runtime().admission(cold).epoch, original.epoch);
    assert.throws(() => native.authority.acquireParentTicket(builder));
    assert.equal(native.authority.acquireParentTicket(cold).admission, f.runtime().admission(cold));
    const describe = await f.invoke("dsmmChildren", "describe", { sessionId: root.id });
    assert.equal(describe.children.find(row => row.id === cold.id).evidence.originalAdmissionEpoch, original.epoch);
    assert.equal(f.ctx.agents.get(grandchild.id), undefined, "readonly describe does not materialize a descendant");
    await native.sendMessage(cold, grandchild.id, [{ type: "text", text: "cold same grandchild" }], { signal: new AbortController().signal });
    const coldGrandchild = f.ctx.agents.get(grandchild.id); assert.notEqual(coldGrandchild, grandchild); await grandchildRunning.promise;
    assert.equal(f.runtime().admission(coldGrandchild).epoch, childOriginal.epoch);
    assert.equal((await f.execute(coldGrandchild, "read")).isError, false);
    assert.equal((await f.execute(coldGrandchild, "write")).isError, true); assert.equal(f.bodies.write, 0);
    grandchildOutput.release(); coldOutput.release(); await coldGrandchild.whenIdle(); await cold.whenIdle();
  } finally { grandchildOutput.release(); coldOutput.release(); await f.dispose(); }
});

test("MAIN successful Apply cancels a paused original Gateway delivery before acceptance without cancelling already accepted work", { timeout: 20000 }, async () => {
  const f = await host(), running = gate(), finish = gate(), observing = gate(), observed = gate();
  try {
    const parent = await f.create(), native = exact(f.ctx.subagents);
    f.adapter.beforeStream = async options => { if (options.model === "reviewer-original" && f.adapter.calls.filter(call => call.model === "reviewer-original").length === 1) { running.release(); await finish.promise; } };
    const started = await f.execute(parent, "dsmm_reviewer", { description: "accepted running child", prompt: "stay running until allowed completion" });
    const child = f.ctx.agents.get(started.value.subagentId); await running.promise;
    const accepted = await native.sendMessage(parent, child.id, [{ type: "text", text: "already accepted queue" }], { signal: new AbortController().signal });
    f.ctx.sessionQuery.beforeObserve = async (id) => { if (id === child.id) { observing.release(); await observed.promise; } };
    const pending = f.invoke("subagents", "prompt", { request: { requestId: randomUUID(), parentSessionId: parent.id, childSessionId: child.id,
      mode: "continuable", delivery: "queue", content: [{ type: "text", text: "paused must never enter" }] } });
    const refused = assert.rejects(pending, error => remoteErrorOf(error)?.code === "gateway/cancelled");
    await observing.promise;
    const ticket = native.authority.acquireParentTicket(parent);
    const request = await f.named(parent, { locale: "en" }); await f.runtime().selectSession(request, parent);
    assert.equal(ticket.signal.aborted, true); assert.equal(child.status, "running");
    observed.release(); await refused; f.ctx.sessionQuery.beforeObserve = undefined;
    finish.release(); await child.whenIdle();
    const inserted = child.session.snapshotEvents().flatMap(event => event.type === "agent/inbox/spliced" ? event.data.inserted : []);
    assert.ok(inserted.some(item => item.message?.id === accepted || item.id === accepted), JSON.stringify(inserted));
    assert.equal(f.adapter.calls.filter(call => call.model === "reviewer-original").length, 2);
    assert.equal(f.ctx.agents.get(child.id), child);
  } finally { observed.release(); finish.release(); await f.dispose(); }
});

for (const off of [true, false]) test(`explicit subclass preserves ordinary non-DSMM native primitives when ${off ? "startup is off" : "common is off"}`, { timeout: 15000 }, async () => {
  const f = await host({ off, active: false });
  try {
    const parent = await f.create();
    const started = await f.ctx.subagents.startActivation({ provider: "spawn", label: "native child", delivery: "parent", signal: new AbortController().signal,
      request: { parent, prompt: [{ type: "text", text: "use native behavior" }], agentOptions: { provider: "fixture", model: "native-child" } } });
    const child = f.ctx.agents.get(started.childId); await child.whenIdle();
    const delivered = await f.ctx.subagents.sendMessage(parent, child.id, [{ type: "text", text: "native original continuation" }], { signal: new AbortController().signal });
    assert.equal(typeof delivered, "string"); await child.whenIdle();
    assert.equal((await f.execute(child, "write")).isError, false); assert.equal(f.bodies.write, 1);
    assert.equal(f.adapter.calls.at(-1).model, "native-child");
  } finally { await f.dispose(); }
});

for (const provider of ["spawn", "dsmm-role-cross-cutting"]) test(`MAIN native continuable controls consume Host-proven evidence without claiming DSMM capture or role metadata: ${provider}`, { timeout: 20000 }, async () => {
  const f = await host({ active: false });
  try {
    const parent = await f.create(), native = exact(f.ctx.subagents), ticket = native.authority.acquireParentTicket(parent);
    if (provider !== "spawn") {
      const spawn = native.getProvider("spawn"); assert.ok(spawn?.prepareContinuable);
      native.registerProvider({ name: provider, capabilities: spawn.capabilities, inheritsParentContext: false,
        prepareContinuable: request => spawn.prepareContinuable(request) });
    }
    const started = await native.startActivation({ provider, label: "ordinary native control target", delivery: "parent", signal: new AbortController().signal,
      request: { parent, prompt: [{ type: "text", text: "useful native initial work" }], agentOptions: { provider: "fixture", model: "native-controls-child" } } });
    const child = f.ctx.agents.get(started.childId); await child.whenIdle();
    await native.sendMessage(parent, child.id, [{ type: "text", text: "original native continuation control" }], { signal: new AbortController().signal }); await child.whenIdle();
    const described = await f.invoke("dsmmChildren", "describe", { sessionId: parent.id }), row = described.children.find(row => row.id === child.id);
    assert.equal(row.mode, "continuable"); assert.equal(row.controls.prompt.enabled, true); assert.equal(row.controls.interrupt.enabled, true);
    assert.equal(row.invocation, undefined); assert.equal(row.evidence, undefined); assert.equal(row.routeComparison, undefined);
    const descendants = await f.invoke("dsmmChildren", "descendants", { sessionId: parent.id });
    assert.equal(descendants.descendants.find(row => row.kind === "child" && row.child.id === child.id).child.invocation, undefined);
    const receipt = await f.invoke("dsmmChildren", "prompt", { sessionId: parent.id, request: { requestId: randomUUID(), parentSessionId: parent.id,
      childSessionId: child.id, mode: "continuable", delivery: "queue", content: [{ type: "text", text: "real custom Gateway native followup" }] } });
    assert.equal(typeof receipt.messageId, "string"); await child.whenIdle();
    assert.equal(f.adapter.calls.filter(call => call.model === "native-controls-child").length, 3);
    assert.equal((await f.execute(child, "read")).isError, false); assert.equal(f.bodies.read, 1);
    assert.equal(f.ctx.agents.get(child.id), child); assert.equal(exact(f.ctx.subagents), native); assert.equal(ticket.signal.aborted, false);
    const proof = await native.authority.resolveChildEvidence(ticket, child.id, new AbortController().signal);
    assert.equal(native.authority.assertDelivery(ticket, child.id, proof), false);
    await child.session.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: null });
    const count = child.session.snapshotEvents().length, modelCalls = f.adapter.modelCalls;
    assert.throws(() => native.authority.assertDelivery(ticket, child.id, proof));
    await assert.rejects(native.authority.resolveChildEvidence(ticket, child.id, new AbortController().signal));
    await assert.rejects(native.sendMessage(parent, child.id, [{ type: "text", text: "marked child is not plain native" }], { signal: new AbortController().signal }));
    const request = { requestId: randomUUID(), parentSessionId: parent.id, childSessionId: child.id,
      mode: "continuable", delivery: "queue", content: [{ type: "text", text: "marked child is not a native Gateway target" }] };
    await assert.rejects(f.invoke("subagents", "prompt", { request }));
    await assert.rejects(f.invoke("dsmmChildren", "prompt", { sessionId: parent.id, request: { ...request, requestId: randomUUID() } }));
    await assert.rejects(f.invoke("dsmmChildren", "describe", { sessionId: parent.id }));
    assert.equal(child.session.snapshotEvents().length, count); assert.equal(f.adapter.calls.filter(call => call.model === "native-controls-child").length, 3);
    assert.equal(f.adapter.modelCalls, modelCalls);
  } finally { await f.dispose(); }
});

test("MAIN observes a held native caller activation without demanding or inventing DSMM admission", { timeout: 20000 }, async () => {
  const entered = gate(), output = gate();
  const f = await host({ active: false, heldNative: { entered, output } });
  try {
    const { parent, child } = f.retained, run = f.retainedRun;
    assert.equal(child.status, "running");
    const described = await f.invoke("dsmmChildren", "describe", { sessionId: parent.id }), row = described.children.find(row => row.id === child.id);
    assert.equal(row.mode, "continuable"); assert.equal(row.controls.prompt.enabled, true);
    assert.equal(row.invocation, undefined); assert.equal(row.evidence, undefined); assert.equal(row.routeComparison, undefined);
    const descendants = await f.invoke("dsmmChildren", "descendants", { sessionId: parent.id });
    assert.equal(descendants.descendants.find(row => row.kind === "child" && row.child.id === child.id).child.mode, "continuable");
    assert.equal(child.status, "running"); assert.equal(f.ctx.agents.get(child.id), child);
    assert.equal((await f.execute(child, "read")).isError, false); assert.equal(f.bodies.read, 1);
    output.release(); const result = await run.result;
    assert.equal(result.stopReason, "completed"); assert.match(JSON.stringify(result.output), /useful main-host result from native-held-child/u);
  } finally { output.release(); await f.dispose(); }
});

test("MAIN original Gateway connection replacement revokes pending browser delivery without rotating a parent or accepting a message", { timeout: 20000 }, async () => {
  const f = await host(), observing = gate(), release = gate();
  try {
    const parent = await f.create(), native = exact(f.ctx.subagents);
    const started = await f.execute(parent, "dsmm_reviewer", { description: "operator fence", prompt: "useful initial output" });
    const child = f.ctx.agents.get(started.value.subagentId); await child.whenIdle();
    const ticket = native.authority.acquireParentTicket(parent), count = f.adapter.calls.length;
    f.ctx.sessionQuery.beforeObserve = async id => { if (id === child.id) { observing.release(); await release.promise; } };
    const request = { requestId: randomUUID(), parentSessionId: parent.id, childSessionId: child.id, mode: "continuable", delivery: "queue", content: [{ type: "text", text: "old operator must not accept" }] };
    const pending = f.invoke("subagents", "prompt", { request });
    const denied = assert.rejects(pending, error => remoteErrorOf(error)?.code === "gateway/cancelled");
    await observing.promise; await f.replaceConnection();
    assert.equal(ticket.signal.aborted, false); release.release(); await denied;
    f.ctx.sessionQuery.beforeObserve = undefined;
    assert.equal(f.adapter.calls.length, count);
    const receipt = await f.invoke("subagents", "prompt", { request: { ...request, requestId: randomUUID(), content: [{ type: "text", text: "new actual operator" }] } });
    assert.equal(typeof receipt.messageId, "string"); await child.whenIdle();
    assert.equal(f.adapter.calls.length, count + 1); assert.equal(native.authority.acquireParentTicket(parent).parentEpoch, ticket.parentEpoch);
  } finally { release.release(); await f.dispose(); }
});

test("explicit startup refuses a duplicate stock service without replacing or draining its native work", { timeout: 15000 }, async () => {
  const f = await host({ binding: "stock", off: true });
  try {
    const parent = await f.create(), stock = exact(f.ctx.subagents);
    const child = await stock.startActivation({ provider: "spawn", label: "stock still owned", delivery: "parent", signal: new AbortController().signal,
      request: { parent, prompt: [{ type: "text", text: "useful native stock work" }], agentOptions: { provider: "fixture", model: "native-stock-child" } } });
    const resident = f.ctx.agents.get(child.childId); await resident.whenIdle();
    const duplicate = f.ctx.plugin(Startup, { maxDepth: 3, maxActiveSubagents: 8 });
    await assert.rejects(duplicate.await(), error => error.code === "DUPLICATE_PROVIDER"); await duplicate.dispose();
    assert.equal(exact(f.ctx.subagents), stock); assert.equal(f.ctx.agents.get(child.childId), resident);
    await stock.sendMessage(parent, child.childId, [{ type: "text", text: "same stock still functional" }], { signal: new AbortController().signal });
    await resident.whenIdle(); assert.equal(f.adapter.calls.at(-1).model, "native-stock-child");
  } finally { await f.dispose(); }
});

test("MAIN policy disposal leaves the unique service available but rejects new DSMM delivery before native acceptance", { timeout: 15000 }, async () => {
  const f = await host();
  try {
    const parent = await f.create(), native = exact(f.ctx.subagents);
    const created = await f.execute(parent, "dsmm_reviewer", { description: "retained native residency", prompt: "useful output" });
    const child = f.ctx.agents.get(created.value.subagentId); await child.whenIdle();
    const ticket = native.authority.acquireParentTicket(parent), count = f.adapter.calls.length;
    await f.mainFiber.dispose(); assert.equal(ticket.signal.aborted, true);
    assert.equal(exact(f.ctx.subagents), native); assert.equal(native.authority.view().deliveryFenceReady, false);
    await assert.rejects(native.sendMessage(parent, child.id, [{ type: "text", text: "unbound is not native authority" }], { signal: new AbortController().signal }), error => error.code === "UNAUTHORIZED");
    assert.equal(f.adapter.calls.length, count); assert.equal(f.ctx.agents.get(child.id), child);
  } finally { await f.dispose(); }
});

test("MAIN captured child keeps its original admission and native role guard through an actual FS read", { timeout: 20000 }, async () => {
  const f = await host({ nativeFs: true });
  try {
    const parent = await f.create();
    const created = await f.execute(parent, "dsmm_reviewer", { description: "captured actual FS", prompt: "useful native output" });
    assert.equal(created.isError, false, JSON.stringify(created)); const child = f.ctx.agents.get(created.value.subagentId); await child.whenIdle();
    const admission = f.runtime().admission(child); assert.ok(admission.childCapture);
    const original = child.ctx.tools.get("read", child);
    const result = await f.execute(child, "read", { file_path: "useful.txt", limit: 1 });
    assert.equal(result.isError, false, JSON.stringify(result)); assert.equal(f.bodies.read, 1);
    assert.equal(child.ctx.tools.get("read", child), original);
    assert.equal(f.runtime().admission(child), admission);
    for (const name of ["integration_write", "integration_shell", "pwsh"]) assert.equal((await f.execute(child, name)).isError, true);
    assert.equal(f.bodies.write, 0); assert.equal(f.bodies.pwsh, 0);
  } finally { await f.dispose(); }
});
