import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SubagentActivationSpec } from "@deepseek-ai/dsh-subagent";
import { duringActivationOwnership } from "../src/agent-registry.ts";
import { deliveryFixture, gate, nativePng } from "./delivery-runtime-fixture.ts";

const text = [{ type: "text" as const, text: "bounded native input" }];

for (const surface of ["direct", "Gateway"] as const) test(`${surface} delivery retains exact creation context across resident release and cold materialization`, { timeout: 15000 }, async () => {
  const f = await deliveryFixture(), entered = gate(), release = gate(), stream = gate();
  f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), activation = await f.start(parent), original = f.ctx.agents.get(activation.childId)!;
    const send = SubagentRuntime.prototype.sendMessage, prompt = SubagentRuntime.prototype.prompt;
    const intercepted = surface === "direct"
      ? mock.method(SubagentRuntime.prototype, "sendMessage", async function(this: SubagentRuntime, ...args: Parameters<typeof send>) {
        entered.release(); await release.promise; return send.call(this, ...args);
      })
      : mock.method(SubagentRuntime.prototype, "prompt", async function(this: SubagentRuntime, ...args: Parameters<typeof prompt>) {
        entered.release(); await release.promise; return prompt.call(this, ...args);
      });
    try {
      const pending = surface === "direct" ? f.runtime.sendMessage(parent, original.id, text, { signal: new AbortController().signal })
        : f.prompt(f.request(parent, original.id, "Useful cold delivery"));
      const outcome = pending.then(value => ({ value }), (error: unknown) => ({ error }));
      await entered.promise;
      stream.release(); await activation.dispose(); await f.ctx.sessionPersistence.flush();
      assert.equal(f.ctx.agents.get(original.id), undefined);
      release.release();
      const result = await outcome;
      if ("error" in result) throw result.error;
      const resumed = f.ctx.agents.get(original.id)!; assert.ok(resumed); assert.notEqual(resumed, original);
      assert.equal(f.runtime.authority.acquireParentTicket(resumed).signal.aborted, false);
      await resumed.whenIdle();
      assert.ok(resumed.session.snapshotEvents().some(event => event.type === "turn/end" && event.data.reason.kind === "completed"));
    } finally { release.release(); intercepted.mock.restore(); }
  } finally { release.release(); stream.release(); await f.dispose(); }
});

for (const edge of ["session", "inserted"] as const) test(`cold promotion survives browser disposal at ${edge} acceptance`, { timeout: 15000 }, async () => {
  const f = await deliveryFixture(), hold = gate(); f.adapter.beforeStream = () => hold.promise;
  let disposal: Promise<unknown> | undefined;
  try {
    const parent = await f.create(), activation = await f.start(parent);
    hold.release(); await activation.dispose(); await f.ctx.sessionPersistence.flush();
    let child: Agent | undefined;
    f.ctx.on("agent/created", ({ agent }) => { if (agent.id === activation.childId) child = agent; }, { global: true });
    const retire = () => { disposal ??= Promise.resolve(f.connectionOwner().browserPeer.dispose()); };
    if (edge === "session") f.ctx.on("session/event", (session, event) => {
      if (session.id === activation.childId && event.type === "agent/inbox/spliced" && event.data.inserted?.length) retire();
    }, { global: true });
    else f.ctx.on("agent/inbox/inserted", ({ agent }) => { if (agent === child) retire(); }, { global: true, prepend: true });
    await f.prompt(f.request(parent, activation.childId, "accepted browser input"));
    assert.ok(disposal); assert.ok(child);
    assert.equal(f.runtime.authority.acquireParentTicket(child).signal.aborted, false);
    await disposal;
  } finally { hold.release(); await disposal; await f.dispose(); }
});

