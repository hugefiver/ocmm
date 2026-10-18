import type { Context } from "@deepseek-ai/cordis";
import type { SessionInspection } from "@deepseek-ai/dsh-session-persistence";
import type { NativeAdmission } from "./native-admission.js";
import type { DsmmProfileRuntime } from "./profile-runtime.js";
import type { DsmmDeploymentConfig } from "./deployment-config.js";
import type { HistoryCandidate, HistoryCandidates } from "./history-contract.js";
import type { HistoryPreviewRequest } from "./history-types.js";
/** Current deployment/profile and native composition only; history supplies content and restrictive ceilings. */
export declare class DsmmHistoryCandidates implements HistoryCandidates {
    private readonly ctx;
    private readonly profiles;
    private readonly deployment;
    private readonly admission;
    readonly signal: AbortSignal;
    private modelGeneration;
    constructor(ctx: Context, profiles: DsmmProfileRuntime, deployment: DsmmDeploymentConfig, admission: NativeAdmission);
    checkCompatibility(): Promise<void>;
    choices(signal: AbortSignal): Promise<{
        presets: {
            id: string;
            label: string;
        }[];
        profiles: {
            id: string;
            label: string;
        }[];
    }>;
    prepare(request: HistoryPreviewRequest, inspection: SessionInspection, signal: AbortSignal): Promise<HistoryCandidate>;
}
//# sourceMappingURL=history-candidates.d.ts.map