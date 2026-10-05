import assert from "node:assert/strict";
import { test } from "node:test";
import { agentEvents } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import { LlmError, ReasoningEffortId, ToolCallId } from "@deepseek-ai/dsh-llm";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import type { DsmmProfileRuntime } from "../lib/profile-runtime.js";
import { roleRouteRuntimeState, selectInitialModelRoute } from "../lib/role-routing.js";
import type { DshLlmRuntime } from "../lib/dsh-types.js";
import { headerRoutes, nativeRoutingFixture, RoutingFixtureAdapter, runFixtureTurn } from "./native-routing-fixture.ts";

const primary = { provider: "fixture", model: "strategy-primary", reasoningEffort: "max" };
const backup = { provider: "fixture", model: "strategy-backup", reasoningEffort: "high" };
const last = { provider: "fixture", model: "strategy-last" };
const immediate = { initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0 };
const rateFailure = () => new LlmError("deterministic no-output rate limit", "RATE_LIMIT", { status: 429 });

test("native preflight chooses first native-resolvable candidate without a primary header, and locks it across turns", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": {
    primary: { provider: "missing-native-adapter", model: "unavailable" }, fallbackRoutes: [backup, last]
  } } });
  try {
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [backup]);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [backup.model, backup.model]);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "user/message").length, 2);
  } finally { await fixture.dispose(); }
});

test("native alias preflight selects initial fallback while preserving native read-only spawn authority", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": {
    primary: { provider: "missing-native-adapter", model: "unavailable" }, fallbackRoutes: [backup]
  } } });
  try {
    const parent = await fixture.create();
    const child = await fixture.subagents.start("dsmm-role-reviewer", { parent, signal: new AbortController().signal,
      prompt: [{ type: "text", text: "Native fallback admission" }], toolFilter: { allow: ["read", "glob", "grep"] } });
    try {
      assert.equal((await child.result).stopReason, "completed"); assert.ok(child.localAgent);
      assert.deepEqual(headerRoutes(child.localAgent), [backup]);
      assert.equal(fixture.agents.isOwnedBy(child.localAgent.id, parent), true);
      const denied = await child.localAgent.ctx.get("tools")!.execute({ callId: ToolCallId("fallback-read-only"), name: "write", arguments: {}, agent: child.localAgent, signal: new AbortController().signal });
      assert.equal(denied.isError, true);
    } finally { await child.dispose(); }
  } finally { await fixture.dispose(); }
});

test("startup-lock owns finite RATE_LIMIT retries even when legacy recovery is disabled and downstream native retry is always", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: false }, roleRouting: { "dsmm-reviewer": {
    primary, fallbackRoutes: [backup], rateLimit: { ...immediate, maxRetries: 2 }
  } } });
  try {
    let hostCalls = 0;
    fixture.ctx.on("agent/request-error", async () => { hostCalls++; return { kind: "retry" }; });
    fixture.adapter.beforeStream = async () => { throw rateFailure(); };
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [primary.model, primary.model, primary.model]);
    assert.deepEqual(headerRoutes(agent), [primary]); assert.equal(hostCalls, 0);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "assistant/attempt").length, 3);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "user/message").length, 1);
  } finally { await fixture.dispose(); }
});

test("rate-limit-fallback counts distinct native failures and advances ordered routes with fresh bounded retries", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": {
    primary, fallbackRoutes: [backup, { ...backup, reasoningEffort: "max" }, last], strategy: "rate-limit-fallback",
    rateLimit: { ...immediate, maxRetries: 3, switchAfterRateLimits: 2, maxSwitches: 2 }
  } } });
  try {
    fixture.adapter.beforeStream = async (call) => { if (call.model !== last.model) throw rateFailure(); };
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent); await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [primary.model, primary.model, backup.model, backup.model, last.model, last.model]);
    assert.deepEqual(headerRoutes(agent), [primary, backup, { ...last, reasoningEffort: "high" }]);
    assert.equal(agent.session.requestHeader()?.adapterDefaults?.reasoningEffort, true);
  } finally { await fixture.dispose(); }
});

