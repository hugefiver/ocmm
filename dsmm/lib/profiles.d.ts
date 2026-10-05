import type { DsmmPluginConfig, DsmmSettings } from "./settings.js";
import type { ProfileErrorCode, ProfileErrorInfo } from "./profile-types.js";
export declare const MAX_PROFILE_BYTES: number;
export declare const MAX_PROFILE_COUNT = 128;
export declare const MAX_PROFILE_DIRECTORY_ENTRIES = 1024;
export declare const MAX_PROFILE_REVISIONS = 1024;
export type DsmmProfileOverlay = Pick<DsmmPluginConfig, "defaultActive" | "roleRouting" | "runtimePolicy" | "workflow" | "guards" | "runtimeRecovery" | "deepseekV4ProCalibration" | "deepseekV4ProDefaultReasoningEffort" | "deepseekV4ProMaxReasoningPresets" | "deepseekFlashCalibration" | "deepseekFlashDefaultReasoningEffort" | "deepseekFlashMaxReasoningPresets">;
export interface DsmmProfileDocument {
    version: 1;
    id: string;
    label?: string;
    settings: DsmmProfileOverlay;
}
export declare class DsmmProfileError extends Error {
    readonly code: ProfileErrorCode;
    readonly field?: string;
    constructor(code: ProfileErrorCode, message: string, field?: string);
    toInfo(): ProfileErrorInfo;
}
export declare function profileErrorInfo(error: unknown, fallback?: ProfileErrorCode): ProfileErrorInfo;
export declare function validateProfileId(id: unknown): asserts id is string;
export declare function validateProfileRevision(revision: unknown, field?: string): asserts revision is string;
export declare function parseProfileDocument(content: string, expectedId?: string): DsmmProfileDocument;
export declare function mergeProfileConfig(baseline: DsmmPluginConfig, overlay: DsmmProfileOverlay): DsmmPluginConfig;
export declare function resolveProfileSettings(baseline: DsmmPluginConfig, overlay: DsmmProfileOverlay): DsmmSettings;
//# sourceMappingURL=profiles.d.ts.map