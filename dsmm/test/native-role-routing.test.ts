import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "@deepseek-ai/cordis";
import { agentEvents } from "@deepseek-ai/dsh-agent";
import type { ModelSelectionRef } from "@deepseek-ai/dsh-agent";
import { LlmError, ReasoningEffortId, ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { Session, SessionId, SessionLogOffset } from "@deepseek-ai/dsh-session";
import { foldSubagentDescriptor, snapshotSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import type { ResolvedSubagentStartRequest, SubagentProvider, SubagentResult } from "@deepseek-ai/dsh-subagent";
import { apply, createDsmmStatusSnapshot, resolveConfig, resolveEffectiveDsmmRole } from "../lib/index.js";
import type { DsmmPluginConfig } from "../lib/index.js";
import type { DshAgent, DshContext } from "../lib/dsh-types.js";
import { headerRoutes, nativeRoutingFixture as createNativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";

/** Earlier fallback fixtures opt in explicitly; production omission remains startup-lock. */
function nativeRoutingFixture(config: DsmmPluginConfig = {}, options: Parameters<typeof createNativeRoutingFixture>[1] = {}) {
  // Canonical role dispatch now requires actual admitted coordinator authority,
  // not the fixture's former ability to call aliases from an inactive root.
  config = { defaultActive: true, ...config };
  return createNativeRoutingFixture(config.runtimeRecovery?.enabled ? {
    ...config, runtimePolicy: { strategy: "rate-limit-fallback", rateLimit: {
      initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, maxRetries: 0,
      switchAfterRateLimits: 1, maxSwitches: config.runtimeRecovery.maxFallbackAttempts ?? 2
    }, ...config.runtimePolicy }
  } : config, options);
}

const reviewer = { provider: "fixture", model: "review-primary", reasoningEffort: "max" };
const backup = { provider: "fixture", model: "review-backup", reasoningEffort: "max" };
const oracle = { provider: "fixture", model: "oracle-primary", reasoningEffort: "high" };

test("genuine live role children preserve explicit native provider/model and effort overrides in final headers and streams", async () => {
  const primary = { provider: "fixture", model: "profile-alpha", reasoningEffort: "max" };
  const fixture = await nativeRoutingFixture({ defaultActive: true, deepseekV4ProCalibration: "strict", roleRouting: { "dsmm-reviewer": { primary } } });
  try {
    const parent = await fixture.create();
    for (const scenario of [
      { name: "full-route", agentOptions: { provider: "deepseek-official", model: "explicit-beta", reasoningEffort: ReasoningEffortId("low") }, expected: { provider: "deepseek-official", model: "explicit-beta", reasoningEffort: "low" } },
      { name: "full-route-default-effort", agentOptions: { provider: "deepseek-official", model: "explicit-default" }, expected: { provider: "deepseek-official", model: "explicit-default", reasoningEffort: "high" } },
      { name: "effort-only", agentOptions: { reasoningEffort: ReasoningEffortId("low") }, expected: { ...primary, reasoningEffort: "low" } },
      { name: "default-primary", agentOptions: undefined, expected: primary }
    ]) {
      const child = await fixture.subagents.start("dsmm-role-reviewer", {
        parent, prompt: [{ type: "text", text: "Verify exact native role request priority" }], signal: new AbortController().signal,
        ...(scenario.agentOptions === undefined ? {} : { agentOptions: scenario.agentOptions }),
        persona: "spoofed dsmm-orchestrator", toolFilter: { allow: ["read", "glob", "grep"] }
      });
      try {
        assert.equal((await child.result).stopReason, "completed", scenario.name);
        assert.ok(child.localAgent);
        assert.equal(fixture.agents.isOwnedBy(child.localAgent.id, parent), true);
        assert.deepEqual(headerRoutes(child.localAgent), [scenario.expected], scenario.name);
        const streamed = fixture.adapter.calls.at(-1)!;
        assert.deepEqual({ provider: streamed.provider, model: streamed.model, reasoningEffort: streamed.reasoningEffort }, scenario.expected, scenario.name);
        const tools = child.localAgent.ctx.get("tools")!;
        for (const name of ["write", "edit", "bash", "pwsh", "dsmm_reviewer"]) {
          const denied = await tools.execute({ callId: ToolCallId(`explicit-child-${scenario.name}-${name}`), name, arguments: {}, agent: child.localAgent, signal: new AbortController().signal });
          assert.equal(denied.isError, true, `${scenario.name}:${name}`);
        }
      } finally { await child.dispose(); }
    }
    const count = fixture.agents.list().length;
    const streamedCount = fixture.adapter.calls.length;
    await assert.rejects(fixture.subagents.start("dsmm-role-reviewer", {
      parent, prompt: [{ type: "text", text: "Reject invalid native route before child allocation" }], signal: new AbortController().signal,
      agentOptions: { provider: "missing-native-fixture", model: "explicit-invalid", reasoningEffort: ReasoningEffortId("low") }
    }), /provider/u);
    assert.equal(fixture.agents.list().length, count);
    assert.equal(fixture.adapter.calls.length, streamedCount);
  } finally { await fixture.dispose(); }
});

test("a live role child's effort-only override stays exact even on a strict legacy-calibrated DeepSeek route", async () => {
  const primary = { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "max" };
  const fixture = await nativeRoutingFixture({ defaultActive: true, deepseekV4ProCalibration: "strict", roleRouting: { "dsmm-reviewer": { primary } } });
  try {
    const parent = await fixture.create();
    const child = await fixture.subagents.start("dsmm-role-reviewer", {
      parent, prompt: [{ type: "text", text: "Preserve exact admitted native effort" }], signal: new AbortController().signal,
      agentOptions: { reasoningEffort: ReasoningEffortId("low") }
    });
    try {
      assert.equal((await child.result).stopReason, "completed");
      assert.ok(child.localAgent);
      assert.deepEqual(headerRoutes(child.localAgent), [{ ...primary, reasoningEffort: "low" }]);
      assert.equal(fixture.adapter.calls.at(-1)?.reasoningEffort, "low");
    } finally { await child.dispose(); }
  } finally { await fixture.dispose(); }
});

test("live explicit child routes retain ordered exact profile fallbacks on later turns while unowned restored children use the current primary", async () => {
  const primary = { provider: "fixture", model: "profile-alpha", reasoningEffort: "max" };
  const explicit = { provider: "fixture", model: "explicit-beta", reasoningEffort: "low" };
  const firstBackup = { provider: "fixture", model: "profile-gamma", reasoningEffort: "max" };
  const secondBackup = { provider: "fixture", model: "profile-delta", reasoningEffort: "high" };
  const fixture = await nativeRoutingFixture({ defaultActive: true, runtimeRecovery: { enabled: true, maxFallbackAttempts: 2 }, roleRouting: { "dsmm-reviewer": { primary, fallbackRoutes: [firstBackup, secondBackup] } } });
  try {
    const parent = await fixture.create();
    fixture.adapter.rateLimitModels.add(explicit.model); fixture.adapter.rateLimitModels.add(firstBackup.model);
    const child = await fixture.subagents.start("dsmm-role-reviewer", {
      parent, prompt: [{ type: "text", text: "Verify explicit child fallback ownership" }], signal: new AbortController().signal,
      agentOptions: { ...explicit, reasoningEffort: ReasoningEffortId(explicit.reasoningEffort) }, toolFilter: { allow: ["read", "glob", "grep"] }
    });
    let persisted: ReturnType<typeof parent.session.snapshotEvents>;
    try {
      assert.equal((await child.result).stopReason, "completed");
      assert.ok(child.localAgent);
      assert.deepEqual(headerRoutes(child.localAgent), [explicit, firstBackup, secondBackup]);
      assert.deepEqual(fixture.adapter.calls.map((call) => ({ provider: call.provider, model: call.model, reasoningEffort: call.reasoningEffort })), [explicit, firstBackup, secondBackup]);
      await runFixtureTurn(child.localAgent);
      assert.deepEqual(headerRoutes(child.localAgent).at(-1), secondBackup, "the live child's fallback remains exact instead of reverting to explicit or configured primary");
      persisted = JSON.parse(JSON.stringify(child.localAgent.session.snapshotEvents()));
    } finally { await child.dispose(); }
    fixture.adapter.rateLimitModels.clear();
    const restored = await fixture.create({ origin: "subagent", agentPreset: "dsmm-orchestrator" }, undefined, { seed: persisted });
    assert.equal(fixture.agents.isOwnedBy(restored.id, parent), false);
    await runFixtureTurn(restored);
    assert.deepEqual(headerRoutes(restored).at(-1), primary, "a durable child descriptor and parent persona alone cannot grant live alias admission on restoration");
  } finally { await fixture.dispose(); }
});

test("native final request headers honor fixed role primary after host installModelSelection next()", async () => {
  for (const calibration of ["auto", "strict"] as const) {
    const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary: reviewer } }, deepseekV4ProCalibration: calibration });
    try {
      const selection: ModelSelectionRef = { current: { provider: "fixture", model: "host-inherited", reasoningEffort: ReasoningEffortId("high") }, assembled: undefined };
      const agent = await fixture.createAuxiliary("dsmm-reviewer", selection);
      await runFixtureTurn(agent);
      assert.deepEqual(headerRoutes(agent), [reviewer]);
      assert.equal(fixture.adapter.calls.length, 1);
      assert.equal(fixture.adapter.calls[0].reasoningEffort, "max");
    } finally { await fixture.dispose(); }
  }
});

