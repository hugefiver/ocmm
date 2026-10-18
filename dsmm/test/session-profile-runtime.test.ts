import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import type { DshAgent } from "../src/dsh-types.js";
import { createProfileRuntime, DsmmProfileRuntime } from "../src/profile-runtime.js";
import { ProfileStore } from "../src/profile-store.js";
import type { SessionProfileSelectRequest } from "../src/profile-types.js";
import { resolveConfig } from "../src/settings.js";
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

test("ordinary native mode writes survive future-default changes and reopen without model selection", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const runtime = runtimeOf(f);
    const ordinary = await f.create({ agentPreset: "standard" });
    const before = await runtime.getSession(structural(ordinary));
    assert.equal(before.deepwork!.active, true); assert.equal(before.deepwork!.explicit, false);
    const toggle = (state: Awaited<ReturnType<DsmmProfileRuntime["getSession"]>>, active: boolean) => ({ sessionId: state.sessionId, active, expectedModeRevision: state.deepwork!.revision, expectedAdmissionEpoch: state.admissionEpoch });
    const nativeChoice = structuredClone(ordinary.options);
    const disabled = await runtime.selectMode(toggle(before, false), structural(ordinary));
    assert.equal(disabled.deepwork!.active, false); assert.equal(disabled.deepwork!.explicit, true); assert.deepEqual(ordinary.options, nativeChoice);
    await runFixtureTurn(ordinary);
    assert.doesNotMatch(JSON.stringify(f.adapter.calls.at(-1)?.messages), /DEEPWORK MODE ENABLED!/u);
    const saved = await runtime.save({ id: "mode-off-default", content: '{"version":1,"id":"mode-off-default","settings":{"defaultActive":false}}', expectedRevision: null });
    await runtime.select({ id: saved.id, expectedRevision: saved.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const future = await f.create({ agentPreset: "standard" });
    const futureState = await runtime.getSession(structural(future));
    assert.equal(futureState.deepwork!.active, false); assert.equal(futureState.deepwork!.explicit, false);
    assert.equal(futureState.canApplyOverlay, false); assert.equal(futureState.applyOverlayUnavailableReason, "new-session-required");
    assert.equal((await runtime.getSession(structural(ordinary))).deepwork!.active, false, "existing admission remains immutable");
    const enabled = await runtime.selectMode(toggle(disabled, true), structural(ordinary));
    assert.equal(enabled.deepwork!.active, true); assert.equal(enabled.deepwork!.explicit, true);
    await runFixtureTurn(ordinary); assert.match(JSON.stringify(f.adapter.calls.at(-1)?.messages), /DEEPWORK MODE ENABLED!/u);
    const seed = ordinary.session.snapshotEvents();
    const resumed = await f.create({ agentPreset: "standard" }, undefined, { seed });
    assert.equal((await runtime.getSession(structural(resumed))).deepwork!.active, true);
    assert.equal((await runtime.getSession(structural(resumed))).deepwork!.explicit, true);
    assert.equal(ordinary.session.snapshotEvents().filter((event) => event.type === "model/selection").length, 0);
    const dw = await f.create({ agentPreset: "dsmm-orchestrator" });
    const managed = await runtime.getSession(structural(dw));
    assert.equal(managed.deepwork!.active, true); assert.equal(managed.deepwork!.locked, false);
    const dwOff = await runtime.selectMode(toggle(managed, false), structural(dw));
    assert.equal(dwOff.deepwork!.active, false); assert.equal(dwOff.deepwork!.explicit, true);
    await runFixtureTurn(dw);
    assert.doesNotMatch(JSON.stringify(f.adapter.calls.at(-1)?.messages), /DEEPWORK MODE ENABLED!/u);
  } finally { await f.dispose(); }
});

test("native maintenance race leaves the accepted mode and model unchanged", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true });
  try {
    const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "standard" });
    const structuralAgent = structural(agent), before = await runtime.getSession(structuralAgent);
    const input = { sessionId: before.sessionId, active: false, expectedModeRevision: before.deepwork!.revision, expectedAdmissionEpoch: before.admissionEpoch };
    const barrier = gate(); const maintenance = agent.runMaintenance(() => barrier.promise);
    try { await assert.rejects(runtime.selectMode(input, structuralAgent), { code: "maintenance" }); }
    finally { barrier.release(); await maintenance; }
    assert.deepEqual((await runtime.getSession(structuralAgent)).deepwork, before.deepwork);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "deepwork/mode").length, 0);
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
    assert.equal(snapshot.admittedSelection?.sourceRevision, a.revision);
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
    const draft = await runtime.save({ id: "metadata", expectedRevision: null, content: JSON.stringify({ version: 1, id: "metadata", settings: {
      defaultActive: false, roleRouting: {
        "dsmm-orchestrator": { primary: { provider: "fixture", model: "declared-main", reasoningEffort: "max" }, fallbackRoutes: [route("not-the-primary")] },
        "dsmm-planner": { primary: { provider: "fixture", model: "declared-planner" } },
        "dsmm-reviewer": { primary: route("declared-reviewer") },
      },
    } }) });
    await runtime.select({ id: draft.id, expectedRevision: draft.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const root = await f.create({ agentPreset: "dsmm-orchestrator" }, nativeSelection);
    const selected = await runtime.getSession(structural(root));
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
    const noPrimary = await runtime.save({ id: "no-primary", expectedRevision: null, content: JSON.stringify({ version: 1, id: "no-primary", settings: { roleRouting: { "dsmm-orchestrator": { fallbackRoutes: [route("fallback-only")] } } } }) });
    await runtime.select({ id: noPrimary.id, expectedRevision: noPrimary.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    assert.equal((await runtime.getSession(structural(root))).profileModel?.model, "declared-main", "future defaults cannot replace an immutable admission");
    const future = await f.create({ agentPreset: "dsmm-orchestrator" });
    assert.equal((await runtime.getSession(structural(future))).profileModel, undefined, "fallbacks and actual native routes never become a declared profile primary");
    assert.deepEqual(nativeSelection.current, { provider: "fixture", model: "native-tab", reasoningEffort: "low" });
  } finally { await f.dispose(); }
});

test("advanced Apply is explicitly unavailable and cannot replace an immutable native admission", async () => {
  const f = await nativeRoutingFixture();
  try {
    const runtime = runtimeOf(f), agent = await f.create({ agentPreset: "dsmm-orchestrator" });
    const saved = await runtime.save({ id: "future", content: profile("future", "future-model"), expectedRevision: null });
    const before = runtime.admission(structural(agent));
    const snapshot = await runtime.getSession(structural(agent));
    assert.equal(snapshot.canApplyOverlay, false);
    assert.equal(snapshot.applyOverlayUnavailableReason, "new-session-required");
    await assert.rejects(runtime.selectSession(await request(runtime, agent, saved.id, saved.revision), structural(agent)), { code: "unavailable" });
    assert.equal(runtime.admission(structural(agent)), before);
    assert.equal((await centralStore(f).loadSessionSelection(agent.id)).selectionRevision, "absent");
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
    assert.equal(legacy.admission().sourceRevision, saved.revision);
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
