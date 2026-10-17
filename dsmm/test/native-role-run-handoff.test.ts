import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { gate, roleRunFixture, SubagentError } from "./role-run-fixture.ts";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SubagentActivationSpec } from "@deepseek-ai/dsh-subagent";

test("holder cancellation in native receipt gap drains before ready or job handoff", { timeout: 15000 }, async () => {
  const f = await roleRunFixture(), accepted = gate(), release = gate();
  const start = SubagentRuntime.prototype.startActivation;
  const interception = mock.method(SubagentRuntime.prototype, "startActivation", async function(this: SubagentRuntime, spec: SubagentActivationSpec) {
    const receipt = await start.call(this, spec); accepted.release(); await release.promise; return receipt;
  });
  try {
    const { holder, caller } = f.start();
    const ready = assert.rejects(holder.ready, { code: "ABORTED" }), foreground = assert.rejects(holder.foreground, { code: "ABORTED" }), drained = assert.rejects(holder.drained, { code: "ABORTED" });
    await accepted.promise; caller.abort(); const draining = f.registry.drain(); release.release();
    await Promise.all([ready, foreground, drained, draining]);
    assert.equal(holder.state, "cancelled"); assert.equal(f.adapter.calls.length, 0);
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0); assert.deepEqual(f.ctx.agents.list(), [f.parent]);
  } finally { interception.mock.restore(); release.release(); await f.dispose(); }
});

test("foreground → same-run native job completes without restarting a child; double-click returns one real job", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const { holder, caller } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    const child = f.ctx.agents.get(f.runs[0].childId);
    const address = f.address(holder);
    const transferred = holder.background(address);
    assert.equal(transferred.status, "background");
    if (!("receipt" in transferred)) throw new Error("expected a native job receipt");
    const again = holder.background(address);
    assert.equal(again.status, "already-background");
    if (!("receipt" in again)) throw new Error("expected idempotent receipt");
    assert.equal(again.receipt, transferred.receipt);
    assert.equal(await holder.foreground, transferred.receipt);
    assert.equal(f.ctx.jobs.get(transferred.receipt.jobId, f.parent.id).status, "running");
    caller.abort(new Error("old foreground call ended"));
    assert.equal(holder.holderSignal.aborted, false);
    assert.equal(f.ctx.agents.get(holder.invocation!.childId!), child);
    f.adapter.output.release();
    assert.equal((await f.ctx.jobs.wait(transferred.receipt.jobId, 5000, f.parent.id)).status, "completed");
    assert.equal(f.ctx.jobs.read(transferred.receipt.jobId, f.parent.id).result, "useful native run output");
    await holder.drained;
    assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
    assert.equal(f.adapter.calls.length, 1);
    assert.deepEqual(f.ctx.agents.list(), [f.parent]);
    const catalog = await f.runtime.listChildren(f.parent.id);
    assert.equal(catalog.find((entry) => entry.id === holder.invocation!.childId)?.mode, "continuable");
    assert.equal(holder.background(address).status, "already-background");
    await assert.rejects(f.runtime.sendMessage(f.parent, holder.invocation!.childId!, [{ type: "text", text: "one-shot must not resume" }],
      { signal: new AbortController().signal }), (error: unknown) => error instanceof SubagentError && error.code === "NOT_RESUMABLE");
    assert.equal(f.counters.children, 1);
  } finally { await f.dispose(); }
});

test("successful native output plus disposer failure is failed, not falsely completed, on both owning surfaces", { timeout: 15000 }, async () => {
  for (const background of [false, true]) {
    const f = await roleRunFixture();
    const cleanup = new Error("native teardown collaborator failed");
    try {
      f.setDisposeFault(cleanup);
      const { holder } = f.start();
      await holder.ready;
      const transition = background ? holder.background(f.address(holder)) : undefined;
      f.adapter.output.release();
      await assert.rejects(holder.drained, (error: unknown) => error === cleanup);
      if (transition !== undefined && "receipt" in transition) {
        assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "failed");
        assert.ok(f.ctx.jobs.get(transition.receipt.jobId, f.parent.id).detail?.includes(cleanup.message));
      } else await assert.rejects(holder.foreground, (error: unknown) => error === cleanup);
      assert.equal(f.counters.disposals, 1);
      assert.deepEqual(f.ctx.agents.list(), [f.parent]);
    } finally { await f.dispose(); }
  }
});

