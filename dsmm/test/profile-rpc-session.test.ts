import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import type { Service } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import * as NativeConnection from "@deepseek-ai/dsh-client-connection";
import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { TYPERT_REMOTE } from "../lib/profile-remote.js";
import { registerProfilesRpc } from "../lib/profile-rpc.js";
import { ProfileStore } from "../lib/profile-store.js";
import { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import type { DsmmProfileRuntimeOptions } from "../lib/profile-runtime.js";
import { resolveConfig } from "../lib/settings.js";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import type { SessionProfileSelectRequest, SessionProfileSnapshot } from "../lib/profile-types.js";
import { DsmmDeploymentConfig } from "../lib/deployment-config.js";
import type { GlobalConfigSnapshot } from "../lib/deployment-config.js";

const require = createRequire(import.meta.url);
const nativeRequire = createRequire(require.resolve("@deepseek-ai/dsh-client-connection/package.json"));
const { CredentialProvider } = nativeRequire("@deepseek-ai/dsh-credentials") as { CredentialProvider: new (ctx: Context) => Service };

/** Fresh native signing records stay solely in memory; no user/auth files exist. */
class MemoryCredentials extends CredentialProvider {
  private readonly records = new Map<string, unknown>();
  async modifyRecord(key: string, modify: (current: unknown) => Promise<unknown>): Promise<unknown> {
    const next = await modify(this.records.get(key));
    if (next !== undefined) this.records.set(key, next);
    return this.records.get(key);
  }
}

async function fixture(nativeConnection = true, options?: DsmmProfileRuntimeOptions, globalConfig = false) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-scoped-rpc-"));
  const ctx = new Context();
  try {
    await Promise.all([ctx.plugin(TypertRegistry).await(), ctx.plugin(TypertGatewayService, {}).await(), ctx.plugin(AgentRegistry).await()]);
    if (nativeConnection) {
      await ctx.plugin(MemoryCredentials).await();
    }
    const connectionFiber = nativeConnection ? ctx.plugin(NativeConnection) : undefined;
    await connectionFiber?.await();
    const store = new ProfileStore(join(root, "dsmm-profiles"));
    const runtime = new DsmmProfileRuntime(ctx as unknown as DshContext, resolveConfig(), store, options);
    await runtime.initialize();
    const carrier = { host: "127.0.0.1" }, settingsAuthority = { writable: true };
    let deployment: DsmmDeploymentConfig | undefined;
    if (globalConfig) {
      ctx.provide("profileContext", { home: root, dir: root });
      ctx.provide("webServer", carrier); ctx.provide("settings", settingsAuthority);
      deployment = new DsmmDeploymentConfig(ctx as unknown as DshContext, {});
    }
    const rpc = ctx.plugin({ name: "session-profile-rpc", inject: ["typert"], apply(ready: Context) { registerProfilesRpc(ready, runtime, deployment); } });
    await rpc.await();
    const gateway = ctx.typertGateway;
    const invoke = <T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => gateway.invoke({ namespace: "dsmmProfiles", method, args, ...(signal === undefined ? {} : { signal }) }) as Promise<T>;
    // Session/registry/Gateway/Connection/store are native. This lightweight
    // maintenance callback is a backend contract seam, not native-loop proof.
    const createRoot = async (id: string, origin?: "subagent") => {
      const initial = Session.create(SessionId(id));
      const session = origin === undefined ? initial : Session.create(initial.id, [], { ...initial.header, origin });
      let maintenance = false;
      const agent: DshAgent = { id: session.id, session: session as unknown as DshAgent["session"], ctx: ctx as unknown as DshContext, status: "idle", runMaintenance(task) {
        if (maintenance || this.status === "running") throw new Error("maintenance is not available");
        maintenance = true;
        return task(new AbortController().signal).finally(() => { maintenance = false; });
      } };
      await ctx.agents.register(agent as unknown as Agent);
      return agent;
    };
    return { root, ctx, gateway, runtime, store, rpc, connectionFiber, invoke, createRoot, deployment, carrier, settingsAuthority, async dispose() { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); } };
  } catch (error) { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); throw error; }
}

function refused(code: string) {
  return (error: unknown) => {
    const remote = remoteErrorOf(error);
    return remote?.code === "dsmm-profiles/refused" && remote.details.code === code;
  };
}

function selectRequest(snapshot: SessionProfileSnapshot, id: string | null, revision?: string): SessionProfileSelectRequest {
  return { sessionId: snapshot.sessionId, id, ...(revision === undefined ? {} : { expectedRevision: revision }), expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch };
}

