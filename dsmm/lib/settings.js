import Schema from "@deepseek-ai/schemastery";
import { DEFAULT_DSMM_LSP_SETTINGS, resolveLspSettings } from "./lsp.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import { DSMM_SKILL_NAMES } from "./skills.js";
import { DEFAULT_DSMM_RUNTIME_POLICY, normalizeRateLimitOverrides, normalizeRoutingStrategy, normalizeRuntimePolicy, resolveRoleRuntimePolicy } from "./routing-policy.js";
export { resolveRoleRuntimePolicy } from "./routing-policy.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export const DSMM_SETTINGS_NAMESPACE = "dsmm";
export const DSMM_STATUS_COMMAND = "dsmm-status";
export const DEFAULT_DSMM_SETTINGS = {
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    deepseekV4ProDefaultReasoningEffort: "high",
    deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
    deepseekFlashCalibration: "auto",
    deepseekFlashDefaultReasoningEffort: "high",
    deepseekFlashMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"],
    skills: createDefaultSkillSettings(),
    roles: createDefaultRoleSettings(),
    roleRouting: {},
    runtimePolicy: DEFAULT_DSMM_RUNTIME_POLICY,
    presets: {
        materialize: false
    },
    workflow: {
        policy: "risk-based",
        strictGates: true,
        reviewCap: 5,
        finalReviewPolicy: "simple-oracle-complex-reviewer"
    },
    guards: {
        scope: "deepwork-or-dsmm-agent",
        shellCommandSafety: true,
        gitWriteGuard: "ask",
        toolOutputTruncation: {
            enabled: true,
            maxInlineBytes: 12000
        },
        planFormatValidation: true,
        questionLabelHelper: {
            enabled: true,
            maxLabelChars: 30
        },
        todoDisciplineHelper: true
    },
    runtimeRecovery: {
        enabled: false,
        retryOnStatusCodes: [429, 500, 502, 503, 504],
        retryOnCodes: [],
        fallbackRoutes: [],
        maxFallbackAttempts: 2,
        idleContinuation: {
            enabled: false,
            maxContinuations: 3,
            prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
        }
    },
    lsp: DEFAULT_DSMM_LSP_SETTINGS
};
function normalizeModeName(modeName) {
    return modeName === DSMM_STATUS_COMMAND ? DEFAULT_DSMM_SETTINGS.modeName : modeName ?? DEFAULT_DSMM_SETTINGS.modeName;
}
function createDefaultSkillSettings() {
    return Object.fromEntries(DSMM_SKILL_NAMES.map((id) => [id, true]));
}
function createDefaultRoleSettings() {
    return Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, true]));
}
const SKILLS_SCHEMA = Schema.object({
    brainstorming: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills.brainstorming),
    "writing-plans": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["writing-plans"]),
    "requesting-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["requesting-code-review"]),
    "receiving-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["receiving-code-review"]),
    "subagent-driven-development": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["subagent-driven-development"]),
    "dispatching-parallel-agents": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["dispatching-parallel-agents"]),
    "remove-ai-slops": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["remove-ai-slops"])
});
const ROLES_SCHEMA = Schema.object(Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles[id])])));
const MODEL_ROUTE_SCHEMA = Schema.object({
    provider: Schema.string().required(),
    model: Schema.string().required(),
    reasoningEffort: Schema.string()
});
// A dictionary retains unknown keys for fail-closed validation by the resolver.
const ROLE_ROUTING_SCHEMA = Schema.dict(Schema.object({
    primary: Schema.union([Schema.const(undefined), MODEL_ROUTE_SCHEMA]),
    fallbackRoutes: Schema.union([Schema.const(undefined), Schema.array(MODEL_ROUTE_SCHEMA)]),
    strategy: Schema.any(),
    rateLimit: Schema.any()
}).required()).default({});
// Schemastery treats null like an omitted default. Validate the untouched map
// before object defaults can erase an explicitly malformed routing policy.
const ROLE_ROUTING_VALIDATION_SCHEMA = Schema.transform(Schema.any(), (input) => {
    if (!isRoutingRecord(input))
        return input;
    if (isRoutingRecord(input.runtimeRecovery) && Array.isArray(input.runtimeRecovery.fallbackRoutes)) {
        for (const route of input.runtimeRecovery.fallbackRoutes) {
            if (isRoutingRecord(route))
                normalizeRecoveryEffort(route);
        }
    }
    const roleRouting = resolveRoleRouting(input.roleRouting);
    const runtimePolicy = normalizeRuntimePolicy(Object.hasOwn(input, "runtimePolicy") ? validatePresentRuntimePolicy(input.runtimePolicy) : undefined);
    return { roleRouting, runtimePolicy };
});
const PRESETS_SCHEMA = Schema.object({
    materialize: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.presets.materialize),
    root: Schema.string()
});
const FINAL_REVIEW_POLICY_SCHEMA = Schema.union([
    Schema.const("simple-oracle-complex-reviewer"),
    Schema.const("reviewer-only"),
    Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.workflow.finalReviewPolicy);
const WORKFLOW_SCHEMA = Schema.object({
    policy: Schema.union([Schema.const("risk-based"), Schema.const("legacy")]).default(DEFAULT_DSMM_SETTINGS.workflow.policy),
    strictGates: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.workflow.strictGates),
    reviewCap: Schema.number().default(DEFAULT_DSMM_SETTINGS.workflow.reviewCap),
    finalReviewPolicy: FINAL_REVIEW_POLICY_SCHEMA
});
const WORKFLOW_CONFIG_SCHEMA = Schema.object({
    policy: Schema.union([Schema.const("risk-based"), Schema.const("legacy")]),
    strictGates: Schema.boolean(),
    reviewCap: Schema.number(),
    finalReviewPolicy: Schema.union([
        Schema.const("simple-oracle-complex-reviewer"), Schema.const("reviewer-only"), Schema.const("off")
    ])
});
const GUARD_SCOPE_SCHEMA = Schema.union([
    Schema.const("deepwork-or-dsmm-agent"),
    Schema.const("always"),
    Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.guards.scope);
const GIT_WRITE_POLICY_SCHEMA = Schema.union([
    Schema.const("ask"),
    Schema.const("deny"),
    Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.guards.gitWriteGuard);
const TOOL_OUTPUT_TRUNCATION_SCHEMA = Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.enabled),
    maxInlineBytes: Schema.number().default(DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.maxInlineBytes)
});
const QUESTION_LABEL_HELPER_SCHEMA = Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.enabled),
    maxLabelChars: Schema.number().default(DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.maxLabelChars)
});
const GUARDS_SCHEMA = Schema.object({
    scope: GUARD_SCOPE_SCHEMA,
    shellCommandSafety: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.shellCommandSafety),
    gitWriteGuard: GIT_WRITE_POLICY_SCHEMA,
    toolOutputTruncation: TOOL_OUTPUT_TRUNCATION_SCHEMA,
    planFormatValidation: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.planFormatValidation),
    questionLabelHelper: QUESTION_LABEL_HELPER_SCHEMA,
    todoDisciplineHelper: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.todoDisciplineHelper)
});
const RUNTIME_RECOVERY_IDLE_CONTINUATION_SCHEMA = Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation.enabled),
    maxContinuations: Schema.number().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation.maxContinuations),
    prompt: Schema.string().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.idleContinuation.prompt)
});
const RUNTIME_RECOVERY_SCHEMA = Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.enabled),
    retryOnStatusCodes: Schema.array(Number).default([...DEFAULT_DSMM_SETTINGS.runtimeRecovery.retryOnStatusCodes]),
    retryOnCodes: Schema.array(String).default([...DEFAULT_DSMM_SETTINGS.runtimeRecovery.retryOnCodes]),
    fallbackRoutes: Schema.array(Schema.object({
        provider: Schema.string(),
        model: Schema.string(),
        reasoningEffort: Schema.string()
    })).default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.fallbackRoutes.map((route) => ({ ...route }))),
    maxFallbackAttempts: Schema.number().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.maxFallbackAttempts),
    idleContinuation: RUNTIME_RECOVERY_IDLE_CONTINUATION_SCHEMA
});
const DEEPSEEK_CALIBRATION_SCHEMA = Schema.union([
    Schema.const("off"),
    Schema.const("auto"),
    Schema.const("strict")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration);
const DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA = Schema.union([
    Schema.const("off"),
    Schema.const("low"),
    Schema.const("high")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProDefaultReasoningEffort);
const DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA = Schema.array(String)
    .default([...DEFAULT_DSMM_SETTINGS.deepseekV4ProMaxReasoningPresets]);
const LSP_SCHEMA = Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.lsp.enabled),
    serverName: Schema.string().default(DEFAULT_DSMM_SETTINGS.lsp.serverName),
    command: Schema.string().default(DEFAULT_DSMM_SETTINGS.lsp.command),
    args: Schema.array(String).default([...DEFAULT_DSMM_SETTINGS.lsp.args]),
    cwd: Schema.string().default(DEFAULT_DSMM_SETTINGS.lsp.cwd),
    env: Schema.dict(String).default({ ...DEFAULT_DSMM_SETTINGS.lsp.env }),
    toolCallTimeoutMs: Schema.number().default(DEFAULT_DSMM_SETTINGS.lsp.toolCallTimeoutMs),
    failOnStartupError: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.lsp.failOnStartupError)
});
export const DSMM_CONFIG_SCHEMA = Schema.intersect([ROLE_ROUTING_VALIDATION_SCHEMA, Schema.object({
        sessionPersistence: Schema.union([Schema.const(undefined), Schema.object({
                root: Schema.string().required(),
                compression: Schema.union([Schema.const("zstd"), Schema.const("none")])
            })]),
        modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
        section: Schema.string(),
        defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
        promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
        deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
        deepseekV4ProDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
        deepseekV4ProMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
        deepseekFlashCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
        deepseekFlashDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
        deepseekFlashMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
        skills: SKILLS_SCHEMA,
        roles: ROLES_SCHEMA,
        roleRouting: ROLE_ROUTING_SCHEMA,
        runtimePolicy: Schema.any(),
        presets: PRESETS_SCHEMA,
        workflow: WORKFLOW_CONFIG_SCHEMA,
        guards: GUARDS_SCHEMA,
        runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
        lsp: LSP_SCHEMA
    })]).default({});
