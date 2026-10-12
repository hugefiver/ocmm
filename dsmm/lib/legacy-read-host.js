import { scopeChainOf, scopeOf } from "@deepseek-ai/dsh-scope";
import { createLegacyReadComposition } from "./legacy-read-composition.js";
import { LegacyReadUnavailable } from "./legacy-read-contracts.js";
import { installLegacyReadProxy } from "./legacy-read-proxy.js";
export { createLegacyReadHostOwner, createLegacyReadCallLease, LegacyReadUnavailable } from "./legacy-read-contracts.js";
export { createLegacyReadComposition } from "./legacy-read-composition.js";
/** Explicit startup entry only; default DSMM bootstrap never installs this composition. */
export function createLegacyReadHost(owner) {
    const composition = createLegacyReadComposition(owner);
    const children = new Map();
    return {
        composition,
        attachChild(parent, child, evidence, definition) {
            if (children.has(child))
                throw new LegacyReadUnavailable("composition-unavailable");
            const proxy = installLegacyReadProxy(composition, parent, child, evidence, definition);
            children.set(child, proxy);
            return proxy;
        },
        async releaseAfterChildDispose(child) {
            if (composition.view().state === "ready")
                throw new LegacyReadUnavailable("composition-unavailable");
            const proxy = children.get(child);
            if (proxy === undefined)
                return;
            await proxy.releaseAfterChildDispose();
            children.delete(child);
        },
        publishCheckedGeneration() {
            const snapshot = composition.captureClosedComposition();
            if (snapshot === undefined)
                throw new LegacyReadUnavailable("composition-unavailable");
            for (const proxy of children.values()) {
                if (!snapshot.bindings.some(binding => binding.parent === proxy.parent && binding.child === proxy.child && binding.definition === proxy.nativeDefinition)
                    || proxy.parent.ctx.tools.get("read", proxy.parent) !== proxy.nativeDefinition
                    || proxy.child.ctx.tools.get("read", proxy.child) !== proxy.definition
                    || proxy.parent.ctx.agents.get(proxy.parent.id) !== proxy.parent || proxy.child.ctx.agents.get(proxy.child.id) !== proxy.child
                    || !snapshot.scopes.some(scope => scope.ctx === proxy.proxyScope.ctx) || !snapshot.scopes.some(scope => scope.ctx === proxy.standingScope.ctx)
                    || proxy.contributions.some(contribution => !snapshot.policies.some(policy => policy.scope === contribution.scope.ctx
                        && policy.reference === contribution.reference && policy.stage === contribution.stage)))
                    throw new LegacyReadUnavailable("composition-unavailable");
                const effectiveScopes = new Set(scopeChainOf(proxy.child));
                for (const stage of ["pre", "around"]) {
                    const contribution = proxy.contributions.find(value => value.stage === stage);
                    const adapter = snapshot.policies.find(policy => policy.reference === contribution.reference && policy.scope === contribution.scope.ctx);
                    if (snapshot.policies.some(policy => {
                        const scope = scopeOf(policy.scope);
                        return policy.stage === stage && policy.side !== "parent" && policy.reference !== contribution.reference
                            && (scope === undefined || effectiveScopes.has(scope)) && policy.order <= adapter.order;
                    }))
                        throw new LegacyReadUnavailable("composition-unavailable");
                }
            }
            composition.publishGeneration(snapshot, composition.view().generation);
        },
        async dispose(nativeDrain) {
            // Calling close synchronously revokes before either async drain is entered.
            const leases = composition.closeForDispose("host-dispose");
            await leases;
            await nativeDrain();
            for (const proxy of children.values())
                await proxy.releaseAfterChildDispose();
            children.clear();
        },
    };
}
//# sourceMappingURL=legacy-read-host.js.map