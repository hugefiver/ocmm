import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { DsmmProfileAdmission } from "./settings.js";
import type { HistoryCandidates, HistoryNativeAdmission, HistoryOperator } from "./history-contract.js";
import type { HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryFailure, HistoryFailureCode, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";
export declare class HistoryRefusal extends Error {
    readonly code: HistoryFailureCode;
    readonly storageEffects: HistoryFailure["storageEffects"];
    constructor(code: HistoryFailureCode, storageEffects?: HistoryFailure["storageEffects"]);
}
/** Host-only one-operation intents around the native history and activation APIs. */
export declare class HistoryContinuations extends Service {
    private readonly candidates;
    private readonly admission;
    readonly lifetime: AbortController;
    private readonly intents;
    private readonly prepared;
    private guardedLoop;
    private readonly cleanups;
    constructor(ctx: Context, candidates: HistoryCandidates, admission: HistoryNativeAdmission);
    private compatibility;
    private visible;
    private ready;
    private compatible;
    describe(input: string, operator: HistoryOperator): Promise<HistoryStatus>;
    choices(operator: HistoryOperator): Promise<HistoryChoices>;
    preview(input: HistoryPreviewRequest, operator: HistoryOperator): Promise<HistoryPreview>;
    private check;
    /** Called only by NativeAdmission.created for the exact unpublished continuation candidate. */
    admissionForCreated(agent: Agent): DsmmProfileAdmission | undefined;
    private authorize;
    confirm(input: HistoryConfirmRequest, operator: HistoryOperator): Promise<HistoryContinuationResult>;
    private release;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmHistoryContinuation: HistoryContinuations;
    }
}
export declare function historyFailure(error: unknown): HistoryFailure;
//# sourceMappingURL=history-controller.d.ts.map