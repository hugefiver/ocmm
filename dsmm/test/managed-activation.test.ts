import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { nativeRoutingFixture, nativeFixturePlugin, runFixtureTurn } from "./native-routing-fixture.ts";
import { apply, inject } from "../lib/index.js";
import type { Context } from "@deepseek-ai/cordis";
import type { DshContext } from "../lib/dsh-types.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DshAgent } from "../lib/dsh-types.js";
import { gate } from "./delivery-runtime-fixture.ts";
import { parseChildAdmissionCapture } from "../lib/child-capture.js";
import { ProfileStore } from "../lib/profile-store.js";

test("policy replacement re-admits exact living parent and child without reviving a disposed residency", { timeout: 15000 }, async () => {
  const config = { defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable" as const, maxDepth: 3 } };
  const f = await nativeRoutingFixture(config, { persistence: true });
  try {
    const parent = await f.create(), child = await f.createAuxiliary("dsmm-reviewer", undefined, "continuable", parent);
    await runFixtureTurn(child);
    const authority = f.ctx.get("dsmmRuntimeIntegration")!.runtime.authority;
    const ticket = authority.acquireParentTicket(child);
    await f.dsmmFiber.dispose();
    assert.equal(ticket.signal.aborted, true);
    assert.equal(f.agents.get(child.id), child);
    const replacement = f.ctx.plugin({ name: "current-policy-replacement", inject: [...inject], apply(ctx: Context) { return apply(ctx as unknown as DshContext, config); } });
    await replacement.await(); await f.ctx.get("dsmmRuntimeIntegration")!.ready();
    assert.equal(authority.acquireParentTicket(parent).signal.aborted, false);
    assert.equal(authority.acquireParentTicket(child).signal.aborted, false);
    await f.subagents.sendMessage(parent, child.id, [{ type: "text", text: "Useful retained continuation" }], { signal: new AbortController().signal });
    await child.whenIdle();
    assert.equal(f.agents.get(child.id), child);
    const admission = authority.acquireParentTicket(child);
    await f.releaseAuxiliary(child);
    assert.throws(() => authority.registerParent(child, admission.admission, admission.owner));
  } finally { await f.dispose(); }
});

for (const previous of [false, true]) for (const provider of ["spawn", "fork"] as const) test(`Core with Deepwork off preserves ordinary native ${provider} execution after managed=${previous}`, { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: previous }, { persistence: true });
  try {
    if (provider === "fork") await f.ctx.plugin(await nativeFixturePlugin("@deepseek-ai/dsh-subagent-fork-in-process"), {}).await();
    const parent = await f.create();
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    assert.ok(runtime.admission(parent as unknown as DshAgent));
    if (previous) {
      const managed = await f.subagents.startActivation({ provider: "dsmm-role-coding", delivery: "caller", label: "Previous managed task",
        request: { parent, prompt: [] }, signal: new AbortController().signal });
      assert.equal((await managed.result).stopReason, "completed");
      const session = await runtime.getSession(parent as unknown as DshAgent);
      await runtime.selectMode({ sessionId: parent.id, active: false, expectedModeRevision: session.deepwork!.revision,
        expectedAdmissionEpoch: session.admissionEpoch }, parent as unknown as DshAgent);
      await assert.rejects(f.subagents.sendMessage(parent, managed.childId, [{ type: "text", text: "Do not revive a managed one-shot" }], { signal: new AbortController().signal }));
    }
    const activation = await f.subagents.startActivation({ provider, delivery: "parent", label: "Ordinary native task",
      request: { parent, prompt: [{ type: "text", text: "Return useful native output" }] }, signal: new AbortController().signal });
    const child = f.agents.get(activation.childId)!; assert.ok(child); await child.whenIdle();
    assert.ok(child.session.snapshotEvents().some(event => event.type === "turn/end" && event.data.reason.kind === "completed"));
    assert.match(JSON.stringify(child.session.deriveMessages()), /fixture complete/);
    assert.ok(runtime.childCaptureStore.readChildAdmission);
    assert.equal(await runtime.childCaptureStore.readChildAdmission(child.id, parent.id), null);
    await activation.dispose();
    await f.ctx.sessionPersistence.flush();
    await f.subagents.sendMessage(parent, child.id, [{ type: "text", text: "Useful native cold continuation" }], { signal: new AbortController().signal });
    const resumed = f.agents.get(child.id)!; assert.ok(resumed); assert.notEqual(resumed, child);
    await resumed.whenIdle();
    assert.match(JSON.stringify(resumed.session.deriveMessages()), /Useful native cold continuation/);
    assert.equal(await runtime.childCaptureStore.readChildAdmission(child.id, parent.id), null);
  } finally { await f.dispose(); }
});

