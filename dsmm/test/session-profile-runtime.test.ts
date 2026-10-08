import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionLogOffset } from "@deepseek-ai/dsh-session";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import { createProfileRuntime, DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { ProfileStore } from "../lib/profile-store.js";
import type { SessionProfileCommit } from "../lib/profile-store.js";
import { DsmmProfileError } from "../lib/profiles.js";
import type { DsmmProfileDocument } from "../lib/profiles.js";
import type { SessionProfileSelectRequest } from "../lib/profile-types.js";
import DsmmSessionPersistence from "../lib/session-persistence.js";
import { resolveConfig } from "../lib/settings.js";
import { headerRoutes, nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

const route = (model: string) => ({ provider: "fixture", model, reasoningEffort: "high" });
const profile = (id: string, model: string) => JSON.stringify({ version: 1, id, settings: { defaultActive: true,
  roleRouting: { "dsmm-orchestrator": { primary: route(model) }, "dsmm-reviewer": { primary: route(`${model}-review`) } } } });
const structural = (agent: Agent) => agent as unknown as DshAgent;
function runtimeOf(f: Awaited<ReturnType<typeof nativeRoutingFixture>>) { return f.ctx.get("dsmmProfileRuntime") as unknown as DsmmProfileRuntime; }
function centralStore(f: Awaited<ReturnType<typeof nativeRoutingFixture>>) {
  return ProfileStore.fromCentral(f.home, f.profileDir, runtimeOf(f).admission().deployment!.entryId);
}
async function request(runtime: DsmmProfileRuntime, agent: Agent, id: string | null, revision?: string): Promise<SessionProfileSelectRequest> {
  const state = await runtime.getSession(structural(agent));
  return { sessionId: agent.id, id, ...(revision === undefined ? {} : { expectedRevision: revision }), expectedSelectionRevision: state.selection.selectionRevision, expectedAdmissionEpoch: state.admissionEpoch };
}
function gate() { let release!: () => void; const promise = new Promise<void>((done) => { release = done; }); return { promise, release }; }
async function localRuntime(f: Awaited<ReturnType<typeof nativeRoutingFixture>>, validateCandidate: () => Promise<void>, lookup?: Map<string, DshAgent>) {
  const ctx: DshContext = { get(name) { return (name === "agents" ? { list: () => lookup === undefined ? f.agents.list() as unknown as DshAgent[] : [...lookup.values()], get: (id: string) => lookup === undefined ? structural(f.agents.get(SessionId(id))!) : lookup.get(id), isOwnedBy: (id: string, owner: DshAgent) => f.agents.isOwnedBy(SessionId(id), owner as unknown as Agent) } : f.ctx.get(name)) as never; } };
  const runtime = new DsmmProfileRuntime(ctx, resolveConfig(), centralStore(f), { validateCandidate });
  await runtime.initialize();
  return runtime;
}

test("minimal default and native idle mode writes survive profile changes/reopen without model selection", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const runtime = runtimeOf(f);
    const minimal = await f.create({ agentPreset: "minimal" });
    const standard = await f.create({ agentPreset: "standard" });
    const before = await runtime.getSession(structural(minimal));
    assert.equal(before.deepwork!.active, false); assert.equal(before.deepwork!.explicit, false);
    assert.equal((await runtime.getSession(structural(standard))).deepwork!.active, true);
    const toggle = (state: Awaited<ReturnType<DsmmProfileRuntime["getSession"]>>, active: boolean) => ({ sessionId: state.sessionId, active, expectedModeRevision: state.deepwork!.revision, expectedAdmissionEpoch: state.admissionEpoch });
    const nativeChoice = structuredClone(minimal.options);
    const enabled = await runtime.selectMode(toggle(before, true), structural(minimal));
    assert.equal(enabled.deepwork!.active, true); assert.equal(enabled.deepwork!.explicit, true); assert.deepEqual(minimal.options, nativeChoice);
    await runFixtureTurn(minimal);
    assert.match(JSON.stringify(f.adapter.calls.at(-1)?.messages), /DEEPWORK MODE ENABLED!/u);
    const saved = await runtime.save({ id: "mode-off-default", content: '{"version":1,"id":"mode-off-default","settings":{"defaultActive":false}}', expectedRevision: null });
    const switched = await runtime.selectSession(await request(runtime, minimal, saved.id, saved.revision), structural(minimal));
    assert.equal(switched.deepwork!.active, true); assert.equal(switched.deepwork!.explicit, true);
    await assert.rejects(runtime.selectMode(toggle(enabled, false), structural(minimal)), { code: "conflict" });
    const disabled = await runtime.selectMode(toggle(switched, false), structural(minimal));
    assert.equal(disabled.deepwork!.active, false); assert.equal(disabled.deepwork!.explicit, true);
    await runFixtureTurn(minimal); assert.doesNotMatch(JSON.stringify(f.adapter.calls.at(-1)?.messages), /DEEPWORK MODE ENABLED!/u);
    const seed = minimal.session.snapshotEvents();
    const resumed = await f.create({ agentPreset: "minimal" }, undefined, { seed });
    assert.equal((await runtime.getSession(structural(resumed))).deepwork!.active, false);
    assert.equal((await runtime.getSession(structural(resumed))).deepwork!.explicit, true);
    assert.equal(minimal.session.snapshotEvents().filter((event) => event.type === "model/selection").length, 0);
    const dw = await f.create({ agentPreset: "dsmm-orchestrator" });
    const managed = await runtime.getSession(structural(dw));
    assert.equal(managed.deepwork!.active, true); assert.equal(managed.deepwork!.locked, false);
    const dwOff = await runtime.selectMode(toggle(managed, false), structural(dw));
    assert.equal(dwOff.deepwork!.active, false); assert.equal(dwOff.deepwork!.explicit, true);
    await runFixtureTurn(dw);
    assert.doesNotMatch(JSON.stringify(f.adapter.calls.at(-1)?.messages), /DEEPWORK MODE ENABLED!/u);
  } finally { await f.dispose(); }
});

