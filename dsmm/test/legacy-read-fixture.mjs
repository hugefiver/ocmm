import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { LlmAdapter, LlmRuntime, ToolCallId, HarnessError, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SessionQueryEngine } from "@deepseek-ai/dsh-session-query";
import { SubagentRuntime, foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { LocalFileSystem } from "@deepseek-ai/dsh-fs-local";
import * as NativeFs from "@deepseek-ai/dsh-tool-fs";
import { ApprovalService } from "@deepseek-ai/dsh-user-approval";
import { createScope, scopeChainOf } from "@deepseek-ai/dsh-scope";
import { parseLegacyChildEvidence } from "../src/child-capture.ts";
import { createLegacyReadHost, createLegacyReadHostOwner, createLegacyReadCallLease, createLegacyReadComposition, LegacyReadUnavailable } from "../src/legacy-read-host.ts";

export function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
class UsefulAdapter extends LlmAdapter {
  beforeStream;
  streams = [];
  async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ["text"] }; }
  async *stream(options) {
    this.streams.push({ model: options.model, signal: options.signal });
    await this.beforeStream?.(options);
    options.signal.throwIfAborted();
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "native fixture turn" };
    yield { type: "block-end", index: 0, block: { type: "text", text: "native fixture turn" } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}
class ExactQuery extends SessionQueryEngine {
  async searchSessions() { throw new Error("Legacy read fixture does not search unrelated history"); }
  async searchEvents() { throw new Error("Legacy read fixture does not search unrelated history"); }
}

