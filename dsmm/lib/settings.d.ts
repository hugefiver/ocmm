import Schema from "@deepseek-ai/schemastery";
import type { DshAgent, DshContext } from "./dsh-types.js";
import type { DsmmLspSettings } from "./lsp.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSkillName } from "./skills.js";
import type { DsmmRateLimitPolicy, DsmmRoutingStrategy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "./routing-policy.js";
import type { DeploymentSchemaNode } from "./profile-types.js";
import type { DsmmLocale } from "./profile-locale.js";
import type { ModelRouteJson } from "./route-json.js";
import type { PermissionControlSchemaInput, PermissionControlSettings } from "./permission-settings.js";
export { DSMM_LOCALES } from "./profile-locale.js";
export type { DsmmLocale } from "./profile-locale.js";
export type { DsmmRateLimitPolicy, DsmmRoutingStrategy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "./routing-policy.js";
export { resolveRoleRuntimePolicy } from "./routing-policy.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./skills.js";
export type { DsmmSkillName, MvpSkillName } from "./skills.js";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off";
export type DsmmGitWritePolicy = "ask" | "deny" | "off";
export type DsmmInvocationLevel = "normal" | "low" | "high" | "max";
export type DsmmLevelOverride = {
    reasoningEffort: string;
    provider?: never;
    model?: never;
} | DsmmModelRoute;
export interface DsmmInvocationOptions {
    level?: DsmmInvocationLevel;
    route?: DsmmLevelOverride;
}
export type DsmmToolTopology = "per-role" | "parameterized";
export interface DsmmWorkflowSettings {
    policy: "risk-based" | "legacy";
    strictGates: boolean;
    reviewCap: number;
    finalReviewPolicy: DsmmFinalReviewPolicy;
}
export interface DsmmPresetSettings {
    materialize: boolean;
    /** Startup-pinned root exposure only; workflow Planner delegation stays enabled. */
    plannerRootEnabled: boolean;
    root?: string;
}
export interface DsmmSubagentSettings {
    toolTopology: DsmmToolTopology;
    allowRouteOverride: boolean;
    enableRunInBackground: boolean;
    backgroundMode: "one-shot" | "continuable";
    /** Omitted delegates to the native host limit (rc.2 default 1). */
    maxDepth?: number;
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
export type DsmmModelRoute = ModelRouteJson;
export type DsmmRecoveryRoute = DsmmModelRoute;
export interface DsmmRoleRoutingConfig {
    levels?: Partial<Record<Exclude<DsmmInvocationLevel, "normal">, DsmmLevelOverride>>;
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
    fallbackRoutes?: DsmmRecoveryRoute[];
    idleContinuation?: Partial<DsmmRuntimeRecoverySettings["idleContinuation"]>;
};
export interface DsmmPluginConfig {
    /** Deployment-only; the mounted permission owner retains its cold-start policy. */
    permissionControl?: PermissionControlSchemaInput;
    modelParameters?: {
        passthrough?: boolean;
    };
    locale?: DsmmLocale;
    /** Only global deployment input; native/legacy profile transport rejects it. */
    modules?: {
        deepwork?: {
            enabled?: boolean;
        };
    };
    modeName?: string;
    section?: string;
    defaultActive?: boolean;
    promptOrder?: number;
    skills?: Partial<Record<DsmmSkillName, boolean>>;
    roles?: Partial<Record<DsmmRoleId, boolean>>;
    roleRouting?: DsmmRoleRouting;
    runtimePolicy?: DsmmRuntimePolicyConfig;
    presets?: Partial<DsmmPresetSettings>;
    subagents?: Partial<DsmmSubagentSettings>;
    workflow?: Partial<DsmmWorkflowSettings>;
    guards?: DsmmGuardConfig;
    runtimeRecovery?: DsmmRuntimeRecoveryConfig;
    lsp?: Partial<DsmmLspSettings>;
}
export type DsmmNativeConfig = DsmmPluginConfig;
export interface DsmmSettings {
    permissionControl: PermissionControlSettings;
    modelParameters: {
        passthrough: boolean;
    };
    locale?: DsmmLocale;
    modules: {
        deepwork: {
            enabled: boolean;
        };
    };
    modeName: string;
    defaultActive: boolean;
    promptOrder: number;
    skills: Record<DsmmSkillName, boolean>;
    roles: Record<DsmmRoleId, boolean>;
    roleRouting: DsmmRoleRouting;
    runtimePolicy: DsmmRuntimePolicySettings;
    presets: DsmmPresetSettings;
    subagents: DsmmSubagentSettings;
    workflow: DsmmWorkflowSettings;
    guards: DsmmGuardSettings;
    runtimeRecovery: DsmmRuntimeRecoverySettings;
    lsp: DsmmLspSettings;
}
export type DsmmProfileScope = "global-default" | "session-override" | "deployment-baseline";
export interface DsmmProfileAdmission {
    childCapture?: import("./child-capture.js").ChildAdmissionCapture;
    childEvidence?: import("./child-capture.js").ChildAdmissionEvidenceView;
    warnings?: import("./profile-diagnostics.js").ProfileDiagnostic[];
    roleAvailability?: import("./profile-types.js").DsmmRoleAvailabilityState[];
    subagentRuntime?: import("./profile-types.js").SubagentRuntimeAdmissionView;
    settings: DsmmSettings;
    profile: {
        id: string;
        revision: string;
    } | null;
    readonly epoch: string;
    scope: DsmmProfileScope;
    deployment?: DsmmDeploymentSnapshot;
    restartRequired?: readonly string[];
    sources?: Record<string, "defaults" | "global" | "profile" | "named-session">;
    sourceCaptures?: {
        startup?: {
            globalRevision: string;
            nativeRevision: string;
        };
        /** Deployment refers to this admission's captured desired snapshot, never latest disk. */
        fields: Record<string, "startup" | "deployment" | "named-session">;
    };
    store?: {
        origin: "central" | "legacy" | "explicit";
        readOnly: boolean;
        writeRestriction?: string;
    };
}
export interface DsmmDeploymentSnapshot {
    settings: DsmmSettings;
    global: DsmmPluginConfig;
    profile: DsmmPluginConfig;
    globalRevision: string;
    nativeRevision: string;
    /** Native configForms CAS when its public descriptor is available; raw hash is not that CAS. */
    nativeFormRevision?: number;
    nativeNamespace?: string;
    /** Public native base/user provenance; profile above is the assembled explicit entry layer. */
    nativeForm?: {
        base?: unknown;
        user?: unknown;
    };
    entryId: string;
    hostProfileKey: string;
    sources: Record<string, "defaults" | "global" | "profile">;
}
/** Runtime consumers pass their Agent so immutable profile admission is retained. */
export type DsmmSettingsGetter = ((agent?: DshAgent) => DsmmSettings) & {
    admission?: (agent?: DshAgent) => DsmmProfileAdmission;
    moduleStates?: (agent?: DshAgent) => import("./modules.js").DsmmModuleState[];
    subagentRuntime?: () => import("./profile-types.js").SubagentRuntimeAdmissionView;
};
export interface DsmmResolvedRoleRuntimePolicy {
    readonly strategy: DsmmRoutingStrategy;
    readonly rateLimit: Readonly<DsmmRateLimitPolicy>;
    readonly primary?: Readonly<DsmmModelRoute>;
    readonly fallbackRoutes: readonly Readonly<DsmmModelRoute>[];
    readonly fallbackSource: "role" | "global";
}
export declare const DSMM_STATUS_COMMAND = "dsmm-status";
export interface RegisterSettingsOptions {
    /** Already resolved/captured internal settings, never external profile input. */
    resolved?: DsmmSettings;
    onChange?: (settings: DsmmSettings) => void;
    install?: (readyCtx: DshContext, getSettings: () => DsmmSettings) => void;
}
export declare const DEFAULT_DSMM_SETTINGS: DsmmSettings;
/** Only data is transported. Defaults remain resolved by the existing authority. */
export declare function deploymentEditorSchema(native?: boolean): DeploymentSchemaNode;
export declare const DSMM_CONFIG_SCHEMA: Schema<DsmmNativeConfig>;
export declare const DSMM_NATIVE_CONFIG_SCHEMA: Schema<DsmmNativeConfig>;
export declare function validateNativeConfig(input: unknown): DsmmNativeConfig;
export declare const DSMM_SETTINGS_SCHEMA: Schema<DsmmSettings>;
export declare function resolveConfig(config?: DsmmPluginConfig): DsmmSettings;
/** Reject references, accessors, prototypes and non-JSON data before any merge. */
export declare function copyJson<T>(input: T): T;
export declare function freezeSettings<T>(input: T): T;
/** Sparse grammar and full semantic validation are separate from native refs. */
export declare function validateSparseConfig(input: unknown, global?: boolean): DsmmPluginConfig;
export declare function validateDeploymentPath(path: readonly string[]): void;
export declare function mergeConfigLayers(...layers: DsmmPluginConfig[]): DsmmPluginConfig;
export declare function resolveDeployment(global: DsmmPluginConfig, profile: DsmmPluginConfig): DsmmSettings;
export declare function validateResolvedSettings(settings: DsmmSettings): DsmmSettings;
export declare function rejectDeprecatedFields(input: object, prefix?: string): void;
export declare function validateLocale(value: unknown, field?: string): asserts value is DsmmLocale;
export declare function normalizeLevelOverride(value: unknown, field?: string): DsmmLevelOverride;
export declare function resolveRoleRouting(input: DsmmRoleRouting | undefined): DsmmRoleRouting;
export declare function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean;
/** Native standing-root availability is independent of child role enablement. */
export declare function isRootRoleEnabled(settings: DsmmSettings, id: DsmmRoleId): boolean;
export declare function resolveGuardSettings(config: DsmmPluginConfig["guards"]): DsmmGuardSettings;
export declare function registerSettings(ctx: DshContext, config?: DsmmPluginConfig, options?: RegisterSettingsOptions): () => DsmmSettings;
//# sourceMappingURL=settings.d.ts.map