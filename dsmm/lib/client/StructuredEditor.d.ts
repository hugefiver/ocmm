import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesViewSnapshot } from "./controller.js";
type Locale = PropsLocale<"settings.dsmm-profiles">;
/** The same raw draft drives every control; there is no form-to-document rewrite. */
export declare function StructuredEditor({ state, actions, disabled, t }: Locale & {
    state: ProfilesViewSnapshot;
    actions: ProfilesActions;
    disabled: boolean;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=StructuredEditor.d.ts.map