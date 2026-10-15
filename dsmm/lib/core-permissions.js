import { installDeploymentPermissionRules } from "./deployment-permission-rules.js";
import { PermissionRefusal, permissionOriginal } from "./permission-control.js";
import { installPermissionController } from "./permission-controller.js";
import { registerPermissionControlRpc } from "./permission-rpc.js";
/** The native Core fiber owns one source backend, execution controller and RPC service. */
export function installCorePermissions(ctx, deployment, authority, assertWritable) {
    let controller;
    const backend = installDeploymentPermissionRules(ctx, {
        deployment, assertWritable,
        revoke: () => { },
        notify: async () => {
            const current = ctx.get("dsmmPermissionController");
            if (controller === undefined || current === undefined || permissionOriginal(current) !== permissionOriginal(controller)
                || current.rules !== backend.runtime)
                throw new PermissionRefusal("unavailable");
        },
    });
    controller = installPermissionController(ctx, {
        authority, rules: backend.runtime,
        // The public ShellExecutor has no executable/environment resolution proof.
        // This identity never grants read trust or filesystem colocation.
        shellIdentity: (_scope, kind) => Object.freeze({ executable: `unresolved-native-${kind}`,
            dialect: kind === "bash" ? "posix" : "powershell", commandField: "command", cwdField: "workdir" }),
    });
    const installed = controller;
    ctx.inject(["typert"], scope => {
        if (scope.get("dsmmPermissions") !== undefined)
            throw new PermissionRefusal("unavailable");
        registerPermissionControlRpc(scope, { backend, runtime: backend.runtime });
    });
    return installed;
}
//# sourceMappingURL=core-permissions.js.map