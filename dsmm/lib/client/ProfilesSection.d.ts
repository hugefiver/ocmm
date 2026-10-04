import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesController } from "./controller.js";
export type ProfilesInjected = ProfilesActions & {
    hooks: {
        profiles: ProfilesController["store"];
    };
};
export type ProfilesSectionProps = InjectFace<ProfilesInjected> & PropsLocale<"settings.dsmm-profiles">;
/** One native settings.section; policy selection is never coupled to browsing. */
export declare function ProfilesSection(props: ProfilesSectionProps): import("react").JSX.Element;
//# sourceMappingURL=ProfilesSection.d.ts.map