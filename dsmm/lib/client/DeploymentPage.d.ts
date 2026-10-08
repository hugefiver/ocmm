import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ConfigForms } from "@deepseek-ai/dsh-client-ui-settings/client";
import { DeploymentController } from "./deployment-controller.js";
import type { NativePageForm } from "./deployment-controller.js";
import type { DsmmConfigRemote } from "../profile-remote.js";
type Locale = PropsLocale<"plugins.dsmm">;
export interface DeploymentPageProps extends Locale {
    view: "summary" | "page";
    form?: NativePageForm;
    core: DeploymentController;
    remote: DsmmConfigRemote;
    forms?: ConfigForms;
    rowNamespace?: string;
    profilePage?: boolean;
}
export declare function DeploymentPage(props: DeploymentPageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=DeploymentPage.d.ts.map