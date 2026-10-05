/** Wire-only profile data: safe to import from the native browser client. */
import type { DsmmRoleId } from "./roles.js";
import type { DsmmModelRoute, DsmmProfileScope } from "./settings.js";
import type { DsmmRateLimitPolicy, DsmmRoutingStrategy, DsmmRuntimePolicyConfig, DsmmRuntimePolicySettings } from "./routing-policy.js";
export type ProfileErrorCode = "validation" | "conflict" | "not-found" | "lock-timeout" | "unsafe-path" | "io" | "activation" | "corrupt-selection" | "limit" | "busy" | "maintenance" | "disposed" | "not-owned" | "unavailable" | "cancelled";
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
    /** Native deployment role inventory; excludes provider accounts and auth data. */
    roles?: ProfileRoleMetadata[];
    editorDefaults?: DsmmRuntimePolicySettings;
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
export interface ProfileRoleMetadata {
    id: DsmmRoleId;
    label: string;
    enabled: boolean;
    /** Explicit deployment overrides inherited by a profile's omitted role fields. */
    runtimePolicy?: DsmmRuntimePolicyConfig;
}
export interface DsmmRoleRuntimeState {
    role?: DsmmRoleId;
    strategy: DsmmRoutingStrategy;
    rateLimit: DsmmRateLimitPolicy;
    route?: DsmmModelRoute;
    retries: number;
    rateLimitFailures: number;
    switches: number;
    totalDelayMs: number;
}
export interface SessionProfileSnapshot {
    sessionId: string;
    globalDefault: ProfileSelectionState;
    /** Current sidecar state: the authority for session-selection CAS. */
    selection: ProfileSelectionState;
    /** Exact live admission, for display only; may differ from the future global default. */
    admittedSelection?: ProfileSelectionState;
    scope: DsmmProfileScope;
    admissionEpoch: string;
    switchAllowed: boolean;
    switchUnavailableReason?: "busy" | "maintenance" | "disposed" | "not-owned" | "unavailable";
    rolePolicy?: DsmmRoleRuntimeState;
    /** Declared profile primary for the current ordinary root role, not an applied native selection. */
    profileModel?: DsmmModelRoute;
}
export interface SessionProfileSelectRequest extends ProfileSelectRequest {
    sessionId: string;
    expectedAdmissionEpoch: string;
}
export declare const ABSENT_PROFILE_SELECTION_REVISION = "absent";
//# sourceMappingURL=profile-types.d.ts.map