test("native local failure fixture persists exact role fallback despite sticky host selection and later turns", async () => {
  const fixture = await nativeRoutingFixture({
    runtimeRecovery: { enabled: true, fallbackRoutes: [{ provider: "fixture", model: "wrong-global" }] },
    roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } }
  });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    const selection: ModelSelectionRef = { current: { provider: "fixture", model: "host-inherited", reasoningEffort: ReasoningEffortId("high") }, assembled: undefined };
    const agent = await fixture.createAuxiliary("dsmm-reviewer", selection);
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [reviewer, backup]);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model, backup.model]);
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model, backup.model, backup.model]);
    assert.deepEqual(headerRoutes(agent).at(-1), backup);
  } finally { await fixture.dispose(); }
});

test("explicit rollover is independent of the legacy continuation gate, respects empty chains and inherits omitted chains", async () => {
  for (const scenario of [
    { enabled: false, chain: [backup], expected: [reviewer.model, backup.model] },
    { enabled: true, chain: [], expected: [reviewer.model] },
    { enabled: true, chain: undefined, expected: [reviewer.model, "global-backup"] }
  ]) {
    const fixture = await nativeRoutingFixture({
      runtimeRecovery: { enabled: scenario.enabled, fallbackRoutes: [{ provider: "fixture", model: "global-backup", reasoningEffort: "high" }] },
      roleRouting: { "dsmm-reviewer": { primary: reviewer, strategy: "rate-limit-fallback", rateLimit: {
        initialDelayMs: 0, maxDelayMs: 0, maxTotalDelayMs: 0, maxRetries: 0, switchAfterRateLimits: 1, maxSwitches: 2
      }, ...(scenario.chain === undefined ? {} : { fallbackRoutes: scenario.chain }) } }
    });
    try {
      fixture.adapter.rateLimitModels.add(reviewer.model);
      const agent = await fixture.createAuxiliary("dsmm-reviewer");
      await runFixtureTurn(agent);
      assert.deepEqual(fixture.adapter.calls.map((call) => call.model), scenario.expected);
      assert.deepEqual(headerRoutes(agent).map((route) => route.model), scenario.expected);
    } finally { await fixture.dispose(); }
  }
});

test("native route with omitted effort clears incompatible inherited and primary effort to adapter default", async () => {
  const fixture = await nativeRoutingFixture({
    runtimeRecovery: { enabled: true },
    roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [{ provider: "fixture", model: "default-effort-backup" }] } }
  });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [reviewer, { provider: "fixture", model: "default-effort-backup", reasoningEffort: "high" }]);
    assert.equal(agent.session.requestHeader()?.adapterDefaults?.reasoningEffort, true);
  } finally { await fixture.dispose(); }
});

