import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { PreToolDecision, ToolDefinition, ToolExecution, ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { NativeCommandEntry } from "./permission-settings.js";
import type { NativePermissionMode } from "./permission-native-access.js";
export { PermissionRefusal } from "./permission-errors.js";
export interface PermissionExecutionAuthority {
    readonly agent: Agent;
    readonly root: Agent;
    readonly realm: object;
    readonly admissionRevision: string;
    readonly permissionRevision: string;
    readonly owner: object;
    readonly ownerGeneration: string | number;
    readonly signal: AbortSignal;
}
export type PermissionRootApprovalAuthority = Pick<PermissionExecutionAuthority, "root" | "realm" | "admissionRevision" | "permissionRevision" | "owner" | "ownerGeneration" | "signal">;
export interface PermissionExecutionIntegrity {
    readonly signal?: AbortSignal;
    assertCurrent(): void;
}
export interface PermissionControlCollaborators {
    current(exec: Readonly<ToolExecution>): PermissionExecutionAuthority;
    rootCurrent?(root: Agent, exec: Readonly<ToolExecution>): PermissionRootApprovalAuthority;
    assertCurrent(authority: PermissionExecutionAuthority, exec: Readonly<ToolExecution>): void;
    /** Physical ownership and real scope lifetime only; never permission/admission epochs. */
    captureIntegrity?(exec: Readonly<ToolExecution>): PermissionExecutionIntegrity;
}
export interface PermissionRegistration {
    readonly definition: ToolDefinition;
    readonly registered: ToolDefinition;
    readonly body: ToolDefinition["execute"];
    readonly identity: object;
    readonly signal?: AbortSignal;
    assertCurrent?(execution: Readonly<ToolExecution>): void;
    approval(): Context["approval"] | undefined;
    standingMode(execution: Readonly<ToolExecution>): string | undefined;
    unchanged(): boolean;
    active: boolean;
}
export declare function permissionOriginal(value: object): object;
type Request = Parameters<Context["approval"]["request"]>[0];
type Outcome = Awaited<ReturnType<Context["approval"]["request"]>>;
/** Explicitly audited DSMM approval adapters retain identity through the patched dispatcher. */
export declare function permissionApprovalAdapter(ctx: Context, listener: (request: Request, next: () => Promise<Outcome>) => Promise<Outcome>): typeof listener;
export declare function isSandboxWidening(requested: NativeCommandEntry["sandboxMode"], standing: string | undefined): boolean;
/** Permission admission precedes native approval; subsequent checks enforce execution integrity only. */
export declare class PermissionControl {
    private readonly ctx;
    private readonly collaborators;
    private readonly lifetime;
    private readonly bindings;
    private readonly requests;
    private readonly execution;
    constructor(ctx: Context, collaborators: PermissionControlCollaborators);
    compose(exec: Readonly<ToolExecution>, registration: PermissionRegistration, entry: NativeCommandEntry | undefined, action: "inherit" | "allow" | "ask", next: () => Promise<PreToolDecision>, cwd: string): Promise<PreToolDecision>;
    private checkIntegrity;
    guard(exec: Readonly<ToolExecution>): string | undefined;
    answerer(request: Request, next: () => Promise<Outcome>): Promise<Outcome>;
    run<T>(exec: ToolRunContext, args: unknown, registration: PermissionRegistration, body: (signal: AbortSignal) => Promise<T>): Promise<T>;
    private request;
    /** Scoped original native body; a target fact is consumed only for its exact official request. */
    nativeApproval(request: Request, service: Context["approval"]): Promise<Outcome>;
    approvedTarget(exec: Readonly<ToolExecution>): NativePermissionMode | undefined;
    sandboxMode(): NativePermissionMode | undefined;
    finish(exec: Readonly<ToolExecution>): void;
    revokePolicy(): void;
    revokeRegistration(registration: PermissionRegistration): void;
    revokeAgent(agent: Agent): void;
    retire(): void;
}
//# sourceMappingURL=permission-control.d.ts.map