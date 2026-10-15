import type { ShellDialect } from "./shell-command.js";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
export type PermissionReadExecutable = "git" | "echo" | "printf" | "pwd" | "ls" | "cat" | "head" | "tail" | "wc" | "rg" | "grep" | "write-output" | "get-location" | "get-childitem" | "get-content";
/** Host-only native resolution proof for the actual execution realm and environment. */
export interface PermissionShellReadCapability {
    readonly signal: AbortSignal;
    /** Return a canonical implementation only after verifying actual executable/cmdlet identity and resolution in this cwd/Agent realm.
     * The effective environment/configuration must exclude external preprocessors, pagers, hooks, fsmonitor, textconv and other dynamic handlers for these reads. */
    resolveExecutable(token: string, workingDirectory: string, execution?: Readonly<ToolExecution>): PermissionReadExecutable | undefined;
    /** Pure check of the same native executable/environment generation; not another SDK/third-party guard. */
    assertCurrent(execution: Readonly<ToolExecution>): void;
}
/** Supplied by the trusted registration adapter, not inferred from a display name. */
export interface PermissionShellIdentity {
    readonly executable: string;
    readonly dialect: ShellDialect;
    readonly commandField: string;
    readonly cwdField?: string;
    readonly readCapability?: PermissionShellReadCapability;
}
export type PermissionEffect = "read" | "local-write" | "external-write" | "destructive" | "unknown";
export interface PermissionOperation {
    readonly effect: PermissionEffect;
    readonly operations: readonly string[];
    readonly rememberable: boolean;
    readonly executable: string;
    readonly command: string;
    readonly workingDirectory: string;
}
/** Classification supports exact-operation authorization, not filesystem or network isolation. */
export declare function classifyPermissionShell(identity: PermissionShellIdentity, args: unknown, cwd: string, execution?: Readonly<ToolExecution>): PermissionOperation;
export interface PermissionShellReadPaths {
    readonly workingDirectory: string;
    readonly paths: readonly string[];
}
/** Typed DSMM extraction, not an SDK operand field. Undefined means exact native ask, not inside. */
export declare function parsePermissionShellReadPaths(identity: PermissionShellIdentity, args: unknown, cwd: string, execution?: Readonly<ToolExecution>): PermissionShellReadPaths | undefined;
//# sourceMappingURL=permission-shell.d.ts.map