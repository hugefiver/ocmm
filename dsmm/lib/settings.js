import Schema from "@deepseek-ai/schemastery";
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
    }
};
const SKILLS_SCHEMA = Schema.object({
    brainstorming: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills.brainstorming),
    "writing-plans": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["writing-plans"]),
    "requesting-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["requesting-code-review"]),
    "receiving-code-review": Schema.boolean().default(DEFAULT_DSMM_SETTINGS.skills["receiving-code-review"])
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
    skills: SKILLS_SCHEMA
});
export const DSMM_SETTINGS_SCHEMA = Schema.object({
    modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
    defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
    promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
    deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
    skills: SKILLS_SCHEMA
});
export function resolveConfig(config = {}) {
    return {
        modeName: config.modeName ?? DEFAULT_DSMM_SETTINGS.modeName,
        defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
        promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
        deepseekV4ProCalibration: config.deepseekV4ProCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration,
        skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills }
    };
}
export function registerSettings(ctx, config = {}) {
    const base = resolveConfig(config);
    let getSettings = () => base;
    const attach = (settings) => {
        if (settings === undefined)
            return;
        const scope = settings.register(DSMM_SETTINGS_NAMESPACE, DSMM_SETTINGS_SCHEMA, { base, applies: "restart" });
        getSettings = () => scope.get();
    };
    if (ctx.inject !== undefined) {
        ctx.inject(["settings"], (services) => attach(services.settings));
    }
    else if (Object.prototype.hasOwnProperty.call(ctx, "settings")) {
        attach(Object.getOwnPropertyDescriptor(ctx, "settings")?.value);
    }
    return () => getSettings();
}
//# sourceMappingURL=settings.js.map