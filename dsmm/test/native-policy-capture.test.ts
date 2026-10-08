import assert from "node:assert/strict";
import { test } from "node:test";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { DsmmDeploymentConfig } from "../lib/deployment-config.js";
import { DsmmDeploymentConfig as DeploymentConfig } from "../lib/deployment-config.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import { nativeRoutingFixture } from "./native-routing-fixture.ts";

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
    const future = await f.subagents.start("dsmm-role-coding", { parent, prompt: [{ type: "text", text: "Future child uses original admission" }], signal: new AbortController().signal });
    try { await future.result; assert.equal(runtime.admission(future.localAgent as unknown as DshAgent), before); }
    finally { await future.dispose(); }
    const off = await f.create();
    const offAdmission = runtime.admission(off as unknown as DshAgent);
    assert.equal(offAdmission.settings.roles["dsmm-coding"], false);
    assert.equal(offAdmission.settings.skills.debugging, false); assert.equal(offAdmission.settings.runtimeRecovery.enabled, false);
    assert.equal(off.ctx.get("tools")!.get("dsmm_coding", off), undefined);
    await assert.rejects(f.subagents.start("dsmm-role-coding", { parent: off, prompt: [], signal: new AbortController().signal }), /cannot delegate/);
    assert.equal((await off.ctx.get("tools")!.execute({ agent: off, name: "dsmm_coding", arguments: { description: "Disabled", prompt: "Must not dispatch" }, callId: ToolCallId("disabled-role"), signal: new AbortController().signal })).isError, true);
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
    assert.ok(on.ctx.get("tools")!.get("dsmm_coding", on));
    assert.equal(onAdmission.settings.skills.debugging, true);
    assert.equal(onAdmission.settings.roles["dsmm-cross-cutting"], false);
    assert.ok(onAdmission.restartRequired?.includes("roles.dsmm-cross-cutting"));
    assert.equal(f.subagents.getProvider("dsmm-role-cross-cutting"), undefined);
    assert.equal(runtime.admission(off as unknown as DshAgent), offAdmission);
  } finally { release?.(); await f.dispose(); }
});