test("native maintenance race and mode persistence refusal leave accepted mode and model unchanged", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "minimal" });
    const structuralAgent = structural(agent), before = await runtime.getSession(structuralAgent);
    const input = { sessionId: before.sessionId, active: true, expectedModeRevision: before.deepwork!.revision, expectedAdmissionEpoch: before.admissionEpoch };
    const barrier = gate(); const maintenance = agent.runMaintenance(() => barrier.promise);
    try { await assert.rejects(runtime.selectMode(input, structuralAgent), { code: "maintenance" }); }
    finally { barrier.release(); await maintenance; }
    const append = structuralAgent.session.append;
    structuralAgent.session.append = () => { throw new Error("PRIVATE_DISK_ERROR"); };
    try { await assert.rejects(runtime.selectMode(input, structuralAgent), { code: "io" }); }
    finally { structuralAgent.session.append = append; }
    assert.deepEqual((await runtime.getSession(structuralAgent)).deepwork, before.deepwork);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "deepwork/mode").length, 0);
  } finally { await f.dispose(); }
});

test("native idle switches isolate two roots and global default; old/new children keep their exact admission snapshots", async () => {
  const f = await nativeRoutingFixture({}, { headless: true });
  try {
    const runtime = runtimeOf(f);
    const a = await runtime.save({ id: "a", content: profile("a", "session-a"), expectedRevision: null });
    const b = await runtime.save({ id: "b", content: profile("b", "session-b"), expectedRevision: null });
    const first = await f.create({ agentPreset: "dsmm-orchestrator" }, undefined, { agentOptions: { provider: "fixture", model: "native-a", reasoningEffort: ReasoningEffortId("low") } });
    const second = await f.create({ agentPreset: "dsmm-orchestrator" }, undefined, { agentOptions: { provider: "fixture", model: "native-b", reasoningEffort: ReasoningEffortId("low") } });
    const beforeGlobal = await runtime.describe();
    const switchedA = await runtime.selectSession(await request(runtime, first, "a", a.revision), structural(first));
    const oldAdmission = runtime.admission(structural(first));
    const oldChild = await f.create({ origin: "subagent" }, undefined, { parentAgent: first });
    assert.equal(runtime.admission(structural(oldChild)), oldAdmission);
    const switchedB = await runtime.selectSession(await request(runtime, second, "b", b.revision), structural(second));
    await runFixtureTurn(first); await runFixtureTurn(second);
    assert.equal(headerRoutes(first).at(-1)?.model, "native-a", "profile switch preserves the first root's native model");
    assert.equal(headerRoutes(second).at(-1)?.model, "native-b", "the second root's native model remains independent");
    assert.deepEqual(switchedA.profileModel, route("session-a"));
    assert.deepEqual(switchedB.profileModel, route("session-b"));
    assert.notEqual(switchedA.admissionEpoch, switchedB.admissionEpoch);
    assert.deepEqual(switchedA.globalDefault, { selectedId: beforeGlobal.selectedId, appliedRevision: beforeGlobal.appliedRevision, selectionRevision: beforeGlobal.selectionRevision });
    assert.equal(existsSync(join(f.profileDir, "dsmm-profiles", ".selection.json")), false);
    const reapplied = await runtime.selectSession(await request(runtime, first, "a", a.revision), structural(first));
    assert.notEqual(reapplied.admissionEpoch, switchedA.admissionEpoch, "same revision explicitly reapplied starts a fenced epoch");
    assert.equal(runtime.admission(structural(oldChild)), oldAdmission, "already-created child is never recursively rebound");
    const newChild = await f.create({ origin: "subagent" }, undefined, { parentAgent: first });
    assert.equal(runtime.admission(structural(newChild)), runtime.admission(structural(first)));
    assert.notEqual(runtime.admission(structural(newChild)).epoch, runtime.admission(structural(oldChild)).epoch);
    await assert.rejects(async () => runtime.selectSession({ ...(await request(runtime, first, "b", b.revision)), expectedAdmissionEpoch: switchedA.admissionEpoch }, structural(first)), { code: "conflict" });
    const lineageOnly = await f.create({ parentSession: first.id, isSeeded: true, agentPreset: "dsmm-orchestrator" }, undefined, { seed: first.session.snapshotEvents(), inheritedEventCount: SessionLogOffset(first.session.snapshotEvents().length) });
    assert.equal(runtime.admission(structural(lineageOnly)).scope, "global-default", "durable fork lineage never transfers a session choice without live ownership");
    assert.equal(runtime.admission(structural(lineageOnly)).appliedRevision, null);
    await assert.rejects(async () => runtime.selectSession(await request(runtime, first, "b", b.revision), structural(oldChild)), { code: "not-owned" });
    await runtime.save({ id: "a", content: profile("a", "edited-only"), expectedRevision: a.revision });
    assert.equal(runtime.admission(structural(first)).appliedRevision, a.revision);
    assert.equal(runtime.admission(structural(second)).appliedRevision, b.revision);
    const oldRoleChild = await f.subagents.start("dsmm-role-reviewer", { parent: first, prompt: [{ type: "text", text: "old child snapshot" }], signal: new AbortController().signal });
    try {
      assert.equal((await oldRoleChild.result).stopReason, "completed");
      assert.equal(headerRoutes(oldRoleChild.localAgent!).at(-1)?.model, "session-a-review");
      await runtime.selectSession(await request(runtime, first, "b", b.revision), structural(first));
      const newRoleChild = await f.subagents.start("dsmm-role-reviewer", { parent: first, prompt: [{ type: "text", text: "new child snapshot" }], signal: new AbortController().signal });
      try {
        assert.equal((await newRoleChild.result).stopReason, "completed");
        assert.equal(headerRoutes(newRoleChild.localAgent!).at(-1)?.model, "session-b-review");
        assert.equal(runtime.admission(structural(oldRoleChild.localAgent!)).appliedRevision, a.revision);
        assert.equal(runtime.admission(structural(newRoleChild.localAgent!)).appliedRevision, b.revision);
      } finally { await newRoleChild.dispose(); }
    } finally { await oldRoleChild.dispose(); }
  } finally { await f.dispose(); }
});

