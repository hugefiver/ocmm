import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import type { TemporaryPermissionDelivery, TemporaryPermissionDuration } from "./permission-temporary-types.js";
import type { ChildPermissionControl } from "./permission-child-control.js";
/** Child access is an explicit current operator capability, never inferred from lineage strings. */
export interface TemporaryPermissionRpcOptions {
    readonly children?: ChildPermissionControl;
    authorizeChild?(peer: object, child: Agent): {
        assertCurrent(): void;
    };
}
export declare class DsmmTemporaryPermissionsHost extends TypertRemoteService {
    private readonly grants;
    private readonly options;
    private readonly lifetime;
    constructor(ctx: Context, grants: TemporaryPermissionGrants, options: TemporaryPermissionRpcOptions);
    private invoke;
    private delivery;
    describe(sessionId: string): readonly import("./permission-temporary-types.js").TemporaryPermissionGrantView[];
    request(sessionId: string, delivery: TemporaryPermissionDelivery): unknown;
    retain(sessionId: string, delivery: TemporaryPermissionDelivery, duration: TemporaryPermissionDuration, scope?: string): unknown;
    permit(sessionId: string, delivery: TemporaryPermissionDelivery): unknown;
    revoke(sessionId: string, grantId: string): readonly import("./permission-temporary-types.js").TemporaryPermissionGrantView[];
    private childOperation;
    child(sessionId: string, childSessionId: string): Promise<import("./permission-temporary-types.js").ChildPermissionView>;
    enableChild(sessionId: string, childSessionId: string): Promise<import("./permission-temporary-types.js").ChildPermissionView>;
    revokeChild(sessionId: string, childSessionId: string): Promise<import("./permission-temporary-types.js").ChildPermissionView>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmTemporaryPermissions: DsmmTemporaryPermissionsHost;
    }
}
export declare function registerTemporaryPermissionRpc(ctx: Context, grants: TemporaryPermissionGrants, options?: TemporaryPermissionRpcOptions): DsmmTemporaryPermissionsHost;
//# sourceMappingURL=permission-temporary-rpc.d.ts.map