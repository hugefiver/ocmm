import type { Context } from "@deepseek-ai/cordis";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import type { CorePermissionAuthority } from "./core-permission-authority.js";
import type { DsmmRolePolicy } from "./role-policy.js";
import type { PermissionRulesRuntimeSync } from "./permission-rules.js";
import { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
import type { ArgvPermissionOptions, ArgvPermissionAuthority } from "./permission-exec-argv.js";
import { ChildPermissionControl } from "./permission-child-control.js";
export interface TemporaryPermissionInstallOptions {
    readonly core: CorePermissionAuthority;
    readonly roles: DsmmRolePolicy;
    readonly rules: PermissionRulesRuntimeSync;
    /** Explicit owned argv composition. Omit only when this capability is not installed. */
    readonly argv?: Pick<ArgvPermissionOptions, "programKind" | "environment" | "maxOutputBytes" | "timeoutMs">;
}
/** Composition from the real Core/role owners; no boolean ownership or test-provider authority. */
export declare function temporaryPermissionCapture(options: TemporaryPermissionInstallOptions, exec: Readonly<ToolExecution>): ArgvPermissionAuthority;
/** Install in the same Host fiber as the Core authority, after the patched Approval/Gateway and rules owners. */
export declare function installTemporaryPermissions(ctx: Context, options: TemporaryPermissionInstallOptions): {
    grants: TemporaryPermissionGrants;
    rpc: import("./permission-temporary-rpc.js").DsmmTemporaryPermissionsHost;
    children: ChildPermissionControl;
    dispose(): void;
};
//# sourceMappingURL=permission-temporary-install.d.ts.map