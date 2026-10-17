import assert from "node:assert/strict";
import { test } from "node:test";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { DsmmDeploymentConfig } from "../lib/deployment-config.js";
import { DsmmDeploymentConfig as DeploymentConfig } from "../lib/deployment-config.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DshAgent as PackageDshAgent, DshContext } from "../lib/dsh-types.js";
import dsmmPlugin from "../lib/index.js";
import { DsmmRolePolicy } from "../lib/role-policy.js";
import { DeepworkModeController } from "../lib/state.js";
import { classifyDsmmAgent } from "../lib/runtime-integration.js";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";

type DshAgent = Omit<PackageDshAgent, "ctx">;

function categoryTargets(agent: import("@deepseek-ai/dsh-agent").Agent): string[] {
  const schema = agent.ctx.get("tools")!.schemas(agent).find(row => row.name === "dsmm_category");
  return schema === undefined ? [] : (schema.parameters as { properties: { category: { enum: string[] } } }).properties.category.enum;
}

test("retired DSMM entry rejects live authority while exact native owned run cleanup still releases its children", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { maxDepth: 3, enableRunInBackground: true, backgroundMode: "continuable" } }, { persistence: true });
  const runs: Array<Awaited<ReturnType<typeof f.subagents.startActivation>>> = [];
  try {
    const root = await f.create();
    const reviewer = await f.subagents.startActivation({ provider: "dsmm-role-reviewer", delivery: "parent", label: "Owned reviewer", request: { parent: root, prompt: [] }, signal: new AbortController().signal });
    runs.push(reviewer);
    const child = f.agents.get(reviewer.childId)!; await child.whenIdle();
    const leafRun = await f.subagents.startActivation({ provider: "dsmm-role-code-search", delivery: "parent", label: "Owned leaf", request: { parent: child, prompt: [] }, signal: new AbortController().signal });
    runs.push(leafRun);
    const leaf = f.agents.get(leafRun.childId)!; await leaf.whenIdle();
    assert.ok(child.session.snapshotEvents().some(event => event.type === "turn/end" && event.data.reason.kind === "completed"));
    assert.ok(leaf.session.snapshotEvents().some(event => event.type === "turn/end" && event.data.reason.kind === "completed"));
    const integration = f.ctx.get("dsmmRuntimeIntegration")!;
    const childTicket = integration.runtime.authority.acquireParentTicket(child);
    const leafTicket = integration.runtime.authority.acquireParentTicket(leaf);
    const calls = f.adapter.calls.length;
    await f.dsmmFiber.dispose();
    assert.equal(childTicket.signal.aborted, true);
    assert.equal(leafTicket.signal.aborted, true);
    assert.throws(() => f.dsmmFiber.ctx.agents, /inactive context/u);
    assert.throws(() => integration.runtime.authority.acquireParentTicket(child));
    await assert.rejects(f.subagents.sendMessage(root, child.id, [{ type: "text", text: "retired owner cannot deliver" }], { signal: new AbortController().signal }));
    await leafRun.dispose();
    await reviewer.dispose();
    assert.equal(f.agents.get(leaf.id), undefined);
    assert.equal(f.agents.get(child.id), undefined);
    assert.equal(f.agents.get(root.id), root);
    assert.equal(f.adapter.calls.length, calls);
  } finally {
    for (const run of runs.reverse()) await run.dispose();
    await f.dispose();
  }
});