test("unsupported exact named max is rejected by native validation without a high stream", async () => {
  const primary = { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "max" };
  const fixture = await nativeRoutingFixture({ deepseekV4ProCalibration: "strict", roleRouting: { "dsmm-reviewer": { primary } } });
  try {
    fixture.adapter.unsupportedMaxModels.add(primary.model);
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), []);
    assert.equal(fixture.adapter.calls.length, 0);
    assert.ok(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "error"));
  } finally { await fixture.dispose(); }
});

test("native root preset switches never rewrite the model tab and disabled roles remain inert", async () => {
  const fixture = await nativeRoutingFixture({
    roles: { "dsmm-builder": false },
    roleRouting: { "dsmm-reviewer": { primary: reviewer }, "dsmm-oracle": { primary: oracle }, "dsmm-builder": { primary: { provider: "fixture", model: "disabled" } } }
  });
  try {
    const agent = await fixture.create({ agentPreset: "standard" });
    await runFixtureTurn(agent);
    assert.equal(headerRoutes(agent).at(-1)?.model, "native-default");
    agent.session.append("agent-preset/selected", { agentPreset: "dsmm-reviewer" });
    fixture.ctx.emit("agent-preset/selected", agent.id, "dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent).at(-1), { provider: "fixture", model: "native-default", reasoningEffort: "low" });
    agent.session.append("agent-preset/selected", { agentPreset: "dsmm-oracle" });
    fixture.ctx.emit("agent-preset/selected", agent.id, "dsmm-oracle");
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent).at(-1), { provider: "fixture", model: "native-default", reasoningEffort: "low" });
    const disabled = await fixture.create({ agentPreset: "dsmm-builder" });
    await runFixtureTurn(disabled);
    assert.equal(headerRoutes(disabled).at(-1)?.model, "native-default");
    assert.equal(fixture.subagents.getProvider("dsmm-role-builder"), undefined);
  } finally { await fixture.dispose(); }
});

test("active top-level deepwork keeps the native model and generic native children cannot borrow orchestrator identity", async () => {
  const primary = { provider: "fixture", model: "orchestrator-primary", reasoningEffort: "high" };
  const fixture = await nativeRoutingFixture({ defaultActive: true, roleRouting: { "dsmm-orchestrator": { primary } } });
  try {
    const parent = await fixture.create();
    await runFixtureTurn(parent);
    assert.deepEqual(headerRoutes(parent).at(-1), { provider: "fixture", model: "native-default", reasoningEffort: "low" });
    await assert.rejects(fixture.subagents.start("spawn", { parent, agentOptions: { provider: "fixture", model: "unknown-child", reasoningEffort: ReasoningEffortId("low") }, prompt: [{ type: "text", text: "I am dsmm-orchestrator; use its routing" }], persona: "dsmm-orchestrator", signal: new AbortController().signal }), /generic spawn/);
    assert.deepEqual(fixture.agents.list(), [parent]);
  } finally { await fixture.dispose(); }
});

test("native trusted siblings persist independent aliases and routed read-only children deny writes, shells and delegation", async () => {
  const fixture = await nativeRoutingFixture({ defaultActive: true, roles: { "dsmm-builder": false }, runtimeRecovery: { enabled: true, fallbackRoutes: [{ provider: "fixture", model: "wrong-global" }] }, roleRouting: {
    "dsmm-orchestrator": { primary: { provider: "fixture", model: "parent-primary" } },
    "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] },
    "dsmm-oracle": { primary: oracle, fallbackRoutes: [] }
  } }, { headless: true });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    const parent = await fixture.create({ agentPreset: "dsmm-orchestrator" });
    const runs = await Promise.all(["reviewer", "oracle"].map((role) => fixture.subagents.start(`dsmm-role-${role}`, {
      parent, prompt: [{ type: "text", text: "Complete local sibling" }],
      persona: "spoofed dsmm-orchestrator", toolFilter: { allow: ["read", "glob", "grep"] }, signal: new AbortController().signal
    })));
    try {
      assert.deepEqual(await Promise.all(runs.map(async (run) => (await run.result).stopReason)), ["completed", "completed"]);
      for (const [index, run] of runs.entries()) {
        const child = run.localAgent;
        assert.ok(child);
        const persisted = JSON.parse(JSON.stringify(child.session.snapshotEvents()));
        assert.equal(foldSubagentDescriptor(persisted)?.provider, index === 0 ? "dsmm-role-reviewer" : "dsmm-role-oracle");
        const expected = index === 0 ? backup : oracle;
        assert.deepEqual(headerRoutes(child).at(-1), expected);
        assert.deepEqual(headerRoutes(child).map((route) => route.model), index === 0 ? [reviewer.model, backup.model] : [oracle.model]);
        const restored = Session.create(child.id, persisted, child.session.header, child.session.inheritedEventCount);
        assert.equal(foldSubagentDescriptor(restored.snapshotEvents())?.provider, index === 0 ? "dsmm-role-reviewer" : "dsmm-role-oracle");
        const tools = child.ctx.get("tools");
        assert.ok(tools);
        assert.ok(tools.get("read", child));
        for (const name of ["write", "edit", "bash", "pwsh", "shell", "dsmm_reviewer", "dsmm_oracle", "dsmm_builder"]) {
          assert.equal(tools.get(name, child), undefined, `${index}:${name}`);
          const denied = await tools.execute({ callId: ToolCallId(`deny-${index}-${name}`), name, arguments: {}, agent: child, signal: new AbortController().signal });
          assert.equal(denied.isError, true, `${index}:${name} execution`);
        }
      }
    } finally { await Promise.all(runs.map((run) => run.dispose())); }
  } finally { await fixture.dispose(); }
});