for (const strategy of ["startup-lock", "rate-limit-fallback"] as const) {
  for (const output of ["text", "reasoning", "tool-fragment", "completed-block"] as const) {
    test(`${strategy} partial ${output} then RATE_LIMIT refuses native always retry without replay or tool execution`, async () => {
      const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], strategy,
        rateLimit: { ...immediate, maxRetries: 3, switchAfterRateLimits: 1, maxSwitches: 2 } } } });
      try {
        let hostCalls = 0; let tools = 0;
        fixture.ctx.on("agent/request-error", async () => { hostCalls++; return { kind: "retry" }; });
        fixture.ctx.on("tools/pre-execute", async (_execution, next) => { tools++; return next(); });
        fixture.adapter.streamChunks = async function* (): AsyncIterable<StreamChunk> {
          if (output === "text") yield { type: "text-delta", index: 0, text: "accepted partial" };
          else if (output === "reasoning") yield { type: "reasoning-delta", index: 0, text: "accepted reasoning" };
          else if (output === "tool-fragment") yield { type: "tool-call-delta", index: 0, id: ToolCallId("partial-tool"), name: "read", argumentsDelta: "{" };
          else yield { type: "block-end", index: 0, block: { type: "text", text: "completed output" } };
          throw rateFailure();
        };
        const agent = await fixture.createAuxiliary("dsmm-reviewer");
        await runFixtureTurn(agent);
        assert.equal(fixture.adapter.calls.length, 1); assert.equal(hostCalls, 0); assert.equal(tools, 0);
        assert.equal(agent.session.snapshotEvents().some((event) => event.type === "tool/call" || event.type === "tool/result"), false);
        const attempts = agent.session.snapshotEvents().filter((event) => event.type === "assistant/attempt");
        assert.equal(attempts.length, 1); assert.ok(attempts[0].data.stream.length > 1);
      } finally { await fixture.dispose(); }
    });
  }
}

test("first actual native unavailable request may safely advance, but generic/auth/quota/context failures never authorize DSMM hopping", async () => {
  for (const code of ["NO_ADAPTER", "UNKNOWN_MODEL", "SERVER", "AUTH", "QUOTA", "CONTEXT_WINDOW_EXCEEDED"]) {
    const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], rateLimit: immediate } } });
    try {
      fixture.adapter.beforeStream = async (call) => { if (call.model === primary.model) throw new LlmError("deterministic classified failure", code); };
      const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
      assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), ["NO_ADAPTER", "UNKNOWN_MODEL"].includes(code) ? [primary.model, backup.model] : [primary.model]);
    } finally { await fixture.dispose(); }
  }
});

test("native UNKNOWN_MODEL preflight advances but unsupported exact effort is a hard no-request failure", async () => {
  for (const unavailable of [true, false]) {
    const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup] } } });
    try {
      if (unavailable) fixture.adapter.unavailableModels.add(primary.model);
      else fixture.adapter.unsupportedMaxModels.add(primary.model);
      const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
      assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), unavailable ? [backup.model] : []);
      assert.deepEqual(headerRoutes(agent), unavailable ? [backup] : []);
    } finally { await fixture.dispose(); }
  }
});

test("contradictory unavailable codes never classify auth/payment/rate-limit HTTP failures as startup absence", async () => {
  for (const status of [401, 403, 402, 429]) {
    const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], rateLimit: { ...immediate, maxRetries: 0 } } } });
    try {
      fixture.adapter.beforeStream = async () => { throw new LlmError("contradictory native unavailable signal", "NO_ADAPTER", { status }); };
      const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
      assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [primary.model], String(status));
      assert.deepEqual(headerRoutes(agent), [primary], String(status));
    } finally { await fixture.dispose(); }
  }
});

