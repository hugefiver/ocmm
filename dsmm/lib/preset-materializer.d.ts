import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";
export declare const DSMM_MANAGED_PRESET_MARKER = ".dsmm-managed-preset";
export declare const DSMM_MANAGED_PRESET_MARKER_VERSION = 1;
interface PresetFilesystem {
    lstatSync(path: string): PresetFileStatus;
    mkdirSync(path: string, options?: {
        recursive?: boolean;
    }): void;
    readFileSync(path: string, encoding: "utf8"): string;
    readdirSync(path: string): string[];
    realpathSync(path: string): string;
    renameSync(from: string, to: string): void;
    rmSync(path: string, options: {
        recursive: boolean;
        force: boolean;
    }): void;
    writeFileSync(path: string, data: string, encoding: "utf8"): void;
}
export interface RolePresetMaterializerOptions {
    root: string;
    settings: DsmmSettings;
    /** Test-only narrow filesystem seam for fault and link judgement coverage. */
    filesystem?: Partial<PresetFilesystem>;
}
interface PresetFileStatus {
    isSymbolicLink(): boolean;
    isDirectory(): boolean;
    isFile(): boolean;
}
export declare function renderManagedPresetMarker(role: DsmmRoleId): string;
export declare function resolveManagedPresetRoot(settings: DsmmSettings, env?: NodeJS.ProcessEnv): string | undefined;
export declare function materializeRolePresets(options: RolePresetMaterializerOptions): void;
export declare function reconcileRolePresets({ root, settings, filesystem: filesystemOverride }: RolePresetMaterializerOptions): void;
export {};
//# sourceMappingURL=preset-materializer.d.ts.map