import type { DsmmHistoryRemote } from "../history-remote.js";
import type { HistoryChoices, HistoryFailure, HistoryPreview, HistoryStatus } from "../history-types.js";
export interface HistoryClientSnapshot {
    sessionId: string | null;
    phase: "disconnected" | "loading" | "ready" | "previewing" | "confirming" | "unknown";
    status: HistoryStatus | null;
    choices: HistoryChoices | null;
    preview: HistoryPreview | null;
    issue: HistoryFailure | null;
}
/** Connection/session generation fences for continuation only; native history and composer stay authoritative. */
export declare class HistoryContinuationController {
    private scope;
    private state;
    private request;
    private disposed;
    private readonly listeners;
    readonly getSnapshot: () => HistoryClientSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    private publish;
    bind(remote: DsmmHistoryRemote | undefined, connection: object | undefined, sessionId: string | null, owner?: object): void;
    /** Observed compatibility only, never a pre-follow navigation or write-admission guard. */
    get historyBrowsingAllowed(): boolean;
    dispose(): void;
    refresh(expected: HistoryClientSnapshot): Promise<void>;
    preview(expected: HistoryClientSnapshot, preset: string, profileId: string | null): Promise<void>;
    confirm(expected: HistoryClientSnapshot, processPending: boolean, acceptMigration: boolean): Promise<void>;
}
//# sourceMappingURL=history-controller.d.ts.map