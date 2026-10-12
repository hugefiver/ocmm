import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { childFixture, gate, accepted } from "./child-admission-native-fixture.mjs";
import { NativeChildEvidenceReader, legacyEvidenceFromNativeFacts } from "../src/native-child-evidence.ts";
import { installLegacyChildToolPolicy, LegacyChildToolPolicy } from "../src/legacy-child-policy.ts";
import { projectChildAdmissionEvidence } from "../src/child-admission.ts";
import { snapshotSubagentDescriptor } from "@deepseek-ai/dsh-subagent";

const [phase, root] = process.argv.slice(2);
const f = await childFixture(root);
const denied = error => error?.code === "UNAUTHORIZED" || error?.code === "not-owned";
const message = text => [{ type: "text", text }];
const signal = () => new AbortController().signal;
let fixtureDisposed = false;
try {
  const parent = await f.create();
  const start = await f.start(parent);
  let child = f.ctx.agents.get(start.childId);
  await child.whenIdle();
  if (phase === "identity") {
    const ticket = f.bridge.authority.acquireParentTicket(parent);
    const evidence = await f.bridge.authority.resolveChildEvidence(ticket, child.id, signal());
    assert.equal(evidence.role, "dsmm-reviewer");
    assert.throws(() => f.bridge.authority.acquireParentTicket({ ...parent }), denied);
    await assert.rejects(f.bridge.authority.resolveChildEvidence({ ...ticket }, child.id, signal()), denied);
    const foreign = await f.create();
    await assert.rejects(f.native.sendMessage(foreign, child.id, message("foreign direct parent"), { signal: signal() }), denied);
    child.session.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "continuable", provider: "dsmm-role-coding", label: "not the establishing descriptor",
      agentProvider: "fixture", agentModel: "coding-original" }));
    await assert.rejects(f.bridge.authority.resolveChildEvidence(ticket, child.id, signal()), denied);
  } else if (phase === "observed-revocation") {
    const entered = gate(), held = gate();
    let observedSignal;
    f.ctx.sessionQuery.beforeObserve = async (id, options) => {
      if (id !== child.id) return;
      observedSignal = options.signal; entered.release(); await held.promise;
    };
    const baseline = accepted(child).length;
    const pending = f.native.sendMessage(parent, child.id, message("not yet accepted"), { signal: signal() });
    const refused = assert.rejects(pending);
    await entered.promise;
    await f.applyOff(parent);
    assert.equal(observedSignal.aborted, true);
    held.release(); await refused;
    assert.equal(accepted(child).length, baseline);
    f.ctx.sessionQuery.beforeObserve = undefined;
    await f.execute(parent, "send_message", { agent_id: child.id, message: "permitted model same-ID" });
    await child.whenIdle();
    await f.prompt(parent, child.id, "permitted original Gateway"); await child.whenIdle();
    assert.equal(accepted(child).length, baseline + 2);
    const original = f.runtime.admission(child);
    await f.applySettings(parent, "no-reviewer", { roles: { "dsmm-reviewer": false } });
    assert.equal(f.runtime.admission(child), original);
    const view = projectChildAdmissionEvidence(original.childCapture, f.runtime.admission(parent).epoch, ["roles"]);
    assert.ok(view.limitations.some(item => item.field === "roles" && item.code === "parent-denied" && item.effect === "capability-denied"));
    const beforeDenied = accepted(child).length;
    assert.equal((await f.execute(parent, "send_message", { agent_id: child.id, message: "denied model message" })).isError, true);
    await assert.rejects(f.prompt(parent, child.id, "denied Gateway message"));
    assert.equal(accepted(child).length, beforeDenied);
    const reply = await f.native.sendMessage(child, parent.id, message("native child report"), { signal: signal() });
    assert.ok(accepted(parent).some(entry => entry.id === reply));
    await parent.whenIdle();
  } else if (phase === "owner-teardown") {
    const otherParent = await f.create();
    const roots = [parent, otherParent];
    const tickets = roots.map(agent => f.bridge.authority.acquireParentTicket(agent));
    const streamEntered = gate(), streamHeld = gate(), drainEntered = gate();
    let runningSignal;
    f.adapter.beforeStream = async options => {
      if (options.model !== "reviewer-original") return;
      runningSignal = options.signal;
      streamEntered.release(); await streamHeld.promise;
    };
    await f.native.sendMessage(parent, child.id, message("hold the actual native child turn during drain"), { signal: signal() });
    child = f.ctx.agents.get(child.id);
    await streamEntered.promise;
    assert.ok(runningSignal);
    runningSignal.addEventListener("abort", () => drainEntered.release(), { once: true });
    const query = f.ctx.sessionQuery;
    const observationEntered = gate(), observationHeld = gate();
    const caller = new AbortController();
    let observedSignal;
    query.beforeObserve = async (id, options) => {
      if (id !== child.id) return;
      observedSignal = options.signal;
      observationEntered.release(); await observationHeld.promise;
    };
    const baseline = accepted(child).length;
    const pending = f.native.sendMessage(parent, child.id, message("pending while the controlled owner tears down"), { signal: caller.signal });
    const refused = assert.rejects(pending);
    let teardown, teardownSettled = false;
    try {
      await observationEntered.promise;
      teardown = f.dispose();
      teardown.then(() => { teardownSettled = true; }, () => { teardownSettled = true; });
      assert.ok(tickets.every(ticket => ticket.signal.aborted), "All exact owned root tickets must be revoked synchronously before the first native drain await");
      assert.ok(roots.every(agent => f.ctx.agents.get(agent.id) === agent));
      assert.equal(observedSignal.aborted, true);
      await drainEntered.promise;
      assert.equal(teardownSettled, false, "The actual native drain remains waiting on the held child stream");
      observationHeld.release(); await refused;
      assert.equal(caller.signal.aborted, false, "Owner revocation, not caller cancellation, refuses the pending delivery");
      assert.equal(accepted(child).length, baseline);
      assert.equal(teardownSettled, false);
    } finally {
      caller.abort(); observationHeld.release(); streamHeld.release();
      query.beforeObserve = undefined; f.adapter.beforeStream = undefined;
      try { await refused; }
      finally { if (teardown !== undefined) { await teardown; fixtureDisposed = true; } }
    }
  } else if (phase === "cold-materialization") {
    const old = child;
    const oldTicket = f.bridge.authority.acquireParentTicket(child);
    f.bridge.authority.revokeParent(child, "owned-drain");
    await f.native.drainContinuableChildren(parent, [old.id]);
    assert.equal(f.ctx.agents.get(old.id), undefined); assert.equal(oldTicket.signal.aborted, true);
    const entered = gate(), held = gate();
    const detach = f.ctx.on("agent/created", async ({ agent }) => {
      if (agent.id === old.id) { entered.release(); await held.promise; }
    }, { global: true });
    const pending = f.native.sendMessage(parent, old.id, message("cancel at native materialization"), { signal: signal() });
    const refused = assert.rejects(pending);
    await entered.promise;
    await f.applyOff(parent);
    held.release(); await refused; detach();
    assert.equal(f.ctx.agents.get(old.id), undefined);
    await f.native.sendMessage(parent, old.id, message("fresh invocation can resume"), { signal: signal() });
    child = f.ctx.agents.get(old.id); await child.whenIdle();
    assert.notEqual(child, old); assert.equal(f.runtime.admission(child).settings.guards.gitWriteGuard, "deny");
    assert.throws(() => f.bridge.authority.acquireParentTicket(old), denied);
  } else if (phase === "delegating-child") {
    const builderStart = await f.start(parent, "builder", null);
    const builder = f.ctx.agents.get(builderStart.childId); await builder.whenIdle();
    const original = f.runtime.admission(builder);
    const builderTicket = f.bridge.authority.acquireParentTicket(builder);
    const grandStart = await f.start(builder, "code-search");
    const grandchild = f.ctx.agents.get(grandStart.childId); await grandchild.whenIdle();
    assert.equal(grandchild.session.header.parentSession, builder.id);
    assert.equal(grandchild.session.header.delegationDepth, 2);
    await f.applyOff(parent);
    assert.notEqual(f.runtime.admission(parent).epoch, original.epoch);
    assert.equal(builderTicket.signal.aborted, false);
    await f.native.sendMessage(builder, grandchild.id, message("legitimate direct parent"), { signal: signal() });
    await grandchild.whenIdle();
    const count = accepted(grandchild).length;
    await assert.rejects(f.native.sendMessage(parent, grandchild.id, message("root cannot borrow adjacency"), { signal: signal() }), denied);
    assert.equal(accepted(grandchild).length, count);
    f.bridge.authority.revokeParent(builder, "owned-drain");
    await f.native.drainContinuableChildren(parent, [builder.id, child.id]);
    assert.equal(builderTicket.signal.aborted, true);
    const entered = gate(), held = gate();
    f.adapter.beforeStream = async options => { if (options.model === "builder-original") { entered.release(); await held.promise; } };
    try {
      await f.native.sendMessage(parent, builder.id, message("cold delegating child"), { signal: signal() });
      const resumed = f.ctx.agents.get(builder.id); await entered.promise;
      assert.notEqual(resumed, builder); assert.equal(f.runtime.admission(resumed).epoch, original.epoch);
      const current = f.bridge.authority.acquireParentTicket(resumed);
      assert.equal(current.admission.epoch, original.epoch);
      assert.throws(() => f.bridge.authority.acquireParentTicket(builder), denied);
      await f.native.sendMessage(resumed, grandchild.id, message("same grandchild after parent materialization"), { signal: signal() });
      const restoredGrandchild = f.ctx.agents.get(grandchild.id); await restoredGrandchild.whenIdle();
      assert.equal(restoredGrandchild.id, grandchild.id);
      assert.equal(restoredGrandchild.session.header.parentSession, resumed.id);
      assert.equal(restoredGrandchild.session.header.delegationDepth, 2);
    } finally { held.release(); f.adapter.beforeStream = undefined; }
  } else if (phase === "capture-integrity") {
    const entered = gate(), held = gate();
    f.adapter.beforeStream = async () => { entered.release(); await held.promise; };
    await f.native.sendMessage(parent, child.id, message("hold original residency during storage failures"), { signal: signal() });
    child = f.ctx.agents.get(child.id); await entered.promise;
    try {
    const path = join(f.runtime.childCaptureStore.stateDir, ".children", "v1", `${createHash("sha256").update(child.id).digest("hex")}.json`);
    const bytes = await readFile(path);
    assert.equal(f.ctx.agents.get(child.id), child);
    assert.ok(f.runtime.admission(child).childCapture);
    const ticket = f.bridge.authority.acquireParentTicket(parent);
    for (const corrupt of ["{", JSON.stringify({ ...JSON.parse(bytes), version: 2 }), JSON.stringify({ capture: JSON.parse(bytes).capture, revision: JSON.parse(bytes).revision })]) {
      await writeFile(path, corrupt);
      await assert.rejects(f.bridge.authority.resolveChildEvidence(ticket, child.id, signal()), error => error?.code === "corrupt-selection");
    }
    await writeFile(path, bytes);
    await unlink(path);
    await assert.rejects(f.bridge.authority.resolveChildEvidence(ticket, child.id, signal()), error => error?.code === "corrupt-selection");
    await writeFile(path, bytes);
    assert.equal((await f.bridge.authority.resolveChildEvidence(ticket, child.id, signal())).childSessionId, child.id);
    } finally { held.release(); f.adapter.beforeStream = undefined; }
  } else if (phase === "legacy-parameters") {
    const nativeTicket = f.native.authority.acquireParentTicket(parent);
    const reader = new NativeChildEvidenceReader(f.ctx, ticket => f.native.authority.assertTicket(ticket), f.ctx.sessionQuery);
    const evidence = legacyEvidenceFromNativeFacts(await reader.read(nativeTicket, child.id, signal()));
    const readDefinition = child.ctx.tools.get("read", child);
    const collaborators = {
      classifyTool(name) {
        if (name !== "read") return undefined;
        return { kind: "read", definition: readDefinition, assertArguments(args) { if (Object.keys(args).length) throw new Error("Unproven read parameter"); } };
      },
      assertParentTool(exactParent, name, args, definition) { assert.equal(exactParent, parent); assert.equal(parent.ctx.tools.get(name, parent), definition); },
    };
    const toolPolicy = new LegacyChildToolPolicy(evidence, parent, child, collaborators);
    const detach = installLegacyChildToolPolicy(evidence, parent, child, collaborators);
    assert.equal((await f.execute(child, "read")).isError, false);
    const bodies = f.bodies.read;
    assert.deepEqual(toolPolicy.denial("read", { command: "unknown" }, child.ctx.tools), { field: "tool-filter", code: "missing-evidence" });
    assert.equal((await f.execute(child, "read", { command: "not part of the audited read contract" })).isError, true);
    assert.equal(f.bodies.read, bodies);
    const releaseParentRestriction = parent.ctx.tools.restrict({ deny: ["read"] });
    assert.deepEqual(toolPolicy.denial("read", {}, child.ctx.tools), { field: "tool-filter", code: "parent-denied" });
    assert.equal((await f.execute(child, "read")).isError, true); assert.equal(f.bodies.read, bodies);
    releaseParentRestriction();
    const remove = child.ctx.tools.register({ ...readDefinition, async execute() { f.bodies.read++; return "replacement body"; } });
    assert.equal((await f.execute(child, "read")).isError, true); assert.equal(f.bodies.read, bodies);
    remove(); detach();
  } else throw new Error("Unknown native guard phase");
} finally { if (!fixtureDisposed) await f.dispose(); }
console.log(JSON.stringify({ phase, shutdown: true }));
