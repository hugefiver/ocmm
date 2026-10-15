import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
export type NativePermissionMode = "workspace-write" | "danger-full-access";
export interface NativePermissionAccess {
    readonly standingFullAccess: boolean;
    /** An execution-local target authorized by a fulfilled original native request. */
    readonly approvedSandboxMode?: NativePermissionMode;
}
/** Public effective native policy only; requested tool arguments are never authority. */
export declare function nativeStandingFullAccess(ctx: Context, agent?: Agent): boolean;
//# sourceMappingURL=permission-native-access.d.ts.map