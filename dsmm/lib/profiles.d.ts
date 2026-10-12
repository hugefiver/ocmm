import type { DsmmPluginConfig, DsmmSettings } from "./settings.js";
import type { ProfileErrorCode, ProfileErrorInfo } from "./profile-types.js";
import type { ProfileDiagnostic, ProfileDiagnosticCode, ProfileDiagnosticLocation } from "./profile-diagnostics.js";
import type { DsmmRoleId } from "./roles.js";
export declare const MAX_PROFILE_BYTES: number;
export declare const MAX_PROFILE_COUNT = 128;
export declare const MAX_PROFILE_DIRECTORY_ENTRIES = 1024;
export declare const MAX_PROFILE_REVISIONS = 1024;
export type DsmmProfileOverlay = Pick<DsmmPluginConfig, "defaultActive" | "roleRouting" | "runtimePolicy" | "workflow" | "guards" | "runtimeRecovery" | "roles" | "locale" | "deepseekV4ProCalibration" | "deepseekV4ProDefaultReasoningEffort" | "deepseekFlashCalibration" | "deepseekFlashDefaultReasoningEffort"> & {
    subagents?: Pick<NonNullable<DsmmPluginConfig["subagents"]>, "toolTopology">;
};
export interface DsmmProfileDocument {
    version: 1;
    id: string;
    label?: string;
    settings: DsmmProfileOverlay;
}
export declare class DsmmProfileError extends Error {
    readonly code: ProfileErrorCode;
    readonly field?: string;
    readonly reason?: ProfileDiagnosticCode;
    readonly location?: ProfileDiagnosticLocation;
    constructor(code: ProfileErrorCode, message: string, field?: string, reason?: ProfileDiagnosticCode, location?: ProfileDiagnosticLocation);
    toInfo(): ProfileErrorInfo;
}
export declare function profileErrorInfo(error: unknown, fallback?: ProfileErrorCode): ProfileErrorInfo;
export declare function validateProfileId(id: unknown): asserts id is string;
export declare function validateProfileRevision(revision: unknown, field?: string): asserts revision is string;
export declare function parseProfileDocument(content: string, expectedId?: string): DsmmProfileDocument;
export declare function validateProfileDocument(content: string, expectedId?: string): {
    document?: DsmmProfileDocument;
    diagnostics: ProfileDiagnostic[];
};
export declare function profileDocumentWarnings(document: DsmmProfileDocument | null): ProfileDiagnostic[];
export declare function validateProfileOverlay(input: unknown): asserts input is DsmmProfileOverlay;
export declare function mergeProfileConfig(baseline: DsmmPluginConfig, overlay: DsmmProfileOverlay): DsmmPluginConfig;
export declare function resolveProfileSettings(baseline: DsmmPluginConfig, overlay: DsmmProfileOverlay): DsmmSettings;
export declare function requiredDeepworkRoles(settings: Pick<DsmmSettings, "workflow">): DsmmRoleId[];
export declare function requiredReason(settings: Pick<DsmmSettings, "workflow">, role: DsmmRoleId): "deepwork-planning" | "legacy-review" | undefined;
//# sourceMappingURL=profiles.d.ts.map