import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { DshAgent, DshContext } from "../src/dsh-types.js";
import type { DsmmProfileRuntime } from "../src/profile-runtime.js";
import { ProfileStore } from "../src/profile-store.js";
import { DsmmDeploymentConfig } from "../src/deployment-config.js";
import { nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const structural = (agent: Agent) => agent as unknown as DshAgent;
const route = { provider: "fixture", model: "publication-review", reasoningEffort: "high" };
function runtimeOf(f: Awaited<ReturnType<typeof nativeRoutingFixture>>) { return f.ctx.get("dsmmProfileRuntime") as unknown as DsmmProfileRuntime; }
function storeOf(f: Awaited<ReturnType<typeof nativeRoutingFixture>>) { return ProfileStore.fromCentral(f.home, f.profileDir, runtimeOf(f).admission().deployment!.entryId); }
async function choice(runtime: DsmmProfileRuntime, agent: Agent, settings: object) {
  const saved = await runtime.save({ id: "publication", expectedRevision: null, content: JSON.stringify({ version: 1, id: "publication", settings }) });
  const before = await runtime.getSession(structural(agent));
  return { sessionId: agent.id, id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: before.selection.selectionRevision, expectedAdmissionEpoch: before.admissionEpoch };
}

test("blank rollback failure rejects queued first execution and settles maintenance", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true }), entered = gate(), blocked = gate();
  const original = ProfileStore.prototype.selectSession;
  let selectionHook: ReturnType<typeof mock.method> | undefined, registrationHook: ReturnType<typeof mock.method> | undefined;
  try {
    const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "standard" }), before = runtime.admission(structural(agent));
    const request = await choice(runtime, agent, { defaultActive: true, subagents: { toolTopology: "parameterized" } });
    selectionHook = mock.method(ProfileStore.prototype, "selectSession", function (this: ProfileStore, ...[request, epoch, validate, commit]: Parameters<ProfileStore["selectSession"]>) {
      return original.call(this, request, epoch, async document => { entered.release(); await blocked.promise; return validate(document); }, commit);
    });
    const register = ToolRuntime.prototype.register;
    let failedRegistrations = 0;
    registrationHook = mock.method(ToolRuntime.prototype, "register", function (this: ToolRuntime, definition: Parameters<ToolRuntime["register"]>[0]) {
      if (definition.name.startsWith("dsmm_")) { failedRegistrations++; throw new Error("Persistent fixture registration failure"); }
      return register.call(this, definition);
    });
    const selecting = runtime.selectSession(request, structural(agent));
    await entered.promise;
    const first = runFixtureTurn(agent);
    blocked.release();
    const outcomes = await Promise.allSettled([selecting, first]);
    assert.equal(outcomes[0].status, "rejected");
    assert.ok(failedRegistrations >= 2, "both candidate and rollback installations reached the persistent failure");
    assert.equal(runtime.admission(structural(agent)), before);
    assert.equal((await storeOf(f).loadSessionSelection(agent.id)).admissionEpoch, null);
    assert.equal(agent.status, "idle");
    assert.equal(f.adapter.calls.length, 0, "a partially restored Agent must never start the queued model request");
    assert.throws(() => f.ctx.get("dsmmNativeAdmission")!.assert(agent), { code: "UNAUTHORIZED" });
    assert.equal(f.ctx.get("dsmmNativeAdmission")!.blankReason(agent), "runtime-unavailable");
  } finally { blocked.release(); selectionHook?.mock.restore(); registrationHook?.mock.restore(); await f.dispose(); }
});

test("blank provider preflight fences same-registry replacement and withdrawal across model resolution", { timeout: 20000 }, async t => {
  for (const mutation of ["replace", "withdraw"] as const) await t.test(mutation, async () => {
    const register = SubagentRuntime.prototype.registerProvider;
    let withdraw!: () => void;
    const providerHook = mock.method(SubagentRuntime.prototype, "registerProvider", function (this: SubagentRuntime, provider: SubagentProvider) {
      const dispose = register.call(this, provider);
      if (provider.name === "dsmm-role-reviewer") withdraw = dispose;
      return dispose;
    });
    const entered = gate(), blocked = gate();
    const f = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-reviewer": { primary: route } } });
    let modelHook: ReturnType<typeof mock.method> | undefined;
    try {
      const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "standard" }), before = runtime.admission(structural(agent));
      const request = await choice(runtime, agent, { defaultActive: true, locale: "ja", roleRouting: { "dsmm-reviewer": { primary: route } } });
      const resolve = f.adapter.resolveModel;
      modelHook = mock.method(f.adapter, "resolveModel", async function (...[provider, model]: Parameters<typeof resolve>) {
        if (model === route.model) { entered.release(); await blocked.promise; }
        return resolve.call(f.adapter, provider, model);
      });
      const selecting = runtime.selectSession(request, structural(agent));
      await entered.promise;
      const old = f.subagents.getProvider("dsmm-role-reviewer")!;
      withdraw();
      if (mutation === "replace") f.subagents.registerProvider({ ...old });
      blocked.release();
      await assert.rejects(selecting, { code: "conflict" });
      assert.equal(runtime.admission(structural(agent)), before);
      assert.equal((await storeOf(f).loadSessionSelection(agent.id)).admissionEpoch, null);
      assert.equal(f.adapter.calls.length, 0);
    } finally { blocked.release(); modelHook?.mock.restore(); providerHook.mock.restore(); await f.dispose(); }
  });
});

