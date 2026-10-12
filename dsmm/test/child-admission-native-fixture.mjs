import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmRuntime, ReasoningEffortId, ToolCallId } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { SkillRegistry } from "@deepseek-ai/dsh-skill";
import { SessionQueryEngine } from "@deepseek-ai/dsh-session-query";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { TypertRegistry } from "@deepseek-ai/dsh-typert-registry";
import { TypertGatewayService } from "@deepseek-ai/dsh-api-gateway";
import * as Connection from "@deepseek-ai/dsh-client-connection";
import { CredentialProvider } from "@deepseek-ai/dsh-credentials";
import * as Control from "@deepseek-ai/dsh-tool-subagent-control";
import { DsmmSubagentRuntime } from "../src/subagent-runtime.ts";
import { createChildAdmissionBinding } from "../src/child-admission.ts";
import { ProfileStore } from "../src/profile-store.ts";
import { DsmmProfileRuntime } from "../src/profile-runtime.ts";
import { DsmmRolePolicy } from "../src/role-policy.ts";
import { registerRoleProviders } from "../src/role-providers.ts";
import { DeepworkModeController } from "../src/state.ts";
import { resolveConfig } from "../src/settings.ts";
import { registerSafetyGuards } from "../src/guards.ts";
import Persistence from "../src/session-persistence.ts";

