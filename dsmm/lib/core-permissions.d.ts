import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { DsmmDeploymentConfig } from "./deployment-config.js";
import type { PermissionControlCollaborators } from "./permission-control.js";
import type { DsmmPermissionController } from "./permission-controller.js";
/** The native Core fiber owns one source backend, execution controller and RPC service. */
export declare function installCorePermissions(ctx: Context, deployment: DsmmDeploymentConfig, authority: PermissionControlCollaborators, assertWritable: (root: Agent) => void): DsmmPermissionController;
//# sourceMappingURL=core-permissions.d.ts.map