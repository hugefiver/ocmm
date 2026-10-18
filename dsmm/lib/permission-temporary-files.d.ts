import type { Context } from "@deepseek-ai/cordis";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import type { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import type { ArgvPermissionAuthority } from "./permission-exec-argv.js";
/** Called only around the actual native module's apply, before its definitions are registered. */
export declare function temporaryFileToolScope(scope: Context, module: "fs" | "fs-search"): Context;
export interface TemporaryFileOptions {
    readonly grants: TemporaryPermissionGrants;
    refresh?(): Promise<unknown>;
    capture(execution: Readonly<ToolExecution>): ArgvPermissionAuthority;
}
/** Native asks are settled once by the existing ApprovalService; providers remain the original ones. */
export declare function installTemporaryFilePermissions(ctx: Context, options: TemporaryFileOptions): () => void;
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmTemporaryFilePermissions: AbortSignal;
    }
}
//# sourceMappingURL=permission-temporary-files.d.ts.map