import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ConfigForms } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { DsmmConfigRemote } from "../profile-remote.js";
import type { SubagentRuntimeAdmissionView } from "../profile-types.js";
import type { DeploymentController } from "./deployment-controller.js";
import type { PermissionController } from "./permission-controller.js";
import type { DeploymentWorkspace } from "./deployment-workspace.js";
type Locale = PropsLocale<"plugins.dsmm">;
export interface DeploymentPageProps extends Locale {
    view: "summary" | "page";
    core: DeploymentController;
    remote: DsmmConfigRemote;
    workspace?: DeploymentWorkspace;
    permissions?: PermissionController;
    forms?: ConfigForms;
}
export declare function ScopeSave({ controller, workspace, refreshOnly, t }: Locale & {
    controller: DeploymentController;
    workspace?: DeploymentWorkspace;
    refreshOnly?: boolean;
}): import("react").JSX.Element;
export declare function NativeRuntimeState({ value, t }: Locale & {
    value?: SubagentRuntimeAdmissionView;
}): import("react").JSX.Element;
export declare function StateInspector({ controller, t }: Locale & {
    controller: DeploymentController;
}): import("react").JSX.Element;
export declare function DeploymentPage(props: DeploymentPageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=DeploymentPage.d.ts.map