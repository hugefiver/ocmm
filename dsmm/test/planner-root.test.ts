import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import type { Context } from "@deepseek-ai/cordis";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { JobRegistry } from "@deepseek-ai/dsh-jobs";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import type { DshAgent as PackageDshAgent, DshContext } from "../src/dsh-types.ts";
import { DsmmDeploymentConfig as DeploymentConfig, parseGlobalConfig } from "../src/deployment-config.ts";
import type { DsmmDeploymentConfig } from "../src/deployment-config.ts";
import { admissionFromChildCapture, parseChildAdmissionCapture } from "../src/child-capture.ts";
import { DsmmRolePolicy } from "../src/role-policy.ts";
import { DeepworkModeController } from "../src/state.ts";
import { DSMM_CONFIG_SCHEMA, deploymentEditorSchema, resolveConfig, resolveDeployment } from "../src/settings.ts";
import { validateProfileOverlay } from "../src/profiles.ts";
import type { DsmmProfileRuntime } from "../src/profile-runtime.ts";
import { TYPERT_REMOTE } from "../src/profile-remote.ts";
import { readOnlySettings } from "../src/status.ts";
import { projectDsmmModules } from "../src/modules.ts";
import DsmmSessionPersistence from "../src/session-persistence.ts";
import DsmmPlugin from "../src/index.ts";
import { DSMM_ROLES, rolePluginRows } from "../src/roles.ts";
import { ProfileStore } from "../src/profile-store.ts";
import "./profile-apply-source-loader.mjs";

const { nativeRoutingFixture, RoutingFixtureAdapter, runFixtureTurn } = await import("./native-routing-fixture.ts");

type DshAgent = Omit<PackageDshAgent, "ctx">;

class ModelObservationAdapter extends RoutingFixtureAdapter {
  resolutions = 0;
  beforeResolve?: (provider: string, model: string) => Promise<void>;
  override async resolveModel(provider: string, model: string) {
    this.resolutions++;
    await this.beforeResolve?.(provider, model);
    return super.resolveModel(provider, model);
  }
}

/** Mount the real standing presets without enabling external I/O adapters. */
async function inertHost(ctx: Context): Promise<void> {
  const denied = async (): Promise<never> => { throw new Error("Planner fixture forbids external I/O"); };
  ctx.provide("web", { search: denied, fetch: denied });
  if (ctx.get("fs") === undefined) ctx.provide("fs", { readFile: denied, writeFile: denied, edit: denied, stat: denied });
  ctx.provide("subprocess", { spawn: denied }); ctx.provide("shell", { execute: denied });
  ctx.provide("shellEnv", { resolve: denied });
  class InertJobs extends JobRegistry {
    events = { subscribe: () => () => {} };
    start(): never { throw new Error("Planner fixture forbids background work"); }
    list() { return []; }
    get(): never { throw new Error("No fixture job"); }
    read(): never { throw new Error("No fixture job"); }
    readAt(): never { throw new Error("No fixture job"); }
    wait(): never { throw new Error("No fixture job"); }
    kill(): never { throw new Error("No fixture job"); }
    remove(): never { throw new Error("No fixture job"); }
    attachController() { return () => {}; }
  }
  await ctx.plugin(InertJobs).await();
}

function nativePlannerDefinition() {
  const planner = DSMM_ROLES.find(role => role.id === "dsmm-planner")!;
  return { id: planner.id, name: planner.name, plugins: rolePluginRows(planner).map(({ isolate, ...row }) => ({
    ...row, ...(isolate === undefined ? {} : { isolate: Object.fromEntries(Object.entries(isolate).map(([key, value]) => {
      assert.ok(value);
      return [key, value] as const;
    })) })
  })) };
}

