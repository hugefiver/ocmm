import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { HistoryContinuations } from "./history-controller.js";
import type { HistoryCandidates, HistoryNativeAdmission } from "./history-contract.js";
import type { HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";
/** Native authenticated local-operator RPC; browser payloads carry no admission authority. */
export declare class DsmmHistoryHost extends TypertRemoteService {
    private readonly history;
    private readonly lifetime;
    constructor(ctx: Context, history: HistoryContinuations);
    private operator;
    private invoke;
    describe(sessionId: string): Promise<HistoryStatus>;
    choices(): Promise<HistoryChoices>;
    preview(sessionId: string, input: HistoryPreviewRequest): Promise<HistoryPreview>;
    confirm(sessionId: string, input: HistoryConfirmRequest): Promise<HistoryContinuationResult>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmHistory: DsmmHistoryHost;
    }
}
export declare function registerHistoryContinuationRpc(ctx: Context, candidates: HistoryCandidates, admission: HistoryNativeAdmission): DsmmHistoryHost;
//# sourceMappingURL=history-rpc.d.ts.map