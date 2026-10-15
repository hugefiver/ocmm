import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { PermissionRulesBackend, PermissionRulesRuntimeSync, PermissionRulesSaveRequest, PermissionRulesSaveResult } from "./permission-rules.js";
/** Root controls are ordinary Core controls; no DW delivery fence/ticket is consulted. */
export declare class DsmmPermissionsHost extends TypertRemoteService {
    private readonly rules;
    private readonly lifetime;
    constructor(ctx: Context, rules: {
        readonly backend: PermissionRulesBackend;
        readonly runtime: PermissionRulesRuntimeSync;
    });
    private invoke;
    private rulesAuthority;
    private withCapabilities;
    describeRules(sessionId: string): Promise<PermissionRulesSaveResult>;
    saveRules(sessionId: string, request: PermissionRulesSaveRequest): Promise<PermissionRulesSaveResult>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmPermissions: DsmmPermissionsHost;
    }
}
export declare function registerPermissionControlRpc(ctx: Context, rules: {
    readonly backend: PermissionRulesBackend;
    readonly runtime: PermissionRulesRuntimeSync;
}): DsmmPermissionsHost;
/** Native-only mount does not construct a substitute Root ToolRuntime or scoped-memory authority. */
export declare function registerNativePermissionRulesRpc(ctx: Context, backend: PermissionRulesBackend, runtime: PermissionRulesRuntimeSync): DsmmPermissionsHost;
//# sourceMappingURL=permission-rpc.d.ts.map