function modeRequest(snapshot: SessionProfileSnapshot, active: boolean) {
  return { sessionId: snapshot.sessionId, active, expectedModeRevision: snapshot.deepwork!.revision, expectedAdmissionEpoch: snapshot.admissionEpoch };
}

test("fixed global backend through native Gateway requires operator plus trusted local/writable carrier and rejects arbitrary roots", async () => {
  const f = await fixture(true, undefined, true);
  try {
    // Carrier bind/writability are a public authority seam; the operator, Gateway,
    // strict codec and backend are real native services, not a fake invocation.
    const invoke = (request: unknown, peer?: Parameters<typeof f.gateway.invoke>[0]["peer"]) => f.gateway.invoke({ namespace: "dsmmConfig", method: "save", args: { request }, ...(peer === undefined ? {} : { peer }) }) as Promise<GlobalConfigSnapshot>;
    const request = { expectedRevision: "absent", edits: [{ op: "set", path: ["defaultActive"], value: true }] };
    const peer = f.ctx.connection.operator;
    const impostor = { id: peer.id, ctx: new Context(), async dispose() {} };
    await assert.rejects(invoke(request, impostor), refused("not-owned"));
    f.carrier.host = "0.0.0.0"; await assert.rejects(invoke(request), refused("not-owned"));
    f.carrier.host = "127.0.0.1"; f.settingsAuthority.writable = false;
    await assert.rejects(invoke(request), refused("not-owned")); f.settingsAuthority.writable = true;
    await assert.rejects(invoke({ ...request, root: f.root }), (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/input-invalid");
    const pointer = await readFile(join(f.store.stateDir, ".selection.json")).catch(() => null);
    const saved = await invoke(request);
    assert.equal(saved.config.defaultActive, true);
    assert.deepEqual(await readFile(join(f.store.stateDir, ".selection.json")).catch(() => null), pointer);
    await assert.rejects(invoke(request), refused("conflict"));
    const exact = await invoke({ expectedRevision: saved.revision, edits: [{ op: "set", path: ["workflow", "reviewCap"], value: 0 }] });
    assert.equal(exact.config.defaultActive, true); assert.equal(exact.config.workflow?.reviewCap, 0);
    await assert.rejects(invoke({ expectedRevision: exact.revision, edits: [{ op: "unset", path: ["arbitraryPath"] }] }), refused("validation"));
  } finally { await f.dispose(); }
});

test("strict additive mode codecs reject unknown fields and retain old optional snapshot compatibility", () => {
  const descriptor = TYPERT_REMOTE.descriptors.find((row) => row.method === "selectMode")!;
  const requestCodec = descriptor.parameters[1].codec, resultCodec = descriptor.result;
  assert.equal(requestCodec.mode, "strict"); assert.equal(resultCodec.mode, "strict");
  if (requestCodec.mode !== "strict" || resultCodec.mode !== "strict") return;
  const request = { sessionId: "ordinary-mode", active: false, expectedModeRevision: "a".repeat(64), expectedAdmissionEpoch: "b".repeat(64) };
  assert.deepEqual(requestCodec.create().parse(request), request);
  for (const invalid of [{ ...request, active: "false" }, { ...request, peer: "private" }, { ...request, expectedModeRevision: "absent" }, { ...request, expectedAdmissionEpoch: "old" }]) assert.throws(() => requestCodec.create().parse(invalid));
  const snapshot = { sessionId: request.sessionId, globalDefault: { selectedId: null, appliedRevision: null, selectionRevision: "absent" }, selection: { selectedId: null, appliedRevision: null, selectionRevision: "absent" }, scope: "global-default", admissionEpoch: request.expectedAdmissionEpoch, switchAllowed: true };
  assert.deepEqual(resultCodec.create().parse(snapshot), snapshot);
  const mode = { active: false, explicit: false, locked: false, revision: request.expectedModeRevision };
  assert.deepEqual(resultCodec.create().parse({ ...snapshot, deepwork: mode }), { ...snapshot, deepwork: mode });
  for (const invalid of [{ ...mode, active: "true" }, { ...mode, secret: true }, { ...mode, revision: "absent" }]) assert.throws(() => resultCodec.create().parse({ ...snapshot, deepwork: invalid }));
});

test("native mode RPC changes only the owned root, preserves profile epoch/global and rejects stale mode intent", async () => {
  const f = await fixture();
  try {
    const a = await f.createRoot("mode-rpc-a"), b = await f.createRoot("mode-rpc-b");
    const before = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: a.id });
    const other = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: b.id });
    const global = await f.runtime.describe();
    const request = modeRequest(before, true);
    const selected = await f.invoke<SessionProfileSnapshot>("selectMode", { sessionId: a.id, request });
    assert.equal(selected.deepwork!.active, true); assert.equal(selected.deepwork!.explicit, true);
    assert.equal(selected.admissionEpoch, before.admissionEpoch); assert.deepEqual(selected.selection, before.selection);
    assert.notEqual(selected.deepwork!.revision, before.deepwork!.revision);
    assert.deepEqual(await f.runtime.describe(), global); assert.deepEqual(await f.runtime.getSession(b), other);
    await assert.rejects(f.invoke("selectMode", { sessionId: a.id, request }), refused("conflict"));
    const operator = f.ctx.connection.operator;
    const wrongPeer = { id: operator.id, ctx: new Context(), async dispose() {} };
    await assert.rejects(f.gateway.invoke({ namespace: "dsmmProfiles", method: "selectMode", args: { sessionId: a.id, request: modeRequest(selected, false) }, peer: wrongPeer }), refused("not-owned"));
    await assert.rejects(f.invoke("selectMode", { sessionId: b.id, request: modeRequest(selected, false) }), refused("validation"));
    const child = await f.createRoot("mode-rpc-child", "subagent");
    await assert.rejects(f.invoke("selectMode", { sessionId: child.id, request: { ...modeRequest(selected, false), sessionId: child.id } }), refused("not-owned"));
    const off = await f.invoke<SessionProfileSnapshot>("selectMode", { sessionId: a.id, request: modeRequest(selected, false) });
    assert.equal(off.deepwork!.active, false); assert.equal(off.deepwork!.explicit, true);
  } finally { await f.dispose(); }
});

