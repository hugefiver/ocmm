/** Browser-safe child control vocabulary; no Host or filesystem authority. */
import type { DsmmInvocationView, DsmmRoleRouteComparison, SubagentRuntimeAdmissionView } from "./profile-types.js";
import type { ChildAdmissionEvidenceView } from "./child-evidence.js";
import type { SubagentPromptReceipt, SubagentPromptRequest, SubagentInterruptReceipt } from "@deepseek-ai/dsh-subagent";
export type { DsmmInvocationView, DsmmRoleRouteComparison, ChildAdmissionEvidenceView, SubagentPromptRequest, SubagentPromptReceipt, SubagentInterruptReceipt };
export declare const ROLE_CONTROL_DISABLED_REASONS: readonly ["module-off", "role-disabled", "read-only", "background-disabled", "jobs-unavailable", "starting", "already-background", "already-settled", "cancelled", "one-shot", "unknown-mode", "not-direct-child", "delivery-fence-unavailable", "evidence-unavailable", "legacy-capability-denied", "unavailable"];
export type RoleControlDisabledReason = typeof ROLE_CONTROL_DISABLED_REASONS[number];
export type RoleControlAvailability = {
    enabled: true;
} | {
    enabled: false;
    reason: RoleControlDisabledReason;
};
export interface RoleControlCapabilities {
    background: RoleControlAvailability;
    prompt: RoleControlAvailability;
    interrupt: RoleControlAvailability;
    /** The native attachment/model admission still validates each image. */
    images: RoleControlAvailability;
    runtime: SubagentRuntimeAdmissionView;
}
export interface RoleControlRunView {
    sessionId: string;
    toolCallId: string;
    state: "starting" | "running" | "background" | "settled" | "cancelled";
    /** Absent before the real native run is published. */
    invocation?: DsmmInvocationView;
    background: RoleControlAvailability;
}
export interface RoleControlChildView {
    id: string;
    parentSessionId: string;
    mode: "one-shot" | "continuable" | "unknown";
    activity: "running" | "inactive";
    label?: string;
    readonly: boolean;
    invocation?: DsmmInvocationView;
    routeComparison?: DsmmRoleRouteComparison;
    evidence?: ChildAdmissionEvidenceView;
    controls: {
        prompt: RoleControlAvailability;
        interrupt: RoleControlAvailability;
    };
}
export interface ChildSessionSnapshot {
    sessionId: string;
    admissionEpoch: string;
    runs: RoleControlRunView[];
    children: RoleControlChildView[];
    capabilities: RoleControlCapabilities;
}
export type RoleControlDescendantView = {
    kind: "child";
    depth: number;
    hasChildren: boolean;
    child: RoleControlChildView;
} | {
    kind: "diagnostic";
    id: string;
    parentSessionId: string;
    depth: number;
    reason: "corrupt" | "unsupported" | "unavailable";
};
export interface RoleControlDescendantsSnapshot {
    sessionId: string;
    admissionEpoch: string;
    descendants: RoleControlDescendantView[];
}
export interface RoleControlBackgroundRequest {
    sessionId: string;
    toolCallId: string;
    runId: string;
    expectedAdmissionEpoch: string;
}
export interface BackgroundTransitionResult {
    status: "background" | "already-background" | "already-settled" | "cancelled";
    runId: string;
    jobId?: string;
}
export interface RoleControlInterruptRequest {
    parentSessionId: string;
    childSessionId: string;
    mode: "continuable";
}
export declare const ROLE_CONTROL_ERROR_CODES: readonly ["validation", "not-owned", "unavailable", "cancelled", "conflict", "not-found", "not-resumable", "invalid-content", "invalid-time-zone", "disabled"];
export declare const ROLE_CONTROL_ERROR_FIELDS: readonly ["sessionId", "parentSessionId", "childSessionId", "toolCallId", "runId", "expectedAdmissionEpoch", "request", "content", "clientTimeZone"];
export interface RoleControlErrorInfo {
    code: typeof ROLE_CONTROL_ERROR_CODES[number];
    field?: typeof ROLE_CONTROL_ERROR_FIELDS[number];
    reason?: RoleControlDisabledReason;
}
//# sourceMappingURL=role-control-types.d.ts.map