function* call(name: string, args: unknown): Generator<StreamChunk> {
  const id = ToolCallId(`planner-${name}`), argumentsText = JSON.stringify(args);
  yield { type: "block-start", index: 0, blockType: "tool-call" };
  yield { type: "tool-call-delta", index: 0, id, name, argumentsDelta: argumentsText };
  yield { type: "block-end", index: 0, block: { type: "tool-call", id, name, arguments: argumentsText } };
  yield { type: "finish", reason: { kind: "tool-calls" } };
}

function* answer(text: string): Generator<StreamChunk> {
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

test("Planner root config is deployment-only, defaults off, and retains workflow role enablement", () => {
  const off = resolveConfig(DSMM_CONFIG_SCHEMA({}));
  assert.equal(off.presets.plannerRootEnabled, false);
  assert.equal(off.roles["dsmm-planner"], true);
  const global = parseGlobalConfig('{"presets":{"plannerRootEnabled":true}}');
  assert.equal(resolveDeployment(global, {}).presets.plannerRootEnabled, true);
  assert.equal(resolveDeployment(global, { presets: { plannerRootEnabled: false } }).presets.plannerRootEnabled, false);
  assert.equal(deploymentEditorSchema().fields?.presets.fields?.plannerRootEnabled.type, "boolean");
  for (const value of [null, "true", 1]) {
    assert.throws(() => parseGlobalConfig(JSON.stringify({ presets: { plannerRootEnabled: value } })), { code: "validation", field: "presets.plannerRootEnabled" });
    const malformed = { presets: { plannerRootEnabled: false } };
    Reflect.set(malformed.presets, "plannerRootEnabled", value);
    assert.throws(() => resolveConfig(malformed));
  }
  assert.throws(() => validateProfileOverlay({ presets: { plannerRootEnabled: true } }));
});

test("native picker, definition export and forced Root creation refuse disabled Planner before prompt/model", { timeout: 20_000 }, async () => {
  const adapter = new ModelObservationAdapter();
  const f = await nativeRoutingFixture({}, { adapter, nativePresets: true, beforeDsmm: inertHost });
  try {
    const registry = f.ctx.agentPresets;
    const ids = (await registry.remoteExportList()).presets.map(row => row.id);
    assert.ok(ids.includes("dsmm-orchestrator") && ids.includes("dsmm-builder"));
    assert.equal(ids.includes("dsmm-planner"), false);
    await assert.rejects(registry.resolve("dsmm-planner"));
    await assert.rejects(registry.readDocument("dsmm-planner"));
    let prompts = 0, requests = 0;
    f.ctx.on("system-prompt/assemble", async (_body, _options, next) => { prompts++; return next(); });
    f.ctx.on("agent/request", async (_frame, next) => { requests++; return next(); });
    await assert.rejects(f.create({ agentPreset: "dsmm-planner" }));
    // An independently supplied native definition cannot turn Root exposure on.
    const unregister = await registry.register({ id: "dsmm-planner", name: "External Planner", plugins: [] });
    try {
      await assert.rejects(f.create({ agentPreset: "dsmm-planner" }), { code: "activation", field: "settings.presets.plannerRootEnabled" });
      await assert.rejects(f.create({ agentPreset: "standard" }, undefined, { async setup(scope) {
        await registry.mount(scope, "dsmm-planner");
      } }), { code: "UNAUTHORIZED" });
      const ordinary = await f.create({ agentPreset: "standard" });
      await registry.select(ordinary, "dsmm-planner");
      await assert.rejects(ordinary.ctx.systemPrompt.assemble({ scope: ordinary }), { code: "UNAUTHORIZED" });
      await runFixtureTurn(ordinary);
    } finally { await unregister(); }
    assert.equal(prompts, 0); assert.equal(requests, 0); assert.equal(f.adapter.calls.length, 0);
    assert.equal(adapter.resolutions, 0);
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const deployment = f.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
    await deployment.saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["presets", "plannerRootEnabled"], value: true }] }, () => {});
    const next = await f.create({ agentPreset: "standard" });
    assert.equal(runtime.admission(next as DshAgent).settings.presets.plannerRootEnabled, false);
    assert.ok(runtime.admission(next as DshAgent).restartRequired?.includes("presets"));
    await assert.rejects(f.create({ agentPreset: "dsmm-planner" }));
    assert.equal(f.adapter.calls.length, 0);
    assert.equal(adapter.resolutions, 0);
  } finally { await f.dispose(); }
});