test("old busy parent and future native children retain effective epoch while new roots capture off/on and missing startup substrate requires restart", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-coding": { primary: { provider: "fixture", model: "owned-child" } } } }, {
    async beforeDsmm(ctx) {
      const deployment = new DeploymentConfig(ctx as unknown as DshContext, {});
      await deployment.saveGlobal({ expectedRevision: "absent", edits: [{ op: "set", path: ["runtimeRecovery", "enabled"], value: true }] }, () => {});
    }
  });
  let release!: () => void;
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const deployment = f.ctx.get("dsmmDeploymentConfig") as DsmmDeploymentConfig;
    const parent = await f.create(); const admitted = parent as unknown as DshAgent;
    const before = runtime.admission(admitted);
    let entered!: () => void;
    const started = new Promise<void>((done) => { entered = done; });
    const waiting = new Promise<void>((done) => { release = done; });
    f.adapter.beforeStream = async (options) => { if (options.model === "native-default") { entered(); await waiting; } };
    parent.followup(createUserMessage({ content: [{ type: "text", text: "Hold while desired is saved" }], source: { kind: "user" } }));
    await started;
    const global = await deployment.readGlobal();
    await deployment.saveGlobal({ expectedRevision: global.revision, edits: [
      { op: "set", path: ["roles", "dsmm-coding"], value: false },
      { op: "set", path: ["skills", "debugging"], value: false },
      { op: "set", path: ["runtimeRecovery", "enabled"], value: false }
    ] }, () => {});
    assert.equal(parent.status, "running"); assert.equal(runtime.admission(admitted), before);
    const future = await f.subagents.startActivation({ provider: "dsmm-role-coding", delivery: "caller", label: "Original admission", request: { parent, prompt: [{ type: "text", text: "Future child uses original admission" }] }, signal: new AbortController().signal });
    const futureChild = f.agents.get(future.childId)!;
    try {
      assert.equal((await future.result).stopReason, "completed");
      const childAdmission = runtime.admission(futureChild as unknown as DshAgent);
      assert.equal(childAdmission.epoch, before.epoch);
      assert.equal(childAdmission.childCapture?.originalAdmissionEpoch, before.epoch);
      assert.equal(childAdmission.childCapture?.parentSessionId, parent.id);
      assert.deepEqual(childAdmission.settings.roleRouting, before.settings.roleRouting);
      assert.equal(childAdmission.settings.roles["dsmm-coding"], true);
    }
    finally { await future.dispose(); }
    const off = await f.create();
    const offAdmission = runtime.admission(off as unknown as DshAgent);
    assert.equal(offAdmission.settings.roles["dsmm-coding"], false);
    assert.equal(offAdmission.settings.skills.debugging, false); assert.equal(offAdmission.settings.runtimeRecovery.enabled, false);
    assert.equal(categoryTargets(off).includes("dsmm-coding"), false);
    await assert.rejects(f.subagents.startActivation({ provider: "dsmm-role-coding", delivery: "caller", label: "Disabled role", request: { parent: off, prompt: [] }, signal: new AbortController().signal }), /cannot delegate/);
    assert.equal((await off.ctx.get("tools")!.execute({ agent: off, name: "dsmm_category", arguments: { category: "dsmm-coding", description: "Disabled", prompt: "Must not dispatch" }, callId: ToolCallId("disabled-role"), signal: new AbortController().signal })).isError, true);
    assert.equal((await f.ctx.get("skills")!.list({ scope: off })).some((row) => row.name === "debugging"), false);
    assert.equal((await f.ctx.get("skills")!.list({ scope: parent })).some((row) => row.name === "debugging"), true);
    release(); await parent.whenIdle(); f.adapter.beforeStream = undefined;
    const draft = await runtime.save({ id: "captured-overlay", expectedRevision: null, content: '{"version":1,"id":"captured-overlay","settings":{"workflow":{"reviewCap":2}}}' });
    const session = await runtime.getSession(admitted);
    await runtime.selectSession({ sessionId: parent.id, id: draft.id, expectedRevision: draft.revision, expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch }, admitted);
    assert.equal(runtime.getSettings(admitted).workflow.reviewCap, 2);
    assert.equal(runtime.getSettings(admitted).roles["dsmm-coding"], true);
    assert.equal(runtime.getSettings(admitted).skills.debugging, true);
    assert.equal(runtime.getSettings(admitted).runtimeRecovery.enabled, true);
    const restored = await deployment.readGlobal();
    await deployment.saveGlobal({ expectedRevision: restored.revision, edits: [
      { op: "set", path: ["roles", "dsmm-coding"], value: true },
      { op: "set", path: ["roles", "dsmm-cross-cutting"], value: true },
      { op: "set", path: ["skills", "debugging"], value: true },
      { op: "set", path: ["runtimeRecovery", "enabled"], value: true }
    ] }, () => {});
    const on = await f.create(); const onAdmission = runtime.admission(on as unknown as DshAgent);
    assert.ok(categoryTargets(on).includes("dsmm-coding"));
    assert.equal(onAdmission.settings.skills.debugging, true);
    assert.equal(onAdmission.settings.roles["dsmm-cross-cutting"], false);
    assert.ok(onAdmission.restartRequired?.includes("roles.dsmm-cross-cutting"));
    assert.equal(f.subagents.getProvider("dsmm-role-cross-cutting"), undefined);
    assert.equal(runtime.admission(off as unknown as DshAgent), offAdmission);
  } finally { release?.(); await f.dispose(); }
});

