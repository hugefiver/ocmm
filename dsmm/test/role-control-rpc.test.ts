import assert from "node:assert/strict";
import { test } from "node:test";
import { controlDeliveryFixture, controlRunFixture, accepted, nativePng, newEpoch, gate, refused, remoteErrorOf, ROLE_CONTROL_REMOTE } from "./role-control-fixture.ts";
import type { BackgroundTransitionResult, ChildSessionSnapshot, RoleControlDescendantsSnapshot } from "../src/role-control-types.ts";

test("authenticated read uses actual public SessionController cold-root resolution; control actions never resume the parent", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture();
  const { SessionController } = await import("@deepseek-ai/dsh-api-session-controller");
  const resumed: import("@deepseek-ai/dsh-agent").AgentHandle[] = [];
  const nativeResume = f.ctx.agents.resume.bind(f.ctx.agents);
  try {
    // These unused upload/workspace/model-selection collaborators are in-memory;
    // persistence, exact observation, controller and Agent resume stay native.
    f.ctx.provide("fileUploads", { registerAgentResolver() { return () => {}; } });
    f.ctx.provide("workspaceRegistry", { list() { return []; } });
    f.ctx.provide("agentDefaultModel", { currentSelection() { return { provider: "fixture", model: "native" }; } });
    new SessionController(f.ctx, { nativeOpen: false });
    const root = await f.create();
    await f.ctx.sessionPersistence.flush();
    await f.disposeAgent(root);
    f.ctx.on("agent/created", ({ agent }) => {
      if (agent.id !== root.id) return;
      const admission = { epoch: newEpoch(), permitted: true };
      f.managed.add(agent); f.admissions.set(agent, admission);
      f.runtime.authority.registerParent(agent, admission, f.owner);
    }, { global: true });
    f.ctx.agents.resume = async options => { const handle = await nativeResume(options); resumed.push(handle); return handle; };
    const request = f.request(root, root.id, "must not wake a parent");
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request }), refused("unavailable"));
    assert.equal(resumed.length, 0);
    const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    assert.equal(resumed.length, 1); assert.notEqual(resumed[0].agent, root);
    assert.equal(resumed[0].agent.id, root.id); assert.equal(view.sessionId, root.id);
    assert.equal(f.ctx.agents.get(root.id), resumed[0].agent);
  } finally {
    f.ctx.agents.resume = nativeResume;
    for (const handle of resumed) { f.runtime.authority.revokeParent(handle.agent, "fixture-owned-cold-root"); await handle.dispose(); }
    await f.dispose();
  }
});

test("real Gateway decodes closed child DTOs before operator/session work; no fake owner claim resumes a parent", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture();
  try {
    const root = await f.create();
    const operator = f.ctx.connection.browserPeer;
    const foreign = { ...operator, ctx: new (operator.ctx.constructor as typeof import("@deepseek-ai/cordis").Context)(), async dispose() {} };
    const independentOwner = f.ctx.connection.createPeer({ principal: { kind: "owner" } });
    let resumes = 0;
    f.ctx.provide("sessionController", { async resolveAgent() { resumes++; throw new Error("PRIVATE_SESSION_PATH"); } });
    const request = { ...f.request(root, root.id, "bad target"), parentSessionId: "cold-root" };
    for (const invalid of [{ ...request, owner: operator.id }, { ...request, mode: "one-shot" }, { ...request, delivery: "invalid" }, { ...request, content: [{ type: "image", attachment: { path: "SECRET" } }] }]) {
      await assert.rejects(f.invoke("prompt", { sessionId: "cold-root", request: invalid }), error => String(remoteErrorOf(error)?.code) === "gateway/input-invalid");
    }
    await assert.rejects(f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method: "describe", args: { sessionId: "cold-root" }, peer: foreign }), refused("not-owned"));
    await assert.rejects(f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method: "describe", args: { sessionId: "cold-root" }, peer: independentOwner }), refused("not-owned"));
    await assert.rejects(Promise.resolve().then(() => Reflect.apply(f.ctx.typertGateway.invoke, f.ctx.typertGateway,
      [{ namespace: "dsmmChildren", method: "describe", args: { sessionId: "cold-root" } }])));
    await assert.rejects(f.invoke("prompt", { sessionId: "cold-root", request }), refused("unavailable"));
    assert.equal(resumes, 0);
    const child = await f.start(root);
    await assert.rejects(f.invoke("describe", { sessionId: child.childId }), refused("not-owned"));
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: { ...request, parentSessionId: "different" } }), refused("validation"));
    await f.replaceConnection();
    await assert.rejects(f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method: "describe", args: { sessionId: root.id }, peer: operator }));
    assert.equal((await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot).sessionId, root.id);
    assert.equal(resumes, 0);
  } finally { await f.dispose(); }
});