test("native alias forwards exact resolved request and descriptor, rejects missing/incompatible spawn without revoking accepted runs", async () => {
  const fixture = await nativeRoutingFixture({}, { spawn: false });
  try {
    const parent = await fixture.create();
    const signal = new AbortController().signal;
    const request = { parent, signal, prompt: [{ type: "text" as const, text: "Local alias lifecycle" }] };
    await assert.rejects(fixture.subagents.start("dsmm-role-reviewer", request), /spawn|provider/i);
    let accepted: ResolvedSubagentStartRequest | undefined;
    let disposals = 0;
    let settle!: (result: SubagentResult) => void;
    const pendingResult = new Promise<SubagentResult>((resolve) => { settle = resolve; });
    const nativeLike: SubagentProvider = {
      name: "spawn", inheritsParentContext: false,
      capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
      async start(resolved) {
        accepted = resolved;
        return { id: SessionId("accepted-alias-fixture"), localAgent: undefined, result: pendingResult, async dispose() { disposals++; } };
      }
    };
    const remove = fixture.subagents.registerProvider(nativeLike);
    const run = await fixture.subagents.start("dsmm-role-reviewer", request);
    assert.ok(accepted);
    assert.equal(accepted.parent, parent);
    assert.equal(accepted.signal, signal);
    assert.equal(accepted.prompt, request.prompt);
    assert.equal(accepted.descriptor.provider, "dsmm-role-reviewer");
    assert.equal(accepted.descriptor.mode, "one-shot");
    assert.equal(fixture.subagents.getProvider("dsmm-role-reviewer")?.prepareContinuable, undefined);
    remove();
    const replacement = fixture.subagents.registerProvider({ ...nativeLike, capabilities: { ...nativeLike.capabilities, toolFilter: false } });
    await assert.rejects(fixture.subagents.start("dsmm-role-reviewer", { ...request, toolFilter: { allow: ["read"] } }), /capabilit|spawn|filter/i);
    replacement();
    await fixture.dsmmFiber.dispose();
    assert.equal(fixture.subagents.getProvider("dsmm-role-reviewer"), undefined);
    assert.equal(disposals, 0, "effect-owned alias must not own an accepted native run");
    settle({ output: [], stopReason: "completed" });
    assert.equal((await run.result).stopReason, "completed");
    await run.dispose();
    assert.equal(disposals, 1);
  } finally { await fixture.dispose(); }
});

test("native descriptor folding is first-authoritative and role status distinguishes policy from persisted route", () => {
  const fresh = Session.create(SessionId("role-status-restored"));
  const session = Session.create(fresh.id, [], { ...fresh.header, origin: "subagent", agentPreset: "dsmm-orchestrator" });
  session.append("turn/start", { turn: 1 });
  session.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "one-shot", provider: "dsmm-role-reviewer" }));
  session.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "one-shot", provider: "dsmm-role-oracle" }));
  session.append("turn/end", { turn: 1, reason: { kind: "completed" } });
  assert.equal(foldSubagentDescriptor(session.snapshotEvents())?.provider, "dsmm-role-reviewer");
  const agent = { session, options: backup } as unknown as DshAgent;
  const settings = resolveConfig({ roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } }, runtimeRecovery: { enabled: true } });
  const snapshot = createDsmmStatusSnapshot({ agent, settings, modeActive: true });
  assert.equal(snapshot.route.model, backup.model);
  assert.equal(snapshot.effectiveSettings.roleRouting["dsmm-reviewer"]?.primary?.model, reviewer.model);
  assert.equal(snapshot.runtimeRecovery.fallbackRouteCount, 1);
});

test("native child identity folds only its own suffix across inherited ancestor descriptors and compacted surface", () => {
  const ancestor = Session.create(SessionId("role-ancestor-fixture"));
  ancestor.append("turn/start", { turn: 1 });
  ancestor.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "one-shot", provider: "dsmm-role-oracle" }));
  ancestor.append("user/message", createUserMessage({ content: [{ type: "text", text: "Ancestor says dsmm-oracle" }], source: { kind: "user" } }), { surfaceOp: "append" });
  ancestor.append("turn/end", { turn: 1, reason: { kind: "completed" } });
  const inherited = ancestor.snapshotEvents();
  const fresh = Session.create(SessionId("role-seeded-child-fixture"));
  const child = Session.create(fresh.id, inherited, { ...fresh.header, origin: "subagent", isSeeded: true, parentSession: ancestor.id, agentPreset: "dsmm-orchestrator" }, SessionLogOffset(inherited.length));
  const settings = resolveConfig({ roleRouting: { "dsmm-oracle": { primary: oracle }, "dsmm-reviewer": { primary: reviewer } } });
  const agent = { session: child } as unknown as DshAgent;
  assert.equal(resolveEffectiveDsmmRole(agent, settings, true), undefined, "inherited alias and parent preset cannot classify a child");
  child.append("turn/start", { turn: 2 });
  child.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "one-shot", provider: "dsmm-role-reviewer" }));
  const original = child.append("user/message", createUserMessage({ content: [{ type: "text", text: "Owned user message" }], source: { kind: "user" } }), { surfaceOp: "append" });
  child.append("user/message", createUserMessage({ content: [{ type: "text", text: "Compacted surface summary" }], source: { kind: "user" } }), { surfaceOp: { op: "replace", startSeq: original.seq, endSeq: original.seq }, sourceEventSeqs: [original.seq] });
  child.append("turn/end", { turn: 2, reason: { kind: "completed" } });
  assert.equal(resolveEffectiveDsmmRole(agent, settings, true), "dsmm-reviewer");
  assert.equal(foldSubagentDescriptor(child.snapshotEvents())?.provider, "dsmm-role-oracle", "whole-log native fold demonstrates why inherited prefix must be excluded");
  const reloaded = Session.create(child.id, JSON.parse(JSON.stringify(child.snapshotEvents())), child.header, child.inheritedEventCount);
  assert.equal(resolveEffectiveDsmmRole({ session: reloaded } as unknown as DshAgent, settings, true), "dsmm-reviewer");
  assert.ok(reloaded.deriveMessages().some((message) => message.content.some((block) => block.type === "text" && block.text === "Compacted surface summary")));
});