test("native job cancellation is owned by the exact parent, not a foreign owner or the former caller", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const foreign = await f.create();
    const { holder } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    const transferred = holder.background(f.address(holder));
    if (!("receipt" in transferred)) throw new Error("expected background");
    const id = transferred.receipt.jobId;
    assert.throws(() => f.ctx.jobs.kill(id, foreign.id));
    assert.throws(() => f.ctx.jobs.read(id, foreign.id));
    assert.equal(f.ctx.jobs.kill(id, f.parent.id, "native owner cancellation"), "requested");
    assert.equal((await f.ctx.jobs.wait(id, 5000, f.parent.id)).status, "killed");
    await assert.rejects(holder.drained, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
    assert.equal(holder.state, "cancelled");
    assert.equal(holder.background(f.address(holder)).status, "already-background");
    assert.equal(f.counters.disposals, 1);
    assert.deepEqual(f.ctx.agents.list(), [f.parent, foreign]);
  } finally { await f.dispose(); }
});

test("native activation result settles after disposal, retaining complete foreground output", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const { holder } = f.start();
    await holder.ready;
    const child = f.ctx.agents.get(f.runs[0].childId)!;
    const disposing = gate(), released = gate();
    const detach = child.ctx.effect(() => async () => { disposing.release(); await released.promise; });
    f.adapter.output.release();
    await disposing.promise;
    assert.equal(holder.state, "running");
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
    const parentDisposal = f.disposeParent();
    assert.equal(holder.holderSignal.aborted, true, "owner lifetime remains connected through disposal quiescence");
    assert.equal(holder.state, "cancelled", "native receipt has not settled before cleanup finishes");
    released.release();
    const result = await holder.foreground;
    assert.equal(result.kind, "foreground");
    if (result.kind !== "foreground") throw new Error("expected full output");
    assert.equal(result.output.length, 2);
    await parentDisposal;
    detach();
    assert.equal(f.counters.disposals, 1);
  } finally { await f.dispose(); }
});

test("authorization is rechecked inside the final native job starter; epoch rotation does not cancel accepted runs", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const { holder, caller } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    const address = f.address(holder);
    let checks = 0;
    f.setBeforeAuthorization(() => { if (++checks === 2) f.publish(); });
    assert.throws(() => holder.background(address), (error: unknown) => error instanceof SubagentError);
    assert.equal(checks, 2);
    assert.equal(holder.state, "running");
    assert.equal(holder.holderSignal.aborted, false);
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
    f.setBeforeAuthorization(undefined);
    const updated = holder.background(f.address(holder));
    if (!("receipt" in updated)) throw new Error("expected background after fresh authorization");
    assert.equal(updated.receipt.invocation.admissionEpoch, address.expectedAdmissionEpoch, "the original capture stays original");
    caller.abort();
    f.adapter.output.release();
    assert.equal((await f.ctx.jobs.wait(updated.receipt.jobId, 5000, f.parent.id)).status, "completed");
    await holder.drained;
    assert.equal(f.counters.starts, 1);
  } finally { await f.dispose(); }
});

