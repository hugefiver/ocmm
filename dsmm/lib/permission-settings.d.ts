import z from "@deepseek-ai/schemastery";
import type { PermissionRule } from "./permission-rules.js";
export type PermissionRuleAction = "inherit" | "allow" | "ask" | "deny";
export interface PermissionWebPolicy {
    readonly enabled: boolean;
    readonly rule: PermissionRuleAction;
}
export interface NativeCommandEntry {
    readonly id: string;
    readonly mode: "ask" | "allow";
    readonly match: {
        readonly tool: "bash" | "pwsh";
        readonly executable: string;
        readonly subcommand?: string;
        readonly args: readonly string[];
        readonly workingDirectory: string;
    };
    readonly sandboxMode: "workspace-write" | "danger-full-access";
}
export interface NativeCommandsSettings {
    readonly enabled: boolean;
    readonly entries: readonly NativeCommandEntry[];
}
/** Only enabled is deployment-only. Rules are independently synchronized at runtime. */
export interface PermissionControlSettings {
    readonly enabled: boolean;
    readonly outsideReads: PermissionRuleAction;
    readonly webSearch: PermissionWebPolicy;
    readonly webFetch: PermissionWebPolicy;
    readonly rules: readonly PermissionRule[];
    readonly nativeCommands: NativeCommandsSettings;
}
export interface PermissionControlSchemaInput {
    readonly enabled?: boolean;
    readonly outsideReads?: PermissionRuleAction;
    readonly webSearch?: Partial<PermissionWebPolicy>;
    readonly webFetch?: Partial<PermissionWebPolicy>;
    readonly rules?: readonly PermissionRule[];
    readonly nativeCommands?: Partial<NativeCommandsSettings>;
}
export declare function parseNativeCommands(input?: unknown): NativeCommandsSettings;
export declare const DEFAULT_PERMISSION_CONTROL: PermissionControlSettings;
export declare const permissionControlSchema: z<PermissionControlSettings>;
export declare function resolvePermissionControl(input?: PermissionControlSchemaInput): PermissionControlSettings;
//# sourceMappingURL=permission-settings.d.ts.map