test("external native catalog entries remain unknown and read-only in the child RPC", { timeout: 20000 }, async t => {
  const f = await controlDeliveryFixture();
  const { SessionId } = await import("@deepseek-ai/dsh-session");
  try {
    const root = await f.create(), entry = { id: SessionId("external-child"), mode: "external" as const, createdAt: 0 };
    t.mock.method(f.runtime, "listChildren", async () => [entry]);
    const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    assert.equal(view.children[0].mode, "unknown");
    assert.equal(view.children[0].readonly, true);
    assert.deepEqual(view.children[0].controls, { prompt: { enabled: false, reason: "unknown-mode" }, interrupt: { enabled: false, reason: "unknown-mode" } });
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: f.request(root, entry.id, "not a local continuation") }), refused("not-resumable"));
    assert.equal(entry.mode, "external");
  } finally { await f.dispose(); }
});

test("strict result grammar rejects secret/error payloads, unsafe shapes and manufactured starting-run identity", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture();
  try {
    const root = await f.create();
    const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    const result = ROLE_CONTROL_REMOTE.descriptors.find(entry => entry.method === "describe")!.result;
    assert.equal(result.mode, "strict"); if (result.mode !== "strict") throw new Error("strict codec required");
    for (const invalid of [
      { ...view, secret: "not a field" },
      { ...view, capabilities: { ...view.capabilities, prompt: { enabled: false, reason: "SECRET_PATH" } } },
      { ...view, runs: [{ sessionId: root.id, toolCallId: "call", state: "starting", background: { enabled: false, reason: "starting" }, invocation: { role: "dsmm-coding", label: "Coding", level: "max", routeSource: "level", mode: "one-shot", runId: "fake" } }] },
      { ...view, children: [{ id: "unknown", parentSessionId: root.id, mode: "one-shot", activity: "inactive", readonly: false, controls: { prompt: { enabled: true }, interrupt: { enabled: true } } }] },
    ]) assert.throws(() => result.create().parse(invalid));
    const request = ROLE_CONTROL_REMOTE.descriptors.find(entry => entry.method === "prompt")!.parameters[1].codec;
    if (request.mode !== "strict") throw new Error("strict request required");
    let read = false;
    const getter = { get requestId() { read = true; return "secret"; } };
    const cyclic: Record<string, unknown> = {}; cyclic.loop = cyclic;
    for (const invalid of [getter, cyclic, { ...f.request(root, root.id, "x"), content: [undefined] }, { ...f.request(root, root.id, "x"), peer: Symbol("fake") }]) assert.throws(() => request.create().parse(invalid));
    assert.equal(read, false);
    f.setFailObservation(true);
    await f.start(root);
    await assert.rejects(f.invoke("describe", { sessionId: root.id }), error => {
      assert.doesNotMatch(JSON.stringify(remoteErrorOf(error)), /SECRET_TOKEN|private-fixture|raw-session/u);
      return refused("unavailable")(error);
    });
  } finally { await f.dispose(); }
});

