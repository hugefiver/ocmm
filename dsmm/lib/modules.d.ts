import type { DsmmDeploymentSnapshot, DsmmProfileAdmission, DsmmSettings } from "./settings.js";
/** Static first-party inventory, not a plugin/provider installation interface. */
export declare const DSMM_MODULE_DESCRIPTORS: readonly (Readonly<{
    id: "deepwork";
    label: "Deepwork";
    key: "modules.deepwork.enabled";
}> | Readonly<{
    id: "permission-control";
    label: "Permission control";
    key: "permissionControl.enabled";
}>)[];
export interface DsmmModuleState {
    descriptor: typeof DSMM_MODULE_DESCRIPTORS[number];
    hostBundleEnabled: "unknown";
    desired: {
        enabled: boolean;
        source: "defaults" | "global" | "profile";
        capture: "current-global" | "admission" | "startup";
    };
    startupMounted: boolean | null;
    admitted: boolean | null;
    nextRoot: {
        admitted: boolean | null;
        reason: "global-disabled" | "restart-required" | null;
    };
    reason: "global-disabled" | "restart-required" | "captured-off" | null;
    pending: boolean;
}
/** Trusted Host lifecycle observation; missing or retired owners return null, not readiness. */
export type DsmmMountedPermissionGetter = () => boolean | null;
export declare function deepworkEnabled(settings: DsmmSettings): boolean;
export declare function projectDeepworkModule(startup: DsmmSettings, desired?: DsmmDeploymentSnapshot, admission?: DsmmProfileAdmission, currentGlobal?: boolean): DsmmModuleState;
/** Both projections share the same captured deployment/admission; module state grants no authority. */
export declare function projectDsmmModules(startup: DsmmSettings, desired?: DsmmDeploymentSnapshot, admission?: DsmmProfileAdmission, currentGlobal?: boolean, getMountedPermission?: DsmmMountedPermissionGetter): DsmmModuleState[];
//# sourceMappingURL=modules.d.ts.map