test("an unscoped root displays its exact captured global profile after the future-root default changes", async () => {
  const f = await nativeRoutingFixture();
  try {
    const runtime = runtimeOf(f);
    await f.create();
    const a = await runtime.save({ id: "a", content: profile("a", "captured-a"), expectedRevision: null });
    const b = await runtime.save({ id: "b", content: profile("b", "future-b"), expectedRevision: null });
    await runtime.select({ id: "a", expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    const captured = await f.create({ agentPreset: "dsmm-orchestrator" });
    const admission = runtime.admission(structural(captured));
    await runtime.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const snapshot = await runtime.getSession(structural(captured));
    assert.equal(snapshot.scope, "global-default");
    assert.equal(snapshot.selection.selectionRevision, "absent", "display identity cannot overwrite the actual sidecar CAS state");
    assert.equal(snapshot.admittedSelection?.selectedId, "a");
    assert.equal(snapshot.admittedSelection?.appliedRevision, a.revision);
    assert.equal(snapshot.globalDefault.selectedId, "b");
    assert.deepEqual(snapshot.profileModel, route("captured-a"), "explicit model action metadata comes from the captured admission, not future global B");
    assert.equal(snapshot.admissionEpoch, admission.epoch);
    await runFixtureTurn(captured);
    assert.equal(headerRoutes(captured).at(-1)?.model, "native-default", "profile metadata never implicitly applies a main model");
  } finally { await f.dispose(); }
});

test("profile model metadata follows the admitted ordinary root role without changing native selection or locks", async () => {
  const f = await nativeRoutingFixture();
  try {
    const runtime = runtimeOf(f);
    const nativeSelection: ModelSelectionRef = { current: { provider: "fixture", model: "native-tab", reasoningEffort: ReasoningEffortId("low") }, assembled: undefined };
    const root = await f.create({ agentPreset: "dsmm-orchestrator" }, nativeSelection);
    const draft = await runtime.save({ id: "metadata", expectedRevision: null, content: JSON.stringify({ version: 1, id: "metadata", settings: {
      defaultActive: false, roleRouting: {
        "dsmm-orchestrator": { primary: { provider: "fixture", model: "declared-main", reasoningEffort: "max" }, fallbackRoutes: [route("not-the-primary")] },
        "dsmm-planner": { primary: { provider: "fixture", model: "declared-planner" } },
        "dsmm-reviewer": { primary: route("declared-reviewer") },
      },
    } }) });
    const selected = await runtime.selectSession(await request(runtime, root, draft.id, draft.revision), structural(root));
    assert.deepEqual(selected.profileModel, { provider: "fixture", model: "declared-main", reasoningEffort: "max" });
    assert.deepEqual(nativeSelection.current, { provider: "fixture", model: "native-tab", reasoningEffort: "low" });
    await runFixtureTurn(root);
    assert.deepEqual(headerRoutes(root).at(-1), { provider: "fixture", model: "native-tab", reasoningEffort: "low" });
    let resolutions = 0;
    const resolve = f.adapter.resolveModel.bind(f.adapter);
    f.adapter.resolveModel = async (provider, model) => { resolutions++; return resolve(provider, model); };
    const events = JSON.stringify(root.session.snapshotEvents());
    const first = await runtime.getSession(structural(root));
    const next = await runtime.getSession(structural(root));
    assert.deepEqual(first.rolePolicy, next.rolePolicy, "read-only metadata does not reset any route/counter lock");
    assert.deepEqual(first.rolePolicy?.route, { provider: "fixture", model: "native-tab", reasoningEffort: "low" });
    assert.equal(JSON.stringify(root.session.snapshotEvents()), events);
    assert.equal(resolutions, 0, "describe does no LLM preflight or catalog work");
    first.profileModel!.model = "caller-edited-copy";
    assert.equal((await runtime.getSession(structural(root))).profileModel?.model, "declared-main");
    root.session.append("agent-preset/selected", { agentPreset: "dsmm-planner" });
    assert.deepEqual((await runtime.getSession(structural(root))).profileModel, { provider: "fixture", model: "declared-planner" }, "omitted effort is not replaced by an adapter default");
    root.session.append("agent-preset/selected", { agentPreset: "dsmm-reviewer" });
    assert.deepEqual((await runtime.getSession(structural(root))).profileModel, route("declared-reviewer"), "any top-level effective role can declare an optional model action");
    root.session.append("agent-preset/selected", { agentPreset: "standard" });
    assert.equal((await runtime.getSession(structural(root))).profileModel, undefined, "inactive non-DW roots do not infer an orchestrator model");
    root.session.append("deepwork/mode", { active: true });
    assert.equal((await runtime.getSession(structural(root))).profileModel?.model, "declared-main");
    const child = await f.create({ origin: "subagent" }, undefined, { parentAgent: root });
    await assert.rejects(runtime.getSession(structural(child)), { code: "not-owned" });
    const noPrimary = await runtime.save({ id: "no-primary", expectedRevision: null, content: JSON.stringify({ version: 1, id: "no-primary", settings: { roleRouting: { "dsmm-orchestrator": { fallbackRoutes: [route("fallback-only")] } } } }) });
    const applied = await runtime.selectSession(await request(runtime, root, noPrimary.id, noPrimary.revision), structural(root));
    assert.equal(applied.profileModel, undefined, "fallbacks and actual native route never become a declared profile primary");
    assert.deepEqual(nativeSelection.current, { provider: "fixture", model: "native-tab", reasoningEffort: "low" });
  } finally { await f.dispose(); }
});

test("native running and foreign maintenance activities refuse immediately; a queued wake uses the committed new epoch", async () => {
  const f = await nativeRoutingFixture();
  const wait = gate(); const entered = gate();
  try {
    const agent = await f.create({ agentPreset: "dsmm-orchestrator" });
    const runtime = await localRuntime(f, async () => { entered.release(); await wait.promise; });
    const saved = await runtime.save({ id: "a", content: profile("a", "wake-new"), expectedRevision: null });
    const select = await request(runtime, agent, "a", saved.revision);
    const foreign = gate(); const held = agent.runMaintenance(async () => foreign.promise);
    await assert.rejects(async () => runtime.selectSession(select, structural(agent)), { code: "maintenance" });
    foreign.release(); await held;
    f.adapter.beforeStream = async () => wait.promise;
    agent.followup(createUserMessage({ source: { kind: "user" }, content: [{ type: "text", text: "bounded busy fixture" }] }));
    assert.equal(agent.status, "running");
    await assert.rejects(async () => runtime.selectSession(select, structural(agent)), { code: "busy" });
    wait.release(); await agent.whenIdle(); f.adapter.beforeStream = undefined;
    const validation = gate(); const validating = gate();
    const current = runtimeOf(f);
    const resolveModel = f.adapter.resolveModel.bind(f.adapter);
    f.adapter.resolveModel = async (provider, model) => {
      if (model === "wake-new") { validating.release(); await validation.promise; }
      return resolveModel(provider, model);
    };
    const pending = current.selectSession(await request(current, agent, "a", saved.revision), structural(agent));
    await validating.promise;
    const oldEpoch = current.admission(structural(agent)).epoch;
    agent.followup(createUserMessage({ source: { kind: "user" }, content: [{ type: "text", text: "wake behind maintenance" }] }));
    assert.equal(agent.status, "idle", "native maintenance reserves idle even with queued waking input");
    assert.equal(f.adapter.calls.length, 1, "queued wake cannot begin before durable profile publication");
    validation.release(); const committed = await pending; await agent.whenIdle();
    assert.notEqual(committed.admissionEpoch, oldEpoch);
    assert.equal(headerRoutes(agent).at(-1)?.model, "native-default", "queued wake observes new profile policy without an implicit model change");
    assert.deepEqual(committed.profileModel, route("wake-new"));
  } finally { wait.release(); await f.dispose(); }
});

for (const failure of ["caller-abort", "native-cancel", "replacement", "disposed"] as const) {
  test(`native idle session switch ${failure} during validation retains disk and exact old admission`, async () => {
    const f = await nativeRoutingFixture(); const hold = gate(); const entered = gate();
    try {
      const agent = await f.create();
      const lookup = new Map<string, DshAgent>([[agent.id, structural(agent)]]);
      const runtime = await localRuntime(f, async () => { entered.release(); await hold.promise; }, lookup);
      const saved = await runtime.save({ id: "a", content: profile("a", "cancelled-new"), expectedRevision: null });
      const old = runtime.admission(structural(agent));
      const controller = new AbortController();
      const pending = runtime.selectSession(await request(runtime, agent, "a", saved.revision), structural(agent), controller.signal);
      await entered.promise;
      if (failure === "caller-abort") controller.abort();
      if (failure === "native-cancel") agent.cancel({ kind: "user" });
      if (failure === "replacement") lookup.set(agent.id, { id: agent.id, session: structural(agent).session });
      if (failure === "disposed") lookup.delete(agent.id);
      hold.release();
      await assert.rejects(pending, { code: failure === "caller-abort" || failure === "native-cancel" ? "cancelled" : "not-owned" });
      assert.equal(runtime.admission(structural(agent)), old);
      assert.equal((await new ProfileStore(join(f.profileDir, "dsmm-profiles")).loadSessionSelection(agent.id)).selectionRevision, "absent");
    } finally { hold.release(); await f.dispose(); }
  });
}

test("the final pre-rename fence rechecks native cancellation and exact Agent identity after immutable staging", async () => {
  for (const failure of ["cancel", "replace"] as const) {
    const f = await nativeRoutingFixture();
    try {
      const agent = await f.create();
      let captured = structural(agent);
      let fenceCalls = 0;
      class FinalFenceStore extends ProfileStore {
        override selectSession<T>(input: SessionProfileSelectRequest, nextEpoch: string, validate: (document: DsmmProfileDocument | null) => T | Promise<T>, publication: SessionProfileCommit<T>) {
          return super.selectSession(input, nextEpoch, validate, { ...publication, assertCurrent() {
            if (++fenceCalls === 4) {
              if (failure === "cancel") agent.cancel({ kind: "user" });
              else captured = { id: agent.id, session: structural(agent).session };
            }
            publication.assertCurrent();
          } });
        }
      }
      const ctx: DshContext = { get(name) { return (name === "agents" ? { list: () => [captured], get: () => captured, isOwnedBy: () => false } : undefined) as never; } };
      const runtime = new DsmmProfileRuntime(ctx, resolveConfig(), new FinalFenceStore(join(f.profileDir, "dsmm-profiles")), { validateCandidate() {} });
      await runtime.initialize();
      const saved = await runtime.save({ id: "a", content: profile("a", "never-committed"), expectedRevision: null });
      const old = runtime.admission(structural(agent));
      await assert.rejects(runtime.selectSession(await request(runtime, agent, "a", saved.revision), structural(agent)), { code: failure === "cancel" ? "cancelled" : "not-owned" });
      assert.equal(fenceCalls, 4);
      assert.equal(runtime.admission(structural(agent)), old);
      assert.equal((await new ProfileStore(join(f.profileDir, "dsmm-profiles")).loadSessionSelection(agent.id)).selectionRevision, "absent");
      assert.equal(existsSync(join(f.profileDir, "dsmm-profiles", ".revisions", `${saved.revision}.jsonc`)), true, "staging an immutable orphan does not activate it");
    } finally { await f.dispose(); }
  }
});

test("native handle disposal cancels profile validation before committing or publishing late state", async () => {
  const f = await nativeRoutingFixture(); const entered = gate(); const hold = gate();
  const handle = await f.agents.create({ sessionId: SessionId("dsmm-real-disposal"), agentOptions: { provider: "fixture", model: "native-default" } });
  try {
    const runtime = runtimeOf(f);
    const saved = await runtime.save({ id: "a", content: profile("a", "dispose-route"), expectedRevision: null });
    const original = f.adapter.resolveModel.bind(f.adapter);
    f.adapter.resolveModel = async (provider, model) => { if (model === "dispose-route") { entered.release(); await hold.promise; } return original(provider, model); };
    const old = runtime.admission(structural(handle.agent));
    const pending = runtime.selectSession(await request(runtime, handle.agent, "a", saved.revision), structural(handle.agent));
    await entered.promise;
    const disposed = handle.dispose();
    hold.release();
    await assert.rejects(pending);
    await disposed;
    assert.equal(f.agents.get(handle.agent.id), undefined);
    assert.equal(runtime.admission(structural(handle.agent)), old);
    assert.equal((await new ProfileStore(join(f.profileDir, "dsmm-profiles")).loadSessionSelection(handle.agent.id)).selectionRevision, "absent");
  } finally { hold.release(); await handle.dispose(); await f.dispose(); }
});

test("trusted caller authority is rechecked after awaited validation and in the final session commit fence", async () => {
  for (const boundary of ["validation", "pre-rename"] as const) {
    const f = await nativeRoutingFixture(); const entered = gate(); const hold = gate();
    try {
      const agent = await f.create();
      let authorized = true;
      let checks = 0;
      const runtime = await localRuntime(f, async () => { if (boundary === "validation") { entered.release(); await hold.promise; } });
      const saved = await runtime.save({ id: "a", content: profile("a", "authority-route"), expectedRevision: null });
      const old = runtime.admission(structural(agent));
      const pending = runtime.selectSession(await request(runtime, agent, "a", saved.revision), structural(agent), undefined, () => {
        // Start, native maintenance entry, store entry, post-validation,
        // post-staging and final pre-rename all pass the same trusted fence.
        if (++checks === 7 && boundary === "pre-rename") authorized = false;
        if (!authorized) throw new DsmmProfileError("not-owned", "The trusted native caller authority was withdrawn.");
      });
      if (boundary === "validation") { await entered.promise; authorized = false; hold.release(); }
      await assert.rejects(pending, { code: "not-owned" });
      assert.equal(runtime.admission(structural(agent)), old);
      assert.equal((await new ProfileStore(join(f.profileDir, "dsmm-profiles")).loadSessionSelection(agent.id)).selectionRevision, "absent");
      if (boundary === "pre-rename") assert.equal(checks, 7);
    } finally { hold.release(); await f.dispose(); }
  }
});

test("native candidate admission accepts ordered resolvable chains and inherited routes without checking dormant alternatives", async () => {
  const f = await nativeRoutingFixture();
  try {
    const runtime = runtimeOf(f); const agent = await f.create();
    const save = (id: string, policy: unknown) => runtime.save({ id, expectedRevision: null, content: JSON.stringify({ version: 1, id, settings: { roleRouting: { "dsmm-orchestrator": policy } } }) });
    const unavailable = { provider: "no-such-native-adapter", model: "manual-model" };
    const viable = await save("viable", { primary: unavailable, fallbackRoutes: [route("manual-resolvable"), unavailable] });
    await runtime.selectSession(await request(runtime, agent, "viable", viable.revision), structural(agent));
    const inherited = await save("inherited", { fallbackRoutes: [unavailable] });
    await runtime.selectSession(await request(runtime, agent, "inherited", inherited.revision), structural(agent));
    const old = runtime.admission(structural(agent));
    f.adapter.unsupportedMaxModels.add("unsupported-exact");
    const invalid = await save("invalid", { primary: { ...route("unsupported-exact"), reasoningEffort: "max" }, fallbackRoutes: [route("available-but-not-permission-to-normalize")] });
    await assert.rejects(runtime.selectSession(await request(runtime, agent, "invalid", invalid.revision), structural(agent)), { code: "activation" });
    assert.equal(runtime.admission(structural(agent)), old);
    assert.equal(f.adapter.calls.length, 0, "native catalog admission never sends sacrificial completions");
  } finally { await f.dispose(); }
});

test("explicit store startup lock contention still refuses, while strict legacy startup reads never contend or write locks", async () => {
  const root = mkdtempSync(join(tmpdir(), "dsmm-startup-lock-"));
  try {
    const storeDir = join(root, "dsmm-profiles");
    const store = new ProfileStore(storeDir);
    const saved = await store.save({ id: "a", content: profile("a", "startup-a"), expectedRevision: null });
    await store.select({ id: "a", expectedRevision: saved.revision, expectedSelectionRevision: "absent" });
    const pointer = readFileSync(join(storeDir, ".selection.json"));
    writeFileSync(join(storeDir, ".lock"), "preexisting-init-owner");
    let listeners = 0;
    const explicit = new DsmmProfileRuntime({ on() { listeners++; } }, resolveConfig(), store);
    await assert.rejects(explicit.initialize(), { code: "lock-timeout" });
    assert.equal(listeners, 0);
    const legacy = await createProfileRuntime({ get: (name) => (name === "profileContext" ? { dir: root } : undefined) as never }, resolveConfig());
    assert.equal(legacy.admission().appliedRevision, saved.revision);
    assert.equal((await legacy.describe()).readOnly, true);
    assert.equal(readFileSync(join(storeDir, ".selection.json")).equals(pointer), true);
    assert.equal(readFileSync(join(storeDir, ".lock"), "utf8"), "preexisting-init-owner");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an exact native entered Agent cannot bypass its sidecar through a synchronous getter before serial created admission", async () => {
  const f = await nativeRoutingFixture();
  try {
    const runtime = runtimeOf(f);
    let setupObserved = false, enteredObserved = false;
    f.ctx.on("agent/created", async ({ agent }) => {
      if (agent.id !== "dsmm-entered-before-created") return;
      enteredObserved = true;
      assert.throws(() => runtime.getSettings(structural(agent)), { code: "activation" });
      await assert.rejects(runtime.getSession(structural(agent)), { code: "activation" });
    }, { prepend: true, global: true });
    const early = await f.create({}, undefined, {
      sessionId: SessionId("dsmm-entered-before-created"),
      async setup(_agentCtx, agent) {
        setupObserved = true;
        assert.throws(() => runtime.getSettings(structural(agent)), { code: "activation" }, "unpublished native setup cannot establish a default binding either");
        await assert.rejects(runtime.getSession(structural(agent)), { code: "not-owned" }, "setup has not published an owned Agent yet");
        return { commit() { assert.throws(() => runtime.getSettings(structural(agent)), { code: "activation" }); } };
      }
    });
    assert.equal(setupObserved, true);
    assert.equal(enteredObserved, true);
    assert.equal(runtime.admission(structural(early)).scope, "global-default");
  } finally { await f.dispose(); }
});

test("native persisted resume honors explicit immutable session pins and baseline; stock readers remain compatible", async () => {
  const profileDir = mkdtempSync(join(tmpdir(), "dsmm-session-resume-"));
  const storage = { root: join(profileDir, "logs"), compression: "none" as const };
  let f = await nativeRoutingFixture({}, { profileDir });
  try {
    await f.ctx.plugin(DsmmSessionPersistence, storage).await();
    const runtime = runtimeOf(f);
    const saved = await runtime.save({ id: "a", content: profile("a", "pinned-a"), expectedRevision: null });
    const b = await runtime.save({ id: "b", content: profile("b", "global-b"), expectedRevision: null });
    const pinned = await f.create({ agentPreset: "dsmm-orchestrator" });
    const baseline = await f.create({ agentPreset: "dsmm-orchestrator" });
    const unscoped = await f.create({ agentPreset: "dsmm-orchestrator" });
    await runtime.selectSession(await request(runtime, pinned, "a", saved.revision), structural(pinned));
    await runtime.selectSession(await request(runtime, baseline, null), structural(baseline));
    const pinnedEpoch = runtime.admission(structural(pinned)).epoch;
    await runFixtureTurn(pinned); await runFixtureTurn(baseline); await runFixtureTurn(unscoped);
    const ids = [pinned.id, baseline.id, unscoped.id];
    await runtime.save({ id: "a", content: profile("a", "draft-not-admitted"), expectedRevision: saved.revision });
    await runtime.select({ id: "b", expectedRevision: b.revision, expectedSelectionRevision: "absent" });
    await f.dispose();
    const readerCtx = new Context();
    try {
      await readerCtx.plugin(JsonlSessionPersistence, storage).await();
      for (const id of ids) { const reader = await readerCtx.sessionPersistence.open(id, "read"); try { assert.ok((await reader.read()).events.length > 0); } finally { await reader.close(); } }
    } finally { await readerCtx.fiber.dispose(); }
    f = await nativeRoutingFixture({}, { profileDir });
    await f.ctx.plugin(DsmmSessionPersistence, storage).await();
    for (const [index, id] of ids.entries()) {
      const handle = await f.agents.resume({ resumeSessionId: id, agentOptions: { provider: "fixture", model: "native-default", reasoningEffort: ReasoningEffortId("low") } });
      try {
        const admitted = runtimeOf(f).admission(structural(handle.agent));
        assert.equal(admitted.scope, index === 0 ? "session-override" : index === 1 ? "deployment-baseline" : "global-default");
        assert.equal(admitted.appliedRevision, index === 0 ? saved.revision : index === 1 ? null : b.revision);
        if (index === 0) assert.equal(admitted.epoch, pinnedEpoch);
        await runFixtureTurn(handle.agent);
        assert.equal(headerRoutes(handle.agent).at(-1)?.model, "native-default", "cold profile pins do not replace native model authority");
        assert.deepEqual((await runtimeOf(f).getSession(structural(handle.agent))).profileModel, index === 0 ? route("pinned-a") : index === 1 ? undefined : route("global-b"));
      } finally { await handle.dispose(); }
    }
    const store = centralStore(f);
    const sidecar = join(store.stateDir, ".sessions", `${createHash("sha256").update(ids[0]!).digest("hex")}.json`);
    const before = readFileSync(sidecar);
    unlinkSync(join(store.profileDir, ".revisions", `${saved.revision}.jsonc`));
    await assert.rejects(f.agents.resume({ resumeSessionId: ids[0]! }), { code: "corrupt-selection" });
    assert.equal(f.agents.get(ids[0]!), undefined, "failed created admission is rolled back by native factory before any wake");
    assert.equal(readFileSync(sidecar).equals(before), true);
    writeFileSync(sidecar, "{}");
    await assert.rejects(f.agents.resume({ resumeSessionId: ids[0]! }), { code: "corrupt-selection" });
  } finally { await f.dispose(); rmSync(profileDir, { recursive: true, force: true }); }
});
