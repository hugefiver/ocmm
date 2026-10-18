import Schema from "@deepseek-ai/schemastery";
import { DEFAULT_DSMM_LSP_SETTINGS, resolveLspSettings } from "./lsp.js";
import { DSMM_ROLES, DSMM_ROLE_IDS, isRootRole } from "./roles.js";
import { DSMM_SKILL_NAMES } from "./skills.js";
import { DEFAULT_DSMM_RUNTIME_POLICY, DSMM_RATE_LIMIT_BOUNDS, normalizeRateLimitOverrides, normalizeRoutingStrategy, normalizeRuntimePolicy, resolveRoleRuntimePolicy } from "./routing-policy.js";
import { DEPRECATED_DSMM_FIELDS, DsmmConfigValidationError, safeDiagnosticField } from "./profile-diagnostics.js";
import { DSMM_LOCALES } from "./profile-locale.js";
import { normalizeModelRouteJson, validateModelRouteFieldName } from "./route-json.js";
import { DEFAULT_PERMISSION_CONTROL, permissionControlSchema, resolvePermissionControl } from "./permission-settings.js";
export { DSMM_LOCALES } from "./profile-locale.js";
export { resolveRoleRuntimePolicy } from "./routing-policy.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export const DSMM_STATUS_COMMAND = "dsmm-status";
export const DEFAULT_DSMM_SETTINGS = {
    permissionControl: DEFAULT_PERMISSION_CONTROL,
    modelParameters: { passthrough: true },
    modules: { deepwork: { enabled: true } },
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    skills: createDefaultSkillSettings(),
    roles: createDefaultRoleSettings(),
    roleRouting: {},
    runtimePolicy: DEFAULT_DSMM_RUNTIME_POLICY,
    presets: {
        materialize: false,
        plannerRootEnabled: false
    },
    subagents: { enableRunInBackground: false, backgroundMode: "one-shot", toolTopology: "per-role", allowRouteOverride: false },
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
const MODEL_ROUTE_FIELDS_SCHEMA = Schema.object({
    provider: Schema.string().required(),
    model: Schema.string().required(),
    reasoningEffort: Schema.string(),
    temperature: Schema.number(),
    maxTokens: Schema.number().step(1).min(1),
    stop: Schema.array(Schema.string())
});
const MODEL_ROUTE_SCHEMA = Schema.transform(Schema.any(), (input) => normalizeModelRouteJson(input, true, true));
const LEVEL_OVERRIDE_SCHEMA = Schema.union([MODEL_ROUTE_SCHEMA, Schema.object({ reasoningEffort: Schema.string().required() })]);
const LEVELS_SCHEMA = Schema.object({ low: LEVEL_OVERRIDE_SCHEMA, high: LEVEL_OVERRIDE_SCHEMA, max: LEVEL_OVERRIDE_SCHEMA });
const LOCALE_SCHEMA = Schema.union(DSMM_LOCALES.map(locale => Schema.const(locale)));
const RATE_LIMIT_CONFIG_SCHEMA = Schema.object(Object.fromEntries(Object.keys(DEFAULT_DSMM_RUNTIME_POLICY.rateLimit).map((key) => [key, Schema.number()])));
const ROUTING_STRATEGY_CONFIG_SCHEMA = Schema.union([Schema.const("startup-lock"), Schema.const("rate-limit-fallback")]);
const RUNTIME_POLICY_CONFIG_SCHEMA = Schema.object({ strategy: ROUTING_STRATEGY_CONFIG_SCHEMA, rateLimit: RATE_LIMIT_CONFIG_SCHEMA });
const ROLE_FALLBACK_ROUTE_LIMIT = 32;
const ROLE_FALLBACK_ROUTES_SCHEMA = Schema.array(MODEL_ROUTE_SCHEMA);
// A dictionary retains unknown keys for fail-closed validation by the resolver.
const ROLE_ROUTING_SCHEMA = Schema.dict(Schema.object({
    levels: LEVELS_SCHEMA,
    primary: Schema.union([Schema.const(undefined), MODEL_ROUTE_SCHEMA]),
    fallbackRoutes: Schema.union([Schema.const(undefined), ROLE_FALLBACK_ROUTES_SCHEMA]),
    strategy: ROUTING_STRATEGY_CONFIG_SCHEMA,
    rateLimit: RATE_LIMIT_CONFIG_SCHEMA
}).required()).default({});
// Schemastery treats null like an omitted default. Validate the untouched map
// before object defaults can erase an explicitly malformed routing policy.
const ROLE_ROUTING_VALIDATION_SCHEMA = Schema.transform(Schema.any(), (input) => {
    if (!isRoutingRecord(input))
        return input;
    rejectDeprecatedFields(input);
    if (Object.hasOwn(input, "locale"))
        validateLocale(input.locale);
    if (isRoutingRecord(input.runtimeRecovery) && Array.isArray(input.runtimeRecovery.fallbackRoutes)) {
        for (const route of input.runtimeRecovery.fallbackRoutes) {
            normalizeExplicitRoute(route);
        }
    }
    const roleRouting = resolveRoleRouting(input.roleRouting);
    const runtimePolicy = normalizeRuntimePolicy(Object.hasOwn(input, "runtimePolicy") ? validatePresentRuntimePolicy(input.runtimePolicy) : undefined);
    return { roleRouting, runtimePolicy };
});
const PRESETS_SCHEMA = Schema.object({
    materialize: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.presets.materialize),
    plannerRootEnabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.presets.plannerRootEnabled),
    root: Schema.string()
});
const SUBAGENTS_SCHEMA = Schema.object({
    toolTopology: Schema.union([Schema.const("per-role"), Schema.const("parameterized")]).default("per-role"),
    allowRouteOverride: Schema.boolean().default(false),
    enableRunInBackground: Schema.boolean().default(false),
    backgroundMode: Schema.union([Schema.const("one-shot"), Schema.const("continuable")]).default("one-shot"),
    maxDepth: Schema.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER)
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
    fallbackRoutes: Schema.array(MODEL_ROUTE_SCHEMA).max(ROLE_FALLBACK_ROUTE_LIMIT).default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.fallbackRoutes.map((route) => ({ ...route }))),
    maxFallbackAttempts: Schema.number().default(DEFAULT_DSMM_SETTINGS.runtimeRecovery.maxFallbackAttempts),
    idleContinuation: RUNTIME_RECOVERY_IDLE_CONTINUATION_SCHEMA
});
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
    permissionControl: permissionControlSchema,
    modelParameters: Schema.object({ passthrough: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.modelParameters.passthrough) }),
    locale: LOCALE_SCHEMA,
    modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
    section: Schema.string(),
    defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
    promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
    skills: SKILLS_SCHEMA,
    roles: ROLES_SCHEMA,
    roleRouting: ROLE_ROUTING_SCHEMA,
    runtimePolicy: RUNTIME_POLICY_CONFIG_SCHEMA,
    presets: PRESETS_SCHEMA,
    subagents: SUBAGENTS_SCHEMA,
    workflow: WORKFLOW_CONFIG_SCHEMA,
    guards: GUARDS_SCHEMA,
    runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
    lsp: LSP_SCHEMA
});
const MODULES_SCHEMA = Schema.object({ deepwork: Schema.object({ enabled: Schema.boolean() }) });
const GLOBAL_FIELDS_SCHEMA = Schema.object({ ...CONFIG_FIELDS_SCHEMA.dict, modules: MODULES_SCHEMA });
const NATIVE_FIELDS_SCHEMA = CONFIG_FIELDS_SCHEMA;
/** Only data is transported. Defaults remain resolved by the existing authority. */
export function deploymentEditorSchema(native = false) {
    const project = (schema) => schema === permissionControlSchema && schema.type === "transform"
        ? project(schema.inner) : schema === permissionControlSchema.inner.dict.rules
        ? { type: "array", inner: { type: "object", fields: {}, additionalProperties: "json" } } : schema === MODEL_ROUTE_SCHEMA
        ? { ...project(MODEL_ROUTE_FIELDS_SCHEMA), additionalProperties: "json" } : ({
        type: schema.type,
        ...(schema.dict === undefined ? {} : { fields: Object.fromEntries(Object.entries(schema.dict).map(([key, child]) => {
                const node = project(child);
                if (schema === MODEL_ROUTE_FIELDS_SCHEMA && ["provider", "model", "reasoningEffort"].includes(key))
                    node.nonempty = true;
                if (schema === RATE_LIMIT_CONFIG_SCHEMA) {
                    const [min, max] = DSMM_RATE_LIMIT_BOUNDS[key];
                    Object.assign(node, { min, max, step: 1 });
                }
                return [key, node];
            })) }),
        ...(schema.inner === undefined ? {} : { inner: project(schema.inner) }),
        ...(schema.list === undefined ? {} : { alternatives: schema.list.map(project) }),
        ...(["string", "number", "boolean"].includes(typeof schema.value) ? { value: schema.value } : {}),
        ...(typeof schema.meta.min === "number" ? { min: schema.meta.min } : {}),
        ...(typeof schema.meta.max === "number" ? { max: schema.meta.max } : {}),
        ...(typeof schema.meta.step === "number" ? { step: schema.meta.step } : {}),
        ...(schema.meta.required === true ? { required: true } : {}),
        ...(schema === ROLE_ROUTING_SCHEMA ? { keys: [...DSMM_ROLE_IDS] } : {}),
        ...(schema === ROLE_FALLBACK_ROUTES_SCHEMA ? { max: ROLE_FALLBACK_ROUTE_LIMIT } : {})
    });
    return project(native ? NATIVE_FIELDS_SCHEMA : GLOBAL_FIELDS_SCHEMA);
}
/** Transport nodes carry no business defaults. Only deployment input is volatile. */
function sparseSchema(schema) {
    if (schema === permissionControlSchema && schema.type === "transform")
        return sparseSchema(schema.inner);
    const { default: _default, required: _required, ...meta } = schema.meta;
    return new Schema({ ...schema, meta,
        ...(schema.dict === undefined ? {} : { dict: Object.fromEntries(Object.entries(schema.dict).map(([key, child]) => [key, sparseSchema(child)])) }),
        ...(schema.inner === undefined ? {} : { inner: sparseSchema(schema.inner) }),
        ...(schema.list === undefined ? {} : { list: schema.list.map(sparseSchema) }) });
}
const TRANSPORT_FIELDS_SCHEMA = sparseSchema(NATIVE_FIELDS_SCHEMA);
export const DSMM_CONFIG_SCHEMA = Schema.intersect([
    Schema.transform(Schema.any(), (input) => { resolveConfig(validateNativeConfig(input ?? {})); return {}; }),
    sparseSchema(NATIVE_FIELDS_SCHEMA)
]).default({});
for (const [key, schema] of Object.entries(TRANSPORT_FIELDS_SCHEMA.dict)) {
    TRANSPORT_FIELDS_SCHEMA.set(key, schema.volatile());
}
// Native forms require a fixed object root: volatile nodes cannot sit under an
// intersection. Keep that schema intact and validate through the public protocol.
export const DSMM_NATIVE_CONFIG_SCHEMA = new Proxy(TRANSPORT_FIELDS_SCHEMA.default({}), {
    apply(target, receiver, args) {
        validateNativeConfig(args[0] ?? {});
        return Reflect.apply(target, receiver, args);
    },
    get(target, key, receiver) {
        if (key !== "~standard")
            return Reflect.get(target, key, receiver);
        return { version: 1, vendor: "schemastery", validate(input) {
                validateNativeConfig(input ?? {});
                return target["~standard"].validate(input);
            } };
    }
});
export function validateNativeConfig(input) {
    const config = copyJson(input);
    if (typeof config === "object" && config !== null)
        rejectDeprecatedFields(config);
    validateShape(config, NATIVE_FIELDS_SCHEMA);
    validateSparseConfig(config);
    return config;
}
export const DSMM_SETTINGS_SCHEMA = Schema.intersect([ROLE_ROUTING_VALIDATION_SCHEMA, Schema.object({
        permissionControl: permissionControlSchema,
        modelParameters: Schema.object({ passthrough: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.modelParameters.passthrough) }),
        locale: LOCALE_SCHEMA,
        modules: Schema.object({ deepwork: Schema.object({ enabled: Schema.boolean().default(true) }) }),
        modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
        defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
        promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
        skills: SKILLS_SCHEMA,
        roles: ROLES_SCHEMA,
        roleRouting: ROLE_ROUTING_SCHEMA,
        runtimePolicy: Schema.any(),
        presets: PRESETS_SCHEMA,
        subagents: SUBAGENTS_SCHEMA,
        workflow: WORKFLOW_SCHEMA,
        guards: GUARDS_SCHEMA,
        runtimeRecovery: RUNTIME_RECOVERY_SCHEMA,
        lsp: LSP_SCHEMA
    })]).default({});
