import type { DsmmSettings } from "./settings.js";
export declare const DSMM_MANAGED_PRESET_MARKER = ".dsmm-managed-preset";
export interface RolePresetMaterializerOptions {
    root: string;
    settings: DsmmSettings;
}
export declare function resolveManagedPresetRoot(settings: DsmmSettings, env?: NodeJS.ProcessEnv): string | undefined;
export declare function materializeRolePresets(options: RolePresetMaterializerOptions): void;
export declare function reconcileRolePresets({ root, settings }: RolePresetMaterializerOptions): void;
//# sourceMappingURL=preset-materializer.d.ts.map