test("blank commit publishes the new skill catalog after an outside old-admission lookup during prepare", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true }, { async beforeDsmm(ctx) {
    const deployment = new DsmmDeploymentConfig(ctx as DshContext, {});
    await deployment.store.save(JSON.stringify({ skills: { frontend: false } }), (await deployment.readGlobal()).revision, () => {});
  } });
  const entered = gate(), blocked = gate(), original = ProfileStore.prototype.selectSession;
  let hook: ReturnType<typeof mock.method> | undefined;
  try {
    const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "standard" });
    const registry = agent.ctx.get("agentPresets")!.serviceFor(agent, "skills") ?? agent.ctx.get("skills")!;
    const lookup = { scope: agent, cwd: agent.session.header.cwd };
    assert.equal((await registry.list(lookup)).some(skill => skill.name === "frontend"), false);
    const deployment = f.ctx.get("dsmmDeploymentConfig")!;
    await deployment.store.save(JSON.stringify({ skills: { frontend: true } }), (await deployment.readGlobal()).revision, () => {});
    const request = await choice(runtime, agent, { defaultActive: true });
    hook = mock.method(ProfileStore.prototype, "selectSession", function (this: ProfileStore, ...[request, epoch, validate, commit]: Parameters<ProfileStore["selectSession"]>) {
      return original.call(this, request, epoch, validate, { ...commit, async prepare(selection, prepared) {
        await commit.prepare?.(selection, prepared); entered.release(); await blocked.promise;
      } });
    });
    const selecting = runtime.selectSession(request, structural(agent));
    await entered.promise;
    const during = await registry.snapshot(lookup);
    assert.equal(during.skills.some(skill => skill.name === "frontend"), false);
    blocked.release(); await selecting;
    let firstCatalog: string[] = [];
    agent.ctx.on("agent/request", async (_frame, next) => { firstCatalog = (await registry.list(lookup)).map(skill => skill.name); return next(); }, { prepend: true });
    await runFixtureTurn(agent);
    assert.equal(f.adapter.calls.length, 1);
    assert.ok(firstCatalog.includes("frontend"), "the first real request must observe the committed skill catalog");
    assert.equal(during.complete, false, "an old-admission observation during preparation cannot be cached as complete");
    assert.ok((await registry.list(lookup)).some(skill => skill.name === "frontend"));
  } finally { blocked.release(); hook?.mock.restore(); await f.dispose(); }
});

test("blank reinstallation binds an already replaced same-capability provider for the first child", { timeout: 15000 }, async () => {
  const register = SubagentRuntime.prototype.registerProvider;
  let withdraw!: () => void;
  const hook = mock.method(SubagentRuntime.prototype, "registerProvider", function (this: SubagentRuntime, provider: SubagentProvider) {
    const dispose = register.call(this, provider);
    if (provider.name === "dsmm-role-reviewer") withdraw = dispose;
    return dispose;
  });
  const f = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-reviewer": { primary: route } } });
  try {
    const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "standard" });
    const old = f.subagents.getProvider("dsmm-role-reviewer")!;
    withdraw();
    let preparations = 0;
    const owner = f.ctx.get("dsmmNativeAdmission")!;
    const replacement: SubagentProvider = { ...old, async prepareContinuable(request) {
      owner.prepare(request, replacement); preparations++;
      const prepared = await f.subagents.getProvider("spawn")!.prepareContinuable!(request);
      owner.prepare(request, replacement);
      return prepared;
    } };
    f.subagents.registerProvider(replacement);
    const selected = await runtime.selectSession(await choice(runtime, agent, { defaultActive: true, locale: "ja" }), structural(agent));
    const child = await f.createAuxiliary("dsmm-reviewer", undefined, "continuable", agent);
    await runFixtureTurn(child);
    assert.equal(preparations, 1);
    assert.equal(runtime.admission(structural(child)).epoch, selected.admissionEpoch);
    assert.equal(runtime.admission(structural(child)).settings.locale, "ja");
    assert.equal(f.adapter.calls[0]?.model, route.model);
    await f.releaseAuxiliary(child);
  } finally { hook.mock.restore(); await f.dispose(); }
});