test("mode RPC rejects busy, cancellation, unowned cold lookups and malformed input before writes", async () => {
  const f = await fixture();
  try {
    const agent = await f.createRoot("mode-rpc-busy");
    const before = await f.runtime.getSession(agent), request = modeRequest(before, true);
    Object.defineProperty(agent, "status", { value: "running", configurable: true });
    await assert.rejects(f.invoke("selectMode", { sessionId: agent.id, request }), refused("busy"));
    Object.defineProperty(agent, "status", { value: "idle", configurable: true });
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(f.invoke("selectMode", { sessionId: agent.id, request }, cancelled.signal));
    let resumes = 0;
    f.ctx.provide("sessionController", { async resolveAgent() { resumes++; throw new Error("PRIVATE_RESUME"); } });
    const cold = { ...request, sessionId: "cold-mode" };
    for (const invalid of [{ ...cold, peer: true }, { ...cold, active: "true" }, { ...cold, expectedModeRevision: "bad" }]) {
      await assert.rejects(f.invoke("selectMode", { sessionId: "cold-mode", request: invalid }));
    }
    const operator = f.ctx.connection.operator;
    await assert.rejects(f.gateway.invoke({ namespace: "dsmmProfiles", method: "selectMode", args: { sessionId: "cold-mode", request: cold }, peer: { id: operator.id, ctx: new Context(), async dispose() {} } }), refused("not-owned"));
    assert.equal(resumes, 0); assert.deepEqual(await f.runtime.getSession(agent), before);
  } finally { await f.dispose(); }
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

test("additive session descriptors are strict and carry no caller-supplied authority", () => {
  const describe = TYPERT_REMOTE.descriptors.find((entry) => entry.method === "describeSession")!;
  const select = TYPERT_REMOTE.descriptors.find((entry) => entry.method === "selectSession")!;
  assert.deepEqual(describe.parameters.map(({ name, wire, source }) => ({ name, wire, source })), [{ name: "sessionId", wire: "sessionId", source: "json" }]);
  assert.deepEqual(select.parameters.map(({ name, wire, source }) => ({ name, wire, source })), [{ name: "sessionId", wire: "sessionId", source: "json" }, { name: "request", wire: "request", source: "json" }]);
  for (const entry of [describe, select]) {
    assert.equal(entry.result.mode, "strict");
    for (const parameter of entry.parameters) assert.equal(parameter.codec.mode, "strict");
  }
  const grammar = select.parameters[1].codec;
  assert.equal(grammar.mode, "strict");
  if (grammar.mode !== "strict") return;
  const valid = { sessionId: "native-session", id: null, expectedSelectionRevision: "absent", expectedAdmissionEpoch: "a".repeat(64) };
  assert.deepEqual(grammar.create().parse(valid), valid);
  for (const request of [
    { ...valid, agent: {} }, { ...valid, peer: {} }, { ...valid, path: "C:/private" }, { ...valid, owner: true },
    { ...valid, expectedAdmissionEpoch: "old" }, { ...valid, expectedAdmissionEpoch: "a".repeat(65) },
    { ...valid, sessionId: "" }, { ...valid, sessionId: "a".repeat(257) }, { ...valid, sessionId: "a\0b" }, { ...valid, sessionId: "\uD800" },
    { ...valid, id: "a" }, { ...valid, id: null, expectedRevision: "b".repeat(64) },
    { ...valid, expectedSelectionRevision: "unavailable" },
  ]) assert.throws(() => grammar.create().parse(request));
  const result = describe.result;
  if (result.mode !== "strict") return;
  const selection = { selectedId: null, appliedRevision: null, selectionRevision: "absent" };
  const snapshot = { sessionId: "native-session", globalDefault: selection, selection, scope: "global-default", admissionEpoch: "a".repeat(64), switchAllowed: true };
  assert.deepEqual(result.create().parse(snapshot), snapshot);
  for (const invalid of [{ ...snapshot, credentials: {} }, { ...snapshot, admissionEpoch: "unavailable" }, { ...snapshot, selection: { ...selection, path: "secret" } }, { ...snapshot, switchAllowed: "yes" }, { ...snapshot, scope: ["global-default"] }]) assert.throws(() => result.create().parse(invalid));
  const rateLimit = { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 10000, maxTotalDelayMs: 30000, switchAfterRateLimits: 3, maxSwitches: 2 };
  const policy = { role: "dsmm-planner", strategy: "startup-lock", rateLimit, retries: 0, rateLimitFailures: 0, switches: 0, totalDelayMs: 0, route: { provider: "manual-route", model: "m".repeat(512), reasoningEffort: "high" } };
  assert.deepEqual(result.create().parse({ ...snapshot, rolePolicy: policy }), { ...snapshot, rolePolicy: policy });
  assert.deepEqual(result.create().parse({ ...snapshot, profileModel: policy.route }), { ...snapshot, profileModel: policy.route });
  assert.deepEqual(result.create().parse({ ...snapshot, profileModel: { provider: "manual-provider", model: "manual/model" } }), { ...snapshot, profileModel: { provider: "manual-provider", model: "manual/model" } });
  for (const invalid of [
    null, { provider: "fixture", model: "model", auth: "hidden" }, { provider: "fixture", model: "model", nextModelRoute: {} },
    { provider: "https://private", model: "model" }, { provider: "fixture", model: "https://private" },
    { provider: "p".repeat(129), model: "model" }, { provider: "fixture", model: "m".repeat(513) },
    { provider: "fixture", model: "model", reasoningEffort: "e".repeat(65) }, { provider: "fixture", model: "model", reasoningEffort: "" },
    { provider: "fixture", model: "bad\0model" }, { provider: "fixture", model: "\uD800" },
  ]) assert.throws(() => result.create().parse({ ...snapshot, profileModel: invalid }));
  for (const invalid of [
    { ...policy, credentials: {} }, { ...policy, role: "not-a-dw-role" }, { ...policy, retries: Infinity }, { ...policy, switches: 11 },
    { ...policy, rateLimit: { ...rateLimit, maxRetries: -1 } }, { ...policy, rateLimit: { ...rateLimit, peer: true } },
    { ...policy, route: { provider: "https://secret-provider", model: "m" } },
    { ...policy, route: { provider: "native-provider", model: "https://credential-bearing-model" } },
  ]) assert.throws(() => result.create().parse({ ...snapshot, rolePolicy: invalid }));
});

test("native operator scoped selection preserves another root and the global pointer; stale CAS/epoch refuses", async () => {
  const f = await fixture();
  try {
    const a = await f.createRoot("rpc-root-a");
    const b = await f.createRoot("rpc-root-b");
    const draft = await f.store.save({ id: "focused", content: '{"version":1,"id":"focused","settings":{"workflow":{"reviewCap":4}}}', expectedRevision: null });
    const beforeA = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: a.id });
    const beforeB = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: b.id });
    const global = await f.runtime.describe();
    const request = selectRequest(beforeA, draft.id, draft.revision);
    const selected = await f.invoke<SessionProfileSnapshot>("selectSession", { sessionId: a.id, request });
    assert.equal(selected.scope, "session-override");
    assert.equal(selected.selection.selectedId, "focused");
    assert.notEqual(selected.admissionEpoch, beforeA.admissionEpoch);
    assert.equal(f.runtime.getSettings(a).workflow.reviewCap, 4);
    assert.equal(f.runtime.getSettings(b).workflow.reviewCap, resolveConfig().workflow.reviewCap);
    assert.deepEqual(await f.invoke("describeSession", { sessionId: b.id }), beforeB);
    assert.deepEqual(await f.runtime.describe(), global);
    await assert.rejects(access(join(f.store.profileDir, ".selection.json")), { code: "ENOENT" });
    await assert.rejects(f.invoke("selectSession", { sessionId: a.id, request }), refused("conflict"));
    await assert.rejects(f.invoke("selectSession", { sessionId: a.id, request: { ...selectRequest(selected, null), expectedAdmissionEpoch: beforeA.admissionEpoch } }), refused("conflict"));
    const reset = await f.invoke<SessionProfileSnapshot>("selectSession", { sessionId: a.id, request: selectRequest(selected, null) });
    assert.equal(reset.scope, "deployment-baseline");
    assert.equal(reset.selection.selectedId, null);
    assert.notEqual(reset.admissionEpoch, selected.admissionEpoch);
  } finally { await f.dispose(); }
});

