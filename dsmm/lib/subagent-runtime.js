import { SubagentError, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { TYPERT as NATIVE_SUBAGENT_HOST } from "@deepseek-ai/dsh-subagent/typert";
import { DsmmDeliveryAuthority, scopeLifetime } from "./delivery-authority.js";
export { DsmmDeliveryAuthority } from "./delivery-authority.js";
/** Explicit startup replacement for the stock row, in the SAME Host service scope. */
export class DsmmSubagentRuntime extends SubagentRuntime {
    authority;
    waiters = new Set();
    lifetime = new AbortController();
    requiredProviders = ["spawn"];
    continuablePreflight;
    constructor(ctx, config, hostClassifier) {
        if (ctx.get("subagents") !== undefined) {
            throw new SubagentError("Explicit DSMM startup composition must exclude the stock subagents row; restart with one provider.", "DUPLICATE_PROVIDER");
        }
        super(ctx, config);
        this.authority = new DsmmDeliveryAuthority(ctx, () => this.substrateReady(), () => this.wakeWaiters(), hostClassifier);
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
    configureContinuablePreflight(preflight, signal) {
        signal.throwIfAborted();
        if (this.continuablePreflight !== undefined)
            throw new SubagentError("Continuable routing already has a Host owner", "UNAUTHORIZED");
        this.continuablePreflight = preflight;
        signal.addEventListener("abort", () => { if (this.continuablePreflight === preflight)
            this.continuablePreflight = undefined; }, { once: true });
    }
    startContinuable(spec) {
        const start = request => super.startContinuable(request);
        return this.continuablePreflight === undefined ? start(spec) : this.continuablePreflight(spec, start);
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
        // The SDK alone validates exact residency and adjacency on child -> parent.
        if (sender.session.header.parentSession === targetId || !this.authority.isManaged(sender)) {
            return super.sendMessage(sender, targetId, content, options);
        }
        const ticket = this.authority.acquireParentTicket(sender);
        const signal = AbortSignal.any([options.signal, ticket.signal]);
        const evidence = await this.authority.resolveChildEvidence(ticket, targetId, signal);
        this.authority.assertDelivery(ticket, targetId, evidence);
        signal.throwIfAborted();
        return super.sendMessage(sender, targetId, content, { ...options, signal });
    }
    async prompt(request, callerSignal) {
        const parent = this.ctx.get("agents")?.get(request.parentSessionId);
        if (parent === undefined || !this.authority.isManaged(parent))
            return super.prompt(request, callerSignal);
        let signal = callerSignal;
        try {
            const ticket = this.authority.acquireParentTicket(parent);
            signal = AbortSignal.any([callerSignal, ticket.signal, this.authority.acquireBrowserSignal(this.ctx)]);
            const evidence = await this.authority.resolveChildEvidence(ticket, request.childSessionId, signal);
            this.authority.assertDelivery(ticket, request.childSessionId, evidence);
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
        return super.prompt(request, signal);
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