test("Root-off selected Planner metadata cannot hide behind a standard composition before a native turn", { timeout: 20_000 }, async () => {
  const adapter = new ModelObservationAdapter();
  const f = await nativeRoutingFixture({}, { adapter, nativePresets: true, nativeFs: true, beforeDsmm: inertHost });
  try {
    const root = await f.create({ agentPreset: "standard" });
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const admitted = runtime.admission(root as DshAgent);
    let prompts = 0;
    f.ctx.on("system-prompt/assemble", async (_body, _options, next) => { prompts++; return next(); });
    root.session.append("agent-preset/selected", { agentPreset: "dsmm-planner" });
    assert.equal(f.ctx.agentPresets.composedPreset(root.ctx), "standard");
    await runFixtureTurn(root);
    assert.equal(adapter.resolutions, 0);
    assert.equal(adapter.calls.length, 0); assert.equal(prompts, 0);
    assert.equal(runtime.admission(root as DshAgent), admitted);
    const policy = new DsmmRolePolicy(f.ctx as unknown as DshContext, runtime.getSettings, new DeepworkModeController(f.ctx as unknown as DshContext));
    assert.throws(() => policy.assertModuleAdmission(root as DshAgent), { code: "UNAUTHORIZED" });
    assert.throws(() => policy.validateRootRole(root as DshAgent, admitted), { code: "UNAUTHORIZED" });
    assert.throws(() => policy.identity(root as DshAgent), { code: "UNAUTHORIZED" });
  } finally { await f.dispose(); }
});

test("retained Root with Planner composition and standard metadata is refused before startup catalog I/O or authority publication", { timeout: 20_000 }, async () => {
  const adapter = new ModelObservationAdapter();
  const f = await nativeRoutingFixture({}, { adapter, nativePresets: true, nativeFs: true, beforeDsmm: inertHost });
  let startup: ReturnType<Context["plugin"]> | undefined;
  try {
    const root = await f.create({ agentPreset: "standard" });
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const store = ProfileStore.fromCentral(f.home, f.profileDir, runtime.admission().deployment!.entryId);
    const selection = await store.loadSessionSelection(root.id);
    const authority = f.ctx.get("dsmmRuntimeIntegration")!.runtime.authority;
    await f.dsmmFiber.dispose();
    const planner = nativePlannerDefinition();
    await f.ctx.agentPresets.register(planner);
    await f.ctx.agentPresets.mount(root.ctx, planner.id);
    assert.equal(root.session.header.agentPreset, "standard");
    assert.equal(f.ctx.agentPresets.composedPreset(root.ctx), planner.id);
    let prompts = 0;
    f.ctx.on("system-prompt/assemble", async (_body, _options, next) => { prompts++; return next(); });
    startup = f.ctx.plugin({ name: "planner-retained-root-admission", inject: [...DsmmPlugin.inject],
      apply(ctx) { return DsmmPlugin.apply(ctx as unknown as DshContext, {}); } });
    await assert.rejects(startup.await());
    assert.equal(adapter.resolutions, 0);
    assert.equal(adapter.calls.length, 0); assert.equal(prompts, 0);
    assert.equal(f.ctx.get("dsmmProfileRuntime"), undefined);
    assert.throws(() => authority.acquireParentTicket(root));
    assert.deepEqual(await store.loadSessionSelection(root.id), selection);
  } finally { await startup?.dispose(); await f.dispose(); }
});

