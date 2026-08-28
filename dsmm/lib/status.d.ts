import type { DshAgent } from "./dsh-types.js";
import type { DsmmModelFamily } from "./model-family.js";
import type { DeepseekCalibration, DsmmSettings } from "./settings.js";
export declare const DSMM_STATUS_VERSION: 1;
export interface DsmmStatusSnapshot {
    version: typeof DSMM_STATUS_VERSION;
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
        currentReasoningEffort?: string;
    };
    calibration: {
        mode: DeepseekCalibration;
        applies: boolean;
        policyEffort?: "off" | "low" | "high" | "max";
        action: "disabled" | "out-of-scope" | "non-target-route" | "preserve-explicit" | "fill-missing" | "enforce";
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
}
export declare function createDsmmStatusSnapshot(input: {
    agent: DshAgent;
    settings: DsmmSettings;
    modeActive: boolean;
}): DsmmStatusSnapshot;
export declare function formatDsmmStatus(snapshot: DsmmStatusSnapshot): string;
//# sourceMappingURL=status.d.ts.map