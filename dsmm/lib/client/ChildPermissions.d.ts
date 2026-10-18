import type { Context } from "@deepseek-ai/cordis";
import type { PropsLocale, PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type { UiSession } from "@deepseek-ai/dsh-client-ui-session/client";
import type { RoleControlChildView } from "../role-control-types.js";
import { PERMISSIONS_NS } from "./permission-locales.js";
interface Owner {
    parentSessionId: string;
    child: RoleControlChildView;
}
interface Services {
    sessions: ISessions;
    uiSession: UiSession;
    connection: ConnectionHandle;
}
type Locale = PropsLocale<typeof PERMISSIONS_NS>;
type Composer = PropsRenderSlots<"conversation.composer">;
/** Direct-child card action. Retention is Client-only; it never keeps the Host child alive. */
export declare function ChildPermissions(props: Owner & Services & Composer & Locale): import("react").JSX.Element | null;
export declare const CHILD_PERMISSION_SLOTS: {
    readonly "conversation.dsmm-child-permissions": {
        readonly kind: "list";
        readonly scope: "root";
    };
};
export declare function registerChildPermissionEntry(ctx: Context): void;
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface SlotMap {
        "conversation.dsmm-child-permissions": {
            kind: "list";
            scope: "root";
            owner: Owner;
        };
    }
}
declare module "@deepseek-ai/dsh-api-session-controller/client" {
    interface SessionReferenceSourceMap {
        dsmmChildPermissions: unknown;
    }
}
export {};
//# sourceMappingURL=ChildPermissions.d.ts.map