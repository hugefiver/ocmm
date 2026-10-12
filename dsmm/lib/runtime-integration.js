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
import { createLegacyReadIntegration } from "./legacy-read-integration.js";
import { NativeChildEvidenceReader } from "./native-child-evidence.js";
import { DsmmProfileError } from "./profiles.js";
import { capturedOriginalRoleInvocation } from "./role-invocation.js";
import { ROLE_CONTROL_HOST } from "./role-control-remote.js";
import { registerRoleControlRpc } from "./role-control-rpc.js";
import { RoleRunRegistry } from "./role-runs.js";
import { admittedCallableRoleInventory, roleInvocationObservation, roleRouteComparison } from "./role-subagents.js";
import { childOwnedSessionEvents, resolveSelectedAgentPreset } from "./session-scope.js";
import { buildDsmmAgentGuidance } from "./prompts.js";
import { DsmmSubagentRuntime } from "./subagent-runtime.js";
function original(value) { return (Reflect.get(value, symbols.original) ?? value); }
const runtimeScopes = new WeakMap();
/** Native headers and own descriptors establish origin; absence from a DSMM registry never does. */
export function classifyDsmmAgent(agent) {
    const structural = agent;
    const own = childOwnedSessionEvents(structural.session);
    const selected = agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) ?? resolveSelectedAgentPreset(structural.session);
    if (selected?.startsWith("dsmm-") || own.some(event => event.type === "dsmm/role-policy"))
        return "dsmm";
    if (agent.session.header.origin === "subagent") {
        const descriptor = foldSubagentDescriptor(own);
        // A creation without an establishing descriptor is unknown, not native.
        return descriptor === undefined || descriptor.provider.startsWith("dsmm-role-") ? "dsmm" : "native";
    }
    return own.some(event => event.type === "deepwork/mode" && event.data?.active === true) ? "dsmm" : "native";
}
function nativeChild(ctx, agent, controlledParent) {
    if (agent.session.header?.origin !== "subagent" || classifyDsmmAgent(agent) !== "native")
        return false;
    const parent = agent.session.header.parentSession === undefined ? undefined : ctx.agents.get(SessionId(agent.session.header.parentSession));
    return parent !== undefined && !controlledParent(parent);
}
/** Limit DSMM's observers/guards to its own children without altering the native service or factories. */
export function managedAgentContext(ctx, controlledParent) {
    const agents = ctx.agents;
    const tools = ctx.get("tools");
    const filteredAgents = new Proxy(agents, { get(target, key) {
            if (key === "list")
                return () => target.list().filter(agent => !nativeChild(ctx, agent, controlledParent));
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
    const filteredTools = tools === undefined ? undefined : new Proxy(tools, { get(target, key) {
            if (key === "guard")
                return (guard) => target.guard(exec => exec.agent !== undefined && nativeChild(ctx, exec.agent, controlledParent) ? undefined : guard(exec));
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
    return new Proxy(ctx, { get(target, key) {
            if (key === "get")
                return (name) => name === "agents" ? filteredAgents : name === "tools" ? filteredTools : target.get(name);
            if (key === "on")
                return (event, listener, options) => target.on(event, ((...args) => {
                    const agent = args[0]?.agent ?? (event === "system-prompt/assemble" ? args[1]?.scope : undefined);
                    if (agent !== undefined && agents.list().includes(agent) && nativeChild(ctx, agent, controlledParent)) {
                        const next = args.at(-1);
                        return typeof next === "function" ? next() : undefined;
                    }
                    return listener(...args);
                }), options);
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
export function publicProfileRuntime(runtime, ctx, integration) {
    const getter = Object.assign(((agent) => runtime.getSettings(agent)), runtime.getSettings, { subagentRuntime: () => runtimeAdmissionView(ctx) });
    return new Proxy(runtime, { get(target, key) {
            if (key === "getSettings")
                return getter;
            if (key === "getSession" || key === "selectSession")
                return async (...args) => {
                    let result;
                    const call = async () => { result = await Reflect.apply(Reflect.get(target, key), target, args); };
                    if (key === "selectSession" && integration !== undefined)
                        await integration.changeConfiguration("parent-profile-apply", call);
                    else
                        await call();
                    return { ...result, subagentRuntime: runtimeAdmissionView(ctx) };
                };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        } });
}
const hosts = new WeakMap();
function unavailableLegacy() {
    throw new DsmmProfileError("unavailable", "Legacy execution requires the separately installed real Host operation/approval/audit adapter.");
}
/** Exact live descendants are revoked synchronously before any native holder starts draining. */
function revokeTree(ctx, revoke, parent, reason) {
    const registry = ctx.agents;
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
    const bound = ctx.get("subagents");
    const native = bound === undefined ? undefined : original(bound);
    if (!(native instanceof DsmmSubagentRuntime) || !settings.modules.deepwork.enabled)
        return undefined;
    const hostScope = runtimeScopes.get(native);
    if (hostScope === undefined)
        throw new DsmmProfileError("unavailable", "Managed admission requires the explicit Host-owned startup entry, not a separately constructed runtime.");
    native.requireProviders(["spawn"]);
    const lifetime = new AbortController();
    scopeLifetime(ctx, "dsmm.integration: close startup preparation", () => lifetime.abort());
    await native.waitForProvider("spawn", lifetime.signal);
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
                revokeParent: (agent, reason) => revokeTree(hostScope, (agent, why) => native.authority.revokeParent(agent, why), agent, reason),
                async disposeRun(run) {
                    if (run.localAgent !== undefined)
                        revokeTree(hostScope, (agent, why) => native.authority.revokeParent(agent, why), run.localAgent, "run-disposed");
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
    const legacyRead = startup.experimentalLegacyRead === undefined ? undefined : createLegacyReadIntegration({ ctx,
        authority: native.authority, authorityOwner: stable.owner, nativeHistory: history,
        trustedHostStartup: startup.experimentalLegacyRead.startup, classifyChildReport: startup.experimentalLegacyRead.classifyChildReport, coreAdmissions: originalAdmissions,
        admissions: {
            resolveOriginalChildEvidence: (ticket, id, signal) => bridge.policy.resolveChildEvidence(ticket, SessionId(id), signal),
            childAdmission: child => getRuntime().admission(child),
            assertCurrentParent(ticket, child, evidence) {
                native.authority.assertTicket(ticket);
                const borrowed = bridge.authority.acquireParentTicket(ticket.parent);
                if (borrowed.owner !== ticket.owner || borrowed.admission !== ticket.admission || borrowed.parentEpoch !== ticket.parentEpoch)
                    throw new SubagentError("Legacy parent is not the exact current Host admission", "UNAUTHORIZED");
                policy.assertChildDelivery(borrowed, child.id, evidence);
                native.authority.assertTicket(ticket);
            },
        },
        proxyDefinitions: {
            admit(parent, child, definition) {
                const identity = policy.identity(child), tools = child.ctx.tools;
                if (identity.parent !== parent || !ctx.agents.isOwnedBy(child.id, parent) || tools.get(definition.name, child) !== definition)
                    throw new SubagentError("Legacy proxy requires its exact registered child realm", "UNAUTHORIZED");
                policy.captureTools(child, tools, [definition.name]);
            },
            assertAdmitted(child, definition) {
                const tools = child.ctx.tools;
                if (tools.get(definition.name, child) !== definition || policy.toolDenial(child, definition.name, tools) !== undefined)
                    throw new SubagentError("Legacy proxy definition is not admitted by the actual role guard", "UNAUTHORIZED");
            },
        },
    });
    const legacyCore = legacyRead?.core;
    if (legacyRead !== undefined && legacyCore === undefined)
        throw new DsmmProfileError("unavailable", "Legacy read requires an explicit trusted cold Host composition.");
    bridge = createChildAdmissionBinding({ ctx, owner: stable.owner, deliveryAuthority: native.authority,
        nativeSubstrate: settings, nativeHistory: history,
        get legacyCapabilities() { return legacyCore?.legacyCapabilities ?? unavailableLegacy(); },
        collaborators: {
            classifyParent: classifyDsmmAgent,
            resolveOriginalChildEvidence: (...args) => (legacyCore ?? originalAdmissions).resolveOriginalChildEvidence(...args),
            childAdmission: { prepare: (...args) => completion.prepare(...args), validateRole: (...args) => completion.validateRole(...args) },
            assertDelivery: (ticket, id, evidence) => {
                if ("mode" in evidence) {
                    if (legacyCore === undefined)
                        unavailableLegacy();
                    legacyCore.assertLegacyDelivery(ticket, id, evidence);
                }
                else
                    policy.assertChildDelivery(ticket, id, evidence);
            },
        }, });
    completion = policy.configureAdmission({ nativeSubstrate: settings, resolveOriginalEvidence: bridge.resolveOriginalEvidence,
        ...(legacyCore === undefined ? {} : { classifyLegacyTool: legacyCore.classifyLegacyTool }),
        revokeParent: (agent, reason) => revokeTree(ctx, bridge.authority.revokeParent, agent, reason) });
    // Native non-DSMM direct children remain native. This branch is established
    // from an actual public physical cut, never from a missing DSMM registration.
    const nativeEvidence = new WeakSet();
    const isNativeEvidence = (evidence) => typeof evidence === "object" && evidence !== null && nativeEvidence.has(evidence);
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
            const marked = own.some(event => {
                if (event.type === "dsmm/role-policy")
                    return true;
                if (event.type === "deepwork/mode")
                    return event.data?.active === true;
                if (event.type !== "agent-preset/selected")
                    return false;
                const preset = event.data?.agentPreset;
                return typeof preset === "string" && preset.startsWith("dsmm-");
            });
            const resident = ctx.agents.get(childId);
            if (header.version !== 4 || header.id !== childId || header.parentSession !== ticket.parent.id || header.origin !== "subagent"
                || own.filter(event => event.type === "subagent/descriptor").length !== 1 || descriptor?.mode !== mode || descriptor.provider.startsWith("dsmm-role-")
                || marked
                || resident !== undefined && classifyDsmmAgent(resident) !== "native")
                return undefined;
            const evidence = Object.freeze({ parent: ticket.parent, childId });
            nativeEvidence.add(evidence);
            return evidence;
        }
        finally {
            observation[Symbol.dispose]();
        }
    };
    native.authority.bindPolicy(ctx, stable.owner, {
        classifyParent: classifyDsmmAgent,
        async resolveChildEvidence(ticket, childId, signal) {
            const evidence = await proveNativeChild(ticket, childId, "continuable", signal);
            if (evidence !== undefined)
                return evidence;
            return bridge.policy.resolveChildEvidence(ticket, childId, signal);
        },
        assertDelivery(ticket, childId, evidence) {
            if (isNativeEvidence(evidence)) {
                if (evidence.parent !== ticket.parent || evidence.childId !== childId || policy.identity(ticket.parent).role !== undefined)
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
    const enrolledLegacy = new Map();
    if (legacyCore !== undefined) {
        ctx.on("agent/disposed", ({ agent }) => { enrolledLegacy.delete(agent); }, { global: true });
        ctx.effect(() => async () => {
            native.authority.revokeOwner(stable.owner, "core-owner-ended");
            await legacyCore.dispose(async () => {
                for (const attachment of enrolledLegacy.values())
                    await managed.drainContinuableChildren(attachment.parent, [attachment.child.id]);
            });
        });
    }
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
    return { bridge, owner: stable.owner, registry: stable.registry, runtime: managed, legacyRead,
        async afterChildAdmission(agent, signal = lifetime.signal) {
            if (legacyCore === undefined || agent.session.header.origin !== "subagent")
                return;
            signal = AbortSignal.any([signal, lifetime.signal]);
            const runtime = getRuntime();
            if (runtime === undefined)
                throw new DsmmProfileError("unavailable", "Child profile admission is not initialized.");
            const admission = await runtime.completeAdmission(agent, signal);
            if (admission.childEvidence?.mode !== "legacy-conservative")
                return;
            const parent = agent.session.header.parentSession === undefined ? undefined : ctx.agents.get(agent.session.header.parentSession);
            if (parent === undefined || !ctx.agents.isOwnedBy(agent.id, parent))
                throw new SubagentError("Legacy enrollment requires its exact live direct parent", "UNAUTHORIZED");
            const previous = enrolledLegacy.get(agent);
            if (previous !== undefined) {
                if (previous.parent !== parent || previous.admission !== admission)
                    throw new SubagentError("Legacy enrollment cannot replace its original exact residency", "UNAUTHORIZED");
                return;
            }
            try {
                const attachment = await legacyCore.afterChildAdmission(parent, agent, signal);
                if (attachment !== undefined)
                    enrolledLegacy.set(agent, attachment);
            }
            catch (error) {
                // Reject back to the actual native admission owner only after revoking
                // this exact residency. That owner retains its original rollback handle.
                revokeTree(ctx, bridge.authority.revokeParent, agent, "child-admission-failed");
                throw error;
            }
        },
        changeConfiguration(reason, mutate) {
            return legacyCore === undefined || enrolledLegacy.size === 0 ? Promise.resolve().then(mutate) : legacyCore.changeConfiguration(reason, mutate);
        },
        dispose(nativeDrain) {
            for (const parent of ctx.agents.roots())
                revokeTree(ctx, bridge.authority.revokeParent, parent, "host-dispose");
            return legacyCore === undefined ? nativeDrain() : legacyCore.dispose(nativeDrain);
        },
        async ready() { bridge.onAdmissionGuardsInstalled(); await managed.waitUntilReady(lifetime.signal); },
        async revokeBeforeDispose(agent, dispose) {
            revokeTree(ctx, bridge.authority.revokeParent, agent, "holder-disposed");
            const nativeDispose = async () => { await stable.registry.drainParent(agent, stable.owner, "holder-disposed"); await dispose(); };
            if (legacyCore === undefined)
                await nativeDispose();
            else
                await legacyCore.revokeBeforeDispose(agent, nativeDispose);
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
                                routeSource: evidence.invocation.routeSource, route: live.status === "known" ? live.route : route, mode: "continuable", childId: entry.id },
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
    return { status: "known", source: "own-native-request-header", route: { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) } };
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
        scope.get("systemPrompt")?.section({ name: "dsmm:admitted-guidance", order: 50, text() {
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
            const code = connection === undefined || invocation?.peer !== connection.operator ? "not-owned" : "unavailable";
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
export const subagentRuntimePlugin = { name: "dsmm-subagent-runtime", inject: ["agents"], Config: SubagentRuntime.Config,
    apply(ctx, config) {
        const runtime = new DsmmSubagentRuntime(ctx, config, classifyDsmmAgent);
        runtimeScopes.set(runtime, ctx);
    } };
export * from "./subagent-runtime.js";
export default subagentRuntimePlugin;
//# sourceMappingURL=runtime-integration.js.map