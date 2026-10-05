import type { Context } from "@deepseek-ai/cordis";
export { ProfilesController, NEW_PROFILE_CONTENT } from "./controller.js";
export type { ProfilesActions, ProfilesViewSnapshot, ProfilesIssue } from "./controller.js";
export { ProfilesSection } from "./ProfilesSection.js";
export type { ProfilesSectionProps, ProfilesInjected } from "./ProfilesSection.js";
export { NS, en, zh } from "./locales.js";
export { TYPERT_REMOTE } from "../profile-remote.js";
export { SessionProfiles } from "./SessionProfiles.js";
export { structuredDocument, editStructuredPath, moveFallback } from "./structured.js";
/** No self-dependency on a namespace that this contribution has not mounted. */
export declare const inject: readonly ["slots", "locale", "remote"];
export declare function apply(ctx: Context): Promise<void>;
//# sourceMappingURL=index.d.ts.map