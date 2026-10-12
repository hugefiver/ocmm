import type { Node } from "jsonc-parser";
export declare const PROFILE_DIAGNOSTIC_REASONS: {
    readonly "invalid-jsonc": "Use one valid document with supported JSON syntax.";
    readonly "duplicate-field": "Remove the duplicate field.";
    readonly "unsafe-field": "Unsafe object fields are not supported.";
    readonly "unknown-field": "This field is not supported; installation and private configuration belong in native deployment configuration.";
    readonly "deprecated-field": "This retired field is not supported; configure explicit role levels instead.";
    readonly "invalid-type": "Use the declared field type and bounded value.";
    readonly "unsupported-value": "Use one of the explicitly supported values.";
    readonly "invalid-route": "Use a complete provider/model route or a nonempty reasoning-effort override.";
    readonly "required-role": "This role is required by the selected Deepwork policy.";
    readonly "deployment-ceiling": "A named profile cannot enable capabilities outside its captured deployment ceiling.";
    readonly "blank-label": "The label is blank; the profile ID is used for display.";
};
export type ProfileDiagnosticCode = keyof typeof PROFILE_DIAGNOSTIC_REASONS;
export interface ProfileDiagnosticLocation {
    offset: number;
    length: number;
    line: number;
    column: number;
}
export interface ProfileDiagnostic {
    severity: "error" | "warning";
    code: ProfileDiagnosticCode;
    field: string;
    reason: string;
    location?: ProfileDiagnosticLocation;
}
export declare const DEPRECATED_DSMM_FIELDS: readonly ["deepseekV4ProMaxReasoningPresets", "deepseekFlashMaxReasoningPresets"];
/** Host parser location provenance only; never serialized on an error or DTO. */
export declare function diagnosticSourcePath(error: object): readonly (string | number)[] | undefined;
export declare function safeDiagnosticField(parts: readonly (string | number)[]): string;
export declare function isSafeDiagnosticField(value: unknown): value is string;
export declare function diagnostic(code: ProfileDiagnosticCode, field: string, location?: ProfileDiagnosticLocation): ProfileDiagnostic;
export declare class DsmmConfigValidationError extends TypeError {
    readonly diagnostic: ProfileDiagnostic;
    constructor(code: ProfileDiagnosticCode, field: string | readonly (string | number)[]);
}
export declare function diagnosticLocation(content: string, offset: number, length: number): ProfileDiagnosticLocation;
export declare function fieldLocation(content: string, tree: Node, field: string, sourcePath?: readonly (string | number)[]): ProfileDiagnosticLocation | undefined;
export declare function inspectJsonDocument(content: string, jsonc?: boolean): {
    tree?: Node;
    diagnostics: ProfileDiagnostic[];
};
//# sourceMappingURL=profile-diagnostics.d.ts.map