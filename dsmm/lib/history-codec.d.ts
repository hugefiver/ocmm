import type { HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryFailure, HistoryJson, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";
export declare function historySessionId(input: unknown): string;
export declare function historyJson(input: unknown, depth?: number, active?: Set<object>): HistoryJson;
export declare function parseHistoryFailure(input: unknown): HistoryFailure;
export declare function parseHistoryStatus(input: unknown): HistoryStatus;
export declare function parseHistoryChoices(input: unknown): HistoryChoices;
export declare function parseHistoryPreviewRequest(input: unknown): HistoryPreviewRequest;
export declare function parseHistoryConfirmRequest(input: unknown): HistoryConfirmRequest;
export declare function parseHistoryPreview(input: unknown): HistoryPreview;
export declare function parseHistoryResult(input: unknown): HistoryContinuationResult;
//# sourceMappingURL=history-codec.d.ts.map