test("unknown and malformed native child descriptors never borrow parent role or fallback chain", () => {
  const settings = resolveConfig({ defaultActive: true, runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-orchestrator": { primary: reviewer, fallbackRoutes: [backup] } } });
  for (const descriptor of [
    undefined,
    { version: 3, mode: "one-shot", provider: "spawn", label: "dsmm-reviewer" },
    { version: 99, mode: "one-shot", provider: "dsmm-role-reviewer" },
    { version: 3, mode: "one-shot", provider: 42 }
  ]) {
    const fresh = Session.create(SessionId(`unknown-child-${String(descriptor?.provider)}`));
    const child = Session.create(fresh.id, [], { ...fresh.header, origin: "subagent", agentPreset: "dsmm-orchestrator" });
    child.append("turn/start", { turn: 1 });
    if (descriptor !== undefined) child.append("subagent/descriptor", descriptor as ReturnType<typeof snapshotSubagentDescriptor>);
    child.append("turn/end", { turn: 1, reason: { kind: "completed" } });
    const snapshot = createDsmmStatusSnapshot({ agent: { session: child } as unknown as DshAgent, settings, modeActive: true });
    assert.equal(snapshot.rolePolicy.role, undefined);
    assert.equal(snapshot.rolePolicy.primary, undefined);
    assert.deepEqual(snapshot.rolePolicy.fallbackRoutes, []);
    assert.equal(snapshot.rolePolicy.diagnostic, descriptor?.provider === 42 ? "invalid-child-descriptor" : undefined);
    const inactive = createDsmmStatusSnapshot({ agent: { session: child } as unknown as DshAgent, settings, modeActive: false });
    assert.equal(inactive.mode.inScope, false, "unknown child cannot borrow selected parent preset scope");
    assert.equal(inactive.runtimeRecovery.applies, false);
  }
});

test("native headless role tool fixes child options while retaining alias identity and disabled builder absence", async () => {
  const fixture = await nativeRoutingFixture({ defaultActive: true, roles: { "dsmm-builder": false }, roleRouting: { "dsmm-reviewer": { primary: reviewer } } }, { headless: true });
  try {
    const parent = await fixture.create();
    const children: Array<NonNullable<Awaited<ReturnType<typeof fixture.subagents.start>>["localAgent"]>> = [];
    fixture.ctx.on("subagent/start", (info) => {
      const child = fixture.agents.get(info.id);
      if (child !== undefined) children.push(child);
    }, { global: true });
    const tools = parent.ctx.get("tools");
    assert.ok(tools);
    assert.equal(tools.get("dsmm_builder", parent), undefined);
    const result = await tools.execute({
      callId: ToolCallId("role-routed-headless-tool"), name: "dsmm_reviewer",
      arguments: { description: "Review the local fixture", prompt: "Complete the local fixture" },
      agent: parent, signal: new AbortController().signal
    });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(children.length, 1);
    assert.equal(children[0].options.provider, reviewer.provider);
    assert.equal(children[0].options.model, reviewer.model);
    assert.equal(children[0].options.reasoningEffort, reviewer.reasoningEffort);
    assert.equal(foldSubagentDescriptor(children[0].session.snapshotEvents())?.provider, "dsmm-role-reviewer");
    assert.deepEqual(headerRoutes(children[0]).at(-1), reviewer);
  } finally { await fixture.dispose(); }
});

test("native role fallback-only chain retains admitted choice across later sticky-selection turns", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { fallbackRoutes: [backup] } } });
  try {
    fixture.adapter.rateLimitModels.add("host-inherited");
    const selection: ModelSelectionRef = { current: { provider: "fixture", model: "host-inherited", reasoningEffort: ReasoningEffortId("high") }, assembled: undefined };
    const agent = await fixture.createAuxiliary("dsmm-reviewer", selection);
    await runFixtureTurn(agent);
    await runFixtureTurn(agent);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), ["host-inherited", backup.model, backup.model]);
    assert.deepEqual(headerRoutes(agent).at(-1), backup);
  } finally { await fixture.dispose(); }
});

test("native host-owned durable route change wins over primary and DSMM global fallback", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true, fallbackRoutes: [{ provider: "fixture", model: "wrong-global" }] }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } });
  try {
    fixture.adapter.failModels.add(reviewer.model);
    const host = { provider: "fixture", model: "host-owned", reasoningEffort: ReasoningEffortId("high") };
    let retries = 0;
    fixture.ctx.on("agent/request-error", async (frame, next) => {
      await next();
      const previous = frame.agent.session.requestHeader();
      assert.ok(previous);
      frame.agent.session.append("request/header", { reason: "change", header: { ...previous, config: { ...previous.config, ...host } } });
      retries++;
      return { kind: "retry" };
    });
    const selection: ModelSelectionRef = { current: { provider: "fixture", model: "host-inherited", reasoningEffort: ReasoningEffortId("low") }, assembled: undefined };
    const agent = await fixture.createAuxiliary("dsmm-reviewer", selection);
    await runFixtureTurn(agent);
    await runFixtureTurn(agent);
    assert.equal(retries, 1);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model, host.model, host.model]);
    assert.deepEqual(headerRoutes(agent).at(-1), host);
  } finally { await fixture.dispose(); }
});

test("native host durable header change after admitted fallback abandons pending DSMM choice", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    const host = { provider: "fixture", model: "host-after-admission", reasoningEffort: ReasoningEffortId("high") };
    let changed = false;
    fixture.ctx.on("agent/request-error", async (frame, next) => {
      const decision = await next();
      assert.deepEqual(decision, { kind: "retry" }, "DSMM fallback was already admitted before host durable selection");
      const previous = frame.agent.session.requestHeader();
      assert.ok(previous);
      frame.agent.session.append("request/header", { reason: "change", header: { ...previous, config: { ...previous.config, ...host } } });
      changed = true;
      return decision;
    }, { prepend: true });
    const selection: ModelSelectionRef = { current: { provider: "fixture", model: "host-inherited", reasoningEffort: ReasoningEffortId("low") }, assembled: undefined };
    const agent = await fixture.createAuxiliary("dsmm-reviewer", selection);
    await runFixtureTurn(agent);
    assert.equal(changed, true);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model, host.model]);
    assert.deepEqual(headerRoutes(agent).at(-1), host);
  } finally { await fixture.dispose(); }
});

