import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
import type { DsmmLspSettings } from "./lsp.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSkillName } from "./skills.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export type { DsmmSkillName, MvpSkillName } from "./skills.js";
export type DeepseekCalibration = "off" | "auto" | "strict";
export type DeepseekDefaultReasoningEffort = "off" | "low" | "high";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off";
export type DsmmGitWritePolicy = "ask" | "deny" | "off";
export interface DsmmWorkflowSettings {
    strictGates: boolean;
    reviewCap: number;
    finalReviewPolicy: DsmmFinalReviewPolicy;
}
export interface DsmmPresetSettings {
    materialize: boolean;
    root?: string;
}
export interface DsmmGuardSettings {
    scope: DsmmGuardScope;
    shellCommandSafety: boolean;
    gitWriteGuard: DsmmGitWritePolicy;
    toolOutputTruncation: {
        enabled: boolean;
        maxInlineBytes: number;
    };
    planFormatValidation: boolean;
    questionLabelHelper: {
        enabled: boolean;
        maxLabelChars: number;
    };
    todoDisciplineHelper: boolean;
}
export interface DsmmRecoveryRoute {
    provider: string;
    model: string;
}
export interface DsmmRuntimeRecoverySettings {
    enabled: boolean;
    retryOnStatusCodes: number[];
    retryOnCodes: string[];
    fallbackRoutes: DsmmRecoveryRoute[];
    maxFallbackAttempts: number;
    idleContinuation: {
        enabled: boolean;
        maxContinuations: number;
        prompt: string;
    };
}
type DsmmGuardConfig = Partial<Omit<DsmmGuardSettings, "toolOutputTruncation" | "questionLabelHelper">> & {
    toolOutputTruncation?: Partial<DsmmGuardSettings["toolOutputTruncation"]>;
    questionLabelHelper?: Partial<DsmmGuardSettings["questionLabelHelper"]>;
};
type DsmmRuntimeRecoveryConfig = Partial<Omit<DsmmRuntimeRecoverySettings, "fallbackRoutes" | "idleContinuation">> & {
    fallbackRoutes?: Array<Partial<DsmmRecoveryRoute>>;
    idleContinuation?: Partial<DsmmRuntimeRecoverySettings["idleContinuation"]>;
};
export interface DsmmPluginConfig {
    modeName?: string;
    section?: string;
    deepseekV4ProCalibration?: DeepseekCalibration;
    deepseekV4ProDefaultReasoningEffort?: DeepseekDefaultReasoningEffort;
    deepseekV4ProMaxReasoningPresets?: DsmmRoleId[];
    defaultActive?: boolean;
    promptOrder?: number;
    skills?: Partial<Record<DsmmSkillName, boolean>>;
    roles?: Partial<Record<DsmmRoleId, boolean>>;
    presets?: Partial<DsmmPresetSettings>;
    workflow?: Partial<DsmmWorkflowSettings>;
    guards?: DsmmGuardConfig;
    runtimeRecovery?: DsmmRuntimeRecoveryConfig;
    lsp?: Partial<DsmmLspSettings>;
}
export interface DsmmSettings {
    modeName: string;
    defaultActive: boolean;
    promptOrder: number;
    deepseekV4ProCalibration: DeepseekCalibration;
    deepseekV4ProDefaultReasoningEffort: DeepseekDefaultReasoningEffort;
    deepseekV4ProMaxReasoningPresets: DsmmRoleId[];
    skills: Record<DsmmSkillName, boolean>;
    roles: Record<DsmmRoleId, boolean>;
    presets: DsmmPresetSettings;
    workflow: DsmmWorkflowSettings;
    guards: DsmmGuardSettings;
    runtimeRecovery: DsmmRuntimeRecoverySettings;
    lsp: DsmmLspSettings;
}
export declare const DSMM_SETTINGS_NAMESPACE = "dsmm";
export declare const DSMM_STATUS_COMMAND = "dsmm-status";
export interface RegisterSettingsOptions {
    onChange?: (settings: DsmmSettings) => void;
    install?: (readyCtx: DshContext, getSettings: () => DsmmSettings) => void;
}
export declare const DEFAULT_DSMM_SETTINGS: DsmmSettings;
export declare const DSMM_CONFIG_SCHEMA: Schema<DsmmPluginConfig>;
export declare const DSMM_SETTINGS_SCHEMA: Schema<DsmmSettings>;
export declare function resolveConfig(config?: DsmmPluginConfig): DsmmSettings;
export declare function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean;
export declare function resolveGuardSettings(config: DsmmPluginConfig["guards"]): DsmmGuardSettings;
export declare function registerSettings(ctx: DshContext, config?: DsmmPluginConfig, options?: RegisterSettingsOptions): () => DsmmSettings;
//# sourceMappingURL=settings.d.ts.map