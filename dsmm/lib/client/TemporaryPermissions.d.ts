import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { TemporaryPermissionRemote } from "../permission-temporary-types.js";
import type { TemporaryPendingApproval } from "./temporary-permission-client.js";
type Locale = PropsLocale<"settings.dsmm-permissions">;
/** Parent mounts after native approval UI and registers the existing permission dictionaries. */
export declare function registerTemporaryPermissionSlots(ctx: Context, connection: ConnectionHandle): void;
/** Render beside the native prompt, never replace its approve/reject/cancel controls. */
export declare function TemporaryApproval({ pending, remote, t, child }: Locale & {
    pending: TemporaryPendingApproval;
    remote: TemporaryPermissionRemote;
    child?: boolean;
}): import("react").JSX.Element | null;
export declare function TemporaryGrants({ sessionId, remote, t, child }: Locale & {
    sessionId: string;
    remote: TemporaryPermissionRemote;
    child?: boolean;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=TemporaryPermissions.d.ts.map