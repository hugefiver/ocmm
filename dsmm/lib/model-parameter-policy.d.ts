import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";
/** Execution semantics, not an admission or executor capability. */
export type ResolvedModelParameterPolicy = Readonly<{
    mode: "passthrough" | "native-defaults" | "legacy-native-v1";
}>;
/** Call with the exact immutable Agent admission; never substitute current parent settings. */
export declare function resolvedModelParameterPolicy(admission: DsmmProfileAdmission): ResolvedModelParameterPolicy;
/** Cold Core composition may resolve its startup snapshot without waiting for DW. */
export declare function configuredModelParameterPolicy(settings: DsmmSettings): ResolvedModelParameterPolicy;
export declare function parseModelParameterPolicy(value: unknown): ResolvedModelParameterPolicy;
//# sourceMappingURL=model-parameter-policy.d.ts.map