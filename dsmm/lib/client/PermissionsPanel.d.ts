import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { PermissionController, PermissionView } from "./permission-controller.js";
type Locale = PropsLocale<"settings.dsmm-permissions">;
export type PermissionsPanelProps = Locale & {
    controller: PermissionController;
    sessionId?: string;
};
export declare function PermissionRulesEditor({ controller, state, t }: Locale & {
    controller: PermissionController;
    state: PermissionView;
}): import("react").JSX.Element;
export declare function PermissionsPanel({ controller, t, sessionId }: PermissionsPanelProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=PermissionsPanel.d.ts.map