export function resolveConfig(config = {}) {
    rejectDeprecatedFields(config);
    if (Object.hasOwn(config, "locale"))
        validateLocale(config.locale);
    if (config.subagents !== undefined)
        validateShape(config.subagents, SUBAGENTS_SCHEMA, ["subagents"]);
    if (config.modelParameters !== undefined)
        validateShape(config.modelParameters, CONFIG_FIELDS_SCHEMA.dict.modelParameters, ["modelParameters"]);
    if (config.permissionControl !== undefined)
        validateShape(config.permissionControl, permissionControlSchema, ["permissionControl"]);
    const settings = {
        permissionControl: resolvePermissionControl(config.permissionControl),
        modelParameters: { passthrough: config.modelParameters?.passthrough ?? DEFAULT_DSMM_SETTINGS.modelParameters.passthrough },
        ...(config.locale === undefined ? {} : { locale: config.locale }),
        modules: { deepwork: { enabled: config.modules?.deepwork?.enabled ?? DEFAULT_DSMM_SETTINGS.modules.deepwork.enabled } },
        modeName: normalizeModeName(config.modeName),
        defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
        promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
        skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills },
        roles: { ...DEFAULT_DSMM_SETTINGS.roles, ...config.roles },
        roleRouting: resolveRoleRouting(config.roleRouting),
        runtimePolicy: normalizeRuntimePolicy(Object.hasOwn(config, "runtimePolicy") ? validatePresentRuntimePolicy(config.runtimePolicy) : undefined),
        presets: resolvePresetSettings(config.presets),
        subagents: SUBAGENTS_SCHEMA(config.subagents ?? {}),
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
function validateShape(value, schema, path = []) {
    const fail = (code = "invalid-type") => { throw new DsmmConfigValidationError(code, path); };
    if (schema === MODEL_ROUTE_SCHEMA) {
        try {
            normalizeModelRouteJson(value, true, true);
        }
        catch {
            fail("invalid-route");
        }
        return;
    }
    if (value === null || value === undefined)
        fail();
    if (schema.type === "transform") {
        validateShape(value, schema.inner, path);
    }
    else if (schema.type === "object") {
        if (typeof value !== "object" || Array.isArray(value))
            fail();
        for (const [key, child] of Object.entries(value)) {
            const field = schema.dict !== undefined && Object.hasOwn(schema.dict, key) ? schema.dict[key] : undefined;
            if (field === undefined)
                throw new DsmmConfigValidationError("unknown-field", [...path, key]);
            validateShape(child, field, [...path, key]);
        }
    }
    else if (schema.type === "dict") {
        if (typeof value !== "object" || Array.isArray(value))
            throw new TypeError("Deepwork configuration field must be an object");
        for (const [key, child] of Object.entries(value))
            validateShape(child, schema.inner, [...path, key]);
    }
    else if (schema.type === "array") {
        if (!Array.isArray(value))
            throw new TypeError("Deepwork configuration field must be an array");
        value.forEach((child, index) => validateShape(child, schema.inner, [...path, index]));
    }
    else if (schema.type === "union") {
        for (const child of schema.list ?? []) {
            try {
                validateShape(value, child, path);
                return;
            }
            catch { /* Try the other declared alternatives. */ }
        }
        fail("unsupported-value");
    }
    else {
        try {
            schema(value);
        }
        catch {
            fail();
        }
    }
}
/** Sparse grammar and full semantic validation are separate from native refs. */
export function validateSparseConfig(input, global = false) {
    if (isRoutingRecord(input))
        rejectDeprecatedFields(input);
    const config = copyJson(input);
    if (isRoutingRecord(config.roleRouting)) {
        for (const [role, policy] of Object.entries(config.roleRouting))
            if (isRoutingRecord(policy) && Object.hasOwn(policy, "levels")) {
                if (!DSMM_ROLE_IDS.includes(role))
                    throw new DsmmConfigValidationError("unknown-field", ["roleRouting", role]);
                if (role === "dsmm-orchestrator")
                    throw new DsmmConfigValidationError("unsupported-value", `roleRouting.${role}.levels`);
                if (!isRoutingRecord(policy.levels))
                    throw new DsmmConfigValidationError("invalid-type", `roleRouting.${role}.levels`);
                for (const [level, value] of Object.entries(policy.levels)) {
                    const field = safeDiagnosticField(["roleRouting", role, "levels", level]);
                    if (!["low", "high", "max"].includes(level))
                        throw new DsmmConfigValidationError("unsupported-value", ["roleRouting", role, "levels", level]);
                    normalizeLevelOverride(value, field);
                }
            }
    }
    validateShape(config, global ? GLOBAL_FIELDS_SCHEMA : CONFIG_FIELDS_SCHEMA);
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
    const deprecated = path.find(key => DEPRECATED_DSMM_FIELDS.includes(key));
    if (deprecated !== undefined)
        throw new DsmmConfigValidationError("deprecated-field", path);
    let schema = GLOBAL_FIELDS_SCHEMA;
    if (path.length === 0)
        throw new TypeError("Not an editable deployment field");
    for (const key of path) {
        if (schema.type === "union")
            schema = schema.list?.find((node) => node === MODEL_ROUTE_SCHEMA || node.type === "object") ?? schema;
        if (schema === MODEL_ROUTE_SCHEMA) {
            if (path.some(part => ["__proto__", "prototype", "constructor"].includes(part)))
                throw new DsmmConfigValidationError("invalid-route", path);
            try {
                validateModelRouteFieldName(key);
            }
            catch {
                throw new DsmmConfigValidationError("invalid-route", path);
            }
            const field = MODEL_ROUTE_FIELDS_SCHEMA.dict[key];
            if (Object.hasOwn(MODEL_ROUTE_FIELDS_SCHEMA.dict, key)) {
                schema = field;
                continue;
            }
            return;
        }
        while (schema.type === "transform")
            schema = schema.inner;
        const child = schema.type === "object" ? schema.dict !== undefined && Object.hasOwn(schema.dict, key) ? schema.dict[key] : undefined : schema.type === "dict" ? schema.inner : undefined;
        if (child === undefined)
            throw new DsmmConfigValidationError("unknown-field", path);
        schema = child;
    }
}
export function mergeConfigLayers(...layers) {
    const merge = (base, overlay, path = []) => {
        const result = copyJson(base);
        for (const [key, value] of Object.entries(overlay)) {
            const previous = result[key];
            result[key] = path.at(-1) !== "levels" && value !== null && typeof value === "object" && !Array.isArray(value)
                && previous !== null && typeof previous === "object" && !Array.isArray(previous)
                ? merge(previous, value, [...path, key]) : copyJson(value);
        }
        return result;
    };
    return layers.reduce((base, layer) => merge(base, copyJson(layer)), {});
}
export function resolveDeployment(global, profile) {
    const merged = mergeConfigLayers(validateSparseConfig(global, true), validateSparseConfig(profile));
    const settings = resolveConfig(merged);
    validateResolvedSettings(settings);
    return freezeSettings(settings);
}
export function validateResolvedSettings(settings) {
    const plain = copyJson(settings);
    validateShape(plain, GLOBAL_FIELDS_SCHEMA);
    DSMM_SETTINGS_SCHEMA(plain);
    return plain;
}
function validatePresentRuntimePolicy(value) {
    if (value === undefined)
        throw new TypeError("dsmm runtimePolicy must be an object when present");
    return value;
}
export function rejectDeprecatedFields(input, prefix = "") {
    for (const key of DEPRECATED_DSMM_FIELDS)
        if (Object.hasOwn(input, key))
            throw new DsmmConfigValidationError("deprecated-field", `${prefix}${key}`);
}
export function validateLocale(value, field = "locale") {
    if (typeof value !== "string" || !DSMM_LOCALES.includes(value))
        throw new DsmmConfigValidationError("unsupported-value", field);
}
export function normalizeLevelOverride(value, field = "route") {
    try {
        value = copyJson(value);
    }
    catch {
        throw new DsmmConfigValidationError("invalid-route", field);
    }
    if (!isRoutingRecord(value))
        throw new DsmmConfigValidationError("invalid-route", field);
    if (Object.hasOwn(value, "provider") || Object.hasOwn(value, "model")) {
        try {
            const route = normalizeExplicitRoute(value);
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/u.test(route.provider) || route.model.length > 512 || route.model.includes("://") || /[\u0000-\u001f\u007f]/u.test(route.model) || route.reasoningEffort !== undefined && (route.reasoningEffort.length > 64 || /[\u0000-\u001f\u007f]/u.test(route.reasoningEffort)))
                throw new Error("Invalid bounded route");
            return route;
        }
        catch {
            throw new DsmmConfigValidationError("invalid-route", field);
        }
    }
    for (const key of Object.keys(value))
        if (key !== "reasoningEffort")
            throw new DsmmConfigValidationError("unknown-field", [...field.split("."), key]);
    if (typeof value.reasoningEffort !== "string" || value.reasoningEffort.trim() === "" || value.reasoningEffort.length > 64 || /[\u0000-\u001f\u007f]/u.test(value.reasoningEffort))
        throw new DsmmConfigValidationError("invalid-route", `${field}.reasoningEffort`);
    return { reasoningEffort: value.reasoningEffort };
}
export function resolveRoleRouting(input) {
    if (input === undefined)
        return {};
    input = copyJson(input);
    if (!isRoutingRecord(input))
        throw new TypeError("dsmm roleRouting must be an object");
    const result = {};
    for (const [key, value] of Object.entries(input)) {
        if (!DSMM_ROLE_IDS.includes(key))
            throw new DsmmConfigValidationError("unknown-field", ["roleRouting", key]);
        if (!isRoutingRecord(value) || Object.keys(value).some((field) => !["primary", "fallbackRoutes", "strategy", "rateLimit", "levels"].includes(field))) {
            if (!isRoutingRecord(value))
                throw new DsmmConfigValidationError("invalid-type", `roleRouting.${key}`);
            throw new DsmmConfigValidationError("unknown-field", ["roleRouting", key, Object.keys(value).find(field => !["primary", "fallbackRoutes", "strategy", "rateLimit", "levels"].includes(field))]);
        }
        const policy = {};
        if (Object.hasOwn(value, "levels")) {
            const field = `roleRouting.${key}.levels`;
            if (key === "dsmm-orchestrator")
                throw new DsmmConfigValidationError("unsupported-value", field);
            if (!isRoutingRecord(value.levels))
                throw new DsmmConfigValidationError("invalid-type", field);
            policy.levels = {};
            for (const [level, override] of Object.entries(value.levels)) {
                if (!["low", "high", "max"].includes(level))
                    throw new DsmmConfigValidationError("unsupported-value", `${field}.${level}`);
                policy.levels[level] = normalizeLevelOverride(override, `${field}.${level}`);
            }
        }
        if (Object.hasOwn(value, "strategy"))
            policy.strategy = normalizeRoutingStrategy(value.strategy);
        if (Object.hasOwn(value, "rateLimit"))
            policy.rateLimit = normalizeRateLimitOverrides(value.rateLimit);
        if (Object.hasOwn(value, "primary")) {
            try {
                policy.primary = normalizeExplicitRoute(value.primary);
            }
            catch {
                throw new DsmmConfigValidationError("invalid-route", `roleRouting.${key}.primary`);
            }
        }
        if (Object.hasOwn(value, "fallbackRoutes")) {
            if (!Array.isArray(value.fallbackRoutes) || value.fallbackRoutes.length > ROLE_FALLBACK_ROUTE_LIMIT)
                throw new TypeError("dsmm roleRouting fallbackRoutes must be an array with at most 32 entries");
            policy.fallbackRoutes = [];
            for (const [index, entry] of value.fallbackRoutes.entries()) {
                let route;
                try {
                    route = normalizeExplicitRoute(entry);
                }
                catch {
                    throw new DsmmConfigValidationError("invalid-route", `roleRouting.${key}.fallbackRoutes[${index}]`);
                }
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
    const route = normalizeModelRouteJson(value, false, true);
    return { ...route, provider: route.provider.trim(), model: route.model.trim() };
}
export function isRoleEnabled(settings, role) {
    return settings.roles[role];
}
/** Native standing-root availability is independent of child role enablement. */
export function isRootRoleEnabled(settings, id) {
    const role = DSMM_ROLES.find(role => role.id === id);
    return settings.modules.deepwork.enabled && settings.roles[id] && isRootRole(role)
        && (id !== "dsmm-planner" || settings.presets.plannerRootEnabled);
}
function resolvePresetSettings(config) {
    if (config !== undefined)
        validateShape(config, PRESETS_SCHEMA, ["presets"]);
    return {
        materialize: config?.materialize ?? DEFAULT_DSMM_SETTINGS.presets.materialize,
        plannerRootEnabled: config?.plannerRootEnabled ?? DEFAULT_DSMM_SETTINGS.presets.plannerRootEnabled,
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
    const routes = copyJson(input ?? defaults);
    if (!Array.isArray(routes) || routes.length > ROLE_FALLBACK_ROUTE_LIMIT)
        throw new TypeError("dsmm recovery fallbackRoutes must contain at most 32 routes");
    for (const route of routes) {
        const candidate = normalizeExplicitRoute(route);
        normalized.push(candidate);
    }
    return normalized;
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
    const base = freezeSettings(options.resolved === undefined ? resolveConfig(validateSparseConfig(config)) : validateResolvedSettings(options.resolved));
    const getSettings = () => base;
    options.onChange?.(base);
    options.install?.(ctx, getSettings);
    return getSettings;
}
//# sourceMappingURL=settings.js.map