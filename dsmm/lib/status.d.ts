import type { DshAgent } from "./dsh-types.js";
import type { DsmmModelFamily } from "./model-family.js";
import type { DsmmRoleId } from "./roles.js";
import type { DeepseekCalibration, DsmmModelRoute, DsmmProfileAdmission, DsmmSettings } from "./settings.js";
import type { DsmmRateLimitPolicy, DsmmRoutingStrategy } from "./routing-policy.js";
import type { DsmmRoleRuntimeState } from "./profile-types.js";
import type { DsmmLspRuntimeState } from "./lsp.js";
import type { DsmmModuleState } from "./modules.js";
export declare const DSMM_STATUS_VERSION: 1;
export interface DsmmStatusSnapshot {
    version: typeof DSMM_STATUS_VERSION;
    modules?: DsmmModuleState[];
    admission?: Pick<DsmmProfileAdmission, "profile" | "epoch" | "scope">;
    profileStore?: DsmmProfileAdmission["store"];
    deployment?: {
        globalRevision: string;
        nativeRevision: string;
        entryId: string;
        hostProfileKey: string;
        restartRequired: readonly string[];
        sources: Record<string, string>;
        sourceCaptures?: {
            fields: Record<string, string>;
            startup?: {
                globalRevision: string;
                nativeRevision: string;
            };
        };
    };
    mode: {
        name: string;
        active: boolean;
        selectedPreset?: string;
        dsmmPreset: boolean;
        inScope: boolean;
    };
    route: {
        provider?: string;
        model?: string;
        family: DsmmModelFamily;
        deepseekV4Pro: boolean;
        deepseekFlash: boolean;
        currentReasoningEffort?: string;
    };
    calibration: {
        mode: DeepseekCalibration;
        applies: boolean;
        policyEffort?: "off" | "low" | "high" | "max";
        action: "disabled" | "out-of-scope" | "non-target-route" | "preserve-explicit" | "fill-missing" | "enforce" | "native-owned" | "fixed-role-policy";
    };
    rolePolicy: {
        role?: DsmmRoleId;
        applies: boolean;
        primary?: DsmmModelRoute;
        fallbackRoutes: DsmmModelRoute[];
        fallbackSource: "role" | "global" | "disabled";
        strategy: DsmmRoutingStrategy;
        rateLimit: DsmmRateLimitPolicy;
        runtimeState?: DsmmRoleRuntimeState;
        diagnostic?: "invalid-child-descriptor";
    };
    runtimeRecovery: {
        enabled: boolean;
        applies: boolean;
        fallbackRouteCount: number;
        maxFallbackAttempts: number;
        idleContinuation: {
            enabled: boolean;
            maxContinuations: number;
        };
    };
    effectiveSettings: DsmmSettings;
    lspRuntime?: DsmmLspRuntimeState;
}
export declare function createDsmmStatusSnapshot(input: {
    agent: DshAgent;
    settings: DsmmSettings;
    modeActive: boolean;
    admission?: DsmmProfileAdmission;
    roleRuntimeState?: DsmmRoleRuntimeState;
    modules?: DsmmModuleState[];
}): DsmmStatusSnapshot;
export declare function formatDsmmStatus(snapshot: DsmmStatusSnapshot): string;
/** Read-only diagnostics only; never use this copy as configuration input. */
export declare function readOnlySettings(settings: DsmmSettings): DsmmSettings;
/** Environment key names may themselves contain private data. */
export declare function readOnlySettingSources(fields: Readonly<Record<string, string>>): Record<string, string>;
//# sourceMappingURL=status.d.ts.map