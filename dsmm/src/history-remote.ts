import type { InvocationDescriptor, RemoteResult, TypertCodec, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { HistoryChoices, HistoryConfirmRequest, HistoryContinuationResult, HistoryFailure, HistoryPreview, HistoryPreviewRequest, HistoryStatus } from "./history-types.js";
import { historyJson, historySessionId, parseHistoryChoices, parseHistoryConfirmRequest, parseHistoryFailure, parseHistoryPreview, parseHistoryPreviewRequest, parseHistoryResult, parseHistoryStatus } from "./history-codec.js";

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
  interface TypertRemoteNamespaceMap { dsmmHistory: DsmmHistoryRemote }
  interface RemoteErrorDetailsMap { "dsmm-history/refused": HistoryFailure }
}
function codec<T>(name: string, parse: (value: unknown) => T): TypertCodec {
  return { mode: "strict", typeSymbol: `@dsmm/dsmm#${name}`, create: () => ({ parse: value => parse(historyJson(value)) }) };
}
function descriptor(method: string, result: TypertCodec, request?: TypertCodec, session = true): InvocationDescriptor {
  return { id: `@dsmm/dsmm-history#dsmmHistory/${method}`, service: "dsmmHistory", namespace: "dsmmHistory", method, invocation: { kind: "direct" },
    parameters: [...session ? [{ name: "sessionId", wire: "sessionId", source: "json" as const, codec: codec("HistorySessionId", historySessionId) }] : [], ...request ? [{ name: "request", wire: "request", source: "json" as const, codec: request }] : []], result };
}
export const HISTORY_REMOTE: TypertRemoteContribution = { package: "@dsmm/dsmm-history", descriptors: [
  descriptor("describe", codec("HistoryStatus", parseHistoryStatus)),
  descriptor("choices", codec("HistoryChoices", parseHistoryChoices), undefined, false),
  descriptor("preview", codec("HistoryPreview", parseHistoryPreview), codec("HistoryPreviewRequest", parseHistoryPreviewRequest)),
  descriptor("confirm", codec("HistoryContinuationResult", parseHistoryResult), codec("HistoryConfirmRequest", parseHistoryConfirmRequest)),
] };
export const HISTORY_HOST: TypertContribution = { package: HISTORY_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: HISTORY_REMOTE.descriptors };
export { parseHistoryFailure };
