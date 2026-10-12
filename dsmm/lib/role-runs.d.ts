import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContentBlock, ToolCallId } from "@deepseek-ai/dsh-llm";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SubagentRun } from "@deepseek-ai/dsh-subagent";
export type RoleRunState = "starting" | "running" | "background" | "settled" | "cancelled";
export type RoleRunJobId = ReturnType<Context["jobs"]["start"]>;
export interface RoleRunAddress {
    readonly sessionId: SessionId;
    readonly toolCallId: ToolCallId;
    /** The native SubagentRun.id, not the distinct lifecycle-event runId. */
    readonly runId: SubagentRun["id"];
}
/** Host-only identity. Capture/projection are the borrowed original admitted objects. */
export interface RoleRunInvocation<C = unknown, P = unknown> extends RoleRunAddress {
    readonly parent: Agent;
    readonly owner: object;
    readonly admissionEpoch: string;
    readonly capture: C;
    readonly projection: P;
    readonly mode: "one-shot";
    readonly childId?: SessionId;
}
export interface RoleRunForeground<C = unknown, P = unknown> {
    readonly kind: "foreground";
    readonly runId: SubagentRun["id"];
    readonly invocation: RoleRunInvocation<C, P>;
    readonly output: readonly ContentBlock[];
}
export interface RoleRunBackground<C = unknown, P = unknown> {
    readonly kind: "background";
    readonly jobId: RoleRunJobId;
    readonly invocation: RoleRunInvocation<C, P>;
}
export type RoleRunTransition<C = unknown, P = unknown> = {
    readonly status: "background" | "already-background";
    readonly receipt: RoleRunBackground<C, P>;
} | {
    readonly status: "already-settled" | "starting" | "cancelled";
};
export interface RoleRunBackgroundRequest extends RoleRunAddress {
    readonly parent: Agent;
    readonly owner: object;
    readonly expectedAdmissionEpoch: string;
}
export interface RoleRunTeardown {
    /** Supply the stable Host authority's revokeParent, never an epoch-only abort. */
    revokeParent(agent: Agent, reason: string): void;
    /**
     * Invoke the original run disposer. Any opaque native handles/descendants this
     * callback owns MUST also be authority-revoked before their original disposal.
     * The holder revokes the public localAgent before calling this collaborator.
     */
    disposeRun(run: SubagentRun): Promise<void>;
}
export interface RoleRunCollaborators<C = unknown, P = unknown> {
    /** Synchronous exact-parent/entry-owner check plus the current stable epoch. */
    currentEpoch(parent: Agent, owner: object): string;
    /** Trusted admission/operator adapter; no UI/RPC protocol is synthesized here. */
    canBackground(parent: Agent, identity: RoleRunInvocation<C, P>, currentEpoch: string): boolean;
    readonly teardown: RoleRunTeardown;
}
export interface RoleRunStart<C = unknown, P = unknown> {
    readonly parent: Agent;
    readonly owner: object;
    readonly sessionId: SessionId;
    readonly toolCallId: ToolCallId;
    readonly admissionEpoch: string;
    readonly capture: C;
    readonly projection: P;
    readonly label: string;
    readonly callerAbort: AbortSignal;
    readonly jobs?: Context["jobs"];
    /** Call native subagents.start exactly once, forwarding this holder signal. */
    start(signal: AbortSignal): Promise<SubagentRun>;
}
/** One foreground call's real native run and its revocable caller-cancel relay. */
export declare class RoleRunHolder<C = unknown, P = unknown> {
    private readonly controller;
    private readonly readyResult;
    private readonly foregroundResult;
    private readonly drainedResult;
    private currentState;
    private identity?;
    private receipt?;
    private outcome?;
    private terminal;
    private finished;
    private registering;
    private committing;
    private detachParent;
    private readonly callerRelay;
    readonly ready: Promise<RoleRunInvocation<C, P>>;
    readonly foreground: Promise<RoleRunBackground<C, P> | RoleRunForeground<C, P>>;
    /** Quiescence, preserving typed result and aggregate cleanup errors even in background. */
    readonly drained: Promise<void>;
    private readonly request;
    private readonly collaborators;
    private readonly release;
    constructor(request: RoleRunStart<C, P>, collaborators: RoleRunCollaborators<C, P>, release: () => void);
    get state(): RoleRunState;
    get owner(): object;
    get sessionId(): SessionId;
    get toolCallId(): ToolCallId;
    get invocation(): RoleRunInvocation<C, P> | undefined;
    get holderSignal(): AbortSignal;
    cancel(reason?: unknown): void;
    background(request: RoleRunBackgroundRequest): RoleRunTransition<C, P>;
    private assertAddress;
    private assertAuthorization;
    private begin;
    private observed;
}
/** Current process-local calls only; native jobs remain the sole background registry. */
export declare class RoleRunRegistry<C = unknown, P = unknown> {
    private readonly calls;
    private closed;
    private readonly collaborators;
    /** ctx is the stable Host-owned scope, not a reinstalled profile entry. */
    constructor(ctx: Context, collaborators: RoleRunCollaborators<C, P>);
    start(request: RoleRunStart<C, P>): RoleRunHolder<C, P>;
    /** Host-only lookup; C3 must authorize operator/session/epoch before exposing a view. */
    get(parent: Agent, owner: object, address: RoleRunAddress): RoleRunHolder<C, P> | undefined;
    /** Host-only active-call inventory, including starting calls without invented run ids. */
    list(parent: Agent, owner: object): readonly RoleRunHolder<C, P>[];
    /**
     * Trusted parent teardown first revokes C1 authority, then awaits this before
     * the original AgentHandle.dispose. Already-revoked tickets are not reacquired.
     */
    drainParent(parent: Agent, owner: object, reason: string): Promise<void>;
    close(reason: string): void;
    drain(): Promise<void>;
    private awaitHolders;
}
//# sourceMappingURL=role-runs.d.ts.map