test("native ordered role fallback is bounded and duplicate effort variants do not add retries", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true, maxFallbackAttempts: 1 }, roleRouting: { "dsmm-reviewer": {
    primary: reviewer,
    fallbackRoutes: [backup, { ...backup, reasoningEffort: "high" }, { provider: "fixture", model: "never-reached", reasoningEffort: "high" }]
  } } });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    fixture.adapter.rateLimitModels.add(backup.model);
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent), [reviewer, backup]);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model, backup.model]);
    assert.ok(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "error"));
  } finally { await fixture.dispose(); }
});

test("native cold Agent re-admits its pinned policy primary after prior fallback, edited effort or removed chain", async (t) => {
  const originalConfig: DsmmPluginConfig = { runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } };
  for (const variant of ["unchanged", "primary-effort", "remove-chain", "both"] as const) await t.test(variant, async () => {
    const fixture = await nativeRoutingFixture(originalConfig);
    try {
      fixture.adapter.rateLimitModels.add(reviewer.model);
      const original = await fixture.createAuxiliary("dsmm-reviewer");
      await runFixtureTurn(original);
      assert.deepEqual(headerRoutes(original).at(-1), backup);
      const marker = original.session.snapshotEvents().find((event) => event.type === "dsmm/role-policy");
      assert.ok(marker && marker.type === "dsmm/role-policy");
      assert.ok(typeof marker.data.policy === "string");
      assert.deepEqual(Object.keys(marker.data).sort(), ["policy", "role", "version"]);
      assert.match(marker.data.policy, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(fixture.adapter.calls[0].messages).includes(marker.data.policy), false, "policy epoch remains model-hidden");
      const source = original.session.snapshotEvents().find((event) => event.type === "user/message");
      assert.ok(source);
      original.session.append("turn/start", { turn: 2 });
      original.session.append("user/message", createUserMessage({ content: [{ type: "text", text: "Native compacted policy fixture" }], source: { kind: "user" } }), { surfaceOp: { op: "replace", startSeq: source.seq, endSeq: source.seq }, sourceEventSeqs: [source.seq] });
      original.session.append("turn/end", { turn: 2, reason: { kind: "completed" } });
      assert.equal(original.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 1, "surface replacement retains the policy epoch");
      const persisted = JSON.parse(JSON.stringify(original.session.snapshotEvents()));
      await fixture.dsmmFiber.dispose();
      const editedPrimary = variant === "primary-effort" || variant === "both" ? { ...reviewer, reasoningEffort: "high" } : reviewer;
      const fallbackRoutes = variant === "remove-chain" || variant === "both" ? [] : [backup];
      const edited: DsmmPluginConfig = { runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { primary: editedPrimary, fallbackRoutes } } };
      const replacement = fixture.ctx.plugin({ name: `dsmm-reloaded-${variant}`, apply(ready: Context) { return apply(ready as unknown as DshContext, edited); } });
      await replacement.await();
      fixture.adapter.rateLimitModels.delete(reviewer.model);
      const restored = await fixture.createAuxiliary("dsmm-reviewer", undefined, { seed: persisted });
      await runFixtureTurn(restored);
      assert.deepEqual(headerRoutes(restored).at(-1), editedPrimary, variant);
      assert.equal(restored.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 2, `${variant}: every fresh Agent entry creates a new route epoch`);
    } finally { await fixture.dispose(); }
  });
});

test("native trusted child status reports effective role scope under an ordinary inactive parent", async () => {
  const config: DsmmPluginConfig = { roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } }, runtimeRecovery: { enabled: true } };
  const fixture = await nativeRoutingFixture(config);
  try {
    const parent = await fixture.create({ agentPreset: "standard" });
    const run = await fixture.subagents.start("dsmm-role-reviewer", { parent, prompt: [{ type: "text", text: "Local reviewer status" }], signal: new AbortController().signal });
    try {
      assert.equal((await run.result).stopReason, "completed");
      assert.ok(run.localAgent);
      const snapshot = createDsmmStatusSnapshot({ agent: run.localAgent as unknown as DshAgent, settings: resolveConfig(config), modeActive: false });
      assert.equal(snapshot.rolePolicy.role, "dsmm-reviewer");
      assert.equal(snapshot.rolePolicy.applies, true);
      assert.equal(snapshot.mode.inScope, true);
      assert.equal(snapshot.runtimeRecovery.applies, true);
      assert.equal(snapshot.route.model, reviewer.model);
    } finally { await run.dispose(); }
  } finally { await fixture.dispose(); }
});

test("disabled native role status retains config but reports no applied primary or role fallback", () => {
  const fresh = Session.create(SessionId("disabled-role-status"));
  const session = Session.create(fresh.id, [], { ...fresh.header, agentPreset: "dsmm-builder" });
  const config = { roles: { "dsmm-builder": false }, roleRouting: { "dsmm-builder": { primary: reviewer, fallbackRoutes: [backup] } }, runtimeRecovery: { enabled: true } } satisfies DsmmPluginConfig;
  const snapshot = createDsmmStatusSnapshot({ agent: { session } as unknown as DshAgent, settings: resolveConfig(config), modeActive: false });
  assert.equal(snapshot.rolePolicy.role, undefined);
  assert.equal(snapshot.rolePolicy.applies, false);
  assert.equal(snapshot.rolePolicy.primary, undefined);
  assert.deepEqual(snapshot.rolePolicy.fallbackRoutes, []);
  assert.deepEqual(snapshot.effectiveSettings.roleRouting["dsmm-builder"], config.roleRouting["dsmm-builder"]);
});