export async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "dsmm-legacy-read-"));
  const ctx = new Context();
  const handles = [], policies = [], scopes = [];
  const bodies = { read: 0, stat: 0 };
  const observations = [], auditFaults = [], contextCalls = [], auditOutcomes = [];
  const epoch = new AbortController(), childLifetime = new AbortController();
  let turnLifetime = new AbortController();
  const adapter = new UsefulAdapter();
  let native;
  let beforeResolve, beforeContext, beforeFinish, auditFault = false, auditAvailable = true, provenance = true, mismatch = false, disposed = false;
  class CountedNativeFs extends LocalFileSystem {
    async resolve(path, opts) {
      await beforeResolve?.(path, opts);
      const target = await super.resolve(path, opts);
      return mismatch && opts?.cwd?.endsWith("parent") ? { ...target, targetKey: Symbol("other-target") } : target;
    }
    async readText(target, signal) { bodies.read++; return super.readText(target, signal); }
    async streamText(target, signal) { bodies.read++; return super.streamText(target, signal); }
    async stat(target, signal) { bodies.stat++; return super.stat(target, signal); }
  }
  // Public factory subclass preserves the native composition while owning the test child's cwd.
  class ChildCwdLoop extends AgentLoop {
    createAgent(ownerCtx, options) {
      return super.createAgent(ownerCtx, options.parentAgent === undefined ? options : { ...options,
        meta: { ...options.meta, cwd: join(root, "child") } });
    }
  }
  try {
    await mkdir(join(root, "parent")); await mkdir(join(root, "child"));
    await writeFile(join(root, "child", "useful.txt"), "first line\nuseful once\nlast line\n");
    await symlink(join(root, "child", "useful.txt"), join(root, "child", "alias.txt"));
    await Promise.all([ctx.plugin(AgentRegistry).await(), ctx.plugin(SessionStore).await(), ctx.plugin(SessionProjectionRegistry).await(),
      ctx.plugin(LlmRuntime).await(), ctx.plugin(SystemPrompt, {}).await(), ctx.plugin(ToolRuntime, { mode: "native" }).await()]);
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, "sessions"), compression: "none" }).await();
    await ctx.plugin(ExactQuery).await();
    await ctx.plugin(CountedNativeFs, {}).await();
    const config = Object.freeze({ readLimit: 8, readMaxBytes: 2048, readMaxLineLength: 200, readStreamMinSize: 1000000 });
    const mount = ctx.plugin(NativeFs, config); await mount.await();
    await ctx.plugin({ name: "legacy-read-fixture-subagents", apply(scope) {
      native = new SubagentRuntime(scope, { maxDepth: { get: () => 3 }, maxActiveSubagents: { get: () => 8 } });
    } }).await();
    await ctx.plugin(ChildCwdLoop, {}).await();
    await ctx.plugin(Spawn, { providerName: "dsmm-role-reviewer" }).await();
    ctx.llm.registerAdapter(["fixture"], adapter);
    const parentHandle = await ctx.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: join(root, "parent") },
      agentOptions: { provider: "fixture", model: "parent" } });
    handles.push(parentHandle);
    const parent = parentHandle.agent;
    const createLegacyChild = async lifetime => {
      const started = await native.startContinuable({ provider: "dsmm-role-reviewer", label: "owned original reviewer",
        signal: new AbortController().signal, request: { parent, maxDepth: 3, prompt: [{ type: "text", text: "establish original native route" }],
          agentOptions: { provider: "fixture", model: "old-reviewer" }, toolFilter: { allow: ["read"] } } });
      await started.output;
      await native.drainContinuableChildren(parent, [started.childId]);
      await parent.whenIdle();
      const observation = await ctx.get("sessionQuery").observeSession(started.childId, { signal: new AbortController().signal, projectionMode: "none" });
      const physicalRecords = Object.freeze([observation.header, ...observation.events]);
      const descriptor = foldSubagentDescriptor(observation.events);
      observation[Symbol.dispose]();
      assert.equal(descriptor.mode, "continuable"); assert.equal(descriptor.provider, "dsmm-role-reviewer");
      const childHandle = await ctx.agents.resume({ resumeSessionId: started.childId, parentAgent: parent,
        agentOptions: { provider: descriptor.agentProvider, model: descriptor.agentModel },
        setup(scope) { scope.tools.restrict(descriptor.toolFilter); } });
      handles.push(childHandle);
      const child = childHandle.agent;
      const evidence = parseLegacyChildEvidence({ version: 1, mode: "legacy-conservative", childSessionId: child.id, parentSessionId: parent.id,
        role: "dsmm-reviewer", route: { provider: descriptor.agentProvider, model: descriptor.agentModel }, depth: child.session.header.delegationDepth,
        toolFilter: descriptor.toolFilter, provenFields: ["lineage", "role", "route", "tool-filter"], limitations: [] });
      return { childHandle, child, evidence, physicalRecords, lifetime, turnLifetime: new AbortController(), admission: Object.freeze({ originalEvidence: evidence }) };
    };
    const first = await createLegacyChild(childLifetime);
    const { childHandle, child, evidence } = first;
    const childRows = [first];
    if (options.twoChildren) childRows.push(await createLegacyChild(new AbortController()));
    // This startup adds a normal approval service; it never widens an existing delegated approval pin.
    if (options.turnApproval || options.childApproval) await ctx.plugin(ApprovalService, { policy: "ask" }).await();
    const definition = parent.ctx.tools.get("read", parent);
    assert.ok(definition);
    const provider = Object.freeze({ mount }), world = Object.freeze({ root });
    for (const row of childRows) row.binding = Object.freeze({ parent, child: row.child, definition, mount, config,
      caps: Object.freeze({ limit: 8, maxBytes: 2048, maxLineLength: 200, streamMinSize: 1000000 }),
      parentFs: parent.ctx.get("fs"), childFs: row.child.ctx.get("fs"), parentProvider: provider, childProvider: provider, parentWorld: world, childWorld: world });
    const binding = first.binding;
    const parentAdmission = Object.freeze({ currentParent: parent });
    const ticket = Object.freeze({ parent, owner: ctx, admission: parentAdmission, parentEpoch: "current-not-original", signal: epoch.signal });
    const auditFile = join(root, "parent-proxy-audit.jsonl");
    await writeFile(auditFile, "");
    let host, proxy;
    const addScope = (scope, key) => { scopes.push({ ctx: scope, key, ancestors: scopeChainOf(key).slice(1) }); };
    addScope(ctx, ctx); addScope(parent.ctx, parent);
    for (const row of childRows) addScope(row.child.ctx, row.child);
    const ownerCallbacks = {
      captureClosedComposition() {
        if (options.unknown) return undefined;
        return { owner, coverage: "host-owned-complete", scopes, policies: policies,
          bindings: childRows.map(row => row.binding), approval: options.turnApproval ? "coordinated-turn" : "never-ask",
          fidelity: "canonical-value-content-contexts", mutation: "owner-coordinated" };
      },
      acquireParentTicket(agent) { assert.equal(this, ownerReceiver); assert.equal(agent, parent); epoch.signal.throwIfAborted(); return ticket; },
      assertParentTicket(value) { assert.equal(value, ticket); assert.equal(ctx.agents.get(parent.id), parent); epoch.signal.throwIfAborted(); },
      resolveChildAdmission(p, c, original) {
        const row = childRows.find(row => row.child === c);
        assert.equal(p, parent); assert.ok(row); assert.equal(original, row.evidence);
        return { evidence: row.evidence, admission: row.admission, source: "physical-old", physicalRecords: row.physicalRecords, childLifetime: row.lifetime.signal,
          ...(options.originalCapture ? { originalCapture: Object.freeze({ originalAdmissionEpoch: "original" }) } : {}) };
      },
      resolveReadBindings(p, c, lease) {
        const row = childRows.find(row => row.child === c);
        assert.equal(p, parent); assert.ok(row); assert.equal(lease.bindings, row.binding);
        if (!provenance) throw new LegacyReadUnavailable("provenance-unavailable");
        return row.binding;
      },
      async acquireCallContext(p, c, exec, lease) {
        const row = childRows.find(row => row.child === c);
        assert.equal(p, parent); assert.ok(row);
        const boundary = ctx.sessionProjections.stateOf(parent.session, "turnBoundary");
        const childBoundary = ctx.sessionProjections.stateOf(c.session, "turnBoundary");
        await beforeContext?.(exec, lease);
        if (!auditAvailable) throw new LegacyReadUnavailable("audit-unavailable");
        if (options.turnApproval && boundary?.openTurnStartSeq == null) throw new LegacyReadUnavailable("approval-unavailable");
        const callLifetime = new AbortController();
        const callbacks = { approval: options.turnApproval ? { kind: "coordinated-turn",
          turn: { parent, openTurnStartSeq: boundary.openTurnStartSeq }, signal: turnLifetime.signal,
          ...(childBoundary?.openTurnStartSeq == null ? {} : { childTurn: { child: c, openTurnStartSeq: childBoundary.openTurnStartSeq, signal: row.turnLifetime.signal } })
        } : { kind: "never-ask" }, signal: callLifetime.signal,
          assertAvailable() { assert.equal(this, callReceiver); if (!auditAvailable) throw new LegacyReadUnavailable("audit-unavailable");
            if (options.turnApproval && ctx.sessionProjections.stateOf(parent.session, "turnBoundary")?.openTurnStartSeq !== boundary.openTurnStartSeq) throw new LegacyReadUnavailable("approval-unavailable"); },
          async finish(outcomes) {
            await beforeFinish?.(outcomes);
            // A separately awaited actual append, not tools/result counted as a durable commit.
            await appendFile(auditFault ? join(root, "missing-audit-route", "audit.jsonl") : auditFile, JSON.stringify({ parent: parent.id, child: c.id, rootCallId: outcomes.childExecution.rootCallId,
              childCallId: outcomes.childExecution.callId, parentCallId: outcomes.parentExecution?.callId,
              parentError: outcomes.parentResult?.isError, childError: outcomes.childResult.isError }) + "\n");
            auditOutcomes.push(outcomes);
          }, release() { callLifetime.abort("call-finished"); },
        };
        const callReceiver = options.methodCallbacks ? Object.create(callbacks) : callbacks;
        const context = createLegacyReadCallLease(callReceiver);
        contextCalls.push({ exec, lease, context });
        return context;
      },
      revoke(reason) { epoch.abort(reason); for (const row of childRows) row.lifetime.abort(reason); },
      reportAuditFault(error, outcomes) { auditFaults.push({ error, outcomes }); },
    };
    const ownerReceiver = options.methodCallbacks ? Object.create(ownerCallbacks) : ownerCallbacks;
    const owner = createLegacyReadHostOwner(ownerReceiver);
    host = createLegacyReadHost(owner);
    const listen = (side, event, listener, semantics = "audited-zero-or-once", listenerOptions = {}) => {
      const target = typeof side === "object" ? side : side === "parent" ? parent : child;
      const scope = createScope(target.ctx, target); addScope(scope.ctx, target);
      const dispose = scope.ctx.on(event, listener, listenerOptions);
      policies.push({ side: target === parent ? "parent" : "child", stage: event === "tools/pre-execute" ? "pre" : event === "tools/execute" ? "around" : event === "tools/post-execute" ? "post" : "finalization",
        scope: scope.ctx, reference: listener, order: policies.length, semantics });
      return dispose;
    };
    ctx.on("tools/result", (exec, result) => { if (exec.name === "read") observations.push({ exec, result }); }, { global: true });
    policies.push({ side: "both", stage: "finalization", scope: ctx, reference: observations, order: policies.length, semantics: "audited-zero-or-once" });
    const install = () => {
      for (const row of childRows) {
        row.proxy = host.attachChild(parent, row.child, row.evidence, definition);
        addScope(row.proxy.proxyScope.ctx, row.child); addScope(row.proxy.standingScope.ctx, row.child);
        for (const contribution of row.proxy.contributions) policies.push({ side: "child", stage: contribution.stage,
          scope: contribution.scope.ctx, reference: contribution.reference, order: contribution.stage === "pre" || contribution.stage === "around" ? -1 : contribution.order,
          semantics: "audited-zero-or-once" });
        policies.push({ side: "child", stage: "filter", scope: row.child.ctx, reference: row.evidence.toolFilter, order: policies.length, semantics: "audited-zero-or-once" });
      }
      proxy = first.proxy;
      return proxy;
    };
    const ready = () => host.publishCheckedGeneration();
    const finalizeChildContent = finalizeContent => {
      assert.equal(host.composition.view().state, "off");
      proxy.definition.finalizeContent = finalizeContent;
      policies.push({ side: "child", stage: "finalization", scope: proxy.proxyScope.ctx, reference: finalizeContent,
        order: 1, semantics: "audited-zero-or-once" });
    };
    const executeChild = (target, args = { file_path: "useful.txt", offset: 2, limit: 1 }, signal = new AbortController().signal) => target.ctx.tools.execute({
      agent: target, name: "read", arguments: args, callId: ToolCallId(randomUUID()), signal });
    const execute = (args, signal) => executeChild(child, args, signal);
    const settle = async () => { await host.composition.closeForChange("fixture-observe-audit"); return (await readFile(auditFile, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); };
    const beginParentTurn = async () => {
      turnLifetime = new AbortController();
      const entered = gate(), continueTurn = gate(), idle = gate();
      const off = ctx.on("agent/status", ({ agent, status }) => { if (agent === parent && status === "idle") idle.release(); }, { global: true });
      adapter.beforeStream = async options => { if (options.model === "parent") { entered.release(); await continueTurn.promise; } };
      parent.followup(createUserMessage({ content: [{ type: "text", text: "actual parent operation turn" }] }));
      await entered.promise;
      assert.notEqual(ctx.sessionProjections.stateOf(parent.session, "turnBoundary").openTurnStartSeq, null);
      return async () => {
        turnLifetime.abort("real-turn-closing");
        const drain = host.composition.closeForChange("real-turn-closing");
        await drain; continueTurn.release(); await idle.promise; off(); adapter.beforeStream = undefined;
      };
    };
    const beginChildTurn = async () => {
      first.turnLifetime = new AbortController();
      const entered = gate(), continueTurn = gate(), idle = gate();
      const previous = adapter.beforeStream;
      const off = ctx.on("agent/status", ({ agent, status }) => { if (agent === child && status === "idle") idle.release(); }, { global: true });
      adapter.beforeStream = async options => { if (options.model === "old-reviewer") { entered.release(); await continueTurn.promise; } else await previous?.(options); };
      child.followup(createUserMessage({ content: [{ type: "text", text: "actual child operation turn" }] }));
      await entered.promise;
      assert.notEqual(ctx.sessionProjections.stateOf(child.session, "turnBoundary").openTurnStartSeq, null);
      return async () => {
        first.turnLifetime.abort("real-child-turn-closing"); await host.composition.closeForChange("real-child-turn-closing");
        continueTurn.release(); await idle.promise; off(); adapter.beforeStream = previous;
      };
    };
    return { root, ctx, parent, child, children: childRows.map(row => row.child), parentHandle, childHandle, host, owner, binding, evidence, definition, bodies, observations, auditFaults, auditOutcomes, contextCalls,
      adapter, install, ready, execute, executeChild, listen, settle, finalizeChildContent,
      epoch, childLifetime, beginParentTurn, beginChildTurn,
      setBeforeResolve(fn) { beforeResolve = fn; }, setBeforeContext(fn) { beforeContext = fn; }, setBeforeFinish(fn) { beforeFinish = fn; },
      setAuditFault(value) { auditFault = value; }, setAuditAvailable(value) { auditAvailable = value; }, setProvenance(value) { provenance = value; }, setMismatch(value) { mismatch = value; },
      async dispose() {
        if (disposed) return; disposed = true;
        await host.dispose(async () => { await native.drainContinuableDescendants(handles.map(handle => handle.agent));
          for (const handle of [...handles].reverse()) await handle.dispose(); });
        await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    epoch.abort(); childLifetime.abort();
    if (native) await native.drainContinuableDescendants(handles.map(handle => handle.agent));
    for (const handle of [...handles].reverse()) await handle.dispose();
    await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); throw error;
  }
}

