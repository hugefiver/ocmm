import type { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryFailure, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";
import { parseHistoryFailure } from "./history-codec.js";
export interface DsmmHistoryRemote {
    describe(sessionId: string): Promise<RemoteResult<HistoryStatus>>;
    choices(): Promise<RemoteResult<HistoryChoices>>;
    preview(sessionId: string, request: HistoryPreviewRequest): Promise<RemoteResult<HistoryPreview>>;
    confirm(sessionId: string, request: HistoryConfirmRequest): Promise<RemoteResult<HistoryContinuationResult>>;
}
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface TypertRemoteMap {
        "dsmmHistory/describe": DsmmHistoryRemote["describe"];
        "dsmmHistory/choices": DsmmHistoryRemote["choices"];
        "dsmmHistory/preview": DsmmHistoryRemote["preview"];
        "dsmmHistory/confirm": DsmmHistoryRemote["confirm"];
    }
    interface TypertRemoteNamespaceMap {
        dsmmHistory: DsmmHistoryRemote;
    }
    interface RemoteErrorDetailsMap {
        "dsmm-history/refused": HistoryFailure;
    }
}
export declare const HISTORY_REMOTE: TypertRemoteContribution;
export declare const HISTORY_HOST: TypertContribution;
export { parseHistoryFailure };
//# sourceMappingURL=history-remote.d.ts.map