test("an inherited UNKNOWN_MODEL route preflights the effective global chain before native prepareCall and locks the backup", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: false, fallbackRoutes: [backup] } });
  try {
    fixture.adapter.unavailableModels.add("native-default");
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    assert.deepEqual(runtime.getSettings(agent as unknown as DshAgent).runtimeRecovery.fallbackRoutes, [backup]);
    assert.deepEqual(await selectInitialModelRoute(agent.ctx.get("llm") as unknown as DshLlmRuntime,
      [{ provider: "fixture", model: "native-default" }, backup]), backup);
    await runFixtureTurn(agent); await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [backup.model, backup.model]);
    assert.deepEqual(headerRoutes(agent), [backup]);
  } finally { await fixture.dispose(); }
});

test("no native-resolvable configured route refuses before any header or provider request", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": {
    primary: { provider: "missing-a", model: "absent-a" }, fallbackRoutes: [{ provider: "missing-b", model: "absent-b" }]
  } } });
  try {
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    assert.equal(fixture.adapter.calls.length, 0); assert.deepEqual(headerRoutes(agent), []);
    assert.equal(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "error"), true);
    assert.equal(agent.session.snapshotEvents().some((event) => event.type === "assistant/attempt"), false);
  } finally { await fixture.dispose(); }
});

test("an advisory-empty native catalog does not reject an exact manually configured resolvable route", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary } } });
  try {
    assert.deepEqual(await fixture.adapter.listModels(primary.provider), []);
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [primary]); assert.equal(fixture.adapter.calls.length, 1);
  } finally { await fixture.dispose(); }
});

test("initial legacy calibration becomes a concrete effort lock instead of recalibrating later attempts", async () => {
  const fixture = await nativeRoutingFixture({ deepseekV4ProCalibration: "strict" });
  try {
    const selection: ModelSelectionRef = { current: { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: ReasoningEffortId("low") }, assembled: undefined };
    const agent = await fixture.createAuxiliary("dsmm-reviewer", selection); await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [{ provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "max" }]);
    fixture.adapter.unsupportedMaxModels.add("deepseek-v4-pro");
    await runFixtureTurn(agent);
    assert.equal(fixture.adapter.calls.length, 1, "unsupported previously locked exact max must fail hard, not silently become high");
    assert.equal(headerRoutes(agent).length, 1);
  } finally { await fixture.dispose(); }
});

test("retry budget below rollover threshold and exhausted switch budget both stop without wrapping the chain", async () => {
  for (const bounds of [{ maxRetries: 1, switchAfterRateLimits: 3, maxSwitches: 2 }, { maxRetries: 1, switchAfterRateLimits: 1, maxSwitches: 1 }]) {
    const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup, last], strategy: "rate-limit-fallback", rateLimit: { ...immediate, ...bounds } } } });
    try {
      fixture.adapter.beforeStream = async () => { throw rateFailure(); };
      const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
      assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), bounds.switchAfterRateLimits === 3 ? [primary.model, primary.model] : [primary.model, backup.model]);
      assert.equal(fixture.adapter.calls.some(({ model }) => model === last.model), false);
    } finally { await fixture.dispose(); }
  }
});

test("zero retry budget and Retry-After above either cap terminate before host retry or early retry", async () => {
  for (const bounds of [{ ...immediate, maxRetries: 0 }, { initialDelayMs: 1, maxDelayMs: 2, maxTotalDelayMs: 5, maxRetries: 3 },
    { initialDelayMs: 1, maxDelayMs: 20, maxTotalDelayMs: 5, maxRetries: 3 }]) {
    const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], rateLimit: bounds } } });
    try {
      fixture.adapter.beforeStream = async () => { throw new LlmError("server minimum", "RATE_LIMIT", { status: 429, providerRetryAfterMs: 10 }); };
      const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
      assert.equal(fixture.adapter.calls.length, 1);
    } finally { await fixture.dispose(); }
  }
});

