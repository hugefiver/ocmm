import type { TemporaryPermissionDuration, TemporaryPermissionGrantView } from "./permission-temporary-types.js";
export interface TemporaryApprovalWinner {
    readonly requestId: string;
    readonly deliveryId?: string;
    readonly answerId?: string;
    readonly candidate: string;
    readonly source: "operator" | "temporary" | "unknown";
    readonly automatic: boolean;
    readonly permit?: string;
    readonly retention?: string;
}
export interface TemporaryApprovalReceipt {
    readonly requestId: string;
    readonly generation: string;
    readonly outcome: string;
    readonly auditSeq: number;
    readonly source: TemporaryApprovalWinner["source"];
    readonly winner?: TemporaryApprovalWinner;
}
export interface TemporaryApprovalDelivery {
    readonly requestId: string;
    readonly deliveryId: string;
    readonly peer: object;
    readonly request: object;
    readonly signal: AbortSignal;
}
export interface TemporaryApprovalRuntime {
    request(request: object, options: {
        opened(id: string): void;
    }): Promise<string>;
    settlement(id: string): TemporaryApprovalReceipt | undefined;
    forgetSettlement(id: string): void;
}
export interface TemporaryApprovalGateway {
    approvalDelivery(peer: object, requestId: string, deliveryId: string): TemporaryApprovalDelivery | undefined;
    registerApprovalPermits(verify: (delivery: TemporaryApprovalDelivery, permit: string) => boolean): () => void;
}
/** Captured by the actual execution adapter. All object identities are Host-only. */
export interface TemporaryPermissionExecution {
    readonly token: unknown;
    readonly agent: object;
    readonly owner: object;
    readonly generation: string | number;
    readonly registration: object;
    readonly provider: object;
    readonly sessionId: string;
    readonly tool: string;
    readonly project: string;
    readonly target: string;
    readonly summary: string;
    readonly reusable: boolean;
    readonly signal: AbortSignal;
    readonly sessionSignal: AbortSignal;
    /** Host-owned resolved resource and explicit additional scopes; never accepted from RPC. */
    readonly resource?: object;
    readonly scopes?: readonly TemporaryPermissionScope[];
    /** Integrity must not invalidate a manual same-call approval merely for a config revision. */
    assertIntegrity(): void;
    /** Rechecks deny, policy, provider, effective env and owner for automatic use. */
    assertReusable(): void;
}
export interface TemporaryPermissionScope {
    readonly id: string;
    readonly summary: string;
    allows(execution: TemporaryPermissionExecution): boolean;
}
/** One Host store; it holds grant authority, never pending UI questions or retry work. */
export declare class TemporaryPermissionGrants {
    private readonly approval;
    private readonly gateway;
    private readonly now;
    private readonly grants;
    private readonly pending;
    private readonly permits;
    private readonly unregister;
    private retired;
    constructor(approval: TemporaryApprovalRuntime, gateway: TemporaryApprovalGateway, now?: () => number);
    private integrity;
    private active;
    private delivery;
    request(peer: object, requestId: string, deliveryId: string): Readonly<{
        scopes?: {
            id: string;
            summary: string;
        }[] | undefined;
        requestId: string;
        deliveryId: string;
        sessionId: string;
        tool: string;
        summary: string;
        reusable: boolean;
    }>;
    retain(peer: object, requestId: string, deliveryId: string, duration: TemporaryPermissionDuration, scopeId?: string): string;
    permit(peer: object, requestId: string, deliveryId: string): string | null;
    private validatePermit;
    approve(request: object, execution: TemporaryPermissionExecution): Promise<{
        check(): void;
        consume(): void;
        finish(): void;
    }>;
    list(agent: object): readonly TemporaryPermissionGrantView[];
    revoke(agent: object, id: string): readonly TemporaryPermissionGrantView[];
    revokeAgent(agent: object): void;
    dispose(): void;
}
//# sourceMappingURL=permission-temporary-grants.d.ts.map