test("bad peers and malformed payloads refuse before native cold-session authority or backend mutation", async () => {
  const f = await fixture();
  try {
    let resumes = 0;
    // A counting authority is used ONLY to prove it was never called by rejected
    // input. It is not offered as evidence of a supported native cold resume.
    f.ctx.provide("sessionController", { async resolveAgent() { resumes++; throw new Error("PRIVATE_RESUME_SENTINEL"); } });
    const request = { sessionId: "cold-root", id: null, expectedSelectionRevision: "absent", expectedAdmissionEpoch: "a".repeat(64) };
    const operator = f.ctx.connection.operator;
    const wrongPeer = { id: operator.id, ctx: new Context(), async dispose() {} };
    await assert.rejects(f.gateway.invoke({ namespace: "dsmmProfiles", method: "selectSession", args: { sessionId: "cold-root", request }, peer: wrongPeer }), refused("not-owned"));
    await assert.rejects(f.invoke("selectSession", { sessionId: "other-root", request }), refused("validation"));
    for (const args of [
      { sessionId: "cold-root", request: { ...request, peer: operator.id } },
      { sessionId: "cold-root", request: { ...request, path: "C:/private" } },
      { sessionId: "cold-root", request: { ...request, expectedAdmissionEpoch: "bad" } },
      { sessionId: "cold-root", request: { ...request, id: "../bad", expectedRevision: "a".repeat(64) } },
      { sessionId: "a".repeat(257), request },
      { sessionId: "cold-root", request, agent: {} },
    ]) await assert.rejects(f.invoke("selectSession", args), (error: unknown) => ["gateway/input-invalid", "gateway/arguments-invalid"].includes(String(remoteErrorOf(error)?.code)));
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(f.invoke("selectSession", { sessionId: "cold-root", request }, cancelled.signal));
    assert.equal(resumes, 0);
    assert.deepEqual((await f.store.describe()).profiles, []);
    assert.equal((await f.store.loadSessionSelection("cold-root")).admissionEpoch, null);
  } finally { await f.dispose(); }
});

