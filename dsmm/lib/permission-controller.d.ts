import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { PermissionControl } from "./permission-control.js";
import type { PermissionControlCollaborators } from "./permission-control.js";
import type { PermissionShellIdentity } from "./permission-shell.js";
import type { NativePermissionCapabilityView, NativePermissionFileSystem, NativePermissionToolIdentity } from "./permission-native-rules.js";
import type { PermissionRulesRuntimeSync } from "./permission-rules.js";
import type { NativePermissionAccess } from "./permission-native-access.js";
export type ManagedPermissionShell = "bash" | "pwsh";
export type ManagedPermissionTool = "fs" | "fs-search" | "web";
type NativeToolKind = Exclude<NativePermissionToolIdentity["kind"], "shell">;
export declare const PERMISSION_CONTROLLER_INJECT: readonly ["tools", "agents"];
export interface PermissionControllerOptions {
    /** The existing live Core owner/admission/Root/realm/run facts, not serialized settings or a ready boolean. */
    readonly authority: PermissionControlCollaborators;
    readonly rules: PermissionRulesRuntimeSync;
    /** Native registration identity; only an explicit capability proves Shell read semantics. */
    shellIdentity(scope: Context, kind: ManagedPermissionShell): PermissionShellIdentity;
    coLocated?(scope: Context, execution: Readonly<ToolExecution>, fs: NativePermissionFileSystem): boolean;
}
export interface ManagedPermissionShellCoverage {
    readonly name: string;
    readonly kind: ManagedPermissionShell;
    readonly boundary: "cooperative-body";
    readonly approval: "native-once";
}
export interface ManagedPermissionToolCoverage {
    readonly name: string;
    readonly kind: NativeToolKind;
    readonly boundary: "tool-call-boundary";
    readonly approval: "native-once";
    readonly pathEvidence: "native-fs" | "requires-colocation" | "not-applicable";
}
/** Ordinary module owner. Only registrations captured by native module façades are managed. */
export declare class DsmmPermissionController extends Service {
    private readonly options;
    readonly permissions: PermissionControl;
    readonly rules: PermissionRulesRuntimeSync;
    private readonly registrations;
    private readonly toolRegistrations;
    private readonly lifetime;
    constructor(ctx: Context, options: PermissionControllerOptions);
    /** Public in-process facts for DSMM consumers; requested/configured modes never grant access. */
    nativeAccess(exec: Readonly<ToolExecution>): NativePermissionAccess;
    /** Optional public injection also captures definitions registered before Core publishes this service. */
    static toolScope(scope: Context, kind: ManagedPermissionTool): Context;
    toolScope(scope: Context, kind: ManagedPermissionTool): Context;
    private captureTool;
    /** The receiver is captured before extend: do not register into an Agent's own layer. */
    shellScope(scope: Context, kind: ManagedPermissionShell): Context;
    private registerShell;
    coverage(agent?: Agent): readonly ManagedPermissionShellCoverage[];
    /** Actual visible non-Shell registrations, not executor readiness or co-location proof. */
    toolCoverage(agent?: Agent): readonly ManagedPermissionToolCoverage[];
    capabilities(agent?: Agent): NativePermissionCapabilityView;
    retire(): void;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmPermissionController: DsmmPermissionController;
    }
}
/** Parent supplies the real existing Core collaborators and A's sole runtime-sync owner. */
export declare function installPermissionController(ctx: Context, options: PermissionControllerOptions): DsmmPermissionController;
export {};
//# sourceMappingURL=permission-controller.d.ts.map