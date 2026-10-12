import { SubagentError } from "@deepseek-ai/dsh-subagent";
import { DSMM_ROLE_IDS, roleProviderName } from "./roles.js";
export { roleProviderName } from "./roles.js";
import { currentRoleInvocation, duringRoleInvocation, invocationAgentOptions, resolveRoleInvocation } from "./role-invocation.js";
export function roleFromProviderName(provider) {
    return DSMM_ROLE_IDS.find((role) => role !== "dsmm-orchestrator" && roleProviderName(role) === provider);
}
const NO_CAPABILITIES = Object.freeze({ agentOptions: false, outputSchema: false, depthLimit: false, toolFilter: false, persona: false });
function supportedSpawn(provider) {
    return provider !== undefined && provider.name === "spawn" && typeof provider.start === "function"
        && provider.inheritsParentContext === false && provider.agentRouteDefaults === undefined;
}
export async function roleAgentOptions(parent, role, settings, signal, explicit) {
    const invocation = currentRoleInvocation(parent, role) ?? await resolveRoleInvocation(parent, role, settings, signal, {}, explicit);
    return invocationAgentOptions(invocation, explicit);
}
/** Only the native outer start owns descriptors, capability admission and returned runs. */
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
                        if (!supportedSpawn(spawn) || spawn.prepareContinuable === undefined)
                            return undefined;
                        return async (request) => {
                            if (!active || registry.getProvider("spawn") !== spawn)
                                throw new SubagentError("DSMM native continuable provider changed", "NO_PROVIDER");
                            const admitted = getSettings(request.parent);
                            if (!admitted.modules.deepwork.enabled || !admitted.roles[role])
                                throw new SubagentError("DSMM module or role is disabled", "UNAUTHORIZED");
                            if (!admitted.subagents.enableRunInBackground || admitted.subagents.backgroundMode !== "continuable")
                                throw new SubagentError("DSMM continuable delegation requires explicit admitted opt-in", "UNAUTHORIZED");
                            const preparing = policy?.prepareContinuable(request.parent, role, request.signal);
                            const invocation = currentRoleInvocation(request.parent, role);
                            request.signal.throwIfAborted();
                            if (!active || registry.getProvider("spawn") !== spawn)
                                throw new SubagentError("DSMM continuable provider changed during preflight", "NO_PROVIDER");
                            if (preparing !== undefined)
                                policy.recordContinuableCreation(request.sessionId, request.parent, role, invocation, preparing.epoch, request.signal);
                            return spawn.prepareContinuable(request);
                        };
                    },
                    async start(request) {
                        if (!active)
                            throw new Error("dsmm role provider is disposed");
                        const spawn = registry.getProvider("spawn");
                        if (!supportedSpawn(spawn))
                            throw new Error("dsmm role provider requires the supported native spawn capabilities");
                        if (request.descriptor.mode !== "one-shot" || request.descriptor.provider !== roleProviderName(role))
                            throw new SubagentError("DSMM alias requires its exact native descriptor", "UNAUTHORIZED");
                        const admission = policy?.assertDelegation(request.parent, role);
                        for (const [key, value] of Object.entries({ agentOptions: request.agentOptions, outputSchema: request.outputSchema, depthLimit: request.maxDepth, toolFilter: request.toolFilter, persona: request.persona })) {
                            if (value !== undefined && !spawn.capabilities[key])
                                throw new SubagentError(`DSMM spawn does not support ${key}`, "UNSUPPORTED_CAPABILITY");
                        }
                        const parentSettings = getSettings(request.parent);
                        if (!parentSettings.modules.deepwork.enabled || !parentSettings.roles[role])
                            throw new Error("dsmm role provider is disabled by deployment configuration");
                        const invocation = currentRoleInvocation(request.parent, role)
                            ?? await resolveRoleInvocation(request.parent, role, parentSettings, request.signal, {}, request.agentOptions);
                        const agentOptions = invocationAgentOptions(invocation, request.agentOptions);
                        request.signal.throwIfAborted();
                        if (!active || registry.getProvider("spawn") !== spawn)
                            throw new Error("dsmm role spawn provider changed during route validation; retry delegation");
                        if (admission !== undefined && policy.assertDelegation(request.parent, role).epoch !== admission.epoch)
                            throw new SubagentError("DSMM parent admission changed during route preflight", "UNAUTHORIZED");
                        // Preserve the native descriptor, authority filters and lifecycle;
                        // this alias owns only profile-derived route defaults and preflight.
                        const routed = agentOptions === request.agentOptions ? request : { ...request, agentOptions };
                        const ceiling = parentSettings.subagents.maxDepth;
                        if (request.maxDepth !== undefined && ceiling !== undefined && request.maxDepth > ceiling)
                            throw new SubagentError("DSMM request exceeds the admitted parent depth ceiling", "UNAUTHORIZED");
                        const maxDepth = request.maxDepth ?? registry.resolveMaxDepth?.(ceiling);
                        if (maxDepth !== undefined && !spawn.capabilities.depthLimit)
                            throw new SubagentError("DSMM spawn cannot enforce the native depth limit", "UNSUPPORTED_CAPABILITY");
                        const resolved = maxDepth === undefined ? routed : { ...routed, maxDepth };
                        if (resolved.agentOptions !== undefined && !spawn.capabilities.agentOptions)
                            throw new SubagentError("DSMM spawn cannot accept the configured or selected child route", "UNSUPPORTED_CAPABILITY");
                        let admittedChild;
                        const run = await duringRoleInvocation(request.parent, invocation, () => policy === undefined ? spawn.start(resolved)
                            : policy.duringDelegation(request.parent, role, () => spawn.start(resolved), request.toolFilter, maxDepth, agent => { admittedChild = agent; }));
                        // Public holder boundary: revoke this exact residency before opaque native teardown.
                        return policy === undefined ? run : { ...run, dispose() {
                                const child = run.localAgent ?? admittedChild;
                                if (child !== undefined)
                                    policy.revokeResidency(child);
                                return run.dispose();
                            } };
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