test("Planner composition mismatch refuses profile Apply before catalog I/O and preserves the root admission and sidecar", { timeout: 20_000 }, async () => {
  const adapter = new ModelObservationAdapter();
  const f = await nativeRoutingFixture({}, { adapter, nativePresets: true, nativeFs: true, spawn: false, beforeDsmm: inertHost });
  try {
    const root = await f.create({ agentPreset: "standard" });
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const admitted = runtime.admission(root as DshAgent);
    const before = await runtime.getSession(root as DshAgent);
    const draft = await runtime.save({ id: "planner-root-candidate", expectedRevision: null, content: '{"version":1,"id":"planner-root-candidate","settings":{"workflow":{"reviewCap":2}}}' });
    const store = ProfileStore.fromCentral(f.home, f.profileDir, admitted.deployment!.entryId);
    const selection = await store.loadSessionSelection(root.id);
    const planner = nativePlannerDefinition();
    await f.ctx.agentPresets.register(planner);
    await f.ctx.agentPresets.mount(root.ctx, planner.id);
    await assert.rejects(runtime.selectSession({ sessionId: root.id, id: draft.id, expectedRevision: draft.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }, root as DshAgent));
    assert.equal(adapter.resolutions, 0); assert.equal(adapter.calls.length, 0);
    assert.equal(runtime.admission(root as DshAgent), admitted);
    assert.deepEqual(await store.loadSessionSelection(root.id), selection);
  } finally { await f.dispose(); }
});

test("profile Apply rechecks selected Planner after awaited preset validation without publishing a new root capture", { timeout: 20_000 }, async t => {
  const adapter = new ModelObservationAdapter();
  const f = await nativeRoutingFixture({ defaultActive: true }, { adapter, nativePresets: true, nativeFs: true, beforeDsmm: inertHost });
  let release!: () => void;
  let settled: Promise<unknown> | undefined;
  try {
    const root = await f.create({ agentPreset: "standard" });
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const admitted = runtime.admission(root as DshAgent);
    const before = await runtime.getSession(root as DshAgent);
    const draft = await runtime.save({ id: "paused-root-candidate", expectedRevision: null,
      content: '{"version":1,"id":"paused-root-candidate","settings":{"workflow":{"reviewCap":2}}}' });
    const store = ProfileStore.fromCentral(f.home, f.profileDir, admitted.deployment!.entryId);
    const selection = await store.loadSessionSelection(root.id);
    let entered!: () => void;
    const auditing = new Promise<void>(resolve => { entered = resolve; });
    const paused = new Promise<void>(resolve => { release = resolve; });
    const registry = f.ctx.agentPresets;
    const resolve = registry.resolve.bind(registry);
    t.mock.method(registry, "resolve", async (id: string) => { if (id === "dsmm-orchestrator") { entered(); await paused; } return resolve(id); });
    settled = runtime.selectSession({ sessionId: root.id, id: draft.id, expectedRevision: draft.revision,
      expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch }, root as DshAgent)
      .then(() => undefined, (error: unknown) => error);
    await Promise.race([auditing, settled.then(error => { throw error ?? new Error("Profile Apply settled before the preset pause"); })]);
    assert.equal(runtime.admission(root as DshAgent), admitted);
    root.session.append("agent-preset/selected", { agentPreset: "dsmm-planner" });
    assert.equal(f.ctx.agentPresets.composedPreset(root.ctx), "standard");
    release();
    const failure = await settled;
    assert.ok(failure instanceof Error && "code" in failure);
    assert.equal(failure.code, "conflict");
    assert.equal(runtime.admission(root as DshAgent), admitted);
    assert.deepEqual(await store.loadSessionSelection(root.id), selection);
    assert.equal(adapter.resolutions, 0);
    assert.equal(adapter.calls.length, 0);
  } finally { release?.(); await settled; await f.dispose(); }
});

