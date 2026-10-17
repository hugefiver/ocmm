import { randomUUID } from "node:crypto";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { TYPERT as NATIVE_SUBAGENT_HOST } from "@deepseek-ai/dsh-subagent/typert";
import { DsmmDeliveryAuthority, scopeLifetime } from "./delivery-authority.js";
import { activationOwnerSignal, DsmmAgentRegistry, duringManagedCreation, exactRegistry, managedCancellation } from "./agent-registry.js";
export { DsmmDeliveryAuthority } from "./delivery-authority.js";
/** Explicit startup replacement for the stock row, in the SAME Host service scope. */
export class DsmmSubagentRuntime extends SubagentRuntime {
    static inject = ["agents", ...SubagentRuntime.inject];
    authority;
    waiters = new Set();
    lifetime = new AbortController();
    requiredProviders = ["spawn"];
    activationPreflight;
    constructor(ctx, config, hostClassifier) {
        if (ctx.get("subagents") !== undefined) {
            throw new SubagentError("Explicit DSMM startup composition must exclude the stock subagents row; restart with one provider.", "DUPLICATE_PROVIDER");
        }
        super(ctx, config);
        this.authority = new DsmmDeliveryAuthority(ctx, () => this.substrateReady(), () => this.wakeWaiters(), hostClassifier);
        const agents = exactRegistry(ctx.agents);
        if (!(agents instanceof DsmmAgentRegistry))
            throw new SubagentError("Managed activations require the DSMM startup agents provider", "UNSUPPORTED_CAPABILITY");
        const retire = () => { this.lifetime.abort(); for (const agent of agents.list())
            this.authority.revokeParent(agent, "agents-provider-ended"); this.wakeWaiters(); };
        agents.managedLifetime.signal.addEventListener("abort", retire, { once: true });
        if (agents.managedLifetime.signal.aborted)
            retire();
        ctx.inject(["typert"], (remoteCtx) => {
            if (remoteCtx.typert.getPackage("@deepseek-ai/dsh-subagent", "host") === undefined) {
                remoteCtx.typert.register(NATIVE_SUBAGENT_HOST);
            }
            this.wakeWaiters();
        });
        ctx.on("subagent/provider-added", () => this.wakeWaiters());
        ctx.on("subagent/provider-removed", () => this.wakeWaiters());
        scopeLifetime(ctx, "dsmm.subagents: close registration barriers", () => { this.lifetime.abort(); this.wakeWaiters(); });
    }
    /** Host composition may select spawn/fork names before enabling the policy. */
    requireProviders(names) {
        if (this.authority.view().deliveryFenceReady || names.length === 0 || names.some((name) => name.length === 0)) {
            throw new SubagentError("Provider readiness must be configured before DSMM admission becomes ready.", "UNAUTHORIZED");
        }
        this.requiredProviders = [...new Set(names)];
        this.wakeWaiters();
    }
    registerProvider(provider) {
        const dispose = super.registerProvider(provider);
        this.wakeWaiters();
        return dispose;
    }
    /** Host entry route preparation before native normalization loses caller option provenance. */
    configureActivationPreflight(preflight, signal) {
        signal.throwIfAborted();
        if (this.activationPreflight !== undefined)
            throw new SubagentError("Activation routing already has a Host owner", "UNAUTHORIZED");
        this.activationPreflight = preflight;
        signal.addEventListener("abort", () => { if (this.activationPreflight === preflight)
            this.activationPreflight = undefined; }, { once: true });
    }
    async startActivation(spec) {
        this.authority.assertSender(spec.request.parent);
        const start = request => this.startManaged(request);
        return this.activationPreflight === undefined ? start(spec) : this.activationPreflight(spec, start);
    }
    async startManaged(spec) {
        const parent = spec.request.parent;
        if (!this.authority.isManaged(parent, "creation"))
            return super.startActivation(spec);
        const provider = this.getProvider(spec.provider);
        if (provider === undefined)
            throw new SubagentError(`Subagent provider "${spec.provider}" is not registered`, "NO_PROVIDER");
        if (provider.prepareContinuable === undefined)
            throw new SubagentError("Managed delegation requires a local activation provider", "UNSUPPORTED_CAPABILITY");
        const ticket = this.authority.acquireParentTicket(parent);
        const childId = spec.childId ?? SessionId(randomUUID());
        const operation = this.operation(parent, childId, "fresh", ticket.owner, spec.delivery === "caller" ? "one-shot" : "continuable");
        let receipt;
        try {
            receipt = await duringManagedCreation(operation, () => super.startActivation({ ...spec, childId,
                signal: AbortSignal.any([spec.signal, ticket.signal, this.lifetime.signal]) }));
            this.authority.promote(operation);
            let disposal;
            const accepted = receipt;
            return { ...accepted, dispose: () => {
                    if (disposal !== undefined)
                        return disposal;
                    this.retireTree(operation.child, "activation-disposed");
                    return disposal = accepted.dispose();
                } };
        }
        catch (error) {
            this.authority.retireOperation(operation, "activation-refused");
            if (receipt !== undefined) {
                try {
                    await receipt.dispose();
                }
                catch (cleanup) {
                    throw new AggregateError([error, cleanup], "Managed activation admission and cleanup failed");
                }
                if (operation.ownerSignal?.aborted)
                    throw managedCancellation(operation.ownerSignal.reason);
            }
            throw error;
        }
    }
    operation(parent, childId, kind, owner, delegationMode) {
        this.lifetime.signal.throwIfAborted();
        const operation = { registry: exactRegistry(this.ctx.agents), parent, childId, kind, owner, delegationMode,
            ownerSignal: activationOwnerSignal(), claimed: false, retired: false, entered: agent => this.authority.beginPending(operation, agent) };
        return operation;
    }
    async coldDelivery(parent, childId, owner, deliver) {
        const operation = this.operation(parent, childId, "cold", owner);
        let accepted = false;
        try {
            const receipt = await duringManagedCreation(operation, deliver);
            accepted = true;
            // A competing operation may have established this residency before the native lock.
            if (operation.claimed)
                this.authority.promote(operation);
            return receipt;
        }
        catch (error) {
            this.authority.retireOperation(operation, "cold-delivery-refused");
            const child = operation.child;
            if (accepted && child !== undefined && this.ctx.agents.get(child.id) === child && this.ctx.agents.isOwnedBy(child.id, parent)) {
                try {
                    await super.drainChildren(parent, [child.id]);
                }
                catch (cleanup) {
                    throw new AggregateError([error, cleanup], "Managed cold admission and cleanup failed");
                }
            }
            throw error;
        }
    }
    retireTree(parent, reason) {
        const registry = this.ctx.agents, pending = [parent], seen = new Set();
        while (pending.length) {
            const agent = pending.pop();
            if (seen.has(agent))
                continue;
            seen.add(agent);
            this.authority.revokeParent(agent, reason);
            for (const child of registry.list())
                if (child !== agent && registry.isOwnedBy(child.id, agent))
                    pending.push(child);
        }
    }
    drainDescendants(parents) {
        for (const parent of parents)
            if (this.ctx.agents.get(parent.id) !== parent)
                throw new SubagentError("Drain requires exact live parents", "UNAUTHORIZED");
        for (const parent of parents)
            this.retireTree(parent, "descendants-draining");
        return super.drainDescendants(parents);
    }
    drainChildren(parent, childIds) {
        const registry = this.ctx.agents;
        if (registry.get(parent.id) !== parent)
            throw new SubagentError("Drain requires exact live parent", "UNAUTHORIZED");
        const children = childIds.flatMap(id => { const child = registry.get(id); return child === undefined ? [] : [child]; });
        if (children.some(child => !registry.isOwnedBy(child.id, parent)))
            throw new SubagentError("Drain target is not a direct child", "UNAUTHORIZED");
        for (const child of children)
            this.retireTree(child, "child-draining");
        return super.drainChildren(parent, childIds);
    }
    /** Fulfillment proves this exact registry contains the provider, not just a mounted plugin. */
    waitForProvider(name, signal) {
        return this.waitFor(() => this.getProvider(name), signal);
    }
    /** Policy explicitly enabled AND every required provider actually registered. */
    waitUntilReady(signal) {
        return this.waitFor(() => this.authority.view().deliveryFenceReady ? true : undefined, signal).then(() => { });
    }
    async sendMessage(sender, targetId, content, options) {
        this.authority.assertSender(sender);
        // The SDK alone validates exact residency and adjacency on child -> parent.
        if (sender.session.header.parentSession === targetId || !this.authority.isManaged(sender)) {
            return super.sendMessage(sender, targetId, content, options);
        }
        const ticket = this.authority.acquireParentTicket(sender);
        const signal = AbortSignal.any([options.signal, ticket.signal]);
        const evidence = await this.authority.resolveChildEvidence(ticket, targetId, signal);
        const managed = this.authority.assertDelivery(ticket, targetId, evidence);
        signal.throwIfAborted();
        if (!managed)
            return super.sendMessage(sender, targetId, content, { ...options, signal });
        return this.coldDelivery(sender, targetId, ticket.owner, () => super.sendMessage(sender, targetId, content, { ...options, signal }));
    }
    async prompt(request, callerSignal) {
        const parent = this.ctx.get("agents")?.get(request.parentSessionId);
        if (parent === undefined)
            return super.prompt(request, callerSignal);
        let signal = callerSignal;
        let owner;
        let managed;
        try {
            this.authority.assertSender(parent);
            if (!this.authority.isManaged(parent))
                return super.prompt(request, callerSignal);
            const ticket = this.authority.acquireParentTicket(parent);
            owner = ticket.owner;
            signal = AbortSignal.any([callerSignal, ticket.signal, this.authority.acquireBrowserSignal(this.ctx)]);
            const evidence = await this.authority.resolveChildEvidence(ticket, request.childSessionId, signal);
            managed = this.authority.assertDelivery(ticket, request.childSessionId, evidence);
            signal.throwIfAborted();
        }
        catch (error) {
            // Match the native public prompt error boundary, without relabeling success.
            if (signal.aborted)
                throw new RemoteError("gateway/cancelled", "Subagent prompt was cancelled.", {}, { cause: error });
            if (error instanceof SubagentError && error.code === "UNAUTHORIZED") {
                throw new RemoteError("subagent/unauthorized", "Subagent delivery was not authorized.", { childSessionId: request.childSessionId }, { cause: error });
            }
            throw new RemoteError("gateway/internal", "Subagent prompt failed.", {}, { cause: error });
        }
        return managed ? this.coldDelivery(parent, request.childSessionId, owner, () => super.prompt(request, signal)) : super.prompt(request, signal);
    }
    wakeWaiters() {
        for (const waiter of this.waiters)
            waiter.check();
    }
    substrateReady() {
        const typert = this.ctx.get("typert");
        return this.requiredProviders.every((name) => this.getProvider(name) !== undefined)
            && (typert === undefined || typert.local.get("subagents/prompt") !== undefined);
    }
    waitFor(read, callerSignal) {
        const signal = callerSignal === undefined ? this.lifetime.signal : AbortSignal.any([callerSignal, this.lifetime.signal]);
        return new Promise((resolve, reject) => {
            const cleanup = () => { this.waiters.delete(waiter); signal.removeEventListener("abort", check); };
            const check = () => {
                if (signal.aborted) {
                    cleanup();
                    reject(signal.reason);
                    return;
                }
                const value = read();
                if (value !== undefined) {
                    cleanup();
                    resolve(value);
                }
            };
            const waiter = { check };
            this.waiters.add(waiter);
            signal.addEventListener("abort", check, { once: true });
            check();
        });
    }
}
export default DsmmSubagentRuntime;
//# sourceMappingURL=subagent-runtime.js.map