test("retained native reviewer keeps its own immutable admission after parent mode/profile changes and DSMM reinstall", async (t) => {
  const config = { defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable" as const } };
  let writes = 0;
  const f = await nativeRoutingFixture(config, { headless: true, persistence: true, fixtureTools: [
    { name: "write", description: "Counter-only captured write; never writes files", parameters: {},
      output: { schema: { type: "string" }, render: () => [] }, async execute() { writes++; return "CHANGED"; } }
  ] });
  let reinstall: ReturnType<typeof f.ctx.plugin> | undefined;
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const parent = await f.create();
    const started = await f.subagents.startActivation({ provider: "dsmm-role-reviewer", delivery: "parent", label: "Retained reviewer", request: { parent, prompt: [] }, signal: new AbortController().signal });
    let child = f.agents.get(started.childId)!;
    try {
      await child.whenIdle();
      const captured = runtime.admission(child as DshAgent);
      const policy = new DsmmRolePolicy(f.ctx as unknown as DshContext, runtime.getSettings, new DeepworkModeController(f.ctx as unknown as DshContext));
      const identity = policy.identity(child as DshAgent);
      assert.equal(identity.role, "dsmm-reviewer");
      assert.equal(classifyDsmmAgent(child), "dsmm");
      assert.ok((await f.ctx.skills.list({ scope: child })).some(skill => skill.name === "debugging"));
      assert.equal(identity.readOnly, true);
      assert.equal(captured.childCapture?.authorityCeiling.readOnly, true);
      assert.ok(Object.isFrozen(captured.childCapture!.authorityCeiling));
      const mode = await runtime.getSession(parent as DshAgent);
      await runtime.selectMode({ sessionId: parent.id, active: false, expectedModeRevision: mode.deepwork!.revision, expectedAdmissionEpoch: mode.admissionEpoch }, parent as DshAgent);
      const execute = (name: string, id: string) => child.ctx.tools.execute({ agent: child, name, arguments: {}, callId: ToolCallId(id), signal: new AbortController().signal });
      assert.equal((await execute("write", "retained-write-before")).isError, true);
      const overlay = await runtime.save({ id: "retained-parent-overlay", expectedRevision: null, content: '{"version":1,"id":"retained-parent-overlay","settings":{"workflow":{"reviewCap":2}}}' });
      const session = await runtime.getSession(parent as DshAgent);
      await runtime.selectSession({ sessionId: parent.id, id: overlay.id, expectedRevision: overlay.revision, expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch }, parent as DshAgent);
      assert.notEqual(runtime.admission(parent as DshAgent).epoch, captured.epoch);
      assert.equal(runtime.admission(child as DshAgent), captured);
      await assert.rejects(f.subagents.sendMessage(parent, child.id, [{ type: "text", text: "Inactive parent must not deliver" }], { signal: new AbortController().signal }), { code: "UNAUTHORIZED" });
      const activeParent = await runtime.getSession(parent as DshAgent);
      await runtime.selectMode({ sessionId: parent.id, active: true, expectedModeRevision: activeParent.deepwork!.revision,
        expectedAdmissionEpoch: activeParent.admissionEpoch }, parent as DshAgent);
      assert.equal(runtime.admission(child as DshAgent), captured);
      const original = child;
      await f.dsmmFiber.dispose();
      assert.ok(f.agents.get(original.id) === original);
      assert.equal(classifyDsmmAgent(original), "dsmm");
      const spawn = f.subagents.getProvider("spawn")!;
      const detachForeign = f.subagents.registerProvider({ name: "dsmm-role-reviewer", capabilities: spawn.capabilities,
        inheritsParentContext: false, prepareContinuable: request => { assert.ok(spawn.prepareContinuable); return spawn.prepareContinuable(request); } });
      try { assert.equal(classifyDsmmAgent(original), "dsmm"); }
      finally { detachForeign(); }
      reinstall = f.ctx.plugin({ name: "dsmm-retained-child-reinstall", inject: [...dsmmPlugin.inject], apply(ctx) { return dsmmPlugin.apply(ctx as unknown as DshContext, config); } });
      await reinstall.await();
      await f.ctx.get("dsmmRuntimeIntegration")!.ready();
      const replacement = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      assert.ok(replacement !== runtime);
      assert.ok(f.agents.get(original.id) === original);
      await f.subagents.sendMessage(parent, original.id, [{ type: "text", text: "Resume original reviewer capture" }], { signal: new AbortController().signal });
      child = f.agents.get(original.id)!;
      assert.ok(child === original); assert.equal(child.id, original.id);
      assert.equal(f.agents.isOwnedBy(child.id, parent), true);
      await child.whenIdle();
      const rebound = replacement.admission(child as DshAgent);
      assert.equal(classifyDsmmAgent(child), "dsmm");
      assert.equal(rebound.epoch, captured.epoch);
      assert.deepEqual(rebound.childCapture, captured.childCapture);
      assert.ok((await f.ctx.skills.list({ scope: child })).some(skill => skill.name === "debugging"));
      assert.equal((await execute("write", "retained-write-after")).isError, true);
      const read = await execute("read", "retained-read-after");
      assert.equal(read.isError, false); assert.equal(read.value, "read");
      assert.equal(writes, 0);
      const reboundPolicy = new DsmmRolePolicy(f.ctx as unknown as DshContext, replacement.getSettings, new DeepworkModeController(f.ctx as unknown as DshContext));
      const reboundIdentity = reboundPolicy.admit(child as DshAgent);
      assert.equal(reboundIdentity.parent, parent); assert.equal(reboundIdentity.epoch, identity.epoch);
      assert.equal(reboundIdentity.readOnly, true); assert.deepEqual(reboundIdentity.toolFilter, identity.toolFilter);
      assert.throws(() => reboundPolicy.admit({ id: child.id, session: child.session } as DshAgent), { code: "UNAUTHORIZED" });
      t.diagnostic(`same native child id=${child.id}; original epoch preserved; read=${JSON.stringify(read.value)}; write bodies=${writes}`);
    } finally { await f.subagents.drainChildren(parent, [child.id]); }
  } finally { await reinstall?.dispose(); await f.dispose(); }
});