test("native direct-child catalog observation shows role-disabled/legacy limitation without fabricating old invocation", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture();
  const held = gate(); f.adapter.beforeStream = () => held.promise;
  try {
    const root = await f.create(), first = await f.start(root), child = f.ctx.agents.get(first.childId)!;
    const other = await f.create(), foreign = await f.start(other);
    f.setLegacy(true); f.setRoleEnabled(false);
    const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    assert.deepEqual(view.children.map(row => row.id), [child.id]);
    assert.equal(view.children[0].controls.prompt.enabled, false);
    assert.deepEqual(view.children[0].controls.prompt, { enabled: false, reason: "role-disabled" });
    assert.equal(view.children[0].evidence?.mode, "legacy-conservative");
    assert.deepEqual(view.children[0].evidence?.limitations, [{ field: "git-write", code: "missing-evidence", effect: "capability-denied" }]);
    assert.equal(view.children[0].evidence?.originalAdmissionEpoch, undefined);
    assert.equal(view.children[0].invocation, undefined);
    const before = accepted(child).length;
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: f.request(root, child.id, "disabled") }), refused("disabled", "role-disabled"));
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: f.request(root, foreign.childId, "foreign") }), refused("not-owned"));
    assert.equal(accepted(child).length, before);
    f.setRoleEnabled(true);
    const second = await f.start(child);
    const tree = await f.invoke("descendants", { sessionId: root.id }) as RoleControlDescendantsSnapshot;
    const nested = tree.descendants.find(entry => entry.kind === "child" && entry.child.id === second.childId);
    assert.ok(nested?.kind === "child");
    assert.equal(nested.depth, 2); assert.deepEqual(nested.child.controls.prompt, { enabled: false, reason: "not-direct-child" });
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: f.request(root, second.childId, "not adjacent") }), refused("not-owned"));
  } finally { held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("native child label truncation preserves Unicode and control sanitization through both Gateway queries", { timeout: 20000 }, async t => {
  const f = await controlDeliveryFixture();
  const held = gate(); f.adapter.beforeStream = () => held.promise;
  try {
    const root = await f.create();
    const cases = [
      { label: "a".repeat(118) + "😀", expected: "a".repeat(118) + "😀" },
      { label: "a".repeat(119) + "😀", expected: "a".repeat(119) },
      { label: "a".repeat(119) + "\nmore", expected: "a".repeat(119) + " " },
    ];
    const children: (typeof cases[number] & { id: typeof root.id })[] = [];
    for (const item of cases) {
      const child = await f.runtime.startActivation({ provider: "spawn", label: item.label, delivery: "caller", signal: new AbortController().signal,
        request: { parent: root, maxDepth: 3, prompt: [{ type: "text", text: "native label boundary task" }] } });
      children.push({ ...item, id: child.childId });
    }
    for (const method of ["describe", "descendants"] as const) await t.test(method, async () => {
      const result = await f.invoke(method, { sessionId: root.id }) as ChildSessionSnapshot | RoleControlDescendantsSnapshot;
      const rows = "children" in result ? result.children : result.descendants.flatMap(entry => entry.kind === "child" ? [entry.child] : []);
      assert.equal(result.sessionId, root.id); assert.equal(result.admissionEpoch, f.admissions.get(root)!.epoch);
      assert.deepEqual(rows.map(row => row.id), children.map(child => child.id));
      for (const child of children) {
        const row = rows.find(row => row.id === child.id)!;
        assert.equal(row.label, child.expected); assert.ok(row.label!.length <= 120);
        assert.equal(row.parentSessionId, root.id); assert.equal(row.mode, "continuable");
        assert.equal(row.controls.prompt.enabled, true); assert.equal(row.invocation?.childId, child.id);
        assert.equal(row.evidence?.mode, "captured");
      }
      const codec = ROLE_CONTROL_REMOTE.descriptors.find(entry => entry.method === method)!.result;
      if (codec.mode !== "strict") throw new Error("strict result codec required");
      const invalidRow = { ...rows[0], label: "a".repeat(119) + "\ud83d" };
      const invalid = "children" in result ? { ...result, children: [invalidRow] }
        : { ...result, descendants: [{ kind: "child", depth: 1, hasChildren: false, child: invalidRow }] };
      assert.throws(() => codec.create().parse(invalid), "unpaired surrogates remain invalid on the wire");
      const operator = f.ctx.connection.browserPeer;
      await assert.rejects(f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method, args: { sessionId: root.id },
        peer: { ...operator, async dispose() {} } }), refused("not-owned"));
    });
    f.setRoleEnabled(false);
    const child = f.ctx.agents.get(children[1].id)!;
    const before = accepted(child).length;
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: f.request(root, child.id, "role remains disabled") }), refused("disabled", "role-disabled"));
    assert.equal(accepted(child).length, before);
  } finally { held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("C3 real native prompt receipts retain browser request identity, queue/steer/image and interrupt is only an acknowledgement", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture(true);
  const held = gate(); f.adapter.beforeStream = () => held.promise;
  try {
    const root = await f.create(), first = await f.start(root), child = f.ctx.agents.get(first.childId)!;
    const png = await nativePng();
    for (const delivery of ["queue", "steer"] as const) {
      const request = { ...f.request(root, child.id, `browser ${delivery}`, delivery), clientTimeZone: "UTC", content: [{ type: "text" as const, text: `browser ${delivery}` }, { type: "image" as const, mediaType: "image/png" as const, data: png }] };
      const receipt = await f.invoke("prompt", { sessionId: root.id, request }) as { messageId: string };
      const message = accepted(child).find(message => message.id === receipt.messageId)!;
      assert.ok(message); assert.equal(message.content[1].type, "image");
      assert.ok((delivery === "queue" ? child.inbox.nextTurn : child.inbox.nextStep).some(message => message.id === receipt.messageId));
      assert.match(JSON.stringify(message.source), new RegExp(request.requestId));
      assert.doesNotMatch(JSON.stringify(message.source), /agent-message/u);
    }
    const before = accepted(child).length;
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: { ...f.request(root, child.id, "invalid image"), content: [{ type: "image", mediaType: "image/png", data: "bad bytes" }] } }), refused("invalid-content"));
    assert.equal(accepted(child).length, before);
    const queued = child.inbox.nextTurn.map(message => message.id);
    assert.deepEqual(await f.invoke("interrupt", { sessionId: root.id, request: { parentSessionId: root.id, childSessionId: child.id, mode: "continuable" } }), { accepted: true });
    assert.deepEqual(child.inbox.nextTurn.map(message => message.id), queued);
  } finally { held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("C3 pending child observation is cancelled by Apply, Connection replacement, operator and RPC disposal with zero acceptance", { timeout: 30000 }, async t => {
  for (const change of ["Apply", "connection", "operator", "RPC"] as const) await t.test(change, async () => {
    const f = await controlDeliveryFixture();
    const held = gate(), streaming = gate(), entered = gate(), release = gate(); f.adapter.beforeStream = () => { streaming.release(); return held.promise; };
    try {
      const root = await f.create(), first = await f.start(root), child = f.ctx.agents.get(first.childId)!;
      await streaming.promise;
      const before = accepted(child).length;
      f.setBeforeObserve(async () => { entered.release(); await release.promise; });
      const pending = f.invoke("prompt", { sessionId: root.id, request: f.request(root, child.id, "pending") });
      const rejected = assert.rejects(pending, refused("cancelled"));
      await entered.promise;
      if (change === "Apply") f.publish(root, false);
      else if (change === "connection") await f.replaceConnection();
      else if (change === "operator") await f.connectionOwner().browserPeer.dispose();
      else await f.rpc.dispose();
      release.release(); await rejected;
      assert.equal(accepted(child).length, before);
      assert.equal(f.adapter.calls[0].signal?.aborted, false, "already running turn is retained");
    } finally { release.release(); held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
  });
});

test("native text receipts survive post-acceptance Apply; accepted queue and old running task remain, catalog reads never warm a child", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture();
  const held = gate(), streaming = gate(); f.adapter.beforeStream = () => { streaming.release(); return held.promise; };
  const originalPrompt = f.runtime.prompt;
  try {
    const root = await f.create(), first = await f.start(root), child = f.ctx.agents.get(first.childId)!;
    await streaming.promise;
    f.runtime.prompt = async function (request, signal) {
      const receipt = await originalPrompt.call(this, request, signal);
      f.publish(root, false);
      return receipt;
    };
    const request = { ...f.request(root, child.id, "accepted browser text"), clientTimeZone: "UTC" };
    const receipt = await f.invoke("prompt", { sessionId: root.id, request }) as { messageId: string };
    assert.ok(child.inbox.nextTurn.some(message => message.id === receipt.messageId));
    const message = accepted(child).find(message => message.id === receipt.messageId)!;
    assert.ok(message); assert.match(JSON.stringify(message.source), new RegExp(request.requestId));
    assert.equal(f.adapter.calls[0].signal?.aborted, false);
    const before = accepted(child).length;
    await assert.rejects(f.invoke("prompt", { sessionId: root.id, request: f.request(root, child.id, "later denied") }), refused("not-owned"));
    assert.equal(accepted(child).length, before);
    f.runtime.prompt = originalPrompt;
    held.release(); f.adapter.beforeStream = undefined;
    await f.runtime.drainChildren(root, [child.id]);
    await f.ctx.sessionPersistence.flush();
    assert.equal(f.ctx.agents.get(child.id), undefined);
    const size = f.ctx.agents.list().length;
    const view = await f.invoke("describe", { sessionId: root.id }) as ChildSessionSnapshot;
    assert.equal(view.children[0].id, child.id); assert.equal(view.children[0].activity, "inactive");
    assert.equal(f.ctx.agents.list().length, size);
  } finally { f.runtime.prompt = originalPrompt; held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("C3 native image capability await is still fenced inside original prompt: Apply cannot accept a late message", { timeout: 20000 }, async () => {
  const f = await controlDeliveryFixture(true);
  const held = gate(), entered = gate(), release = gate(); f.adapter.beforeStream = () => held.promise;
  const resolve = f.ctx.llm.resolveModelInfo.bind(f.ctx.llm);
  try {
    const root = await f.create(), first = await f.start(root), child = f.ctx.agents.get(first.childId)!;
    const before = accepted(child).length, png = await nativePng();
    f.ctx.llm.resolveModelInfo = async (provider, model, signal) => { entered.release(); await release.promise; return resolve(provider, model, signal); };
    const pending = f.invoke("prompt", { sessionId: root.id, request: { ...f.request(root, child.id, "image fence"), content: [{ type: "image", mediaType: "image/png", data: png }] } });
    const rejected = assert.rejects(pending, refused("cancelled"));
    await entered.promise; f.publish(root, false); release.release(); await rejected;
    assert.equal(accepted(child).length, before);
  } finally { f.ctx.llm.resolveModelInfo = resolve; release.release(); held.release(); f.adapter.beforeStream = undefined; await f.dispose(); }
});

test("C3 foreground control hands the same native run to one job, reports max/actual route, never revives a one-shot", { timeout: 20000 }, async () => {
  const f = await controlRunFixture();
  try {
    const { holder, caller } = f.start();
    await holder.ready; await f.adapter.entered.promise;
    const view = await f.invoke("describe", { sessionId: f.parent.id }) as ChildSessionSnapshot;
    assert.equal(view.runs[0].invocation?.runId, holder.invocation!.runId);
    assert.equal(view.runs[0].invocation?.level, "max"); assert.equal(view.runs[0].invocation?.route?.model, "native");
    const request = { sessionId: f.parent.id, toolCallId: holder.toolCallId, runId: holder.invocation!.runId, expectedAdmissionEpoch: f.admissions.get(f.parent)!.epoch };
    const receipt = await f.invoke("background", { sessionId: f.parent.id, request }) as BackgroundTransitionResult;
    const repeated = await f.invoke("background", { sessionId: f.parent.id, request }) as BackgroundTransitionResult;
    assert.equal(receipt.status, "background"); assert.equal(repeated.status, "already-background"); assert.equal(receipt.jobId, repeated.jobId);
    caller.abort(); assert.equal(holder.holderSignal.aborted, false);
    f.adapter.output.release();
    assert.equal((await f.ctx.jobs.wait(receipt.jobId as Parameters<typeof f.ctx.jobs.wait>[0], 5000, f.parent.id)).status, "completed");
    await holder.drained;
    assert.deepEqual(f.counters, { starts: 1, children: 1, resultReads: 1, disposals: 1 });
    const ended = await f.invoke("describe", { sessionId: f.parent.id }) as ChildSessionSnapshot;
    assert.equal(ended.children[0].mode, "one-shot"); assert.equal(ended.children[0].readonly, true);
    await assert.rejects(f.invoke("prompt", { sessionId: f.parent.id, request: { requestId: "new-message", parentSessionId: f.parent.id, childSessionId: holder.invocation!.childId, mode: "continuable", delivery: "queue", content: [{ type: "text", text: "cannot revive" }] } }), refused("not-resumable"));
    assert.equal(f.counters.starts, 1);
  } finally { await f.dispose(); }
});

test("C3 starting observation omits run identity; foreign/stale runs cannot create jobs", { timeout: 20000 }, async () => {
  const f = await controlRunFixture();
  const entered = gate(), release = gate();
  try {
    const run = f.start({ async start(signal) { entered.release(); await release.promise; return f.runtime.startActivation({ provider: "spawn", label: "Native control", delivery: "caller", signal, request: { parent: f.parent, prompt: [{ type: "text", text: "native" }] } }); } });
    await entered.promise;
    const view = await f.invoke("describe", { sessionId: f.parent.id }) as ChildSessionSnapshot;
    assert.equal(view.runs[0].state, "starting"); assert.equal(view.runs[0].invocation, undefined);
    release.release(); await run.holder.ready;
    const request = { sessionId: f.parent.id, toolCallId: run.holder.toolCallId, runId: run.holder.invocation!.runId, expectedAdmissionEpoch: f.admissions.get(f.parent)!.epoch };
    await assert.rejects(f.invoke("background", { sessionId: f.parent.id, request: { ...request, runId: "other-run" } }), refused("not-found"));
    await assert.rejects(f.invoke("background", { sessionId: f.parent.id, request: { ...request, expectedAdmissionEpoch: newEpoch() } }), refused("conflict"));
    const foreignParent = await f.create(), previous = f.admissions.get(foreignParent)!;
    const foreignAdmission = { epoch: newEpoch(), permitted: true };
    f.runtime.authority.prepareParentAdmission(foreignParent, previous.epoch, foreignAdmission);
    f.runtime.authority.publishParentAdmission(foreignParent, previous.epoch, foreignAdmission, () => f.admissions.set(foreignParent, foreignAdmission));
    await assert.rejects(f.invoke("background", { sessionId: foreignParent.id,
      request: { ...request, sessionId: foreignParent.id, expectedAdmissionEpoch: foreignAdmission.epoch } }), refused("not-found"));
    const operator = f.ctx.connection.browserPeer;
    await assert.rejects(f.ctx.typertGateway.invoke({ namespace: "dsmmChildren", method: "background", args: { sessionId: f.parent.id, request }, peer: { ...operator, async dispose() {} } }), refused("not-owned"));
    assert.equal(f.ctx.jobs.list(f.parent.id).length, 0);
    f.adapter.output.release(); await run.holder.drained;
  } finally { release.release(); f.adapter.output.release(); await f.dispose(); }
});

test("C3 asynchronous handoff preparation cannot create a job after Apply/connection/operator/RPC disposal", { timeout: 30000 }, async t => {
  for (const change of ["Apply", "connection", "operator", "RPC"] as const) await t.test(change, async () => {
    const f = await controlRunFixture();
    const entered = gate(), release = gate();
    try {
      const { holder } = f.start(); await holder.ready; await f.adapter.entered.promise;
      const request = { sessionId: f.parent.id, toolCallId: holder.toolCallId, runId: holder.invocation!.runId, expectedAdmissionEpoch: f.admissions.get(f.parent)!.epoch };
      f.setBeforeBackground(async () => { entered.release(); await release.promise; });
      const pending = f.invoke("background", { sessionId: f.parent.id, request });
      const rejected = assert.rejects(pending, refused("cancelled"));
      await entered.promise;
      if (change === "Apply") f.publish();
      else if (change === "connection") await f.replaceConnection();
      else if (change === "operator") await f.ctx.connection.browserPeer.dispose();
      else await f.rpc.dispose();
      release.release(); await rejected;
      assert.equal(f.ctx.jobs.list(f.parent.id).length, 0); assert.equal(holder.holderSignal.aborted, false);
      f.adapter.output.release(); await holder.drained;
    } finally { release.release(); f.adapter.output.release(); await f.dispose(); }
  });
});

test("native job registration wins before Apply and C3 returns the accepted handoff", { timeout: 20000 }, async () => {
  const f = await controlRunFixture();
  try {
    const first = f.start(); await first.holder.ready; await f.adapter.entered.promise;
    const request = { sessionId: f.parent.id, toolCallId: first.holder.toolCallId, runId: first.holder.invocation!.runId, expectedAdmissionEpoch: f.admissions.get(f.parent)!.epoch };
    const detach = f.ctx.jobs.events.subscribe({ owners: "scope" }, event => { if (event.type === "registered") f.publish(); });
    const receipt = await f.invoke("background", { sessionId: f.parent.id, request }) as BackgroundTransitionResult;
    detach(); assert.equal(receipt.status, "background"); assert.ok(receipt.jobId);
    assert.equal(first.holder.holderSignal.aborted, false);
    f.adapter.output.release(); await first.holder.drained;
    assert.equal((await f.ctx.jobs.wait(receipt.jobId as Parameters<typeof f.ctx.jobs.wait>[0], 5000, f.parent.id)).status, "completed");
  } finally { f.adapter.output.release(); await f.dispose(); }
});

test("settlement during background preparation is observation only", { timeout: 20000 }, async t => {
  const settled = await controlRunFixture();
  const entered = gate(), release = gate(), disposing = gate(), finishDisposal = gate();
  try {
    const started = settled.start(), startNative = started.request.start;
    started.request.start = async signal => {
      const activation = await startNative(signal), dispose = activation.dispose.bind(activation);
      t.mock.method(activation, "dispose", async () => { disposing.release(); await finishDisposal.promise; await dispose(); });
      return activation;
    };
    const { holder } = started;
    await holder.ready; await settled.adapter.entered.promise;
    const request = { sessionId: settled.parent.id, toolCallId: holder.toolCallId, runId: holder.invocation!.runId, expectedAdmissionEpoch: settled.admissions.get(settled.parent)!.epoch };
    settled.setBeforeBackground(async () => { entered.release(); await release.promise; });
    const pending = settled.invoke("background", { sessionId: settled.parent.id, request });
    await entered.promise;
    settled.adapter.output.release(); await disposing.promise;
    assert.equal(holder.state, "settled");
    release.release(); assert.deepEqual(await pending, { status: "already-settled", runId: request.runId });
    assert.equal(settled.ctx.jobs.list(settled.parent.id).length, 0);
    finishDisposal.release(); await holder.drained;
  } finally { release.release(); finishDisposal.release(); settled.adapter.output.release(); await settled.dispose(); }
});
