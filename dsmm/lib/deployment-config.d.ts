import { Context } from "@deepseek-ai/cordis";
import type { DshContext } from "./dsh-types.js";
import { FixedConfigFileStore } from "./config-file-store.js";
import type { DsmmDeploymentSnapshot, DsmmPluginConfig, DsmmNativeConfig } from "./settings.js";
export type DeploymentPathEdit = {
    op: "set";
    path: string[];
    value: unknown;
} | {
    op: "unset";
    path: string[];
};
export interface GlobalConfigSaveRequest {
    expectedRevision: string;
    edits: DeploymentPathEdit[];
}
export interface GlobalConfigSnapshot {
    config: DsmmPluginConfig;
    revision: string;
    refreshRequired?: true;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmDeploymentConfig: DsmmDeploymentConfig;
    }
}
export interface DeploymentWriteCoordinator {
    global(request: GlobalConfigSaveRequest, config: DsmmPluginConfig, assertAuthority: () => void, write: (config: DsmmPluginConfig) => Promise<GlobalConfigSnapshot>): Promise<GlobalConfigSnapshot>;
}
export declare function parseGlobalConfig(content: string | null): DsmmPluginConfig;
/** Only schema fields, never filesystem paths or array indexes. Full candidate is revalidated. */
export declare function editGlobalConfig(config: DsmmPluginConfig, edits: DeploymentPathEdit[]): DsmmPluginConfig;
/** One native entry's desired reader and one fixed global base; no scheduler or mirror. */
export declare class DsmmDeploymentConfig {
    private readonly ctx;
    private readonly config;
    private writeCoordinator?;
    private permissionObservation?;
    readonly home: string;
    readonly store: FixedConfigFileStore;
    readonly entryId: string;
    readonly hostProfileKey: string;
    get nativeEntry(): Context["fiber"]["entry"] | undefined;
    coordinateWrites(coordinator: DeploymentWriteCoordinator): () => void;
    /** Synchronous source identity for permission dispatch fences; no form revision or process identity. */
    permissionSource(): {
        revision: string;
        globalRevision: string;
        nativeRevision: string;
        global: DsmmPluginConfig;
        profile: DsmmPluginConfig;
        policy: {
            nativeCommands: import("./permission-settings.js").NativeCommandsSettings;
            enabled: boolean;
            outsideReads: import("./permission-settings.js").PermissionRuleAction;
            webSearch: import("./permission-settings.js").PermissionWebPolicy;
            webFetch: import("./permission-settings.js").PermissionWebPolicy;
            rules: readonly import("./permission-rules.js").PermissionRule[];
        };
    };
    constructor(ctx: DshContext, config: DsmmNativeConfig);
    private profile;
    readGlobal(): Promise<GlobalConfigSnapshot>;
    readDesired(): Promise<DsmmDeploymentSnapshot>;
    saveGlobal(request: GlobalConfigSaveRequest, assertAuthority: () => void): Promise<GlobalConfigSnapshot>;
}
//# sourceMappingURL=deployment-config.d.ts.map