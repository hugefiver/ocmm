/** Wire views contain no executable authority or environment values. */
export type TemporaryPermissionDuration = "once" | "session" | "15min" | "1h";
export interface TemporaryPermissionDelivery {
    readonly requestId: string;
    readonly deliveryId: string;
}
export interface ChildPermissionView {
    readonly parentSessionId: string;
    readonly childSessionId: string;
    readonly project: string;
    readonly state: "disabled" | "enabled" | "unavailable";
    readonly canEnable: boolean;
    readonly canRevoke: boolean;
    readonly role?: string;
    readonly readOnly?: boolean;
}
export interface ChildPermissionRemote {
    child(sessionId: string, childSessionId: string): Promise<ChildPermissionView>;
    enableChild(sessionId: string, childSessionId: string): Promise<ChildPermissionView>;
    revokeChild(sessionId: string, childSessionId: string): Promise<ChildPermissionView>;
}
export interface TemporaryPermissionGrantView {
    readonly id: string;
    readonly sessionId: string;
    readonly tool: string;
    readonly summary: string;
    readonly duration: Exclude<TemporaryPermissionDuration, "once">;
    readonly remainingMs?: number;
}
export interface TemporaryPermissionRequestView extends TemporaryPermissionDelivery {
    readonly sessionId: string;
    readonly tool: string;
    readonly summary: string;
    readonly reusable: boolean;
    readonly scopes?: readonly {
        readonly id: string;
        readonly summary: string;
    }[];
}
export interface TemporaryPermissionRemote {
    describe(sessionId: string): Promise<readonly TemporaryPermissionGrantView[]>;
    request(sessionId: string, delivery: TemporaryPermissionDelivery): Promise<TemporaryPermissionRequestView>;
    retain(sessionId: string, delivery: TemporaryPermissionDelivery, duration: TemporaryPermissionDuration, scope?: string): Promise<string>;
    permit(sessionId: string, delivery: TemporaryPermissionDelivery): Promise<string | null>;
    revoke(sessionId: string, grantId: string): Promise<readonly TemporaryPermissionGrantView[]>;
}
//# sourceMappingURL=permission-temporary-types.d.ts.map