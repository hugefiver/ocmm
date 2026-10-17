import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import { LlmError, ReasoningEffortId, ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import { deliveryFixture, carrierPlugin, gate } from "./delivery-runtime-fixture.ts";
import { nativeRoutingFixture, runFixtureTurn } from "./native-routing-fixture.ts";
import type { DshAgent, DshContext } from "../src/dsh-types.js";
import type { DsmmProfileAdmission, DsmmSettingsGetter, DsmmPluginConfig } from "../src/settings.js";
import { freezeSettings, resolveConfig } from "../src/settings.js";
import type { ChildAdmissionEvidence } from "../src/child-capture.js";
import type { ParentAdmissionTicket } from "../src/child-admission-contract.js";
import { DsmmRolePolicy } from "../src/role-policy.js";
import { registerHeadlessRoleTools, callableRoleInventory, admittedCallableRoleInventory, roleInvocationObservation, roleRouteComparison } from "../src/role-subagents.js";
import type { DsmmRoleRunCapture } from "../src/role-subagents.js";
import { registerRoleProviders, roleProviderName } from "../src/role-providers.js";
import { registerModelRouting } from "../src/model-routing.js";
import { capturedRoleInvocation } from "../src/role-invocation.js";
import type { DsmmInvocationView } from "../src/profile-types.js";
import { RoleRunRegistry } from "../src/role-runs.js";
import { DeepworkModeController } from "../src/state.js";
import { registerSafetyGuards } from "../src/guards.js";
import { DSMM_ROLES } from "../src/roles.js";
import type { DsmmSubagentRuntime } from "../src/subagent-runtime.js";
import DsmmSessionPersistence from "../src/session-persistence.js";
import * as NativeJsonlPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SubagentError } from "@deepseek-ai/dsh-subagent";

