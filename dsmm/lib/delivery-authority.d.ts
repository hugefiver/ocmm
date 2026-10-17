import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { ManagedCreation } from "./agent-registry.js";
/** A borrowed immutable admission, never reconstructed from current settings. */
export interface DeliveryAdmission {
    readonly epoch: string;
}
export type DeliveryParentClassifier = (parent: Agent) => "dsmm" | "native";
export interface ParentAdmissionTicket<A extends DeliveryAdmission = DeliveryAdmission> {
    readonly parent: Agent;
    readonly owner: object;
    readonly admission: A;
    readonly parentEpoch: string;
    readonly signal: AbortSignal;
}
/** Host-only collaborators supply the original capture/evidence and role policy. */
export interface DeliveryPolicyBinding<A extends DeliveryAdmission, E> {
    /** Inspect trusted DSMM origin/role facts; missing registration is not proof of native identity. */
    classifyParent: DeliveryParentClassifier;
    resolveChildEvidence(ticket: ParentAdmissionTicket<A>, childId: SessionId, signal: AbortSignal): Promise<E>;
    /** Check direct target identity, original ceiling AND current parent authorization. */
    assertDelivery(ticket: ParentAdmissionTicket<A>, childId: SessionId, evidence: E): void;
    /** Exact Host-minted native proof; absent proof always requires managed admission. */
    isNativeEvidence?(evidence: E): boolean;
}
export interface DeliveryFenceView {
    readonly binding: "dsmm";
    readonly deliveryFenceReady: boolean;
    readonly restartRequired: false;
    readonly reason?: "authority-not-ready";
}
/** Public plugin/status dispatch precedes async cleanup, including ancestor Host teardown. */
export declare function scopeLifetime(scope: Context, label: string, revoke: () => void, install?: () => void): () => void;
/** Stable Host lifetime; profile entry disposal must not replace this object. */
export declare class DsmmDeliveryAuthority<A extends DeliveryAdmission = DeliveryAdmission, E = unknown> {
    private readonly ctx;
    private readonly lifetime;
    private readonly parents;
    private readonly tickets;
    private readonly managedIds;
    private readonly managed;
    private readonly liveManaged;
    private readonly retiredAgents;
    private binding?;
    private connection?;
    private readonly providersReady;
    private readonly changed;
    private readonly hostClassifier?;
    constructor(ctx: Context, providersReady?: () => boolean, changed?: () => void, hostClassifier?: DeliveryParentClassifier);
    view(): DeliveryFenceView;
    /** Bind once per entry scope; teardown revokes its pending tickets synchronously. */
    bindPolicy(scope: Context, owner: object, policy: DeliveryPolicyBinding<A, E>): () => void;
    /** Called after A/B admission/capture guards are installed, not at service mount. */
    enablePolicy(owner: object): void;
    isManaged(parent: Agent, intent?: "delivery" | "creation"): boolean;
    registerParent(parent: Agent, admission: A, owner: object): void;
    beginPending(operation: ManagedCreation, agent: Agent): void;
    /** Receipt acceptance, not the caller's old operation signal, opens execution. */
    promote(operation: ManagedCreation): void;
    assertSender(parent: Agent): void;
    waitForPromotion(parent: Agent, signal?: AbortSignal): Promise<void>;
    retireOperation(operation: ManagedCreation, reason: string): void;
    acquireParentTicket(parent: Agent): ParentAdmissionTicket<A>;
    assertTicket(ticket: ParentAdmissionTicket<A>): void;
    resolveChildEvidence(ticket: ParentAdmissionTicket<A>, childId: SessionId, signal: AbortSignal): Promise<E>;
    /** Validate the target and return whether its materialization requires DSMM capture. */
    assertDelivery(ticket: ParentAdmissionTicket<A>, childId: SessionId, evidence: E): boolean;
    prepareParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A): void;
    /** Core configuration uses the same exact parent state without acquiring delivery capability. */
    assertCoreParentAdmission(parent: Agent, owner: object, expected: A): void;
    prepareCoreParentAdmission(parent: Agent, owner: object, expected: A, nextAdmission: A): void;
    /** Trusted successful-commit callback: install MUST be synchronous and nonthrowing. */
    publishParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A, install: () => void): void;
    revokeParent(parent: Agent, _reason: string): void;
    /** Admission withdrawal invalidates tickets without terminating a living Agent. */
    withdrawParent(parent: Agent, reason: string): void;
    revokeOwner(owner: object, reason: string): void;
    /** Only the native exact browser peer/Connection can authorize browser delivery. */
    acquireBrowserSignal(callerCtx: Context): AbortSignal;
    private current;
}
//# sourceMappingURL=delivery-authority.d.ts.map