test("Root-off workflow Planner returns real native child output and readonly guards precede host approval", { timeout: 20_000 }, async () => {
  let mutations = 0;
  const names = ["write", "edit", "pwsh", "bash", "shell"];
  const f = await nativeRoutingFixture({ defaultActive: true, guards: { scope: "off", gitWriteGuard: "off" }, roleRouting: {
    "dsmm-planner": { primary: { provider: "fixture", model: "workflow-planner" } }
  } }, { nativePresets: true, beforeDsmm: inertHost, fixtureTools: names.map(name => ({
    name, description: "Counter-only mutation", parameters: {}, output: { schema: { type: "string" as const }, render: () => [] },
    async execute() { mutations++; return "MUTATION"; }
  })) });
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const policy = new DsmmRolePolicy(f.ctx as unknown as DshContext, runtime.getSettings, new DeepworkModeController(f.ctx as unknown as DshContext));
    const childResults: unknown[] = [];
    f.ctx.on("tools/pre-execute", async () => ({ kind: "allow" as const }), { global: true });
    f.ctx.on("tools/result", (execution, result) => { if (execution.name === "dsmm_planner") childResults.push(result); }, { global: true });
    const turns = new Map<string, number>();
    f.adapter.streamChunks = async function* (options) {
      const turn = turns.get(options.model) ?? 0; turns.set(options.model, turn + 1);
      if (options.model === "native-default" && turn === 0) yield* call("dsmm_planner", { description: "Readonly plan", prompt: "Return the actual plan" });
      else if (options.model === "workflow-planner" && turn === 0) yield* call("read", {});
      else yield* answer(options.model === "workflow-planner" ? "PLANNER_NATIVE_RESULT" : "COORDINATOR_RESULT");
    };
    const parent = await f.create({ agentPreset: "standard" });
    await runFixtureTurn(parent);
    assert.match(JSON.stringify(childResults), /PLANNER_NATIVE_RESULT/u);
    assert.deepEqual([...turns], [["native-default", 2], ["workflow-planner", 2]]);
    const run = await f.subagents.startActivation({ provider: "dsmm-role-planner", label: "Readonly planner", delivery: "caller", signal: new AbortController().signal,
      request: { parent, prompt: [] } });
    try {
      const child = f.agents.get(run.childId)!;
      assert.ok(child);
      assert.equal(policy.identity(child as DshAgent).role, "dsmm-planner");
      assert.equal(policy.identity(child as DshAgent).readOnly, true);
      const original = runtime.admission(child as DshAgent).childCapture!;
      assert.equal(Object.hasOwn(original.runtimePolicyCapture, "presets"), false);
      const capture = parseChildAdmissionCapture(JSON.parse(JSON.stringify(original)));
      const recovered = admissionFromChildCapture(capture, resolveConfig({ presets: { plannerRootEnabled: true }, guards: { scope: "off" } }));
      assert.equal(recovered.epoch, original.originalAdmissionEpoch);
      assert.equal(recovered.childCapture!.authorityCeiling.readOnly, true);
      assert.deepEqual(recovered.settings.roleRouting, original.runtimePolicyCapture.roleRouting);
      for (const name of names) {
        const result = await child.ctx.tools.execute({ agent: child, name, arguments: { command: "git push origin main" }, callId: ToolCallId(`planner-denied-${name}`), signal: new AbortController().signal });
        assert.equal(result.isError, true, name);
      }
      assert.equal(mutations, 0);
      assert.equal((await child.ctx.tools.execute({ agent: child, name: "read", arguments: {}, callId: ToolCallId("planner-read"), signal: new AbortController().signal })).isError, false);
      assert.equal((await run.result).stopReason, "completed");
    } finally { await run.dispose(); }
  } finally { await f.dispose(); }
});

