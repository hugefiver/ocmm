import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, symbols } from "@deepseek-ai/cordis";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { DsmmSubagentRuntime, accepted, deliveryFixture, gate } from "./delivery-runtime-fixture.ts";

function unauthorized(error: unknown): boolean { return error instanceof SubagentError && error.code === "UNAUTHORIZED"; }
function cancelled(error: unknown): boolean { return remoteErrorOf(error)?.code === "gateway/cancelled"; }

test("explicit runtime publishes subagents early but readiness requires real spawn registration and enabled policy", async () => {
  const f = await deliveryFixture({ spawn: false });
  const abort = new AbortController();
  try {
    assert.equal(f.ctx.get("subagents") instanceof DsmmSubagentRuntime, true);
    assert.equal(f.runtime.authority.view().deliveryFenceReady, false);
    const parent = await f.create();
    assert.throws(() => f.runtime.authority.prepareParentAdmission(parent, f.admissions.get(parent)!.epoch, { epoch: "not-ready", permitted: false }), unauthorized);
    let resolved = false;
    const barrier = f.runtime.waitForProvider("spawn", abort.signal).then((provider) => { resolved = true; return provider; });
    const ready = f.runtime.waitUntilReady(abort.signal);
    await Promise.resolve(); assert.equal(resolved, false);
    const spawn = f.ctx.plugin(Spawn, { providerName: "spawn" });
    await spawn.await();
    const provider = await barrier;
    assert.equal(provider, f.runtime.getProvider("spawn"));
    await ready;
    assert.equal(f.runtime.authority.view().deliveryFenceReady, true);
    await spawn.dispose();
    assert.equal(f.runtime.authority.view().deliveryFenceReady, false);
    const absent = f.runtime.waitForProvider("absent", abort.signal);
    const refusal = assert.rejects(absent);
    abort.abort(); await refusal;
  } finally { abort.abort(); await f.dispose(); }
});

test("stock conflict rejects without replacing or draining the existing native service", async () => {
  const ctx = new Context();
  try {
    await ctx.plugin(SubagentRuntime, {}).await();
    const stock = Reflect.get(ctx.subagents, symbols.original) ?? ctx.subagents;
    assert.throws(() => new DsmmSubagentRuntime(ctx, { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } }),
      (error: unknown) => error instanceof SubagentError && error.code === "DUPLICATE_PROVIDER");
    assert.equal(Reflect.get(ctx.subagents, symbols.original) ?? ctx.subagents, stock);
    assert.ok(stock instanceof SubagentRuntime);
  } finally { await ctx.fiber.dispose(); }
});