test("replacement runtime preserves a retained coding child's captured Git denial after a parent-only guard overlay", async (t) => {
  const config = { defaultActive: true, guards: { gitWriteGuard: "deny" as const }, subagents: { enableRunInBackground: true, backgroundMode: "continuable" as const } };
  let bodies = 0;
  const f = await nativeRoutingFixture(config, { headless: true, persistence: true, fixtureTools: [
    { name: "pwsh", description: "Counter-only captured shell; never executes commands", parameters: { command: { type: "string", required: true } },
      output: { schema: { type: "string" }, render: () => [] }, async execute() { bodies++; return "COUNTER_ONLY"; } }
  ] });
  let reinstall: ReturnType<typeof f.ctx.plugin> | undefined;
  try {
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const parent = await f.create();
    const started = await f.subagents.startActivation({ provider: "dsmm-role-coding", delivery: "parent", label: "Retained coding", request: { parent, prompt: [] }, signal: new AbortController().signal });
    let child = f.agents.get(started.childId)!;
    try {
      await child.whenIdle();
      const captured = runtime.admission(child as DshAgent);
      assert.equal(captured.settings.guards.gitWriteGuard, "deny");
      const execute = (agent: typeof child, id: string) => agent.ctx.tools.execute({ agent, name: "pwsh", arguments: { command: "git push origin main" }, callId: ToolCallId(id), signal: new AbortController().signal });
      assert.equal((await execute(child, "retained-git-before")).isError, true);
      const overlay = await runtime.save({ id: "parent-guard-off", expectedRevision: null, content: '{"version":1,"id":"parent-guard-off","settings":{"guards":{"gitWriteGuard":"off"}}}' });
      const session = await runtime.getSession(parent as DshAgent);
      await runtime.selectSession({ sessionId: parent.id, id: overlay.id, expectedRevision: overlay.revision, expectedSelectionRevision: session.selection.selectionRevision, expectedAdmissionEpoch: session.admissionEpoch }, parent as DshAgent);
      const parentAdmission = runtime.admission(parent as DshAgent);
      assert.notEqual(parentAdmission.epoch, captured.epoch);
      assert.equal(parentAdmission.settings.guards.gitWriteGuard, "off");
      assert.equal(runtime.admission(child as DshAgent), captured);
      assert.equal((await execute(child, "retained-git-parent-overlay")).isError, true);
      assert.equal(bodies, 0);
      await f.dsmmFiber.dispose();
      const original = child;
      assert.ok(f.agents.get(original.id) === original);
      reinstall = f.ctx.plugin({ name: "dsmm-retained-coding-reinstall", inject: [...dsmmPlugin.inject], apply(ctx) { return dsmmPlugin.apply(ctx as unknown as DshContext, config); } });
      await reinstall.await();
      await f.ctx.get("dsmmRuntimeIntegration")!.ready();
      const replacement = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
      assert.ok(replacement !== runtime);
      assert.ok(f.agents.get(original.id) === original);
      await f.subagents.sendMessage(parent, original.id, [{ type: "text", text: "Resume original coding capture" }], { signal: new AbortController().signal });
      child = f.agents.get(original.id)!;
      assert.ok(child === original); assert.equal(child.id, original.id);
      await child.whenIdle();
      const after = await execute(child, "retained-git-after-reinstall");
      const rebound = replacement.admission(child as DshAgent);
      t.diagnostic(`replacement runtime: child guard=${rebound.settings.guards.gitWriteGuard}, child epoch preserved=${rebound.epoch === captured.epoch}, parent guard=${replacement.getSettings(parent as DshAgent).guards.gitWriteGuard}, shell error=${after.isError}, bodies=${bodies}`);
      assert.equal(bodies, 0, "the replacement runtime must not grant an old child its parent's newer Git policy");
      assert.equal(after.isError, true);
      assert.deepEqual(rebound.childCapture, captured.childCapture);
      assert.equal(rebound.epoch, captured.epoch);
      assert.equal(rebound.settings.guards.gitWriteGuard, "deny");
      assert.equal(replacement.admission(parent as DshAgent).epoch, parentAdmission.epoch);
      assert.equal(replacement.getSettings(parent as DshAgent).guards.gitWriteGuard, "off");
      assert.equal((await child.ctx.tools.execute({ agent: child, name: "read", arguments: {}, callId: ToolCallId("retained-coding-read"), signal: new AbortController().signal })).value, "read");
      assert.equal((await execute(parent, "admitted-root-counter-only")).isError, false);
      assert.equal(bodies, 1, "the same admitted counter-only definition remains callable by the authorized parent");
    } finally { await f.subagents.drainChildren(parent, [child.id]); }
  } finally { await reinstall?.dispose(); await f.dispose(); }
});
