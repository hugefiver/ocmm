import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { SessionEventMap, SessionEventType, SurfaceEventType, SurfaceIntent } from "@deepseek-ai/dsh-session";
import { gate, roleRunFixture, SubagentError } from "./role-run-fixture.ts";

const unauthorized = (error: unknown) => error instanceof SubagentError && error.code === "UNAUTHORIZED";
const unsupported = (error: unknown) => error instanceof SubagentError && error.code === "UNSUPPORTED_CAPABILITY";
const nativeResultFault = (error: unknown, fault: unknown) => error instanceof AggregateError
  && error.errors[0] === fault && error.errors[1] instanceof SubagentError && error.errors[1].cause === fault;

test("foreground holder returns the complete native ContentBlocks and releases the one-shot child once", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const { holder, request } = f.start();
    const invocation = await holder.ready;
    await f.adapter.entered.promise;
    assert.equal(invocation.parent, f.parent);
    assert.equal(invocation.owner, f.owner);
    assert.equal(invocation.sessionId, f.parent.id);
    assert.equal(invocation.toolCallId, request.toolCallId);
    assert.equal(invocation.capture, request.capture);
    assert.equal(invocation.projection, request.projection);
    assert.equal(invocation.runId, f.runs[0].childId);
    assert.equal(invocation.childId, f.runs[0].childId);
    assert.equal(invocation.mode, "one-shot");
    assert.equal(f.registry.get(f.parent, f.owner, invocation), holder);
    assert.deepEqual(f.registry.list(f.parent, f.owner), [holder]);
    f.adapter.output.release();
    const result = await holder.foreground;
    assert.equal(result.kind, "foreground");
    if (result.kind !== "foreground") throw new Error("expected foreground");
    assert.deepEqual(result.output, [{ type: "reasoning", text: "native reasoning block" }, { type: "text", text: "useful native run output" }]);
    await holder.drained;
    assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
    assert.equal(holder.state, "settled");
    assert.equal(f.registry.get(f.parent, f.owner, invocation), undefined);
    assert.deepEqual(f.registry.list(f.parent, f.owner), []);
    assert.deepEqual(f.ctx.agents.list(), [f.parent]);
    assert.equal(holder.background(f.address(holder)).status, "already-settled");
  } finally { await f.dispose(); }
});

test("different exact Agent, owner, session, call or native run cannot transfer a held invocation", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const foreign = await f.create();
    const { holder } = f.start();
    await holder.ready;
    const address = f.address(holder);
    for (const forged of [
      { ...address, parent: foreign }, { ...address, owner: {} }, { ...address, sessionId: foreign.id },
      { ...address, toolCallId: "foreign-call" as typeof address.toolCallId },
      { ...address, runId: foreign.id },
      { ...address, expectedAdmissionEpoch: "stale" },
    ]) assert.throws(() => holder.background(forged), unauthorized);
    assert.throws(() => f.registry.get(f.parent, {}, address), unauthorized);
    await assert.rejects(f.registry.drainParent(f.parent, {}, "foreign teardown"), unauthorized);
    assert.equal(holder.holderSignal.aborted, false);
    assert.equal(holder.state, "running");
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
    f.adapter.output.release();
    await holder.foreground;
  } finally { await f.dispose(); }
});

