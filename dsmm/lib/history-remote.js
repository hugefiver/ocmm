import { historyJson, historySessionId, parseHistoryChoices, parseHistoryConfirmRequest, parseHistoryFailure, parseHistoryPreview, parseHistoryPreviewRequest, parseHistoryResult, parseHistoryStatus } from "./history-codec.js";
function codec(name, parse) {
    return { mode: "strict", typeSymbol: `@dsmm/dsmm#${name}`, create: () => ({ parse: value => parse(historyJson(value)) }) };
}
function descriptor(method, result, request, session = true) {
    return { id: `@dsmm/dsmm-history#dsmmHistory/${method}`, service: "dsmmHistory", namespace: "dsmmHistory", method, invocation: { kind: "direct" },
        parameters: [...session ? [{ name: "sessionId", wire: "sessionId", source: "json", codec: codec("HistorySessionId", historySessionId) }] : [], ...request ? [{ name: "request", wire: "request", source: "json", codec: request }] : []], result };
}
export const HISTORY_REMOTE = { package: "@dsmm/dsmm-history", descriptors: [
        descriptor("describe", codec("HistoryStatus", parseHistoryStatus)),
        descriptor("choices", codec("HistoryChoices", parseHistoryChoices), undefined, false),
        descriptor("preview", codec("HistoryPreview", parseHistoryPreview), codec("HistoryPreviewRequest", parseHistoryPreviewRequest)),
        descriptor("confirm", codec("HistoryContinuationResult", parseHistoryResult), codec("HistoryConfirmRequest", parseHistoryConfirmRequest)),
    ] };
export const HISTORY_HOST = { package: HISTORY_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: HISTORY_REMOTE.descriptors };
export { parseHistoryFailure };
//# sourceMappingURL=history-remote.js.map