test("native policy events are absent for default inheritance and malformed own markers fail closed", async () => {
  const inherited = await nativeRoutingFixture();
  try {
    const agent = await inherited.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.equal(agent.session.snapshotEvents().some((event) => event.type === "dsmm/role-policy"), false);
  } finally { await inherited.dispose(); }
  const explicit = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary: reviewer } } });
  try {
    const seed = Session.create(SessionId("malformed-own-policy-marker"));
    seed.append("turn/start", { turn: 1 });
    seed.append("dsmm/role-policy", { version: 1, role: "dsmm-reviewer", policy: "not-a-policy-digest" });
    seed.append("turn/end", { turn: 1, reason: { kind: "completed" } });
    const agent = await explicit.createAuxiliary("dsmm-reviewer", undefined, { seed: seed.snapshotEvents() });
    await runFixtureTurn(agent);
    assert.equal(explicit.adapter.calls.length, 0);
    assert.equal(headerRoutes(agent).length, 0);
    assert.ok(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "error"));
  } finally { await explicit.dispose(); }
});

test("native child never borrows ancestor policy epoch or ancestor admitted fallback", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    const ancestor = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(ancestor);
    assert.deepEqual(headerRoutes(ancestor).at(-1), backup);
    const inherited = ancestor.session.snapshotEvents();
    const fresh = Session.create(SessionId("policy-epoch-child-seed"));
    const childSeed = Session.create(fresh.id, inherited, { ...fresh.header, origin: "subagent", parentSession: ancestor.id, isSeeded: true, agentPreset: "dsmm-orchestrator" }, SessionLogOffset(inherited.length));
    childSeed.append("turn/start", { turn: 2 });
    childSeed.append("subagent/descriptor", snapshotSubagentDescriptor({ mode: "one-shot", provider: "dsmm-role-reviewer" }));
    childSeed.append("turn/end", { turn: 2, reason: { kind: "completed" } });
    fixture.adapter.rateLimitModels.delete(reviewer.model);
    const child = await fixture.create({ origin: "subagent", parentSession: ancestor.id, isSeeded: true, agentPreset: "dsmm-orchestrator" }, undefined, {
      seed: childSeed.snapshotEvents(), inheritedEventCount: SessionLogOffset(inherited.length), parentAgent: ancestor
    });
    await runFixtureTurn(child);
    assert.deepEqual(headerRoutes(child).at(-1), reviewer);
    const own = child.session.snapshotEvents().slice(inherited.length);
    assert.equal(own.filter((event) => event.type === "dsmm/role-policy").length, 1);
    assert.deepEqual(headerRoutes(child).slice(-1), [reviewer]);
  } finally { await fixture.dispose(); }
});

test("native fresh cold Agent does not retain a former live host-owned route decision", async () => {
  const config: DsmmPluginConfig = { runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } };
  const fixture = await nativeRoutingFixture(config);
  try {
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    const previous = agent.session.requestHeader();
    assert.ok(previous);
    const host = { provider: "fixture", model: "persisted-host-route", reasoningEffort: ReasoningEffortId("high") };
    agent.session.append("turn/start", { turn: 2 });
    agent.session.append("request/header", { reason: "change", header: { ...previous, config: { ...previous.config, ...host } } });
    agent.session.append("turn/end", { turn: 2, reason: { kind: "completed" } });
    const persisted = JSON.parse(JSON.stringify(agent.session.snapshotEvents()));
    await fixture.dsmmFiber.dispose();
    const replacement = fixture.ctx.plugin({ name: "dsmm-preserved-host-epoch", apply(ready: Context) { return apply(ready as unknown as DshContext, config); } });
    await replacement.await();
    const restored = await fixture.createAuxiliary("dsmm-reviewer", undefined, { seed: persisted });
    await runFixtureTurn(restored);
    assert.deepEqual(headerRoutes(restored).at(-1), reviewer);
  } finally { await fixture.dispose(); }
});

test("native removed, disabled or inactive policy gap starts a fresh epoch when the same policy returns", async (t) => {
  for (const gap of ["removed", "role-disabled", "mode-inactive"] as const) await t.test(gap, async () => {
    const role = gap === "mode-inactive" ? "dsmm-orchestrator" : "dsmm-reviewer";
    const originalConfig: DsmmPluginConfig = {
      ...(gap === "mode-inactive" ? { defaultActive: true } : {}),
      runtimeRecovery: { enabled: true }, roleRouting: { [role]: { primary: reviewer, fallbackRoutes: [backup] } }
    };
    const fixture = await nativeRoutingFixture(originalConfig);
    try {
      fixture.adapter.rateLimitModels.add(reviewer.model);
      const meta = gap === "mode-inactive" ? {} : { agentPreset: "dsmm-reviewer" };
      const first = gap === "mode-inactive" ? await fixture.create(meta) : await fixture.createAuxiliary();
      await runFixtureTurn(first);
      assert.deepEqual(headerRoutes(first).at(-1), gap === "mode-inactive" ? { provider: "fixture", model: "native-default", reasoningEffort: "low" } : backup);
      const firstEvents = JSON.parse(JSON.stringify(first.session.snapshotEvents()));
      const firstMarkerCount = first.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length;
      assert.equal(firstMarkerCount, 1);
      await fixture.dsmmFiber.dispose();
      const gapConfig: DsmmPluginConfig = gap === "removed" ? { runtimeRecovery: { enabled: true } }
        : gap === "role-disabled" ? { ...originalConfig, roles: { "dsmm-reviewer": false } }
        : { ...originalConfig, defaultActive: false };
      const inactive = fixture.ctx.plugin({ name: `dsmm-policy-gap-${gap}`, apply(ready: Context) { return apply(ready as unknown as DshContext, gapConfig); } });
      await inactive.await();
      const nativeGapRoute = { provider: "fixture", model: "native-while-policy-inert", reasoningEffort: ReasoningEffortId("low") };
      const selection: ModelSelectionRef = { current: nativeGapRoute, assembled: undefined };
      const gapAgent = gap === "mode-inactive" ? await fixture.create(meta, selection, { seed: firstEvents })
        : await fixture.createAuxiliary("dsmm-reviewer", selection, { seed: firstEvents });
      await runFixtureTurn(gapAgent);
      assert.deepEqual(headerRoutes(gapAgent).at(-1), nativeGapRoute, "native choice remains authoritative during the inert interval");
      const gapMarkers = gapAgent.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy");
      assert.equal(gapMarkers.length, 2, "only a previously established policy needs an inert tombstone");
      assert.equal(gapMarkers.at(-1)?.data.policy, null);
      assert.equal(JSON.stringify(fixture.adapter.calls.at(-1)?.messages).includes('"dsmm/role-policy"'), false, "inert policy tombstone is model-hidden");
      const source = [...gapAgent.session.snapshotEvents()].reverse().find((event) => event.type === "user/message");
      assert.ok(source);
      gapAgent.session.append("turn/start", { turn: 3 });
      gapAgent.session.append("user/message", createUserMessage({ content: [{ type: "text", text: "Compacted inert policy interval" }], source: { kind: "user" } }), { surfaceOp: { op: "replace", startSeq: source.seq, endSeq: source.seq }, sourceEventSeqs: [source.seq] });
      gapAgent.session.append("turn/end", { turn: 3, reason: { kind: "completed" } });
      assert.equal(gapAgent.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 2, "surface compaction retains the inert epoch boundary");
      const gapEvents = JSON.parse(JSON.stringify(gapAgent.session.snapshotEvents()));
      await inactive.dispose();
      const reactivated = fixture.ctx.plugin({ name: `dsmm-policy-reactivated-${gap}`, apply(ready: Context) { return apply(ready as unknown as DshContext, originalConfig); } });
      await reactivated.await();
      fixture.adapter.rateLimitModels.delete(reviewer.model);
      const last = gap === "mode-inactive" ? await fixture.create(meta, { current: nativeGapRoute, assembled: undefined }, { seed: gapEvents })
        : await fixture.createAuxiliary("dsmm-reviewer", { current: nativeGapRoute, assembled: undefined }, { seed: gapEvents });
      await runFixtureTurn(last);
      assert.deepEqual(headerRoutes(last).at(-1), gap === "mode-inactive" ? nativeGapRoute : reviewer,
        "reactivated auxiliary routing is re-admitted while root native selection remains authoritative");
      assert.equal(last.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 3, "reactivation is durably separated from the original accepted fallback epoch");
    } finally { await fixture.dispose(); }
  });
});

