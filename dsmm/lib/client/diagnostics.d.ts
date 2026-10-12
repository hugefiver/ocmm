import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { ProfileDiagnostic, ProfileErrorInfo } from "../profile-types.js";
import type { ProfilesIssue } from "./controller.js";
/** Wire grammar is checked again at presentation; raw exception text is never retained. */
export declare function safeIssue(info: unknown): ProfilesIssue;
export declare function profileWarnings(warnings: ProfileDiagnostic[] | undefined): ProfileDiagnostic[];
export declare function draftWarnings(content: string): ProfileDiagnostic[];
export declare function ProfileWarnings({ warnings, t }: PropsLocale<"settings.dsmm-profiles"> & {
    warnings?: ProfileDiagnostic[];
}): import("react").JSX.Element;
export declare function IssueDetails({ issue, t }: PropsLocale<"settings.dsmm-profiles"> & {
    issue: ProfilesIssue | ProfileErrorInfo;
}): import("react").JSX.Element;
//# sourceMappingURL=diagnostics.d.ts.map