test("opted-in Root Planner is readonly and desired toggle requires restart; cold Root resume is fenced off", { timeout: 30_000 }, async () => {
  const on = await nativeRoutingFixture({ guards: { scope: "off", gitWriteGuard: "off" } }, { nativePresets: true, nativeFs: true, persistence: true, async beforeDsmm(ctx) {
    await inertHost(ctx);
    const deployment = new DeploymentConfig(ctx as unknown as DshContext, {});
    await deployment.saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["presets", "plannerRootEnabled"], value: true }] }, () => {});
  } });
  let off: Awaited<ReturnType<typeof nativeRoutingFixture>> | undefined;
  try {
    const registry = on.ctx.agentPresets;
    assert.ok((await registry.remoteExportList()).presets.some(row => row.id === "dsmm-planner"));
    assert.equal((await registry.resolve("dsmm-planner")).broken, undefined);
    assert.equal((await registry.readDocument("dsmm-planner")).agentPreset, "dsmm-planner");
    const planner = await on.create({ agentPreset: "dsmm-planner" });
    const runtime = on.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const admitted = runtime.admission(planner as DshAgent);
    let mutations = 0;
    planner.ctx.tools.register({ name: "pwsh", description: "Counter-only shell", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { mutations++; return "MUTATION"; } });
    on.ctx.on("tools/pre-execute", async () => ({ kind: "allow" as const }), { global: true });
    assert.equal((await planner.ctx.tools.execute({ agent: planner, name: "pwsh", arguments: { command: "git commit -m denied" }, callId: ToolCallId("root-planner-write"), signal: new AbortController().signal })).isError, true);
    for (const name of ["write", "edit"]) assert.equal((await planner.ctx.tools.execute({ agent: planner, name,
      arguments: { file_path: join(on.profileDir, "root-planner-sentinel"), content: "not permitted" }, callId: ToolCallId(`root-planner-${name}`), signal: new AbortController().signal })).isError, true);
    assert.equal(mutations, 0);
    await runFixtureTurn(planner);
    assert.equal(on.adapter.calls.length, 1);
    const deployment = on.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
    await deployment.saveGlobal({ expectedRevision: (await deployment.readGlobal()).revision, edits: [{ op: "set", path: ["presets", "plannerRootEnabled"], value: false }] }, () => {});
    assert.equal(runtime.admission(planner as DshAgent), admitted);
    const next = await on.create({ agentPreset: "dsmm-planner" });
    assert.equal(runtime.admission(next as DshAgent).settings.presets.plannerRootEnabled, true);
    assert.ok(runtime.admission(next as DshAgent).restartRequired?.includes("presets"));
    const desired = await deployment.readDesired();
    const codec = TYPERT_REMOTE.descriptors.find(row => row.service === "dsmmConfig" && row.method === "describeSettings")!.result;
    assert.equal(codec.mode, "strict");
    if (codec.mode !== "strict") throw new Error("Deployment codec must be strict");
    const editor = { entryId: desired.entryId, namespace: desired.nativeNamespace ?? null, hostProfileKey: desired.hostProfileKey,
      global: desired.global, globalRevision: desired.globalRevision, profile: desired.profile, nativeRevision: desired.nativeRevision,
      nativeFormRevision: desired.nativeFormRevision ?? null, nativeForm: null, desired: readOnlySettings(desired.settings), sources: desired.sources,
      startup: readOnlySettings(admitted.settings), defaults: {}, schema: deploymentEditorSchema(), nextRoot: runtime.previewDeployment(desired), modules: projectDsmmModules(admitted.settings, desired, undefined, true) };
    assert.doesNotThrow(() => codec.create().parse(JSON.parse(JSON.stringify(editor))));
    assert.throws(() => codec.create().parse({ ...editor, desired: { ...editor.desired, presets: { materialize: false, plannerRootEnabled: "true" } } }));
    await on.disposeAgent(planner);
    const offAdapter = new ModelObservationAdapter();
    off = await nativeRoutingFixture({}, { adapter: offAdapter, nativePresets: true, home: on.home, profileDir: on.profileDir, async beforeDsmm(ctx) {
      await inertHost(ctx);
      await ctx.plugin(DsmmSessionPersistence, { root: join(on.profileDir, "sessions"), compression: "none" }).await();
    } });
    let prompts = 0;
    off.ctx.on("system-prompt/assemble", async (_body, _options, next) => { prompts++; return next(); });
    assert.equal((await off.ctx.agentPresets.remoteExportList()).presets.some(row => row.id === "dsmm-planner"), false);
    await assert.rejects(off.agents.resume({ resumeSessionId: planner.id, agentOptions: planner.options }), { code: "activation", field: "settings.presets.plannerRootEnabled" });
    assert.equal(off.adapter.calls.length, 0);
    assert.equal(offAdapter.resolutions, 0); assert.equal(prompts, 0);
    assert.equal(off.agents.get(planner.id), undefined);
  } finally { await off?.dispose(); await on.dispose(); }
});

