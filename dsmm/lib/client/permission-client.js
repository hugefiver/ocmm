import { PERMISSION_REMOTE } from "../permission-remote.js";
export class PermissionClientError extends Error {
    code;
    constructor(code) {
        super("Permission operation unavailable.");
        this.code = code;
    }
}
const codes = new Set(["not-owned", "stale", "cancelled", "unavailable", "validation", "not-found", "scope-unavailable", "replayed", "denied"]);
/** The public Connection carrier supplies cancellation; C owns wire codecs and authority. */
export function permissionClient(connection) {
    return async (method, args, signal) => {
        const descriptor = PERMISSION_REMOTE.descriptors.find(item => item.method === method);
        const payload = {};
        descriptor.parameters.forEach((parameter, index) => { payload[parameter.wire] = args[index]; });
        let result;
        try {
            result = await connection.rpc.call("/api", `dsmmPermissions/${method}`, { args: payload }, signal);
        }
        catch {
            throw new PermissionClientError(signal.aborted ? "cancelled" : "transport");
        }
        if (!result.ok) {
            const code = Reflect.get(result.error.details, "code");
            throw new PermissionClientError(result.error.code === "dsmm-permissions/refused" && codes.has(code) ? code : "unavailable");
        }
        signal.throwIfAborted();
        try {
            if (descriptor.result.mode !== "strict")
                throw new Error("Strict permission codec required.");
            return descriptor.result.create().parse(result.value);
        }
        catch {
            throw new PermissionClientError("protocol");
        }
    };
}
//# sourceMappingURL=permission-client.js.map