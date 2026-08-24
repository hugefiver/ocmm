import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
import type { DsmmLspSettings } from "./lsp.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSkillName } from "./skills.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export type { DsmmSkillName, MvpSkillName } from "./skills.js";
export type DeepseekCalibration = "off" | "auto" | "strict";
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
type DsmmGuardConfig = Partial<Omit<DsmmGuardSettings, "toolOutputTruncation" | "questionLabelHelper">> & {
    toolOutputTruncation?: Partial<DsmmGuardSettings["toolOutputTruncation"]>;
    questionLabelHelper?: Partial<DsmmGuardSettings["questionLabelHelper"]>;
};
export interface DsmmPluginConfig {
    modeName?: string;
    section?: string;
    deepseekV4ProCalibration?: DeepseekCalibration;
    defaultActive?: boolean;
    promptOrder?: number;
    skills?: Partial<Record<DsmmSkillName, boolean>>;
    roles?: Partial<Record<DsmmRoleId, boolean>>;
    presets?: Partial<DsmmPresetSettings>;
    workflow?: Partial<DsmmWorkflowSettings>;
    guards?: DsmmGuardConfig;
    lsp?: Partial<DsmmLspSettings>;
}
export interface DsmmSettings {
    modeName: string;
    defaultActive: boolean;
    promptOrder: number;
    deepseekV4ProCalibration: DeepseekCalibration;
    skills: Record<DsmmSkillName, boolean>;
    roles: Record<DsmmRoleId, boolean>;
    presets: DsmmPresetSettings;
    workflow: DsmmWorkflowSettings;
    guards: DsmmGuardSettings;
    lsp: DsmmLspSettings;
}
export declare const DSMM_SETTINGS_NAMESPACE = "dsmm";
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