import assert from "node:assert/strict";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { createScope, scopeChainOf, scopeOf } from "@deepseek-ai/dsh-scope";
import { createLegacyReadCallLease, LegacyReadUnavailable } from "../src/legacy-read-contracts.ts";

const stages = new Map([["tools/pre-execute", "pre"], ["tools/guard", "guard"], ["tools/execute", "around"],
  ["tools/post-execute", "post"], ["tools/project-result", "project"], ["tools/result", "finalization"], ["tools/filter", "filter"]]);
const registries = new WeakMap();

/** The fixture owns every registration at creation, not a scan of SDK consumers. */
export class ClosedHostContext extends Context {
  constructor(...args) {
    super(...args);
    if (!registries.has(this.root)) registries.set(this.root, []);
    const nativeOn = this.on;
    this.on = function(event, callback, options) {
      const dispose = nativeOn.call(this, event, callback, options);
      const rows = registries.get(this.root);
      const stage = stages.get(event);
      if (rows === undefined || stage === undefined) return dispose;
      const row = { scope: this, reference: callback, stage, active: true };
      rows.push(row);
      return () => { row.active = false; dispose(); };
    };
  }
}

export async function ownedLegacyStartup(ctx, root, fsMount, config, fs, options = {}) {
  const registrations = registries.get(ctx.root);
  const bindings = new Map(), policies = [], policyScopes = [], audits = [], faults = [], retirements = [];
  const lifetime = new AbortController();
  const auditPath = join(root, "host-owned-read-audit.jsonl");
  await writeFile(auditPath, "", { flag: "wx" });
  let beforeFinish, beforeReadBindings, beforeProxyLookup, beforeSnapshot, auditFault = false, childLaterDeny = false, parentDeny = false;
  const checkOwner = () => {
    lifetime.signal.throwIfAborted();
    if (ctx.get("fs") === undefined || ctx.get("tools") === undefined) throw new LegacyReadUnavailable("provenance-unavailable");
  };
  fsMount.ctx.effect(() => () => lifetime.abort("actual-native-fs-mount-disposed"));
  ctx.effect(() => () => lifetime.abort("actual-host-owner-disposed"));
  const addPolicy = (agent, side, event, callback) => {
    const scope = createScope(agent.ctx, agent); policyScopes.push(scope);
    scope.ctx.on(event, callback);
    policies.push({ side, stage: stages.get(event), scope: scope.ctx, reference: callback, order: 2, semantics: "audited-zero-or-once" });
  };
  const installPolicies = (parent, child) => {
    if (bindings.has(child)) return;
    addPolicy(parent, "parent", "tools/pre-execute", async (exec, next) => {
      if (exec.agent === parent && exec.name === "read" && (parentDeny || exec.arguments.file_path.endsWith("denied.txt"))) {
        return { kind: "deny", reason: "The actual parent path policy refused this target" };
      }
      if (exec.agent === parent && exec.name === "read" && options.ask) return { kind: "ask", reason: "The actual parent requests one operation approval" };
      return next();
    });
    if (options.childAsk) addPolicy(child, "child", "tools/pre-execute", async (exec, next) =>
      exec.agent === child && exec.name === "read" ? { kind: "ask", reason: "Actual child approval is unsupported" } : next());
    addPolicy(child, "child", "tools/post-execute", async (exec, _result, next) => {
      const downstream = await next();
      return exec.agent === child && exec.name === "read" && childLaterDeny
        ? { kind: "block", feedback: [{ type: "text", text: "Actual downstream child policy refused" }] }
        : downstream;
    });
  };
  const startup = {
    captureClosedComposition(children) {
      checkOwner();
      beforeSnapshot?.(children);
      if (options.unknown) return undefined;
      const scopes = [], contributions = [];
      const addScope = (context, key) => {
        if (!scopes.some(row => row.ctx === context)) scopes.push({ ctx: context, key, ancestors: scopeChainOf(key).slice(1) });
      };
      addScope(ctx, ctx);
      for (const child of children) {
        assert.equal(bindings.get(child.child), child.bindings);
        addScope(child.parent.ctx, child.parent); addScope(child.child.ctx, child.child);
        for (const scope of [child.policyScope, child.proxy.proxyScope, child.proxy.standingScope]) addScope(scope.ctx, child.child);
        contributions.push(...child.contributions);
      }
      for (const policy of policies) { addScope(policy.scope, scopeOf(policy.scope) ?? policy.scope); contributions.push(policy); }
      // All additional registrations are references captured by the owning Context at registration time.
      for (const row of registrations.filter(row => row.active)) {
        if (contributions.some(item => item.reference === row.reference && item.scope === row.scope)) continue;
        addScope(row.scope, scopeOf(row.scope) ?? row.scope);
        contributions.push({ ...row, side: "both", order: 2, semantics: "audited-zero-or-once" });
      }
      return { scopes, policies: contributions, coverage: "host-owned-complete", mutation: "owner-coordinated",
        fidelity: "canonical-value-content-contexts", approval: options.ask ? "coordinated-turn" : "never-ask" };
    },
    resolveReadBindings(parent, child) {
      checkOwner();
      beforeReadBindings?.(parent, child);
      installPolicies(parent, child);
      let binding = bindings.get(child);
      if (binding === undefined) {
        binding = Object.freeze({ parent, child, definition: parent.ctx.tools.get("read", parent), mount: fsMount, config,
          caps: Object.freeze({ limit: config.readLimit, maxBytes: config.readMaxBytes, maxLineLength: config.readMaxLineLength, streamMinSize: config.readStreamMinSize }),
          parentFs: parent.ctx.get("fs"), childFs: child.ctx.get("fs"), parentProvider: fs, childProvider: fs, parentWorld: fs, childWorld: fs });
        bindings.set(child, binding);
      }
      return binding;
    },
    async acquireCallContext(parent, child, exec, lease) {
      checkOwner(); lease.signal.throwIfAborted();
      const boundary = ctx.sessionProjections.stateOf(parent.session, "turnBoundary");
      if (options.ask && boundary?.openTurnStartSeq == null) throw new LegacyReadUnavailable("approval-unavailable");
      const call = new AbortController();
      return createLegacyReadCallLease({ signal: AbortSignal.any([lease.signal, lifetime.signal, call.signal]),
        approval: options.ask ? { kind: "coordinated-turn", turn: { parent, openTurnStartSeq: boundary.openTurnStartSeq }, signal: lifetime.signal } : { kind: "never-ask" },
        assertAvailable() {
          checkOwner(); lease.signal.throwIfAborted(); call.signal.throwIfAborted();
          if (options.ask && ctx.sessionProjections.stateOf(parent.session, "turnBoundary")?.openTurnStartSeq !== boundary.openTurnStartSeq) throw new LegacyReadUnavailable("approval-unavailable");
        },
        async finish(outcomes) {
          await beforeFinish?.(outcomes);
          const row = { parent: parent.id, child: child.id, childCallId: outcomes.childExecution.callId,
            parentCallId: outcomes.parentExecution?.callId, parentError: outcomes.parentResult?.isError, childError: outcomes.childResult.isError };
          await appendFile(auditFault ? join(root, "missing-owner-audit-directory", "audit.jsonl") : auditPath, JSON.stringify(row) + "\n");
          audits.push({ outcomes, row });
        }, release() { call.abort("actual-audit-completed"); },
      });
    },
    reportAuditFault(error, outcomes) { faults.push({ error, outcomes }); },
    reportRetirementFault(error, child) { retirements.push({ error, child }); },
    revoke(reason) { lifetime.abort(reason); },
  };
  return { startup, audits, faults, retirements, registrations, bindings,
    setParentDeny(value) { parentDeny = value; }, setChildLaterDeny(value) { childLaterDeny = value; }, setAuditFault(value) { auditFault = value; },
    setBeforeFinish(value) { beforeFinish = value; },
    setBeforeReadBindings(value) { beforeReadBindings = value; },
    setBeforeProxyLookup(value) { beforeProxyLookup = value; }, setBeforeSnapshot(value) { beforeSnapshot = value; },
    observeDefinition(agent, definition) {
      const binding = bindings.get(agent);
      if (binding !== undefined && definition !== undefined && definition.name === "read" && definition !== binding.definition) beforeProxyLookup?.(agent, definition);
    },
    async auditRows() { return (await readFile(auditPath, "utf8")).trim().split("\n").filter(Boolean).map(row => JSON.parse(row)); },
    async dispose() { for (const scope of policyScopes.reverse()) await scope.dispose(); registries.delete(ctx.root); },
  };
}
