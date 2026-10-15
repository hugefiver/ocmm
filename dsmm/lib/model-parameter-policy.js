const passthrough = Object.freeze({ mode: "passthrough" });
const nativeDefaults = Object.freeze({ mode: "native-defaults" });
const legacy = Object.freeze({ mode: "legacy-native-v1" });
/** Call with the exact immutable Agent admission; never substitute current parent settings. */
export function resolvedModelParameterPolicy(admission) {
    const capture = admission.childCapture;
    if (capture !== undefined)
        return capture.version === 1 ? legacy : capture.modelParameterPolicy;
    if (admission.childEvidence?.mode === "legacy-conservative")
        return legacy;
    return configuredModelParameterPolicy(admission.settings);
}
/** Cold Core composition may resolve its startup snapshot without waiting for DW. */
export function configuredModelParameterPolicy(settings) {
    return settings.modelParameters.passthrough ? passthrough : nativeDefaults;
}
export function parseModelParameterPolicy(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("mode" in value))
        throw new TypeError("Invalid model parameter policy");
    switch (value.mode) {
        case "passthrough": return passthrough;
        case "native-defaults": return nativeDefaults;
        case "legacy-native-v1": return legacy;
        default: throw new TypeError("Invalid model parameter policy");
    }
}
//# sourceMappingURL=model-parameter-policy.js.map