test("absent correlated attempt evidence refuses the owned RATE_LIMIT branch without calling host retry", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], rateLimit: immediate } } });
  try {
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    let hostCalls = 0;
    const action = await agentEvents(fixture.ctx, agent).waterfall("agent/request-error", { turn: 1, step: 1, provider: "fixture", failure: rateFailure().failure,
      retryPolicy: { mode: "always", initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 }, signal: new AbortController().signal }, async () => { hostCalls++; return { kind: "retry" }; });
    assert.equal(action, undefined); assert.equal(hostCalls, 0); assert.equal(fixture.adapter.calls.length, 1);
  } finally { await fixture.dispose(); }
});

test("fresh native cold Agent re-admits primary from its pinned profile instead of a historical fallback route", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], strategy: "rate-limit-fallback",
    rateLimit: { ...immediate, switchAfterRateLimits: 1, maxSwitches: 1 } } } });
  try {
    fixture.adapter.beforeStream = async (call) => { if (call.model === primary.model) throw rateFailure(); };
    const original = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(original);
    assert.deepEqual(headerRoutes(original), [primary, backup]);
    const persisted = JSON.parse(JSON.stringify(original.session.snapshotEvents()));
    fixture.adapter.beforeStream = undefined;
    const restored = await fixture.createAuxiliary("dsmm-reviewer", undefined, { seed: persisted });
    await runFixtureTurn(restored);
    assert.deepEqual(headerRoutes(restored).at(-1), primary);
    const markers = restored.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy");
    assert.equal(markers.length, 2); assert.notEqual(markers[0].data.policy, markers[1].data.policy);
  } finally { await fixture.dispose(); }
});

test("native roles own independent strategies and counters, and success resets consecutive RATE_LIMIT attempts", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: {
    "dsmm-reviewer": { primary, fallbackRoutes: [backup], strategy: "startup-lock", rateLimit: { ...immediate, maxRetries: 1 } },
    "dsmm-planner": { primary: { ...primary, model: "planner-primary" }, fallbackRoutes: [backup], strategy: "rate-limit-fallback",
      rateLimit: { ...immediate, maxRetries: 1, switchAfterRateLimits: 2, maxSwitches: 1 } }
  } });
  try {
    const failed = new Map<string, number>();
    fixture.adapter.beforeStream = async (call) => {
      if (call.model === backup.model) return;
      const count = failed.get(call.model) ?? 0; failed.set(call.model, count + 1);
      if (call.model === "planner-primary" || count % 2 === 0) throw rateFailure();
    };
    const reviewer = await fixture.createAuxiliary("dsmm-reviewer");
    const planner = await fixture.createAuxiliary("dsmm-planner");
    await Promise.all([runFixtureTurn(reviewer), runFixtureTurn(planner)]);
    await runFixtureTurn(reviewer);
    assert.deepEqual(fixture.adapter.calls.filter(({ model }) => model === primary.model).map(({ model }) => model), Array(4).fill(primary.model));
    assert.deepEqual(headerRoutes(reviewer), [primary]);
    assert.deepEqual(headerRoutes(planner), [{ ...primary, model: "planner-primary" }, backup]);
  } finally { await fixture.dispose(); }
});

test("abort while awaiting bounded Retry-After cancels pending native retry and never calls the downstream owner", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup],
    rateLimit: { initialDelayMs: 100, maxDelayMs: 100, maxTotalDelayMs: 100, maxRetries: 1 } } } });
  try {
    let ended!: () => void;
    const firstFailure = new Promise<void>((resolve) => { ended = resolve; });
    fixture.ctx.on("agent/assistant-stream", ({ frame }) => { if (frame.type === "end") ended(); });
    fixture.adapter.beforeStream = async () => { throw rateFailure(); };
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    const turn = runFixtureTurn(agent); await firstFailure;
    agent.cancel({ kind: "hook", reason: "deterministic abort during bounded backoff" }); await turn;
    assert.equal(fixture.adapter.calls.length, 1);
    assert.equal(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "aborted"), true);
  } finally { await fixture.dispose(); }
});

