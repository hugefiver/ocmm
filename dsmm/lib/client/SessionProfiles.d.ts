import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfilesActions, ProfilesController, ProfilesViewSnapshot } from "./controller.js";
type Injected = ProfilesActions & {
    hooks: {
        profiles: ProfilesController["store"];
    };
};
export type SessionProfilesProps = InjectFace<Injected> & PropsLocale<"settings.dsmm-profiles"> & {
    sessionId?: string;
};
export declare function SessionScope({ state, actions, t, compact }: PropsLocale<"settings.dsmm-profiles"> & {
    state: ProfilesViewSnapshot;
    actions: ProfilesActions;
    compact?: boolean;
}): import("react").JSX.Element;
/** Additive native header contribution; never operates on a different view seat. */
export declare function SessionProfiles(props: SessionProfilesProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=SessionProfiles.d.ts.map