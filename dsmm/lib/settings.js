import Schema from "@deepseek-ai/schemastery";
import { DEFAULT_DSMM_LSP_SETTINGS, resolveLspSettings } from "./lsp.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import { DSMM_SKILL_NAMES } from "./skills.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export const DSMM_SETTINGS_NAMESPACE = "dsmm";
export const DEFAULT_DSMM_SETTINGS = {
    modeName: "deepwork",
    defaultActive: false,
    promptOrder: 50,
    deepseekV4ProCalibration: "auto",
    skills: createDefaultSkillSettings(),
    roles: createDefaultRoleSettings(),
    presets: {
        materialize: false
    },
    workflow: {
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
    lsp: DEFAULT_DSMM_LSP_SETTINGS
};
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
const FINAL_REVIEW_POLICY_SCHEMA = Schema.union([
    Schema.const("simple-oracle-complex-reviewer"),
    Schema.const("reviewer-only"),
    Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.workflow.finalReviewPolicy);
const WORKFLOW_SCHEMA = Schema.object({
    strictGates: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.workflow.strictGates),
    reviewCap: Schema.number().default(DEFAULT_DSMM_SETTINGS.workflow.reviewCap),
    finalReviewPolicy: FINAL_REVIEW_POLICY_SCHEMA
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
const DEEPSEEK_CALIBRATION_SCHEMA = Schema.union([
    Schema.const("off"),
    Schema.const("auto"),
    Schema.const("strict")
]).default(DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration);
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
export const DSMM_CONFIG_SCHEMA = Schema.object({
    modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
    section: Schema.string(),
    defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
    promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
    deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
    skills: SKILLS_SCHEMA,
    roles: ROLES_SCHEMA,
    presets: PRESETS_SCHEMA,
    workflow: WORKFLOW_SCHEMA,
    guards: GUARDS_SCHEMA,
    lsp: LSP_SCHEMA
});
export const DSMM_SETTINGS_SCHEMA = Schema.object({
    modeName: Schema.string().default(DEFAULT_DSMM_SETTINGS.modeName),
    defaultActive: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.defaultActive),
    promptOrder: Schema.number().default(DEFAULT_DSMM_SETTINGS.promptOrder),
    deepseekV4ProCalibration: DEEPSEEK_CALIBRATION_SCHEMA,
    skills: SKILLS_SCHEMA,
    roles: ROLES_SCHEMA,
    presets: PRESETS_SCHEMA,
    workflow: WORKFLOW_SCHEMA,
    guards: GUARDS_SCHEMA,
    lsp: LSP_SCHEMA
});
export function resolveConfig(config = {}) {
    return {
        modeName: config.modeName ?? DEFAULT_DSMM_SETTINGS.modeName,
        defaultActive: config.defaultActive ?? DEFAULT_DSMM_SETTINGS.defaultActive,
        promptOrder: config.promptOrder ?? DEFAULT_DSMM_SETTINGS.promptOrder,
        deepseekV4ProCalibration: config.deepseekV4ProCalibration ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProCalibration,
        skills: { ...DEFAULT_DSMM_SETTINGS.skills, ...config.skills },
        roles: { ...DEFAULT_DSMM_SETTINGS.roles, ...config.roles },
        presets: resolvePresetSettings(config.presets),
        workflow: resolveWorkflowSettings(config.workflow),
        guards: resolveGuardSettings(config.guards),
        lsp: resolveLspSettings(config.lsp)
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
    return {
        ...DEFAULT_DSMM_SETTINGS.workflow,
        ...config
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
function normalizePositiveInteger(value, defaultValue) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        return defaultValue;
    return Math.floor(value);
}
export function registerSettings(ctx, config = {}, options = {}) {
    const base = resolveConfig(config);
    let getSettings = () => base;
    let attached = false;
    const installedSettingsByReadyContext = new WeakMap();
    const ready = (readyCtx, settings) => {
        if (settings === undefined || installedSettingsByReadyContext.get(readyCtx) === settings)
            return;
        const scope = settings.register(DSMM_SETTINGS_NAMESPACE, DSMM_SETTINGS_SCHEMA, { base, applies: "restart" });
        const previousGetSettings = getSettings;
        const previousAttached = attached;
        getSettings = () => scope.get();
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