for (const options of [{ jobs: false }, { permitted: false }]) {
  test(`unavailable native jobs or disabled background rejects without abandoning foreground (${JSON.stringify(options)})`, { timeout: 15000 }, async () => {
    const f = await roleRunFixture(options);
    try {
      const { holder, caller } = f.start();
      await holder.ready;
      await f.adapter.entered.promise;
      assert.throws(() => holder.background(f.address(holder)), unsupported);
      assert.equal(holder.state, "running");
      caller.abort();
      await assert.rejects(holder.foreground, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
      assert.equal(holder.state, "cancelled");
      assert.equal(f.counters.disposals, 1);
    } finally { await f.dispose(); }
  });
}

test("native job controller preflight rejection keeps the run, caller cancellation and disposer", { timeout: 15000 }, async () => {
  const f = await roleRunFixture({ controller: false });
  try {
    const { holder, caller } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    assert.throws(() => holder.background(f.address(holder)));
    assert.equal(holder.state, "running");
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
    assert.equal(f.ctx.agents.get(holder.invocation!.childId!)?.id, f.runs[0].childId);
    caller.abort();
    await assert.rejects(holder.foreground, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
    assert.equal(holder.background(f.address(holder)).status, "cancelled");
    assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
  } finally { await f.dispose(); }
});

test("starting call cannot transfer and cancellation before publication cannot resurrect it", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const paused = gate();
    const reached = gate();
    let nativeFailure: unknown;
    const call = f.start({ async start(signal) {
      reached.release();
      await paused.promise;
      f.counters.starts++;
      try { return await f.runtime.startActivation({ provider: "spawn", label: "starting", delivery: "caller", request: { parent: f.parent, prompt: [], maxDepth: 3 }, signal }); }
      catch (error) { nativeFailure = error; throw error; }
    } });
    await reached.promise;
    assert.equal(call.holder.state, "starting");
    assert.deepEqual(f.registry.list(f.parent, f.owner), [call.holder]);
    assert.equal(call.holder.toolCallId, call.request.toolCallId);
    assert.equal(call.holder.invocation, undefined);
    const unknownRun = { parent: f.parent, owner: f.owner, sessionId: f.parent.id, toolCallId: call.request.toolCallId,
      runId: f.parent.id, expectedAdmissionEpoch: call.request.admissionEpoch };
    assert.equal(call.holder.background(unknownRun).status, "starting");
    call.caller.abort();
    assert.equal(call.holder.background(unknownRun).status, "cancelled");
    paused.release();
    await assert.rejects(call.holder.foreground, (error: unknown) => error === nativeFailure);
    assert.equal(f.counters.starts, 1);
    assert.equal(f.counters.children, 0);
    assert.equal(f.counters.disposals, 0, "unpublished resources remain the native starter's responsibility");
    assert.deepEqual(f.ctx.agents.list(), [f.parent]);
  } finally { await f.dispose(); }
});

test("native controller reattachment permits transfer of the same foreground run after preflight rejection", { timeout: 15000 }, async () => {
  const f = await roleRunFixture({ controller: false });
  try {
    const { holder } = f.start();
    await holder.ready;
    assert.throws(() => holder.background(f.address(holder)));
    const detach = f.ctx.jobs.attachController("run handoff control");
    try {
      const transition = holder.background(f.address(holder));
      if (!("receipt" in transition)) throw new Error("expected native background receipt");
      f.adapter.output.release();
      assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "completed");
      await holder.drained;
      assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
    } finally { detach(); }
  } finally { await f.dispose(); }
});

test("cancellation before handoff waits for native disposal quiescence and never revives on a new epoch", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const { holder, caller } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    const disposing = gate(), released = gate();
    f.ctx.agents.get(f.runs[0].childId)!.ctx.effect(() => async () => { disposing.release(); await released.promise; });
    let returned = false;
    void holder.foreground.then(() => { returned = true; }, () => { returned = true; });
    caller.abort();
    await disposing.promise;
    assert.equal(returned, false);
    assert.equal(holder.background(f.address(holder)).status, "cancelled");
    f.publish();
    assert.equal(holder.background(f.address(holder)).status, "cancelled");
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
    released.release();
    await assert.rejects(holder.foreground, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
    assert.equal(f.counters.starts, 1);
    assert.equal(f.counters.disposals, 1);
  } finally { await f.dispose(); }
});

test("duplicate live tool invocation is refused instead of starting another native run", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const call = f.start();
    await call.holder.ready;
    assert.throws(() => f.registry.start(call.request), unauthorized);
    f.adapter.output.release();
    await call.holder.foreground;
    assert.equal(f.counters.starts, 1);
  } finally { await f.dispose(); }
});

test("foreground native model failure remains typed and a cleanup failure is not swallowed", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const disposal = new Error("trusted teardown failure");
    f.adapter.failure = new Error("model adapter failure");
    f.setDisposeFault(disposal);
    const { holder } = f.start();
    await holder.ready;
    f.adapter.output.release();
    await assert.rejects(holder.foreground, (error: unknown) => error instanceof AggregateError
      && error.errors[0] instanceof SubagentError && error.errors[0].code === "ERROR" && error.errors[1] === disposal);
    await assert.rejects(holder.drained, AggregateError);
    assert.equal(f.counters.disposals, 1);
    assert.deepEqual(f.ctx.agents.list(), [f.parent]);
  } finally { await f.dispose(); }
});