test("managed caller activation executes after native acceptance and releases residency", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const parent = await f.create();
    const activation = await f.subagents.startActivation({ provider: "dsmm-role-coding", label: "bounded task", delivery: "caller",
      request: { parent, prompt: [{ type: "text", text: "Return useful output" }] }, signal: new AbortController().signal });
    const result = await activation.result;
    assert.equal(result.stopReason, "completed"); assert.match(JSON.stringify(result.output), /fixture complete/);
    await activation.dispose(); assert.deepEqual(f.agents.list(), [parent]);
  } finally { await f.dispose(); }
});

test("explicit foreground persists V3 one-shot and refuses live and cold continuation", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 } }, { persistence: true });
  const entered = gate(), release = gate(); let child: Agent | undefined;
  try {
    const parent = await f.create();
    f.ctx.on("agent/created", ({ agent }) => { if (f.agents.isOwnedBy(agent.id, parent)) child = agent; }, { global: true });
    f.adapter.beforeStream = async () => { entered.release(); await release.promise; };
    const pending = parent.ctx.tools.execute({ agent: parent, name: "dsmm_category", callId: ToolCallId("explicit-foreground"),
      arguments: { category: "dsmm-coding", description: "foreground", prompt: "Useful result", run_in_background: false }, signal: new AbortController().signal });
    await entered.promise; assert.ok(child);
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime, capture = runtime.admission(child as unknown as DshAgent).childCapture;
    assert.equal(capture?.version, 3); assert.equal(capture?.version === 3 && capture.delegationMode, "one-shot");
    assert.ok(capture && "deepseekV4ProCalibration" in capture.runtimePolicyCapture && "deepseekFlashDefaultReasoningEffort" in capture.runtimePolicyCapture);
    const id = child.id;
    await assert.rejects(f.subagents.sendMessage(parent, id, [{ type: "text", text: "No continuation" }], { signal: new AbortController().signal }), { code: "UNAUTHORIZED" });
    release.release(); assert.equal((await pending).isError, false); await f.ctx.sessionPersistence.flush(); assert.equal(f.agents.get(id), undefined);
    await assert.rejects(f.subagents.sendMessage(parent, id, [{ type: "text", text: "No cold continuation" }], { signal: new AbortController().signal }), { code: "UNAUTHORIZED" });
    assert.ok(runtime.childCaptureStore instanceof ProfileStore);
    const missing = mock.method(runtime.childCaptureStore, "readChildAdmission", async () => null);
    try { await assert.rejects(f.subagents.sendMessage(parent, id, [{ type: "text", text: "Missing capture" }], { signal: new AbortController().signal })); assert.equal(f.agents.get(id), undefined); }
    finally { missing.mock.restore(); }
    await assert.rejects(f.agents.resume({ resumeSessionId: id, parentAgent: parent })); assert.equal(f.agents.get(id), undefined);
  } finally { release.release(); await f.dispose(); }
});

test("durable capture failure rejects before inbox or stream", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const parent = await f.create(), runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    assert.ok(runtime.childCaptureStore instanceof ProfileStore);
    const capture = mock.method(runtime.childCaptureStore, "createChildAdmission", async () => { throw new Error("capture storage unavailable"); });
    let inserted = false;
    f.ctx.on("agent/inbox/inserted", ({ agent, message }) => { if (agent !== parent && JSON.stringify(message).includes("unaccepted task")) inserted = true; }, { global: true });
    try {
      await assert.rejects(f.subagents.startActivation({ provider: "dsmm-role-coding", label: "capture failure", delivery: "caller",
        request: { parent, prompt: [{ type: "text", text: "unaccepted task" }] }, signal: new AbortController().signal }));
      assert.equal(inserted, false); assert.equal(f.adapter.calls.length, 0); assert.deepEqual(f.agents.list(), [parent]);
    } finally { capture.mock.restore(); }
  } finally { await f.dispose(); }
});

