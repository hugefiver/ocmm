/** Wire-only profile data: safe to import from the native browser client. */
export type ProfileErrorCode = "validation" | "conflict" | "not-found" | "lock-timeout" | "unsafe-path" | "io" | "activation" | "corrupt-selection" | "limit";
export interface ProfileErrorInfo {
    code: ProfileErrorCode;
    message: string;
    field?: string;
}
export interface ProfileSummary {
    id: string;
    label?: string;
    revision: string | null;
    error?: ProfileErrorInfo;
}
export interface ProfileSelectionState {
    selectedId: string | null;
    appliedRevision: string | null;
    selectionRevision: string;
}
export interface ProfileSnapshot extends ProfileSelectionState {
    profiles: ProfileSummary[];
    selectionError?: ProfileErrorInfo;
}
export interface ProfileReadResult {
    id: string;
    label?: string;
    revision: string;
    content: string;
}
export interface ProfileSaveRequest {
    id: string;
    content: string;
    expectedRevision: string | null;
}
export interface ProfileSelectRequest {
    id: string | null;
    expectedRevision?: string;
    expectedSelectionRevision: string;
}
export declare const ABSENT_PROFILE_SELECTION_REVISION = "absent";
//# sourceMappingURL=profile-types.d.ts.map