import type { Context } from "@deepseek-ai/cordis";
import type { TemporaryPermissionRemote } from "../permission-temporary-types.js";
import type { PermissionController } from "./permission-controller.js";
/** Approval slots belong to the connection generation; the drawer also borrows its exact current scope. */
export declare function registerTemporaryPermissionEntry(ctx: Context, permissions: PermissionController): import("@deepseek-ai/dsh-client-store").SnapshotStore<TemporaryPermissionRemote | undefined>;
//# sourceMappingURL=temporary-permission-entry.d.ts.map