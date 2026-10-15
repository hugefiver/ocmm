import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { PermissionRulesRuntimeSync } from "./permission-rules.js";
import type { PermissionRulesBackend, PermissionRulesSaveAuthority, PermissionRulesSaveRequest, PermissionRuleSnapshot, PermissionRulesStatus } from "./permission-rules.js";
import type { DsmmDeploymentConfig } from "./deployment-config.js";
type NativeEntry = ReturnType<Context["loader"]["resolve"]>;
/** Structural projection of the SDK's public ConfigEditor.edit; the façade retains all other members. */
export interface PermissionConfigEditor {
    edit(entry: NativeEntry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>;
}
type NativeEdit = PermissionConfigEditor["edit"];
export interface DeploymentPermissionRulesOptions {
    readonly deployment: Pick<DsmmDeploymentConfig, "nativeEntry" | "home" | "coordinateWrites" | "permissionSource" | "saveGlobal">;
    /** Core readonly/effective-policy check; must not require idle or DW delivery readiness. */
    readonly assertWritable: (root: Agent) => void;
    /** Synchronous revocation of every pending/grant consumer in this owner. */
    readonly revoke: () => void;
    readonly notify: (snapshot: PermissionRuleSnapshot) => Promise<void>;
}
/** Canonical Rules RPC writes the global layer; native overrides remain independently owned. */
export declare class DeploymentPermissionRules implements PermissionRulesBackend {
    private readonly ctx;
    private readonly options;
    readonly runtime: PermissionRulesRuntimeSync;
    readonly initial: PermissionRuleSnapshot;
    private readonly lifetime;
    private readonly operatorWrites;
    private readonly nativeFiber;
    private readonly registry;
    private busy;
    private refreshing?;
    constructor(ctx: Context, options: DeploymentPermissionRulesOptions);
    private snapshot;
    assertWritable(root: Agent): void;
    private check;
    read(authority: PermissionRulesSaveAuthority): Promise<PermissionRuleSnapshot>;
    save(request: PermissionRulesSaveRequest, authority: PermissionRulesSaveAuthority): Promise<{
        snapshot: PermissionRuleSnapshot;
        runtime: PermissionRulesStatus;
    }>;
    private readonly notify;
    /** Host recovery re-reads storage and never revives a former signal or grant. */
    reconcile(): Promise<void>;
    /** Next actual consumption observes disk/native edits without requiring a UI save. */
    private refresh;
    private synchronize;
    private transaction;
    editNative(editor: PermissionConfigEditor, entry: NativeEntry, change: Parameters<NativeEdit>[1]): Promise<void>;
}
/** Install in the owned Core fiber with the public `agents` service injected. */
export declare function installDeploymentPermissionRules(ctx: Context, options: DeploymentPermissionRulesOptions): DeploymentPermissionRules;
/** Scoped to the ordinary SettingsForms owner; never replaces a global instance or registry. */
export declare function permissionConfigEditorFacade<T extends PermissionConfigEditor>(editor: T): T;
export {};
//# sourceMappingURL=deployment-permission-rules.d.ts.map