const epoch = () => randomBytes(32).toString("hex");
function* call(name: string, args: unknown): Generator<StreamChunk> {
  const id = ToolCallId(`b-${name}`), text = JSON.stringify(args);
  yield { type: "block-start", index: 0, blockType: "tool-call" };
  yield { type: "tool-call-delta", index: 0, id, name, argumentsDelta: text };
  yield { type: "block-end", index: 0, block: { type: "tool-call", id, name, arguments: text } };
  yield { type: "finish", reason: { kind: "tool-calls" } };
}
function* answer(text: string): Generator<StreamChunk> {
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

function pauseChild(f: Awaited<ReturnType<typeof roleFixture>>, model?: string) {
  const entered = gate(), output = gate();
  f.adapter.beforeStream = async options => {
    if (model !== undefined && options.model !== model) return;
    entered.release();
    await new Promise<void>((resolve, reject) => {
      const signal = options.signal;
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const abort = () => { cleanup(); reject(signal?.reason); };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      void output.promise.then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
    });
  };
  return { entered, output };
}

/** Real PUBLIC runtime, AgentRegistry, tools and adapter; resident original evidence is task-owned. */
async function roleFixture(config: DsmmPluginConfig = {}, options: { missingRegistry?: boolean; observeDisposal?: boolean; jobs?: boolean; controller?: boolean } = {}) {
  const f = await deliveryFixture({ bind: false });
  let nativeDisposals = 0;
  if (options.observeDisposal) f.ctx.on("agent/created", ({ agent }) => {
    if (agent.session.header.origin === "subagent") agent.ctx.effect(() => () => {
      assert.throws(() => f.runtime.authority.acquireParentTicket(agent)); nativeDisposals++;
    });
  }, { global: true });
  const persistence = [...f.ctx.registry.values()].find(registration => registration.callback === NativeJsonlPersistence.apply)!;
  assert.ok(persistence); assert.equal([...persistence.fibers].length, 1);
  await [...persistence.fibers][0].dispose();
  await f.ctx.plugin(DsmmSessionPersistence, { root: join(f.root, "role-sessions"), compression: "none" }).await();
  if (options.jobs) {
    await f.ctx.plugin((await carrierPlugin("@deepseek-ai/dsh-jobs-local")).default, {}).await();
    if (options.controller !== false) await f.ctx.plugin(await carrierPlugin("@deepseek-ai/dsh-tool-jobs"), { completionDelivery: "quiet" }).await();
  }
  const runtime = f.runtime as unknown as DsmmSubagentRuntime<DsmmProfileAdmission, ChildAdmissionEvidence>;
  const settings = resolveConfig({ defaultActive: true, ...config });
  const admissions = new WeakMap<object, DsmmProfileAdmission>();
  const originals = new Map<string, ChildAdmissionEvidence>();
  const managed = new WeakSet<Agent>();
  const owner = {};
  const getSettings: DsmmSettingsGetter = agent => agent === undefined ? settings : admissions.get(agent)?.settings ?? settings;
  getSettings.admission = agent => { const admission = agent === undefined ? undefined : admissions.get(agent); assert.ok(admission); return admission; };
  const mode = new DeepworkModeController(f.ctx as unknown as DshContext);
  const policy = new DsmmRolePolicy(f.ctx as unknown as DshContext, getSettings, mode);
  const completion = policy.configureAdmission({ nativeSubstrate: settings,
    async resolveOriginalEvidence(_ticket, id) { const evidence = originals.get(id); assert.ok(evidence); return evidence; },
    revokeParent(agent, reason) { f.runtime.authority.revokeParent(agent as Agent, reason); } });
  runtime.authority.bindPolicy(f.bindingScope, owner, {
    classifyParent: parent => managed.has(parent) ? "dsmm" : "native",
    async resolveChildEvidence(_ticket, id) { const evidence = originals.get(id); assert.ok(evidence); return evidence; },
    assertDelivery(ticket, id, evidence) { policy.assertChildDelivery(ticket as unknown as ParentAdmissionTicket, id, evidence); }
  });
  f.runtime.authority.enablePolicy(owner);
  f.ctx.on("agent/created", async ({ agent }) => {
    if (agent.session.header.origin !== "subagent") {
      const admission = freezeSettings({ settings, profile: null, epoch: epoch(), scope: "deployment-baseline" as const });
      policy.validateRootRole(agent as unknown as DshAgent, admission);
      admissions.set(agent, admission); managed.add(agent);
      f.runtime.authority.registerParent(agent, admission as never, owner);
      return;
    }
    const parent = f.ctx.agents.get(agent.session.header.parentSession!)!;
    const ticket = f.runtime.authority.acquireParentTicket(parent) as unknown as ParentAdmissionTicket;
    const prepared = await completion.prepare(agent as unknown as DshAgent, parent as unknown as DshAgent, ticket, ticket.signal);
    completion.validateRole(agent as unknown as DshAgent, parent as unknown as DshAgent, { ...prepared, retained: false });
    admissions.set(agent, prepared.admission); originals.set(agent.id, prepared.evidence); managed.add(agent);
    f.runtime.authority.registerParent(agent, prepared.admission as never, owner);
  }, { global: true });
  const missing = new Set<string>();
  f.ctx.llm.registerAdapter(["deepseek-official"], f.adapter);
  f.adapter.resolveModel = async (provider, model) => {
    await f.adapter.beforeResolve?.(provider, model);
    if (missing.has(model)) throw new LlmError("Native unavailable fixture route", "UNKNOWN_MODEL");
    return { provider, id: model, name: model, inputModalities: ["text"], reasoning: {
      efforts: ["off", "low", "high", "max"].map(id => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } };
  };
  let chunks: ((options: typeof f.adapter.calls[number]) => AsyncIterable<StreamChunk>) | undefined;
  f.adapter.stream = async function* (options) {
    this.calls.push(options); await this.beforeStream?.(options); options.signal?.throwIfAborted();
    if (chunks === undefined) yield* answer("USEFUL_ROLE_RESULT"); else yield* chunks(options);
  };
  const roleProvidersFiber = f.ctx.plugin({ name: "b-owned-role-providers", apply(scope: Context) {
    registerRoleProviders(scope as unknown as DshContext, getSettings, getSettings, policy);
  } });
  await roleProvidersFiber.await();
  f.ctx.on("agent/request", async (frame, next) => { policy.assertModuleAdmission(frame.agent as unknown as DshAgent); return next(); }, { prepend: true, global: true });
  registerModelRouting(f.ctx as unknown as DshContext, mode, getSettings);
  registerSafetyGuards(f.ctx as unknown as DshContext, mode, getSettings, policy);
  let disposeFault: Error | undefined;
  const runs = new RoleRunRegistry<DsmmRoleRunCapture, DsmmInvocationView>(f.ctx, {
    currentEpoch(parent, entryOwner) { const ticket = runtime.authority.acquireParentTicket(parent); assert.equal(ticket.owner, entryOwner); return ticket.parentEpoch; },
    canBackground(parent, identity) { return identity.capture.admission.settings.subagents.enableRunInBackground
      && getSettings(parent as unknown as DshAgent).subagents.enableRunInBackground
      && policy.targets(parent as unknown as DshAgent).includes(identity.capture.invocation.target); },
    teardown: { revokeParent(agent, reason) { runtime.authority.revokeParent(agent, reason); }, async disposeRun(run) {
      await run.dispose(); if (disposeFault !== undefined) throw disposeFault;
    } }
  });
  await registerHeadlessRoleTools(f.ctx as unknown as DshContext, mode, getSettings, policy, options.missingRegistry ? undefined : { registry: runs, owner });
  const create = () => f.create(false);
  const invoke = (parent: Agent, name: string, arguments_: unknown, signal = new AbortController().signal) => parent.ctx.tools.execute({ agent: parent, name, callId: ToolCallId(`${name}-${epoch()}`), arguments: arguments_, signal });
  const publish = (parent: Agent, nextConfig: DsmmPluginConfig) => {
    const previous = admissions.get(parent)!;
    const next = freezeSettings({ ...previous, epoch: epoch(), settings: resolveConfig({ ...settings, ...nextConfig }) });
    f.runtime.authority.prepareParentAdmission(parent, previous.epoch, next as never);
    f.runtime.authority.publishParentAdmission(parent, previous.epoch, next as never, () => admissions.set(parent, next));
    return next;
  };
  return { ...f, runtime, settings, getSettings, policy, admissions, originals, missing, create, invoke, publish, runs, roleProvidersFiber, roleOwner: owner,
    setChunks(value: typeof chunks) { chunks = value; },
    setDisposeFault(value: Error | undefined) { disposeFault = value; },
    get nativeDisposals() { return nativeDisposals; },
    async dispose() { runs.close("test-owner-disposed"); await runs.drain(); for (const agent of f.ctx.agents.list()) f.runtime.authority.revokeParent(agent, "test-owner-disposed"); await f.dispose(); } };
}

for (const topology of ["per-role", "parameterized"] as const) {
  test(`native ${topology} exposes and executes exact role/category inventory, rejects cross-kind/old schema and replacement definitions`, async () => {
    const f = await roleFixture({ subagents: { toolTopology: topology, maxDepth: 3 }, roleRouting: {
      "dsmm-reviewer": { primary: { provider: "fixture", model: "review-child" } }, "dsmm-coding": { primary: { provider: "fixture", model: "category-child" } }
    } });
    try {
      const root = await f.create();
      const schemas = root.ctx.tools.schemas(root).filter(row => row.name.startsWith("dsmm_"));
      const inventory = callableRoleInventory(f.settings, f.policy.targets(root as unknown as DshAgent));
      assert.deepEqual(admittedCallableRoleInventory(root as unknown as DshAgent, f.settings, f.policy, root.ctx.tools), inventory);
      assert.deepEqual(schemas.map(row => row.name).sort(), inventory.map(row => row.name).sort());
      for (const entry of inventory.filter(row => row.targetParameter !== undefined)) {
        const schema = schemas.find(row => row.name === entry.name)!;
        assert.deepEqual(((schema.parameters as { properties: Record<string, { enum: string[] }> }).properties[entry.targetParameter!]).enum, entry.targets);
      }
      for (const [name, target] of [[topology === "per-role" ? "dsmm_reviewer" : "dsmm_role", "dsmm-reviewer"], ["dsmm_category", "dsmm-coding"]]) {
        const args = { description: "Native useful role", prompt: "Return useful output", ...(name === "dsmm_role" ? { role: target } : name === "dsmm_category" ? { category: target } : {}) };
        assert.equal((await f.invoke(root, name, args)).isError, false);
      }
      let rootStep = 0;
      f.setChunks(async function* (options) {
        if (options.model === "native" && rootStep++ === 0) yield* call("dsmm_category", { category: "dsmm-coding", description: "Model requested category", prompt: "Return useful category output" });
        else yield* answer("MODEL_TOOL_USEFUL_RESULT");
      });
      root.followup(createUserMessage({ content: [{ type: "text", text: "Delegate through the callable category" }], source: { kind: "user" } }));
      await root.whenIdle();
      assert.ok(root.session.snapshotEvents().some(event => event.type === "tool/result" && event.data.error === undefined));
      const before = f.adapter.calls.length;
      for (const args of [{ category: "dsmm-reviewer" }, { category: "dsmm-unknown" }, { role: "dsmm-coding" }, { category: "dsmm-coding", persona: "root" }]) {
        assert.equal((await f.invoke(root, "dsmm_category", { description: "Denied target", prompt: "No publication", ...args })).isError, true);
      }
      assert.equal(f.adapter.calls.length, before); assert.deepEqual(f.ctx.agents.list(), [root]);
      f.publish(root, { roles: Object.fromEntries(DSMM_ROLES.map(row => [row.id, row.kind === "category" ? false : f.settings.roles[row.id]])) });
      await f.ctx.systemPrompt.assemble({ scope: root });
      f.publish(root, { roles: f.settings.roles });
      const other = await f.create();
      const replacement = other.ctx.tools.get("dsmm_category", other)!;
      assert.ok(replacement);
      const requests = f.adapter.calls.length;
      const remove = root.ctx.tools.register(replacement);
      try {
        assert.equal((await f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Unadmitted replacement", prompt: "No child publication" })).isError, true);
        assert.equal(f.adapter.calls.length, requests);
      } finally { remove(); }
    } finally { await f.dispose(); }
  });
}

test("admitted inventory follows exact registered enum and depth-capable providers rather than the merged tool name", async () => {
  const f = await roleFixture({ subagents: { toolTopology: "parameterized", maxDepth: 3 } });
  try {
    for (const role of DSMM_ROLES.filter(row => row.kind === "role" && row.id !== "dsmm-orchestrator" && row.id !== "dsmm-reviewer")) {
      const provider = f.runtime.getProvider(roleProviderName(role.id))!;
      Object.defineProperty(provider, "capabilities", { value: { ...provider.capabilities, depthLimit: false } });
    }
    const root = await f.create(), tools = root.ctx.tools;
    const schema = tools.schemas(root).find(row => row.name === "dsmm_role")!;
    assert.deepEqual((schema.parameters as { properties: { role: { enum: string[] } } }).properties.role.enum, ["dsmm-reviewer"]);
    const inventory = () => admittedCallableRoleInventory(root as unknown as DshAgent, f.getSettings(root as unknown as DshAgent), f.policy, tools);
    assert.deepEqual(inventory().find(entry => entry.name === "dsmm_role")?.targets, ["dsmm-reviewer"]);
    const provider = f.runtime.getProvider(roleProviderName("dsmm-reviewer"))!;
    f.publish(root, { roles: { ...f.settings.roles, "dsmm-reviewer": false } });
    assert.equal(inventory().some(entry => entry.name === "dsmm_role"), false);
    await f.ctx.systemPrompt.assemble({ scope: root });
    assert.equal(tools.get("dsmm_role", root), undefined);
    const replacement = tools.register({ name: "dsmm_role", description: "Unadmitted replacement", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { return "not admitted"; } });
    f.publish(root, {});
    assert.equal(inventory().some(entry => entry.name === "dsmm_role"), false); replacement();
    f.publish(root, {}); await f.ctx.systemPrompt.assemble({ scope: root });
    await f.roleProvidersFiber.dispose();
    const replacementProvider = f.runtime.registerProvider({ ...provider });
    assert.equal(inventory().some(entry => entry.name === "dsmm_role"), false); replacementProvider();
    await f.ctx.systemPrompt.assemble({ scope: root });
    assert.equal(tools.get("dsmm_role", root), undefined);
    assert.equal(inventory().some(entry => entry.name === "dsmm_role"), false);
  } finally { await f.dispose(); }
});

test("level/route native request headers are exact, omission equals normal, strict cannot override invocation effort, and root options stay native", async () => {
  const f = await roleFixture({ deepseekV4ProCalibration: "strict", subagents: { allowRouteOverride: true }, roleRouting: {
    "dsmm-coding": { primary: { provider: "fixture", model: "primary", reasoningEffort: "high" }, levels: { low: { reasoningEffort: "low" }, high: { provider: "fixture", model: "high-model" }, max: { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "max" } } }
  } });
  try {
    const root = await f.create(), originalOptions = { ...root.options }, before = JSON.stringify(f.settings);
    const children: Agent[] = [];
    f.ctx.on("agent/created", ({ agent }) => { if (agent.session.header.origin === "subagent") children.push(agent); }, { global: true });
    for (const params of [{}, { level: "normal" }, { level: "low" }, { level: "high" }, { level: "max" }, { level: "max", route: { reasoningEffort: "low" } }, { route: { provider: "fixture", model: "single", reasoningEffort: "off" } }]) {
      const result = await f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Exact route proof", prompt: "Return output", ...params });
      assert.equal(result.isError, false, JSON.stringify(result));
    }
    assert.deepEqual(f.adapter.calls.map(row => [row.provider, row.model, row.reasoningEffort]), [
      ["fixture", "primary", "high"], ["fixture", "primary", "high"], ["fixture", "primary", "low"], ["fixture", "high-model", "high"],
      ["deepseek-official", "deepseek-v4-pro", "max"], ["deepseek-official", "deepseek-v4-pro", "low"], ["fixture", "single", "off"]
    ]);
    const headers = children.flatMap(child => child.session.snapshotEvents().flatMap(event => event.type === "request/header" ? [[event.data.header.config.provider, event.data.header.config.model, event.data.header.config.reasoningEffort]] : []));
    assert.deepEqual(headers, f.adapter.calls.map(row => [row.provider, row.model, row.reasoningEffort]));
    assert.deepEqual(root.options, originalOptions); assert.equal(JSON.stringify(f.settings), before);
    const count = f.adapter.calls.length;
    assert.equal((await f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Invalid effort", prompt: "No downgrade", route: { reasoningEffort: "unsupported" } })).isError, true);
    assert.equal(f.adapter.calls.length, count);
  } finally { await f.dispose(); }
});

test("current named role denial is real at direct provider and generic spawn, while retained/cold original epoch and route stay unchanged", async () => {
  const f = await roleFixture({ subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 }, roleRouting: {
    "dsmm-code-search": { primary: { provider: "fixture", model: "old-child" }, levels: { low: { reasoningEffort: "low" } } }
  } });
  try {
    const root = await f.create();
    const first = await f.invoke(root, "dsmm_code_search", { description: "Same conversation", prompt: "First", level: "low" });
    assert.equal(first.isError, false, JSON.stringify(first));
    const id = (first.value as { subagentId: Agent["id"] }).subagentId;
    const child = f.ctx.agents.get(id)!; await child.whenIdle();
    const original = f.originals.get(id)!;
    const originalEpoch = f.admissions.get(child)!.epoch;
    f.publish(root, { roleRouting: { "dsmm-code-search": { primary: { provider: "fixture", model: "new-parent-route" } } } });
    assert.notEqual(f.admissions.get(root)!.epoch, originalEpoch);
    await f.runtime.sendMessage(root, id, [{ type: "text", text: "Same child approved conversation" }], { signal: new AbortController().signal });
    const resumed = f.ctx.agents.get(id)!; await resumed.whenIdle();
    assert.equal(f.admissions.get(resumed)!.epoch, originalEpoch); assert.deepEqual(f.originals.get(id), original);
    assert.ok(f.adapter.calls.every(row => row.model === "old-child" && row.reasoningEffort === "low"));
    f.publish(root, { roles: { ...f.settings.roles, "dsmm-code-search": false } });
    await assert.rejects(f.runtime.sendMessage(root, id, [{ type: "text", text: "Denied new message" }], { signal: new AbortController().signal }), error => error instanceof Error && "code" in error && error.code === "UNAUTHORIZED");
    await assert.rejects(f.runtime.startActivation({ provider: "dsmm-role-code-search", delivery: "caller", label: "Denied role", request: { parent: root, prompt: [] }, signal: new AbortController().signal }));
    await assert.rejects(f.runtime.startActivation({ provider: "spawn", delivery: "caller", label: "Spoofed role", request: { parent: root, prompt: [], agentPreset: "dsmm-code-search" }, signal: new AbortController().signal }));
  } finally { await f.dispose(); }
});

test("read-only merged targets refuse write/shell bodies", async () => {
  const f = await roleFixture({ subagents: { toolTopology: "parameterized", maxDepth: 3, enableRunInBackground: true, backgroundMode: "continuable" } });
  try {
    const root = await f.create();
    const run = await f.runtime.startActivation({ provider: "dsmm-role-reviewer", delivery: "parent", label: "Read-only reviewer", request: { parent: root, prompt: [] }, signal: new AbortController().signal });
    try {
      const child = f.ctx.agents.get(run.childId)!; await child.whenIdle();
      let bodies = 0;
      const removals = ["write", "pwsh"].map(name => child.ctx.tools.register({ name, description: "Counter-only mutation", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { bodies++; return "mutated"; } }));
      for (const name of ["write", "pwsh"]) assert.equal((await f.invoke(child, name, {})).isError, true);
      assert.equal((await f.invoke(child, "dsmm_category", { category: "dsmm-quick", description: "No write leaf", prompt: "Not authorized" })).isError, true);
      assert.equal(bodies, 0); removals.forEach(remove => remove());
    } finally { await run.dispose(); }
  } finally { await f.dispose(); }
});

test("missing levels and non-opted-in routes reject before publication; native absence alone selects the allowed exact fallback", async () => {
  const f = await roleFixture({ roleRouting: { "dsmm-coding": {
    primary: { provider: "fixture", model: "missing-primary", reasoningEffort: "high" }, fallbackRoutes: [{ provider: "fixture", model: "backup", reasoningEffort: "max" }],
    levels: { high: { provider: "fixture", model: "missing-level" }, low: { reasoningEffort: "low" } }
  } } });
  try {
    const root = await f.create(); f.missing.add("missing-primary"); f.missing.add("missing-level");
    const invoke = (extra: unknown) => f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Fallback admission", prompt: "Return exact output", ...extra as object });
    for (const extra of [{ level: "max" }, { level: "unknown" }, { route: { provider: "fixture", model: "backup" } }, { level: "normal", route: { reasoningEffort: "low" } }]) {
      assert.equal((await invoke(extra)).isError, true);
    }
    assert.equal(f.adapter.calls.length, 0); assert.deepEqual(f.ctx.agents.list(), [root]);
    assert.equal((await invoke({ level: "high" })).isError, false);
    assert.equal(f.adapter.calls.at(-1)!.reasoningEffort, "max");
    assert.equal((await invoke({ level: "low" })).isError, false);
    assert.equal(f.adapter.calls.at(-1)!.reasoningEffort, "low");
    const allowed = await roleFixture({ subagents: { allowRouteOverride: true }, roleRouting: f.settings.roleRouting });
    try {
      const parent = await allowed.create(); allowed.missing.add("fixed-missing");
      assert.equal((await allowed.invoke(parent, "dsmm_category", { category: "dsmm-coding", description: "Fixed invocation", prompt: "Never use backup", route: { provider: "fixture", model: "fixed-missing" } })).isError, true);
      assert.equal(allowed.adapter.calls.length, 0); assert.deepEqual(allowed.ctx.agents.list(), [parent]);
      const resolve = allowed.adapter.resolveModel.bind(allowed.adapter);
      allowed.adapter.resolveModel = async (provider, model) => model === "unauthorized" ? Promise.reject(new LlmError("Native auth refusal", "AUTHENTICATION", { status: 401 })) : resolve(provider, model);
      assert.equal((await allowed.invoke(parent, "dsmm_category", { category: "dsmm-coding", description: "No auth fallback", prompt: "No downgrade", route: { provider: "fixture", model: "unauthorized" } })).isError, true);
      assert.equal(allowed.adapter.calls.length, 0);
    } finally { await allowed.dispose(); }
  } finally { await f.dispose(); }
});

test("fresh continuable route preflight cannot relabel an old invocation with a newly published parent epoch", async () => {
  const f = await roleFixture({ subagents: { enableRunInBackground: true, backgroundMode: "continuable" }, roleRouting: {
    "dsmm-code-search": { primary: { provider: "fixture", model: "slow-original" } }
  } });
  try {
    const root = await f.create(); let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let paused = false;
    f.adapter.beforeResolve = async (_provider, model) => { if (model === "slow-original" && !paused) { paused = true; entered(); await gate; } };
    const pending = f.invoke(root, "dsmm_code_search", { description: "Revoked startup", prompt: "No child accepted" });
    await started; f.publish(root, { roleRouting: { "dsmm-code-search": { primary: { provider: "fixture", model: "new-policy" } } } }); release();
    assert.equal((await pending).isError, true); assert.equal(f.adapter.calls.length, 0); assert.deepEqual(f.ctx.agents.list(), [root]);
  } finally { await f.dispose(); }
});

test("captured caller deny-write survives child delegation and native read-only execution checks the exact captured definition", async () => {
  const f = await roleFixture({ subagents: { maxDepth: 3, enableRunInBackground: true, backgroundMode: "continuable" } });
  try {
    let writes = 0, reads = 0;
    f.ctx.tools.register({ name: "read", description: "Useful read", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { reads++; return "READ_PROOF"; } });
    f.ctx.tools.register({ name: "write", description: "Counter-only write", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { writes++; return "WRITE"; } });
    const root = await f.create();
    const builder = await f.policy.duringDelegation(root as unknown as DshAgent, "dsmm-builder", () => f.runtime.startActivation({ provider: "dsmm-role-builder", delivery: "parent", label: "Filtered builder", request: { parent: root, prompt: [], maxDepth: 3 }, signal: new AbortController().signal }), { deny: ["write"] }, 3);
    try {
      const builderAgent = f.ctx.agents.get(builder.childId)!; await builderAgent.whenIdle();
      const quick = await f.runtime.startActivation({ provider: "dsmm-role-quick", delivery: "parent", label: "Bounded quick task", request: { parent: builderAgent, prompt: [] }, signal: new AbortController().signal });
      try {
        const quickAgent = f.ctx.agents.get(quick.childId)!; await quickAgent.whenIdle();
        assert.equal((await f.invoke(quickAgent, "read", {})).isError, false);
        assert.equal((await f.invoke(quickAgent, "write", {})).isError, true);
        assert.equal(reads, 1); assert.equal(writes, 0);
        await assert.rejects(f.runtime.startActivation({ provider: "dsmm-role-planner", delivery: "caller", label: "Denied planner", request: { parent: builderAgent, prompt: [] }, signal: new AbortController().signal }));
      } finally { await quick.dispose(); }
    } finally { await builder.dispose(); }
  } finally { await f.dispose(); }
});

test("actual Main activation preflight refuses an enlarged captured caller depth ceiling", async () => {
  const f = await nativeRoutingFixture({ defaultActive: true, subagents: { maxDepth: 3, enableRunInBackground: true, backgroundMode: "continuable" } }, { persistence: true });
  try {
    const root = await f.create(), builder = await f.createAuxiliary("dsmm-builder", undefined, "continuable", root);
    await runFixtureTurn(builder);
    await assert.rejects(f.subagents.startActivation({ provider: "dsmm-role-quick", label: "Denied depth", delivery: "caller",
      request: { parent: builder, prompt: [], maxDepth: 100 }, signal: new AbortController().signal }), { code: "UNAUTHORIZED" });
    assert.equal(f.agents.list().some(agent => f.agents.isOwnedBy(agent.id, builder)), false);
  } finally { await f.dispose(); }
});

test("cold continuable consumes the resolved invocation once and preserves calibration only when no invocation effort was explicit", async () => {
  const f = await roleFixture({ deepseekV4ProCalibration: "strict", deepseekV4ProDefaultReasoningEffort: "off",
    subagents: { allowRouteOverride: true, enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 }, roleRouting: {
      "dsmm-code-search": { primary: { provider: "deepseek-official", model: "deepseek-v4-pro" },
        fallbackRoutes: [{ provider: "fixture", model: "backup", reasoningEffort: "max" }], levels: { max: { reasoningEffort: "max" } } }
    } });
  try {
    const root = await f.create();
    for (const [route, effort] of [[{ reasoningEffort: "low" }, "low"], [{ provider: "deepseek-official", model: "deepseek-v4-pro" }, "off"]] as const) {
      const first = await f.invoke(root, "dsmm_code_search", { description: "Captured exact conversation", prompt: "Useful first output", level: "max", route });
      assert.equal(first.isError, false, JSON.stringify(first));
      const id = (first.value as { subagentId: Agent["id"] }).subagentId;
      const original = f.ctx.agents.get(id)!; await original.whenIdle();
      const originalInitial = roleRouteComparison(original).initialRoute;
      assert.deepEqual(originalInitial, { status: "known", source: "invocation-capture", route: f.admissions.get(original)!.childCapture!.invocation.initialRoute });
      assert.equal(f.adapter.calls.at(-1)!.reasoningEffort, effort);
      f.runtime.authority.revokeParent(original, "test-cold-residency-release");
      await f.runtime.drainChildren(root, [id]);
      assert.equal(f.ctx.agents.get(id), undefined);
      await f.runtime.sendMessage(root, id, [{ type: "text", text: "Same conversation useful continuation" }], { signal: new AbortController().signal });
      const resumed = f.ctx.agents.get(id)!; assert.notEqual(resumed, original); await resumed.whenIdle();
      assert.equal(resumed.id, id); assert.equal(f.adapter.calls.at(-1)!.reasoningEffort, effort);
      assert.deepEqual(roleRouteComparison(resumed).initialRoute, originalInitial);
      const invocation = capturedRoleInvocation(resumed as unknown as DshAgent)!;
      assert.equal(invocation.effectiveLevel, "max"); assert.equal(invocation.routeSource, "invocation-route");
      assert.equal(invocation.exactEffort, effort === "low");
      assert.deepEqual(invocation.policy.fallbackRoutes.map(row => row.reasoningEffort), effort === "low" ? ["low"] : []);
    }
  } finally { await f.dispose(); }
});

test("native role tool uses the supplied C2a registry for one actual run, full foreground blocks and actual route metadata", async () => {
  const f = await roleFixture({ subagents: { toolTopology: "parameterized" }, roleRouting: {
    "dsmm-coding": { levels: { low: { reasoningEffort: "low" } } }
  } });
  try {
    f.setChunks(async function* () {
      for (const [index, text] of ["FIRST_USEFUL_BLOCK", "SECOND_USEFUL_BLOCK"].entries()) {
        yield { type: "block-start", index, blockType: "text" };
        yield { type: "text-delta", index, text };
        yield { type: "block-end", index, block: { type: "text", text } };
      }
      yield { type: "finish", reason: { kind: "stop" } };
    });
    const root = await f.create(); let child: Agent | undefined, creations = 0, disposals = 0;
    f.ctx.on("agent/created", ({ agent }) => {
      if (agent.session.header.origin === "subagent") {
        child = agent; creations++; agent.ctx.effect(() => () => { disposals++; });
        const captured = capturedRoleInvocation(agent as unknown as DshAgent)!;
        assert.equal(roleInvocationObservation(captured, "Real held foreground", "one-shot", f.getSettings, agent as unknown as DshAgent).routeKind, "initial");
        const comparison = roleRouteComparison(agent);
        assert.deepEqual(comparison.initialRoute, { status: "known", source: "invocation-capture", route: captured.initialRoute });
        assert.deepEqual(comparison.liveRoute, { status: "unknown", reason: "no-own-request-header" });
      }
    }, { global: true });
    const result = await f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Real held foreground", prompt: "Produce two blocks", level: "low" });
    assert.equal(result.isError, false, JSON.stringify(result));
    const value = result.value as unknown as { output: unknown[]; runId: string; invocation: DsmmInvocationView };
    assert.deepEqual(value.output, [{ type: "text", text: "FIRST_USEFUL_BLOCK" }, { type: "text", text: "SECOND_USEFUL_BLOCK" }]);
    assert.deepEqual(result.content.slice(1), value.output); assert.deepEqual(result.meta, value.invocation);
    assert.deepEqual(value.invocation.route, { provider: "fixture", model: "native", reasoningEffort: "low" });
    const observation = roleInvocationObservation(capturedRoleInvocation(child as unknown as DshAgent)!, "Real held foreground", "one-shot", f.getSettings,
      child as unknown as DshAgent, { runId: value.runId, childId: child!.id });
    assert.equal(observation.routeKind, "actual"); assert.deepEqual(observation.view, value.invocation);
    assert.equal(value.invocation.runId, value.runId); assert.equal(value.invocation.childId, child!.id);
    assert.equal(creations, 1); assert.equal(disposals, 1); assert.equal(f.adapter.calls.length, 1);
    assert.deepEqual(f.runs!.list(root, f.roleOwner), []); assert.deepEqual(f.ctx.agents.list(), [root]);
    assert.throws(() => f.runtime.authority.acquireParentTicket(child!));
  } finally { await f.dispose(); }
});

test("native activation teardown revokes the exact prepared child before its scope cleanup", async () => {
  const f = await roleFixture({ deepseekV4ProCalibration: "strict", deepseekV4ProDefaultReasoningEffort: "off", subagents: { allowRouteOverride: true } }, { observeDisposal: true });
  try {
    const root = await f.create(); let child: Agent | undefined;
    f.ctx.on("agent/created", ({ agent }) => { if (agent.session.header.origin === "subagent") child = agent; }, { global: true });
    const result = await f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Opaque native handle", prompt: "Return useful output",
      route: { provider: "deepseek-official", model: "deepseek-v4-pro" } });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(f.nativeDisposals, 1); assert.equal(f.adapter.calls.length, 1); assert.deepEqual(f.ctx.agents.list(), [root]);
    const view = (result.value as unknown as { invocation: DsmmInvocationView }).invocation;
    assert.equal(view.childId, child!.id); assert.equal(view.mode, "one-shot");
    assert.deepEqual(view.route, { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "off" });
    const comparison = roleRouteComparison(child!);
    assert.deepEqual(comparison.initialRoute, { status: "known", source: "invocation-capture",
      route: { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "high" } });
    assert.deepEqual(comparison.liveRoute, { status: "known", source: "own-native-request-header",
      route: { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "off" } });
    f.publish(root, { roleRouting: { "dsmm-coding": { primary: { provider: "fixture", model: "new-parent-route", reasoningEffort: "max" } } }, locale: "fr" });
    assert.deepEqual(roleRouteComparison(child!), comparison);
  } finally { await f.dispose(); }
});

test("native fork route comparison ignores inherited parent headers and never invents a missing invocation capture", async () => {
  const f = await deliveryFixture({ bind: false, nativeClassification: true });
  try {
    await f.ctx.plugin(await carrierPlugin("@deepseek-ai/dsh-subagent-fork-in-process"), {}).await();
    const root = await f.create(false);
    root.followup(createUserMessage({ content: [{ type: "text", text: "Parent own request before fork" }], source: { kind: "user" } }));
    await root.whenIdle(); assert.ok(root.session.requestHeader());
    let observed = false;
    f.ctx.on("agent/created", ({ agent }) => {
      if (agent.session.header.origin !== "subagent") return;
      assert.ok(agent.session.inheritedEventCount > 0);
      assert.ok(agent.session.snapshotEvents().slice(0, agent.session.inheritedEventCount).some(event => event.type === "request/header"));
      assert.deepEqual(roleRouteComparison(agent), { childId: agent.id,
        initialRoute: { status: "unknown", reason: "missing-invocation-capture" }, liveRoute: { status: "unknown", reason: "no-own-request-header" } });
      observed = true;
    }, { global: true });
    const run = await f.runtime.startActivation({ provider: "fork", delivery: "parent", label: "Native fork", request: { parent: root, prompt: [{ type: "text", text: "Child own useful output" }] }, signal: new AbortController().signal });
    try {
      const child = f.ctx.agents.get(run.childId)!; await child.whenIdle(); assert.equal(observed, true);
      const comparison = roleRouteComparison(child);
      assert.deepEqual(comparison.initialRoute, { status: "unknown", reason: "missing-invocation-capture" });
      assert.equal(comparison.liveRoute.status, "known");
      const { provider, model, reasoningEffort } = child.session.requestHeader()!.config;
      if (comparison.liveRoute.status === "known") assert.deepEqual(comparison.liveRoute.route, { provider, model,
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }) });
    } finally { await run.dispose(); }
  } finally { await f.dispose(); }
});

test("disabled implicit orchestrator rejects new/current native root requests without removing ordinary host services", async () => {
  const unavailable = await roleFixture({ roles: { "dsmm-orchestrator": false } });
  try {
    await assert.rejects(unavailable.create(), error => error instanceof Error && "code" in error && error.code === "UNAUTHORIZED");
    assert.equal(unavailable.adapter.calls.length, 0);
  } finally { await unavailable.dispose(); }
  const f = await roleFixture();
  try {
    const root = await f.create();
    f.publish(root, { roles: { ...f.settings.roles, "dsmm-orchestrator": false } });
    root.followup(createUserMessage({ content: [{ type: "text", text: "No disabled role execution" }], source: { kind: "user" } }));
    await root.whenIdle(); assert.equal(f.adapter.calls.length, 0);
  } finally { await f.dispose(); }
  const native = await roleFixture({ defaultActive: false, roles: { "dsmm-orchestrator": false } });
  try {
    let reads = 0;
    native.ctx.tools.register({ name: "read", description: "Host-owned useful read", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, async execute() { reads++; return "NATIVE_READ"; } });
    const root = await native.create();
    assert.equal((await native.invoke(root, "read", {})).isError, false); assert.equal(reads, 1);
    root.followup(createUserMessage({ content: [{ type: "text", text: "Ordinary native output" }], source: { kind: "user" } }));
    await root.whenIdle(); assert.equal(native.adapter.calls.length, 1);
    assert.deepEqual(native.policy.targets(root as unknown as DshAgent), []);
  } finally { await native.dispose(); }
});

test("native role-tool foreground handoff uses the same holder/run/job and disconnects only its foreground cancellation relay", { timeout: 15000 }, async () => {
  const f = await roleFixture({ subagents: { enableRunInBackground: true }, roleRouting: {
    "dsmm-coding": { levels: { low: { reasoningEffort: "low" } } }
  } }, { jobs: true });
  try {
    const paused = pauseChild(f), root = await f.create(), caller = new AbortController();
    let creations = 0, disposals = 0;
    f.ctx.on("agent/created", ({ agent }) => {
      if (agent.session.header.origin === "subagent") { creations++; agent.ctx.effect(() => () => { disposals++; }); }
    }, { global: true });
    const pending = f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Same native run handoff", prompt: "Useful held output", level: "low" }, caller.signal);
    await paused.entered.promise;
    const holder = f.runs.list(root, f.roleOwner)[0], identity = await holder.ready;
    assert.equal(identity.capture.admission, f.admissions.get(root)); assert.equal(identity.capture.invocation.effectiveLevel, "low");
    assert.equal(identity.projection.level, "low"); assert.equal(identity.projection.mode, "one-shot");
    assert.equal(identity.projection.childId, identity.childId); assert.equal(identity.projection.runId, identity.runId);
    assert.deepEqual(identity.projection.route, { provider: "fixture", model: "native", reasoningEffort: "low" });
    const address = { parent: root, owner: f.roleOwner, sessionId: root.id, toolCallId: identity.toolCallId, runId: identity.runId,
      expectedAdmissionEpoch: f.admissions.get(root)!.epoch };
    const transition = holder.background(address), repeated = holder.background(address);
    assert.equal(transition.status, "background"); assert.equal(repeated.status, "already-background");
    assert.ok("receipt" in transition && "receipt" in repeated); assert.equal(repeated.receipt.jobId, transition.receipt.jobId);
    const result = await pending; assert.equal(result.isError, false, JSON.stringify(result));
    const value = result.value as unknown as { kind: string; runId: string; jobId: string; invocation: DsmmInvocationView };
    assert.equal(value.kind, "background"); assert.equal(value.runId, identity.runId); assert.equal(value.jobId, transition.receipt.jobId);
    assert.equal(value.invocation.childId, identity.childId); assert.equal(value.invocation.jobId, value.jobId);
    caller.abort(); assert.equal(holder.holderSignal.aborted, false); assert.equal(holder.state, "background");
    assert.ok(f.ctx.agents.get(identity.childId!)); assert.equal(disposals, 0);
    paused.output.release();
    assert.equal((await f.ctx.jobs.wait(transition.receipt.jobId, 5000, root.id)).status, "completed"); await holder.drained;
    assert.equal(creations, 1); assert.equal(disposals, 1); assert.equal(f.adapter.calls.length, 1);
    assert.deepEqual(f.runs.list(root, f.roleOwner), []); assert.deepEqual(f.ctx.agents.list(), [root]);
  } finally { await f.dispose(); }
});

test("actual native model background request transfers its single one-shot run through the supplied C2a registry", { timeout: 15000 }, async () => {
  const f = await roleFixture({ subagents: { enableRunInBackground: true }, roleRouting: {
    "dsmm-coding": { primary: { provider: "fixture", model: "background-child" }, levels: { low: { reasoningEffort: "low" } } }
  } }, { jobs: true });
  try {
    const paused = pauseChild(f, "background-child"), root = await f.create(); let rootStep = 0;
    f.setChunks(async function* (options) {
      if (options.model === "native" && rootStep++ === 0) yield* call("dsmm_category", { category: "dsmm-coding", description: "Model-owned native background",
        prompt: "Useful native background output", level: "low", run_in_background: true });
      else yield* answer(options.model === "background-child" ? "USEFUL_BACKGROUND_RESULT" : "ROOT_CONTINUES");
    });
    root.followup(createUserMessage({ content: [{ type: "text", text: "Start independent background work" }], source: { kind: "user" } }));
    await root.whenIdle(); await paused.entered.promise;
    const holder = f.runs.list(root, f.roleOwner)[0], identity = await holder.ready;
    const metadata = root.session.snapshotEvents().flatMap(event => event.type === "tool/result" && event.data.meta !== undefined ? [event.data.meta as unknown as DsmmInvocationView] : [])
      .find(view => view.role === "dsmm-coding")!;
    assert.ok(metadata.jobId); assert.equal(metadata.runId, identity.runId); assert.equal(metadata.childId, identity.childId);
    assert.equal(metadata.level, "low"); assert.equal(metadata.mode, "one-shot"); assert.equal(holder.state, "background");
    assert.deepEqual(identity.projection.route, { provider: "fixture", model: "background-child", reasoningEffort: "low" });
    assert.equal(f.adapter.calls.filter(row => row.model === "background-child").length, 1);
    paused.output.release();
    const result = await f.ctx.jobs.wait(metadata.jobId as ReturnType<typeof f.ctx.jobs.start>, 5000, root.id);
    assert.equal(result.status, "completed"); await holder.drained; assert.deepEqual(f.ctx.agents.list(), [root]);
  } finally { await f.dispose(); }
});

for (const unavailable of ["registry", "jobs", "controller"] as const) {
  test(`initial one-shot background refuses missing ${unavailable} without a replacement start or leaked native run`, { timeout: 15000 }, async () => {
    const f = await roleFixture({ subagents: { enableRunInBackground: true } }, {
      missingRegistry: unavailable === "registry", jobs: unavailable !== "jobs", controller: unavailable !== "controller"
    });
    try {
      const root = await f.create(); let creations = 0, disposals = 0;
      f.ctx.on("agent/created", ({ agent }) => {
        if (agent.session.header.origin === "subagent") { creations++; agent.ctx.effect(() => () => { disposals++; }); }
      }, { global: true });
      const result = await f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Unavailable background", prompt: "No replacement native task", run_in_background: true });
      assert.equal(result.isError, true); assert.equal(creations, unavailable === "controller" ? 1 : 0); assert.equal(disposals, creations);
      assert.ok(f.adapter.calls.length <= 1); assert.deepEqual(f.runs.list(root, f.roleOwner), []); assert.deepEqual(f.ctx.agents.list(), [root]);
      assert.equal(f.ctx.get("jobs")?.list(root.id).length ?? 0, 0);
    } finally { await f.dispose(); }
  });
}

test("native one-shot foreground cancellation remains holder-owned until its single child disposal quiesces", { timeout: 15000 }, async () => {
  const f = await roleFixture();
  try {
    const paused = pauseChild(f), root = await f.create(), caller = new AbortController();
    const pending = f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Cancelled foreground", prompt: "Stop before transfer" }, caller.signal);
    await paused.entered.promise;
    const holder = f.runs.list(root, f.roleOwner)[0]; await holder.ready;
    const disposing = gate(), released = gate();
    f.ctx.agents.get(holder.invocation!.childId!)!.ctx.effect(() => async () => { disposing.release(); await released.promise; });
    let returned = false; void pending.then(() => { returned = true; });
    caller.abort(); await disposing.promise; assert.equal(returned, false);
    released.release(); assert.equal((await pending).isError, true); await assert.rejects(holder.drained);
    assert.equal(f.adapter.calls.length, 1); assert.deepEqual(f.ctx.agents.list(), [root]);
  } finally { await f.dispose(); }
});

test("native role-tool registry bridge preserves the typed terminal failure and its aggregate disposal fault", { timeout: 15000 }, async () => {
  const f = await roleFixture();
  try {
    const paused = pauseChild(f), root = await f.create(), cleanup = new SubagentError("Trusted cleanup failure", "ABORTED");
    f.setDisposeFault(cleanup);
    f.setChunks(async function* () { throw new LlmError("Controlled native model failure", "AUTHENTICATION", { status: 401 }); });
    const pending = f.invoke(root, "dsmm_category", { category: "dsmm-coding", description: "Typed native failure", prompt: "No success substitution" });
    await paused.entered.promise;
    const holder = f.runs.list(root, f.roleOwner)[0]; await holder.ready;
    paused.output.release();
    await assert.rejects(holder.foreground, error => error instanceof AggregateError && error.errors[0] instanceof SubagentError
      && error.errors[0].code === "ERROR" && error.errors[1] === cleanup);
    await assert.rejects(holder.drained, AggregateError); assert.equal((await pending).isError, true);
    assert.equal(f.adapter.calls.length, 1); assert.deepEqual(f.ctx.agents.list(), [root]);
  } finally { f.setDisposeFault(undefined); await f.dispose(); }
});
