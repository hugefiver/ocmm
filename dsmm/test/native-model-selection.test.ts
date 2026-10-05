import assert from "node:assert/strict";
import { test } from "node:test";
import { LlmError, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { ModelSelection, ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { headerRoutes, nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";
import { roleRouteRuntimeState } from "../lib/role-routing.js";

const primary = { provider: "fixture", model: "configured-main", reasoningEffort: "max" };
const manual = { provider: "deepseek-official", model: "user-chosen", reasoningEffort: "low" };

/** Public native write/cache seams used by selectModel, without its global default persistence. */
async function nativeSelect(agent: Agent, selection: ModelSelectionRef, route: { provider: string; model: string; reasoningEffort?: string }): Promise<ModelSelection> {
  const selected = await agent.ctx.get("llm")!.resolveCallConfig({ provider: route.provider, model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }) });
  const value = { provider: selected.provider, model: selected.model,
    ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) };
  agent.session.append("model/selection", value);
  selection.current = value;
  return value;
}

test("native explicit model selection overrides the Deepwork profile primary on this Agent and subsequent turns", async () => {
  const fixture = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-orchestrator": { primary } } });
  try {
    const selection: ModelSelectionRef = { current: { provider: "fixture", model: "native-default", reasoningEffort: ReasoningEffortId("high") }, assembled: undefined };
    const agent = await fixture.create({}, selection); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [primary]);
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    const admitted = runtime.admission(agent as unknown as DshAgent);
    const selected = await nativeSelect(agent, selection, manual);
    await runFixtureTurn(agent);
    assert.deepEqual(selection.assembled, selected, "native assembly captured the exact user choice");
    assert.equal(runtime.admission(agent as unknown as DshAgent).epoch, admitted.epoch, "selection did not change profile admission");
    assert.equal(runtime.getSettings(agent as unknown as DshAgent).roleRouting["dsmm-orchestrator"]!.primary!.model, primary.model);
    assert.deepEqual(headerRoutes(agent), [primary, manual]);
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort })), [primary, manual, manual]);
  } finally { await fixture.dispose(); }
});

test("native effort-only and omitted-effort selections remain exact under strict Deepwork calibration", async () => {
  const route = { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "max" };
  const fixture = await nativeRoutingFixture({ deepseekV4ProCalibration: "strict", roleRouting: { "dsmm-reviewer": { primary: route } } });
  try {
    const selection: ModelSelectionRef = { current: { ...route, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const agent = await fixture.create({ agentPreset: "dsmm-reviewer" }, selection); await runFixtureTurn(agent);
    await nativeSelect(agent, selection, { ...route, reasoningEffort: "low" }); await runFixtureTurn(agent);
    await nativeSelect(agent, selection, { provider: route.provider, model: route.model }); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent).map(({ reasoningEffort }) => reasoningEffort), ["max", "low", "high"]);
    assert.deepEqual(fixture.adapter.calls.map(({ reasoningEffort }) => reasoningEffort), ["max", "low", "high"]);
  } finally { await fixture.dispose(); }
});

test("a native selection committed during assembly applies only on the later step captured by native assembly", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary } } });
  try {
    const selection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const agent = await fixture.create({ agentPreset: "dsmm-reviewer" }, selection);
    await nativeSelect(agent, selection, primary); await runFixtureTurn(agent);
    let switched = false;
    const dispose = agent.ctx.on("system-prompt/assemble", async (_assembly, _context, next) => {
      const assembled = await next();
      if (!switched) { switched = true; await nativeSelect(agent, selection, manual); }
      return assembled;
    });
    await runFixtureTurn(agent);
    assert.deepEqual(selection.assembled, { ...primary, reasoningEffort: ReasoningEffortId("max") });
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [primary.model, primary.model]);
    dispose(); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [primary, manual]);
  } finally { await fixture.dispose(); }
});

for (const sameValue of [false, true]) test(`native ${sameValue ? "same-value reselection" : "route selection"} during backoff invalidates the old retry without native always fallthrough`, async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [{ provider: "fixture", model: "stale-fallback" }],
    strategy: "rate-limit-fallback", rateLimit: { maxRetries: 1, initialDelayMs: 40, maxDelayMs: 40, maxTotalDelayMs: 40, switchAfterRateLimits: 1, maxSwitches: 1 } } } });
  try {
    const selection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const agent = await fixture.create({ agentPreset: "dsmm-reviewer" }, selection);
    await nativeSelect(agent, selection, primary);
    let failed!: () => void; const firstFailure = new Promise<void>((resolve) => { failed = resolve; });
    fixture.ctx.on("agent/assistant-stream", ({ frame }) => { if (frame.type === "end") failed(); });
    let hostCalls = 0;
    fixture.ctx.on("agent/request-error", async () => { hostCalls++; return { kind: "retry" }; });
    fixture.adapter.beforeStream = async () => { throw new LlmError("rate limit before user switch", "RATE_LIMIT", { status: 429 }); };
    const turn = runFixtureTurn(agent); await firstFailure;
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    const admission = runtime.admission(agent as unknown as DshAgent);
    for (let tick = 0; tick < 20 && roleRouteRuntimeState(agent as unknown as DshAgent, admission.settings, "dsmm-reviewer", admission.epoch).totalDelayMs === 0; tick++) await Promise.resolve();
    assert.equal(roleRouteRuntimeState(agent as unknown as DshAgent, admission.settings, "dsmm-reviewer", admission.epoch).totalDelayMs, 40);
    const chosen = sameValue ? primary : manual;
    await nativeSelect(agent, selection, chosen); await turn;
    assert.equal(fixture.adapter.calls.length, 1); assert.equal(hostCalls, 0);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "model/selection").length, 2);
    fixture.adapter.beforeStream = undefined;
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort })), [primary, chosen]);
    assert.equal(fixture.adapter.calls.some(({ model }) => model === "stale-fallback"), false);
  } finally { await fixture.dispose(); }
});

