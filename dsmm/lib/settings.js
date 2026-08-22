import Schema from "@deepseek-ai/schemastery";
import { DSMM_ROLE_IDS } from "./roles.js";
export const DSMM_SETTINGS_NAMESPACE = "dsmm";
export const DEFAULT_DSMM_SETTINGS = {
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    skills: {
        brainstorming: true,
        "writing-plans": true,
        "requesting-code-review": true,
        "receiving-code-review": true
    },
    roles: createDefaultRoleSettings(),
    presets: {
        materialize: false
    }
};
function createDefaultRoleSettings() {
    return Object.fromEntries(DSMM_ROLE_IDS.map((id) => [id, true]));
}
const SKILLS_SCHEMA = Schema.object({
    brainstorming: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills.brainstorming),
    "writing-plans": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["writing-plans"]),
    "requesting-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["requesting-code-review"]),
    "receiving-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["receiving-code-review"])
});
const ROLES_SCHEMA = Schema.object({
    "dsmm-orchestrator": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-orchestrator"]),
    "dsmm-planner": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-planner"]),
    "dsmm-plan-critic": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-plan-critic"]),
    "dsmm-reviewer": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-reviewer"]),
    "dsmm-code-search": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-code-search"]),
    "dsmm-doc-search": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-doc-search"]),
    "dsmm-clarifier": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-clarifier"]),
    "dsmm-media-reader": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.roles["dsmm-media-reader"])
});
const PRESETS_SCHEMA = Schema.object({
    materialize: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.presets.materialize),
    root: Schema.string()
});
const DEEPSEEK_CALIBRATION_SCHEMA = Schema.union([
    Schema.const("off"),
    Schema.const("auto"),
    Schema.const("strict")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration);
export const DSMM_CONFIG_SCHEMA = Schema.object({
    modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
    section: Schema.string(),
    defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
    promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
    deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
    skills: SKILLS_SCHEMA,
    roles: ROLES_SCHEMA,
    presets: PRESETS_SCHEMA
});
export const DSMM_SETTINGS_SCHEMA = Schema.object({
    modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
    defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
    promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
    deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
    skills: SKILLS_SCHEMA,
    roles: ROLES_SCHEMA,
    presets: PRESETS_SCHEMA
});
export function resolveConfig(config = {}) {
    return {
        modeName: config.modeName ?? DEFAULT_DSMM_SETTINGS.modeName,
        defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
        promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
        deepseekV4ProCalibration: config.deepseekV4ProCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration,
        skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills },
        roles: { ...DEFAULT_DSMM_SETTINGS.roles, ...config.roles },
        presets: resolvePresetSettings(config.presets)
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
export function registerSettings(ctx, config = {}, options = {}) {
    const base = resolveConfig(config);
    let getSettings = () => base;
    let attached = false;
    const attach = (settings) => {
        if (settings === undefined)
            return;
        const scope = settings.register(DSMM_SETTINGS_NAMESPACE, DSMM_SETTINGS_SCHEMA, { base, applies: "restart" });
        getSettings = () => scope.get();
        attached = true;
        options.onChange?.(scope.get());
    };
    if (ctx.inject !== undefined) {
        ctx.inject(["settings"], (services) => attach(services.settings));
        return () => getSettings();
    }
    if (Object.prototype.hasOwnProperty.call(ctx, "settings")) {
        attach(Object.getOwnPropertyDescriptor(ctx, "settings")?.value);
    }
    if (!attached)
        options.onChange?.(base);
    return () => getSettings();
}
//# sourceMappingURL=settings.js.map