const scenario = process.argv[2];
if (scenario) {
  const options = { unknown: scenario === "unknown", turnApproval: scenario.startsWith("approval-"), childApproval: scenario === "child-ask-never",
    twoChildren: scenario === "two-children", originalCapture: scenario === "captured-evidence", methodCallbacks: scenario === "owner-methods" };
  const f = await fixture(options);
  try {
    if (scenario === "ordinary" || scenario === "owner-methods") {
      f.install(); assert.equal(f.host.composition.view().state, "off");
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
      f.ready(); const result = await f.execute();
      assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, "useful once"); assert.equal(f.bodies.read, 1);
      const audit = await f.settle(); assert.equal(audit.length, 1);
      const nested = f.observations.find(row => row.exec.agent === f.parent);
      const outer = f.observations.find(row => row.exec.agent === f.child && !row.result.isError);
      assert.equal(nested.exec.parent, outer.exec.token); assert.equal(nested.exec.rootCallId, outer.exec.rootCallId);
      assert.notEqual(nested.exec.callId, outer.exec.callId); assert.equal(audit[0].parentCallId, nested.exec.callId);
    } else if (scenario.startsWith("deny-")) {
      const [, side, phase] = scenario.split("-");
      if (phase === "pre") f.listen(side, "tools/pre-execute", async () => ({ kind: "deny", reason: "normal native policy", info: { name: "NativePolicy", code: "POLICY", reason: "raw detail" } }));
      else f.listen(side, "tools/execute", async () => ({ isError: true, error: { message: "later native policy", info: { name: "NativePolicy", code: "POLICY", reason: "raw detail" } }, content: [{ type: "text", text: "native denial" }] }));
      f.install(); f.ready(); const result = await f.execute(); assert.equal(result.isError, true); assert.equal(f.bodies.read, 0);
      assert.equal(result.error.info.reason, "raw detail");
    } else if (scenario === "post-child" || scenario === "post-parent" || scenario === "transform-child") {
      const side = scenario === "post-parent" ? "parent" : "child";
      f.listen(side, "tools/post-execute", async (_exec, _result, next) => {
        await next(); return scenario === "transform-child" ? { kind: "accept", content: [{ type: "text", text: "authoritative child transform" }] }
          : { kind: "block", feedback: [{ type: "text", text: "normal post denial" }] };
      });
      f.install(); f.ready(); const result = await f.execute(); assert.equal(f.bodies.read, 1);
      assert.equal(result.isError, scenario !== "transform-child"); assert.equal(result.content[0].text, scenario === "transform-child" ? "authoritative child transform" : "normal post denial");
    } else if (scenario === "failure") {
      f.install(); f.ready(); const result = await f.execute({ file_path: "missing.txt" });
      assert.equal(result.isError, true); assert.equal(result.error.info.code, "FS_NOT_FOUND");
      const parent = f.observations.find(row => row.exec.agent === f.parent); assert.deepEqual(result, parent.result);
    } else if (scenario === "later-transform") {
      f.listen("child", "tools/execute", async (_exec, next) => { await next(); return { isError: true, error: { message: "replacement" }, content: [{ type: "text", text: "replacement" }] }; });
      f.install(); f.ready(); const result = await f.execute(); assert.equal(f.bodies.read, 1); assert.equal(result.isError, true); assert.equal(result.content[0].text, "replacement");
    } else if (scenario === "arguments") {
      f.install(); f.ready();
      for (const args of [{ file_path: "useful.txt", credential: "must-not-forward" }, { file_path: "useful.txt", limit: 9 }, { file_path: "useful.txt", offset: 0 },
        { file_path: "useful.txt", sandbox_permissions: "require_escalated" }]) {
        const result = await f.execute(args); assert.equal(result.isError, true); assert.equal(result.error.info.code, "arguments-unavailable");
      }
      assert.equal(f.bodies.read, 0); assert.equal(f.bodies.stat, 0);
    } else if (scenario === "target" || scenario === "provenance" || scenario === "definition-replaced" || scenario === "captured-evidence") {
      f.install(); f.ready(); if (scenario === "target") f.setMismatch(true);
      if (scenario === "provenance") f.setProvenance(false);
      if (scenario === "definition-replaced") {
        await f.parent.ctx.plugin(NativeFs, { readLimit: 9 }).await();
        assert.notEqual(f.parent.ctx.tools.get("read", f.parent), f.definition);
      }
      assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0); assert.equal(f.bodies.stat, 0);
    } else if (scenario === "lineage-filter") {
      f.install(); f.ready();
      assert.throws(() => f.host.composition.acquireLease(f.child, f.parent, f.evidence, new AbortController().signal), { code: "evidence-unavailable" });
      for (const toolFilter of [{ allow: [] }, { allow: ["read"], deny: ["read"] }]) {
        const evidence = parseLegacyChildEvidence({ ...f.evidence, toolFilter });
        assert.throws(() => f.host.composition.acquireLease(f.parent, f.child, evidence, new AbortController().signal), { code: "evidence-unavailable" });
      }
      assert.equal(f.bodies.read, 0);
    } else if (scenario === "alias") {
      f.install(); f.ready(); const result = await f.execute({ file_path: "alias.txt", offset: 2, limit: 1 });
      assert.equal(result.value.lines[0].text, "useful once"); assert.equal(result.value.path, join(f.root, "child", "useful.txt")); assert.equal(f.bodies.read, 1);
    } else if (scenario === "unknown") {
      f.install(); assert.throws(() => f.ready(), { code: "composition-unavailable" }); assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
    } else if (scenario.startsWith("incompatible")) {
      const semantics = scenario === "incompatible-retry" ? "detached-retry" : scenario === "incompatible-transform" ? "ambiguous-transform"
        : scenario === "incompatible-unknown" ? "unknown" : scenario === "incompatible-double" ? "multiple-next"
          : scenario === "incompatible-failure-content" ? "failure-content-dependent" : scenario === "incompatible-context" ? "context-dependent" : "metadata-dependent";
      const consumer = async (_exec, next) => {
        if (semantics === "detached-retry") { void next(); return next(); }
        const result = await next();
        if (semantics === "multiple-next") return next();
        if (semantics === "metadata-dependent" && result.isError && result.error.info?.reason === undefined
          || semantics === "failure-content-dependent" && result.isError && result.content[0]?.text !== "expected full custom failure"
          || semantics === "context-dependent" && !result.additionalContexts?.length) return { isError: true,
            error: { message: "intermediate consumer blocked" }, content: [{ type: "text", text: "intermediate consumer blocked" }] };
        return semantics === "ambiguous-transform" ? structuredClone(result) : result;
      };
      f.listen("child", "tools/execute", consumer, semantics);
      f.install(); assert.throws(() => f.ready(), { code: "composition-unavailable" }); assert.equal(f.bodies.read, 0);
    } else if (scenario === "transport-fidelity") {
      let intermediate, beforeChildPost;
      f.listen("parent", "tools/pre-execute", async () => ({ kind: "deny", reason: "native policy", info: { name: "NativePolicy", code: "POLICY", reason: "raw reason" } }));
      f.listen("child", "tools/execute", async (_exec, next) => { intermediate = await next(); return intermediate; });
      f.listen("child", "tools/post-execute", async (_exec, result, next) => { beforeChildPost = result; return next(); });
      f.install(); f.ready(); const result = await f.execute();
      assert.equal(intermediate.error.info.reason, undefined); assert.equal(result.error.info.reason, "raw reason");
      assert.equal(beforeChildPost.error.info.reason, "raw reason"); assert.equal(f.bodies.read, 0);
    } else if (scenario === "content-contexts") {
      const first = createUserMessage({ content: [{ type: "text", text: "native parent policy context" }] });
      const second = createUserMessage({ content: [{ type: "text", text: "native child policy context" }] });
      let beforeChildPost;
      f.listen("parent", "tools/post-execute", async () => ({ kind: "accept", content: [{ type: "text", text: "actual parent post content" }], additionalContexts: [first] }));
      f.listen("child", "tools/post-execute", async (_exec, result) => { beforeChildPost = result; return { kind: "accept", additionalContexts: [second] }; });
      f.install(); f.ready(); const result = await f.execute(); assert.equal(f.bodies.read, 1);
      assert.equal(beforeChildPost.content[0].text, "actual parent post content"); assert.equal(result.content[0].text, "actual parent post content");
      assert.deepEqual(result.additionalContexts, [first, second]);
    } else if (scenario === "approval-allow" || scenario === "approval-reject" || scenario === "approval-cutoff") {
      const requestStarted = gate(), releaseAnswer = gate();
      f.listen("parent", "tools/pre-execute", async () => ({ kind: "ask", reason: "real native read approval" }));
      f.ctx.on("approval/request", async request => {
        assert.equal(request.agent, f.parent); requestStarted.release();
        if (scenario === "approval-cutoff") await releaseAnswer.promise;
        return scenario === "approval-reject" ? "rejected" : "allowed-once";
      }, { global: true });
      f.install(); const endTurn = await f.beginParentTurn(); f.ready();
      const pending = f.execute(); await requestStarted.promise;
      let ended;
      if (scenario === "approval-cutoff") ended = endTurn();
      const result = await pending; releaseAnswer.release();
      const audit = await f.settle(); assert.equal(audit.length, 1);
      if (ended) await ended; else await endTurn();
      assert.equal(result.isError, scenario !== "approval-allow"); assert.equal(f.bodies.read, scenario === "approval-allow" ? 1 : 0);
      const events = f.parent.session.snapshotEvents();
      const asked = events.find(event => event.type === "approval/asked"), decided = events.find(event => event.type === "approval/decided");
      assert.ok(asked); assert.ok(decided); assert.equal(asked.data.id, decided.data.id);
      assert.equal(asked.data.callId, audit[0].parentCallId);
      assert.equal(decided.data.outcome, scenario === "approval-allow" ? "allowed-once" : scenario === "approval-reject" ? "rejected" : "cancelled");
      const start = events.findLast(event => event.type === "turn/start" && event.seq < asked.seq);
      const end = events.find(event => event.type === "turn/end" && event.seq > decided.seq);
      assert.ok(start); assert.ok(end); assert.equal(start.data.turn, end.data.turn);
      assert.equal(events.some(event => event.type === "turn/end" && event.seq > start.seq && event.seq < decided.seq), false);
    } else if (scenario === "finalize-child") {
      let finished;
      f.install(); f.finalizeChildContent(() => [{ type: "text", text: "actual child finalization" }]);
      f.setBeforeFinish(async outcomes => { finished = outcomes; });
      f.ready(); const result = await f.execute(); await f.settle();
      assert.equal(result.content[0].text, "actual child finalization"); assert.equal(finished.childResult.content[0].text, "actual child finalization");
      assert.equal(finished.parentResult.isError, false); assert.equal(f.bodies.read, 1);
    } else if (scenario === "epoch" || scenario === "child-lifetime" || scenario === "caller" || scenario === "dispose-cutoff") {
      const entered = gate(), resume = gate(), caller = new AbortController();
      f.setBeforeResolve(async () => { entered.release(); await resume.promise; });
      f.install(); f.ready(); const pending = f.execute(undefined, caller.signal); await entered.promise;
      let drain;
      if (scenario === "epoch") f.epoch.abort("Apply");
      if (scenario === "child-lifetime") f.childLifetime.abort("child-dispose");
      if (scenario === "caller") caller.abort("caller-cancel");
      if (scenario === "dispose-cutoff") drain = f.host.composition.closeForDispose("public-dispose-start");
      resume.release(); assert.equal((await pending).isError, true); if (drain) await drain; assert.equal(f.bodies.read, 0);
    } else if (scenario === "two-children") {
      assert.equal(f.children.length, 2); assert.notEqual(f.children[0], f.children[1]);
      f.install(); f.ready();
      const results = await Promise.all(f.children.map(child => f.executeChild(child)));
      assert.ok(results.every(result => !result.isError && result.value.lines[0].text === "useful once"));
      const audit = await f.settle(); assert.equal(f.bodies.read, 2); assert.equal(audit.length, 2);
      assert.deepEqual(new Set(audit.map(row => row.child)), new Set(f.children.map(child => child.id)));
      assert.equal(new Set(audit.map(row => row.parentCallId)).size, 2);
      for (const child of f.children) {
        const outer = f.observations.find(row => row.exec.agent === child);
        const nested = f.observations.find(row => row.exec.agent === f.parent && row.exec.parent === outer.exec.token);
        assert.ok(nested); assert.equal(nested.exec.rootCallId, outer.exec.rootCallId);
      }
    } else if (scenario === "child-pre-denial-audit" || scenario === "child-around-denial-audit") {
      if (scenario === "child-pre-denial-audit") f.listen("child", "tools/pre-execute", async () => ({ kind: "deny", reason: "child native denial", info: { name: "ChildPolicy", code: "CHILD_POLICY" } }));
      else f.listen("child", "tools/execute", async () => ({ isError: true, error: { message: "child native denial", info: { name: "ChildPolicy", code: "CHILD_POLICY" } }, content: [{ type: "text", text: "child native denial" }] }));
      f.install(); f.ready(); const result = await f.execute(); const audit = await f.settle();
      assert.equal(result.error.info.code, "CHILD_POLICY"); assert.equal(f.bodies.read, 0);
      assert.equal(audit.length, 1); assert.equal(audit[0].parentCallId, undefined); assert.equal(audit[0].childError, true);
      assert.equal(f.auditOutcomes.length, 1); assert.deepEqual(f.auditOutcomes[0].childResult, result);
      assert.equal(f.contextCalls[0].context.signal.aborted, true);
    } else if (scenario === "child-pre-late-deny" || scenario === "child-pre-late-cancel" || scenario === "child-pre-throw") {
      const entered = gate(), resume = gate(); let postCalls = 0;
      f.listen("child", "tools/pre-execute", async () => {
        entered.release(); await resume.promise;
        if (scenario === "child-pre-throw") throw new HarnessError("actual child pre failure", "CHILD_PRE_FAILURE");
        return scenario === "child-pre-late-cancel" ? { kind: "cancel" } : { kind: "deny", reason: "authoritative child denial", info: { name: "ChildPolicy", code: "CHILD_POLICY", reason: "native raw reason" } };
      });
      f.listen("child", "tools/post-execute", async (_exec, _result, next) => { postCalls++; return next(); });
      f.install(); f.ready(); const pending = f.execute(); await entered.promise; f.epoch.abort("parent epoch revoked during child pre"); resume.release();
      const result = await pending; const audit = await f.settle(); assert.equal(f.bodies.read, 0);
      assert.equal(result.error.info.code, scenario === "child-pre-throw" ? "CHILD_PRE_FAILURE" : scenario === "child-pre-late-cancel" ? "ABORTED_BEFORE_DISPATCH" : "CHILD_POLICY");
      if (scenario === "child-pre-late-deny") assert.equal(result.error.info.reason, "native raw reason");
      assert.equal(postCalls, scenario === "child-pre-throw" ? 0 : 1); assert.equal(audit.length, 1);
      assert.equal(f.auditOutcomes[0].parentResult, undefined); assert.deepEqual(f.auditOutcomes[0].childResult, result);
    } else if (scenario === "child-ask-never") {
      let requests = 0;
      f.listen("child", "tools/pre-execute", async () => ({ kind: "ask", reason: "child native approval" }));
      f.ctx.on("approval/request", async () => { requests++; return "rejected"; }, { global: true });
      f.install(); const endChildTurn = await f.beginChildTurn();
      try {
        f.ready(); const result = await f.execute(); const audit = await f.settle();
        assert.equal(result.error.info?.code, "approval-unavailable"); assert.equal(requests, 0); assert.equal(f.bodies.read, 0);
        assert.equal(f.child.session.snapshotEvents().filter(event => event.type === "approval/asked").length, 0);
        assert.equal(audit.length, 1); assert.equal(f.contextCalls[0].context.signal.aborted, true);
      } finally { await endChildTurn(); }
    } else if (scenario === "approval-child-uncontrolled") {
      let requests = 0;
      f.listen("child", "tools/pre-execute", async () => ({ kind: "ask", reason: "child native approval" }));
      f.ctx.on("approval/request", async () => { requests++; return "allowed-once"; }, { global: true });
      f.install(); const endParentTurn = await f.beginParentTurn(); const endChildTurn = await f.beginChildTurn(); f.ready();
      try {
        const result = await f.execute(); const audit = await f.settle();
        assert.equal(result.error?.info?.code, "approval-unavailable"); assert.equal(requests, 0); assert.equal(f.bodies.read, 0);
        assert.equal(f.child.session.snapshotEvents().filter(event => event.type === "approval/asked").length, 0);
        assert.equal(audit.length, 1); assert.equal(audit[0].parentCallId, undefined);
        assert.equal(f.host.composition.view().activeCalls, 0); assert.equal(f.contextCalls[0].context.signal.aborted, true);
        assert.deepEqual(f.auditOutcomes[0].childResult, result);
      } finally { await endChildTurn(); await endParentTurn(); }
    } else if (scenario === "pre-signal-readonly") {
      const caller = new AbortController(); let descriptor, acquisitionSignal, downstreamSignal;
      f.setBeforeContext(async exec => {
        acquisitionSignal = exec.signal; descriptor = Object.getOwnPropertyDescriptor(exec, "signal");
        // Keep the actual native pre view read-only; restore its descriptor before mutable dispatch.
        Object.defineProperty(exec, "signal", { ...descriptor, writable: false });
      });
      f.listen("child", "tools/pre-execute", async (exec, next) => {
        downstreamSignal = exec.signal;
        assert.equal(Object.getOwnPropertyDescriptor(exec, "signal").writable, false);
        assert.equal(exec.signal, caller.signal);
        Object.defineProperty(exec, "signal", descriptor);
        return next();
      });
      f.install(); f.ready(); const result = await f.execute(undefined, caller.signal); const audit = await f.settle();
      assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, "useful once"); assert.equal(f.bodies.read, 1);
      assert.equal(acquisitionSignal, caller.signal); assert.equal(downstreamSignal, caller.signal);
      assert.equal(audit.length, 1); assert.equal(f.auditOutcomes[0].childExecution.signal, caller.signal);
    } else if (scenario === "acquisition-lease-revoke" || scenario === "acquisition-caller-revoke" || scenario === "child-pre-await-revoke") {
      const entered = gate(), resume = gate(), caller = new AbortController(); let preSignal;
      if (scenario === "child-pre-await-revoke") f.listen("child", "tools/pre-execute", async (exec, next) => {
        preSignal = exec.signal; entered.release(); await resume.promise; return next();
      });
      else f.setBeforeContext(async (exec, lease) => {
        preSignal = exec.signal; entered.release();
        await new Promise(resolve => lease.signal.addEventListener("abort", resolve, { once: true }));
      });
      f.install(); const endChildTurn = await f.beginChildTurn(); f.ready();
      try {
        const pending = f.execute(undefined, caller.signal); await entered.promise;
        if (scenario === "acquisition-caller-revoke") caller.abort("caller acquisition cutoff"); else f.epoch.abort("parent pre-await cutoff");
        resume.release(); const result = await pending; const audit = await f.settle();
        assert.equal(preSignal, caller.signal); assert.equal(result.error.info.code, "ABORTED_BEFORE_DISPATCH");
        assert.equal(f.bodies.read, 0); assert.equal(f.bodies.stat, 0); assert.equal(audit.length, 1);
        assert.equal(f.auditOutcomes[0].parentExecution, undefined); assert.deepEqual(f.auditOutcomes[0].childResult, result);
        assert.equal(f.adapter.streams.findLast(stream => stream.model === "old-reviewer").signal.aborted, false);
        assert.equal(caller.signal.aborted, scenario === "acquisition-caller-revoke");
        assert.equal(f.host.composition.view().activeCalls, 0);
      } finally { resume.release(); await endChildTurn(); }
    } else if (scenario === "after-next-caller-abort") {
      const caller = new AbortController(); let seen;
      f.listen("parent", "tools/post-execute", async () => ({ kind: "accept", content: [{ type: "text", text: "actual parent success content" }] }));
      f.listen("child", "tools/execute", async (_exec, next) => { const result = await next(); caller.abort("caller cancelled after body"); return result; });
      f.listen("child", "tools/post-execute", async (_exec, result, next) => { seen = result; return next(); });
      f.install(); f.ready(); const result = await f.execute(undefined, caller.signal); await f.settle();
      const parentResult = f.observations.find(row => row.exec.agent === f.parent).result;
      assert.equal(parentResult.isError, false); assert.equal(result.error.info.code, "ABORTED"); assert.equal(seen.error.info.code, "ABORTED");
      assert.notDeepEqual(seen.content, parentResult.content); assert.deepEqual(result.content, seen.content); assert.equal(f.bodies.read, 1);
      assert.deepEqual(f.auditOutcomes[0].childResult, result);
    } else if (scenario === "owner-generation") {
      assert.throws(() => createLegacyReadComposition({ captureClosedComposition: () => true }), { code: "composition-unavailable" });
      f.install(); const composition = f.host.composition;
      const snapshot = composition.captureClosedComposition();
      assert.throws(() => composition.publishGeneration(snapshot, 1), { code: "composition-unavailable" });
      composition.publishGeneration(snapshot, 0);
      const lease = composition.acquireLease(f.parent, f.child, f.evidence, new AbortController().signal);
      let drained = false; const drain = composition.closeForChange("owner-generation").then(() => { drained = true; });
      lease.assertActive(); assert.equal(lease.signal.aborted, false); assert.equal(drained, false);
      lease.release(); lease.release(); await drain; assert.equal(composition.view().activeCalls, 0);
      assert.throws(() => lease.assertActive(), { code: "lifetime-unavailable" });
      assert.throws(() => composition.publishGeneration(snapshot, 1), { code: "composition-unavailable" });
      f.ready(); assert.equal(composition.view().generation, 2);
    } else if (scenario === "public-dispose") {
      const entered = gate(), resume = gate(); let nativeStarted = false;
      f.setBeforeResolve(async () => { entered.release(); await resume.promise; });
      f.install(); f.ready(); const pending = f.execute(); await entered.promise;
      const disposing = f.host.dispose(async () => {
        nativeStarted = true; assert.equal(f.epoch.signal.aborted, true); assert.equal(f.host.composition.view().activeCalls, 0);
        await f.childHandle.dispose(); await f.parentHandle.dispose();
      });
      assert.equal(f.host.composition.view().state, "disposed"); assert.equal(nativeStarted, false);
      assert.equal((await f.execute()).isError, true); resume.release(); assert.equal((await pending).isError, true);
      await disposing; assert.equal(nativeStarted, true); assert.equal(f.bodies.read, 0);
    } else if (scenario === "success-wins") {
      const entered = gate(), resume = gate();
      f.listen("child", "tools/post-execute", async (_exec, result, next) => { if (!result.isError) { entered.release(); await resume.promise; } return next(); });
      f.install(); f.ready(); const pending = f.execute(); await entered.promise;
      f.epoch.abort("Apply-after-real-success"); resume.release();
      const result = await pending; assert.equal(result.isError, false); assert.equal(result.value.lines[0].text, "useful once"); assert.equal(f.bodies.read, 1);
    } else if (scenario === "parent-await-cutoff") {
      const entered = gate(), resume = gate();
      f.listen("parent", "tools/execute", async (_exec, next) => { entered.release(); await resume.promise; return next(); });
      f.install(); f.ready(); const pending = f.execute(); await entered.promise; f.epoch.abort("Apply-before-native-body"); resume.release();
      const result = await pending; assert.equal(result.isError, true); assert.equal(result.error.info.code, "ABORTED_BEFORE_DISPATCH"); assert.equal(f.bodies.read, 0);
    } else if (scenario === "generation") {
      const entered = gate(), resume = gate(), finished = gate();
      f.listen("child", "tools/post-execute", async (_exec, result, next) => { if (!result.isError) { entered.release(); await resume.promise; } return next(); });
      f.setBeforeFinish(async () => { await finished.promise; });
      f.install(); f.ready(); const pending = f.execute(); await entered.promise;
      const old = f.host.composition.view().generation; let drained = false;
      const drain = f.host.composition.closeForChange("controlled-policy-change").then(() => { drained = true; });
      assert.equal(f.host.composition.view().state, "closed"); assert.equal((await f.execute()).isError, true); assert.equal(drained, false);
      assert.throws(() => f.ready(), { code: "composition-unavailable" });
      resume.release(); assert.equal((await pending).isError, false); assert.equal(drained, false);
      finished.release(); await drain; f.ready(); assert.equal(f.host.composition.view().generation, old + 1); assert.equal(f.bodies.read, 1);
    } else if (scenario === "standing") {
      const proxy = f.install(); f.ready(); await f.host.composition.closeForChange("remove"); await proxy.removeProxy();
      assert.equal(f.child.ctx.tools.get("read", f.child), f.definition); assert.equal((await f.execute()).isError, true); assert.equal(f.bodies.read, 0);
      await assert.rejects(proxy.releaseAfterChildDispose(), { code: "lifetime-unavailable" });
      f.childLifetime.abort(); await f.childHandle.dispose(); await f.host.releaseAfterChildDispose(f.child);
    } else if (scenario === "concurrency") {
      f.install(); f.ready(); const results = await Promise.all(Array.from({ length: 4 }, () => f.execute()));
      assert.ok(results.every(result => !result.isError)); assert.equal(f.bodies.read, 4); const audit = await f.settle(); assert.equal(audit.length, 4);
      assert.equal(new Set(audit.map(row => row.parentCallId)).size, 4);
    } else if (scenario === "audit-fault" || scenario === "audit-unavailable" || scenario === "approval-idle") {
      f.install(); f.ready();
      if (scenario === "audit-fault") f.setAuditFault(true);
      if (scenario === "audit-unavailable") f.setAuditAvailable(false);
      const result = await f.execute(); await f.settle();
      if (scenario === "audit-fault") {
        assert.equal(result.isError, false); assert.equal(f.bodies.read, 1); assert.equal(f.auditFaults.length, 1); assert.equal((await f.execute()).isError, true);
      } else {
        assert.equal(result.isError, true); assert.equal(f.bodies.read, 0);
        assert.equal(result.error.info.code, scenario === "approval-idle" ? "approval-unavailable" : "audit-unavailable");
      }
    } else throw new Error(`Unknown business scenario: ${scenario}`);
    console.log(JSON.stringify({ scenario, bodies: f.bodies, finalState: f.host.composition.view().state, observations: f.observations.length }));
  } finally { await f.dispose(); }
}