for (const background of [false, true]) {
  test(`drain preserves a cleanup ABORTED fault after a completed native ${background ? "background" : "foreground"} run`, { timeout: 15000 }, async () => {
    const f = await roleRunFixture();
    const cleanup = new SubagentError("cleanup fault", "ABORTED");
    try {
      f.setDisposeFault(cleanup);
      const { holder } = f.start();
      await holder.ready;
      await f.adapter.entered.promise;
      const transition = background ? holder.background(f.address(holder)) : undefined;
      const pendingDrain = f.registry.drain();
      const checkedDrain = assert.rejects(pendingDrain, (error: unknown) => error instanceof AggregateError && error.errors.length === 1 && error.errors[0] === cleanup);
      f.adapter.output.release();
      await checkedDrain;
      await assert.rejects(holder.drained, (error: unknown) => error === cleanup);
      if (transition !== undefined && "receipt" in transition) {
        assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "failed");
      } else await assert.rejects(holder.foreground, (error: unknown) => error === cleanup);
      assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
      assert.deepEqual(f.ctx.agents.list(), [f.parent]);
    } finally { await f.dispose(); }
  });
}

for (const cancelled of [false, true]) {
  test(`drain preserves a native start ABORTED rejection with caller cancelled=${cancelled}`, { timeout: 15000 }, async () => {
    const f = await roleRunFixture();
    const fault = new SubagentError("native start catalog fault", "ABORTED");
    let cancelStart: (() => void) | undefined;
    const append = f.parent.session.append.bind(f.parent.session);
    const spy = mock.method(f.parent.session, "append", <T extends SessionEventType>(type: T, data: SessionEventMap[T], ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : []) => {
      if (type === "subagent/catalog") { cancelStart?.(); throw fault; }
      return append(type, data, ...opts);
    });
    try {
      const { holder, caller } = f.start();
      if (cancelled) cancelStart = () => caller.abort();
      const pendingDrain = f.registry.drain();
      await assert.rejects(pendingDrain, (error: unknown) => error instanceof AggregateError && error.errors.length === 1 && error.errors[0] === fault);
      await assert.rejects(holder.ready, (error: unknown) => error === fault);
      await assert.rejects(holder.foreground, (error: unknown) => error === fault);
      await assert.rejects(holder.drained, (error: unknown) => error === fault);
      assert.equal(holder.holderSignal.aborted, cancelled);
      assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 0, disposals: 0 });
      assert.deepEqual(f.ctx.agents.list(), [f.parent], "the native starter releases its resources before rejecting");
    } finally { spy.mock.restore(); await f.dispose(); }
  });
}

for (const background of [false, true]) {
  for (const cancelled of [false, true]) {
    test(`drain preserves a native result ABORTED rejection in ${background ? "background" : "foreground"} with caller cancelled=${cancelled}`, { timeout: 15000 }, async () => {
      const f = await roleRunFixture();
      const fault = new SubagentError("native result reader fault", "ABORTED");
      try {
        const { holder, caller } = f.start();
        await holder.ready;
        await f.adapter.entered.promise;
        const child = f.ctx.agents.get(f.runs[0].childId)!;
        const snapshot = child.session.snapshotEvents.bind(child.session);
        const spy = mock.method(child.session, "snapshotEvents", (...args: Parameters<typeof snapshot>) => {
          if (args[0] !== undefined) throw fault;
          return snapshot(...args);
        });
        try {
          const transition = background ? holder.background(f.address(holder)) : undefined;
          const pendingDrain = f.registry.drain();
          const checkedDrain = assert.rejects(pendingDrain, (error: unknown) => error instanceof AggregateError && error.errors.length === 1 && nativeResultFault(error.errors[0], fault));
          if (cancelled) {
            // The caller relay is intentionally gone after native handoff.
            if (transition !== undefined && "receipt" in transition) f.ctx.jobs.kill(transition.receipt.jobId, f.parent.id);
            else caller.abort();
          } else f.adapter.output.release();
          await checkedDrain;
          await assert.rejects(holder.drained, (error: unknown) => nativeResultFault(error, fault));
          if (transition !== undefined && "receipt" in transition) {
            assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "failed");
          } else await assert.rejects(holder.foreground, (error: unknown) => nativeResultFault(error, fault));
          assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
          assert.deepEqual(f.ctx.agents.list(), [f.parent]);
        } finally { spy.mock.restore(); }
      } finally { await f.dispose(); }
    });
  }
}

