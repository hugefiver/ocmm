import type { Context } from "@deepseek-ai/cordis";
import type { ToolCallViewProps } from "@deepseek-ai/dsh-client-ui-tool/client";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { ROLE_TOOL_NS } from "./RoleToolView-locales.js";
type Props = ToolCallViewProps & PropsLocale<typeof ROLE_TOOL_NS>;
export declare function RoleToolView(props: Props): import("react").JSX.Element;
/** Called once by the parent client apply(ctx), alongside the other slot registrations. */
export declare function registerRoleToolViews(ctx: Context): void;
export {};
//# sourceMappingURL=RoleToolView.d.ts.map