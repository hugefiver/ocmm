import type { Context } from "@deepseek-ai/cordis";
import type { PreToolDecision, ToolDefinition, ToolExecution } from "@deepseek-ai/dsh-tools";
import type { PermissionExecutionIntegrity } from "./permission-control.js";
import type { PermissionShellIdentity } from "./permission-shell.js";
import type { PermissionRulesRuntimeSync } from "./permission-rules.js";
import type { PermissionRulesStatus } from "./permission-rules.js";
import type { PermissionRuleAction } from "./permission-settings.js";
export interface NativePermissionFsTarget {
    readonly targetKey: unknown;
    readonly displayPath: string;
}
/** Structural public FS capability; keys are never parsed as paths. */
export interface NativePermissionFileSystem {
    resolve(path: string, options?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<NativePermissionFsTarget>;
    contains(parent: NativePermissionFsTarget, child: NativePermissionFsTarget): boolean;
}
type FileSystem = NativePermissionFileSystem;
/** Supplied only by the owner of the actual registered definition/native execution context. */
export interface NativePermissionToolIdentity {
    readonly kind: "read" | "glob" | "grep" | "shell" | "webSearch" | "webFetch";
    readonly context: Context;
    readonly signal?: AbortSignal;
    readonly shell?: PermissionShellIdentity;
    /** Live proof FS and direct rg/Shell executor share path and workspace semantics. No name/cwd inference. */
    coLocated?(execution: Readonly<ToolExecution>, fs: FileSystem): boolean;
    assertCurrent(execution: Readonly<ToolExecution>): void;
    assertIntegrity?(execution: Readonly<ToolExecution>): void;
}
interface NativePermissionAuthority {
    readonly signal: AbortSignal;
    assertCurrent(): void;
}
export interface NativePermissionRulesOptions {
    readonly runtime: PermissionRulesRuntimeSync;
    captureIntegrity?(execution: Readonly<ToolExecution>): PermissionExecutionIntegrity;
    /** Exact registration identity, never trust a matching tool name alone. */
    identify(definition: ToolDefinition, execution: Readonly<ToolExecution>): NativePermissionToolIdentity | undefined;
    /** Capture the invocation's original Core epoch after rule refresh. */
    captureAuthority?(execution: Readonly<ToolExecution>): NativePermissionAuthority;
    /** Pure restriction fallback for standalone consumers without an authority capture. */
    assertCurrent(execution: Readonly<ToolExecution>): void;
    /** Compose this exact registration's native request; never creates an independent approval UI. */
    managedShellDecision?(execution: Readonly<ToolExecution>, action: Exclude<PermissionRuleAction, "deny">, downstream: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
}
/** The public native search tools accept pattern/path/include only; no model-controlled rg flags. */
export declare function parseNativePermissionReadPaths(kind: "read" | "glob" | "grep", input: unknown): readonly string[];
/** Tool-call-boundary rules only. No body fence, scoped memory, socket isolation or final-inode guarantee. */
export declare function registerNativePermissionRules(ctx: Context, options: NativePermissionRulesOptions): () => void;
export interface NativePermissionCapabilities {
    readonly outsideReads: "tool-call-boundary";
    readonly finalInode: false;
    readonly scopedMemory: "not-provided-by-native-rules";
    readonly webFetch: "native-public-only";
    readonly webSearchDestinations: "unsupported";
    readonly proxyAddressBinding: "native-proxy-dependent";
    readonly shellSockets: "native-executor-dependent";
    readonly providerAuthMcp: "not-covered";
}
export declare const NATIVE_PERMISSION_CAPABILITIES: NativePermissionCapabilities;
export interface NativePermissionCapabilityView {
    readonly limits: NativePermissionCapabilities;
    readonly runtime: PermissionRulesStatus;
    /** Registry presence, not executor readiness, network reachability or final-body ownership. */
    readonly tools: readonly {
        readonly name: string;
        readonly kind: NativePermissionToolIdentity["kind"];
        readonly approval: "native-once";
        readonly scopedMemory: false;
    }[];
}
export {};
//# sourceMappingURL=permission-native-rules.d.ts.map