test("drain accepts confirmed native cancellation only after successful one-shot cleanup", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  try {
    const cancelled = f.start(), failing = f.start();
    await Promise.all([cancelled.holder.ready, failing.holder.ready]);
    await f.adapter.entered.promise;
    const child = f.ctx.agents.get(failing.holder.invocation!.childId!)!;
    const fault = new SubagentError("parallel native result fault", "ABORTED");
    const snapshot = child.session.snapshotEvents.bind(child.session);
    const spy = mock.method(child.session, "snapshotEvents", (...args: Parameters<typeof snapshot>) => {
      if (args[0] !== undefined) throw fault;
      return snapshot(...args);
    });
    try {
      const pendingDrain = f.registry.drain();
      const checkedDrain = assert.rejects(pendingDrain, (error: unknown) => error instanceof AggregateError && error.errors.length === 1 && nativeResultFault(error.errors[0], fault));
      cancelled.caller.abort();
      failing.caller.abort();
      await checkedDrain;
      await assert.rejects(cancelled.holder.drained, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
      await assert.rejects(failing.holder.drained, (error: unknown) => nativeResultFault(error, fault));
      assert.deepEqual(f.counters, { starts: 2, children: 2, resultReads: 2, disposals: 2 });
    } finally { spy.mock.restore(); }
  } finally { await f.dispose(); }
});

for (const background of [false, true]) {
  test(`confirmed native ${background ? "background" : "foreground"} cancellation remains a successful drain`, { timeout: 15000 }, async () => {
    const f = await roleRunFixture();
    try {
      const { holder, caller } = f.start();
      await holder.ready;
      await f.adapter.entered.promise;
      const transition = background ? holder.background(f.address(holder)) : undefined;
      const pendingDrain = f.registry.drain();
      if (transition !== undefined && "receipt" in transition) f.ctx.jobs.kill(transition.receipt.jobId, f.parent.id);
      else caller.abort();
      await pendingDrain;
      await assert.rejects(holder.drained, (error: unknown) => error instanceof SubagentError && error.code === "ABORTED");
      if (transition !== undefined && "receipt" in transition) {
        assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, f.parent.id)).status, "killed");
      }
      assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
      assert.deepEqual(f.ctx.agents.list(), [f.parent]);
    } finally { await f.dispose(); }
  });
}

test("confirmed native cancellation cannot hide an ABORTED cleanup fault", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  const cleanup = new SubagentError("cancelled run cleanup fault", "ABORTED");
  try {
    f.setDisposeFault(cleanup);
    const { holder, caller } = f.start();
    await holder.ready;
    await f.adapter.entered.promise;
    const pendingDrain = f.registry.drain();
    const checkedDrain = assert.rejects(pendingDrain, (error: unknown) => error instanceof AggregateError
      && error.errors.length === 1 && error.errors[0] instanceof AggregateError && error.errors[0].errors[1] === cleanup);
    caller.abort();
    await checkedDrain;
    await assert.rejects(holder.drained, (error: unknown) => error instanceof AggregateError
      && error.errors[0] instanceof SubagentError && error.errors[0].code === "ABORTED" && error.errors[1] === cleanup);
    assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
    assert.deepEqual(f.ctx.agents.list(), [f.parent]);
  } finally { await f.dispose(); }
});

test("holder cancellation before native start is confirmed without classifying a starter rejection", { timeout: 15000 }, async () => {
  const f = await roleRunFixture();
  const reason = new SubagentError("caller cancellation", "ABORTED");
  try {
    const { holder, caller } = f.start();
    const pendingDrain = f.registry.drain();
    caller.abort(reason);
    await pendingDrain;
    await assert.rejects(holder.drained, (error: unknown) => error === reason);
    assert.deepEqual(f.counters, { starts: 0, children: 0, resultReads: 0, disposals: 0 });
  } finally { await f.dispose(); }
});
