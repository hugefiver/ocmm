import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
export function isDeepseekV4ProRoute(config) {
    return config.provider.toLowerCase() === "deepseek-official" && config.model.toLowerCase() === "deepseek-v4-pro";
}
export function desiredDeepseekEffort(settings, preset) {
    return preset !== undefined && settings.deepseekV4ProMaxReasoningPresets.some((configuredPreset) => configuredPreset === preset)
        ? "max"
        : settings.deepseekV4ProDefaultReasoningEffort;
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
const DEEPSEEK_V4_PRO_ROUTE = "deepseek-official/deepseek-v4-pro";
export function registerModelRouting(ctx, controller, getSettings) {
    const installedContexts = new WeakSet();
    const install = (readyCtx) => {
        if (installedContexts.has(readyCtx) || readyCtx.on === undefined)
            return;
        installedContexts.add(readyCtx);
        let dispose;
        try {
            dispose = readyCtx.on("agent/request", async (frame, next) => {
                const downstream = await next();
                const settings = getSettings();
                if (settings.deepseekV4ProCalibration === "off")
                    return downstream;
                const preset = resolveSelectedAgentPreset(frame.agent?.session);
                const inScope = controller.active(frame.agent, settings.defaultActive) || isDsmmRoleId(preset);
                if (!inScope || !isDeepseekV4ProRoute(downstream))
                    return downstream;
                if (settings.deepseekV4ProCalibration === "auto" && downstream.reasoningEffort !== undefined)
                    return downstream;
                const desired = desiredDeepseekEffort(settings, preset);
                let selected;
                try {
                    const modelInfo = await readyCtx.llm?.resolveModelInfo(downstream.provider, downstream.model, frame.signal);
                    selected = selectAdvertisedEffort(desired, modelInfo?.reasoning);
                }
                catch {
                    warnUnavailable(readyCtx, ctx, desired);
                    return downstream;
                }
                if (selected === undefined) {
                    warnUnavailable(readyCtx, ctx, desired);
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
    if (ctx.inject !== undefined) {
        ctx.inject(["llm"], install);
        return;
    }
    if (Object.prototype.hasOwnProperty.call(ctx, "llm") && Object.prototype.hasOwnProperty.call(ctx, "on"))
        install(ctx);
}
function warnUnavailable(readyCtx, rootCtx, desired) {
    try {
        (readyCtx.logger ?? rootCtx.logger)?.warn(`dsmm could not select advertised reasoning effort for ${DEEPSEEK_V4_PRO_ROUTE}; desired ${desired}`);
    }
    catch {
        // Warning emission is diagnostic-only and must not alter routing fail-open behavior.
    }
}
//# sourceMappingURL=model-routing.js.map