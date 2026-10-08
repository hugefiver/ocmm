import Schema from "@deepseek-ai/schemastery";
import { DEFAULT_DSMM_LSP_SETTINGS, resolveLspSettings } from "./lsp.js";
import { DSMM_ROLES, DSMM_ROLE_IDS } from "./roles.js";
import { DSMM_SKILL_NAMES } from "./skills.js";
import { DEFAULT_DSMM_RUNTIME_POLICY, normalizeRateLimitOverrides, normalizeRoutingStrategy, normalizeRuntimePolicy, resolveRoleRuntimePolicy } from "./routing-policy.js";
export { resolveRoleRuntimePolicy } from "./routing-policy.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
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
    return Object.fromEntries(DSMM_ROLES.map((role) => [role.id, role.enabledByDefault]));
}
const SKILLS_SCHEMA = Schema.object(Object.fromEntries(DSMM_SKILL_NAMES.map((name) => [name, Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills[name])])));
const ROLES_SCHEMA = Schema.object(Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles[id])])));
const MODEL_ROUTE_SCHEMA = Schema.object({
    provider: Schema.string().required(),
    model: Schema.string().required(),
    reasoningEffort: Schema.string()
});
const RATE_LIMIT_CONFIG_SCHEMA = Schema.object(Object.fromEntries(Object.keys(DEFAULT_DSMM_RUNTIME_POLICY.rateLimit).map((key) => [key, Schema.number()])));
const ROUTING_STRATEGY_CONFIG_SCHEMA = Schema.union([Schema.const("startup-lock"), Schema.const("rate-limit-fallback")]);
const RUNTIME_POLICY_CONFIG_SCHEMA = Schema.object({ strategy: ROUTING_STRATEGY_CONFIG_SCHEMA, rateLimit: RATE_LIMIT_CONFIG_SCHEMA });
// A dictionary retains unknown keys for fail-closed validation by the resolver.
const ROLE_ROUTING_SCHEMA = Schema.dict(Schema.object({
    primary: Schema.union([Schema.const(undefined), MODEL_ROUTE_SCHEMA]),
    fallbackRoutes: Schema.union([Schema.const(undefined), Schema.array(MODEL_ROUTE_SCHEMA)]),
    strategy: ROUTING_STRATEGY_CONFIG_SCHEMA,
    rateLimit: RATE_LIMIT_CONFIG_SCHEMA
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
const CONFIG_FIELDS_SCHEMA = Schema.object({
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
    runtimePolicy: RUNTIME_POLICY_CONFIG_SCHEMA,
    presets: PRESETS_SCHEMA,
    workflow: WORKFLOW_CONFIG_SCHEMA,
    guards: GUARDS_SCHEMA,
    runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
    lsp: LSP_SCHEMA
});
/** Transport nodes carry no business defaults. Only deployment input is volatile. */
function sparseSchema(schema) {
    const { default: _default, required: _required, ...meta } = schema.meta;
    return new Schema({ ...schema, meta,
        ...(schema.dict === undefined ? {} : { dict: Object.fromEntries(Object.entries(schema.dict).map(([key, child]) => [key, sparseSchema(child)])) }),
        ...(schema.inner === undefined ? {} : { inner: sparseSchema(schema.inner) }),
        ...(schema.list === undefined ? {} : { list: schema.list.map(sparseSchema) }) });
}
const TRANSPORT_FIELDS_SCHEMA = sparseSchema(CONFIG_FIELDS_SCHEMA);
export const DSMM_CONFIG_SCHEMA = Schema.intersect([
    Schema.transform(Schema.any(), (input) => { resolveConfig(validateSparseConfig(input ?? {})); return {}; }),
    sparseSchema(CONFIG_FIELDS_SCHEMA)
]).default({});
for (const [key, schema] of Object.entries(TRANSPORT_FIELDS_SCHEMA.dict)) {
    if (key !== "sessionPersistence")
        TRANSPORT_FIELDS_SCHEMA.set(key, schema.volatile());
}
// Native forms require a fixed object root: volatile nodes cannot sit under an
// intersection. Keep that schema intact and validate through the public protocol.
export const DSMM_NATIVE_CONFIG_SCHEMA = new Proxy(TRANSPORT_FIELDS_SCHEMA.default({}), {
    apply(target, receiver, args) {
        validateSparseConfig(args[0] ?? {});
        return Reflect.apply(target, receiver, args);
    },
    get(target, key, receiver) {
        if (key !== "~standard")
            return Reflect.get(target, key, receiver);
        return { version: 1, vendor: "schemastery", validate(input) {
                validateSparseConfig(input ?? {});
                return target["~standard"].validate(input);
            } };
    }
});
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
/** Reject references, accessors, prototypes and non-JSON data before any merge. */
export function copyJson(input) {
    const active = new Set();
    const copy = (value, depth) => {
        if (depth > 32)
            throw new TypeError("Deepwork configuration nesting is too deep");
        if (value === null || typeof value === "boolean" || typeof value === "string")
            return value;
        if (typeof value === "number" && Number.isFinite(value))
            return value;
        if (typeof value !== "object" || value === null || active.has(value))
            throw new TypeError("Deepwork configuration must be plain JSON data");
        const prototype = Object.getPrototypeOf(value);
        if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
            throw new TypeError("Deepwork configuration must use plain objects");
        if (Object.getOwnPropertySymbols(value).length > 0)
            throw new TypeError("Deepwork configuration must not contain symbols");
        active.add(value);
        const result = Array.isArray(value) ? [] : {};
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
            if (Array.isArray(value) && key === "length")
                continue;
            if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
                throw new TypeError("Deepwork configuration contains an unsafe property");
            if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key))
                throw new TypeError("Deepwork configuration arrays must contain only elements");
            Reflect.set(result, key, copy(descriptor.value, depth + 1));
        }
        if (Array.isArray(value) && Object.keys(result).length !== value.length)
            throw new TypeError("Deepwork configuration arrays must not have holes");
        active.delete(value);
        return result;
    };
    return copy(input, 0);
}
export function freezeSettings(input) {
    const result = copyJson(input);
    const freeze = (value) => {
        if (value === null || typeof value !== "object")
            return;
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    };
    freeze(result);
    return result;
}
function validateShape(value, schema) {
    if (value === null || value === undefined)
        throw new TypeError("Deepwork explicit configuration must not be null or undefined");
    if (schema.type === "object") {
        if (typeof value !== "object" || Array.isArray(value))
            throw new TypeError("Deepwork configuration field must be an object");
        for (const [key, child] of Object.entries(value)) {
            const field = schema.dict !== undefined && Object.hasOwn(schema.dict, key) ? schema.dict[key] : undefined;
            if (field === undefined)
                throw new TypeError("Deepwork configuration contains an unknown field");
            validateShape(child, field);
        }
    }
    else if (schema.type === "dict") {
        if (typeof value !== "object" || Array.isArray(value))
            throw new TypeError("Deepwork configuration field must be an object");
        for (const child of Object.values(value))
            validateShape(child, schema.inner);
    }
    else if (schema.type === "array") {
        if (!Array.isArray(value))
            throw new TypeError("Deepwork configuration field must be an array");
        for (const child of value)
            validateShape(child, schema.inner);
    }
    else if (schema.type === "union") {
        for (const child of schema.list ?? []) {
            try {
                validateShape(value, child);
                return;
            }
            catch { /* Try the other declared alternatives. */ }
        }
        throw new TypeError("Deepwork configuration field does not match its declared type");
    }
    else {
        schema(value);
    }
}
/** Sparse grammar and full semantic validation are separate from native refs. */
export function validateSparseConfig(input, global = false) {
    const config = copyJson(input);
    validateShape(config, CONFIG_FIELDS_SCHEMA);
    if (global && Object.hasOwn(config, "sessionPersistence"))
        throw new TypeError("Native session storage is not a global deployment field");
    // A deployment layer may override one primary-route member and inherit the
    // others. Validate its present members here; resolveDeployment validates the
    // complete route only after both sparse layers have merged.
    const routing = config.roleRouting === undefined ? undefined : copyJson(config.roleRouting);
    for (const policy of Object.values(routing ?? {})) {
        if (policy?.primary !== undefined && (!Object.hasOwn(policy.primary, "provider") || !Object.hasOwn(policy.primary, "model")))
            delete policy.primary;
    }
    const settings = resolveConfig({ ...config, ...(routing === undefined ? {} : { roleRouting: routing }) });
    DSMM_SETTINGS_SCHEMA(settings);
    return config;
}
export function validateDeploymentPath(path) {
    let schema = CONFIG_FIELDS_SCHEMA;
    if (path.length === 0 || path[0] === "sessionPersistence")
        throw new TypeError("Not an editable deployment field");
    for (const key of path) {
        if (schema.type === "union")
            schema = schema.list?.find((node) => node.type === "object") ?? schema;
        const child = schema.type === "object" ? schema.dict !== undefined && Object.hasOwn(schema.dict, key) ? schema.dict[key] : undefined : schema.type === "dict" ? schema.inner : undefined;
        if (child === undefined)
            throw new TypeError("Unknown deployment field path");
        schema = child;
    }
}
export function mergeConfigLayers(...layers) {
    const merge = (base, overlay) => {
        const result = copyJson(base);
        for (const [key, value] of Object.entries(overlay)) {
            const previous = result[key];
            result[key] = value !== null && typeof value === "object" && !Array.isArray(value)
                && previous !== null && typeof previous === "object" && !Array.isArray(previous)
                ? merge(previous, value) : copyJson(value);
        }
        return result;
    };
    return layers.reduce((base, layer) => merge(base, validateSparseConfig(layer)), {});
}
export function resolveDeployment(global, profile) {
    const merged = mergeConfigLayers(validateSparseConfig(global, true), profile);
    const settings = resolveConfig(merged);
    validateSparseConfig(settings);
    return freezeSettings(settings);
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
    // Loader owns entry identity, Config validation, revision and persistent patch.
    // Each non-volatile reload receives a new deployment baseline. Profiles stay
    // on the existing immutable admission path, never a parallel settings store.
    const base = freezeSettings(resolveConfig(validateSparseConfig(config)));
    const getSettings = () => base;
    options.onChange?.(base);
    options.install?.(ctx, getSettings);
    return getSettings;
}
//# sourceMappingURL=settings.js.map