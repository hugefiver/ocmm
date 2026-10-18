import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { PendingApproval } from "@deepseek-ai/dsh-client-ui-approval/client";
import type { ChildPermissionRemote, TemporaryPermissionDuration, TemporaryPermissionRemote } from "../permission-temporary-types.js";
export declare function temporaryPermissionClient(connection: ConnectionHandle, signal: AbortSignal): TemporaryPermissionRemote & ChildPermissionRemote;
/** Public PendingApproval type only: answers use the native object and first-wins path. */
export type TemporaryPendingApproval = PendingApproval & {
    readonly requestId?: string;
    readonly deliveryId?: string;
    answer(outcome: "allowed-once" | "rejected", options?: {
        readonly permit?: string;
        readonly retention?: string;
    }): Promise<void>;
};
export declare function pendingDelivery(pending: TemporaryPendingApproval): {
    requestId: string;
    deliveryId: string;
} | undefined;
export declare function retainAndAnswer(pending: TemporaryPendingApproval, remote: TemporaryPermissionRemote, duration: TemporaryPermissionDuration, current: () => boolean, scope?: string): Promise<void>;
export declare function answerWithTemporaryPermit(pending: TemporaryPendingApproval, remote: TemporaryPermissionRemote, current: () => boolean): Promise<void>;
//# sourceMappingURL=temporary-permission-client.d.ts.map