for (const cold of [false, true]) for (const edge of ["session", "inserted"] as const) for (const abort of ["caller", "epoch"] as const) {
  test(`${cold ? "cold" : "fresh"} receipt survives synchronous ${abort} abort at ${edge} acceptance`, { timeout: 15000 }, async () => {
    const f = await deliveryFixture({ connection: false }), hold = gate(); f.adapter.beforeStream = () => hold.promise;
    try {
      const parent = await f.create(), id = cold ? (await f.start(parent)).childId : SessionId(randomUUID());
      if (cold) { hold.release(); await f.runtime.drainChildren(parent, [id]); await f.ctx.sessionPersistence.flush(); }
      const caller = new AbortController(); let child: Agent | undefined, fired = false;
      f.ctx.on("agent/created", ({ agent }) => { if (agent.id === id) child = agent; }, { global: true });
      const cancel = () => { if (fired) return; fired = true; if (abort === "caller") caller.abort(); else f.publish(parent); };
      if (edge === "session") f.ctx.on("session/event", (session, event) => {
        if (session.id === id && event.type === "agent/inbox/spliced" && event.data.inserted?.length) cancel();
      }, { global: true });
      else f.ctx.on("agent/inbox/inserted", ({ agent }) => { if (agent === child) cancel(); }, { global: true, prepend: true });
      if (cold) await f.runtime.sendMessage(parent, id, text, { signal: caller.signal });
      else await f.runtime.startActivation({ provider: "spawn", label: "acceptance", childId: id, delivery: "parent", request: { parent, prompt: text }, signal: caller.signal });
      assert.equal(fired, true); assert.ok(child);
      assert.equal(f.runtime.authority.acquireParentTicket(child).signal.aborted, false);
      assert.equal(f.ctx.agents.get(id), child);
    } finally { hold.release(); await f.dispose(); }
  });
}

for (const cold of [false, true]) for (const fault of ["image-cancel", "image-error", ...cold ? [] : ["catalog-commit"]] as const) {
  test(`${cold ? "cold" : "fresh"} ${fault} rollback has no ticket or stream during cleanup`, { timeout: 15000 }, async () => {
    const f = await deliveryFixture({ connection: false, images: true });
    const entered = gate(), release = gate(), cleanupEntered = gate(), cleanupRelease = gate(); let child: Agent | undefined;
    try {
      const image = [...await f.ctx.attachments.admitPromptContent([{ type: "image", mediaType: "image/png", data: await nativePng() }])];
      const parent = await f.create(); let id = SessionId(randomUUID());
      if (cold) {
        const held = gate(); f.adapter.beforeStream = () => held.promise;
        const activation = await f.start(parent); id = activation.childId;
        held.release(); await activation.dispose(); await f.ctx.sessionPersistence.flush(); f.adapter.beforeStream = undefined;
      }
      const before = f.adapter.calls.length;
      f.ctx.on("agent/created", ({ agent }) => { if (agent.id === id) {
        child = agent; agent.ctx.effect(() => async () => { cleanupEntered.release(); await cleanupRelease.promise; });
      } }, { global: true });
      const caller = new AbortController(), failure = new Error("native admission fault");
      f.adapter.beforeResolve = async () => { entered.release(); await release.promise; throw failure; };
      const append = parent.session.append.bind(parent.session);
      const catalog = fault === "catalog-commit" ? mock.method(parent.session, "append", (...args: Parameters<typeof append>) => {
        if (args[0] === "subagent/catalog") throw failure; return Reflect.apply(append, parent.session, args);
      }) : undefined;
      const pending = cold ? f.runtime.sendMessage(parent, id, image, { signal: caller.signal })
        : f.runtime.startActivation({ provider: "spawn", label: "rollback", childId: id, delivery: "parent", request: { parent, prompt: fault === "catalog-commit" ? text : image }, signal: caller.signal });
      const rejected = assert.rejects(pending);
      if (fault !== "catalog-commit") {
        await entered.promise; assert.ok(child);
        assert.throws(() => f.runtime.authority.acquireParentTicket(child!));
        await assert.rejects(f.runtime.authority.waitForPromotion(child));
        await assert.rejects(f.runtime.sendMessage(child, parent.id, text, { signal: new AbortController().signal }));
        await assert.rejects(f.runtime.startActivation({ provider: "spawn", label: "pending sender", delivery: "caller", request: { parent: child, prompt: text }, signal: new AbortController().signal }));
        if (fault === "image-cancel") caller.abort(failure); release.release();
      }
      await cleanupEntered.promise; assert.ok(child);
      assert.equal(f.runtime.authority.isManaged(child), true);
      assert.throws(() => f.runtime.authority.acquireParentTicket(child!));
      assert.throws(() => f.runtime.authority.registerParent(child!, f.admissions.get(child!)!, f.owner));
      assert.equal(f.adapter.calls.length, before);
      cleanupRelease.release(); await rejected; catalog?.mock.restore(); assert.equal(f.ctx.agents.get(id), undefined);
    } finally { release.release(); cleanupRelease.release(); f.adapter.beforeResolve = undefined; await f.dispose(); }
  });
}

