import type { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { PermissionRulesSaveRequest, PermissionRulesSaveResult } from "./permission-rules.js";
export interface PermissionRemote {
    describeRules(sessionId: string): Promise<RemoteResult<PermissionRulesSaveResult>>;
    saveRules(sessionId: string, request: PermissionRulesSaveRequest): Promise<RemoteResult<PermissionRulesSaveResult>>;
}
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface TypertRemoteMap {
        "dsmmPermissions/describeRules": PermissionRemote["describeRules"];
        "dsmmPermissions/saveRules": PermissionRemote["saveRules"];
    }
    interface TypertRemoteNamespaceMap {
        dsmmPermissions: PermissionRemote;
    }
    interface RemoteErrorDetailsMap {
        "dsmm-permissions/refused": {
            code: string;
        };
    }
}
export declare function parsePermissionSessionId(value: unknown): string;
export declare function parsePermissionRulesResult(value: unknown): PermissionRulesSaveResult;
export declare const PERMISSION_REMOTE: TypertRemoteContribution;
export declare const PERMISSION_HOST: TypertContribution;
//# sourceMappingURL=permission-remote.d.ts.map