test("duplicate request-error delivery and mismatched native failure identity cannot consume another retry budget", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], rateLimit: { ...immediate, maxRetries: 1 } } } });
  try {
    let duplicateRefusals = 0;
    fixture.ctx.on("agent/request-error", async (frame, next) => {
      const first = await next();
      const duplicate = await next();
      assert.equal(duplicate, undefined); duplicateRefusals++;
      return first;
    }, { prepend: true });
    fixture.adapter.beforeStream = async () => { throw rateFailure(); };
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    assert.equal(fixture.adapter.calls.length, 2); assert.equal(duplicateRefusals, 2);
  } finally { await fixture.dispose(); }
});

test("two admitted profiles independently select different strategies for the same native role", async () => {
  const fixture = await nativeRoutingFixture({}, { headless: true });
  try {
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    await fixture.create();
    const save = (id: string, strategy: "startup-lock" | "rate-limit-fallback") => runtime.save({ id, expectedRevision: null,
      content: JSON.stringify({ version: 1, id, settings: { roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup], strategy,
        rateLimit: { ...immediate, maxRetries: 1, switchAfterRateLimits: 1, maxSwitches: 1 } } } } }) });
    const a = await save("profile-a", "startup-lock");
    await runtime.select({ id: a.id, expectedRevision: a.revision, expectedSelectionRevision: "absent" });
    const first = await fixture.createAuxiliary("dsmm-reviewer");
    const b = await save("profile-b", "rate-limit-fallback");
    await runtime.select({ id: b.id, expectedRevision: b.revision, expectedSelectionRevision: (await runtime.describe()).selectionRevision });
    const second = await fixture.createAuxiliary("dsmm-reviewer");
    fixture.adapter.beforeStream = async (call) => { if (call.model === primary.model) throw rateFailure(); };
    await Promise.all([runFixtureTurn(first), runFixtureTurn(second)]);
    assert.deepEqual(headerRoutes(first), [primary]);
    assert.equal(first.session.snapshotEvents().filter((event) => event.type === "assistant/attempt").length, 2);
    assert.deepEqual(headerRoutes(second), [primary, backup]);
    assert.equal(second.session.snapshotEvents().filter((event) => event.type === "assistant/attempt").length, 1);
    assert.equal(runtime.admission(first as unknown as DshAgent).profile?.id, "profile-a");
    assert.equal(runtime.admission(second as unknown as DshAgent).profile?.id, "profile-b");
  } finally { await fixture.dispose(); }
});

test("accepted previous-step tools are executed once and never replayed by a later safe native request retry", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, rateLimit: { ...immediate, maxRetries: 1 } } } });
  try {
    let tools = 0;
    fixture.ctx.on("tools/execute", async (_execution, next) => { tools++; return next(); });
    fixture.adapter.streamChunks = async function* (): AsyncIterable<StreamChunk> {
      if (fixture.adapter.calls.length === 1) {
        yield { type: "block-end", index: 0, block: { type: "tool-call", id: ToolCallId("completed-prior-read"), name: "read", arguments: "{}" } };
        yield { type: "finish", reason: { kind: "tool-calls" } };
      } else if (fixture.adapter.calls.length === 2) throw rateFailure();
      else {
        yield { type: "block-end", index: 0, block: { type: "text", text: "complete after safe retry" } };
        yield { type: "finish", reason: { kind: "stop" } };
      }
    };
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    assert.equal(fixture.adapter.calls.length, 3); assert.equal(tools, 1);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "tool/call").length, 1);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "tool/result").length, 1);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "user/message").length, 1);
  } finally { await fixture.dispose(); }
});

test("a later unavailable failure cannot reopen startup admission after a successful native attempt", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [backup] } } });
  try {
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    fixture.adapter.beforeStream = async () => { throw new LlmError("late exact route absence", "UNKNOWN_MODEL"); };
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map(({ model }) => model), [primary.model, primary.model]);
    assert.deepEqual(headerRoutes(agent), [primary]);
  } finally { await fixture.dispose(); }
});

