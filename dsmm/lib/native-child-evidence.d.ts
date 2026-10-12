import type { Context } from "@deepseek-ai/cordis";
import type { SessionEvent, SessionHeader, SessionId as NativeSessionId } from "@deepseek-ai/dsh-session";
import type { ContinuableSubagentDescriptorData } from "@deepseek-ai/dsh-subagent";
import type { ParentAdmissionTicket } from "./delivery-authority.js";
import type { ChildAdmissionCapture, LegacyChildEvidence } from "./child-capture.js";
import type { DsmmProfileAdmission } from "./settings.js";
import type { DsmmRoleId } from "./roles.js";
/** Host-only borrowed cut returned by the PUBLIC SessionQueryEngine.observeSession service. */
export interface NativeChildObservation extends Disposable {
    readonly header: SessionHeader;
    readonly inheritedEventCount: number;
    readonly events: readonly SessionEvent[];
}
/** Injection avoids making the optional query provider a new DSMM package dependency. No wire caller supplies history. */
export interface NativeChildHistory {
    observeSession(id: NativeSessionId, options: {
        signal: AbortSignal;
        projectionMode: "none";
    }): Promise<NativeChildObservation>;
}
export interface NativeChildFacts {
    readonly childSessionId: string;
    readonly parentSessionId: string;
    readonly depth: number;
    readonly role: DsmmRoleId;
    readonly descriptor: ContinuableSubagentDescriptorData;
    readonly active?: boolean;
    readonly requestBudgetObserved: boolean;
}
/** Exact public catalog and replay-validated physical cuts; never resumes an Agent. */
export declare class NativeChildEvidenceReader {
    private readonly ctx;
    private readonly assertTicket;
    private readonly history;
    constructor(ctx: Context, assertTicket: (ticket: ParentAdmissionTicket<DsmmProfileAdmission>) => void, history: NativeChildHistory);
    read(ticket: ParentAdmissionTicket<DsmmProfileAdmission>, childId: string, callerSignal: AbortSignal): Promise<NativeChildFacts>;
    legacy(ticket: ParentAdmissionTicket<DsmmProfileAdmission>, childId: string, signal: AbortSignal): Promise<LegacyChildEvidence>;
}
export declare function legacyEvidenceFromNativeFacts(facts: NativeChildFacts): LegacyChildEvidence;
/** Capture evidence must agree with the child's establishing descriptor, not current parent routing. */
export declare function assertNativeChildCapture(capture: ChildAdmissionCapture, facts: NativeChildFacts): void;
//# sourceMappingURL=native-child-evidence.d.ts.map