test("interrupted pending waiter does not retire residency", { timeout: 15000 }, async () => {
  const f = await deliveryFixture({ connection: false, images: true }), entered = gate(), release = gate(); let child: Agent | undefined;
  try {
    const image = [...await f.ctx.attachments.admitPromptContent([{ type: "image", mediaType: "image/png", data: await nativePng() }])];
    const parent = await f.create(), waiter = new AbortController();
    f.adapter.beforeResolve = async () => { entered.release(); await release.promise; };
    f.ctx.on("agent/created", ({ agent }) => { if (agent !== parent) child = agent; }, { global: true });
    const pending = f.runtime.startActivation({ provider: "spawn", label: "pending", delivery: "caller", request: { parent, prompt: image }, signal: new AbortController().signal });
    await entered.promise; assert.ok(child);
    const interrupted = assert.rejects(f.runtime.authority.waitForPromotion(child, waiter.signal)); waiter.abort(); await interrupted;
    release.release(); const receipt = await pending;
    assert.equal(f.runtime.authority.acquireParentTicket(child).signal.aborted, false); await receipt.dispose();
  } finally { release.release(); f.adapter.beforeResolve = undefined; await f.dispose(); }
});

for (const cancelOwner of [false, true]) test(`receipt gap ${cancelOwner ? "holder cancel retires" : "native interrupt preserves"} exact child`, { timeout: 15000 }, async () => {
  const f = await deliveryFixture({ connection: false }), accepted = gate(), release = gate(), stream = gate();
  f.adapter.beforeStream = () => stream.promise;
  const start = SubagentRuntime.prototype.startActivation;
  const intercepted = mock.method(SubagentRuntime.prototype, "startActivation", async function(this: SubagentRuntime, spec: SubagentActivationSpec) {
    const receipt = await start.call(this, spec); accepted.release(); await release.promise; return receipt;
  });
  try {
    const parent = await f.create(), owner = new AbortController(), id = SessionId(randomUUID());
    const pending = duringActivationOwnership(owner.signal, () => f.runtime.startActivation({ provider: "spawn", childId: id, label: "receipt gap", delivery: "caller", request: { parent, prompt: text }, signal: owner.signal }));
    const refusal = cancelOwner ? assert.rejects(pending, { code: "ABORTED" }) : undefined;
    await accepted.promise; const child = f.ctx.agents.get(id)!;
    assert.ok(child); assert.throws(() => f.runtime.authority.acquireParentTicket(child));
    if (cancelOwner) owner.abort(); else f.runtime.interrupt(id, { kind: "ancestor", agent: parent });
    await child.whenIdle(); assert.equal(f.adapter.calls.length, 0); release.release();
    if (cancelOwner) { await refusal; assert.throws(() => f.runtime.authority.acquireParentTicket(child)); assert.equal(f.ctx.agents.get(id), undefined); }
    else { const receipt = await pending; assert.equal(f.runtime.authority.acquireParentTicket(child).signal.aborted, false); stream.release(); await receipt.dispose(); }
  } finally { intercepted.mock.restore(); release.release(); stream.release(); await f.dispose(); }
});

for (const disposal of ["receipt", "selected", "descendants", "natural", "registry", "runtime"] as const) test(`${disposal} revokes before cleanup await`, { timeout: 15000 }, async () => {
  const f = await deliveryFixture({ connection: false }), stream = gate(), cleanup = gate(), entered = gate();
  f.adapter.beforeStream = () => stream.promise;
  try {
    const parent = await f.create(), other = await f.create(), a = await f.start(parent), b = await f.start(other);
    const child = f.ctx.agents.get(a.childId)!, sibling = f.ctx.agents.get(b.childId)!;
    const ticket = f.runtime.authority.acquireParentTicket(child), siblingTicket = f.runtime.authority.acquireParentTicket(sibling), parentTicket = f.runtime.authority.acquireParentTicket(parent);
    child.ctx.effect(() => async () => { entered.release(); await cleanup.promise; });
    let done: Promise<unknown>;
    if (disposal === "natural") { stream.release(); done = a.result; }
    else {
      done = disposal === "receipt" ? a.dispose() : disposal === "selected" ? f.runtime.drainChildren(parent, [a.childId])
        : disposal === "descendants" ? f.runtime.drainDescendants([parent]) : disposal === "registry" ? f.agentsFiber.dispose() : f.runtimeFiber.dispose();
      assert.equal(ticket.signal.aborted, true);
      if (disposal !== "registry" && disposal !== "runtime") assert.equal(siblingTicket.signal.aborted, false);
      if (disposal === "selected" || disposal === "receipt") assert.equal(parentTicket.signal.aborted, false);
      stream.release();
    }
    await entered.promise; assert.equal(ticket.signal.aborted, true); cleanup.release(); await done;
  } finally { stream.release(); cleanup.release(); await f.dispose(); }
});

