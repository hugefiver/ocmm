import type { DsmmInvocationLevel, DsmmLocale, DsmmModelRoute, DsmmProfileAdmission, DsmmSettings, DsmmToolTopology } from "./settings.js";
import type { ResolvedModelParameterPolicy } from "./model-parameter-policy.js";
import type { DsmmRoleId } from "./roles.js";
import type { ChildAdmissionLimitation, ChildEvidenceField } from "./child-evidence.js";
export { CHILD_EVIDENCE_FIELDS, parseChildAdmissionEvidenceView } from "./child-evidence.js";
export type { ChildAdmissionEvidenceView, ChildAdmissionLimitation, ChildEvidenceField } from "./child-evidence.js";
import type { DsmmRouteSource } from "./profile-types.js";
export { DSMM_ROUTE_SOURCES } from "./profile-types.js";
export type { DsmmRouteSource } from "./profile-types.js";
export interface ChildToolFilter {
    allow?: string[];
    deny?: string[];
}
export interface ChildAuthorityCeiling {
    roles: DsmmRoleId[];
    readOnly: boolean;
    toolFilter?: ChildToolFilter;
    allowRouteOverride: boolean;
    maxDepth: number;
}
export type ChildRuntimePolicyCapture = Pick<DsmmSettings, "modules" | "roleRouting" | "runtimePolicy" | "workflow" | "guards" | "runtimeRecovery" | "defaultActive" | "skills"> & {
    subagents: Pick<DsmmSettings["subagents"], "enableRunInBackground" | "backgroundMode">;
};
export type HistoricalChildRuntimePolicyCapture = ChildRuntimePolicyCapture & {
    deepseekV4ProCalibration: "off" | "auto" | "strict";
    deepseekFlashCalibration: "off" | "auto" | "strict";
    deepseekV4ProDefaultReasoningEffort: "off" | "low" | "high";
    deepseekFlashDefaultReasoningEffort: "off" | "low" | "high";
};
interface ChildAdmissionCaptureBase {
    childSessionId: string;
    parentSessionId: string;
    role: DsmmRoleId;
    profilePin: {
        id: string;
        revision: string;
    } | null;
    originalAdmissionEpoch: string;
    invocation: {
        level: DsmmInvocationLevel;
        initialRoute: DsmmModelRoute;
        routeSource: DsmmRouteSource;
    };
    runtimePolicyCapture: ChildRuntimePolicyCapture;
    authorityCeiling: ChildAuthorityCeiling;
    locale?: DsmmLocale;
    toolTopology: DsmmToolTopology;
}
export interface ChildAdmissionCaptureV1 extends ChildAdmissionCaptureBase {
    version: 1;
    runtimePolicyCapture: HistoricalChildRuntimePolicyCapture;
}
export interface ChildAdmissionCaptureV2 extends ChildAdmissionCaptureBase {
    version: 2;
    runtimePolicyCapture: HistoricalChildRuntimePolicyCapture;
    modelParameterPolicy: ResolvedModelParameterPolicy;
    invocation: ChildAdmissionCaptureBase["invocation"] & {
        requestedRoute: DsmmModelRoute;
        effortSource: "native" | "dsmm-config";
    };
}
export interface ChildAdmissionCaptureV3 extends ChildAdmissionCaptureBase {
    version: 3;
    delegationMode: "one-shot" | "continuable";
    modelParameterPolicy: ResolvedModelParameterPolicy;
    invocation: ChildAdmissionCaptureV2["invocation"];
}
export type ChildAdmissionCapture = ChildAdmissionCaptureV1 | ChildAdmissionCaptureV2 | ChildAdmissionCaptureV3;
/** Trusted native folds only; never synthesized from the current parent's settings. */
export interface LegacyChildEvidence {
    version: 1;
    mode: "legacy-conservative";
    childSessionId: string;
    parentSessionId: string;
    role: DsmmRoleId;
    route: DsmmModelRoute;
    depth: number;
    toolFilter?: ChildToolFilter;
    active?: boolean;
    provenFields: ChildEvidenceField[];
    limitations: ChildAdmissionLimitation[];
}
export type ChildAdmissionEvidence = ChildAdmissionCapture | LegacyChildEvidence;
export interface PreparedChildAdmission {
    evidence: ChildAdmissionEvidence;
    /** The trusted resolver supplies legacy's conservative intersection, not a parent clone. */
    admission: DsmmProfileAdmission;
    /** Only new creation writes a capture. Retained/cold evidence never rewrites it. */
    creation: boolean;
}
export declare function parseLegacyChildEvidence(input: unknown): LegacyChildEvidence;
export declare function parseChildAdmissionCapture(input: unknown): ChildAdmissionCapture;
/** Native service substrate stays Host-owned; all executable policy comes from original capture. */
export declare function admissionFromChildCapture(input: ChildAdmissionCapture, nativeSubstrate: DsmmSettings): DsmmProfileAdmission;
//# sourceMappingURL=child-capture.d.ts.map