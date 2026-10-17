import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import type { ParentAdmissionTicket } from "../src/delivery-authority.ts";
import type { FixtureAdmission } from "./delivery-runtime-fixture.ts";
import { accepted, deliveryFixture, gate, nativePng } from "./delivery-runtime-fixture.ts";

test("original Gateway preserves validated native image queue/steer and attachment refusal", async () => {
  const f = await deliveryFixture({ images: true });
  const png = await nativePng();
  const stream = gate(); f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
    for (const delivery of ["queue", "steer"] as const) {
      const request = { ...f.request(parent, child.id, `image ${delivery}`, delivery), content: [{ type: "image" as const, mediaType: "image/png" as const, data: png }] };
      const receipt = await f.prompt(request) as { messageId: string };
      const message = accepted(child).find((message) => message.id === receipt.messageId)!;
      assert.ok(message);
      assert.equal(message.content[0].type, "image");
      assert.ok((delivery === "queue" ? child.inbox.nextTurn : child.inbox.nextStep).some((message) => message.id === receipt.messageId));
    }
    const count = accepted(child).length;
    await assert.rejects(f.prompt({ ...f.request(parent, child.id, "invalid uploaded image"),
      content: [{ type: "image", mediaType: "image/png", data: "not canonical image bytes" }] }),
      (error: unknown) => String(remoteErrorOf(error)?.code) === "subagent/attachment-invalid");
    assert.equal(accepted(child).length, count);
  } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("native image capability await after DSMM policy preparation is fenced at the native inbox cutoff", async (t) => {
  for (const surface of ["Gateway", "direct"] as const) for (const change of ["epoch", "owner", "connection"] as const) {
    if (surface === "direct" && change === "connection") continue;
    await t.test(`${surface}: ${change}`, async () => {
      const f = await deliveryFixture({ images: true });
      const png = await nativePng();
      const stream = gate(), entered = gate(), imageCheck = gate();
      f.adapter.beforeStream = () => stream.promise;
      const llm = f.ctx.llm, resolveModelInfo = llm.resolveModelInfo.bind(llm);
      try {
        const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
        const count = accepted(child).length;
        const admitted = await f.ctx.attachments.admitPromptContent([{ type: "image", mediaType: "image/png", data: png }]);
        // Pause the public LLM capability observation, not a private continuation/inbox hook.
        llm.resolveModelInfo = async (provider, model, signal) => {
          entered.release(); await imageCheck.promise;
          return resolveModelInfo(provider, model, signal);
        };
        const request = { ...f.request(parent, child.id, "pending image", "steer"), content: [{ type: "image" as const, mediaType: "image/png" as const, data: png }] };
        const pending = surface === "Gateway" ? f.prompt(request)
          : f.runtime.sendMessage(parent, child.id, admitted as ContentBlock[], { signal: new AbortController().signal });
        const refusal = surface === "Gateway"
          ? assert.rejects(pending, (error: unknown) => remoteErrorOf(error)?.code === "gateway/cancelled") : assert.rejects(pending);
        await entered.promise;
        if (change === "epoch") f.publish(parent, false);
        else if (change === "owner") await f.bindingFiber.dispose();
        else await f.replaceConnection();
        imageCheck.release(); await refusal;
        assert.equal(accepted(child).length, count);
        assert.equal(child.status, "running");
        assert.equal(f.adapter.calls[0].signal?.aborted, false);
      } finally {
        llm.resolveModelInfo = resolveModelInfo;
        imageCheck.release(); stream.release(); f.adapter.beforeStream = undefined; await f.dispose();
      }
    });
  }
});

test("Gateway and direct cold materialization retain the current parent ticket through awaited native Agent creation", async (t) => {
  for (const surface of ["Gateway", "direct"] as const) for (const change of ["epoch", "connection"] as const) {
    if (surface === "direct" && change === "connection") continue;
    await t.test(`${surface}: ${change}`, async () => {
      const f = await deliveryFixture();
      const stream = gate(), entered = gate(), creation = gate();
      f.adapter.beforeStream = () => stream.promise;
      let materialized: import("@deepseek-ai/dsh-agent").Agent | undefined;
      try {
        const parent = await f.create(), started = await f.start(parent), original = f.ctx.agents.get(started.childId)!;
        const count = accepted(original).length;
        stream.release(); f.adapter.beforeStream = undefined;
        await f.runtime.drainChildren(parent, [original.id]);
        await f.ctx.sessionPersistence.flush();
        assert.equal(f.ctx.agents.get(original.id), undefined);
        f.ctx.on("agent/created", async ({ agent, source }) => {
          if (agent.id !== original.id || source !== "resume") return;
          materialized = agent; entered.release(); await creation.promise;
        }, { global: true });
        const pending = surface === "Gateway" ? f.prompt(f.request(parent, original.id, "cold pending"))
          : f.runtime.sendMessage(parent, original.id, [{ type: "text", text: "cold pending" }], { signal: new AbortController().signal });
        const refusal = surface === "Gateway"
          ? assert.rejects(pending, (error: unknown) => remoteErrorOf(error)?.code === "gateway/cancelled") : assert.rejects(pending);
        await entered.promise;
        assert.notEqual(materialized, original);
        if (change === "epoch") f.publish(parent, false);
        else await f.replaceConnection();
        creation.release(); await refusal;
        assert.ok(materialized);
        assert.equal(accepted(materialized).length, count);
        assert.equal(f.ctx.agents.get(original.id), undefined);
        assert.throws(() => f.runtime.authority.acquireParentTicket(materialized!));
      } finally { creation.release(); stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
    });
  }
});

test("actual delegating Agent residency teardown revokes its pending direct-parent delivery without borrowing ancestor tickets", async () => {
  const f = await deliveryFixture();
  const stream = gate(), entered = gate(), evidence = gate();
  f.adapter.beforeStream = () => stream.promise;
  try {
    const root = await f.create(), first = await f.start(root), parent = f.ctx.agents.get(first.childId)!;
    const second = await f.start(parent), child = f.ctx.agents.get(second.childId)!;
    const count = accepted(child).length, ticket = f.runtime.authority.acquireParentTicket(parent);
    f.setBeforeEvidence(async (captured) => {
      if (captured.parent === parent) { entered.release(); await evidence.promise; }
    });
    const pending = f.runtime.sendMessage(parent, child.id, [{ type: "text", text: "old residency pending" }], { signal: new AbortController().signal });
    const refusal = assert.rejects(pending);
    await entered.promise;
    stream.release(); f.adapter.beforeStream = undefined;
    await f.runtime.drainChildren(root, [parent.id]);
    assert.equal(ticket.signal.aborted, true);
    evidence.release(); await refusal;
    assert.equal(accepted(child).length, count);
    assert.equal(f.runtime.authority.acquireParentTicket(root).signal.aborted, false);
  } finally { evidence.release(); stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("dispose start synchronously fences borrowed signals racing native image, preparation and cold completion", async (t) => {
  for (const phase of ["image", "prepare", "cold"] as const) for (const owner of ["Host", "policy", "residency", "owned handle", "operator", "Connection"] as const) {
    await t.test(`${phase}: ${owner}`, async (t) => {
      const f = await deliveryFixture({ images: phase === "image" });
      const stream = gate(), streamEntered = gate(), entered = gate(), completion = gate(), began = gate();
      f.adapter.beforeStream = () => { streamEntered.release(); return stream.promise; };
      const llm = f.ctx.llm, resolve = llm.resolveModelInfo.bind(llm);
      let disposal: Promise<void> | undefined;
      let ticket!: ParentAdmissionTicket<FixtureAdmission>, deliverySignal!: AbortSignal;
      let atStart: { uid: number | null; ticketAborted: boolean; deliveryAborted: boolean; ready: boolean; acceptsTicket: boolean; taskAborted: boolean } | undefined;
      try {
        const parent = await f.create(), started = await f.start(parent), original = f.ctx.agents.get(started.childId)!;
        await streamEntered.promise;
        let child = original;
        const count = accepted(child).length;
        const retiring = owner === "Host" ? f.runtimeFiber.ctx : owner === "policy" ? f.bindingScope : owner === "residency" || owner === "owned handle" ? parent.ctx
          : owner === "operator" ? f.connectionOwner().browserPeer.ctx : f.connectionScope();
        const begin = () => {
          if (owner === "owned handle") f.runtime.authority.revokeParent(parent, "owned-handle-teardown-start");
          disposal = owner === "Host" ? f.runtimeFiber.dispose() : owner === "policy" ? f.bindingFiber.dispose()
            : owner === "residency" ? parent.ctx.fiber.dispose() : owner === "owned handle" ? f.beginAgentDisposal(parent)
            : owner === "operator" ? f.connectionOwner().browserPeer.dispose() : f.beginConnectionDisposal();
          let acceptsTicket = true;
          try { f.runtime.authority.assertTicket(ticket); } catch { acceptsTicket = false; }
          atStart = { uid: retiring.fiber.uid, ticketAborted: ticket.signal.aborted, deliveryAborted: deliverySignal.aborted,
            ready: f.runtime.authority.view().deliveryFenceReady, acceptsTicket, taskAborted: f.adapter.calls[0].signal!.aborted };
          began.release();
        };
        f.setBeforeEvidence(async (issued, _id, signal) => {
          ticket = issued; deliverySignal = signal;
          if (phase === "prepare") { entered.release(); await completion.promise; queueMicrotask(begin); }
        });
        let request = f.request(parent, child.id, "dispose race");
        if (phase === "image") {
          request = { ...request, content: [{ type: "image", mediaType: "image/png", data: await nativePng() }] };
          llm.resolveModelInfo = async (provider, model, signal) => {
            const actual = await resolve(provider, model, signal);
            entered.release(); await completion.promise;
            // Queue disposal immediately ahead of the real native post-await cutoff.
            queueMicrotask(begin);
            return actual;
          };
        } else if (phase === "cold") {
          stream.release(); f.adapter.beforeStream = undefined;
          await f.runtime.drainChildren(parent, [child.id]);
          await f.ctx.sessionPersistence.flush();
          f.ctx.on("agent/created", async ({ agent, source }) => {
            if (source !== "resume" || agent.id !== original.id) return;
            child = agent; entered.release(); await completion.promise; queueMicrotask(begin);
          }, { global: true });
        }
        const pending = f.prompt(request).then((receipt) => ({ receipt }), (error: unknown) => ({ error }));
        await entered.promise;
        completion.release(); await began.promise;
        const outcome = await pending;
        const acceptedDelta = accepted(child).length - count;
        t.diagnostic(JSON.stringify({ phase, owner, atStart, acceptedDelta, result: "receipt" in outcome ? "accepted" : remoteErrorOf(outcome.error)?.code }));
        assert.ok(atStart);
        if (owner !== "owned handle") assert.equal(atStart.uid, null);
        assert.equal(atStart.ticketAborted, owner !== "operator" && owner !== "Connection");
        assert.equal(atStart.deliveryAborted, true);
        if (owner === "Host" || owner === "policy") assert.equal(atStart.ready, false);
        assert.equal(atStart.acceptsTicket, owner === "operator" || owner === "Connection");
        assert.equal(atStart.taskAborted, phase === "cold", "only the original residency deliberately drained for cold resume has ended");
        assert.ok("error" in outcome);
        assert.equal(remoteErrorOf(outcome.error)?.code, "gateway/cancelled");
        assert.equal(acceptedDelta, 0);
      } finally {
        llm.resolveModelInfo = resolve;
        completion.release(); stream.release(); f.adapter.beforeStream = undefined;
        await disposal;
        await f.dispose();
      }
    });
  }
});

test("accepted queue, running task and native child reports survive policy, operator and Connection disposal start", async (t) => {
  for (const owner of ["policy", "operator", "Connection"] as const) await t.test(owner, async () => {
    const f = await deliveryFixture();
    const stream = gate(), entered = gate();
    f.adapter.beforeStream = async () => { entered.release(); await stream.promise; };
    try {
      const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
      await entered.promise;
      const queued = await f.prompt(f.request(parent, child.id, "already accepted queue")) as { messageId: string };
      const count = accepted(child).length;
      const disposed = owner === "policy" ? f.bindingFiber.dispose() : owner === "operator" ? f.connectionOwner().browserPeer.dispose() : f.beginConnectionDisposal();
      assert.equal(f.adapter.calls[0].signal?.aborted, false);
      await disposed;
      assert.equal(f.adapter.calls[0].signal?.aborted, false);
      assert.equal(child.status, "running");
      assert.ok(child.inbox.nextTurn.some((message) => message.id === queued.messageId));
      const report = await f.runtime.sendMessage(child, parent.id, [{ type: "text", text: "native report after disposal start" }], { signal: new AbortController().signal });
      assert.ok(accepted(parent).some((message) => message.id === report));
      assert.equal(accepted(child).length, count);
      assert.equal(f.adapter.calls.length, 1);
    } finally { stream.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
  });
});

test("public native sendMessage image cutoff observes policy disposal start without a Gateway wrapper", async () => {
  const f = await deliveryFixture({ images: true });
  const stream = gate(), entered = gate(), completion = gate();
  const llm = f.ctx.llm, resolve = llm.resolveModelInfo.bind(llm);
  f.adapter.beforeStream = () => stream.promise;
  let disposal: Promise<void> | undefined;
  try {
    const parent = await f.create(), started = await f.start(parent), child = f.ctx.agents.get(started.childId)!;
    const content = await f.ctx.attachments.admitPromptContent([{ type: "image", mediaType: "image/png", data: await nativePng() }]);
    const count = accepted(child).length;
    llm.resolveModelInfo = async (provider, model, signal) => {
      const actual = await resolve(provider, model, signal);
      entered.release(); await completion.promise;
      queueMicrotask(() => { disposal = f.bindingFiber.dispose(); });
      return actual;
    };
    const refusal = assert.rejects(f.runtime.sendMessage(parent, child.id, content as ContentBlock[], { signal: new AbortController().signal }));
    await entered.promise; completion.release(); await refusal;
    assert.equal(accepted(child).length, count);
    assert.equal(f.adapter.calls[0].signal?.aborted, false);
  } finally {
    llm.resolveModelInfo = resolve; completion.release(); stream.release(); f.adapter.beforeStream = undefined;
    await disposal; await f.dispose();
  }
});