class ExactQuery extends SessionQueryEngine {
  beforeObserve;
  async observeSession(id, options) {
    await this.beforeObserve?.(id, options);
    return super.observeSession(id, options);
  }
  async searchSessions() { throw new Error("Fixture never enumerates unrelated history"); }
  async searchEvents() { throw new Error("Fixture never searches unrelated history"); }
}
class MemoryCredentials extends CredentialProvider {
  records = new Map();
  async modifyRecord(key, modify) {
    const value = await modify(this.records.get(key));
    if (value !== undefined) this.records.set(key, value);
    return this.records.get(key);
  }
}
class UsefulAdapter extends LlmAdapter {
  calls = [];
  beforeStream;
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, inputModalities: ["text"],
      reasoning: { efforts: ["low", "high"].map(id => ({ id: ReasoningEffortId(id), name: id })), defaultEffort: ReasoningEffortId("high") } };
  }
  async *stream(options) {
    this.calls.push(options);
    await this.beforeStream?.(options);
    options.signal?.throwIfAborted();
    const text = "useful same-ID native continuation";
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text };
    yield { type: "block-end", index: 0, block: { type: "text", text } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

export function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
export function accepted(agent) {
  return agent.session.snapshotEvents().flatMap(event => event.type === "agent/inbox/spliced" ? event.data.inserted : []);
}

/** Native services and a useful owned-file read; write/shell bodies are counters with no external effects. */
export async function childFixture(root, { oldPackage, persistent = true } = {}) {
  await mkdir(join(root, "profile"), { recursive: true });
  await mkdir(join(root, "home"), { recursive: true });
  const permittedRead = join(root, "permitted-read.txt");
  try { await writeFile(permittedRead, "useful permitted read", { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const ctx = new Context();
  const handles = [];
  const adapter = new UsefulAdapter();
  const bodies = { read: 0, write: 0, pwsh: 0 };
  let runtime, policy, bridge, beforeEvidence;
  await Promise.all([ctx.plugin(AgentRegistry).await(), ctx.plugin(SessionStore).await(), ctx.plugin(SessionProjectionRegistry).await(),
    ctx.plugin(LlmRuntime).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await(),
    ctx.plugin(TypertRegistry).await(), ctx.plugin(TypertGatewayService, {}).await(), ctx.plugin(MemoryCredentials).await(), ctx.plugin(SkillRegistry, {}).await()]);
  await ctx.plugin(ExactQuery).await();
  await ctx.plugin(Connection, {}).await();
  const config = { defaultActive: true, guards: { gitWriteGuard: "deny" }, locale: "ja",
    subagents: { enableRunInBackground: true, backgroundMode: "continuable", maxDepth: 3 },
    roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "reviewer-original", reasoningEffort: "high" } },
      "dsmm-coding": { primary: { provider: "fixture", model: "coding-original", reasoningEffort: "high" } },
      "dsmm-code-search": { primary: { provider: "fixture", model: "code-search-original", reasoningEffort: "high" } },
      "dsmm-builder": { primary: { provider: "fixture", model: "builder-original", reasoningEffort: "high" } } } };
  const scopeFiber = ctx.plugin({ name: `c2b-${oldPackage ? "old" : "new"}-owner`, apply(scope) { ctx.testOwnerScope = scope; } });
  await scopeFiber.await();
  const scope = ctx.testOwnerScope;
  let native;
  const nativeFiber = ctx.plugin({ name: "c2b-only-subagents", apply(nativeScope) {
    native = oldPackage ? new SubagentRuntime(nativeScope, { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } })
      : new DsmmSubagentRuntime(nativeScope, { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } });
  } });
  await nativeFiber.await();
  await ctx.plugin(AgentLoop, {}).await();
  await ctx.plugin(Spawn, { providerName: "spawn" }).await();
  await ctx.plugin(Control).await();
  ctx.llm.registerAdapter(["fixture"], adapter);
  const definitions = new Map();
  for (const name of ["read", "write", "pwsh"]) {
    ctx.tools.register({ name, description: "Counter-only business capability", parameters: { type: "object", properties: { command: { type: "string" } } },
      output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
      async execute() { bodies[name]++; return name === "read" ? readFile(permittedRead, "utf8") : "counter-only body"; } });
    definitions.set(name, ctx.tools.get(name));
  }
  ctx.provide("profileContext", { home: join(root, "home"), dir: join(root, "profile"),
    installAnchor: process.env.DSMM_TEST_DSH_ENTRY, startedBundles: ["@deepseek-ai/dsh-headless"], baseUrl: new URL("../", import.meta.url).href });
  if (oldPackage) {
    const oldConfig = { ...config, sessionPersistence: { root: join(root, "sessions"), compression: "none" } };
    delete oldConfig.locale;
    const fiber = ctx.plugin({ name: "c2b-real-published-dsmm", apply(ready) { return oldPackage.apply(ready, oldConfig); } });
    await fiber.await();
    for (const registration of ctx.registry.values()) for (const dependency of registration.fibers) {
      if ("profileContext" in dependency.inject || "subagents" in dependency.inject) await dependency.await();
    }
    runtime = ctx.get("dsmmProfileRuntime");
    assert.ok(runtime);
  } else {
    if (persistent) await ctx.plugin(Persistence, { root: join(root, "sessions"), compression: "none" }).await();
    const settings = resolveConfig(config);
    const store = ProfileStore.fromCentral(join(root, "home"), join(root, "profile"), "trusted-direct");
    const mode = new DeepworkModeController(scope);
    const owner = {};
    let completion;
    bridge = createChildAdmissionBinding({ ctx, owner, deliveryAuthority: native.authority, nativeSubstrate: settings, nativeHistory: ctx.sessionQuery,
      legacyCapabilities: {
        classifyTool(name) {
          if (name === "read") return { kind: "read", definition: definitions.get(name), assertArguments(args) {
            if (args === null || typeof args !== "object" || Object.keys(args).length) throw new Error("Unproven read parameter");
          } };
          if (name === "write") return { kind: "write", definition: definitions.get(name), assertArguments() {} };
          if (name === "pwsh") return { kind: "shell", definition: definitions.get(name), assertArguments() {} };
          return undefined;
        },
        assertParentTool(parent, name) {
          assert.equal(ctx.agents.get(parent.id), parent);
          assert.equal(ctx.tools.get(name, parent), definitions.get(name));
          assert.equal(policy.toolDenial(parent, name, ctx.tools), undefined);
        },
      },
      collaborators: {
        classifyParent: () => "dsmm",
        resolveOriginalChildEvidence: async (...args) => { await beforeEvidence?.(...args); return runtime.resolveOriginalChildEvidence(...args); },
        childAdmission: { prepare: (...args) => completion.prepare(...args), validateRole: (...args) => completion.validateRole(...args) },
        assertDelivery: (...args) => policy.assertChildDelivery(...args),
      },
    });
    bridge.bind(scope);
    runtime = new DsmmProfileRuntime(scope, settings, store, { childAuthority: bridge.authority, childAuthorityOwner: owner,
      childAdmission: bridge.childAdmission, childCapturePersistence: persistent ? "durable" : "resident",
      validateRootRole: (...args) => policy.validateRootRole(...args), onAdmissionGuardsInstalled: () => bridge.onAdmissionGuardsInstalled() });
    policy = new DsmmRolePolicy(scope, runtime.getSettings, mode);
    completion = policy.configureAdmission({ nativeSubstrate: settings, resolveOriginalEvidence: bridge.resolveOriginalEvidence,
      revokeParent: bridge.authority.revokeParent });
    registerSafetyGuards(scope, mode, runtime.getSettings, policy);
    registerRoleProviders(scope, runtime.getSettings, runtime.getSettings, policy);
    await runtime.initialize();
    scope.on("agent/created", ({ agent }) => {
      policy.captureTools(agent, agent.ctx.get("tools"));
    }, { global: true });
  }
  // Connection observers are public dependency fibers, not mocked operator properties.
  for (const registration of ctx.registry.values()) for (const dependency of registration.fibers) {
    if ("connection" in dependency.inject) await dependency.await();
  }
  const create = async (id = randomUUID()) => {
    const handle = await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: root },
      agentOptions: { provider: "fixture", model: "root", reasoningEffort: ReasoningEffortId("low") } });
    handles.push(handle);
    return handle.agent;
  };
  const resume = async id => {
    const handle = await ctx.agents.resume({ resumeSessionId: SessionId(id), agentOptions: { provider: "fixture", model: "root" } });
    handles.push(handle);
    return handle.agent;
  };
  const start = (parent, role = "reviewer", toolFilter = { allow: ["read"] }) => native.startContinuable({ provider: `dsmm-role-${role}`, label: `owned ${role}`,
    signal: new AbortController().signal, request: { parent, maxDepth: 3, prompt: [{ type: "text", text: "initial useful turn" }],
      agentOptions: { provider: "fixture", model: `${role}-original`, reasoningEffort: ReasoningEffortId("high"), maxTokens: 77 },
      ...(toolFilter == null ? {} : { toolFilter }) } });
  const execute = (agent, name, args = {}) => agent.ctx.tools.execute({ agent, name, arguments: args, callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
  const applyNamed = async (parent, id, settings) => {
    const saved = await runtime.save({ id, expectedRevision: null, content: JSON.stringify({ version: 1, id, settings }) });
    const snapshot = await runtime.getSession(parent);
    await runtime.selectSession({ sessionId: parent.id, id: saved.id, expectedRevision: saved.revision,
      expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch }, parent);
  };
  const applyOff = parent => applyNamed(parent, "new-parent", { guards: { gitWriteGuard: "off" }, workflow: { reviewCap: 7 },
    roleRouting: { "dsmm-coding": { primary: { provider: "fixture", model: "coding-parent-new", reasoningEffort: "low" } } },
    ...(oldPackage ? {} : { locale: "en" }) });
  const applyOriginal = (parent, role) => applyNamed(parent, `original-${role}`, { guards: { gitWriteGuard: "deny" }, workflow: { reviewCap: 2 } });
  const prompt = (parent, childId, text) => ctx.typertGateway.invoke({ namespace: "subagents", method: "prompt", args: { request: {
    requestId: randomUUID(), parentSessionId: parent.id, childSessionId: childId, mode: "continuable", delivery: "queue", content: [{ type: "text", text }],
  } } });
  return { ctx, root, native, bridge, runtime, policy, adapter, bodies, create, resume, start, execute, applyOff, applyOriginal, applySettings: applyNamed, prompt,
    setBeforeEvidence(fn) { beforeEvidence = fn; },
    async dispose() {
      const roots = handles.map(handle => handle.agent).filter(agent => ctx.agents.get(agent.id) === agent);
      if (bridge) for (const agent of roots) bridge.authority.revokeParent(agent, "owner-teardown");
      await native.drainContinuableDescendants(roots);
      for (const handle of [...handles].reverse()) {
        if (bridge) await bridge.revokeBeforeDispose(handle.agent, () => handle.dispose());
        else await handle.dispose();
      }
      await ctx.fiber.dispose();
    } };
}
