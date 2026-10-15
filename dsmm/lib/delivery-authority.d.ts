import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
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
    isManaged(parent: Agent): boolean;
    registerParent(parent: Agent, admission: A, owner: object): void;
    acquireParentTicket(parent: Agent): ParentAdmissionTicket<A>;
    assertTicket(ticket: ParentAdmissionTicket<A>): void;
    resolveChildEvidence(ticket: ParentAdmissionTicket<A>, childId: SessionId, signal: AbortSignal): Promise<E>;
    assertDelivery(ticket: ParentAdmissionTicket<A>, childId: SessionId, evidence: E): void;
    prepareParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A): void;
    /** Core configuration uses the same exact parent state without acquiring delivery capability. */
    assertCoreParentAdmission(parent: Agent, owner: object, expected: A): void;
    prepareCoreParentAdmission(parent: Agent, owner: object, expected: A, nextAdmission: A): void;
    /** Trusted successful-commit callback: install MUST be synchronous and nonthrowing. */
    publishParentAdmission(parent: Agent, expectedEpoch: string, nextAdmission: A, install: () => void): void;
    revokeParent(parent: Agent, _reason: string): void;
    revokeOwner(owner: object, reason: string): void;
    /** Only the native exact operator/Connection can authorize browser delivery. */
    acquireBrowserSignal(callerCtx: Context): AbortSignal;
    private current;
}
//# sourceMappingURL=delivery-authority.d.ts.map