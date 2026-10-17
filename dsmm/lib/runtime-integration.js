var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Context, symbols } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session";
import { foldSubagentDescriptor, SubagentError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { createChildAdmissionBinding, projectChildAdmissionEvidence } from "./child-admission.js";
import { scopeLifetime } from "./delivery-authority.js";
import { NativeChildEvidenceReader } from "./native-child-evidence.js";
import { DsmmProfileError } from "./profiles.js";
import { capturedOriginalRoleInvocation, capturedRoleInvocation, currentRoleInvocation, duringRoleInvocation, invocationAgentOptions, resolveRoleInvocation } from "./role-invocation.js";
import { roleFromProviderName } from "./role-providers.js";
import { modelRouteFromCall } from "./role-llm.js";
import { ROLE_CONTROL_HOST } from "./role-control-remote.js";
import { registerRoleControlRpc } from "./role-control-rpc.js";
import { RoleRunRegistry } from "./role-runs.js";
import { admittedCallableRoleInventory, roleInvocationObservation, roleRouteComparison } from "./role-subagents.js";
import { childOwnedSessionEvents, resolveSelectedAgentPreset } from "./session-scope.js";
import { buildDsmmAgentGuidance } from "./prompts.js";
import { DsmmSubagentRuntime } from "./subagent-runtime.js";
function original(value) { return (Reflect.get(value, symbols.original) ?? value); }
const runtimeScopes = new WeakMap();
// Exact native creation provenance survives bundle replacement with its resident Agent.
const nativeCreations = new WeakSet();
const nativeCreationRegistries = new WeakMap();
/** Captures retain DSMM identity; a live foreign registration cannot establish it by name. */
function agentOrigin(agent, source) {
    const structural = agent;
    const own = childOwnedSessionEvents(structural.session);
    const selected = agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) ?? resolveSelectedAgentPreset(structural.session);
    if (selected?.startsWith("dsmm-") || own.some(event => event.type === "dsmm/role-policy") || capturedRoleInvocation(structural) !== undefined)
        return "dsmm";
    if (agent.session.header.origin === "subagent") {
        if (nativeCreations.has(agent))
            return "native";
        const descriptor = foldSubagentDescriptor(own);
        if (descriptor === undefined)
            return undefined;
        if (!descriptor.provider.startsWith("dsmm-role-"))
            return "native";
        if (source !== "startup" || agent.session.header.isSeeded !== false)
            return "dsmm";
        const registry = agent.ctx.get("subagents"), provider = registry?.getProvider(descriptor.provider);
        if (provider === undefined)
            return "dsmm";
        const captured = registry !== undefined && hosts.get(original(registry))?.current?.policy.ownsProvider(provider) === true;
        return captured ? "dsmm" : "native";
    }
    return own.some(event => event.type === "deepwork/mode" && event.data?.active === true) ? "dsmm" : "native";
}
/** An unestablished child is never a native-identity proof for delivery or resumed work. */
export function classifyDsmmAgent(agent) { return agentOrigin(agent) ?? "dsmm"; }
function nativeChild(ctx, agent, controlledParent, source) {
    if (agent.session.header?.origin !== "subagent")
        return false;
    const fresh = source === "startup" && agent.session.header.isSeeded === false;
    const origin = agentOrigin(agent, source);
    // Native one-shot creation appends its descriptor after agent/created. Only
    // fresh setup under an admitted ordinary parent can precede that evidence.
    if (origin === "dsmm" || origin === undefined && !fresh)
        return false;
    const parent = agent.session.header.parentSession === undefined ? undefined : ctx.agents.get(SessionId(agent.session.header.parentSession));
    if (parent === undefined || !ctx.agents.isOwnedBy(agent.id, parent) || controlledParent(parent))
        return false;
    if (fresh) {
        nativeCreations.add(agent);
        nativeCreationRegistries.set(agent, original(ctx.agents));
    }
    return true;
}
/** Limit DSMM's observers/guards to its own children without altering the native service or factories. */
export function managedAgentContext(ctx, controlledParent) {
    const agents = ctx.agents;
    const filteredAgents = new Proxy(agents, { get(target, key) {
            if (key === "list")
                return () => target.list().filter(agent => !nativeChild(ctx, agent, controlledParent));
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
    return new Proxy(ctx, { get(target, key) {
            if (key === "get")
                return (name) => name === "agents" ? filteredAgents : target.get(name);
            if (key === "on")
                return (event, listener, options) => target.on(event, ((...args) => {
                    const agent = args[0]?.agent ?? (event === "system-prompt/assemble" ? args[1]?.scope : undefined);
                    if (event !== "tools/execute" && event !== "tools/post-execute" && agent !== undefined && agents.list().includes(agent) && nativeChild(ctx, agent, controlledParent, event === "agent/created" ? args[0]?.source : undefined)) {
                        const next = args.at(-1);
                        return typeof next === "function" ? next() : undefined;
                    }
                    return listener(...args);
                }), options);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
}
/** Enrollment consumes A's completed admissions while native creation retains its original serial owner. */
export function admittedAgentContext(ctx, runtime) {
    const agents = ctx.get("agents");
    const admitted = new Proxy(agents, { get(target, key) {
            if (key === "list")
                return () => target.list().filter(agent => runtime.hasAdmission(agent));
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
    return new Proxy(ctx, { get(target, key) {
            if (key === "get")
                return (name) => name === "agents" ? admitted : target.get(name);
            if (key === "on")
                return (event, listener, options) => event === "agent/created"
                    ? target.effect(() => runtime.observeAdmissions(async (agent) => { await listener({ agent }); }))
                    : target.on(event, listener, options);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
}
export function runtimeAdmissionView(ctx) {
    const bound = ctx.get("subagents");
    if (bound === undefined)
        return { binding: "unavailable", deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" };
    const runtime = original(bound);
    return runtime instanceof DsmmSubagentRuntime ? runtime.authority.view()
        : { binding: "stock", deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" };
}
/** Capability projection only. Admission objects and A's CAS/maintenance methods remain untouched. */
export function publicProfileRuntime(runtime, ctx) {
    const getter = Object.assign(((agent) => runtime.getSettings(agent)), runtime.getSettings, { subagentRuntime: () => runtimeAdmissionView(ctx) });
    return new Proxy(runtime, { get(target, key) {
            if (key === "getSettings")
                return getter;
            if (key === "getSession" || key === "selectSession")
                return async (...args) => {
                    let result;
                    const call = async () => { result = await Reflect.apply(Reflect.get(target, key), target, args); };
                    await call();
                    return { ...result, subagentRuntime: runtimeAdmissionView(ctx) };
                };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
}
export function assertSupportedHostStartup(startup) {
    if (startup === null || typeof startup !== "object" || Array.isArray(startup) || Reflect.ownKeys(startup).length !== 0) {
        throw new DsmmProfileError("unavailable", "Host compatibility startup options are unsupported; existing data is not migrated.");
    }
}
const hosts = new WeakMap();
/** Exact live descendants are revoked synchronously before any native holder starts draining. */
function revokeTree(registry, revoke, parent, reason) {
    const pending = [parent], seen = new Set();
    while (pending.length > 0) {
        const current = pending.pop();
        if (seen.has(current))
            continue;
        seen.add(current);
        revoke(current, reason);
        for (const child of registry.list())
            if (child !== current && registry.isOwnedBy(child.id, current))
                pending.push(child);
    }
}
const disabled = (reason) => ({ enabled: false, reason });
export async function integrateSubagentRuntime(ctx, settings, policy, getRuntime, startup = {}) {
    assertSupportedHostStartup(startup);
    const bound = ctx.get("subagents");
    if (bound === undefined || !(original(bound) instanceof DsmmSubagentRuntime) || !settings.modules.deepwork.enabled)
        return undefined;
    return new Promise((resolve, reject) => {
        const unavailable = () => new DsmmProfileError("unavailable", "Native integration startup lost its injection lifetime.");
        let entered = false, retired = false;
        const retire = () => { retired = true; reject(unavailable()); };
        const fiber = ctx.inject(["subagents"], async (scope) => {
            entered = true;
            try {
                if (retired)
                    throw unavailable();
                const integration = await integrateManagedSubagentRuntime(scope, settings, policy, getRuntime);
                if (retired)
                    throw unavailable();
                resolve(integration);
            }
            catch (error) {
                reject(error);
                throw error;
            }
        });
        if (fiber.uid === null || fiber.state === 5) {
            retire();
            return;
        }
        scopeLifetime(fiber.ctx, "dsmm.integration: cancel injection startup", retire);
        // Cordis can skip the callback entirely when a required implementation is withdrawn.
        void fiber.await().then(() => { if (!entered)
            retire(); }, reject);
    });
}
async function integrateManagedSubagentRuntime(ctx, settings, policy, getRuntime) {
    const bound = ctx.get("subagents");
    const native = bound === undefined ? undefined : original(bound);
    if (!(native instanceof DsmmSubagentRuntime) || !settings.modules.deepwork.enabled)
        return undefined;
    const hostScope = runtimeScopes.get(native);
    if (hostScope === undefined)
        throw new DsmmProfileError("unavailable", "Managed admission requires the explicit Host-owned startup entry, not a separately constructed runtime.");
    // Revocation outlives the entry's injection scope; this reference only enumerates exact native owners during teardown.
    const teardownAgents = original(ctx.agents);
    const revokeResidency = native.authority.revokeParent.bind(native.authority);
    native.requireProviders(["spawn"]);
    const lifetime = new AbortController();
    scopeLifetime(ctx, "dsmm.integration: close startup preparation", () => lifetime.abort());
    const history = ctx.get("sessionQuery");
    if (history === undefined || typeof history.observeSession !== "function")
        throw new DsmmProfileError("unavailable", "Managed child admission requires the actual public native session history service.");
    let host = hosts.get(native);
    if (host === undefined) {
        const owner = {};
        const current = () => { const value = host.current; if (value === undefined)
            throw new SubagentError("Host role-run authority is not ready", "UNAUTHORIZED"); return value; };
        const registry = new RoleRunRegistry(hostScope, {
            currentEpoch(parent, requestedOwner) {
                const ticket = current().bridge.authority.acquireParentTicket(parent);
                if (requestedOwner !== owner || ticket.owner !== owner)
                    throw new SubagentError("Role-run owner is not the exact Host admission owner", "UNAUTHORIZED");
                return ticket.parentEpoch;
            },
            canBackground(parent, invocation, epoch) {
                const state = current(), admission = state.getSettings.admission(parent);
                return admission.epoch === epoch && invocation.owner === owner && admission.settings.subagents.enableRunInBackground
                    && invocation.capture.admission.settings.subagents.enableRunInBackground && parent.ctx.get("jobs") !== undefined
                    && state.policy.targets(parent).includes(invocation.capture.invocation.target);
            },
            teardown: {
                revokeParent: (agent, reason) => revokeTree(teardownAgents, revokeResidency, agent, reason),
                async disposeRun(run) {
                    await run.dispose();
                },
            },
        });
        host = { owner, registry };
        hosts.set(native, host);
    }
    const stable = host;
    let completion;
    let bridge;
    const originalAdmissions = {
        resolveOriginalChildEvidence: (...args) => {
            const runtime = getRuntime();
            if (runtime === undefined)
                throw new DsmmProfileError("unavailable", "Original child admission is not initialized.");
            return runtime.resolveOriginalChildEvidence(...args);
        },
        assertDelivery: policy.assertChildDelivery.bind(policy),
    };
    bridge = createChildAdmissionBinding({ ctx, owner: stable.owner, deliveryAuthority: native.authority,
        nativeSubstrate: settings, nativeHistory: history,
        collaborators: {
            classifyParent: classifyDsmmAgent,
            resolveOriginalChildEvidence: originalAdmissions.resolveOriginalChildEvidence,
            childAdmission: { prepare: (...args) => completion.prepare(...args), validateRole: (...args) => completion.validateRole(...args) },
            assertDelivery: originalAdmissions.assertDelivery,
        }, });
    completion = policy.configureAdmission({ nativeSubstrate: settings, resolveOriginalEvidence: bridge.resolveOriginalEvidence,
        revokeParent: (agent, reason) => revokeTree(teardownAgents, revokeResidency, agent, reason) });
    // Native non-DSMM direct children remain native. This branch is established
    // from an actual public physical cut, never from a missing DSMM registration.
    const nativeEvidence = new WeakSet();
    const nativeResidencies = new Map();
    ctx.on("agent/created", ({ agent }) => { nativeResidencies.delete(agent.id); }, { global: true });
    ctx.on("agent/disposed", ({ agent }) => {
        nativeResidencies.delete(agent.id);
        if (nativeCreationRegistries.get(agent) === original(ctx.agents)) {
            nativeCreations.delete(agent);
            nativeCreationRegistries.delete(agent);
        }
    }, { global: true });
    const isNativeEvidence = (evidence) => typeof evidence === "object" && evidence !== null && nativeEvidence.has(evidence);
    const dsmmMarked = (events) => events.some(event => {
        if (event.type === "dsmm/role-policy")
            return true;
        if (event.type === "deepwork/mode")
            return event.data?.active === true;
        if (event.type !== "agent-preset/selected")
            return false;
        const preset = event.data?.agentPreset;
        return typeof preset === "string" && preset.startsWith("dsmm-");
    });
    const matchesNativeResidency = (evidence) => {
        const registry = ctx.agents, resident = evidence.resident;
        if (original(registry) !== evidence.registry || original(evidence.parent.ctx.agents) !== evidence.registry
            || registry.get(evidence.childId) !== resident || nativeResidencies.get(evidence.childId) !== evidence.residency)
            return false;
        const prefixed = evidence.provider.startsWith("dsmm-role-");
        if (resident === undefined)
            return !prefixed;
        if (original(resident.ctx.agents) !== evidence.registry || resident.id !== evidence.childId || resident.session.id !== evidence.childId
            || !registry.isOwnedBy(evidence.childId, evidence.parent) || resident.session.header.parentSession !== evidence.parent.id
            || resident.session.header.origin !== "subagent" || prefixed && (!nativeCreations.has(resident) || nativeCreationRegistries.get(resident) !== evidence.registry)
            || classifyDsmmAgent(resident) !== "native")
            return false;
        const own = childOwnedSessionEvents(resident.session);
        const descriptor = foldSubagentDescriptor(own);
        return own.filter(event => event.type === "subagent/descriptor").length === 1 && descriptor?.mode === evidence.mode
            && descriptor.provider === evidence.provider && !dsmmMarked(own);
    };
    const proveNativeChild = async (ticket, childId, mode, signal) => {
        signal.throwIfAborted();
        native.authority.assertTicket(ticket);
        if (policy.identity(ticket.parent).role !== undefined)
            return undefined;
        const currentHistory = ctx.get("sessionQuery");
        if (currentHistory === undefined || original(currentHistory) !== original(history))
            throw new SubagentError("Native child observation requires the exact public history service", "UNAUTHORIZED");
        const observation = await history.observeSession(childId, { signal, projectionMode: "none" });
        try {
            signal.throwIfAborted();
            native.authority.assertTicket(ticket);
            const inherited = observation.inheritedEventCount, header = observation.header;
            if (!Number.isSafeInteger(inherited) || inherited < 0 || inherited > observation.events.length)
                throw new SubagentError("Native child observation has no valid own-event boundary", "UNAUTHORIZED");
            const own = observation.events.slice(inherited), descriptor = foldSubagentDescriptor(own);
            if (header.version !== 4 || header.id !== childId || header.parentSession !== ticket.parent.id || header.origin !== "subagent"
                || own.filter(event => event.type === "subagent/descriptor").length !== 1 || descriptor?.mode !== mode || dsmmMarked(own))
                return undefined;
            const registry = ctx.agents, resident = registry.get(childId), residency = nativeResidencies.get(childId) ?? {};
            nativeResidencies.set(childId, residency);
            const evidence = Object.freeze({ parent: ticket.parent, childId, registry: original(registry), resident, residency, provider: descriptor.provider, mode });
            if (!matchesNativeResidency(evidence))
                return undefined;
            nativeEvidence.add(evidence);
            return evidence;
        }
        finally {
            observation[Symbol.dispose]();
        }
    };
    const detachPolicy = native.authority.bindPolicy(ctx, stable.owner, {
        isNativeEvidence,
        classifyParent: parent => parent.session.header.origin === "subagent" ? classifyDsmmAgent(parent)
            : policy.identity(parent).role === undefined ? "native" : "dsmm",
        async resolveChildEvidence(ticket, childId, signal) {
            const evidence = await proveNativeChild(ticket, childId, "continuable", signal);
            if (evidence !== undefined)
                return evidence;
            return bridge.policy.resolveChildEvidence(ticket, childId, signal);
        },
        assertDelivery(ticket, childId, evidence) {
            if (isNativeEvidence(evidence)) {
                if (evidence.parent !== ticket.parent || evidence.childId !== childId || !matchesNativeResidency(evidence)
                    || policy.identity(ticket.parent).role !== undefined)
                    throw new SubagentError("Native child delivery does not match this ordinary direct parent", "UNAUTHORIZED");
            }
            else
                bridge.policy.assertDelivery(ticket, childId, evidence);
        },
    });
    const getSettings = agent => {
        const runtime = getRuntime();
        if (runtime === undefined)
            throw new DsmmProfileError("unavailable", "The actual Host admission is not initialized.");
        return runtime.getSettings(agent);
    };
    getSettings.admission = agent => getRuntime().admission(agent);
    stable.current = { bridge, policy, getSettings };
    scopeLifetime(ctx, "dsmm.integration: release entry collaborators", () => { if (stable.current?.bridge === bridge)
        stable.current = undefined; });
    const managed = native;
    let deliveryProvider = managed.getProvider("spawn"), providerEpoch = new AbortController();
    const providerChanged = () => {
        const current = managed.getProvider("spawn");
        if (current === deliveryProvider)
            return;
        providerEpoch.abort();
        providerEpoch = new AbortController();
        deliveryProvider = current;
    };
    ctx.on("subagent/provider-added", providerChanged, { global: true });
    ctx.on("subagent/provider-removed", providerChanged, { global: true });
    managed.configureActivationPreflight(async (spec, start) => {
        const provider = managed.getProvider(spec.provider);
        const role = provider !== undefined && policy.ownsProvider(provider) ? roleFromProviderName(spec.provider) : undefined;
        if (role === undefined)
            return start(spec);
        const parent = spec.request.parent, actor = parent;
        policy.assertDelegation(actor, role);
        const ticket = managed.authority.acquireParentTicket(parent);
        const signal = AbortSignal.any([spec.signal, ticket.signal, lifetime.signal]);
        const invocation = currentRoleInvocation(actor, role) ?? await resolveRoleInvocation(parent, role, ticket.admission.settings, signal, {}, spec.request.agentOptions);
        signal.throwIfAborted();
        managed.authority.assertTicket(ticket);
        policy.assertDelegation(actor, role);
        const ceiling = ticket.admission.settings.subagents.maxDepth;
        if (spec.request.maxDepth !== undefined && ceiling !== undefined && spec.request.maxDepth > ceiling)
            throw new SubagentError("Delegation exceeds parent depth ceiling", "UNAUTHORIZED");
        const maxDepth = spec.request.maxDepth ?? managed.resolveMaxDepth(ceiling);
        return duringRoleInvocation(actor, invocation, () => policy.duringDelegation(actor, role, () => start({ ...spec, signal,
            request: { ...spec.request, maxDepth, agentOptions: invocationAgentOptions(invocation, spec.request.agentOptions) } }), undefined, maxDepth));
    }, lifetime.signal);
    const reader = new NativeChildEvidenceReader(ctx, ticket => managed.authority.assertTicket(ticket), history);
    const background = (ticket) => !ticket.admission.settings.modules.deepwork.enabled ? disabled("module-off")
        : !ticket.admission.settings.subagents.enableRunInBackground ? disabled("background-disabled")
            : ticket.parent.ctx.get("jobs") === undefined ? disabled("jobs-unavailable") : { enabled: true };
    const capabilities = (ticket) => ({
        background: background(ticket),
        prompt: !ticket.admission.settings.modules.deepwork.enabled ? disabled("module-off") : ctx.get("sessionQuery") !== undefined && ctx.get("sessionPersistence") !== undefined ? { enabled: true } : disabled("unavailable"),
        interrupt: ticket.admission.settings.modules.deepwork.enabled ? { enabled: true } : disabled("module-off"),
        images: ctx.get("attachments") !== undefined ? { enabled: true } : disabled("unavailable"), runtime: managed.authority.view(),
    });
    let startupCompletion;
    return { bridge, owner: stable.owner, registry: stable.registry, runtime: managed,
        async admitLlmRequest(agent, signal) {
            signal.throwIfAborted();
            await managed.authority.waitForPromotion(agent, signal);
            const dsmmAgent = agent;
            policy.assertModuleAdmission(dsmmAgent);
            const identity = policy.identity(dsmmAgent);
            if (identity.role === undefined)
                return undefined;
            const admission = getRuntime().admission(dsmmAgent);
            const ticket = managed.authority.acquireParentTicket(agent);
            if (ticket.owner !== stable.owner || ticket.admission !== admission || ticket.parentEpoch !== admission.epoch)
                throw new SubagentError("LLM request does not own its exact Host admission", "UNAUTHORIZED");
            const parent = identity.parent;
            const parentTicket = parent === undefined ? undefined : managed.authority.acquireParentTicket(parent);
            if (identity.child && parentTicket === undefined)
                throw new SubagentError("LLM child has no admitted direct parent", "UNAUTHORIZED");
            const provider = deliveryProvider;
            const merged = AbortSignal.any([signal, lifetime.signal, providerEpoch.signal, ticket.signal, ...parentTicket === undefined ? [] : [parentTicket.signal]]);
            const evidence = parentTicket === undefined ? undefined : await getRuntime().resolveOriginalChildEvidence(bridge.authority.acquireParentTicket(parentTicket.parent), agent.id, merged);
            const assertCurrent = () => {
                merged.throwIfAborted();
                managed.authority.assertTicket(ticket);
                if (provider === undefined || managed.getProvider("spawn") !== provider)
                    throw new SubagentError("LLM delivery provider was replaced", "UNAUTHORIZED");
                if (stable.current?.bridge !== bridge || getRuntime().admission(dsmmAgent) !== admission)
                    throw new SubagentError("LLM admission was replaced", "UNAUTHORIZED");
                policy.assertModuleAdmission(dsmmAgent);
                const current = policy.identity(dsmmAgent);
                if (current.role !== identity.role || current.epoch !== identity.epoch || current.parent !== identity.parent || current.child !== identity.child)
                    throw new SubagentError("LLM role identity changed", "UNAUTHORIZED");
                if (parentTicket !== undefined && evidence !== undefined) {
                    managed.authority.assertTicket(parentTicket);
                    if (ctx.agents.get(parentTicket.parent.id) !== parentTicket.parent || !ctx.agents.isOwnedBy(agent.id, parentTicket.parent))
                        throw new SubagentError("LLM child ownership changed", "UNAUTHORIZED");
                    policy.assertChildExecution(bridge.authority.acquireParentTicket(parentTicket.parent), agent.id, evidence);
                }
            };
            assertCurrent();
            return Object.freeze({ agent, admission, capture: admission.childCapture ?? evidence ?? ticket, epoch: admission.epoch, signal: merged, assertCurrent });
        },
        dispose(nativeDrain) {
            for (const parent of teardownAgents.roots())
                revokeTree(teardownAgents, revokeResidency, parent, "host-dispose");
            return nativeDrain();
        },
        onAdmissionGuardsInstalled() { lifetime.signal.throwIfAborted(); bridge.onAdmissionGuardsInstalled(); },
        continueStartup(complete, callerSignal) {
            if (startupCompletion !== undefined)
                throw new DsmmProfileError("unavailable", "DW startup already has its Host continuation.");
            const signal = AbortSignal.any([lifetime.signal, ...callerSignal === undefined ? [] : [callerSignal]]);
            startupCompletion = (async () => {
                await managed.waitUntilReady(signal);
                signal.throwIfAborted();
                await complete(signal);
                signal.throwIfAborted();
            })().catch(error => { lifetime.abort(error); detachPolicy(); throw error; });
            return startupCompletion;
        },
        async ready() { await managed.waitUntilReady(lifetime.signal); await startupCompletion; lifetime.signal.throwIfAborted(); },
        async revokeBeforeDispose(agent, dispose) {
            revokeTree(teardownAgents, revokeResidency, agent, "holder-disposed");
            const nativeDispose = async () => { await stable.registry.drainParent(agent, stable.owner, "holder-disposed"); await dispose(); };
            await nativeDispose();
        },
        registerControls(scope) {
            registerRoleControlRpc(scope, { runtime: managed, runs: stable.registry, capabilities,
                projectRun(invocation) {
                    const childId = invocation.childId ?? (invocation.projection.childId === undefined ? undefined : SessionId(invocation.projection.childId));
                    const child = childId === undefined ? undefined : ctx.agents.get(childId);
                    if (child !== undefined && !ctx.agents.isOwnedBy(child.id, invocation.parent))
                        throw new SubagentError("Run projection requires its exact native holder owner", "UNAUTHORIZED");
                    return roleInvocationObservation(invocation.capture.invocation, invocation.projection.label, "one-shot", getSettings, child, { runId: invocation.runId, ...(invocation.childId === undefined ? {} : { childId: invocation.childId }) }).view;
                },
                async backgroundAvailability(ticket, invocation, signal) {
                    signal.throwIfAborted();
                    managed.authority.assertTicket(ticket);
                    return invocation.owner !== ticket.owner || invocation.parent !== ticket.parent ? disabled("unavailable")
                        : !invocation.capture.admission.settings.subagents.enableRunInBackground ? disabled("background-disabled")
                            : !policy.targets(ticket.parent).includes(invocation.capture.invocation.target) ? disabled("role-disabled") : background(ticket);
                },
                async observeChild(ticket, entry, signal) {
                    if (entry.mode !== "continuable") {
                        const unavailable = disabled(entry.mode === "one-shot" ? "one-shot" : "unknown-mode");
                        const child = ctx.agents.get(entry.id);
                        if (child === undefined || entry.mode !== "one-shot")
                            return { prompt: unavailable, interrupt: unavailable };
                        managed.authority.assertTicket(ticket);
                        if (!ctx.agents.isOwnedBy(entry.id, ticket.parent))
                            throw new SubagentError("Run observation requires its exact direct owner", "UNAUTHORIZED");
                        if (await proveNativeChild(ticket, entry.id, "one-shot", signal) !== undefined)
                            return { prompt: unavailable, interrupt: unavailable };
                        const admission = getRuntime().admission(child);
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
                    let prompt = { enabled: true };
                    try {
                        managed.authority.assertDelivery(ticket, entry.id, evidence);
                    }
                    catch {
                        signal.throwIfAborted();
                        prompt = disabled("mode" in evidence ? "legacy-capability-denied" : "role-disabled");
                    }
                    if ("mode" in evidence)
                        return { evidence: projectChildAdmissionEvidence(evidence, ticket.parentEpoch), prompt, interrupt: prompt };
                    const mode = evidence.version === 3 ? evidence.delegationMode : "continuable";
                    if (mode === "one-shot")
                        prompt = disabled("one-shot");
                    const facts = await reader.read(ticket, entry.id, signal);
                    const observation = await history.observeSession(entry.id, { signal, projectionMode: "none" });
                    try {
                        signal.throwIfAborted();
                        managed.authority.assertTicket(ticket);
                        const resident = ctx.agents.get(entry.id);
                        const live = resident === undefined ? ownRoute(observation.events.slice(observation.inheritedEventCount)) : roleRouteComparison(resident).liveRoute;
                        const route = evidence.invocation.initialRoute;
                        return { evidence: projectChildAdmissionEvidence(evidence, ticket.parentEpoch), prompt, interrupt: prompt,
                            invocation: { role: evidence.role, label: facts.descriptor.label ?? entry.label ?? evidence.role, level: evidence.invocation.level,
                                routeSource: evidence.invocation.routeSource, route: live.status === "known" ? live.route : route, mode, childId: entry.id },
                            routeComparison: { childId: entry.id, initialRoute: { status: "known", source: "invocation-capture", route }, liveRoute: live } };
                    }
                    finally {
                        observation[Symbol.dispose]();
                    }
                },
            });
        },
    };
}
function ownRoute(events) {
    let event;
    for (let index = events.length - 1; index >= 0; index--)
        if (events[index].type === "request/header") {
            event = events[index];
            break;
        }
    if (event === undefined)
        return { status: "unknown", reason: "no-own-request-header" };
    const route = event.data?.header?.config;
    if (typeof route?.provider !== "string" || typeof route.model !== "string" || route.reasoningEffort !== undefined && typeof route.reasoningEffort !== "string")
        return { status: "unknown", reason: "invalid-own-request-header" };
    try {
        return { status: "known", source: "own-native-request-header", route: modelRouteFromCall({ ...route, provider: route.provider, model: route.model }) };
    }
    catch {
        return { status: "unknown", reason: "invalid-own-request-header" };
    }
}
function observedOriginalInvocation(agent, admission, label, mode) {
    const original = capturedOriginalRoleInvocation(agent), capture = admission.childCapture;
    if (original === undefined || capture === undefined)
        return undefined;
    const live = roleRouteComparison(agent).liveRoute;
    return { view: { role: capture.role, label: label ?? capture.role, level: original.level, routeSource: original.routeSource,
            route: live.status === "known" ? live.route : original.initialRoute, mode, childId: agent.id },
        routeKind: live.status === "known" ? "actual" : "initial" };
}
export function registerRuntimeGuidance(ctx, getSettings, policy) {
    const installed = new WeakSet();
    const install = ({ agent }) => {
        if (installed.has(agent) || !(agent.ctx instanceof Context))
            return;
        const scope = agent.ctx;
        const disposeGuidance = scope.get("systemPrompt")?.section({ name: "dsmm:admitted-guidance", order: 50, text() {
                const settings = getSettings(agent), admission = getSettings.admission(agent), tools = scope.get("tools");
                const schemas = tools?.schemas(agent).filter(schema => policy.toolDenial(agent, schema.name, tools) === undefined) ?? [];
                const descriptor = foldSubagentDescriptor(childOwnedSessionEvents(agent.session));
                const invocation = descriptor === undefined ? undefined : observedOriginalInvocation(agent, admission, descriptor.label, descriptor.mode);
                const runtime = getSettings.subagentRuntime?.();
                let childEvidence = admission.childCapture === undefined ? admission.childEvidence : undefined;
                if (admission.childCapture !== undefined && agent.session.header?.parentSession !== undefined) {
                    const parent = scope.get("agents")?.get(SessionId(agent.session.header.parentSession));
                    const bound = scope.get("subagents");
                    if (parent !== undefined && bound !== undefined && original(bound) instanceof DsmmSubagentRuntime) {
                        try {
                            const ticket = original(bound).authority.acquireParentTicket(parent);
                            childEvidence = projectChildAdmissionEvidence(admission.childCapture, ticket.parentEpoch);
                        }
                        catch { /* A closing direct parent supplies no current display ticket. */ }
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
        if (disposeGuidance !== undefined)
            ctx.effect?.(() => disposeGuidance);
        installed.add(agent);
    };
    ctx.on?.("agent/created", install, { global: true });
    for (const agent of ctx.get?.("agents")?.list() ?? [])
        install({ agent });
}
export function registerRoleControlContribution(ctx) {
    ctx.inject(["typert"], scope => {
        if (scope.typert.getPackage(ROLE_CONTROL_HOST.package, "host") === undefined)
            scope.typert.register(ROLE_CONTROL_HOST);
        new UnavailableRoleControls(scope);
    });
}
/** Core exposes a truthful refusal without requiring or impersonating a managed runtime. */
let UnavailableRoleControls = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _descendants_decorators;
    let _background_decorators;
    let _prompt_decorators;
    let _interrupt_decorators;
    return class UnavailableRoleControls extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _descendants_decorators = [Remote];
            _background_decorators = [Remote];
            _prompt_decorators = [Remote];
            _interrupt_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _descendants_decorators, { kind: "method", name: "descendants", static: false, private: false, access: { has: obj => "descendants" in obj, get: obj => obj.descendants }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _background_decorators, { kind: "method", name: "background", static: false, private: false, access: { has: obj => "background" in obj, get: obj => obj.background }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _prompt_decorators, { kind: "method", name: "prompt", static: false, private: false, access: { has: obj => "prompt" in obj, get: obj => obj.prompt }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _interrupt_decorators, { kind: "method", name: "interrupt", static: false, private: false, access: { has: obj => "interrupt" in obj, get: obj => obj.interrupt }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, "dsmmChildren");
            __runInitializers(this, _instanceExtraInitializers);
        }
        refuse() {
            const connection = this.ctx.get("connection"), invocation = this.ctx.invocation;
            const code = connection === undefined || invocation?.peer !== connection.browserPeer ? "not-owned" : "unavailable";
            throw new RemoteError("dsmm-children/refused", "The Host refused the child control operation.", { code, ...(code === "unavailable" ? { reason: "delivery-fence-unavailable" } : {}) });
        }
        describe(_sessionId) { return this.refuse(); }
        descendants(_sessionId) { return this.refuse(); }
        background(_sessionId, _request) { return this.refuse(); }
        prompt(_sessionId, _request) { return this.refuse(); }
        interrupt(_sessionId, _request) { return this.refuse(); }
    };
})();
/** Explicit startup entry; it owns one PUBLIC subclass, never a live replacement. */
export const subagentRuntimePlugin = { name: "dsmm-subagent-runtime", inject: DsmmSubagentRuntime.inject, Config: SubagentRuntime.Config,
    apply(ctx, config) {
        const runtime = new DsmmSubagentRuntime(ctx, config, classifyDsmmAgent);
        runtimeScopes.set(runtime, ctx);
    } };
export * from "./subagent-runtime.js";
export default subagentRuntimePlugin;
//# sourceMappingURL=runtime-integration.js.map