test("bounded server Retry-After delay spends the total budget and cannot be bypassed by native always", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary, rateLimit: {
    initialDelayMs: 0, maxDelayMs: 5, maxTotalDelayMs: 5, maxRetries: 10 } } } });
  try {
    let hostCalls = 0;
    fixture.ctx.on("agent/request-error", async () => { hostCalls++; return { kind: "retry" }; });
    fixture.adapter.beforeStream = async () => { throw new LlmError("bounded server minimum", "RATE_LIMIT", { status: 429, providerRetryAfterMs: 3 }); };
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    assert.equal(fixture.adapter.calls.length, 2); assert.equal(hostCalls, 0);
    const runtime = (fixture.ctx as unknown as DshContext).get!<DsmmProfileRuntime>("dsmmProfileRuntime")!;
    const admission = runtime.getSettings.admission!(agent as unknown as DshAgent);
    const state = roleRouteRuntimeState(agent as unknown as DshAgent, admission.settings, "dsmm-reviewer", admission.epoch);
    assert.equal(state.totalDelayMs, 3); assert.equal(state.retries, 1); assert.equal(state.rateLimitFailures, 2);
  } finally { await fixture.dispose(); }
});

test("native RATE_LIMIT rollover changes provider channel with exact effort, finite caps and no completed-tool replay", async () => {
  const secondaryRoute = { provider: "fixture-secondary-channel", model: "secondary-route", reasoningEffort: "low" };
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary,
    fallbackRoutes: [secondaryRoute, primary, { ...secondaryRoute, model: "must-not-reach", reasoningEffort: "high" }],
    strategy: "rate-limit-fallback", rateLimit: { ...immediate, maxRetries: 1, switchAfterRateLimits: 2, maxSwitches: 1 }
  } } });
  try {
    const secondaryAdapter = new RoutingFixtureAdapter();
    fixture.ctx.get("llm")!.registerAdapter([secondaryRoute.provider], secondaryAdapter);
    secondaryAdapter.rateLimitModels.add(secondaryRoute.model);
    let tools = 0;
    fixture.ctx.on("tools/execute", async (_execution, next) => { tools++; return next(); });
    fixture.adapter.streamChunks = async function* (): AsyncIterable<StreamChunk> {
      if (fixture.adapter.calls.length === 1) {
        yield { type: "block-end", index: 0, block: { type: "tool-call", id: ToolCallId("cross-channel-prior-read"), name: "read", arguments: "{}" } };
        yield { type: "finish", reason: { kind: "tool-calls" } };
      } else throw rateFailure();
    };
    const agent = await fixture.createAuxiliary("dsmm-reviewer"); await runFixtureTurn(agent);
    const routes = (adapter: RoutingFixtureAdapter) => adapter.calls.map(({ provider, model, reasoningEffort }) => ({ provider, model, reasoningEffort }));
    assert.deepEqual(routes(fixture.adapter), [primary, primary, primary]);
    assert.deepEqual(routes(secondaryAdapter), [secondaryRoute, secondaryRoute]);
    assert.deepEqual(headerRoutes(agent), [primary, secondaryRoute]);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "assistant/attempt").length, 4);
    assert.equal(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "error"), true);
    secondaryAdapter.rateLimitModels.clear();
    await runFixtureTurn(agent);
    assert.deepEqual(routes(fixture.adapter), [primary, primary, primary], "the admitted secondary channel never wraps back to primary");
    assert.deepEqual(routes(secondaryAdapter), [secondaryRoute, secondaryRoute, secondaryRoute]);
    assert.deepEqual(headerRoutes(agent), [primary, secondaryRoute]);
    assert.equal([...agent.session.snapshotEvents()].reverse().find((event) => event.type === "turn/end")?.data.reason.kind, "completed");
    assert.equal(tools, 1);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "tool/call").length, 1);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "tool/result").length, 1);
  } finally { await fixture.dispose(); }
});