test("caller cancellation reentrancy before starter acceptance refuses transfer; after native registration it cannot kill the job", { timeout: 15000 }, async () => {
  for (const when of ["authorization", "registered"] as const) {
    const f = await roleRunFixture();
    try {
      const { holder, caller } = f.start();
      await holder.ready;
      await f.adapter.entered.promise;
      if (when === "authorization") {
        let checks = 0;
        f.setBeforeAuthorization(() => { if (++checks === 2) caller.abort(); });
        assert.throws(() => holder.background(f.address(holder)), (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
        assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
        await assert.rejects(holder.foreground, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
      } else {
        const detach = f.ctx.jobs.events.subscribe({ owners: "scope" }, (event) => { if (event.type === "registered") caller.abort(); });
        const transition = holder.background(f.address(holder));
        detach();
        if (!("receipt" in transition)) throw new Error("expected native job");
        assert.equal(caller.signal.aborted, true);
        assert.equal(holder.holderSignal.aborted, false);
        f.adapter.output.release();
        assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "completed");
        await holder.drained;
      }
      assert.equal(f.counters.disposals, 1);
    } finally { await f.dispose(); }
  }
});

for (const background of [false, true]) {
  test(`trusted exact parent teardown revokes first, cancels and drains the native ${background ? "background" : "foreground"} holder`, { timeout: 15000 }, async () => {
    const f = await roleRunFixture();
    try {
      const { holder } = f.start();
      await holder.ready;
      await f.adapter.entered.promise;
      if (background) holder.background(f.address(holder));
      const ticket = f.runtime.authority.acquireParentTicket(f.parent);
      const pending = f.disposeParent();
      assert.equal(ticket.signal.aborted, true);
      assert.equal(holder.holderSignal.aborted, true);
      await pending;
      await assert.rejects(holder.drained, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
      assert.deepEqual(f.ctx.agents.list(), []);
      assert.equal(f.counters.disposals, 1);
      assert.equal(f.revoked[0].agent, f.parent);
    } finally { await f.dispose(); }
  });
}

test("native Host teardown cancels the transferred job and drains before removing its services", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const { holder } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    holder.background(f.address(holder));
    const agents = f.ctx.agents;
    const pending = f.ctx.fiber.dispose();
    assert.equal(holder.holderSignal.aborted, true);
    await pending;
    await assert.rejects(holder.drained, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
    assert.equal(f.counters.disposals, 1);
    assert.equal(agents.list().length, 0);
  } finally { await f.dispose(); }
});

test("real native result rejection and disposal failure both survive foreground and native-job settlement", { timeout: 15000 }, async () => {
  for (const background of [false, true]) {
    const f = await roleRunFixture();
    const resultFailure = new Error("native result observation failure");
    const disposalFailure = new Error("trusted run cleanup failure");
    try {
      f.setDisposeFault(disposalFailure);
      const { holder } = f.start();
      await holder.ready;
      await f.adapter.entered.promise;
      const child = f.ctx.agents.get(f.runs[0].childId)!;
      const snapshot = child.session.snapshotEvents.bind(child.session);
      // Inject a fault in the native result reader's Session boundary, while
      // preserving the actual SDK run, AgentLoop, starter and jobs registry.
      const spy = mock.method(child.session, "snapshotEvents", (...args: Parameters<typeof snapshot>) => {
        if (args[0] !== undefined) throw resultFailure;
        return snapshot(...args);
      });
      const transition = background ? holder.background(f.address(holder)) : undefined;
      f.adapter.output.release();
      await assert.rejects(holder.drained, (error: unknown) => error instanceof AggregateError && error.errors[0] === resultFailure
        && error.errors[1] instanceof AggregateError && error.errors[1].errors[0]?.cause === resultFailure && error.errors[1].errors[1] === disposalFailure);
      spy.mock.restore();
      if (transition !== undefined && "receipt" in transition) {
        assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "failed");
        const detail = f.ctx.jobs.get(transition.receipt.jobId, f.parent.id).detail ?? "";
        assert.ok(detail.includes(resultFailure.message));
        assert.ok(detail.includes(disposalFailure.message));
        assert.equal((await holder.foreground).kind, "background");
      } else await assert.rejects(holder.foreground, AggregateError);
      assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
      assert.deepEqual(f.ctx.agents.list(), [f.parent]);
    } finally { await f.dispose(); }
  }
});
