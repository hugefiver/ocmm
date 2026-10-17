import { AsyncLocalStorage } from "node:async_hooks";
import { symbols } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { scopeLifetime } from "./delivery-authority.js";
const creations = new AsyncLocalStorage();
const holders = new AsyncLocalStorage();
const cancellations = new WeakSet();
export function managedCancellation(reason) {
    const error = new SubagentError("Managed activation owner cancelled", "ABORTED", { cause: reason });
    cancellations.add(error);
    return error;
}
export function isManagedCancellation(error) { return typeof error === "object" && error !== null && cancellations.has(error); }
export const exactRegistry = (registry) => Reflect.get(registry, symbols.original) ?? registry;
export function duringManagedCreation(operation, run) { return creations.run(operation, run); }
export function currentManagedCreation() { return creations.getStore(); }
export function duringActivationOwnership(signal, run) { return holders.run(signal, run); }
export function activationOwnerSignal() { return holders.getStore(); }
/** Startup-only agents provider. Factory, traced caller, ownership and handles stay native. */
export class DsmmAgentRegistry extends AgentRegistry {
    managedLifetime = new AbortController();
    constructor(ctx) {
        if (ctx.get("agents") !== undefined)
            throw new SubagentError("DSMM agents requires one startup provider; restart to change it.", "DUPLICATE_PROVIDER");
        super(ctx);
        scopeLifetime(ctx, "dsmm.agents: retire managed residency", () => this.managedLifetime.abort());
    }
    create(options) {
        return this.creation("fresh", options.sessionId, options.parentAgent, options.signal, signal => super.create(signal === options.signal ? options : { ...options, signal }));
    }
    resume(options) {
        return this.creation("cold", options.resumeSessionId, options.parentAgent, options.signal, signal => super.resume(signal === options.signal ? options : { ...options, signal }));
    }
    enter(agent, owner) {
        const detach = super.enter(agent, owner);
        const operation = creations.getStore();
        if (operation?.claimed && operation.registry === exactRegistry(this) && operation.parent === owner && operation.childId === agent.id) {
            try {
                operation.entered(agent);
            }
            catch (error) {
                detach();
                throw error;
            }
        }
        return detach;
    }
    async creation(kind, id, parent, source, run) {
        const operation = creations.getStore();
        if (operation !== undefined && operation.registry === exactRegistry(this) && operation.parent === parent
            && operation.childId === id && operation.kind === kind) {
            if (operation.claimed || operation.retired || this.managedLifetime.signal.aborted || source === undefined) {
                throw new SubagentError("Managed creation requires its exact unused operation", "UNAUTHORIZED");
            }
            operation.claimed = true;
        }
        if (source === undefined)
            return run(source);
        // Creation-only cancellation must not end an accepted root or native child residency.
        const relay = new AbortController();
        const abort = () => relay.abort(source.reason);
        source.addEventListener("abort", abort, { once: true });
        if (source.aborted)
            abort();
        try {
            return await run(relay.signal);
        }
        finally {
            source.removeEventListener("abort", abort);
        }
    }
}
export default DsmmAgentRegistry;
//# sourceMappingURL=agent-registry.js.map