test("native user selection between retry admission and pending request application stops the stale request before provider dispatch", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [{ provider: "fixture", model: "stale-fallback" }],
    strategy: "rate-limit-fallback", rateLimit: { initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, maxRetries: 1, switchAfterRateLimits: 1, maxSwitches: 1 } } } });
  try {
    const selection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const agent = await fixture.create({ agentPreset: "dsmm-reviewer" }, selection); await nativeSelect(agent, selection, primary);
    let requests = 0;
    const dispose = agent.ctx.on("agent/request", async (_frame, next) => {
      const config = await next();
      if (++requests === 2) await nativeSelect(agent, selection, manual);
      return config;
    });
    fixture.adapter.beforeStream = async () => { throw new LlmError("rate limit before user switch", "RATE_LIMIT", { status: 429 }); };
    await runFixtureTurn(agent);
    assert.equal(requests, 2); assert.equal(fixture.adapter.calls.length, 1);
    dispose(); fixture.adapter.beforeStream = undefined;
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [primary, manual]);
    assert.equal(fixture.adapter.calls.some(({ model }) => model === "stale-fallback"), false);
  } finally { await fixture.dispose(); }
});

test("explicit native user intent survives current-session profile apply and fresh cold Agent admission", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary } } });
  try {
    const selection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const agent = await fixture.create({ agentPreset: "dsmm-reviewer" }, selection); await nativeSelect(agent, selection, manual); await runFixtureTurn(agent);
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    const next = await runtime.save({ id: "new-default", expectedRevision: null, content: JSON.stringify({ version: 1, id: "new-default", settings: {
      roleRouting: { "dsmm-reviewer": { primary: { ...primary, model: "new-profile-default" }, strategy: "rate-limit-fallback" } } } }) });
    const snapshot = await runtime.getSession(agent as unknown as DshAgent);
    await runtime.selectSession({ sessionId: agent.id, id: next.id, expectedRevision: next.revision,
      expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch }, agent as unknown as DshAgent);
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [manual.model, manual.model]);
    assert.equal(runtime.getSettings(agent as unknown as DshAgent).roleRouting["dsmm-reviewer"]!.primary!.model, "new-profile-default");
    const seed = JSON.parse(JSON.stringify(agent.session.snapshotEvents()));
    const coldSelection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const cold = await fixture.create({ agentPreset: "dsmm-reviewer" }, coldSelection, { seed });
    await runFixtureTurn(cold);
    assert.deepEqual(headerRoutes(cold).at(-1), manual, "consumed durable user intent outranks this fresh Agent's profile default");
  } finally { await fixture.dispose(); }
});

test("a manual native route retains its policy-authorized fallback until a fresh explicit selection event", async () => {
  const backup = { provider: "fixture", model: "manual-route-backup", reasoningEffort: "high" };
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], strategy: "rate-limit-fallback",
    rateLimit: { initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, maxRetries: 1, switchAfterRateLimits: 1, maxSwitches: 1 } } } });
  try {
    const selection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const agent = await fixture.create({ agentPreset: "dsmm-reviewer" }, selection); await nativeSelect(agent, selection, manual);
    fixture.adapter.beforeStream = async (call) => { if (call.model === manual.model) throw new LlmError("manual-route rate limit", "RATE_LIMIT", { status: 429 }); };
    await runFixtureTurn(agent); await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [manual.model, backup.model, backup.model]);
    assert.deepEqual(headerRoutes(agent), [manual, backup]);
    fixture.adapter.beforeStream = undefined;
    await nativeSelect(agent, selection, manual); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [manual, backup, manual]);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [manual.model, backup.model, backup.model, manual.model]);
  } finally { await fixture.dispose(); }
});

test("a parent's explicit native model choice does not replace auxiliary role defaults or native child overrides", async () => {
  const reviewer = { provider: "fixture", model: "auxiliary-reviewer", reasoningEffort: "high" };
  const fixture = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-orchestrator": { primary }, "dsmm-reviewer": { primary: reviewer } } });
  try {
    const selection: ModelSelectionRef = { current: { ...primary, reasoningEffort: ReasoningEffortId("max") }, assembled: undefined };
    const parent = await fixture.create({}, selection); await nativeSelect(parent, selection, manual); await runFixtureTurn(parent);
    for (const overridden of [false, true]) {
      const child = await fixture.subagents.start("dsmm-role-reviewer", { parent, signal: new AbortController().signal, prompt: [{ type: "text", text: "Use the auxiliary role's native route" }],
        ...(overridden ? { agentOptions: { ...manual, reasoningEffort: ReasoningEffortId("low") } } : {}) });
      try {
        assert.equal((await child.result).stopReason, "completed"); assert.ok(child.localAgent);
        assert.deepEqual(headerRoutes(child.localAgent), [overridden ? manual : reviewer]);
      } finally { await child.dispose(); }
    }
  } finally { await fixture.dispose(); }
});
