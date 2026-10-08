import type { DshContext } from "./dsh-types.js";
import { FixedConfigFileStore } from "./config-file-store.js";
import type { DsmmDeploymentSnapshot, DsmmPluginConfig } from "./settings.js";
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
}
export declare function parseGlobalConfig(content: string | null): DsmmPluginConfig;
/** Only schema fields, never filesystem paths or array indexes. Full candidate is revalidated. */
export declare function editGlobalConfig(config: DsmmPluginConfig, edits: DeploymentPathEdit[]): DsmmPluginConfig;
/** One native entry's desired reader and one fixed global base; no scheduler or mirror. */
export declare class DsmmDeploymentConfig {
    private readonly ctx;
    private readonly config;
    readonly home: string;
    readonly store: FixedConfigFileStore;
    readonly entryId: string;
    readonly hostProfileKey: string;
    constructor(ctx: DshContext, config: DsmmPluginConfig);
    private profile;
    readGlobal(): Promise<GlobalConfigSnapshot>;
    readDesired(): Promise<DsmmDeploymentSnapshot>;
    saveGlobal(request: GlobalConfigSaveRequest, assertAuthority: () => void): Promise<GlobalConfigSnapshot>;
}
//# sourceMappingURL=deployment-config.d.ts.map