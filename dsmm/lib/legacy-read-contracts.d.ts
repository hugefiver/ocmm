import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import type { ToolDefinition, ToolExecution, ToolExecutionResult } from "@deepseek-ai/dsh-tools";
import type { LegacyChildEvidence } from "./child-capture.js";
export type LegacyReadUnavailableCode = "composition-unavailable" | "evidence-unavailable" | "provenance-unavailable" | "target-unavailable" | "arguments-unavailable" | "approval-unavailable" | "audit-unavailable" | "lifetime-unavailable";
export declare class LegacyReadUnavailable extends HarnessError {
    readonly code: LegacyReadUnavailableCode;
    constructor(code: LegacyReadUnavailableCode);
}
export interface LegacyReadTarget {
    readonly targetKey: unknown;
    readonly displayPath: string;
}
/** Structural public FileSystem surface: no provider-private target decoding. */
export interface LegacyReadFileSystem {
    resolve(path: string, options: {
        cwd?: string;
        signal: AbortSignal;
    }): Promise<LegacyReadTarget>;
    processPath(target: LegacyReadTarget): string;
    processPathFromHostPath(path: string): string | undefined;
}
export interface LegacyReadBindings {
    readonly parent: Agent;
    readonly child: Agent;
    readonly definition: ToolDefinition;
    readonly mount: object;
    readonly config: object;
    readonly caps: {
        readonly limit: number;
        readonly maxBytes: number;
        readonly maxLineLength: number;
        readonly streamMinSize: number;
    };
    readonly parentFs: LegacyReadFileSystem;
    readonly childFs: LegacyReadFileSystem;
    readonly parentProvider: object;
    readonly childProvider: object;
    readonly parentWorld: object;
    readonly childWorld: object;
}
export interface LegacyReadParentTicket {
    readonly parent: Agent;
    readonly owner: object;
    readonly admission: object;
    readonly parentEpoch: string;
    readonly signal: AbortSignal;
}
export interface LegacyReadEvidenceBinding {
    readonly evidence: LegacyChildEvidence;
    readonly admission: object;
    readonly source: "physical-old";
    readonly physicalRecords: readonly object[];
    /** A present original capture belongs to the captured path, never this proxy. */
    readonly originalCapture?: never;
    readonly childLifetime: AbortSignal;
}
export type LegacyReadStage = "pre" | "guard" | "around" | "post" | "project" | "finalization" | "filter";
export interface LegacyReadClosedSnapshot {
    readonly owner: LegacyReadHostOwner;
    readonly coverage: "host-owned-complete";
    readonly scopes: readonly {
        readonly ctx: Context;
        readonly key: object;
        readonly ancestors: readonly object[];
    }[];
    readonly policies: readonly {
        readonly side: "parent" | "child" | "both";
        readonly stage: LegacyReadStage;
        readonly scope: Context;
        readonly reference: object;
        readonly order: number;
        readonly semantics: "audited-zero-or-once" | "unknown" | "metadata-dependent" | "failure-content-dependent" | "context-dependent" | "ambiguous-transform" | "detached-retry" | "multiple-next";
    }[];
    readonly bindings: readonly LegacyReadBindings[];
    readonly approval: "never-ask" | "coordinated-turn";
    readonly fidelity: "canonical-value-content-contexts";
    readonly mutation: "owner-coordinated";
}
export interface LegacyReadActualOutcomes {
    readonly childExecution: Readonly<ToolExecution>;
    readonly parentExecution?: {
        readonly callId: string;
        readonly rootCallId: string;
        readonly parent: ToolExecution["token"];
    };
    readonly parentResult?: ToolExecutionResult;
    readonly childResult: ToolExecutionResult;
}
declare const ownerBrand: unique symbol;
declare const compositionBrand: unique symbol;
declare const callBrand: unique symbol;
export interface LegacyReadCompositionLease {
    readonly [compositionBrand]: true;
    readonly owner: LegacyReadHostOwner;
    readonly generation: number;
    readonly signal: AbortSignal;
    readonly ticket: LegacyReadParentTicket;
    readonly bindings: LegacyReadBindings;
    readonly approval: LegacyReadClosedSnapshot["approval"];
    assertActive(): void;
    release(): void;
}
export interface LegacyReadCallLease {
    readonly [callBrand]: true;
    readonly approval: {
        readonly kind: "never-ask";
    } | {
        readonly kind: "coordinated-turn";
        readonly turn: {
            readonly parent: Agent;
            readonly openTurnStartSeq: number;
        };
        readonly signal: AbortSignal;
        /** Optional real child turn for local fences/dispatch; not proof of native caller lifetime or child approval support. */
        readonly childTurn?: {
            readonly child: Agent;
            readonly openTurnStartSeq: number;
            readonly signal: AbortSignal;
        };
    };
    readonly signal: AbortSignal;
    /** Check the real turn/audit route again after awaits and immediately before dispatch. */
    assertAvailable(): void;
    finish(outcomes: LegacyReadActualOutcomes): Promise<void>;
    release(): void;
}
export interface LegacyReadHostOwnerCallbacks {
    captureClosedComposition(): LegacyReadClosedSnapshot | undefined;
    acquireParentTicket(parent: Agent): LegacyReadParentTicket;
    assertParentTicket(ticket: LegacyReadParentTicket): void;
    resolveChildAdmission(parent: Agent, child: Agent, evidence: LegacyChildEvidence, ticket: LegacyReadParentTicket): LegacyReadEvidenceBinding;
    resolveReadBindings(parent: Agent, child: Agent, lease: LegacyReadCompositionLease): LegacyReadBindings;
    /**
     * Runs before downstream child pre/approval, and before target mapping or parent dispatch.
     * exec remains the read-only native view with original child arguments and caller signal.
     * Acquisition must consume lease.signal (caller/parent/child/composition revocation) and
     * coordinate real turn leases before its own awaits. The returned lease covers the entire child pipeline,
     * including child-only denial/cancel/error, whose actual outcomes have no parent execution.
     * The owner cleans up resources if acquisition fails before it returns a branded lease.
     */
    acquireCallContext(parent: Agent, child: Agent, exec: ToolExecution, lease: LegacyReadCompositionLease): Promise<LegacyReadCallLease>;
    /** Synchronous admission/opaque-handle revocation BEFORE native drain. */
    revoke(reason: string): void;
    reportAuditFault(error: unknown, outcomes: LegacyReadActualOutcomes): void;
}
export interface LegacyReadHostOwner extends LegacyReadHostOwnerCallbacks {
    readonly [ownerBrand]: true;
}
/** Trusted startup code only. Neither factory is a JSON/RPC attestation endpoint. */
export declare function createLegacyReadHostOwner(callbacks: LegacyReadHostOwnerCallbacks): LegacyReadHostOwner;
export declare function isLegacyReadHostOwner(owner: unknown): owner is LegacyReadHostOwner;
export declare function createLegacyReadCallLease(callbacks: Omit<LegacyReadCallLease, typeof callBrand>): LegacyReadCallLease;
export declare function isLegacyReadCallLease(lease: unknown): lease is LegacyReadCallLease;
export {};
//# sourceMappingURL=legacy-read-contracts.d.ts.map