test("a Gateway fallback operator is not native Connection authority; global API remains intact", async () => {
  const f = await fixture(false);
  try {
    await f.createRoot("no-connection-root");
    await assert.rejects(f.invoke("describeSession", { sessionId: "no-connection-root" }), refused("not-owned"));
    const saved = await f.invoke<{ revision: string }>("save", { request: { id: "global", content: '{"version":1,"id":"global","settings":{}}', expectedRevision: null } });
    await f.invoke("select", { request: { id: "global", expectedRevision: saved.revision, expectedSelectionRevision: "absent" } });
    assert.equal((await f.runtime.describe()).selectedId, "global");
    assert.ok((await readFile(join(f.store.profileDir, ".selection.json"), "utf8")).includes("global"));
  } finally { await f.dispose(); }
});

test("scoped native RPC rejects subagent origin and exact runtime-owned children", async () => {
  const f = await fixture();
  try {
    const root = await f.createRoot("ordinary-owner");
    const origin = await f.createRoot("origin-child", "subagent");
    await assert.rejects(f.invoke("describeSession", { sessionId: origin.id }), refused("not-owned"));
    const session = Session.create(SessionId("runtime-owned-child"));
    const child = { id: session.id, session, ctx: f.ctx, status: "idle" } as unknown as Agent;
    const detach = f.ctx.agents.enter(child, root as unknown as Agent);
    await f.ctx.agents.announce(child, "startup");
    try { await assert.rejects(f.invoke("describeSession", { sessionId: child.id }), refused("not-owned")); }
    finally { detach(); }
    assert.equal((await f.store.loadSessionSelection(origin.id!)).admissionEpoch, null);
    assert.equal((await f.store.loadSessionSelection(child.id)).admissionEpoch, null);
  } finally { await f.dispose(); }
});

