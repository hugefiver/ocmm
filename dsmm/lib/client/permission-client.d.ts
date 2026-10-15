import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { PermissionRemote } from "../permission-remote.js";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
export type PermissionMethod = keyof PermissionRemote;
export type PermissionValue<M extends PermissionMethod> = Awaited<ReturnType<PermissionRemote[M]>> extends RemoteResult<infer Value> ? Value : never;
export type PermissionIssue = "not-owned" | "stale" | "cancelled" | "unavailable" | "validation" | "not-found" | "scope-unavailable" | "replayed" | "denied" | "transport" | "protocol";
export declare class PermissionClientError extends Error {
    readonly code: PermissionIssue;
    constructor(code: PermissionIssue);
}
export interface PermissionInvoker {
    <M extends PermissionMethod>(method: M, args: Parameters<PermissionRemote[M]>, signal: AbortSignal): Promise<PermissionValue<M>>;
}
/** The public Connection carrier supplies cancellation; C owns wire codecs and authority. */
export declare function permissionClient(connection: ConnectionHandle): PermissionInvoker;
//# sourceMappingURL=permission-client.d.ts.map