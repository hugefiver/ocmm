import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { HarnessError, LlmAdapter, LlmRuntime, ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import Persistence from "../src/session-persistence.ts";
import { SessionQueryEngine } from "@deepseek-ai/dsh-session-query";
import { SubagentRuntime, foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import * as Control from "@deepseek-ai/dsh-tool-subagent-control";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import * as NativeFs from "@deepseek-ai/dsh-tool-fs";
import { ApprovalService } from "@deepseek-ai/dsh-user-approval";
import { createScope, scopeChainOf } from "@deepseek-ai/dsh-scope";
import { createLegacyReadIntegration } from "../src/legacy-read-integration.ts";
import { createLegacyReadCallLease, LegacyReadUnavailable } from "../src/legacy-read-contracts.ts";
import { DsmmDeliveryAuthority } from "../src/delivery-authority.ts";
import { DsmmSubagentRuntime } from "../src/subagent-runtime.ts";
import { createChildAdmissionBinding } from "../src/child-admission.ts";
import { NativeChildEvidenceReader } from "../src/native-child-evidence.ts";
import { LegacyChildToolPolicy } from "../src/legacy-child-policy.ts";
import { DsmmProfileRuntime } from "../src/profile-runtime.ts";
import { ProfileStore } from "../src/profile-store.ts";
import { DsmmRolePolicy } from "../src/role-policy.ts";
import { DeepworkModeController } from "../src/state.ts";
import { resolveConfig } from "../src/settings.ts";

export function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
class Adapter extends LlmAdapter {
  beforeStream;
  async resolveModel(provider, id) { return { provider, id, name: id, inputModalities: ["text"], reasoning: {
    efforts: [{ id: "high", name: "high" }, { id: "low", name: "low" }], defaultEffort: "high" } }; }
  async *stream(options) {
    await this.beforeStream?.(options); options.signal.throwIfAborted();
    const text = "same durable legacy child";
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text };
    yield { type: "block-end", index: 0, block: { type: "text", text } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}
class Query extends SessionQueryEngine {
  async searchSessions() { throw new Error("No unrelated history search"); }
  async searchEvents() { throw new Error("No unrelated history search"); }
}

export async function fixture(options = {}) {
  const ownRoot = options.root === undefined;
  const root = options.root ?? await mkdtemp(join(tmpdir(), "dsmm-legacy-integration-"));
  const ctx = new Context(), handles = [], observations = [], contexts = [], auditFaults = [], retirementFaults = [], policies = [], scopes = [];
  const bodies = { read: 0, write: 0, shell: 0 }, adapter = new Adapter(), bindingMap = new Map();
  let native, integration, runtime, bridge, policy, beforeResolve, beforeContext, beforeFinish, auditAvailable = true, auditFault = false;
  let turnLifetime = new AbortController(), childTurnLifetime = new AbortController(), auditLifetime = new AbortController();
  const turnWaits = new Map();
  adapter.beforeStream = async options => { const wait = turnWaits.get(options.model); if (wait) { wait.entered.release(); await wait.release.promise; } };
  class CountedFs extends LocalFileSystem {
    async resolve(path, opts) { await beforeResolve?.(path, opts); return super.resolve(path, opts); }
    async readText(target, signal) { bodies.read++; return super.readText(target, signal); }
    async streamText(target, signal) { bodies.read++; return super.streamText(target, signal); }
  }
  class ChildCwdLoop extends AgentLoop {
    createAgent(ownerCtx, args) { return super.createAgent(ownerCtx, args.parentAgent && ownRoot ? { ...args, meta: { ...args.meta, cwd: join(root, "child") } } : args); }
  }
  const addScope = (scope, key) => { if (!scopes.some(row => row.ctx === scope)) scopes.push({ ctx: scope, key, ancestors: scopeChainOf(key).slice(1) }); };
  const capture = () => ({ scopes, policies, coverage: "host-owned-complete", mutation: "owner-coordinated", fidelity: "canonical-value-content-contexts",
    approval: options.ask ? "coordinated-turn" : "never-ask" });
  try {
    await mkdir(join(root, "parent"), { recursive: true }); await mkdir(join(root, "child"), { recursive: true });
    await mkdir(join(root, "home"), { recursive: true }); await mkdir(join(root, "profile"), { recursive: true });
    if (ownRoot) { await writeFile(join(root, "child", "useful.txt"), "first line\nuseful once\nlast line\n");
      await symlink(join(root, "child", "useful.txt"), join(root, "child", "alias.txt")); }
    await Promise.all([ctx.plugin(AgentRegistry).await(), ctx.plugin(SessionStore).await(), ctx.plugin(SessionProjectionRegistry).await(),
      ctx.plugin(LlmRuntime).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await()]);
    await ctx.plugin(Persistence, { root: join(root, "sessions"), compression: "none" }).await();
    await ctx.plugin(Query).await(); await ctx.plugin(CountedFs, {}).await();
    const config = Object.freeze({ readLimit: 8, readMaxBytes: 2048, readMaxLineLength: 200, readStreamMinSize: 1000000 });
    const mount = ctx.plugin(NativeFs, config); await mount.await();
    await ctx.plugin({ name: "integration-owned-subagents", apply(scope) {
      native = new (options.coldCore ? DsmmSubagentRuntime : SubagentRuntime)(scope, { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } });
      if (options.coldCore) native.requireProviders(["dsmm-role-reviewer"]);
    } }).await();
    await ctx.plugin(ChildCwdLoop, {}).await();
    await ctx.plugin(Spawn, { providerName: "dsmm-role-reviewer" }).await(); await ctx.plugin(Control).await();
    const nativeReport = ctx.tools.get("send_message");
    ctx.llm.registerAdapter(["fixture"], adapter);
    // These prohibited capabilities have no filesystem, process or remote side effect.
    for (const [name, counter] of [["integration_write", "write"], ["integration_shell", "shell"], ["integration_delegate", "shell"]]) ctx.tools.register({
      name, description: "Denied counter-only capability", parameters: { type: "object" },
      output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] }, execute() { bodies[counter]++; return "must not execute"; } });
    const parentHandle = options.parentId === undefined ? await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: join(root, "parent") },
      agentOptions: { provider: "fixture", model: "parent" } }) : await ctx.agents.resume({ resumeSessionId: SessionId(options.parentId), agentOptions: { provider: "fixture", model: "parent" } });
    handles.push(parentHandle); const parent = parentHandle.agent;
    let childId = options.childId, secondChildId;
    if (childId === undefined) {
      const started = await native.startContinuable({ provider: "dsmm-role-reviewer", label: "original reviewer", signal: new AbortController().signal,
        request: { parent, maxDepth: 3, prompt: [{ type: "text", text: "establish original route" }], agentOptions: { provider: "fixture", model: "reviewer-original" },
          toolFilter: { allow: ["read", "send_message", "integration_write", "integration_shell", "integration_delegate"] } } });
      await started.output; childId = started.childId; await native.drainContinuableChildren(parent, [childId]);
      if (options.multipleChildren) {
        const second = await native.startContinuable({ provider: "dsmm-role-reviewer", label: "second original reviewer", signal: new AbortController().signal,
          request: { parent, maxDepth: 3, prompt: [{ type: "text", text: "establish distinct original child" }], agentOptions: { provider: "fixture", model: "reviewer-original" },
            toolFilter: { allow: ["read"] } } });
        await second.output; secondChildId = second.childId; await native.drainContinuableChildren(parent, [secondChildId]);
      }
    }
    if (options.oldOnly) return { root, parentId: parent.id, childId, async dispose() {
      await native.drainContinuableDescendants([parent]); for (const handle of [...handles].reverse()) await handle.dispose(); await ctx.fiber.dispose();
    } };
    const authority = options.coldCore ? native.authority : new DsmmDeliveryAuthority(ctx), owner = {};
    const settings = resolveConfig({ defaultActive: true, guards: { gitWriteGuard: "deny" }, subagents: { maxDepth: 3 },
      roleRouting: { "dsmm-reviewer": { primary: { provider: "fixture", model: "reviewer-original" } }, "dsmm-coding": { primary: { provider: "fixture", model: "coding-original" } } } });
    const mode = new DeepworkModeController(ctx);
    const store = ProfileStore.fromCentral(join(root, "home"), join(root, "profile"), "trusted-direct");
    const physicalReader = new NativeChildEvidenceReader(ctx, ticket => authority.assertTicket(ticket), ctx.sessionQuery);
    let completion;
    bridge = createChildAdmissionBinding({ ctx, owner, deliveryAuthority: authority, nativeSubstrate: settings, nativeHistory: ctx.sessionQuery,
      get legacyCapabilities() {
        if (!options.coldCore) return integration.legacyCapabilities;
        if (integration.core) return integration.core.legacyCapabilities;
        throw new LegacyReadUnavailable("composition-unavailable");
      }, collaborators: {
        classifyParent: () => "dsmm", resolveOriginalChildEvidence: (...args) => options.coldCore && integration.core
          ? integration.core.resolveOriginalChildEvidence(...args) : runtime.resolveOriginalChildEvidence(...args),
        childAdmission: { prepare: (...args) => completion.prepare(...args), validateRole: (...args) => completion.validateRole(...args) },
        assertDelivery: (...args) => {
          if (options.coldCore && "mode" in args[2]) {
            if (!integration.core) throw new LegacyReadUnavailable("composition-unavailable");
            return integration.core.assertLegacyDelivery(...args);
          }
          return policy.assertChildDelivery(...args);
        },
      } });
    bridge.bind(ctx);
    runtime = new DsmmProfileRuntime(ctx, settings, store, { childAuthority: bridge.authority, childAuthorityOwner: owner, childAdmission: bridge.childAdmission,
      childCapturePersistence: "durable", validateRootRole: (...args) => policy.validateRootRole(...args), onAdmissionGuardsInstalled: () => bridge.onAdmissionGuardsInstalled() });
    policy = new DsmmRolePolicy(ctx, runtime.getSettings, mode);
    completion = policy.configureAdmission({ nativeSubstrate: settings, resolveOriginalEvidence: bridge.resolveOriginalEvidence,
      revokeParent: bridge.authority.revokeParent, ...(options.coldCore && options.off ? {} : {
        classifyLegacyTool: (...args) => options.coldCore ? integration.core.classifyLegacyTool(...args) : integration.classifyLegacyTool(...args) }) });
    const auditFile = join(root, `actual-proxy-audit-${randomUUID()}.jsonl`);
    await writeFile(auditFile, "", { flag: "wx" });
    const provider = Object.freeze({ mount }), world = Object.freeze({ root });
    const startup = {
      captureClosedComposition(attachments) {
        if (options.unknown) return undefined;
        for (const a of attachments) { addScope(a.parent.ctx, a.parent); addScope(a.child.ctx, a.child);
          addScope(a.policyScope.ctx, a.child); addScope(a.proxy.proxyScope.ctx, a.child); addScope(a.proxy.standingScope.ctx, a.child);
          for (const c of a.contributions) if (!policies.some(p => p.reference === c.reference)) policies.push(c);
        }
        return capture();
      },
      resolveReadBindings(p, c) {
        let binding = bindingMap.get(c);
        if (!binding) { binding = Object.freeze({ parent: p, child: c, definition: p.ctx.tools.get("read", p), mount, config,
          caps: Object.freeze({ limit: 8, maxBytes: 2048, maxLineLength: 200, streamMinSize: 1000000 }), parentFs: p.ctx.get("fs"), childFs: c.ctx.get("fs"),
          parentProvider: provider, childProvider: provider, parentWorld: world, childWorld: world }); bindingMap.set(c, binding); }
        return binding;
      },
      async acquireCallContext(p, c, exec, lease) {
        lease.signal.throwIfAborted();
        assert.equal(lease.ticket.admission, runtime.admission(p));
        if (!auditAvailable) throw new LegacyReadUnavailable("audit-unavailable");
        const boundary = ctx.sessionProjections.stateOf(p.session, "turnBoundary");
        if (options.ask && boundary?.openTurnStartSeq == null) throw new LegacyReadUnavailable("approval-unavailable");
        const childBoundary = options.ask && options.childApproval ? ctx.sessionProjections.stateOf(c.session, "turnBoundary") : undefined;
        if (options.ask && options.childApproval && childBoundary?.openTurnStartSeq == null) throw new LegacyReadUnavailable("approval-unavailable");
        const lifetime = auditLifetime, turn = turnLifetime, childTurn = childTurnLifetime, callLifetime = new AbortController();
        contexts.push({ token: exec.token, parent: p, child: c, arguments: exec.arguments, localLifetime: callLifetime });
        const context = createLegacyReadCallLease({ signal: AbortSignal.any([lease.signal, lifetime.signal, callLifetime.signal, ...(childBoundary ? [childTurn.signal] : [])]),
          approval: options.ask ? { kind: "coordinated-turn", turn: { parent: p, openTurnStartSeq: boundary.openTurnStartSeq }, signal: turn.signal,
            ...(childBoundary ? { childTurn: { child: c, openTurnStartSeq: childBoundary.openTurnStartSeq, signal: childTurn.signal } } : {}) } : { kind: "never-ask" },
          assertAvailable() { lease.signal.throwIfAborted(); lifetime.signal.throwIfAborted(); if (!auditAvailable) throw new LegacyReadUnavailable("audit-unavailable");
            if (options.ask && (turn.signal.aborted || ctx.sessionProjections.stateOf(p.session, "turnBoundary")?.openTurnStartSeq !== boundary.openTurnStartSeq)) throw new LegacyReadUnavailable("approval-unavailable");
            if (childBoundary && (childTurn.signal.aborted || ctx.sessionProjections.stateOf(c.session, "turnBoundary")?.openTurnStartSeq !== childBoundary.openTurnStartSeq)) throw new LegacyReadUnavailable("approval-unavailable"); },
          async finish(outcomes) {
            await beforeFinish?.(outcomes);
            await appendFile(auditFault ? join(root, "missing-audit-path", "audit.jsonl") : auditFile, JSON.stringify({ parent: p.id, child: c.id,
              rootCallId: outcomes.childExecution.rootCallId, childCallId: outcomes.childExecution.callId, parentCallId: outcomes.parentExecution?.callId,
              parentError: outcomes.parentResult?.isError, childError: outcomes.childResult.isError }) + "\n");
          }, release() { callLifetime.abort("actual-call-finished"); },
        });
        try {
          await beforeContext?.(context, exec, lease);
          context.assertAvailable();
          return context;
        } catch (error) { context.release(); throw error; }
      },
      reportAuditFault(error, outcomes) { auditFaults.push({ error, outcomes }); },
      reportRetirementFault(error, child) { retirementFaults.push({ error, child }); },
      revoke(reason) { turnLifetime.abort(reason); childTurnLifetime.abort(reason); auditLifetime.abort(reason); },
    };
    if (options.missingAuditCallback) delete startup.acquireCallContext;
    const classifyChildReport = (name, tools, child) => {
        if (name !== "send_message") return undefined;
        const definition = tools.get(name, child);
        return definition === undefined || definition !== nativeReport ? undefined : { kind: "child-report", definition, assertArguments(args) {
          assert.equal(args.agent_id, parent.id); assert.equal(typeof args.message, "string");
          assert.deepEqual(Object.keys(args).sort(), ["agent_id", "message"]);
        } };
    };
    addScope(ctx, ctx);
    const observe = (exec, result) => { if (exec.name === "read") observations.push({ exec, result }); };
    ctx.on("tools/result", observe, { global: true });
    policies.push({ side: "both", stage: "finalization", scope: ctx, reference: observe, order: 2, semantics: "audited-zero-or-once" });
    const integrationOptions = { ctx, authority, authorityOwner: owner, nativeHistory: ctx.sessionQuery, classifyChildReport,
      ...(options.coldCore ? { coreAdmissions: {
        resolveOriginalChildEvidence: (...args) => runtime.resolveOriginalChildEvidence(...args),
        assertDelivery: (...args) => policy.assertChildDelivery(...args),
      } } : {}),
      ...(options.missingDefinitions ? {} : { proxyDefinitions: {
        admit(p, c, definition) {
          assert.equal(p, parent); assert.equal(c.ctx.tools.get("read", c), definition);
          if (!options.unregisteredDefinition) policy.captureTools(c, c.ctx.tools, ["read"]);
        },
        assertAdmitted(c, definition) {
          assert.equal(c.ctx.tools.get("read", c), definition);
          if (policy.toolDenial(c, "read", c.ctx.tools) !== undefined) throw new LegacyReadUnavailable("provenance-unavailable");
        },
      } }),
      admissions: { resolveOriginalChildEvidence: (ticket, id, signal) => runtime.resolveOriginalChildEvidence(ticket, id, signal, (_ticket, id, signal) => physicalReader.legacy(ticket, id, signal)),
        childAdmission: child => runtime.admission(child), assertCurrentParent: (ticket, child, evidence) => policy.assertChildDelivery(ticket, child.id, evidence) },
      ...(options.off ? {} : { trustedHostStartup: startup }) };
    integration = createLegacyReadIntegration(integrationOptions);
    const roleGuard = exec => policy.toolDenial(exec.agent, exec.name, ctx.tools, exec);
    ctx.tools.guard(roleGuard);
    policies.push({ side: "both", stage: "guard", scope: ctx, reference: roleGuard, order: 2, semantics: "audited-zero-or-once" });
    if (options.coldCore && integration.core) {
      if (options.beforeColdAttachment) ctx.on("agent/created", async ({ agent }) => {
        if (agent.session.header.parentSession === parent.id) await options.beforeColdAttachment({ agent, parent, integration, runtime, authority, native, bodies });
      }, { global: true });
      ctx.on("agent/created", async ({ agent, signal }) => {
        if (agent.session.header.parentSession === parent.id) await integration.core.afterChildAdmission(parent, agent, signal ?? new AbortController().signal);
      }, { global: true });
    }
    await runtime.initialize(); await runtime.completeAdmission(parent);
    if (options.coldCore) await native.waitUntilReady(new AbortController().signal);
    policy.captureTools(parent, parent.ctx.tools);
    const observation = await ctx.sessionQuery.observeSession(SessionId(childId), { signal: new AbortController().signal, projectionMode: "none" });
    const descriptor = foldSubagentDescriptor(observation.events); observation[Symbol.dispose]();
    let childHandle, child;
    if (options.nativeResidency) {
      await native.sendMessage(parent, SessionId(childId), [{ type: "text", text: "resume real native report residency" }], { signal: new AbortController().signal });
      child = ctx.agents.get(SessionId(childId)); await child.whenIdle();
    } else {
      childHandle = await ctx.agents.resume({ resumeSessionId: SessionId(childId), parentAgent: parent,
        agentOptions: { provider: descriptor.agentProvider, model: descriptor.agentModel, reasoningEffort: descriptor.agentReasoningEffort },
        setup(scope) { if (descriptor.toolFilter) scope.tools.restrict(descriptor.toolFilter); } });
      handles.push(childHandle); child = childHandle.agent;
    }
    policy.captureTools(child, child.ctx.tools);
    let secondChild, secondChildHandle;
    if (secondChildId) {
      const secondObservation = await ctx.sessionQuery.observeSession(secondChildId, { signal: new AbortController().signal, projectionMode: "none" });
      const secondDescriptor = foldSubagentDescriptor(secondObservation.events); secondObservation[Symbol.dispose]();
      const secondHandle = secondChildHandle = await ctx.agents.resume({ resumeSessionId: secondChildId, parentAgent: parent,
        agentOptions: { provider: secondDescriptor.agentProvider, model: secondDescriptor.agentModel }, setup(scope) { scope.tools.restrict(secondDescriptor.toolFilter); } });
      handles.push(secondHandle); secondChild = secondHandle.agent; policy.captureTools(secondChild, secondChild.ctx.tools);
    }
    // A newly constructed startup may add this provider before publishing ready; an existing delegated approval pin is never replaced.
    if (options.ask || options.childApproval) await ctx.plugin(ApprovalService, { policy: "ask" }).await();
    const attach = () => integration.attachChild(parent, child, new AbortController().signal);
    const execute = (args = { file_path: "useful.txt", offset: 2, limit: 1 }, signal = new AbortController().signal, name = "read") => child.ctx.tools.execute({
      agent: child, name, arguments: args, callId: ToolCallId(randomUUID()), signal });
    const listen = (side, event, listener, semantics = "audited-zero-or-once") => {
      const target = side === "parent" ? parent : child, scope = createScope(target.ctx, target); addScope(scope.ctx, target);
      scope.ctx.on(event, listener); policies.push({ side, stage: event === "tools/pre-execute" ? "pre" : event === "tools/execute" ? "around" : "post",
        scope: scope.ctx, reference: listener, order: 2, semantics });
    };
    const apply = async settings => {
      const id = `profile-${randomUUID()}`, saved = await runtime.save({ id, expectedRevision: null, content: JSON.stringify({ version: 1, id, settings }) });
      const snapshot = await runtime.getSession(parent);
      return runtime.selectSession({ sessionId: parent.id, id, expectedRevision: saved.revision,
        expectedSelectionRevision: snapshot.selection.selectionRevision, expectedAdmissionEpoch: snapshot.admissionEpoch }, parent);
    };
    const settle = async () => { await integration.host.composition.closeForChange("audit-observation");
      return (await readFile(auditFile, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); };
    const beginTurn = async (target = parent) => {
      const lifetime = new AbortController();
      if (target === parent) turnLifetime = lifetime; else childTurnLifetime = lifetime;
      const entered = gate(), release = gate(), idle = gate(), model = target.options.model;
      const off = ctx.on("agent/status", ({ agent, status }) => { if (agent === target && status === "idle") idle.release(); }, { global: true });
      turnWaits.set(model, { entered, release });
      target.followup(createUserMessage({ content: [{ type: "text", text: "real owned operation turn" }] })); await entered.promise;
      return async () => { lifetime.abort("turn-closing"); await integration.host.composition.closeForChange("turn-closing"); release.release(); await idle.promise; off(); turnWaits.delete(model); };
    };
    return { root, ctx, parent, child, secondChild, secondChildHandle, childHandle, parentHandle, authority, native, owner, runtime, policy, bridge, integration, integrationOptions, bodies, observations, contexts, auditFaults, retirementFaults,
      attach, execute, listen, apply, settle, beginTurn,
      setBeforeResolve(fn) { beforeResolve = fn; }, setBeforeContext(fn) { beforeContext = fn; }, setBeforeFinish(fn) { beforeFinish = fn; }, setAuditFault(value) { auditFault = value; }, setAuditAvailable(value) { auditAvailable = value; },
      async dispose() {
        await integration.dispose(async () => { await native.drainContinuableDescendants([parent]); for (const handle of [...handles].reverse()) await handle.dispose(); });
        await ctx.fiber.dispose(); if (ownRoot) await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (integration) await integration.host.composition.closeForDispose("fixture-failed");
    if (native) await native.drainContinuableDescendants(handles.map(handle => handle.agent));
    for (const handle of [...handles].reverse()) await handle.dispose(); await ctx.fiber.dispose();
    if (ownRoot) await rm(root, { recursive: true, force: true }); throw error;
  }
}

async function attachmentTransaction(name, f) {
  await f.attach(); f.integration.publishCheckedGeneration();
  const sibling = f.child, child = f.secondChild, original = child.ctx.tools.get("read", child);
  const siblingAdmission = f.runtime.admission(sibling), generation = f.integration.view().generation;
  const controller = new AbortController(), failure = new Error(name), entered = gate(), release = gate();
  const options = f.integrationOptions, admissions = options.admissions, definitions = options.proxyDefinitions;
  const resolve = admissions.resolveOriginalChildEvidence, admit = definitions.admit, check = definitions.assertAdmitted;
  const capture = options.trustedHostStartup.captureClosedComposition;
  const attempts = [], checked = [];
  const late = ["attach-admit-fail", "attach-assert-fail", "attach-late-cancel", "attach-late-epoch"].includes(name);
  let mergedSignal, armed = true;
  if (name === "attach-lifetime-registration-fail") {
    const on = child.ctx.on;
    let failedRegistrations = 0, actualDisposed = false, recoveryCaptures = 0;
    const offDisposed = f.ctx.on("agent/disposed", ({ agent }) => { if (agent === child) actualDisposed = true; }, { global: true });
    definitions.admit = async (...args) => {
      if (args[1] === child) attempts.push(args[2]);
      await admit(...args); entered.release(); await release.promise;
    };
    const attaching = f.integration.attachChild(f.parent, child, controller.signal).then(() => ({ accepted: true }), error => ({ error }));
    await entered.promise;
    let result;
    try {
      // Fault only the PUBLIC observer registration, after real B definition admission; never synthesize lifecycle events.
      child.ctx.on = function (event, ...args) {
        if (event === "internal/status") { failedRegistrations++; throw failure; }
        return on.call(this, event, ...args);
      };
      release.release(); result = await attaching;
    } finally { child.ctx.on = on; }
    assert.equal(result.accepted, undefined); assert.equal(result.error, failure); assert.equal(failedRegistrations, 1);
    assert.equal(f.integration.classifyLegacyTool("read", child.ctx.tools, child) === undefined, true);
    assert.equal(child.ctx.tools.get("read", child) === original, true);
    assert.equal((await child.ctx.tools.execute({ agent: child, name: "read", arguments: { file_path: "useful.txt" },
      callId: ToolCallId(randomUUID()), signal: controller.signal })).isError, true);
    assert.equal(f.bodies.read, 0); assert.equal(f.integration.view().state, "unavailable");
    assert.equal(f.integration.view().generation, generation); assert.equal(f.integration.view().activeCalls, 0);
    await assert.rejects(f.integration.attachChild(f.parent, child, controller.signal), error => error === failure);
    assert.equal(attempts.length, 1);
    options.trustedHostStartup.captureClosedComposition = attachments => {
      assert.equal(actualDisposed, true); recoveryCaptures++;
      return capture(attachments);
    };
    const retirement = f.integration.whenChildRetired(child);
    await f.secondChildHandle.dispose();
    assert.equal(actualDisposed, true); assert.equal(f.ctx.agents.get(child.id), undefined);
    let timer;
    try {
      await Promise.race([retirement, new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Actual child disposal must complete failed attachment retirement, not wait on an orphaned residency")), 3000);
      })]);
    } finally { clearTimeout(timer); offDisposed(); }
    assert.ok(recoveryCaptures > 0); assert.equal(f.integration.view().state, "ready");
    assert.ok(f.integration.view().generation > generation); assert.equal(f.runtime.admission(sibling), siblingAdmission);
    await f.integration.change("verified queue after failed lifecycle registration", () => {});
    const useful = await f.execute(); assert.equal(useful.isError, false); assert.equal(useful.value.lines[0].text, "useful once");
    assert.equal(f.bodies.read, 1); assert.equal((await f.settle()).length, 1);
    assert.equal(f.bodies.write, 0); assert.equal(f.bodies.shell, 0); assert.equal(f.retirementFaults.length, 0);
    return;
  }
  if (name === "attach-queued-duplicate") {
    admissions.resolveOriginalChildEvidence = async (...args) => {
      const evidence = await resolve(...args);
      if (args[1] === child.id) { entered.release(); await release.promise; }
      return evidence;
    };
    definitions.admit = (...args) => { if (args[1] === child) attempts.push(args[2]); return admit(...args); };
    const first = f.integration.attachChild(f.parent, child, controller.signal);
    await entered.promise;
    const second = assert.rejects(f.integration.attachChild(f.parent, child, controller.signal), { code: "composition-unavailable" });
    release.release();
    const attached = await first; await second;
    assert.equal(attempts.length, 1); assert.equal(attempts[0] === attached.proxy.definition, true);
    assert.equal(f.integration.classifyLegacyTool("read", child.ctx.tools, child)?.definition === attached.proxy.definition, true);
    if (f.integration.view().state !== "ready") f.integration.publishCheckedGeneration();
    const candidate = await child.ctx.tools.execute({ agent: child, name: "read", arguments: { file_path: "useful.txt", offset: 2, limit: 1 },
      callId: ToolCallId(randomUUID()), signal: controller.signal });
    assert.equal(candidate.isError, false); assert.equal((await f.execute()).isError, false);
    assert.equal(f.bodies.read, 2); assert.equal((await f.settle()).length, 2); return;
  }
  admissions.resolveOriginalChildEvidence = async (ticket, id, signal) => {
    const evidence = await resolve(ticket, id, signal);
    if (id === child.id && armed && !late) {
      if (name === "attach-await-cancel" || name === "attach-await-epoch") {
        mergedSignal = signal; entered.release(); await release.promise;
      } else throw failure;
    }
    return evidence;
  };
  definitions.admit = (parent, candidate, definition) => {
    if (candidate === child) {
      attempts.push(definition);
      if (armed && name === "attach-admit-fail") throw failure;
    }
    admit(parent, candidate, definition);
    if (candidate === child && armed && name === "attach-late-epoch") {
      entered.release(); return release.promise;
    }
  };
  definitions.assertAdmitted = (candidate, definition) => {
    check(candidate, definition);
    if (candidate === child) {
      checked.push(definition);
      if (armed && name === "attach-assert-fail") throw failure;
      if (armed && name === "attach-late-cancel") controller.abort(failure);
    }
  };
  if (name === "attach-recovery-unknown") options.trustedHostStartup.captureClosedComposition = () => undefined;
  const executeCandidate = () => child.ctx.tools.execute({ agent: child, name: "read", arguments: { file_path: "useful.txt", offset: 2, limit: 1 },
    callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
  let accepted, finish;
  if (name === "attach-audit-drain") {
    const auditEntered = gate(); finish = gate();
    f.setBeforeFinish(async () => { auditEntered.release(); await finish.promise; });
    accepted = await f.execute(); await auditEntered.promise; assert.equal(accepted.isError, false);
  }
  if (name === "attach-pre-cancel") controller.abort(failure);
  const attaching = f.integration.attachChild(f.parent, child, controller.signal);
  // Handle rejection immediately; await-controlled scenarios must not create an unhandled rejection in RED.
  const rejection = attaching.then(() => ({ accepted: true }), error => ({ error }));
  let changing;
  if (name === "attach-queued-change") changing = f.integration.change("queued owner mutation", async () => { entered.release(); await release.promise; });
  if (name === "attach-await-cancel" || name === "attach-await-epoch" || name === "attach-late-epoch") {
    await entered.promise;
    try {
      if (name === "attach-await-cancel") controller.abort(failure);
      else {
        const ticket = f.authority.acquireParentTicket(f.parent);
        await f.apply({ guards: { gitWriteGuard: "off" } });
        assert.equal(ticket.signal.aborted, true);
        if (!late) assert.equal(mergedSignal.aborted, true);
      }
    } finally { release.release(); }
  }
  if (finish) {
    try {
      assert.equal(f.integration.view().state, "quiescing"); assert.equal(f.integration.view().generation, generation);
      assert.equal(attempts.length, 0); assert.equal((await f.execute()).isError, true); assert.equal(accepted.isError, false);
    } finally { finish.release(); }
  }
  const result = await rejection;
  if (changing) {
    await entered.promise;
    try {
      assert.equal(f.integration.view().state, "unavailable"); assert.equal(f.integration.view().generation, generation);
      assert.throws(() => f.integration.publishCheckedGeneration(), { code: "composition-unavailable" });
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
    } finally { release.release(); await changing; }
  }
  assert.equal(result.accepted, undefined, "an attachment with a revoked admission fence must not commit");
  if (!name.endsWith("epoch")) assert.equal(result.error, failure, "the original failure must survive cleanup and re-attestation");
  else assert.ok(result.error);
  assert.equal(f.integration.classifyLegacyTool("read", child.ctx.tools, child) === undefined, true, "failed admission must revoke the read capability");
  assert.equal(child.ctx.tools.get("read", child) === original, true, "the failed candidate must not retain the proxy registration");
  assert.equal((await executeCandidate()).isError, true); assert.equal(f.bodies.read, accepted ? 1 : 0);
  assert.equal(f.ctx.agents.get(sibling.id), sibling); assert.equal(f.runtime.admission(sibling), siblingAdmission);
  assert.equal(f.integration.view().activeCalls, 0);
  if (late) {
    assert.equal(f.integration.view().state, "unavailable", "the L slot and standing deny remain until actual child disposal");
    armed = false;
    await assert.rejects(f.integration.attachChild(f.parent, child, new AbortController().signal), error => error === result.error);
    assert.equal(attempts.length, 1); assert.ok(checked.length <= 1);
    const retirement = f.integration.whenChildRetired(child);
    await f.secondChildHandle.dispose(); await retirement;
    assert.equal(f.ctx.agents.get(child.id), undefined);
    assert.equal(f.integration.classifyLegacyTool("read", child.ctx.tools, child), undefined);
  }
  if (name === "attach-recovery-unknown") {
    assert.equal(f.integration.view().state, "unavailable");
    assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
    return;
  }
  assert.equal(f.integration.view().state, "ready");
  if (name === "attach-pre-cancel") assert.equal(f.integration.view().generation, generation);
  else assert.ok(f.integration.view().generation > generation);
  const useful = await f.execute(); assert.equal(useful.isError, false); assert.equal(useful.value.lines[0].text, "useful once");
  assert.equal(f.bodies.read, accepted ? 2 : 1);
  if (!late) {
    armed = false; options.trustedHostStartup.captureClosedComposition = capture;
    await f.integration.attachChild(f.parent, child, new AbortController().signal); f.integration.publishCheckedGeneration();
    assert.equal(attempts.length, 1); assert.equal(checked[0], attempts[0]);
    const retry = await executeCandidate(); assert.equal(retry.isError, false); assert.equal(retry.value.lines[0].text, "useful once");
    assert.equal(f.bodies.read, accepted ? 3 : 2);
  }
  const audit = await f.settle();
  assert.equal(audit.filter(row => row.parentCallId).length, f.bodies.read);
  assert.equal(f.bodies.write, 0); assert.equal(f.bodies.shell, 0);
  assert.equal(f.retirementFaults.length, 0);
}

async function scenario(name) {
  const f = await fixture({ off: name === "off" || name === "off-report", unknown: name === "unknown", ask: name.startsWith("ask-") || name.startsWith("child-ask-") && name !== "child-ask-never",
    childApproval: name.startsWith("child-ask-"), multipleChildren: name === "distinct-child-scopes" || name.startsWith("attach-"),
    nativeResidency: name === "report" || name === "off-report", missingAuditCallback: name === "missing-audit-callback",
    missingDefinitions: name === "missing-definition-admission", unregisteredDefinition: name === "unregistered-proxy" });
  try {
    if (name.startsWith("attach-")) { await attachmentTransaction(name, f); return; }
    if (name === "off") {
      assert.equal(f.integration.view().state, "off"); await assert.rejects(f.attach(), { code: "composition-unavailable" });
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0); return;
    }
    if (name === "off-report") {
      assert.equal((await f.execute()).isError, true);
      assert.equal((await f.execute({ agent_id: f.parent.id, message: "read composition is off; native direct report remains available" }, undefined, "send_message")).isError, false);
      assert.equal(f.bodies.read, 0); return;
    }
    if (name === "missing-definition-admission" || name === "unregistered-proxy") {
      await assert.rejects(f.attach(), { code: "provenance-unavailable" });
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0); return;
    }
    if (name === "raw-pre-audit") {
      let resolutions = 0;
      f.setBeforeResolve(() => { resolutions++; });
      await f.attach(); f.integration.publishCheckedGeneration();
      const args = { file_path: "useful.txt\0", offset: 2, limit: 1 };
      const result = await f.execute(args), audit = await f.settle();
      assert.equal(result.isError, true); assert.equal(f.contexts.length, 1); assert.deepEqual(f.contexts[0].arguments, args);
      assert.equal(resolutions, 0); assert.equal(f.bodies.read, 0); assert.equal(audit.length, 1);
      assert.equal(audit[0].childError, true); assert.equal(audit[0].parentCallId, undefined); assert.equal(audit[0].parentError, undefined);
      return;
    }
    if (name === "context-caller-cutoff") {
      const entered = gate(), resume = gate(), caller = new AbortController();
      let merged, local, resolutions = 0, downstream = 0;
      f.setBeforeResolve(() => { resolutions++; });
      f.setBeforeContext(async (context, _exec, lease) => { merged = lease.signal; local = context.signal; entered.release(); await resume.promise; });
      f.listen("child", "tools/pre-execute", async (_exec, next) => { downstream++; return next(); });
      await f.attach(); f.integration.publishCheckedGeneration();
      const pending = f.execute(undefined, caller.signal);
      await entered.promise;
      try {
        caller.abort("actual caller revoked during Host context acquisition");
        assert.equal(merged.aborted, true); assert.equal(local.aborted, true);
      } finally { resume.release(); }
      const result = await pending, audit = await f.settle();
      assert.equal(result.isError, true); assert.equal(downstream, 0); assert.equal(resolutions, 0); assert.equal(f.bodies.read, 0);
      assert.equal(f.contexts.length, 1); assert.equal(f.contexts[0].localLifetime.signal.aborted, true);
      assert.equal(audit.length, 0); assert.equal(f.integration.view().activeCalls, 0);
      return;
    }
    if (name === "child-pre-terminal-revoked" || name === "child-pre-cancel-revoked") {
      const entered = gate(), resume = gate();
      f.listen("child", "tools/pre-execute", async () => {
        entered.release(); await resume.promise;
        if (name === "child-pre-cancel-revoked") return { kind: "cancel" };
        return { kind: "deny", reason: "actual terminal child decision", info: { name: "ChildPolicy", code: "CHILD_POLICY", reason: "actual child reason" } };
      });
      await f.attach(); f.integration.publishCheckedGeneration();
      const pending = f.execute(); await entered.promise;
      try { await f.apply({ roles: { "dsmm-reviewer": false } }); }
      finally { resume.release(); }
      const result = await pending, audit = await f.settle();
      assert.equal(result.isError, true); assert.equal(result.error.info?.code,
        name === "child-pre-cancel-revoked" ? "ABORTED_BEFORE_DISPATCH" : "CHILD_POLICY", JSON.stringify(result));
      if (name === "child-pre-terminal-revoked") assert.equal(result.error.info.reason, "actual child reason");
      assert.equal(f.bodies.read, 0);
      assert.equal(audit.length, 1); assert.equal(audit[0].childError, true); assert.equal(audit[0].parentCallId, undefined);
      return;
    }
    if (name === "child-pre-denial-audit" || name === "child-pre-throw-audit" || name === "child-around-throw-audit") {
      let contextReady;
      f.listen("child", name === "child-around-throw-audit" ? "tools/execute" : "tools/pre-execute", async exec => {
        contextReady = f.contexts.some(context => context.token === exec.token);
        if (name !== "child-pre-denial-audit") throw new HarnessError("Actual owned child policy failure", "CHILD_POLICY");
        return { kind: "deny", reason: "Actual owned child policy denial", info: { name: "ChildPolicy", code: "CHILD_POLICY" } };
      });
      await f.attach(); f.integration.publishCheckedGeneration();
      const result = await f.execute(), audit = await f.settle();
      assert.equal(contextReady, true, "The actual call context must be acquired before delegated child policy");
      assert.equal(result.isError, true); assert.equal(result.error.info?.code, "CHILD_POLICY"); assert.equal(f.bodies.read, 0);
      assert.equal(f.contexts.length, 1); assert.equal(audit.length, 1); assert.equal(audit[0].childError, true);
      assert.equal(audit[0].parentCallId, undefined); assert.equal(audit[0].parentError, undefined);
      return;
    }
    if (name === "distinct-child-scopes") {
      const first = await f.attach();
      const second = await f.integration.attachChild(f.parent, f.secondChild, new AbortController().signal);
      assert.notEqual(first.proxy.definition, second.proxy.definition);
      f.integration.publishCheckedGeneration();
      const secondCall = f.secondChild.ctx.tools.execute({ agent: f.secondChild, name: "read", arguments: { file_path: "useful.txt", offset: 2, limit: 1 },
        callId: ToolCallId(randomUUID()), signal: new AbortController().signal });
      const results = await Promise.all([f.execute(), secondCall]);
      assert.ok(results.every(result => !result.isError && result.value.lines[0].text === "useful once"));
      const audit = await f.settle(); assert.equal(f.bodies.read, 2); assert.equal(audit.length, 2);
      assert.deepEqual(new Set(audit.map(row => row.child)), new Set([f.child.id, f.secondChild.id]));
      assert.equal(f.contexts.length, 2); return;
    }
    if (name.startsWith("child-ask-")) {
      f.listen("child", "tools/pre-execute", async () => ({ kind: "ask", reason: "actual child read policy" }));
      let requests = 0;
      f.ctx.on("approval/request", async () => { requests++; return "rejected"; }, { global: true });
      let endParent, endChild;
      try {
        await f.attach();
        if (name !== "child-ask-never") endParent = await f.beginTurn();
        if (name !== "child-ask-idle") endChild = await f.beginTurn(f.child);
        f.integration.publishCheckedGeneration();
        const result = await f.execute(), audit = await f.settle();
        assert.equal(result.isError, true); assert.equal(result.error.info.code, "approval-unavailable");
        assert.equal(requests, 0); assert.equal(f.bodies.read, 0);
        if (name !== "child-ask-idle") {
          assert.equal(f.contexts.length, 1); assert.equal(audit.length, 1); assert.equal(audit[0].childError, true);
          assert.equal(audit[0].parentCallId, undefined); assert.equal(audit[0].parentError, undefined);
        }
        await f.ctx.sessions.flush(f.child.session);
        const persisted = await f.ctx.sessionQuery.observeSession(f.child.id, { signal: new AbortController().signal, projectionMode: "none" });
        try { assert.equal(persisted.events.filter(event => event.type === "approval/asked" || event.type === "approval/decided").length, 0); }
        finally { persisted[Symbol.dispose](); }
      } finally {
        if (endChild) await endChild(); if (endParent) await endParent();
      }
      return;
    }
    if (name.startsWith("deny-") || name === "full-params") {
      const side = name === "full-params" ? "parent" : name.split("-")[1];
      f.listen(side, "tools/execute", async (exec, next) => { if (name === "full-params") { assert.equal(exec.agent, f.parent);
        assert.equal(exec.arguments.file_path, join(f.root, "child", "useful.txt")); assert.equal(exec.arguments.offset, 2); assert.equal(exec.arguments.limit, 1); }
        return { isError: true, error: { message: "real late policy", info: { name: "ActualPolicy", code: "POLICY", reason: "native detail" } }, content: [{ type: "text", text: "normal denial" }] }; });
    }
    if (name.startsWith("post-") || name === "transform-child") f.listen(name.endsWith("parent") ? "parent" : "child", "tools/post-execute", async (_exec, _result, next) => {
      await next(); return name === "transform-child" ? { kind: "accept", content: [{ type: "text", text: "authoritative transformation" }] }
        : { kind: "block", feedback: [{ type: "text", text: "normal post denial" }] }; });
    if (name === "transform-parent") f.listen("parent", "tools/execute", async (_exec, next) => {
      const result = await next();
      assert.equal(result.isError, false);
      return { ...result, value: { ...result.value, lines: result.value.lines.map(line => ({ ...line, text: "real parent transformed line" })) } };
    });
    if (name === "unknown" || name === "metadata" || name === "missing-audit-callback") {
      if (name === "metadata") f.listen("child", "tools/execute", async (_exec, next) => next(), "metadata-dependent");
      await f.attach(); assert.throws(() => f.integration.publishCheckedGeneration(), { code: "composition-unavailable" });
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0); return;
    }
    const entered = gate(), resume = gate(), finish = gate();
    if (["apply", "lifetime", "generation"].includes(name)) f.setBeforeResolve(async () => { entered.release(); await resume.promise; });
    if (name === "parent-cutoff") f.listen("parent", "tools/execute", async (_exec, next) => { entered.release(); await resume.promise; return next(); });
    if (name === "generation") f.setBeforeFinish(async () => { await finish.promise; });
    if (name === "success-wins") f.listen("child", "tools/post-execute", async (_exec, result, next) => { if (!result.isError) { entered.release(); await resume.promise; } return next(); });
    if (name.startsWith("ask-")) f.listen("parent", "tools/pre-execute", async () => ({ kind: "ask", reason: "normal real parent policy" }));
    await f.attach(); f.integration.publishCheckedGeneration();
    if (["apply", "parent-cutoff", "lifetime", "generation", "success-wins"].includes(name)) {
      const oldAdmission = f.runtime.admission(f.child), pending = f.execute(); await entered.promise;
      let changing;
      if (name === "apply" || name === "parent-cutoff" || name === "success-wins") await f.apply({ guards: { gitWriteGuard: "off" } });
      else if (name === "lifetime") changing = f.integration.revokeChildBeforeDispose(f.child, () => f.childHandle.dispose());
      else { let mutationEntered = false;
        changing = f.integration.change("controlled-policy-change", () => { mutationEntered = true; });
        assert.equal(mutationEntered, false); assert.equal((await f.execute()).isError, true);
        resume.release(); const result = await pending; assert.equal(result.isError, false); assert.equal(mutationEntered, false);
        finish.release(); await changing; assert.equal(mutationEntered, true); assert.equal(f.integration.view().generation, 2); assert.equal(f.bodies.read, 1); return;
      }
      resume.release(); const result = await pending; if (changing) await changing;
      assert.equal(result.isError, name !== "success-wins"); assert.equal(f.bodies.read, name === "success-wins" ? 1 : 0);
      if (name === "parent-cutoff") assert.equal(result.error.info.code, "ABORTED_BEFORE_DISPATCH");
      if (name !== "lifetime") assert.equal(f.runtime.admission(f.child), oldAdmission); return;
    }
    if (name === "standing" || name === "automatic-retirement") {
      if (name === "standing") { await f.integration.removeProxy(f.child); assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0); }
      await f.childHandle.dispose(); await f.integration.whenChildRetired(f.child); assert.equal(f.retirementFaults.length, 0);
      assert.equal(f.integration.classifyLegacyTool("read", f.ctx.tools, f.child), undefined); assert.equal(f.integration.view().activeCalls, 0); return;
    }
    if (name === "serialized-changes") {
      const enteredChange = gate(), releaseChange = gate();
      const first = f.integration.change("first-controlled-change", async () => { enteredChange.release(); await releaseChange.promise; });
      const second = f.integration.change("second-controlled-change", () => { assert.notEqual(f.integration.view().state, "ready"); });
      await enteredChange.promise;
      assert.throws(() => f.integration.publishCheckedGeneration(), { code: "composition-unavailable" });
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
      releaseChange.release(); await first; await second;
      assert.equal(f.integration.view().state, "ready"); assert.equal(f.integration.view().generation, 2);
      assert.equal((await f.execute()).isError, false); assert.equal(f.bodies.read, 1); return;
    }
    if (name === "current-role") {
      const original = f.runtime.admission(f.child);
      await f.apply({ roles: { "dsmm-reviewer": false } });
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0); assert.equal(f.runtime.admission(f.child), original); return;
    }
    if (name === "report") {
      const report = await f.execute({ agent_id: f.parent.id, message: "exact direct-parent report" }, undefined, "send_message");
      assert.equal(report.isError, false, JSON.stringify(report));
      assert.equal((await f.execute({ agent_id: "foreign-parent", message: "must deny" }, undefined, "send_message")).isError, true);
      assert.equal(f.bodies.read, 0); return;
    }
    if (name === "guard-not-query") {
      const ticket = f.authority.acquireParentTicket(f.parent), evidence = await f.bridge.resolveOriginalEvidence(f.bridge.authority.acquireParentTicket(f.parent), f.child.id, ticket.signal);
      let queried = false;
      const policy = new LegacyChildToolPolicy(evidence, f.parent, f.child, { classifyTool: () => ({ kind: "read", definition: f.parent.ctx.tools.get("read", f.parent), assertArguments() {} }),
        assertParentTool() { queried = true; } });
      assert.ok(policy.denial("read", {}, f.parent.ctx.tools)); assert.equal(queried, false);
      for (const name of ["integration_write", "integration_shell", "integration_delegate"]) assert.equal((await f.execute({}, undefined, name)).isError, true);
      assert.equal(f.bodies.write, 0); assert.equal(f.bodies.shell, 0);
    }
    let endTurn;
    if (name === "ask-allow" || name === "ask-deny" || name === "ask-close") {
      const asked = gate(), answer = gate();
      f.ctx.on("approval/request", async request => { assert.equal(request.agent, f.parent); asked.release(); if (name === "ask-close") await answer.promise;
        return name === "ask-deny" ? "rejected" : "allowed-once"; }, { global: true });
      endTurn = await f.beginTurn(); const pending = f.execute(); await asked.promise;
      let closing; if (name === "ask-close") closing = endTurn();
      const result = await pending; answer.release(); await f.settle(); if (closing) await closing; else await endTurn();
      assert.equal(result.isError, name !== "ask-allow"); assert.equal(f.bodies.read, name === "ask-allow" ? 1 : 0);
      const events = f.parent.session.snapshotEvents(), request = events.find(e => e.type === "approval/asked"), decision = events.find(e => e.type === "approval/decided");
      assert.ok(request); assert.equal(request.data.id, decision.data.id); assert.equal(decision.data.outcome, name === "ask-allow" ? "allowed-once" : name === "ask-deny" ? "rejected" : "cancelled");
      await f.ctx.sessions.flush(f.parent.session);
      const persisted = await f.ctx.sessionQuery.observeSession(f.parent.id, { signal: new AbortController().signal, projectionMode: "none" });
      try {
        assert.ok(persisted.events.some(event => event.type === "approval/asked" && event.data.id === request.data.id));
        assert.ok(persisted.events.some(event => event.type === "approval/decided" && event.data.id === request.data.id && event.data.outcome === decision.data.outcome));
      } finally { persisted[Symbol.dispose](); }
      return;
    }
    if (name === "audit-fault") f.setAuditFault(true);
    if (name === "audit-unavailable") f.setAuditAvailable(false);
    const result = await f.execute(name === "alias" ? { file_path: "alias.txt", offset: 2, limit: 1 } : undefined);
    const audit = await f.settle();
    if (name.startsWith("deny-") || name === "full-params") { assert.equal(result.isError, true); assert.equal(result.error.info.code, "POLICY"); assert.equal(result.error.info.reason, "native detail"); assert.equal(f.bodies.read, 0); }
    else if (name.startsWith("post-") || name === "transform-child") { assert.equal(f.bodies.read, 1); assert.equal(result.isError, name !== "transform-child");
      assert.equal(result.content[0].text, name === "transform-child" ? "authoritative transformation" : "normal post denial"); }
    else if (name === "ask-idle" || name === "audit-unavailable") { assert.equal(result.isError, true); assert.equal(f.bodies.read, 0);
      assert.equal(result.error.info.code, name === "ask-idle" ? "approval-unavailable" : "audit-unavailable"); }
    else { assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, name === "transform-parent" ? "real parent transformed line" : "useful once"); assert.equal(f.bodies.read, 1);
      if (name === "transform-parent") assert.deepEqual(result, f.observations.find(row => row.exec.agent === f.parent).result);
      if (name === "audit-fault") { assert.equal(f.auditFaults.length, 1); assert.equal((await f.execute()).isError, true); }
      else { assert.equal(audit.length, 1); const nested = f.observations.find(row => row.exec.agent === f.parent);
        const outer = f.observations.find(row => row.exec.agent === f.child && !row.result.isError);
        assert.equal(nested.exec.parent, outer.exec.token); assert.equal(nested.exec.rootCallId, outer.exec.rootCallId); assert.equal(audit[0].parentCallId, nested.exec.callId); }
    }
  } finally { await f.dispose(); }
}
if (process.argv[1]?.endsWith("legacy-read-integration-fixture.mjs")) {
  await scenario(process.argv[2]); console.log(JSON.stringify({ scenario: process.argv[2] }));
}
