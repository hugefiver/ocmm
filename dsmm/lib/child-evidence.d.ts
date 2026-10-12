/** Wire-only evidence projection; no native service or filesystem imports. */
export declare const CHILD_EVIDENCE_FIELDS: readonly ["lineage", "role", "route", "profile-pin", "admission-epoch", "invocation-level", "runtime-policy", "modules", "roles", "read-only", "tool-filter", "route-override", "max-depth", "locale", "tool-topology", "guards", "git-write", "shell", "delegation", "active-intent", "max-tokens", "output-schema"];
export type ChildEvidenceField = typeof CHILD_EVIDENCE_FIELDS[number];
export interface ChildAdmissionLimitation {
    field: ChildEvidenceField;
    code: "missing-evidence" | "not-persisted" | "unverified" | "parent-denied";
    effect: "capability-denied" | "native-default" | "display-only";
}
export interface ChildAdmissionEvidenceView {
    mode: "captured" | "legacy-conservative";
    originalAdmissionEpoch?: string;
    parentAdmissionEpoch: string;
    provenFields: ChildEvidenceField[];
    limitations: ChildAdmissionLimitation[];
}
export declare function parseChildAdmissionEvidenceView(input: unknown): ChildAdmissionEvidenceView;
//# sourceMappingURL=child-evidence.d.ts.map