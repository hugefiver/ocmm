import type { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { BackgroundTransitionResult, ChildSessionSnapshot, RoleControlBackgroundRequest, RoleControlCapabilities, RoleControlDescendantsSnapshot, RoleControlErrorInfo, RoleControlInterruptRequest, SubagentInterruptReceipt, SubagentPromptReceipt, SubagentPromptRequest } from "./role-control-types.js";
export interface DsmmChildrenRemote {
    describe(sessionId: string): Promise<RemoteResult<ChildSessionSnapshot>>;
    descendants(sessionId: string): Promise<RemoteResult<RoleControlDescendantsSnapshot>>;
    background(sessionId: string, request: RoleControlBackgroundRequest): Promise<RemoteResult<BackgroundTransitionResult>>;
    prompt(sessionId: string, request: SubagentPromptRequest): Promise<RemoteResult<SubagentPromptReceipt>>;
    interrupt(sessionId: string, request: RoleControlInterruptRequest): Promise<RemoteResult<SubagentInterruptReceipt>>;
}
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface TypertRemoteMap {
        "dsmmChildren/describe": DsmmChildrenRemote["describe"];
        "dsmmChildren/descendants": DsmmChildrenRemote["descendants"];
        "dsmmChildren/background": DsmmChildrenRemote["background"];
        "dsmmChildren/prompt": DsmmChildrenRemote["prompt"];
        "dsmmChildren/interrupt": DsmmChildrenRemote["interrupt"];
    }
    interface TypertRemoteNamespaceMap {
        dsmmChildren: DsmmChildrenRemote;
    }
    interface RemoteErrorDetailsMap {
        "dsmm-children/refused": RoleControlErrorInfo;
    }
}
export declare const parseRoleControlErrorInfo: (value: unknown) => RoleControlErrorInfo;
export declare const parseChildSessionSnapshot: (value: unknown) => ChildSessionSnapshot;
export declare const parseRoleControlDescendants: (value: unknown) => RoleControlDescendantsSnapshot;
export declare const parseRoleControlBackgroundRequest: (value: unknown) => RoleControlBackgroundRequest;
export declare const parseRoleControlPromptRequest: (value: unknown) => SubagentPromptRequest;
export declare const parseRoleControlInterruptRequest: (value: unknown) => RoleControlInterruptRequest;
export declare const parseRoleControlCapabilities: (value: unknown) => RoleControlCapabilities;
export declare const parseRoleControlSessionId: (value: unknown) => string;
/** Separate package identity prevents replacing the Profiles contribution. */
export declare const ROLE_CONTROL_REMOTE: TypertRemoteContribution;
export declare const ROLE_CONTROL_HOST: TypertContribution;
export default ROLE_CONTROL_REMOTE;
//# sourceMappingURL=role-control-remote.d.ts.map