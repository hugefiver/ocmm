import { Context, symbols } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { foldSubagentDescriptor, SubagentError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SubagentRun } from "@deepseek-ai/dsh-subagent";
import type { ToolRuntime } from "@deepseek-ai/dsh-tools";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { createChildAdmissionBinding, projectChildAdmissionEvidence } from "./child-admission.js";
import type { ChildAdmissionCompletion } from "./child-admission-contract.js";
import type { ChildAdmissionEvidence } from "./child-capture.js";
import { scopeLifetime } from "./delivery-authority.js";
import type { ParentAdmissionTicket } from "./delivery-authority.js";
import type { DshAgent, DshContext } from "./dsh-types.js";
import type { LegacyCapabilityCollaborators } from "./legacy-child-policy.js";
import { createLegacyReadIntegration } from "./legacy-read-integration.js";
import type { LegacyReadIntegrationChild, LegacyReadTrustedStartup } from "./legacy-read-integration.js";
import { NativeChildEvidenceReader } from "./native-child-evidence.js";
import type { NativeChildHistory } from "./native-child-evidence.js";
import { DsmmProfileError } from "./profiles.js";
import type { DsmmProfileRuntime } from "./profile-runtime.js";
import type { DsmmInvocationView, SubagentRuntimeAdmissionView } from "./profile-types.js";
import { capturedOriginalRoleInvocation } from "./role-invocation.js";
import { ROLE_CONTROL_HOST } from "./role-control-remote.js";
import { registerRoleControlRpc } from "./role-control-rpc.js";
import type { RoleControlAvailability, RoleControlCapabilities } from "./role-control-types.js";
import type { DsmmRolePolicy } from "./role-policy.js";
import { RoleRunRegistry } from "./role-runs.js";
import type { RoleRunInvocation } from "./role-runs.js";
import { admittedCallableRoleInventory, roleInvocationObservation, roleRouteComparison } from "./role-subagents.js";
import type { DsmmRoleRunCapture } from "./role-subagents.js";
import { childOwnedSessionEvents, resolveSelectedAgentPreset } from "./session-scope.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { buildDsmmAgentGuidance } from "./prompts.js";
import { DsmmSubagentRuntime } from "./subagent-runtime.js";

function original<T extends object>(value: T): T { return (Reflect.get(value, symbols.original) ?? value) as T; }
const runtimeScopes = new WeakMap<DsmmSubagentRuntime, Context>();

/** Native headers and own descriptors establish origin; absence from a DSMM registry never does. */
export function classifyDsmmAgent(agent: Agent): "dsmm" | "native" {
  const structural = agent as unknown as DshAgent;
  const own = childOwnedSessionEvents(structural.session);
  const selected = agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) ?? resolveSelectedAgentPreset(structural.session);
  if (selected?.startsWith("dsmm-") || own.some(event => event.type === "dsmm/role-policy")) return "dsmm";
  if (agent.session.header.origin === "subagent") {
    const descriptor = foldSubagentDescriptor(own as Parameters<typeof foldSubagentDescriptor>[0]);
    // A creation without an establishing descriptor is unknown, not native.
    return descriptor === undefined || descriptor.provider.startsWith("dsmm-role-") ? "dsmm" : "native";
  }
  return own.some(event => event.type === "deepwork/mode" && (event.data as { active?: unknown } | undefined)?.active === true) ? "dsmm" : "native";
}

function nativeChild(ctx: Context, agent: DshAgent, controlledParent: (agent: DshAgent) => boolean): boolean {
  if (agent.session.header?.origin !== "subagent" || classifyDsmmAgent(agent as Agent) !== "native") return false;
  const parent = agent.session.header.parentSession === undefined ? undefined : ctx.agents.get(SessionId(agent.session.header.parentSession));
  return parent !== undefined && !controlledParent(parent as unknown as DshAgent);
}

