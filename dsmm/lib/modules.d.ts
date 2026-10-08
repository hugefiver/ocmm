import type { DsmmDeploymentSnapshot, DsmmProfileAdmission, DsmmSettings } from "./settings.js";
/** Static first-party inventory, not a plugin/provider installation interface. */
export declare const DSMM_MODULE_DESCRIPTORS: readonly Readonly<{
    id: "deepwork";
    label: "Deepwork";
    key: "modules.deepwork.enabled";
}>[];
export interface DsmmModuleState {
    descriptor: typeof DSMM_MODULE_DESCRIPTORS[number];
    hostBundleEnabled: "unknown";
    desired: {
        enabled: boolean;
        source: "defaults" | "global";
        capture: "current-global" | "admission" | "startup";
    };
    startupMounted: boolean;
    admitted: boolean | null;
    nextRoot: {
        admitted: boolean;
        reason: "global-disabled" | "restart-required" | null;
    };
    reason: "global-disabled" | "restart-required" | "captured-off" | null;
    pending: boolean;
}
export declare function deepworkEnabled(settings: DsmmSettings): boolean;
export declare function projectDeepworkModule(startup: DsmmSettings, desired?: DsmmDeploymentSnapshot, admission?: DsmmProfileAdmission, currentGlobal?: boolean): DsmmModuleState;
//# sourceMappingURL=modules.d.ts.map