import type { Context } from "@deepseek-ai/cordis";
import type { SubagentCatalogEntry } from "@deepseek-ai/dsh-subagent";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { DeliveryAdmission, ParentAdmissionTicket } from "./delivery-authority.js";
import type { DsmmSubagentRuntime } from "./subagent-runtime.js";
import type { RoleRunInvocation, RoleRunRegistry } from "./role-runs.js";
import type { BackgroundTransitionResult, ChildAdmissionEvidenceView, ChildSessionSnapshot, DsmmInvocationView, DsmmRoleRouteComparison, RoleControlAvailability, RoleControlBackgroundRequest, RoleControlCapabilities, RoleControlDescendantsSnapshot, RoleControlInterruptRequest, SubagentInterruptReceipt, SubagentPromptReceipt, SubagentPromptRequest } from "./role-control-types.js";
export interface RoleControlChildObservation {
    readonly invocation?: DsmmInvocationView;
    readonly routeComparison?: DsmmRoleRouteComparison;
    readonly evidence?: ChildAdmissionEvidenceView;
    readonly prompt: RoleControlAvailability;
    readonly interrupt: RoleControlAvailability;
}
/** Trusted Host adapters borrow captured B/C2b state, never wire claims or new settings. */
export interface RoleControlCollaborators<A extends DeliveryAdmission, E, C, P> {
    readonly runtime: DsmmSubagentRuntime<A, E>;
    readonly runs: RoleRunRegistry<C, P>;
    capabilities(ticket: ParentAdmissionTicket<A>): RoleControlCapabilities;
    projectRun(invocation: RoleRunInvocation<C, P>): DsmmInvocationView;
    backgroundAvailability(ticket: ParentAdmissionTicket<A>, invocation: RoleRunInvocation<C, P>, signal: AbortSignal): Promise<RoleControlAvailability>;
    /** Read-only evidence fold; must not resume/materialize a child. */
    observeChild(ticket: ParentAdmissionTicket<A>, child: SubagentCatalogEntry, signal: AbortSignal): Promise<RoleControlChildObservation>;
}
/** Separate namespace: native inbox/jobs remain the sole execution owners. */
export declare class DsmmChildrenHost<A extends DeliveryAdmission, E, C, P> extends TypertRemoteService {
    private readonly lifetime;
    private readonly backgroundJobs;
    private readonly collaborators;
    constructor(ctx: Context, collaborators: RoleControlCollaborators<A, E, C, P>);
    private invoke;
    private decode;
    private scoped;
    private capabilities;
    private childView;
    private runView;
    describe(sessionId: string): Promise<ChildSessionSnapshot>;
    descendants(sessionId: string): Promise<RoleControlDescendantsSnapshot>;
    background(sessionId: string, input: RoleControlBackgroundRequest): Promise<BackgroundTransitionResult>;
    private directChild;
    prompt(sessionId: string, input: SubagentPromptRequest): Promise<SubagentPromptReceipt>;
    interrupt(sessionId: string, input: RoleControlInterruptRequest): Promise<SubagentInterruptReceipt>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmChildren: DsmmChildrenHost<DeliveryAdmission, unknown, unknown, unknown>;
    }
}
/** Caller supplies an owned Host injection fiber; no replacement or auto-mount. */
export declare function registerRoleControlRpc<A extends DeliveryAdmission, E, C, P>(ctx: Context, collaborators: RoleControlCollaborators<A, E, C, P>): DsmmChildrenHost<A, E, C, P>;
//# sourceMappingURL=role-control-rpc.d.ts.map