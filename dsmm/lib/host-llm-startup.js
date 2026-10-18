import { Context, symbols } from "@deepseek-ai/cordis";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import { DsmmAwareLlmRuntime } from "./host-llm.js";
import { createDsmmRoleLlmOwner } from "./role-llm-runtime.js";
/**
 * Host-only cold composition. The profile must disable its original agent-loop
 * row and remove only this owner's routes from llm-pi-ai before mounting entries.
 * The standard MAIN, registries, persistence and other provider owners remain mounted.
 */
export function createDsmmLlmColdStartup(options) {
    let host;
    let failure;
    let mounted;
    let provider;
    const dependencies = [...AgentLoop.inject, "dsmmProfileRuntime", "dsmmNativeAdmission", "sessionPersistence", "dsmmLlmProviderOwner"];
    const builtin = "dsmm-llm-provider-owner";
    return {
        patches: [{ id: "agent-loop", disabled: true }, { insert: [{ id: options.provider.settingsNamespace, name: `cordis:${builtin}`, config: options.provider.config }] }],
        async prepare(ctx) {
            const loader = ctx.get("loader");
            if (host !== undefined || ctx.get("agentLoop") !== undefined || loader === undefined || ctx.fiber.entry !== undefined || [...ctx.loader.entries()].length > 0)
                throw new Error("DSMM LLM composition must be installed exactly once before the Loader tree mounts");
            const profile = ctx.get("profileContext");
            if (profile === null || typeof profile !== "object" || !("overlays" in profile) || !Array.isArray(profile.overlays)
                || !profile.overlays.some((patch) => patch !== null && typeof patch === "object" && "insert" in patch && Array.isArray(patch.insert)
                    && patch.insert.some((entry) => entry !== null && typeof entry === "object" && "id" in entry && "name" in entry && entry.id === options.provider.settingsNamespace && entry.name === `cordis:${builtin}`))) {
                throw new Error("DSMM LLM startup patches must be included in the authoritative profileContext.overlays before readProfilePatches");
            }
            host = ctx;
            const { createDsmmPiAiProviderPlugin } = await import("./native-pi-ai-wire.js");
            ctx.loader.builtins[builtin] = { default: createDsmmPiAiProviderPlugin(options.provider, owner => { provider = owner; }) };
            ctx.inject(dependencies, async (scope) => {
                try {
                    if (scope.get("agentLoop") !== undefined || provider === undefined)
                        throw new Error("DSMM LLM cold ownership was not established before AgentLoop");
                    const admission = scope.get("dsmmNativeAdmission");
                    if (admission === undefined || admission.lifetime.signal.aborted)
                        throw new Error("DSMM admission guards are not ready");
                    const original = scope.llm;
                    const stock = Reflect.get(original, symbols.original) ?? original;
                    const isolated = scope.isolate("llm");
                    const owner = await (options.establish ?? createDsmmRoleLlmOwner)(isolated, provider);
                    const llm = new DsmmAwareLlmRuntime(isolated, stock, owner);
                    const loop = new AgentLoop(isolated, options.agentLoop);
                    mounted = Object.freeze({ loop, llm, provider });
                    scope.effect(() => () => { mounted = undefined; });
                }
                catch (error) {
                    failure = error;
                    throw error;
                }
            });
        },
        assertReady() {
            if (failure !== undefined)
                throw failure;
            if (mounted === undefined) {
                const missing = dependencies.filter(key => host?.get(key) === undefined);
                throw new Error(`DSMM LLM cold startup is not ready; missing dependencies: ${missing.join(", ") || "provider or admission establishment"}`);
            }
            return mounted;
        },
    };
}
//# sourceMappingURL=host-llm-startup.js.map