export const DSMM_SETTINGS_SCHEMA = Schema.intersect([ROLE_ROUTING_VALIDATION_SCHEMA, Schema.object({
        modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
        defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
        promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
        deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
        deepseekV4ProDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
        deepseekV4ProMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
        deepseekFlashCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
        deepseekFlashDefaultReasoningEffort: DEEPSEEK_DEFAULT_REASONING_EFFORT_SCHEMA,
        deepseekFlashMaxReasoningPresets: DEEPSEEK_MAX_REASONING_PRESETS_SCHEMA,
        skills: SKILLS_SCHEMA,
        roles: ROLES_SCHEMA,
        roleRouting: ROLE_ROUTING_SCHEMA,
        runtimePolicy: Schema.any(),
        presets: PRESETS_SCHEMA,
        workflow: WORKFLOW_SCHEMA,
        guards: GUARDS_SCHEMA,
        runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
        lsp: LSP_SCHEMA
    })]).default({});
export function resolveConfig(config = {}) {
    const settings = {
        modeName: normalizeModeName(config.modeName),
        defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
        promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
        deepseekV4ProCalibration: config.deepseekV4ProCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration,
        deepseekV4ProDefaultReasoningEffort: config.deepseekV4ProDefaultReasoningEffort ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProDefaultReasoningEffort,
        deepseekV4ProMaxReasoningPresets: resolveMaxReasoningPresets(config.deepseekV4ProMaxReasoningPresets, DEFAULT_DSMM_SETTINGS.deepseekV4ProMaxReasoningPresets),
        deepseekFlashCalibration: config.deepseekFlashCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekFlashCalibration,
        deepseekFlashDefaultReasoningEffort: config.deepseekFlashDefaultReasoningEffort ?? DEFAULT_DSMM_SETTINGS.deepseekFlashDefaultReasoningEffort,
        deepseekFlashMaxReasoningPresets: resolveMaxReasoningPresets(config.deepseekFlashMaxReasoningPresets, DEFAULT_DSMM_SETTINGS.deepseekFlashMaxReasoningPresets),
        skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills },
        roles: { ...DEFAULT_DSMM_SETTINGS.roles, ...config.roles },
        roleRouting: resolveRoleRouting(config.roleRouting),
        runtimePolicy: normalizeRuntimePolicy(Object.hasOwn(config, "runtimePolicy") ? validatePresentRuntimePolicy(config.runtimePolicy) : undefined),
        presets: resolvePresetSettings(config.presets),
        workflow: resolveWorkflowSettings(config.workflow),
        guards: resolveGuardSettings(config.guards),
        runtimeRecovery: resolveRuntimeRecoverySettings(config.runtimeRecovery),
        lsp: resolveLspSettings(config.lsp)
    };
    for (const role of DSMM_ROLE_IDS)
        resolveRoleRuntimePolicy(settings, role);
    return settings;
}
function validatePresentRuntimePolicy(value) {
    if (value === undefined)
        throw new TypeError("dsmm runtimePolicy must be an object when present");
    return value;
}
function resolveMaxReasoningPresets(input, defaults) {
    const requested = new Set(input ?? defaults);
    return DSMM_ROLE_IDS.filter((id) => requested.has(id));
}
export function resolveRoleRouting(input) {
    if (input === undefined)
        return {};
    if (!isRoutingRecord(input))
        throw new TypeError("dsmm roleRouting must be an object");
    const result = {};
    for (const [key, value] of Object.entries(input)) {
        if (!DSMM_ROLE_IDS.includes(key))
            throw new TypeError("dsmm roleRouting contains an unknown role");
        if (!isRoutingRecord(value) || Object.keys(value).some((field) => !["primary", "fallbackRoutes", "strategy", "rateLimit"].includes(field))) {
            throw new TypeError("dsmm roleRouting role policy must contain only primary, fallbackRoutes, strategy and rateLimit");
        }
        const policy = {};
        if (Object.hasOwn(value, "strategy"))
            policy.strategy = normalizeRoutingStrategy(value.strategy);
        if (Object.hasOwn(value, "rateLimit"))
            policy.rateLimit = normalizeRateLimitOverrides(value.rateLimit);
        if (Object.hasOwn(value, "primary"))
            policy.primary = normalizeExplicitRoute(value.primary);
        if (Object.hasOwn(value, "fallbackRoutes")) {
            if (!Array.isArray(value.fallbackRoutes) || value.fallbackRoutes.length > 32)
                throw new TypeError("dsmm roleRouting fallbackRoutes must be an array with at most 32 entries");
            policy.fallbackRoutes = [];
            for (const entry of value.fallbackRoutes) {
                const route = normalizeExplicitRoute(entry);
                if (!policy.fallbackRoutes.some((existing) => existing.provider === route.provider && existing.model === route.model))
                    policy.fallbackRoutes.push(route);
            }
        }
        result[key] = policy;
    }
    return result;
}
function isRoutingRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeExplicitRoute(value) {
    if (!isRoutingRecord(value) || Object.keys(value).some((field) => !["provider", "model", "reasoningEffort"].includes(field))) {
        throw new TypeError("dsmm explicit model route must contain provider, model and optional reasoningEffort");
    }
    if (typeof value.provider !== "string" || value.provider.trim() === "" || typeof value.model !== "string" || value.model.trim() === "") {
        throw new TypeError("dsmm explicit model route requires nonempty provider and model");
    }
    if (Object.hasOwn(value, "reasoningEffort") && (typeof value.reasoningEffort !== "string" || value.reasoningEffort.trim() === "")) {
        throw new TypeError("dsmm explicit model route reasoningEffort must be nonempty");
    }
    return {
        provider: value.provider.trim(), model: value.model.trim(),
        ...(typeof value.reasoningEffort === "string" ? { reasoningEffort: value.reasoningEffort.trim() } : {})
    };
}
export function isRoleEnabled(settings, role) {
    return settings.roles[role];
}
function resolvePresetSettings(config) {
    return {
        materialize: config?.materialize ?? DEFAULT_DSMM_SETTINGS.presets.materialize,
        ...(config?.root === undefined ? {} : { root: config.root })
    };
}
function resolveWorkflowSettings(config) {
    const legacy = config !== undefined && (config.strictGates !== undefined || config.reviewCap !== undefined || config.finalReviewPolicy !== undefined);
    return {
        ...DEFAULT_DSMM_SETTINGS.workflow,
        ...config,
        policy: config?.policy ?? (legacy ? "legacy" : "risk-based")
    };
}
export function resolveGuardSettings(config) {
    const defaults = DEFAULT_DSMM_SETTINGS.guards;
    return {
        ...defaults,
        ...config,
        toolOutputTruncation: {
            ...defaults.toolOutputTruncation,
            ...config?.toolOutputTruncation,
            maxInlineBytes: normalizePositiveInteger(config?.toolOutputTruncation?.maxInlineBytes, defaults.toolOutputTruncation.maxInlineBytes)
        },
        questionLabelHelper: {
            ...defaults.questionLabelHelper,
            ...config?.questionLabelHelper,
            maxLabelChars: normalizePositiveInteger(config?.questionLabelHelper?.maxLabelChars, defaults.questionLabelHelper.maxLabelChars)
        }
    };
}
function resolveRuntimeRecoverySettings(config) {
    const defaults = DEFAULT_DSMM_SETTINGS.runtimeRecovery;
    return {
        enabled: config?.enabled ?? defaults.enabled,
        retryOnStatusCodes: normalizeStatusCodes(config?.retryOnStatusCodes, defaults.retryOnStatusCodes),
        retryOnCodes: normalizeRetryCodes(config?.retryOnCodes, defaults.retryOnCodes),
        fallbackRoutes: normalizeRecoveryRoutes(config?.fallbackRoutes, defaults.fallbackRoutes),
        maxFallbackAttempts: normalizeBoundedInteger(config?.maxFallbackAttempts, defaults.maxFallbackAttempts),
        idleContinuation: {
            enabled: config?.idleContinuation?.enabled ?? defaults.idleContinuation.enabled,
            maxContinuations: normalizeBoundedInteger(config?.idleContinuation?.maxContinuations, defaults.idleContinuation.maxContinuations),
            prompt: config?.idleContinuation?.prompt ?? defaults.idleContinuation.prompt
        }
    };
}
function normalizeStatusCodes(input, defaults) {
    const normalized = [];
    for (const status of input ?? defaults) {
        if (Number.isInteger(status) && status >= 100 && status <= 599 && !normalized.includes(status))
            normalized.push(status);
    }
    return normalized;
}
function normalizeRetryCodes(input, defaults) {
    const normalized = [];
    for (const code of input ?? defaults) {
        const normalizedCode = code.trim().toLowerCase();
        if (normalizedCode !== "" && !normalized.includes(normalizedCode))
            normalized.push(normalizedCode);
    }
    return normalized;
}
function normalizeRecoveryRoutes(input, defaults) {
    const normalized = [];
    for (const route of input ?? defaults) {
        const reasoningEffort = normalizeRecoveryEffort(route);
        const provider = route.provider?.trim() ?? "";
        const model = route.model?.trim() ?? "";
        if (provider === "" || model === "" || normalized.some((candidate) => candidate.provider === provider && candidate.model === model))
            continue;
        normalized.push({ provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) });
    }
    return normalized;
}
function normalizeRecoveryEffort(route) {
    if (!Object.hasOwn(route, "reasoningEffort"))
        return undefined;
    const value = route.reasoningEffort;
    if (typeof value !== "string" || value.trim() === "")
        throw new TypeError("dsmm recovery route reasoningEffort must be nonempty");
    return value.trim();
}
function normalizeBoundedInteger(value, defaultValue) {
    if (value === undefined || !Number.isFinite(value))
        return defaultValue;
    return Math.min(10, Math.max(0, Math.floor(value)));
}
function normalizePositiveInteger(value, defaultValue) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        return defaultValue;
    return Math.floor(value);
}
export function registerSettings(ctx, config = {}, options = {}) {
    const base = resolveConfig(config);
    // Current Cordis loads restart-scoped Config itself; SettingsForms has no register().
    if (ctx.get !== undefined) {
        const getSettings = () => base;
        options.onChange?.(base);
        options.install?.(ctx, getSettings);
        return getSettings;
    }
    let getSettings = () => base;
    let attached = false;
    const installedSettingsByReadyContext = new WeakMap();
    const ready = (readyCtx, settings) => {
        if (settings === undefined || installedSettingsByReadyContext.get(readyCtx) === settings)
            return;
        const scope = settings.register(DSMM_SETTINGS_NAMESPACE, DSMM_SETTINGS_SCHEMA, { base, applies: "restart" });
        const previousGetSettings = getSettings;
        const previousAttached = attached;
        getSettings = () => resolveConfig(scope.get());
        try {
            options.onChange?.(getSettings());
            options.install?.(readyCtx, () => getSettings());
            installedSettingsByReadyContext.set(readyCtx, settings);
            readyCtx.effect?.(() => () => {
                if (installedSettingsByReadyContext.get(readyCtx) === settings)
                    installedSettingsByReadyContext.delete(readyCtx);
            });
            attached = true;
        }
        catch (error) {
            if (installedSettingsByReadyContext.get(readyCtx) === settings)
                installedSettingsByReadyContext.delete(readyCtx);
            getSettings = previousGetSettings;
            attached = previousAttached;
            throw error;
        }
    };
    if (ctx.inject !== undefined) {
        ctx.inject(["settings", "systemPrompt"], (readyCtx) => ready(readyCtx, readyCtx.settings));
        return () => getSettings();
    }
    if (Object.prototype.hasOwnProperty.call(ctx, "settings")) {
        ready(ctx, Object.getOwnPropertyDescriptor(ctx, "settings")?.value);
    }
    if (!attached) {
        options.onChange?.(getSettings());
        options.install?.(ctx, () => getSettings());
    }
    return () => getSettings();
}
//# sourceMappingURL=settings.js.map