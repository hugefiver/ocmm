import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { DSMM_ROLE_IDS, roleProviderName } from "./roles.js";
export { roleProviderName } from "./roles.js";
import { currentRoleInvocation, invocationAgentOptions, resolveRoleInvocation } from "./role-invocation.js";
import { currentManagedCreation } from "./agent-registry.js";
export function roleFromProviderName(provider) {
    return DSMM_ROLE_IDS.find((role) => role !== "dsmm-orchestrator" && roleProviderName(role) === provider);
}
const NO_CAPABILITIES = Object.freeze({ agentOptions: false, outputSchema: false, depthLimit: false, agentPreset: false });
function supportedSpawn(provider) {
    return provider !== undefined && provider.name === "spawn" && typeof provider.prepareContinuable === "function"
        && provider.inheritsParentContext === false && provider.agentRouteDefaults === undefined;
}
export async function roleAgentOptions(parent, role, settings, signal, explicit) {
    const invocation = currentRoleInvocation(parent, role) ?? await resolveRoleInvocation(parent, role, settings, signal, {}, explicit);
    return invocationAgentOptions(invocation, explicit);
}
/** The native manager owns descriptors, capability admission and activations. */
export function registerRoleProviders(ctx, getSettings, getDeploymentSettings = getSettings, policy) {
    const installed = new WeakSet();
    const install = (readyCtx) => {
        const registry = readyCtx.get?.("subagents")
            ?? (readyCtx.get === undefined ? readyCtx.subagents : undefined);
        if (registry === undefined || installed.has(registry))
            return;
        const disposers = [];
        installed.add(registry);
        try {
            const settings = getDeploymentSettings();
            if (!settings.modules.deepwork.enabled)
                return;
            for (const role of DSMM_ROLE_IDS) {
                if (role === "dsmm-orchestrator" || !settings.roles[role])
                    continue;
                let active = true;
                const dispose = registry.registerProvider({
                    name: roleProviderName(role),
                    get capabilities() { const spawn = registry.getProvider("spawn"); return supportedSpawn(spawn) ? spawn.capabilities : NO_CAPABILITIES; },
                    inheritsParentContext: false,
                    get prepareContinuable() {
                        const spawn = registry.getProvider("spawn");
                        return async (request) => {
                            if (!supportedSpawn(spawn) || spawn.prepareContinuable === undefined)
                                throw new SubagentError("DSMM requires a local spawn provider", "UNSUPPORTED_CAPABILITY");
                            if (!active || registry.getProvider("spawn") !== spawn)
                                throw new SubagentError("DSMM native continuable provider changed", "NO_PROVIDER");
                            const admitted = getSettings(request.parent);
                            if (!admitted.modules.deepwork.enabled || !admitted.roles[role])
                                throw new SubagentError("DSMM module or role is disabled", "UNAUTHORIZED");
                            const operation = currentManagedCreation();
                            if (operation?.kind !== "fresh" || operation.parent !== request.parent || operation.childId !== request.sessionId)
                                throw new SubagentError("DSMM role requires its managed creation operation", "UNAUTHORIZED");
                            if (operation.delegationMode === "continuable" && (!admitted.subagents.enableRunInBackground || admitted.subagents.backgroundMode !== "continuable"))
                                throw new SubagentError("DSMM continuable delegation requires explicit admitted opt-in", "UNAUTHORIZED");
                            const preparing = policy?.prepareContinuable(request.parent, role, request.signal);
                            const invocation = currentRoleInvocation(request.parent, role);
                            request.signal.throwIfAborted();
                            if (!active || registry.getProvider("spawn") !== spawn)
                                throw new SubagentError("DSMM continuable provider changed during preflight", "NO_PROVIDER");
                            if (preparing !== undefined)
                                policy.recordContinuableCreation(request.sessionId, request.parent, role, invocation, preparing.epoch, request.signal);
                            const prepared = await spawn.prepareContinuable(request);
                            if (prepared.seed !== undefined)
                                throw new SubagentError("DSMM spawn cannot inherit parent history", "UNSUPPORTED_CAPABILITY");
                            return prepared;
                        };
                    }
                });
                const provider = registry.getProvider(roleProviderName(role));
                if (provider !== undefined)
                    policy?.captureProvider(provider);
                disposers.push(() => { active = false; dispose(); });
            }
            readyCtx.effect?.(() => () => {
                for (const dispose of disposers.reverse())
                    dispose();
                installed.delete(registry);
            });
        }
        catch (error) {
            for (const dispose of disposers.reverse())
                dispose();
            installed.delete(registry);
            throw error;
        }
    };
    if (ctx.inject !== undefined)
        ctx.inject(["subagents"], install);
    else
        install(ctx);
}
//# sourceMappingURL=role-providers.js.map