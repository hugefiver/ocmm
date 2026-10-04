import { isDsmmRoleId } from "./roles.js";
import { applyModelRoute, effectiveRoleFallbackRoutes, establishRolePolicy, persistedRoleRoute, sameModelRoute, takeAdmittedRecoveryRoute } from "./role-routing.js";
import { resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
export function isDeepseekV4ProRoute(config) {
    return config.provider.toLowerCase() === "deepseek-official" && config.model.toLowerCase() === "deepseek-v4-pro";
}
export function isDeepseekFlashRoute(config) {
    return ["deepseek-official", "deepseek-account"].includes(config.provider.toLowerCase())
        && config.model.toLowerCase() === "deepseek-flash";
}
export function desiredDeepseekEffort(settings, preset, route = "v4-pro") {
    const maxPresets = route === "flash" ? settings.deepseekFlashMaxReasoningPresets : settings.deepseekV4ProMaxReasoningPresets;
    return preset !== undefined && maxPresets.some((configuredPreset) => configuredPreset === preset)
        ? "max"
        : route === "flash" ? settings.deepseekFlashDefaultReasoningEffort : settings.deepseekV4ProDefaultReasoningEffort;
}
export function selectAdvertisedEffort(desired, reasoning) {
    if (!reasoning)
        return undefined;
    const advertised = new Set(reasoning.efforts.map((effort) => effort.id));
    const fallback = reasoning.defaultEffort !== undefined && advertised.has(reasoning.defaultEffort) ? reasoning.defaultEffort : undefined;
    if (desired === "max") {
        if (advertised.has("max"))
            return "max";
        if (advertised.has("high"))
            return "high";
        return fallback;
    }
    return advertised.has(desired) ? desired : fallback;
}
export function registerModelRouting(ctx, controller, getSettings) {
    const installedContexts = new WeakSet();
    const install = (readyCtx) => {
        if (installedContexts.has(readyCtx) || readyCtx.on === undefined)
            return;
        installedContexts.add(readyCtx);
        let dispose;
        try {
            dispose = readyCtx.on("agent/request", async (frame, next) => {
                let downstream = await next();
                const settings = getSettings();
                const admitted = takeAdmittedRecoveryRoute(frame);
                const active = controller.active(frame.agent, settings.defaultActive);
                const role = resolveEffectiveDsmmRole(frame.agent, settings, active);
                const policy = role === undefined ? undefined : settings.roleRouting[role];
                const primary = policy?.primary;
                const identity = await establishRolePolicy(frame, settings, role);
                if (admitted !== undefined) {
                    downstream = applyModelRoute(downstream, admitted);
                    if (admitted.reasoningEffort !== undefined || primary !== undefined
                        || (role !== undefined && settings.roleRouting[role]?.fallbackRoutes !== undefined))
                        return downstream;
                }
                const fallbacks = effectiveRoleFallbackRoutes(settings, role);
                if (primary !== undefined)
                    return applyModelRoute(downstream, persistedRoleRoute(frame, primary, fallbacks, identity) ?? primary);
                if (settings.runtimeRecovery.enabled && policy?.fallbackRoutes !== undefined) {
                    const accepted = persistedRoleRoute(frame, undefined, fallbacks, identity);
                    if (accepted !== undefined)
                        return applyModelRoute(downstream, accepted);
                }
                // Named fallback efforts are native policy IDs, never legacy calibration inputs.
                if (fallbacks.some((fallback) => fallback.reasoningEffort !== undefined
                    && sameModelRoute(fallback, downstream) && fallback.reasoningEffort === downstream.reasoningEffort))
                    return downstream;
                const route = isDeepseekV4ProRoute(downstream) ? "v4-pro" : isDeepseekFlashRoute(downstream) ? "flash" : undefined;
                if (route === undefined)
                    return downstream;
                const calibration = route === "flash" ? settings.deepseekFlashCalibration : settings.deepseekV4ProCalibration;
                if (calibration === "off")
                    return downstream;
                const preset = resolveSelectedAgentPreset(frame.agent?.session);
                const inScope = active || isDsmmRoleId(preset);
                if (!inScope)
                    return downstream;
                if (calibration === "auto" && downstream.reasoningEffort !== undefined)
                    return downstream;
                const desired = desiredDeepseekEffort(settings, preset, route);
                let selected;
                try {
                    const agentContext = frame.agent.ctx;
                    const llm = agentContext?.get?.("llm")
                        ?? (readyCtx.get !== undefined ? readyCtx.get("llm") : readyCtx.llm);
                    const modelInfo = await llm?.resolveModelInfo(downstream.provider, downstream.model, frame.signal);
                    selected = selectAdvertisedEffort(desired, modelInfo?.reasoning);
                }
                catch {
                    warnUnavailable(readyCtx, ctx, desired, `${downstream.provider}/${downstream.model}`);
                    return downstream;
                }
                if (selected === undefined) {
                    warnUnavailable(readyCtx, ctx, desired, `${downstream.provider}/${downstream.model}`);
                    return downstream;
                }
                return { ...downstream, reasoningEffort: selected };
            }, { prepend: true });
        }
        catch (error) {
            installedContexts.delete(readyCtx);
            throw error;
        }
        readyCtx.effect?.(() => () => {
            installedContexts.delete(readyCtx);
            if (typeof dispose === "function")
                dispose();
        });
    };
    // Current DSH owns LLM services in Agent realms, invisible to Host injection.
    if (ctx.get !== undefined) {
        install(ctx);
        return;
    }
    if (ctx.inject !== undefined) {
        ctx.inject(["llm"], install);
        return;
    }
    if (Object.prototype.hasOwnProperty.call(ctx, "llm") && Object.prototype.hasOwnProperty.call(ctx, "on"))
        install(ctx);
}
function warnUnavailable(readyCtx, rootCtx, desired, modelRoute) {
    try {
        (readyCtx.logger ?? rootCtx.logger)?.warn(`dsmm could not select advertised reasoning effort for ${modelRoute}; desired ${desired}`);
    }
    catch {
        // Warning emission is diagnostic-only and must not alter routing fail-open behavior.
    }
}
//# sourceMappingURL=model-routing.js.map