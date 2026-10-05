import Schema from "@deepseek-ai/schemastery";
import type { DshAgent, DshContext } from "./dsh-types.js";
import type { DsmmLspSettings } from "./lsp.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSkillName } from "./skills.js";
import type { DsmmRateLimitPolicy, DsmmRoutingStrategy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "./routing-policy.js";
export type { DsmmRateLimitPolicy, DsmmRoutingStrategy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "./routing-policy.js";
export { resolveRoleRuntimePolicy } from "./routing-policy.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export type { DsmmSkillName, MvpSkillName } from "./skills.js";
export type DeepseekCalibration = "off" | "auto" | "strict";
export type DeepseekDefaultReasoningEffort = "off" | "low" | "high";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off";
export type DsmmGitWritePolicy = "ask" | "deny" | "off";
export interface DsmmWorkflowSettings {
    policy: "risk-based" | "legacy";
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
export interface DsmmModelRoute {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export interface DsmmRecoveryRoute extends DsmmModelRoute {
}
export interface DsmmRoleRoutingConfig {
    primary?: DsmmModelRoute;
    fallbackRoutes?: DsmmModelRoute[];
    strategy?: DsmmRoutingStrategy;
    rateLimit?: Partial<DsmmRateLimitPolicy>;
}
export type DsmmRoleRouting = Partial<Record<DsmmRoleId, DsmmRoleRoutingConfig>>;
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
    /** Startup-only native storage binding; never a runtime-profile field. */
    sessionPersistence?: {
        root: string;
        compression?: "zstd" | "none";
    };
    modeName?: string;
    section?: string;
    deepseekV4ProCalibration?: DeepseekCalibration;
    deepseekV4ProDefaultReasoningEffort?: DeepseekDefaultReasoningEffort;
    deepseekV4ProMaxReasoningPresets?: DsmmRoleId[];
    deepseekFlashCalibration?: DeepseekCalibration;
    deepseekFlashDefaultReasoningEffort?: DeepseekDefaultReasoningEffort;
    deepseekFlashMaxReasoningPresets?: DsmmRoleId[];
    defaultActive?: boolean;
    promptOrder?: number;
    skills?: Partial<Record<DsmmSkillName, boolean>>;
    roles?: Partial<Record<DsmmRoleId, boolean>>;
    roleRouting?: DsmmRoleRouting;
    runtimePolicy?: DsmmRuntimePolicyConfig;
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
    deepseekFlashCalibration: DeepseekCalibration;
    deepseekFlashDefaultReasoningEffort: DeepseekDefaultReasoningEffort;
    deepseekFlashMaxReasoningPresets: DsmmRoleId[];
    skills: Record<DsmmSkillName, boolean>;
    roles: Record<DsmmRoleId, boolean>;
    roleRouting: DsmmRoleRouting;
    runtimePolicy: DsmmRuntimePolicySettings;
    presets: DsmmPresetSettings;
    workflow: DsmmWorkflowSettings;
    guards: DsmmGuardSettings;
    runtimeRecovery: DsmmRuntimeRecoverySettings;
    lsp: DsmmLspSettings;
}
export type DsmmProfileScope = "global-default" | "session-override" | "deployment-baseline";
export interface DsmmProfileAdmission {
    settings: DsmmSettings;
    profile: {
        id: string;
        revision: string;
    } | null;
    epoch: string;
    scope: DsmmProfileScope;
}
/** Runtime consumers pass their Agent so immutable profile admission is retained. */
export type DsmmSettingsGetter = ((agent?: DshAgent) => DsmmSettings) & {
    admission?: (agent?: DshAgent) => DsmmProfileAdmission;
};
export interface DsmmResolvedRoleRuntimePolicy {
    readonly strategy: DsmmRoutingStrategy;
    readonly rateLimit: Readonly<DsmmRateLimitPolicy>;
    readonly primary?: Readonly<DsmmModelRoute>;
    readonly fallbackRoutes: readonly Readonly<DsmmModelRoute>[];
    readonly fallbackSource: "role" | "global";
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
export declare function resolveRoleRouting(input: DsmmRoleRouting | undefined): DsmmRoleRouting;
export declare function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean;
export declare function resolveGuardSettings(config: DsmmPluginConfig["guards"]): DsmmGuardSettings;
export declare function registerSettings(ctx: DshContext, config?: DsmmPluginConfig, options?: RegisterSettingsOptions): () => DsmmSettings;
//# sourceMappingURL=settings.d.ts.map