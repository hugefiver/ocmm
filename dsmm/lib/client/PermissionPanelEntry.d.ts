import type { HostObservable, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { TemporaryPermissionRemote } from "../permission-temporary-types.js";
import type { PermissionController } from "./permission-controller.js";
export declare function PermissionPanelEntry({ controller, temporary, t }: PropsLocale<"settings.dsmm-permissions"> & {
    controller: PermissionController;
    temporary?: HostObservable<TemporaryPermissionRemote | undefined>;
}): import("react").JSX.Element;
//# sourceMappingURL=PermissionPanelEntry.d.ts.map