/** Static first-party inventory, not a plugin/provider installation interface. */
export const DSMM_MODULE_DESCRIPTORS = Object.freeze([
    Object.freeze({ id: "deepwork", label: "Deepwork", key: "modules.deepwork.enabled" })
]);
export function deepworkEnabled(settings) { return settings.modules.deepwork.enabled; }
export function projectDeepworkModule(startup, desired, admission, currentGlobal = false) {
    const enabled = desired?.settings.modules.deepwork.enabled ?? startup.modules.deepwork.enabled;
    const mounted = deepworkEnabled(startup);
    const admitted = admission === undefined ? null : deepworkEnabled(admission.settings);
    const next = enabled && mounted;
    const reason = !enabled ? "global-disabled" : !mounted ? "restart-required" : null;
    return {
        descriptor: { ...DSMM_MODULE_DESCRIPTORS[0] }, hostBundleEnabled: "unknown",
        desired: { enabled, source: desired?.sources["modules.deepwork.enabled"] === "global" ? "global" : "defaults",
            capture: currentGlobal ? "current-global" : admission === undefined ? "startup" : "admission" },
        startupMounted: mounted, admitted, nextRoot: { admitted: next, reason },
        reason: admitted === false && next ? "captured-off" : admitted === true ? null : reason,
        pending: enabled !== mounted || admitted !== null && admitted !== next
    };
}
//# sourceMappingURL=modules.js.map