/** Limit DSMM's observers/guards to its own children without altering the native service or factories. */
export function managedAgentContext(ctx: Context, controlledParent: (agent: DshAgent) => boolean): DshContext {
  const agents = ctx.agents;
  const tools = ctx.get("tools");
  const filteredAgents = new Proxy(agents, { get(target, key) {
    if (key === "list") return () => target.list().filter(agent => !nativeChild(ctx, agent as unknown as DshAgent, controlledParent));
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const filteredTools = tools === undefined ? undefined : new Proxy(tools, { get(target, key) {
    if (key === "guard") return (guard: Parameters<ToolRuntime["guard"]>[0]) => target.guard(exec => exec.agent !== undefined && nativeChild(ctx, exec.agent as unknown as DshAgent, controlledParent) ? undefined : guard(exec));
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return new Proxy(ctx, { get(target, key) {
    if (key === "get") return (name: string) => name === "agents" ? filteredAgents : name === "tools" ? filteredTools : target.get(name);
    if (key === "on") return (event: string, listener: (...args: any[]) => unknown, options?: unknown) => target.on(event as never, ((...args: any[]) => {
      const agent = args[0]?.agent ?? (event === "system-prompt/assemble" ? args[1]?.scope : undefined);
      if (agent !== undefined && agents.list().includes(agent) && nativeChild(ctx, agent, controlledParent)) {
        const next = args.at(-1);
        return typeof next === "function" ? next() : undefined;
      }
      return listener(...args);
    }) as never, options as never);
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as unknown as DshContext;
}

export function runtimeAdmissionView(ctx: Context): SubagentRuntimeAdmissionView {
  const bound = ctx.get("subagents");
  if (bound === undefined) return { binding: "unavailable", deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" };
  const runtime = original(bound);
  return runtime instanceof DsmmSubagentRuntime ? runtime.authority.view()
    : { binding: "stock", deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" };
}

/** Capability projection only. Admission objects and A's CAS/maintenance methods remain untouched. */
export function publicProfileRuntime(runtime: DsmmProfileRuntime, ctx: Context, integration?: { changeConfiguration(reason: string, mutate: () => Promise<void>): Promise<void> }): DsmmProfileRuntime {
  const getter = Object.assign(((agent?: DshAgent) => runtime.getSettings(agent)) as DsmmSettingsGetter, runtime.getSettings,
    { subagentRuntime: () => runtimeAdmissionView(ctx) });
  return new Proxy(runtime, { get(target, key) {
    if (key === "getSettings") return getter;
    if (key === "getSession" || key === "selectSession") return async (...args: unknown[]) => {
      let result: Awaited<ReturnType<DsmmProfileRuntime["getSession"]>>;
      const call = async () => { result = await Reflect.apply(Reflect.get(target, key), target, args); };
      if (key === "selectSession" && integration !== undefined) await integration.changeConfiguration("parent-profile-apply", call);
      else await call();
      return { ...result!, subagentRuntime: runtimeAdmissionView(ctx) };
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

/** Actual programmatic Host collaborators; never profile, YAML or RPC input. */
export interface DsmmHostStartupOptions {
  /** Experimental, cold-only read composition. Disabled in the default MAIN. */
  readonly experimentalLegacyRead?: {
    readonly startup: LegacyReadTrustedStartup;
    readonly classifyChildReport?: LegacyCapabilityCollaborators["classifyTool"];
  };
}

interface HostRuns {
  readonly owner: object;
  readonly registry: RoleRunRegistry<DsmmRoleRunCapture, DsmmInvocationView>;
  current?: { bridge: ReturnType<typeof createChildAdmissionBinding>; policy: DsmmRolePolicy; getSettings: DsmmSettingsGetter };
}
interface NativeDeliveryEvidence {
  readonly parent: Agent;
  readonly childId: SessionId;
}
const hosts = new WeakMap<DsmmSubagentRuntime, HostRuns>();

function unavailableLegacy(): never {
  throw new DsmmProfileError("unavailable", "Legacy execution requires the separately installed real Host operation/approval/audit adapter.");
}

/** Exact live descendants are revoked synchronously before any native holder starts draining. */
function revokeTree(ctx: Context, revoke: (agent: DshAgent, reason: string) => void, parent: Agent, reason: string): void {
  const registry = ctx.agents;
  const pending = [parent], seen = new Set<Agent>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    revoke(current as unknown as DshAgent, reason);
    for (const child of registry.list()) if (child !== current && registry.isOwnedBy(child.id, current)) pending.push(child);
  }
}

const disabled = (reason: Extract<RoleControlAvailability, { enabled: false }>["reason"]): RoleControlAvailability => ({ enabled: false, reason });

export async function integrateSubagentRuntime(ctx: Context, settings: DsmmSettings, policy: DsmmRolePolicy, getRuntime: () => DsmmProfileRuntime | undefined, startup: DsmmHostStartupOptions = {}) {
  const bound = ctx.get("subagents");
  const native = bound === undefined ? undefined : original(bound);
  if (!(native instanceof DsmmSubagentRuntime) || !settings.modules.deepwork.enabled) return undefined;
  const hostScope = runtimeScopes.get(native);
  if (hostScope === undefined) throw new DsmmProfileError("unavailable", "Managed admission requires the explicit Host-owned startup entry, not a separately constructed runtime.");
  native.requireProviders(["spawn"]);
  const lifetime = new AbortController();
  scopeLifetime(ctx, "dsmm.integration: close startup preparation", () => lifetime.abort());
  await native.waitForProvider("spawn", lifetime.signal);
  const history = ctx.get("sessionQuery") as NativeChildHistory | undefined;
  if (history === undefined || typeof history.observeSession !== "function") throw new DsmmProfileError("unavailable", "Managed child admission requires the actual public native session history service.");
  let host = hosts.get(native);
  if (host === undefined) {
    const owner = {};
    const current = (): NonNullable<HostRuns["current"]> => { const value = host!.current; if (value === undefined) throw new SubagentError("Host role-run authority is not ready", "UNAUTHORIZED"); return value; };
    const registry = new RoleRunRegistry<DsmmRoleRunCapture, DsmmInvocationView>(hostScope, {
      currentEpoch(parent, requestedOwner) {
        const ticket = current().bridge.authority.acquireParentTicket(parent as unknown as DshAgent);
        if (requestedOwner !== owner || ticket.owner !== owner) throw new SubagentError("Role-run owner is not the exact Host admission owner", "UNAUTHORIZED");
        return ticket.parentEpoch;
      },
      canBackground(parent, invocation, epoch) {
        const state = current(), admission = state.getSettings.admission!(parent as unknown as DshAgent);
        return admission.epoch === epoch && invocation.owner === owner && admission.settings.subagents.enableRunInBackground
          && invocation.capture.admission.settings.subagents.enableRunInBackground && parent.ctx.get("jobs") !== undefined
          && state.policy.targets(parent as unknown as DshAgent).includes(invocation.capture.invocation.target);
      },
      teardown: {
        revokeParent: (agent, reason) => revokeTree(hostScope, (agent, why) => native.authority.revokeParent(agent as Agent, why), agent, reason),
        async disposeRun(run: SubagentRun) {
          if (run.localAgent !== undefined) revokeTree(hostScope, (agent, why) => native.authority.revokeParent(agent as Agent, why), run.localAgent, "run-disposed");
          await run.dispose();
        },
      },
    });
    host = { owner, registry }; hosts.set(native, host);
  }
  const stable = host;
  let completion!: ChildAdmissionCompletion;
  let bridge!: ReturnType<typeof createChildAdmissionBinding>;
  const originalAdmissions = {
    resolveOriginalChildEvidence: (...args: Parameters<import("./child-admission.js").ChildAdmissionCollaborators["resolveOriginalChildEvidence"]>) => {
      const runtime = getRuntime();
      if (runtime === undefined) throw new DsmmProfileError("unavailable", "Original child admission is not initialized.");
      return runtime.resolveOriginalChildEvidence(...args);
    },
    assertDelivery: policy.assertChildDelivery.bind(policy),
  };
  const legacyRead = startup.experimentalLegacyRead === undefined ? undefined : createLegacyReadIntegration({ ctx,
    authority: native.authority as DsmmSubagentRuntime<DsmmProfileAdmission, ChildAdmissionEvidence>["authority"], authorityOwner: stable.owner, nativeHistory: history,
    trustedHostStartup: startup.experimentalLegacyRead.startup, classifyChildReport: startup.experimentalLegacyRead.classifyChildReport, coreAdmissions: originalAdmissions,
    admissions: {
      resolveOriginalChildEvidence: (ticket, id, signal) => bridge.policy.resolveChildEvidence(ticket, SessionId(id), signal),
      childAdmission: child => getRuntime()!.admission(child as unknown as DshAgent),
      assertCurrentParent(ticket, child, evidence) {
        native.authority.assertTicket(ticket);
        const borrowed = bridge.authority.acquireParentTicket(ticket.parent as unknown as DshAgent);
        if (borrowed.owner !== ticket.owner || borrowed.admission !== ticket.admission || borrowed.parentEpoch !== ticket.parentEpoch) throw new SubagentError("Legacy parent is not the exact current Host admission", "UNAUTHORIZED");
        policy.assertChildDelivery(borrowed, child.id, evidence);
        native.authority.assertTicket(ticket);
      },
    },
    proxyDefinitions: {
      admit(parent, child, definition) {
        const identity = policy.identity(child as unknown as DshAgent), tools = child.ctx.tools;
        if (identity.parent !== parent || !ctx.agents.isOwnedBy(child.id, parent) || tools.get(definition.name, child) !== definition) throw new SubagentError("Legacy proxy requires its exact registered child realm", "UNAUTHORIZED");
        policy.captureTools(child as unknown as DshAgent, tools, [definition.name]);
      },
      assertAdmitted(child, definition) {
        const tools = child.ctx.tools;
        if (tools.get(definition.name, child) !== definition || policy.toolDenial(child as unknown as DshAgent, definition.name, tools) !== undefined) throw new SubagentError("Legacy proxy definition is not admitted by the actual role guard", "UNAUTHORIZED");
      },
    },
  });
  const legacyCore = legacyRead?.core;
  if (legacyRead !== undefined && legacyCore === undefined) throw new DsmmProfileError("unavailable", "Legacy read requires an explicit trusted cold Host composition.");
  bridge = createChildAdmissionBinding({ ctx, owner: stable.owner, deliveryAuthority: native.authority as DsmmSubagentRuntime<DsmmProfileAdmission, ChildAdmissionEvidence>["authority"],
    nativeSubstrate: settings, nativeHistory: history,
    get legacyCapabilities(): LegacyCapabilityCollaborators { return legacyCore?.legacyCapabilities ?? unavailableLegacy(); },
    collaborators: {
      classifyParent: classifyDsmmAgent,
      resolveOriginalChildEvidence: (...args) => (legacyCore ?? originalAdmissions).resolveOriginalChildEvidence(...args),
      childAdmission: { prepare: (...args) => completion.prepare(...args), validateRole: (...args) => completion.validateRole(...args) },
      assertDelivery: (ticket, id, evidence) => {
        if ("mode" in evidence) { if (legacyCore === undefined) unavailableLegacy(); legacyCore.assertLegacyDelivery(ticket, id, evidence); }
        else policy.assertChildDelivery(ticket, id, evidence);
      },
    },
  });
  completion = policy.configureAdmission({ nativeSubstrate: settings, resolveOriginalEvidence: bridge.resolveOriginalEvidence,
    ...(legacyCore === undefined ? {} : { classifyLegacyTool: legacyCore.classifyLegacyTool }),
    revokeParent: (agent, reason) => revokeTree(ctx, bridge.authority.revokeParent, agent as Agent, reason) });
  // Native non-DSMM direct children remain native. This branch is established
  // from an actual public physical cut, never from a missing DSMM registration.
  const nativeEvidence = new WeakSet<object>();
  const isNativeEvidence = (evidence: unknown): evidence is NativeDeliveryEvidence => typeof evidence === "object" && evidence !== null && nativeEvidence.has(evidence);
  const proveNativeChild = async (ticket: ParentAdmissionTicket<DsmmProfileAdmission>, childId: SessionId, mode: "continuable" | "one-shot", signal: AbortSignal): Promise<NativeDeliveryEvidence | undefined> => {
    signal.throwIfAborted(); native.authority.assertTicket(ticket);
    if (policy.identity(ticket.parent as unknown as DshAgent).role !== undefined) return undefined;
    const currentHistory = ctx.get("sessionQuery");
    if (currentHistory === undefined || original(currentHistory) !== original(history)) throw new SubagentError("Native child observation requires the exact public history service", "UNAUTHORIZED");
    const observation = await history.observeSession(childId, { signal, projectionMode: "none" });
    try {
      signal.throwIfAborted(); native.authority.assertTicket(ticket);
      const inherited = observation.inheritedEventCount, header = observation.header;
      if (!Number.isSafeInteger(inherited) || inherited < 0 || inherited > observation.events.length) throw new SubagentError("Native child observation has no valid own-event boundary", "UNAUTHORIZED");
      const own = observation.events.slice(inherited), descriptor = foldSubagentDescriptor(own);
      const marked = own.some(event => {
        if (event.type === "dsmm/role-policy") return true;
        if (event.type === "deepwork/mode") return (event.data as { active?: unknown } | undefined)?.active === true;
        if (event.type !== "agent-preset/selected") return false;
        const preset = (event.data as { agentPreset?: unknown } | undefined)?.agentPreset;
        return typeof preset === "string" && preset.startsWith("dsmm-");
      });
      const resident = ctx.agents.get(childId);
      if (header.version !== 4 || header.id !== childId || header.parentSession !== ticket.parent.id || header.origin !== "subagent"
        || own.filter(event => event.type === "subagent/descriptor").length !== 1 || descriptor?.mode !== mode || descriptor.provider.startsWith("dsmm-role-")
        || marked
        || resident !== undefined && classifyDsmmAgent(resident) !== "native") return undefined;
      const evidence = Object.freeze({ parent: ticket.parent, childId }); nativeEvidence.add(evidence); return evidence;
    } finally { observation[Symbol.dispose](); }
  };
  native.authority.bindPolicy(ctx, stable.owner, {
    classifyParent: classifyDsmmAgent,
    async resolveChildEvidence(ticket, childId, signal) {
      const evidence = await proveNativeChild(ticket as ParentAdmissionTicket<DsmmProfileAdmission>, childId, "continuable", signal);
      if (evidence !== undefined) return evidence;
      return bridge.policy.resolveChildEvidence(ticket as ParentAdmissionTicket<DsmmProfileAdmission>, childId, signal);
    },
    assertDelivery(ticket, childId, evidence) {
      if (isNativeEvidence(evidence)) {
        if (evidence.parent !== ticket.parent || evidence.childId !== childId || policy.identity(ticket.parent as unknown as DshAgent).role !== undefined) throw new SubagentError("Native child delivery does not match this ordinary direct parent", "UNAUTHORIZED");
      } else bridge.policy.assertDelivery(ticket as ParentAdmissionTicket<DsmmProfileAdmission>, childId, evidence as ChildAdmissionEvidence);
    },
  });
  const getSettings: DsmmSettingsGetter = agent => {
    const runtime = getRuntime();
    if (runtime === undefined) throw new DsmmProfileError("unavailable", "The actual Host admission is not initialized.");
    return runtime.getSettings(agent);
  };
  getSettings.admission = agent => getRuntime()!.admission(agent);
  stable.current = { bridge, policy, getSettings };
  scopeLifetime(ctx, "dsmm.integration: release entry collaborators", () => { if (stable.current?.bridge === bridge) stable.current = undefined; });
  const managed = native as DsmmSubagentRuntime<DsmmProfileAdmission, ChildAdmissionEvidence | NativeDeliveryEvidence>;
  const enrolledLegacy = new Map<Agent, LegacyReadIntegrationChild>();
  if (legacyCore !== undefined) {
    ctx.on("agent/disposed", ({ agent }) => { enrolledLegacy.delete(agent); }, { global: true });
    ctx.effect(() => async () => {
      native.authority.revokeOwner(stable.owner, "core-owner-ended");
      await legacyCore.dispose(async () => {
        for (const attachment of enrolledLegacy.values()) await managed.drainContinuableChildren(attachment.parent, [attachment.child.id]);
      });
    });
  }
  const reader = new NativeChildEvidenceReader(ctx, ticket => managed.authority.assertTicket(ticket), history);
  const background = (ticket: ParentAdmissionTicket<DsmmProfileAdmission>): RoleControlAvailability => !ticket.admission.settings.modules.deepwork.enabled ? disabled("module-off")
    : !ticket.admission.settings.subagents.enableRunInBackground ? disabled("background-disabled")
    : ticket.parent.ctx.get("jobs") === undefined ? disabled("jobs-unavailable") : { enabled: true };
  const capabilities = (ticket: ParentAdmissionTicket<DsmmProfileAdmission>): RoleControlCapabilities => ({
    background: background(ticket),
    prompt: !ticket.admission.settings.modules.deepwork.enabled ? disabled("module-off") : ctx.get("sessionQuery") !== undefined && ctx.get("sessionPersistence") !== undefined ? { enabled: true } : disabled("unavailable"),
    interrupt: ticket.admission.settings.modules.deepwork.enabled ? { enabled: true } : disabled("module-off"),
    images: ctx.get("attachments") !== undefined ? { enabled: true } : disabled("unavailable"), runtime: managed.authority.view(),
  });
  return { bridge, owner: stable.owner, registry: stable.registry, runtime: managed, legacyRead,
    async afterChildAdmission(agent: Agent, signal: AbortSignal = lifetime.signal): Promise<void> {
      if (legacyCore === undefined || agent.session.header.origin !== "subagent") return;
      signal = AbortSignal.any([signal, lifetime.signal]);
      const runtime = getRuntime();
      if (runtime === undefined) throw new DsmmProfileError("unavailable", "Child profile admission is not initialized.");
      const admission = await runtime.completeAdmission(agent as unknown as DshAgent, signal);
      if (admission.childEvidence?.mode !== "legacy-conservative") return;
      const parent = agent.session.header.parentSession === undefined ? undefined : ctx.agents.get(agent.session.header.parentSession);
      if (parent === undefined || !ctx.agents.isOwnedBy(agent.id, parent)) throw new SubagentError("Legacy enrollment requires its exact live direct parent", "UNAUTHORIZED");
      const previous = enrolledLegacy.get(agent);
      if (previous !== undefined) {
        if (previous.parent !== parent || previous.admission !== admission) throw new SubagentError("Legacy enrollment cannot replace its original exact residency", "UNAUTHORIZED");
        return;
      }
      try {
        const attachment = await legacyCore.afterChildAdmission(parent, agent, signal);
        if (attachment !== undefined) enrolledLegacy.set(agent, attachment);
      } catch (error) {
        // Reject back to the actual native admission owner only after revoking
        // this exact residency. That owner retains its original rollback handle.
        revokeTree(ctx, bridge.authority.revokeParent, agent, "child-admission-failed");
        throw error;
      }
    },
    changeConfiguration(reason: string, mutate: () => void | Promise<void>): Promise<void> {
      return legacyCore === undefined || enrolledLegacy.size === 0 ? Promise.resolve().then(mutate) : legacyCore.changeConfiguration(reason, mutate);
    },
    dispose(nativeDrain: () => Promise<void>): Promise<void> {
      for (const parent of ctx.agents.roots()) revokeTree(ctx, bridge.authority.revokeParent, parent, "host-dispose");
      return legacyCore === undefined ? nativeDrain() : legacyCore.dispose(nativeDrain);
    },
    async ready(): Promise<void> { bridge.onAdmissionGuardsInstalled(); await managed.waitUntilReady(lifetime.signal); },
    async revokeBeforeDispose(agent: Agent, dispose: () => void | Promise<void>): Promise<void> {
      revokeTree(ctx, bridge.authority.revokeParent, agent, "holder-disposed");
      const nativeDispose = async () => { await stable.registry.drainParent(agent, stable.owner, "holder-disposed"); await dispose(); };
      if (legacyCore === undefined) await nativeDispose();
      else await legacyCore.revokeBeforeDispose(agent, nativeDispose);
    },
    registerControls(scope: Context): void {
      registerRoleControlRpc(scope, { runtime: managed, runs: stable.registry, capabilities,
        projectRun(invocation: RoleRunInvocation<DsmmRoleRunCapture, DsmmInvocationView>) {
          const childId = invocation.childId ?? (invocation.projection.childId === undefined ? undefined : SessionId(invocation.projection.childId));
          const child = childId === undefined ? undefined : ctx.agents.get(childId);
          if (child !== undefined && !ctx.agents.isOwnedBy(child.id, invocation.parent)) throw new SubagentError("Run projection requires its exact native holder owner", "UNAUTHORIZED");
          return roleInvocationObservation(invocation.capture.invocation, invocation.projection.label, "one-shot", getSettings,
            child as unknown as DshAgent | undefined, { runId: invocation.runId, ...(invocation.childId === undefined ? {} : { childId: invocation.childId }) }).view;
        },
        async backgroundAvailability(ticket, invocation, signal) {
          signal.throwIfAborted(); managed.authority.assertTicket(ticket);
          return invocation.owner !== ticket.owner || invocation.parent !== ticket.parent ? disabled("unavailable")
            : !invocation.capture.admission.settings.subagents.enableRunInBackground ? disabled("background-disabled")
            : !policy.targets(ticket.parent as unknown as DshAgent).includes(invocation.capture.invocation.target) ? disabled("role-disabled") : background(ticket);
        },
        async observeChild(ticket, entry, signal) {
          if (entry.mode !== "continuable") {
            const unavailable = disabled(entry.mode === "one-shot" ? "one-shot" : "unknown-mode");
            const child = ctx.agents.get(entry.id);
            if (child === undefined || entry.mode !== "one-shot") return { prompt: unavailable, interrupt: unavailable };
            managed.authority.assertTicket(ticket);
            if (!ctx.agents.isOwnedBy(entry.id, ticket.parent)) throw new SubagentError("Run observation requires its exact direct owner", "UNAUTHORIZED");
            if (await proveNativeChild(ticket, entry.id, "one-shot", signal) !== undefined) return { prompt: unavailable, interrupt: unavailable };
            const admission = getRuntime()!.admission(child as unknown as DshAgent);
            const invocation = observedOriginalInvocation(child, admission, entry.label, "one-shot");
            return { prompt: unavailable, interrupt: unavailable, routeComparison: roleRouteComparison(child),
              ...(invocation === undefined ? {} : { invocation: invocation.view }),
              ...(admission.childCapture === undefined ? {} : { evidence: projectChildAdmissionEvidence(admission.childCapture, ticket.parentEpoch) }) };
          }
          const evidence = await managed.authority.resolveChildEvidence(ticket, entry.id, signal);
          if (isNativeEvidence(evidence)) {
            managed.authority.assertDelivery(ticket, entry.id, evidence);
            return { prompt: { enabled: true }, interrupt: { enabled: true } };
          }
          let prompt: RoleControlAvailability = { enabled: true };
          try { managed.authority.assertDelivery(ticket, entry.id, evidence); }
          catch { signal.throwIfAborted(); prompt = disabled("mode" in evidence ? "legacy-capability-denied" : "role-disabled"); }
          if ("mode" in evidence) return { evidence: projectChildAdmissionEvidence(evidence, ticket.parentEpoch), prompt, interrupt: prompt };
          const facts = await reader.read(ticket, entry.id, signal);
          const observation = await history.observeSession(entry.id, { signal, projectionMode: "none" });
          try {
            signal.throwIfAborted(); managed.authority.assertTicket(ticket);
            const resident = ctx.agents.get(entry.id);
            const live = resident === undefined ? ownRoute(observation.events.slice(observation.inheritedEventCount)) : roleRouteComparison(resident).liveRoute;
            const route = evidence.invocation.initialRoute;
            return { evidence: projectChildAdmissionEvidence(evidence, ticket.parentEpoch), prompt, interrupt: prompt,
              invocation: { role: evidence.role, label: facts.descriptor.label ?? entry.label ?? evidence.role, level: evidence.invocation.level,
                routeSource: evidence.invocation.routeSource, route: live.status === "known" ? live.route : route, mode: "continuable" as const, childId: entry.id },
              routeComparison: { childId: entry.id, initialRoute: { status: "known" as const, source: "invocation-capture" as const, route }, liveRoute: live } };
          } finally { observation[Symbol.dispose](); }
        },
      });
    },
  };
}

function ownRoute(events: readonly { type: string; data?: unknown }[]): ReturnType<typeof roleRouteComparison>["liveRoute"] {
  let event: typeof events[number] | undefined;
  for (let index = events.length - 1; index >= 0; index--) if (events[index].type === "request/header") { event = events[index]; break; }
  if (event === undefined) return { status: "unknown", reason: "no-own-request-header" };
  const route = (event.data as { header?: { config?: { provider?: unknown; model?: unknown; reasoningEffort?: unknown } } } | undefined)?.header?.config;
  if (typeof route?.provider !== "string" || typeof route.model !== "string" || route.reasoningEffort !== undefined && typeof route.reasoningEffort !== "string") return { status: "unknown", reason: "invalid-own-request-header" };
  return { status: "known", source: "own-native-request-header", route: { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) } };
}

function observedOriginalInvocation(agent: Agent, admission: DsmmProfileAdmission, label: string | undefined, mode: DsmmInvocationView["mode"]) {
  const original = capturedOriginalRoleInvocation(agent as unknown as DshAgent), capture = admission.childCapture;
  if (original === undefined || capture === undefined) return undefined;
  const live = roleRouteComparison(agent).liveRoute;
  return { view: { role: capture.role, label: label ?? capture.role, level: original.level, routeSource: original.routeSource,
    route: live.status === "known" ? live.route : original.initialRoute, mode, childId: agent.id },
    routeKind: live.status === "known" ? "actual" as const : "initial" as const };
}

export function registerRuntimeGuidance(ctx: DshContext, getSettings: DsmmSettingsGetter, policy: DsmmRolePolicy): void {
  const installed = new WeakSet<DshAgent>();
  const install = ({ agent }: { agent: DshAgent }): void => {
    if (installed.has(agent) || !(agent.ctx instanceof Context)) return;
    const scope: Context = agent.ctx;
    scope.get("systemPrompt")?.section({ name: "dsmm:admitted-guidance", order: 50, text() {
      const settings = getSettings(agent), admission = getSettings.admission!(agent), tools = scope.get("tools");
      const schemas = tools?.schemas(agent as Agent).filter(schema => policy.toolDenial(agent, schema.name, tools) === undefined) ?? [];
      const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session) as Parameters<typeof foldSubagentDescriptor>[0]);
      const invocation = descriptor === undefined ? undefined : observedOriginalInvocation(agent as Agent, admission, descriptor.label, descriptor.mode);
      const runtime = getSettings.subagentRuntime?.();
      let childEvidence = admission.childCapture === undefined ? admission.childEvidence : undefined;
      if (admission.childCapture !== undefined && agent.session.header?.parentSession !== undefined) {
        const parent = scope.get("agents")?.get(SessionId(agent.session.header.parentSession));
        const bound = scope.get("subagents");
        if (parent !== undefined && bound !== undefined && original(bound) instanceof DsmmSubagentRuntime) {
          try {
            const ticket = (original(bound) as DsmmSubagentRuntime).authority.acquireParentTicket(parent);
            childEvidence = projectChildAdmissionEvidence(admission.childCapture, ticket.parentEpoch);
          } catch { /* A closing direct parent supplies no current display ticket. */ }
        }
      }
      return buildDsmmAgentGuidance(settings, { scope: agent.session.header?.origin === "subagent" ? "child" : "root",
        delegation: tools === undefined ? [] : admittedCallableRoleInventory(agent, settings, policy, tools), tools: schemas,
        roleAvailability: admission.roleAvailability, runtimeAdmission: runtime,
        ...(invocation === undefined ? {} : { invocation }),
        childEvidence,
        capabilities: { nativeJobs: scope.get("jobs") !== undefined,
          continuable: scope.get("subagents")?.getProvider("spawn")?.prepareContinuable !== undefined && scope.get("sessionPersistence") !== undefined,
          managedChildDelivery: runtime?.binding === "dsmm" && runtime.deliveryFenceReady && scope.get("sessionQuery") !== undefined && scope.get("sessionPersistence") !== undefined },
      });
    } });
    installed.add(agent);
  };
  ctx.on?.("agent/created", install, { global: true });
  for (const agent of ctx.get?.<{ list(): DshAgent[] }>("agents")?.list() ?? []) install({ agent });
}

export function registerRoleControlContribution(ctx: Context): void {
  ctx.inject(["typert"], scope => {
    if (scope.typert.getPackage(ROLE_CONTROL_HOST.package, "host") === undefined) scope.typert.register(ROLE_CONTROL_HOST);
    new UnavailableRoleControls(scope);
  });
}

/** Core exposes a truthful refusal without requiring or impersonating a managed runtime. */
class UnavailableRoleControls extends TypertRemoteService {
  constructor(ctx: Context) { super(ctx, "dsmmChildren"); }
  private refuse(): never {
    const connection = this.ctx.get("connection"), invocation = this.ctx.invocation;
    const code = connection === undefined || invocation?.peer !== connection.operator ? "not-owned" : "unavailable";
    throw new RemoteError("dsmm-children/refused", "The Host refused the child control operation.",
      { code, ...(code === "unavailable" ? { reason: "delivery-fence-unavailable" as const } : {}) });
  }
  @Remote describe(_sessionId: string): never { return this.refuse(); }
  @Remote descendants(_sessionId: string): never { return this.refuse(); }
  @Remote background(_sessionId: string, _request: unknown): never { return this.refuse(); }
  @Remote prompt(_sessionId: string, _request: unknown): never { return this.refuse(); }
  @Remote interrupt(_sessionId: string, _request: unknown): never { return this.refuse(); }
}

export type DsmmHostRuntimeIntegration = NonNullable<Awaited<ReturnType<typeof integrateSubagentRuntime>>>;
declare module "@deepseek-ai/cordis" { interface Context { dsmmRuntimeIntegration: DsmmHostRuntimeIntegration } }

/** Explicit startup entry; it owns one PUBLIC subclass, never a live replacement. */
export const subagentRuntimePlugin = { name: "dsmm-subagent-runtime", inject: ["agents"], Config: SubagentRuntime.Config,
  apply(ctx: Context, config: ConstructorParameters<typeof SubagentRuntime>[1]): void {
    const runtime = new DsmmSubagentRuntime(ctx, config, classifyDsmmAgent);
    runtimeScopes.set(runtime, ctx);
  } };
export * from "./subagent-runtime.js";
export default subagentRuntimePlugin;