test("Planner child capture cold-resumes readonly without borrowing desired Root or parent authority", { timeout: 20_000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { backgroundMode: "continuable", enableRunInBackground: true }, roleRouting: {
    "dsmm-planner": { primary: { provider: "fixture", model: "original-planner" } }
  } }, { headless: true, persistence: true });
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const child = await f.createAuxiliary("dsmm-planner", undefined, "continuable");
    child.session.append("agent-preset/selected", { agentPreset: "dsmm-planner" });
    await runFixtureTurn(child);
    const original = runtime.admission(child as DshAgent).childCapture!;
    assert.equal(original.version, 3);
    assert.equal(original.delegationMode, "continuable");
    assert.equal(Object.hasOwn(original.runtimePolicyCapture, "presets"), false);
    const serialized = JSON.stringify(original);
    const deployment = f.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
    await deployment.saveGlobal({ expectedRevision: "absent", edits: [
      { op: "set", path: ["presets", "plannerRootEnabled"], value: true },
      { op: "set", path: ["roleRouting", "dsmm-planner", "primary"], value: { provider: "fixture", model: "desired-planner" } }
    ] }, () => {});
    const resumed = await f.resumeAuxiliary(child);
    const captured = runtime.admission(resumed as DshAgent);
    assert.equal(JSON.stringify(captured.childCapture), serialized);
    assert.equal(captured.epoch, original.originalAdmissionEpoch);
    assert.equal(captured.childCapture!.authorityCeiling.readOnly, true);
    assert.equal(captured.settings.roleRouting["dsmm-planner"]!.primary!.model, "original-planner");
    assert.equal((await resumed.ctx.tools.execute({ agent: resumed, name: "write", arguments: {}, callId: ToolCallId("cold-planner-write"), signal: new AbortController().signal })).isError, true);
    await runFixtureTurn(resumed);
    assert.equal(resumed.session.requestHeader()!.config.model, "original-planner");
    assert.equal(f.adapter.calls.filter(row => row.model === "original-planner").length, 2);
    assert.equal(f.adapter.calls.some(row => row.model === "desired-planner"), false);
  } finally { await f.dispose(); }
});

for (const disabled of ["role", "module"] as const) {
  test(`Planner Root opt-in cannot lift ${disabled} disablement`, { timeout: 20_000 }, async () => {
    const f = await nativeRoutingFixture({ ...(disabled === "role" ? { roles: { "dsmm-planner": false } } : {}), presets: { plannerRootEnabled: true } }, { nativePresets: true, async beforeDsmm(ctx) {
      await inertHost(ctx);
      if (disabled === "module") {
        const deployment = new DeploymentConfig(ctx as unknown as DshContext, {});
        await deployment.saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["modules", "deepwork", "enabled"], value: false }] }, () => {});
      }
    } });
    try {
      // The disabled-role fixture may supply a standing persona independently.
      await assert.rejects(f.create({ agentPreset: "dsmm-planner" }));
      const parent = await f.create({ agentPreset: "standard" });
      await assert.rejects(f.subagents.startActivation({ provider: "dsmm-role-planner", label: "Disabled planner", delivery: "caller", signal: new AbortController().signal,
        request: { parent, prompt: [] } }));
      assert.equal(f.adapter.calls.length, 0);
    } finally { await f.dispose(); }
  });
}
