import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { getTraceable, symbols } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError, delegationDepthOf } from "@deepseek-ai/dsh-subagent";
import { freezeSettings } from "./settings.js";
import { scopeLifetime } from "./lifetime.js";
import { sessionEvents } from "./session-scope.js";
import { scopeParentOf } from "./native-scope.js";
import { DsmmProfileError } from "./profiles.js";
import { roleProviderName } from "./roles.js";
import { resolveRoleInvocation } from "./role-invocation.js";
import { resolvedModelParameterPolicy } from "./model-parameter-policy.js";
/** Short-lived creation correlations and exact live bindings, never an execution queue. */
export class NativeAdmission {
    ctx;
    profiles;
    policy;
    lifetime = new AbortController();
    pending = new Map();
    live = new WeakMap();
    candidates = new WeakMap();
    historyPrepared = new WeakMap();
    agents = new Set();
    activations = new Set();
    activities = new Map();
    calls = new Map();
    rebindings = new WeakMap();
    guardedTools = new WeakMap();
    agentLifetimes = new WeakMap();
    retirements = new WeakMap();
    installing = new AsyncLocalStorage();
    selecting = new WeakSet();
    failedInstallations = new WeakSet();
    blankUpdates = new WeakMap();
    getters = new WeakMap();
    executions = new WeakMap();
    ready = false;
    install;
    constructor(ctx, profiles, policy) {
        this.ctx = ctx;
        this.profiles = profiles;
        this.policy = policy;
        scopeLifetime(ctx, "dsmm: close admission before owner teardown", () => {
            this.lifetime.abort();
            this.pending.clear();
            for (const agent of this.agents)
                agent.cancel({ kind: "disposed" });
        });
        ctx.effect(() => async () => {
            const results = await Promise.allSettled([...this.activations].map(activation => activation.dispose()));
            await Promise.allSettled(this.activities.keys());
            const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
            if (errors.length)
                throw new AggregateError(errors, "Native activation teardown failed");
        });
        ctx.on("agent/created", async (frame) => { await this.created(frame.agent, frame.source, frame.signal); }, { global: true, prepend: true });
        ctx.on("agent/disposed", ({ agent }) => {
            void this.retireAgent(agent).catch(() => { });
            this.live.delete(agent);
            this.candidates.delete(agent);
            this.agents.delete(agent);
            for (const activation of this.activations)
                if (activation.childId === agent.id)
                    this.activations.delete(activation);
            profiles.release(agent);
            policy.release(agent);
        }, { global: true });
        // Unbound retained Agents are not enrolled by listing. These guards also cover startup failures.
        ctx.on("agent/pre-step", async (frame, next) => { await this.ensure(frame.agent); return next(); }, { global: true, prepend: true });
        ctx.on("agent/request", async (frame, next) => { await this.ensure(frame.agent); return next(); }, { global: true, prepend: true });
        ctx.on("tools/execute", async (exec, next) => { if (exec.agent)
            await this.ensure(exec.agent); return policy.duringToolExecution(exec, next); }, { global: true, prepend: true });
        ctx.on("tools/pre-execute", async (exec, next) => {
            if (exec.agent) {
                const active = this.executions.get(exec.agent) ?? new Set();
                active.add(exec.token);
                this.executions.set(exec.agent, active);
                await this.ensure(exec.agent);
            }
            return next();
        }, { global: true, prepend: true });
        ctx.on("tools/result", exec => { if (exec.agent)
            this.executions.get(exec.agent)?.delete(exec.token); }, { global: true });
        ctx.on("agent-preset/selected", id => {
            const agent = ctx.agents.get(id);
            if (!agent || !this.live.has(agent))
                return;
            const binding = this.rebindBlank(agent);
            this.rebindings.set(agent, binding);
            void binding.catch(() => { });
        }, { global: true });
    }
    activate(install) { this.lifetime.signal.throwIfAborted(); this.install = install; this.ready = true; }
    get isReady() { return this.ready && !this.lifetime.signal.aborted; }
    /** Install the current configuration before publication, without enrolling a historical Agent as blank. */
    async prepareHistory(agent, admission, signal) {
        const check = () => {
            signal.throwIfAborted();
            this.lifetime.signal.throwIfAborted();
            if (!this.isReady || !this.install || this.ctx.agents.get(agent.id) !== undefined || agent.session.header.origin === "subagent"
                || this.ctx.get("dsmmHistoryContinuation")?.admissionForCreated(agent) !== admission)
                throw new SubagentError("Exact unpublished history candidate required", "UNAUTHORIZED");
        };
        check();
        const prepared = { admission, preset: agent.ctx.get("agentPresets")?.composedPreset(agent.ctx), scopeParent: scopeParentOf(agent), dependencies: this.dependencies(agent) };
        if (prepared.dependencies.some(value => value === undefined))
            throw new SubagentError("History composition is unavailable", "UNAUTHORIZED");
        this.candidates.set(agent, admission);
        scopeLifetime(agent.ctx, "dsmm: release unpublished history configuration", () => { this.historyPrepared.delete(agent); this.candidates.delete(agent); });
        this.guardTools(agent);
        await this.install(agent, this.getter(agent), "history-setup");
        check();
        if (prepared.dependencies.some((value, index) => value !== this.dependencies(agent)[index]) || prepared.scopeParent !== scopeParentOf(agent))
            throw new SubagentError("History composition changed during setup", "UNAUTHORIZED");
        this.historyPrepared.set(agent, prepared);
    }
    isSelecting(agent) { return this.selecting.has(agent); }
    get(agent) { return this.live.get(agent)?.admission; }
    configuration(agent) {
        const preview = this.installing.getStore();
        const value = preview?.agent === agent ? preview.admission : this.candidates.get(agent) ?? this.get(agent);
        if (!value)
            throw new SubagentError("No trusted live admission", "UNAUTHORIZED");
        return value;
    }
    getter(agent) {
        let getter = this.getters.get(agent);
        if (getter === undefined) {
            getter = () => this.configuration(agent).settings;
            getter.admission = () => this.configuration(agent);
            this.getters.set(agent, getter);
        }
        return getter;
    }
    dependencies(agent) {
        const presets = agent.ctx.get("agentPresets");
        return [presets, agent.ctx.get("subagents"), agent.ctx.get("llm"),
            presets?.serviceFor(agent, "tools") ?? agent.ctx.get("tools"),
            presets?.serviceFor(agent, "systemPrompt") ?? agent.ctx.get("systemPrompt"),
            presets?.serviceFor(agent, "skills") ?? agent.ctx.get("skills")].map(service => service === undefined ? undefined : original(service));
    }
    invocation(agent) { return this.live.get(agent)?.invocation; }
    async ensure(agent) { await this.rebindings.get(agent); return this.assert(agent); }
    assert(agent) {
        this.lifetime.signal.throwIfAborted();
        this.agentLifetimes.get(agent)?.signal.throwIfAborted();
        const live = this.live.get(agent);
        if (this.failedInstallations.has(agent))
            throw new SubagentError("Session configuration restoration failed; create a new session", "UNAUTHORIZED");
        if (this.selecting.has(agent))
            throw new SubagentError("Session configuration maintenance is in progress", "UNAUTHORIZED");
        if (!this.ready || !live || this.ctx.agents.get(agent.id) !== agent)
            throw new SubagentError("No trusted live admission; create a new session", "UNAUTHORIZED");
        if (live.preset !== agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) || live.scopeParent !== scopeParentOf(agent))
            throw new SubagentError("Preset composition changed; create a new session", "UNAUTHORIZED");
        if (live.parent && (this.ctx.agents.get(live.parent.id) !== live.parent || !this.ctx.agents.isOwnedBy(agent.id, live.parent)))
            throw new SubagentError("Parent residency changed", "UNAUTHORIZED");
        if (live.parent)
            this.agentLifetimes.get(live.parent)?.signal.throwIfAborted();
        this.policy.assertModuleAdmission(agent);
        return live.admission;
    }
    blankReason(agent, allowQueued = false) {
        if (!this.isReady || this.failedInstallations.has(agent) || this.ctx.agents.get(agent.id) !== agent || !this.ctx.agents.roots().includes(agent) || this.dependencies(agent).some(value => value === undefined))
            return "runtime-unavailable";
        const live = this.live.get(agent);
        if (!live || live.parent || agent.session.header.origin === "subagent" || agent.session.header.isSeeded
            || sessionEvents(agent.session).some(event => ["turn/start", "step/start", "request/header", "assistant/message", "tool/call"].includes(event.type)))
            return "new-session-required";
        if (agent.status !== "idle" || (this.calls.get(agent) ?? 0) !== 0 || (this.executions.get(agent)?.size ?? 0) !== 0 || [...this.pending.values()].some(row => row.parent === agent)
            || this.ctx.agents.list().some(child => this.ctx.agents.isOwnedBy(child.id, agent))
            || this.selecting.has(agent) && !allowQueued
            || !allowQueued && (agent.inbox.nextTurn.length !== 0 || agent.inbox.nextStep.length !== 0))
            return "busy";
        if (agent.runMaintenance === undefined)
            return "maintenance";
        if (live.preset !== agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) || live.scopeParent !== scopeParentOf(agent)
            || this.agentLifetimes.get(agent)?.signal.aborted)
            return "runtime-unavailable";
        return undefined;
    }
    /** Reserved by runMaintenance; newly queued input belongs to the accepted choice. */
    beginBlank(agent, signal, assertAuthority) {
        const reason = this.blankReason(agent);
        if (reason !== undefined)
            throw new DsmmProfileError(reason === "busy" ? "busy" : "unavailable", "Only an unstarted live session can select its configuration.");
        const previous = this.live.get(agent);
        this.assert(agent);
        const captured = this.dependencies(agent);
        const preparationSignal = AbortSignal.any([signal, this.lifetime.signal, this.agentLifetimes.get(agent).signal]);
        this.selecting.add(agent);
        let finish;
        const completion = new Promise(resolve => { finish = resolve; });
        this.blankUpdates.set(agent, completion);
        let prepared = false, committed = false;
        let publication;
        let providers = new Map();
        const assertCurrent = () => {
            assertAuthority();
            preparationSignal.throwIfAborted();
            if (this.live.get(agent) !== previous || this.blankReason(agent, true) !== undefined || this.dependencies(agent).some((value, index) => value !== captured[index])) {
                throw new DsmmProfileError("conflict", "The session owner or composition changed before configuration commit.");
            }
            for (const [name, expected] of providers) {
                const current = agent.ctx.get("subagents")?.getProvider(name);
                if (current === undefined || original(current) !== original(expected) || current.capabilities.depthLimit !== true) {
                    throw new DsmmProfileError("conflict", "A required native provider changed before configuration commit.");
                }
            }
        };
        const install = (admission) => this.installing.run({ agent, admission }, () => this.install(agent, this.getter(agent)));
        return {
            assertCurrent,
            prepare: async (admission, describe) => {
                assertCurrent();
                this.policy.validateRootRole(agent, admission);
                await this.installing.run({ agent, admission }, async () => {
                    const targets = this.policy.targets(agent);
                    providers = new Map([...targets.map(roleProviderName), ...targets.length === 0 ? [] : ["spawn"]].map(name => {
                        const provider = agent.ctx.get("subagents")?.getProvider(name);
                        if (provider?.capabilities.depthLimit !== true)
                            throw new DsmmProfileError("activation", "An enabled role has no admitted native provider.");
                        return [name, provider];
                    }));
                    for (const role of targets) {
                        const preset = await agent.ctx.get("agentPresets").resolve(role);
                        assertCurrent();
                        if (preset.broken !== undefined)
                            throw new DsmmProfileError("activation", "An enabled role preset is unavailable.", role);
                        const routing = admission.settings.roleRouting[role];
                        if (routing?.primary !== undefined || routing?.fallbackRoutes !== undefined) {
                            await resolveRoleInvocation(agent, role, admission.settings, preparationSignal, {}, undefined, resolvedModelParameterPolicy(admission));
                            assertCurrent();
                        }
                        for (const level of ["low", "high", "max"])
                            if (routing?.levels?.[level] !== undefined) {
                                await resolveRoleInvocation(agent, role, admission.settings, preparationSignal, { level }, undefined, resolvedModelParameterPolicy(admission));
                                assertCurrent();
                            }
                    }
                });
                assertCurrent();
                prepared = true;
                await install(admission);
                assertCurrent();
                this.installing.run({ agent, admission }, describe);
                publication = Object.freeze({ ...previous, admission });
            },
            committed: () => { this.live.set(agent, publication); committed = true; },
            close: async () => {
                try {
                    if (prepared && !committed && this.ctx.agents.get(agent.id) === agent && !this.lifetime.signal.aborted)
                        await install(previous.admission);
                }
                catch (error) {
                    this.failedInstallations.add(agent);
                    const refusal = new DsmmProfileError("activation", "Session configuration restoration failed. Execution is disabled; create a new session.");
                    refusal.cause = error;
                    throw refusal;
                }
                finally {
                    this.selecting.delete(agent);
                    this.blankUpdates.delete(agent);
                    finish();
                }
            },
        };
    }
    async reserve(exec, invocation, provider, maxDepth) {
        const parent = exec.agent;
        if (!parent)
            throw new SubagentError("Calling Agent required", "UNAUTHORIZED");
        const parentAdmission = this.assert(parent);
        this.policy.assertDelegation(parent, invocation.target);
        const toolFilter = this.policy.delegationToolFilter(exec);
        const presets = this.ctx.get("agentPresets");
        if (!presets)
            throw new SubagentError("Native preset registry unavailable", "UNSUPPORTED_CAPABILITY");
        const lease = await presets.acquireScope(invocation.target);
        try {
            exec.signal.throwIfAborted();
            this.assert(parent);
            const currentProvider = this.ctx.get("subagents")?.getProvider(provider.name);
            if (!currentProvider || original(currentProvider) !== original(provider) || this.get(parent) !== parentAdmission)
                throw new SubagentError("Creation dependencies changed", "UNAUTHORIZED");
            const childId = SessionId(randomUUID()), signal = AbortSignal.any([exec.signal, this.lifetime.signal, this.agentLifetimes.get(parent).signal]);
            const admission = freezeSettings({ ...parentAdmission, settings: structuredClone(parentAdmission.settings) });
            const pending = Object.freeze({ childId, parent, parentAdmission, callId: exec.callId, invocation, admission, provider, presetScope: lease.key, signal, maxDepth, toolFilter });
            this.pending.set(childId, pending);
            const revoke = () => { if (this.pending.get(childId) === pending)
                this.pending.delete(childId); };
            signal.addEventListener("abort", revoke, { once: true });
            return { childId, signal, release: async () => { revoke(); signal.removeEventListener("abort", revoke); await lease[Symbol.asyncDispose](); } };
        }
        catch (error) {
            await lease[Symbol.asyncDispose]();
            throw error;
        }
    }
    async duringCall(agent, signal, operation) {
        this.assert(agent);
        const merged = AbortSignal.any([signal, this.lifetime.signal, this.agentLifetimes.get(agent).signal]);
        const task = Promise.resolve().then(() => operation(merged));
        this.calls.set(agent, (this.calls.get(agent) ?? 0) + 1);
        this.activities.set(task, agent);
        try {
            return await task;
        }
        finally {
            this.activities.delete(task);
            const remaining = this.calls.get(agent) - 1;
            if (remaining)
                this.calls.set(agent, remaining);
            else
                this.calls.delete(agent);
        }
    }
    prepare(request, provider) {
        const pending = this.pending.get(request.sessionId);
        if (!pending || pending.parent !== request.parent || original(pending.provider) !== original(provider))
            throw new SubagentError("Role creation requires its exact pending call", "UNAUTHORIZED");
        this.check(pending);
        request.signal.throwIfAborted();
    }
    check(pending) {
        pending.signal.throwIfAborted();
        this.lifetime.signal.throwIfAborted();
        const provider = this.ctx.get("subagents")?.getProvider(pending.provider.name);
        if (this.pending.get(pending.childId) !== pending || this.assert(pending.parent) !== pending.parentAdmission || provider === undefined || original(provider) !== original(pending.provider))
            throw new SubagentError("Pending call lost its owner", "UNAUTHORIZED");
    }
    track(activation) {
        this.activations.add(activation);
        void activation.result.finally(() => { if (!this.ctx.agents.get(activation.childId))
            this.activations.delete(activation); }).catch(() => { });
        if (this.lifetime.signal.aborted)
            void activation.dispose().catch(error => this.ctx.logger.error(error));
    }
    guardTools(agent) {
        const tools = agent.ctx.get("agentPresets")?.serviceFor(agent, "tools") ?? agent.ctx.get("tools");
        if (!tools)
            return;
        const identity = original(tools), installed = this.guardedTools.get(agent) ?? new Set();
        if (installed.has(identity))
            return;
        installed.add(identity);
        this.guardedTools.set(agent, installed);
        getTraceable(agent.ctx, tools).guard(exec => {
            if (exec.agent !== agent)
                return;
            this.assert(agent);
            const current = agent.ctx.get("agentPresets")?.serviceFor(agent, "tools") ?? agent.ctx.get("tools");
            if (!current || original(current) !== identity)
                return "The tool realm is no longer the admitted composition";
            this.policy.assertToolExecution(exec);
            return this.policy.preToolDenial(agent, exec.name, undefined, exec);
        });
    }
    retireAgent(agent) {
        const existing = this.retirements.get(agent);
        if (existing)
            return existing;
        this.agentLifetimes.get(agent)?.abort();
        const children = new Set([...this.agents].filter(child => this.live.get(child)?.parent === agent));
        for (const child of children)
            child.cancel({ kind: "disposed" });
        const receipts = [...this.activations].filter(activation => [...children].some(child => child.id === activation.childId));
        const retirement = Promise.allSettled(receipts.map(activation => activation.dispose())).then(results => {
            const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
            if (errors.length)
                throw new AggregateError(errors, "Native descendants failed to retire");
        });
        const settled = retirement.then(async () => { await Promise.allSettled([...this.activities].filter(([, actor]) => actor === agent).map(([activity]) => activity)); });
        this.retirements.set(agent, settled);
        return settled;
    }
    async rebindBlank(agent) {
        await this.blankUpdates.get(agent);
        this.lifetime.signal.throwIfAborted();
        const previous = this.live.get(agent);
        if (previous === undefined)
            throw new SubagentError("The blank Agent owner was retired", "UNAUTHORIZED");
        if (previous.preset === agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) && previous.scopeParent === scopeParentOf(agent))
            return;
        if (this.selecting.has(agent))
            throw new SubagentError("Session configuration maintenance owns the blank composition", "UNAUTHORIZED");
        if (previous.parent || (this.calls.get(agent) ?? 0) !== 0 || [...this.pending.values()].some(row => row.parent === agent)
            || this.ctx.agents.list().some(child => this.ctx.agents.isOwnedBy(child.id, agent)) || sessionEvents(agent.session).some(event => event.type === "turn/start"))
            throw new SubagentError("Preset change requires a new session", "UNAUTHORIZED");
        this.policy.validateRootRole(agent, previous.admission);
        const preset = agent.ctx.get("agentPresets")?.composedPreset(agent.ctx), scopeParent = scopeParentOf(agent);
        this.guardTools(agent);
        await this.install(agent, this.getter(agent));
        this.lifetime.signal.throwIfAborted();
        this.agentLifetimes.get(agent).signal.throwIfAborted();
        if (this.ctx.agents.get(agent.id) !== agent || this.live.get(agent) !== previous || scopeParentOf(agent) !== scopeParent)
            throw new SubagentError("Composition changed during blank admission", "UNAUTHORIZED");
        this.live.set(agent, Object.freeze({ ...previous, preset, scopeParent }));
    }
    async created(agent, source, creationSignal) {
        if (this.live.has(agent)) {
            this.assert(agent);
            return;
        }
        if (!this.ready || !this.install)
            throw new SubagentError("DSMM admission is initializing", "UNAUTHORIZED");
        const signal = AbortSignal.any([...creationSignal ? [creationSignal] : [], this.lifetime.signal]);
        signal.throwIfAborted();
        const parents = this.ctx.agents.list().filter(parent => parent !== agent && this.ctx.agents.isOwnedBy(agent.id, parent));
        const parent = parents[0], preset = agent.ctx.get("agentPresets")?.composedPreset(agent.ctx), presetScope = scopeParentOf(agent), pending = this.pending.get(agent.id);
        if (parents.length > 1 || this.ctx.agents.get(agent.id) !== agent)
            throw new SubagentError("Invalid native ownership", "UNAUTHORIZED");
        let admission;
        if (parent) {
            const parentAdmission = this.assert(parent), controlled = this.policy.identity(parent).role !== undefined;
            if (agent.session.header.parentSession !== parent.id || agent.session.header.origin !== "subagent")
                throw new SubagentError("Invalid native child header", "UNAUTHORIZED");
            if (pending) {
                this.check(pending);
                if (pending.parent !== parent || pending.parentAdmission !== parentAdmission || preset !== pending.invocation.target || agent.session.header.isSeeded
                    || scopeParentOf(agent) !== pending.presetScope)
                    throw new SubagentError("Child does not match the pending invocation", "UNAUTHORIZED");
                if (pending.maxDepth !== undefined && delegationDepthOf(agent) > pending.maxDepth)
                    throw new SubagentError("Child exceeds depth ceiling", "UNAUTHORIZED");
                admission = pending.admission;
            }
            else {
                if (controlled || preset?.startsWith("dsmm-"))
                    throw new SubagentError("Use an admitted DSMM role tool; cold recovery is unavailable", "UNAUTHORIZED");
                admission = parentAdmission;
            }
        }
        else {
            if (agent.session.header.origin === "subagent" || pending)
                throw new SubagentError("Missing exact parent", "UNAUTHORIZED");
            const history = source === "resume" ? this.ctx.get("dsmmHistoryContinuation")?.admissionForCreated(agent) : undefined;
            if (source === "resume") {
                const prepared = this.historyPrepared.get(agent);
                if (!history || prepared?.admission !== history || prepared.preset !== preset || prepared.scopeParent !== presetScope
                    || prepared.dependencies.some((value, index) => value !== this.dependencies(agent)[index]))
                    throw new SubagentError("History resume requires its exact prepared candidate", "UNAUTHORIZED");
                admission = history;
                this.policy.validateRootRole(agent, admission);
            }
            else {
                // A resume may have opened the native log, but cannot recover DSMM authorization.
                if ((source !== "startup" || agent.session.header.isSeeded) && (preset?.startsWith("dsmm-") || sessionEvents(agent.session).some(event => ["deepwork/mode", "dsmm/role-policy"].includes(event.type))))
                    throw new SubagentError("DSMM cold recovery is unavailable", "UNAUTHORIZED");
                admission = await this.profiles.prepareRoot(agent, signal);
                this.policy.validateRootRole(agent, admission);
                if ((source !== "startup" || agent.session.header.isSeeded) && admission.settings.defaultActive)
                    throw new SubagentError("Historical sessions are not automatically admitted to Deepwork", "UNAUTHORIZED");
            }
        }
        this.agentLifetimes.set(agent, new AbortController());
        scopeLifetime(agent.ctx, "dsmm: retire exact Agent work", () => { void this.retireAgent(agent).catch(() => { }); });
        agent.ctx.effect(() => () => this.retireAgent(agent));
        this.candidates.set(agent, admission);
        this.agents.add(agent);
        // These registrations belong to the Agent, not the plugin owner. Revocation remains effective after unload.
        agent.ctx.on("agent/pre-step", async (frame, next) => { if (frame.agent === agent)
            await this.ensure(agent); return next(); }, { prepend: true });
        agent.ctx.on("agent/request", async (frame, next) => { if (frame.agent === agent)
            await this.ensure(agent); return next(); }, { prepend: true });
        agent.ctx.on("tools/pre-execute", async (exec, next) => { if (exec.agent === agent) {
            await this.ensure(agent);
            const denial = this.policy.preToolDenial(agent, exec.name, undefined, exec);
            if (denial)
                return { kind: "deny", reason: denial };
        } return next(); }, { prepend: true });
        this.guardTools(agent);
        try {
            if (pending)
                this.policy.bindChild(agent, parent, admission, pending.invocation, pending.maxDepth, pending.toolFilter);
            await this.install(agent, this.getter(agent));
            signal.throwIfAborted();
            this.agentLifetimes.get(agent).signal.throwIfAborted();
            if (pending)
                this.check(pending);
            if (parent)
                this.assert(parent);
            if (this.ctx.agents.get(agent.id) !== agent || preset !== agent.ctx.get("agentPresets")?.composedPreset(agent.ctx)
                || presetScope !== scopeParentOf(agent) || parent && !this.ctx.agents.isOwnedBy(agent.id, parent))
                throw new SubagentError("Agent changed during initialization", "UNAUTHORIZED");
            this.profiles.publish(agent, admission);
            const published = this.profiles.admission(agent);
            this.live.set(agent, Object.freeze({ admission: published, preset, scopeParent: scopeParentOf(agent), parent, invocation: pending?.invocation }));
            if (pending)
                this.pending.delete(agent.id);
        }
        catch (error) {
            this.policy.release(agent);
            throw error;
        }
        finally {
            this.candidates.delete(agent);
            this.historyPrepared.delete(agent);
        }
    }
}
function original(value) { return Reflect.get(value, symbols.original) ?? value; }
//# sourceMappingURL=native-admission.js.map