test("old exact disposer cannot retire replacement; nested selected drain preserves siblings", { timeout: 15000 }, async () => {
  const f = await deliveryFixture({ connection: false }), hold = gate(); f.adapter.beforeStream = () => hold.promise;
  try {
    const root = await f.create(), original = await f.start(root), first = f.ctx.agents.get(original.childId)!;
    hold.release(); await original.dispose(); await f.ctx.sessionPersistence.flush();
    const active = gate(); f.adapter.beforeStream = () => active.promise;
    try {
      await f.runtime.sendMessage(root, first.id, text, { signal: new AbortController().signal });
      const replacement = f.ctx.agents.get(first.id)!; assert.notEqual(replacement, first);
      const ticket = f.runtime.authority.acquireParentTicket(replacement); await original.dispose(); assert.equal(ticket.signal.aborted, false);
      assert.throws(() => f.runtime.authority.registerParent(first, f.admissions.get(first)!, f.owner));
      const [nested, sibling] = await Promise.all([f.start(replacement), f.start(root)]);
      const nestedTicket = f.runtime.authority.acquireParentTicket(f.ctx.agents.get(nested.childId)!);
      const siblingTicket = f.runtime.authority.acquireParentTicket(f.ctx.agents.get(sibling.childId)!);
      const draining = f.runtime.drainChildren(root, [replacement.id]);
      assert.equal(ticket.signal.aborted, true); assert.equal(nestedTicket.signal.aborted, true); assert.equal(siblingTicket.signal.aborted, false);
      assert.equal(f.runtime.authority.acquireParentTicket(root).signal.aborted, false); active.release(); await draining;
    } finally { active.release(); }
  } finally { hold.release(); await f.dispose(); }
});

for (const cleanupFails of [false, true]) test(`promotion failure preserves cleanup=${cleanupFails}`, { timeout: 15000 }, async () => {
  const f = await deliveryFixture({ connection: false }), entered = gate(), release = gate();
  const admissionFault = new Error("authority installation failed"), cleanupFault = new Error("native cleanup failed");
  const contains = (error: unknown, expected: Error): boolean => error === expected
    || error instanceof AggregateError && error.errors.some(item => contains(item, expected))
    || error instanceof Error && error.cause !== undefined && contains(error.cause, expected);
  let child: Agent | undefined, restoreSnapshot: (() => void) | undefined;
  try {
    const parent = await f.create();
    f.ctx.on("agent/created", ({ agent }) => { if (f.ctx.agents.isOwnedBy(agent.id, parent)) {
      child = agent; agent.ctx.effect(() => async () => { entered.release(); await release.promise; });
    } }, { global: true });
    const register = f.runtime.authority.registerParent.bind(f.runtime.authority); let calls = 0;
    const registration = mock.method(f.runtime.authority, "registerParent", (...args: Parameters<typeof register>) => {
      if (++calls === 2) {
        if (cleanupFails) {
          const session = args[0].session, snapshot = session.snapshotEvents.bind(session);
          const spy = mock.method(session, "snapshotEvents", (...input: Parameters<typeof snapshot>) => { if (input[0] !== undefined) throw cleanupFault; return snapshot(...input); });
          restoreSnapshot = () => spy.mock.restore();
        }
        throw admissionFault;
      }
      return register(...args);
    });
    try {
      const pending = assert.rejects(f.start(parent), error => contains(error, admissionFault) && (!cleanupFails || contains(error, cleanupFault)));
      await entered.promise; assert.ok(child); assert.throws(() => f.runtime.authority.acquireParentTicket(child!));
      assert.equal(f.adapter.calls.length, 0); release.release(); await pending; assert.equal(f.ctx.agents.get(child.id), undefined);
    } finally { registration.mock.restore(); restoreSnapshot?.(); }
  } finally { release.release(); await f.dispose(); }
});
