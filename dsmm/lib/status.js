import { classifyModelFamily } from "./model-family.js";
import { isDeepseekFlashRoute, isDeepseekV4ProRoute } from "./model-routing.js";
import { isDsmmRoleId } from "./roles.js";
import { effectiveRoleFallbackRoutes, persistedRoleRoute, rolePolicyIdentity } from "./role-routing.js";
import { resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
export const DSMM_STATUS_VERSION = 1;
export function createDsmmStatusSnapshot(input) {
    const { agent, settings, modeActive } = input;
    const selectedPreset = resolveSelectedAgentPreset(agent.session);
    const dsmmPreset = isDsmmRoleId(selectedPreset);
    let role;
    let invalidDescriptor = false;
    try {
        role = resolveEffectiveDsmmRole(agent, settings, modeActive);
    }
    catch {
        invalidDescriptor = true;
    }
    const inScope = modeActive || role !== undefined;
    const policy = role === undefined ? undefined : settings.roleRouting[role];
    const fallbacks = invalidDescriptor ? [] : effectiveRoleFallbackRoutes(settings, role);
    const selectedRoute = resolveRoute(agent);
    const family = classifyModelFamily({
        providerID: selectedRoute.provider,
        modelID: selectedRoute.model
    });
    const deepseekV4Pro = selectedRoute.provider !== undefined
        && selectedRoute.model !== undefined
        && isDeepseekV4ProRoute({ provider: selectedRoute.provider, model: selectedRoute.model });
    const deepseekFlash = selectedRoute.provider !== undefined && selectedRoute.model !== undefined
        && isDeepseekFlashRoute({ provider: selectedRoute.provider, model: selectedRoute.model });
    let acceptedRoleRoute;
    if (settings.runtimeRecovery.enabled && policy?.fallbackRoutes !== undefined) {
        acceptedRoleRoute = persistedRoleRoute({ agent }, policy.primary, fallbacks, rolePolicyIdentity(settings, role));
    }
    const exactRouting = policy?.primary !== undefined || acceptedRoleRoute !== undefined
        || fallbacks.some((route) => route.reasoningEffort !== undefined && route.provider === selectedRoute.provider
            && route.model === selectedRoute.model && route.reasoningEffort === selectedRoute.reasoningEffort);
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
            deepseekFlash,
            ...(selectedRoute.reasoningEffort === undefined ? {} : { currentReasoningEffort: selectedRoute.reasoningEffort })
        },
        calibration: exactRouting ? {
            mode: deepseekFlash ? settings.deepseekFlashCalibration : settings.deepseekV4ProCalibration,
            applies: false, action: "fixed-role-policy"
        } : resolveCalibration({
            calibration: deepseekFlash ? settings.deepseekFlashCalibration : settings.deepseekV4ProCalibration,
            inScope,
            targetRoute: deepseekV4Pro || deepseekFlash,
            policyEffort: resolvePolicyEffort(settings, selectedPreset, deepseekFlash),
            currentReasoningEffort: selectedRoute.reasoningEffort
        }),
        rolePolicy: {
            ...(role === undefined ? {} : { role }),
            applies: policy?.primary !== undefined || (settings.runtimeRecovery.enabled && policy?.fallbackRoutes !== undefined),
            ...(policy?.primary === undefined ? {} : { primary: { ...policy.primary } }),
            fallbackRoutes: fallbacks.map((route) => ({ ...route })),
            fallbackSource: !settings.runtimeRecovery.enabled ? "disabled" : policy?.fallbackRoutes === undefined ? "global" : "role",
            ...(invalidDescriptor ? { diagnostic: "invalid-child-descriptor" } : {})
        },
        runtimeRecovery: {
            enabled: settings.runtimeRecovery.enabled,
            applies: settings.runtimeRecovery.enabled && inScope && !invalidDescriptor,
            fallbackRouteCount: fallbacks.length,
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
    const scope = snapshot.rolePolicy.role !== undefined && snapshot.rolePolicy.role !== "dsmm-orchestrator"
        && snapshot.rolePolicy.role !== snapshot.mode.selectedPreset
        ? `${snapshot.rolePolicy.role} role`
        : snapshot.mode.inScope && snapshot.mode.dsmmPreset && snapshot.mode.selectedPreset
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
        `Workflow policy: ${snapshot.effectiveSettings.workflow.policy}`,
        `Route: ${provider}/${model} [${snapshot.route.family}]`,
        `Role policy: ${snapshot.rolePolicy.role ?? "none"}; primary=${snapshot.rolePolicy.primary === undefined ? "inherit" : `${snapshot.rolePolicy.primary.provider}/${snapshot.rolePolicy.primary.model}`}; fallbacks=${snapshot.rolePolicy.fallbackSource}`,
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
        model: readString(agent.options?.model),
        reasoningEffort: readString(agent.options?.reasoningEffort)
    };
}
function readString(value) {
    return typeof value === "string" ? value : undefined;
}
function resolvePolicyEffort(settings, selectedPreset, flash) {
    const presets = flash ? settings.deepseekFlashMaxReasoningPresets : settings.deepseekV4ProMaxReasoningPresets;
    return isDsmmRoleId(selectedPreset) && presets.includes(selectedPreset)
        ? "max"
        : flash ? settings.deepseekFlashDefaultReasoningEffort : settings.deepseekV4ProDefaultReasoningEffort;
}
function resolveCalibration(input) {
    if (input.calibration === "off") {
        return { mode: input.calibration, applies: false, action: "disabled" };
    }
    if (!input.inScope) {
        return { mode: input.calibration, applies: false, action: "out-of-scope" };
    }
    if (!input.targetRoute) {
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
        deepseekFlashCalibration: settings.deepseekFlashCalibration,
        deepseekFlashDefaultReasoningEffort: settings.deepseekFlashDefaultReasoningEffort,
        deepseekFlashMaxReasoningPresets: [...settings.deepseekFlashMaxReasoningPresets],
        skills: { ...settings.skills },
        roles: { ...settings.roles },
        roleRouting: Object.fromEntries(Object.entries(settings.roleRouting).map(([role, policy]) => [role, {
                ...(policy.primary === undefined ? {} : { primary: { ...policy.primary } }),
                ...(policy.fallbackRoutes === undefined ? {} : { fallbackRoutes: policy.fallbackRoutes.map((route) => ({ ...route })) })
            }])),
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