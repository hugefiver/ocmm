import type { ReactNode } from "react";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { DsmmInvocationView, RoleControlAvailability, RoleControlChildView } from "../role-control-types.js";
import type { DsmmRoleRouteComparison } from "../profile-types.js";
import type { ChildrenActions, ChildrenController, ChildrenSnapshot } from "./children-controller.js";
import type { ChildrenLocaleKey } from "./children-locales.js";
type Locale = PropsLocale<"conversation.dsmm-children">;
export type ChildrenInjected = ChildrenActions & {
    hooks: {
        children: ChildrenController["store"];
    };
};
export type ChildrenPanelProps = InjectFace<ChildrenInjected> & Locale & {
    sessionId?: string;
    renderChildPermissions?: (child: RoleControlChildView) => ReactNode;
};
export declare function ControlAvailability({ value, label, t }: Locale & {
    value?: RoleControlAvailability;
    label: ChildrenLocaleKey;
}): import("react").JSX.Element;
export declare function RouteComparisonDetails({ value, t }: Locale & {
    value?: DsmmRoleRouteComparison;
}): import("react").JSX.Element;
export declare function InvocationDetails({ value, t, showComparison }: Locale & {
    value?: DsmmInvocationView;
    showComparison?: boolean;
}): import("react").JSX.Element;
export declare function ChildComposer({ child, state, actions, t }: Locale & {
    child: RoleControlChildView;
    state: ChildrenSnapshot;
    actions: ChildrenActions;
}): import("react").JSX.Element;
export declare function ChildDetails({ child, state, actions, t, inspection, renderChildPermissions }: Locale & {
    child: RoleControlChildView;
    state: ChildrenSnapshot;
    actions: ChildrenActions;
    inspection?: boolean;
    renderChildPermissions?: ChildrenPanelProps["renderChildPermissions"];
}): import("react").JSX.Element;
/** Native session-scoped Conversation View, not a replacement composer or navigation shell. */
export declare function ChildrenPanel(props: ChildrenPanelProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ChildrenPanel.d.ts.map