test("native cold-resume capability absence and withdrawn descriptors fail closed", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.invoke("describeSession", { sessionId: "unloaded-root" }), refused("unavailable"));
    assert.equal(f.ctx.agents.get(SessionId("unloaded-root")), undefined);
    await f.rpc.dispose();
    for (const method of ["describeSession", "selectSession"]) {
      assert.equal(f.ctx.typert.local.get(`dsmmProfiles/${method}`), undefined);
      assert.equal(f.ctx.typert.local.hasSeen(`dsmmProfiles/${method}`), true);
    }
    await assert.rejects(f.invoke("describeSession", { sessionId: "unloaded-root" }), (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/definition-unavailable");
  } finally { await f.dispose(); }
});

test("scoped RPC abort, service disposal and native Connection withdrawal fence paused validation before the durable commit", async () => {
  for (const cancelBy of ["request", "service", "connection"] as const) {
    const entered = gate();
    const releaseValidation = gate();
    const f = await fixture(true, { async validateCandidate() { entered.release(); await releaseValidation.promise; } });
    try {
      const agent = await f.createRoot(`cancel-${cancelBy}`);
      const draft = await f.store.save({ id: "paused", content: '{"version":1,"id":"paused","settings":{}}', expectedRevision: null });
      const before = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: agent.id });
      const signal = new AbortController();
      const pending = f.invoke<SessionProfileSnapshot>("selectSession", { sessionId: agent.id, request: selectRequest(before, draft.id, draft.revision) }, signal.signal);
      const refusal = assert.rejects(pending, cancelBy === "request" ? (error: unknown) => String(remoteErrorOf(error)?.code) === "gateway/cancelled" : refused(cancelBy === "connection" ? "not-owned" : "cancelled"));
      await entered.promise;
      if (cancelBy === "request") signal.abort();
      else if (cancelBy === "service") await f.rpc.dispose();
      else { assert.ok(f.connectionFiber); await f.connectionFiber.dispose(); assert.equal(signal.signal.aborted, false); }
      releaseValidation.release();
      await refusal;
      const retained = await f.runtime.getSession(agent);
      assert.equal(retained.admissionEpoch, before.admissionEpoch);
      assert.deepEqual(retained.selection, before.selection);
      assert.equal((await f.store.loadSessionSelection(agent.id!)).admissionEpoch, null);
      await assert.rejects(access(join(f.store.profileDir, ".selection.json")), { code: "ENOENT" });
    } finally { releaseValidation.release(); await f.dispose(); }
  }
});

test("scoped RPC refuses busy/foreign maintenance roots without queueing a profile switch", async () => {
  const f = await fixture();
  try {
    const agent = await f.createRoot("busy-root");
    const snapshot = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: agent.id });
    const request = selectRequest(snapshot, null);
    const status = Object.getOwnPropertyDescriptor(agent, "status")!;
    Object.defineProperty(agent, "status", { ...status, value: "running" });
    const busy = await f.invoke<SessionProfileSnapshot>("describeSession", { sessionId: agent.id });
    assert.equal(busy.switchAllowed, false);
    assert.equal(busy.switchUnavailableReason, "busy");
    await assert.rejects(f.invoke("selectSession", { sessionId: agent.id, request }), refused("busy"));
    Object.defineProperty(agent, "status", status);
    const blocked = gate();
    const maintenance = agent.runMaintenance!(() => blocked.promise);
    try { await assert.rejects(f.invoke("selectSession", { sessionId: agent.id, request }), refused("maintenance")); }
    finally { blocked.release(); await maintenance; }
    assert.equal((await f.store.loadSessionSelection(agent.id!)).admissionEpoch, null);
  } finally { await f.dispose(); }
});
