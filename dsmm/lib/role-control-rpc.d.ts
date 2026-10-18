import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { NativeAdmission } from "./native-admission.js";
import type { ChildSessionSnapshot, RoleControlDescendantsSnapshot, RoleControlInterruptRequest, SubagentPromptRequest, SubagentPromptReceipt, SubagentInterruptReceipt } from "./role-control-types.js";
/** Authenticated projection of the native catalog. Listing never wakes a session. */
export declare class DsmmChildrenHost extends TypertRemoteService {
    private readonly admission;
    private readonly lifetime;
    constructor(ctx: Context, admission: NativeAdmission);
    private scoped;
    private capabilities;
    private child;
    describe(sessionId: string): Promise<ChildSessionSnapshot>;
    descendants(sessionId: string): Promise<RoleControlDescendantsSnapshot>;
    private direct;
    prompt(sessionId: string, input: SubagentPromptRequest): Promise<SubagentPromptReceipt>;
    interrupt(sessionId: string, input: RoleControlInterruptRequest): Promise<SubagentInterruptReceipt>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmChildren: DsmmChildrenHost;
    }
}
export declare function registerRoleControlRpc(ctx: Context, admission: NativeAdmission): DsmmChildrenHost;
//# sourceMappingURL=role-control-rpc.d.ts.map