test("native cancellation after downstream next returns does not create a policy epoch or request header", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary: reviewer } } });
  try {
    let cancelled = false;
    fixture.ctx.on("agent/request", async (frame, next) => {
      const config = await next();
      frame.agent.cancel({ kind: "hook", reason: "bounded local cancellation fixture" });
      assert.equal(frame.signal.aborted, true);
      cancelled = true;
      return config;
    });
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.equal(cancelled, true);
    assert.equal(agent.session.snapshotEvents().some((event) => event.type === "dsmm/role-policy"), false);
    assert.deepEqual(headerRoutes(agent), []);
    assert.equal(fixture.adapter.calls.length, 0);
    assert.ok(agent.session.snapshotEvents().some((event) => event.type === "turn/end" && event.data.reason.kind === "aborted"));
  } finally { await fixture.dispose(); }
});

test("native cancellation after downstream next cannot consume an admitted fallback as durable ownership", async () => {
  const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } });
  try {
    fixture.adapter.rateLimitModels.add(reviewer.model);
    let requests = 0;
    const stopCancelling = fixture.ctx.on("agent/request", async (frame, next) => {
      const config = await next();
      if (++requests === 2) frame.agent.cancel({ kind: "hook", reason: "bounded pending fallback cancellation fixture" });
      return config;
    });
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.equal(requests, 2);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model]);
    assert.deepEqual(headerRoutes(agent), [reviewer]);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 1);
    stopCancelling();
    fixture.adapter.rateLimitModels.delete(reviewer.model);
    await runFixtureTurn(agent);
    assert.deepEqual(headerRoutes(agent).at(-1), reviewer);
    assert.deepEqual(fixture.adapter.calls.map((call) => call.model), [reviewer.model, reviewer.model]);
  } finally { await fixture.dispose(); }
});

test("native stale request frame cannot close an epoch before a real inert-policy request is admitted", async () => {
  const fixture = await nativeRoutingFixture({ roleRouting: { "dsmm-reviewer": { primary: reviewer } } });
  try {
    const agent = await fixture.createAuxiliary("dsmm-reviewer");
    await runFixtureTurn(agent);
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 1);
    await fixture.dsmmFiber.dispose();
    const removed = fixture.ctx.plugin({ name: "dsmm-policy-removed-before-stale-frame", apply(ready: Context) { return apply(ready as unknown as DshContext); } });
    await removed.await();
    await agentEvents(fixture.ctx, agent).waterfall("agent/request", { turn: 1, step: 1, signal: new AbortController().signal }, async () => ({ provider: "fixture", model: "stale-native-route" }));
    assert.equal(agent.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy").length, 1, "closed turn/step cannot create an epoch tombstone");
    await runFixtureTurn(agent);
    const markers = agent.session.snapshotEvents().filter((event) => event.type === "dsmm/role-policy");
    assert.equal(markers.length, 2);
    assert.equal(markers.at(-1)?.data.policy, null, "the first real inert request closes the previous epoch");
  } finally { await fixture.dispose(); }
});

test("native only statusless RATE_LIMIT permits explicit rollover; other transient/auth/quota/request failures do not", async () => {
  const transient = ["RATE_LIMIT", "SERVER", "TIMEOUT", "TRANSPORT"];
  for (const code of [...transient, "AUTH", "QUOTA", "INVALID_REQUEST"]) {
    const fixture = await nativeRoutingFixture({ runtimeRecovery: { enabled: true, retryOnCodes: transient }, roleRouting: { "dsmm-reviewer": { primary: reviewer, fallbackRoutes: [backup] } } });
    try {
      fixture.adapter.beforeStream = async (call) => {
        if (call.model === reviewer.model) throw new LlmError("deterministic local statusless fixture", code);
      };
      const agent = await fixture.createAuxiliary("dsmm-reviewer");
      await runFixtureTurn(agent);
      const expected = code === "RATE_LIMIT" ? [reviewer, backup] : [reviewer];
      assert.deepEqual(headerRoutes(agent), expected, code);
      assert.deepEqual(fixture.adapter.calls.map((call) => call.model), expected.map((route) => route.model), `${code}: no implicit route`);
    } finally { await fixture.dispose(); }
  }
});
