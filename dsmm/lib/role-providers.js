import { DSMM_ROLE_IDS } from "./roles.js";
export function roleProviderName(role) {
    return `dsmm-role-${role.slice("dsmm-".length)}`;
}
export function roleFromProviderName(provider) {
    return DSMM_ROLE_IDS.find((role) => role !== "dsmm-orchestrator" && roleProviderName(role) === provider);
}
const SPAWN_CAPABILITIES = Object.freeze({ agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true });
function supportedSpawn(provider) {
    return provider !== undefined && provider.name === "spawn" && typeof provider.start === "function"
        && provider.inheritsParentContext === false && provider.agentRouteDefaults === undefined
        && Object.keys(SPAWN_CAPABILITIES).every((key) => provider.capabilities?.[key] === true);
}
/** Only the native outer start owns descriptors, capability admission and returned runs. */
export function registerRoleProviders(ctx, getSettings) {
    const installed = new WeakSet();
    const install = (readyCtx) => {
        const registry = readyCtx.get?.("subagents")
            ?? (readyCtx.get === undefined ? readyCtx.subagents : undefined);
        if (registry === undefined || installed.has(registry))
            return;
        const disposers = [];
        installed.add(registry);
        try {
            const settings = getSettings();
            for (const role of DSMM_ROLE_IDS) {
                if (role === "dsmm-orchestrator" || !settings.roles[role])
                    continue;
                let active = true;
                const dispose = registry.registerProvider({
                    name: roleProviderName(role), capabilities: SPAWN_CAPABILITIES, inheritsParentContext: false,
                    start(request) {
                        if (!active)
                            return Promise.reject(new Error("dsmm role provider is disposed"));
                        const spawn = registry.getProvider("spawn");
                        if (!supportedSpawn(spawn))
                            return Promise.reject(new Error("dsmm role provider requires the supported native spawn capabilities"));
                        return spawn.start(request);
                    }
                });
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