test("managed roles refuse external-only and history-seeding spawn providers", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const parent = await f.create(), capabilities = f.subagents.getProvider("spawn")!.capabilities;
    await f.spawnFiber!.dispose(); let starts = 0;
    const external = f.subagents.registerProvider({ name: "spawn", capabilities, inheritsParentContext: false, async start() { starts++; throw new Error("external start must not run"); } });
    const start = () => f.subagents.startActivation({ provider: "dsmm-role-coding", label: "unsupported", delivery: "caller", request: { parent, prompt: [] }, signal: new AbortController().signal });
    try { await assert.rejects(start(), { code: "UNSUPPORTED_CAPABILITY" }); assert.equal(starts, 0); } finally { external(); }
    const seeded = f.subagents.registerProvider({ name: "spawn", capabilities, inheritsParentContext: false, async prepareContinuable() { return { seed: [] }; } });
    try { await assert.rejects(start(), { code: "UNSUPPORTED_CAPABILITY" }); } finally { seeded(); }
    assert.equal(f.adapter.calls.length, 0); assert.deepEqual(f.agents.list(), [parent]);
  } finally { await f.dispose(); }
});

test("continuable capture cold-resumes original identity with new residency", { timeout: 15000 }, async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 } }, { persistence: true });
  const hold = gate(); f.adapter.beforeStream = () => hold.promise;
  try {
    const parent = await f.create(), activation = await f.subagents.startActivation({ provider: "dsmm-role-coding", label: "continuable", delivery: "parent",
      request: { parent, prompt: [{ type: "text", text: "first" }] }, signal: new AbortController().signal });
    const child = f.agents.get(activation.childId)!, runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime;
    const capture = runtime.admission(child as unknown as DshAgent).childCapture;
    assert.equal(capture?.version === 3 && capture.delegationMode, "continuable");
    hold.release(); await activation.dispose(); await f.ctx.sessionPersistence.flush();
    await f.subagents.sendMessage(parent, activation.childId, [{ type: "text", text: "second" }], { signal: new AbortController().signal });
    const resumed = f.agents.get(activation.childId)!; assert.ok(resumed); assert.notEqual(resumed, child);
    assert.deepEqual(runtime.admission(resumed as unknown as DshAgent).childCapture, capture);
  } finally { hold.release(); await f.dispose(); }
});

test("current capture parser requires immutable delegation mode and exact policy fields", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true }), hold = gate(); f.adapter.beforeStream = () => hold.promise;
  try {
    const parent = await f.create(), activation = await f.subagents.startActivation({ provider: "dsmm-role-coding", label: "schema", delivery: "caller",
      request: { parent, prompt: [] }, signal: new AbortController().signal });
    const runtime = f.ctx.get("dsmmProfileRuntime") as DsmmProfileRuntime, capture = runtime.admission(f.agents.get(activation.childId)! as unknown as DshAgent).childCapture!;
    assert.equal(capture.version, 3);
    const { delegationMode: _mode, ...missing } = capture as Extract<typeof capture, { version: 3 }>;
    assert.throws(() => parseChildAdmissionCapture(missing));
    assert.throws(() => parseChildAdmissionCapture({ ...capture, delegationMode: "external" }));
    assert.throws(() => parseChildAdmissionCapture({ ...capture, unknownField: {} }));
    assert.throws(() => parseChildAdmissionCapture({ ...capture, profilePin: { id: "profile", revision: "new-format:revision" } }));
    for (const field of ["deepseekV4ProCalibration", "deepseekV4ProDefaultReasoningEffort", "deepseekFlashCalibration", "deepseekFlashDefaultReasoningEffort"] as const) {
      const policy = { ...capture.runtimePolicyCapture }; delete (policy as Partial<typeof policy>)[field];
      assert.throws(() => parseChildAdmissionCapture({ ...capture, runtimePolicyCapture: policy }));
    }
    hold.release(); await activation.dispose();
  } finally { hold.release(); await f.dispose(); }
});