test("unbound policy is fail closed; explicitly native sendMessage and Gateway prompt retain their native path", async () => {
  const f = await deliveryFixture({ bind: false });
  const stream = gate();
  f.adapter.beforeStream = () => stream.promise;
  try {
    const native = await f.create(false);
    const started = await f.start(native);
    const child = f.ctx.agents.get(started.childId)!;
    await assert.rejects(f.runtime.sendMessage(native, child.id, [{ type: "text", text: "unbound refused" }], { signal: new AbortController().signal }), unauthorized);
    await assert.rejects(f.prompt(f.request(native, child.id, "unbound Gateway refused")), (error: unknown) => remoteErrorOf(error)?.code === "subagent/unauthorized");
    assert.equal(accepted(child).length, 1);
    f.bind(); f.runtime.authority.enablePolicy(f.owner);
    await f.runtime.sendMessage(native, child.id, [{ type: "text", text: "native direct message" }], { signal: new AbortController().signal });
    const receipt = await f.prompt(f.request(native, child.id, "native queue")) as { messageId: string };
    assert.ok(accepted(child).some((message) => message.id === receipt.messageId));
    assert.equal(accepted(child).length, 3);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("a trusted Host classifier preserves non-DSMM delivery before policy binding without treating unregistered DSMM as native", async () => {
  const f = await deliveryFixture({ bind: false, nativeClassification: true });
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  try {
    const native = await f.create(false), started = await f.start(native), child = f.ctx.agents.get(started.childId)!;
    const modelReceipt = await f.runtime.sendMessage(native, child.id, [{ type: "text", text: "native before policy" }], { signal: new AbortController().signal });
    const browserReceipt = await f.prompt(f.request(native, child.id, "native browser before policy")) as { messageId: string };
    assert.ok(accepted(child).some((message) => message.id === modelReceipt));
    assert.ok(accepted(child).some((message) => message.id === browserReceipt.messageId));
    const dsmm = await f.create(false); f.managed.add(dsmm);
    const count = accepted(child).length;
    await assert.rejects(f.runtime.sendMessage(dsmm, child.id, [{ type: "text", text: "unregistered DSMM" }], { signal: new AbortController().signal }), unauthorized);
    assert.equal(accepted(child).length, count);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("original model send_message and original Gateway prompt share current parent plus original target ceiling; accepted queue and old task survive epoch changes", async () => {
  const f = await deliveryFixture({ nativeControls: true });
  const stream = gate(), entered = gate();
  f.adapter.beforeStream = async () => { entered.release(); await stream.promise; };
  try {
    const parent = await f.create();
    const started = await f.start(parent);
    const child = f.ctx.agents.get(started.childId)!;
    await entered.promise;
    const original = f.evidence.get(child.id)!.original;
    const invoke = (text: string) => parent.ctx.get("tools")!.execute({ agent: parent, name: "send_message", callId: ToolCallId(text),
      arguments: { agent_id: child.id, message: text }, signal: new AbortController().signal });
    assert.equal((await invoke("native model accepted")).isError, false);
    const queued = await f.prompt(f.request(parent, child.id, "previously accepted queue")) as { messageId: string };
    const baseline = accepted(child).length;
    f.publish(parent, false);
    assert.equal(f.evidence.get(child.id)!.original, original);
    assert.notEqual(original.epoch, f.admissions.get(parent)!.epoch);
    assert.equal((await invoke("native model refused")).isError, true);
    await assert.rejects(f.prompt(f.request(parent, child.id, "native Gateway refused")),
      (error: unknown) => remoteErrorOf(error)?.code === "subagent/unauthorized");
    assert.equal(accepted(child).length, baseline);
    assert.ok(child.inbox.nextTurn.some((message) => message.id === queued.messageId));
    assert.equal(child.status, "running");
    assert.equal(f.adapter.calls[0].signal?.aborted, false);
    // A retained delegating child uses its OWN original admission, not the root's new epoch.
    const childTicket = f.runtime.authority.acquireParentTicket(child);
    assert.equal(childTicket.admission, original);
    const reply = await f.runtime.sendMessage(child, parent.id, [{ type: "text", text: "native child report" }], { signal: new AbortController().signal });
    assert.ok(accepted(parent).some((message) => message.id === reply));
    f.publish(parent, true);
    await f.runtime.sendMessage(parent, child.id, [{ type: "text", text: "new permitted epoch" }], { signal: new AbortController().signal });
    assert.equal(accepted(child).length, baseline + 1);
    f.evidence.set(child.id, { ...f.evidence.get(child.id)!, original: { epoch: original.epoch, permitted: false } });
    await assert.rejects(f.runtime.sendMessage(parent, child.id, [{ type: "text", text: "original ceiling denied" }], { signal: new AbortController().signal }), unauthorized);
    assert.equal(accepted(child).length, baseline + 1);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("synchronous prepared publication revokes pending tickets, rejects reentry and ABA, and failed preparation leaves old tickets valid", async () => {
  const f = await deliveryFixture();
  try {
    const parent = await f.create();
    const authority = f.runtime.authority, ticket = authority.acquireParentTicket(parent);
    assert.throws(() => authority.prepareParentAdmission(parent, "stale", { epoch: "unused", permitted: false }), unauthorized);
    authority.assertTicket(ticket);
    let installReentry = false, abortReentry = false;
    ticket.signal.addEventListener("abort", () => {
      assert.throws(() => authority.acquireParentTicket(parent), unauthorized); abortReentry = true;
    });
    const next = f.publish(parent, true, () => {
      assert.throws(() => authority.acquireParentTicket(parent), unauthorized); installReentry = true;
    });
    assert.equal(installReentry, true); assert.equal(abortReentry, true);
    assert.equal(ticket.signal.aborted, true);
    assert.equal(authority.acquireParentTicket(parent).admission, next);
    assert.throws(() => authority.prepareParentAdmission(parent, next.epoch, ticket.admission), unauthorized);
    assert.throws(() => authority.assertTicket({ ...authority.acquireParentTicket(parent), signal: new AbortController().signal }), unauthorized);
    assert.throws(() => authority.registerParent(parent, next, {}), unauthorized);
  } finally { await f.dispose(); }
});

test("binding setup on a disposed scope leaves authority available for a normal live owner", async () => {
  const f = await deliveryFixture({ bind: false });
  const closed = f.ctx.plugin({ name: "closed-policy", apply() {} });
  const live = f.ctx.plugin({ name: "live-policy", apply() {} });
  try {
    await Promise.all([closed.await(), live.await()]);
    await closed.dispose();
    const policy = { classifyParent: () => "dsmm" as const,
      async resolveChildEvidence() { throw new SubagentError("no admitted child", "UNAUTHORIZED"); },
      assertDelivery() {} };
    assert.throws(() => f.runtime.authority.bindPolicy(closed.ctx, {}, policy), (error: unknown) => (error as { code?: string }).code === "INACTIVE_EFFECT");
    assert.equal(f.runtime.authority.view().deliveryFenceReady, false);
    const owner = {};
    f.runtime.authority.bindPolicy(live.ctx, owner, policy);
    f.runtime.authority.enablePolicy(owner);
    assert.equal(f.runtime.authority.view().deliveryFenceReady, true);
  } finally { await live.dispose(); await closed.dispose(); await f.dispose(); }
});

test("public owner restart start revokes borrowed tickets while its fiber uid remains live", async () => {
  const f = await deliveryFixture();
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
    const queued = await f.prompt(f.request(parent, child.id, "accepted before owner restart")) as { messageId: string };
    const ticket = f.runtime.authority.acquireParentTicket(parent), uid = f.bindingFiber.uid;
    const restarted = f.bindingFiber.restart();
    assert.equal(f.bindingFiber.uid, uid);
    assert.notEqual(uid, null);
    assert.equal(ticket.signal.aborted, true);
    assert.equal(f.runtime.authority.view().deliveryFenceReady, false);
    assert.throws(() => f.runtime.authority.assertTicket(ticket));
    await restarted;
    assert.ok(child.inbox.nextTurn.some((message) => message.id === queued.messageId));
    assert.equal(f.adapter.calls[0].signal?.aborted, false);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("Host disposal start rejects even an already registered provider barrier", async () => {
  const f = await deliveryFixture({ bind: false });
  try {
    assert.ok(f.runtime.getProvider("spawn"));
    const disposed = f.runtimeFiber.dispose();
    await assert.rejects(f.runtime.waitForProvider("spawn"));
    await assert.rejects(f.runtime.waitUntilReady());
    await disposed;
  } finally { await f.dispose(); }
});

test("publication install failure revokes old and prepared authority without cancelling accepted work", async () => {
  const f = await deliveryFixture();
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
    const receipt = await f.prompt(f.request(parent, child.id, "accepted before failed publication")) as { messageId: string };
    const ticket = f.runtime.authority.acquireParentTicket(parent), next = { epoch: "failed-install", permitted: true };
    const count = accepted(child).length, failure = new Error("trusted installation failed");
    f.runtime.authority.prepareParentAdmission(parent, ticket.parentEpoch, next);
    assert.throws(() => f.runtime.authority.publishParentAdmission(parent, ticket.parentEpoch, next, () => { throw failure; }), (error: unknown) => error === failure);
    assert.equal(ticket.signal.aborted, true);
    assert.throws(() => f.runtime.authority.assertTicket(ticket));
    assert.throws(() => f.runtime.authority.acquireParentTicket(parent), unauthorized);
    assert.throws(() => f.runtime.authority.publishParentAdmission(parent, ticket.parentEpoch, next, () => {}), unauthorized);
    await assert.rejects(f.prompt(f.request(parent, child.id, "failed publication refuses new delivery")), (error: unknown) => remoteErrorOf(error)?.code === "subagent/unauthorized");
    assert.equal(accepted(child).length, count);
    assert.ok(child.inbox.nextTurn.some((message) => message.id === receipt.messageId));
    assert.equal(child.status, "running");
    assert.equal(f.adapter.calls[0].signal?.aborted, false);
    const reply = await f.runtime.sendMessage(child, parent.id, [{ type: "text", text: "native report survives failed publication" }], { signal: new AbortController().signal });
    assert.ok(accepted(parent).some((message) => message.id === reply));
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("Gateway and direct preparation cancellation admits zero new messages under Apply, owner, caller and exact Agent revocation", async (t) => {
  for (const surface of ["Gateway", "direct"] as const) for (const change of ["epoch", "owner", "caller", "parent"] as const) {
    await t.test(`${surface}: ${change}`, async () => {
      const f = await deliveryFixture();
      const stream = gate(), preparation = gate(), entered = gate();
      const caller = new AbortController();
      f.adapter.beforeStream = () => stream.promise;
      try {
        const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
        const count = accepted(child).length;
        f.setBeforeEvidence(async () => { entered.release(); await preparation.promise; });
        const pending = surface === "Gateway" ? f.prompt(f.request(parent, child.id, "pending cancelled"), caller.signal)
          : f.runtime.sendMessage(parent, child.id, [{ type: "text", text: "pending cancelled" }], { signal: caller.signal });
        const refused = surface === "Gateway" ? assert.rejects(pending, cancelled) : assert.rejects(pending);
        await entered.promise;
        if (change === "epoch") f.publish(parent);
        else if (change === "owner") await f.bindingFiber.dispose();
        else if (change === "caller") caller.abort();
        else f.runtime.authority.revokeParent(parent, "parent-lifetime");
        preparation.release(); await refused;
        assert.equal(accepted(child).length, count);
        assert.equal(child.status, "running");
        assert.equal(f.adapter.calls[0].signal?.aborted, false);
      } finally { preparation.release(); stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
    });
  }
});

test("original Gateway cancels prepared messages on real operator disposal and Connection replacement without mutating readonly operator", async (t) => {
  for (const change of ["operator", "connection"] as const) await t.test(change, async () => {
    const f = await deliveryFixture();
    const stream = gate(), entered = gate(), preparation = gate();
    f.adapter.beforeStream = () => stream.promise;
    try {
      const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
      const count = accepted(child).length;
      f.setBeforeEvidence(async () => { entered.release(); await preparation.promise; });
      const pending = f.prompt(f.request(parent, child.id, "old connection pending"));
      const refused = assert.rejects(pending, cancelled);
      await entered.promise;
      if (change === "operator") await f.connectionOwner().operator.dispose();
      else await f.replaceConnection();
      preparation.release(); await refused;
      assert.equal(accepted(child).length, count);
      assert.equal(f.adapter.calls[0].signal?.aborted, false);
    } finally { preparation.release(); stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
  });
});

test("an accepted receipt is not relabeled failed by a publication in the inbox event; no retry or child cancellation", async () => {
  const f = await deliveryFixture();
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
    let published = false;
    f.ctx.on("session/event", (session, event) => {
      if (session.id === child.id && event.type === "agent/inbox/spliced" && event.data.inserted.length > 0 && !published) {
        published = true; f.publish(parent, false);
      }
    });
    const count = accepted(child).length;
    const receipt = await f.prompt(f.request(parent, child.id, "acceptance wins")) as { messageId: string };
    assert.equal(published, true);
    assert.equal(accepted(child).length, count + 1);
    assert.ok(accepted(child).some((message) => message.id === receipt.messageId));
    assert.equal(f.adapter.calls[0].signal?.aborted, false);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("Gateway rejects a claimed Peer id or unscoped public prompt before evidence reads or inbox acceptance", async () => {
  const f = await deliveryFixture();
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  let reads = 0;
  try {
    const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
    f.setBeforeEvidence(async () => { reads++; });
    const request = f.request(parent, child.id, "impostor browser");
    const operator = f.ctx.connection.operator;
    const impostor = { id: operator.id, ctx: new Context(), async dispose() {} };
    await assert.rejects(f.ctx.typertGateway.invoke({ namespace: "subagents", method: "prompt", args: { request }, peer: impostor }),
      (error: unknown) => remoteErrorOf(error)?.code === "subagent/unauthorized");
    await assert.rejects(f.runtime.prompt(request, new AbortController().signal),
      (error: unknown) => remoteErrorOf(error)?.code === "subagent/unauthorized");
    assert.equal(reads, 0);
    assert.equal(accepted(child).length, 1);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("direct delegating child owns grandchild adjacency; cold new Agent keeps original admission while old exact tickets are revoked", async () => {
  const f = await deliveryFixture();
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), first = await f.start(parent), child = f.ctx.agents.get(first.childId)!;
    const grand = await f.start(child), grandchild = f.ctx.agents.get(grand.childId)!;
    const original = f.admissions.get(child)!;
    const oldTicket = f.runtime.authority.acquireParentTicket(child);
    await f.runtime.sendMessage(child, grandchild.id, [{ type: "text", text: "direct child authority" }], { signal: new AbortController().signal });
    const count = accepted(grandchild).length;
    await assert.rejects(f.runtime.sendMessage(parent, grandchild.id, [{ type: "text", text: "ancestor is not direct parent" }], { signal: new AbortController().signal }), unauthorized);
    assert.equal(accepted(grandchild).length, count);
    f.publish(parent, false);
    assert.equal(oldTicket.signal.aborted, false);
    await f.ctx.sessionPersistence.flush();
    stream.release(); f.adapter.beforeStream = undefined;
    await f.runtime.drainContinuableChildren(parent, [child.id]);
    assert.equal(oldTicket.signal.aborted, true);
    await assert.rejects(f.runtime.sendMessage(child, grandchild.id, [{ type: "text", text: "old Agent refused" }], { signal: new AbortController().signal }), unauthorized);
    f.publish(parent, true);
    const resumedReceipt = await f.prompt(f.request(parent, child.id, "cold same durable child")) as { messageId: string };
    const resumed = f.ctx.agents.get(child.id)!;
    assert.ok(resumed); assert.notEqual(resumed, child); assert.equal(resumed.id, child.id);
    assert.equal(f.runtime.authority.acquireParentTicket(resumed).admission, original);
    assert.ok(accepted(resumed).some((message) => message.id === resumedReceipt.messageId));
    // The grandchild keeps its durable ID and is cold-resumed by the addressed new direct parent.
    await f.runtime.sendMessage(resumed, grandchild.id, [{ type: "text", text: "cold grandchild direct parent" }], { signal: new AbortController().signal });
    assert.ok(f.ctx.agents.get(grandchild.id));
    await assert.rejects(f.runtime.sendMessage(parent, SessionId("foreign"), [{ type: "text", text: "unknown target" }], { signal: new AbortController().signal }), unauthorized);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});
