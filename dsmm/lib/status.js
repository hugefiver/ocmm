import { classifyModelFamily } from "./model-family.js";
import { isDeepseekV4ProRoute } from "./model-routing.js";
import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
export const DSMM_STATUS_VERSION = 1;
export function createDsmmStatusSnapshot(input) {
    const { agent, settings, modeActive } = input;
    const selectedPreset = resolveSelectedAgentPreset(agent.session);
    const dsmmPreset = isDsmmRoleId(selectedPreset);
    const inScope = modeActive || dsmmPreset;
    const selectedRoute = resolveRoute(agent);
    const family = classifyModelFamily({
        providerID: selectedRoute.provider,
        modelID: selectedRoute.model
    });
    const deepseekV4Pro = selectedRoute.provider !== undefined
        && selectedRoute.model !== undefined
        && isDeepseekV4ProRoute({ provider: selectedRoute.provider, model: selectedRoute.model });
    return {
        version: DSMM_STATUS_VERSION,
        mode: {
            name: settings.modeName,
            active: modeActive,
            ...(selectedPreset === undefined ? {} : { selectedPreset }),
            dsmmPreset,
            inScope
        },
        route: {
            ...(selectedRoute.provider === undefined ? {} : { provider: selectedRoute.provider }),
            ...(selectedRoute.model === undefined ? {} : { model: selectedRoute.model }),
            family,
            deepseekV4Pro,
            ...(selectedRoute.reasoningEffort === undefined ? {} : { currentReasoningEffort: selectedRoute.reasoningEffort })
        },
        calibration: resolveCalibration({
            calibration: settings.deepseekV4ProCalibration,
            inScope,
            deepseekV4Pro,
            policyEffort: resolvePolicyEffort(settings, selectedPreset),
            currentReasoningEffort: selectedRoute.reasoningEffort
        }),
        runtimeRecovery: {
            enabled: settings.runtimeRecovery.enabled,
            applies: settings.runtimeRecovery.enabled && inScope,
            fallbackRouteCount: settings.runtimeRecovery.fallbackRoutes.length,
            maxFallbackAttempts: settings.runtimeRecovery.maxFallbackAttempts,
            idleContinuation: {
                enabled: settings.runtimeRecovery.idleContinuation.enabled,
                maxContinuations: settings.runtimeRecovery.idleContinuation.maxContinuations
            }
        },
        effectiveSettings: copySettings(settings)
    };
}
export function formatDsmmStatus(snapshot) {
    const scope = snapshot.mode.dsmmPreset && snapshot.mode.selectedPreset
        ? `${snapshot.mode.selectedPreset} preset`
        : snapshot.mode.inScope
            ? "active deepwork"
            : "out of scope";
    const provider = snapshot.route.provider ?? "unavailable";
    const model = snapshot.route.model ?? "unavailable";
    const policyEffort = snapshot.calibration.policyEffort ?? "not applicable";
    const currentReasoningEffort = snapshot.route.currentReasoningEffort ?? "provider default";
    return [
        "DSMM status",
        `Mode: ${snapshot.mode.active ? "active" : "inactive"} (${snapshot.mode.name})`,
        `Scope: ${scope}`,
        `Route: ${provider}/${model} [${snapshot.route.family}]`,
        `Reasoning: ${snapshot.calibration.mode}; policy=${policyEffort}; current=${currentReasoningEffort}; action=${snapshot.calibration.action}`,
        `Runtime recovery: ${snapshot.runtimeRecovery.enabled ? "enabled" : "disabled"}; applies=${snapshot.runtimeRecovery.applies ? "yes" : "no"}; fallbacks=${snapshot.runtimeRecovery.fallbackRouteCount}; max attempts=${snapshot.runtimeRecovery.maxFallbackAttempts}`,
        `Idle continuation: ${snapshot.runtimeRecovery.idleContinuation.enabled ? "enabled" : "disabled"}; max=${snapshot.runtimeRecovery.idleContinuation.maxContinuations}`,
        "Effective settings: use /dsmm-status json for the normalized snapshot"
    ].join("\n");
}
function resolveRoute(agent) {
    const requestHeader = agent.session.requestHeader?.();
    if (requestHeader !== undefined) {
        const config = requestHeader?.config;
        return {
            provider: readString(config?.provider),
            model: readString(config?.model),
            reasoningEffort: readString(config?.reasoningEffort)
        };
    }
    return {
        provider: readString(agent.options?.provider),
        model: readString(agent.options?.model)
    };
}
function readString(value) {
    return typeof value === "string" ? value : undefined;
}
function resolvePolicyEffort(settings, selectedPreset) {
    return isDsmmRoleId(selectedPreset) && settings.deepseekV4ProMaxReasoningPresets.includes(selectedPreset)
        ? "max"
        : settings.deepseekV4ProDefaultReasoningEffort;
}
function resolveCalibration(input) {
    if (input.calibration === "off") {
        return { mode: input.calibration, applies: false, action: "disabled" };
    }
    if (!input.inScope) {
        return { mode: input.calibration, applies: false, action: "out-of-scope" };
    }
    if (!input.deepseekV4Pro) {
        return { mode: input.calibration, applies: false, action: "non-target-route" };
    }
    if (input.calibration === "auto") {
        return input.currentReasoningEffort === undefined
            ? { mode: input.calibration, applies: true, policyEffort: input.policyEffort, action: "fill-missing" }
            : { mode: input.calibration, applies: true, policyEffort: input.policyEffort, action: "preserve-explicit" };
    }
    return { mode: input.calibration, applies: true, policyEffort: input.policyEffort, action: "enforce" };
}
function copySettings(settings) {
    return {
        modeName: settings.modeName,
        defaultActive: settings.defaultActive,
        promptOrder: settings.promptOrder,
        deepseekV4ProCalibration: settings.deepseekV4ProCalibration,
        deepseekV4ProDefaultReasoningEffort: settings.deepseekV4ProDefaultReasoningEffort,
        deepseekV4ProMaxReasoningPresets: [...settings.deepseekV4ProMaxReasoningPresets],
        skills: { ...settings.skills },
        roles: { ...settings.roles },
        presets: { ...settings.presets },
        workflow: { ...settings.workflow },
        guards: {
            ...settings.guards,
            toolOutputTruncation: { ...settings.guards.toolOutputTruncation },
            questionLabelHelper: { ...settings.guards.questionLabelHelper }
        },
        runtimeRecovery: {
            ...settings.runtimeRecovery,
            retryOnStatusCodes: [...settings.runtimeRecovery.retryOnStatusCodes],
            retryOnCodes: [...settings.runtimeRecovery.retryOnCodes],
            fallbackRoutes: settings.runtimeRecovery.fallbackRoutes.map((route) => ({ ...route })),
            idleContinuation: { ...settings.runtimeRecovery.idleContinuation }
        },
        lsp: {
            ...settings.lsp,
            args: [...settings.lsp.args],
            env: { ...settings.lsp.env }
        }
    };
}
//# sourceMappingURL=status.js.map