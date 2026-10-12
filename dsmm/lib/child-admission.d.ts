import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ChildAdmissionCompletion, DsmmChildAdmissionAuthority, LegacyChildEvidenceReader, ParentAdmissionTicket } from "./child-admission-contract.js";
import type { ChildAdmissionEvidence, ChildAdmissionEvidenceView, ChildEvidenceField } from "./child-capture.js";
import type { DeliveryPolicyBinding, DsmmDeliveryAuthority } from "./delivery-authority.js";
import type { DshAgent } from "./dsh-types.js";
import type { NativeChildHistory } from "./native-child-evidence.js";
import type { LegacyCapabilityCollaborators } from "./legacy-child-policy.js";
import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";
export interface ChildAdmissionCollaborators {
    /** A owns resident/durable capture lookup and corruption-vs-absence decisions. */
    resolveOriginalChildEvidence(ticket: ParentAdmissionTicket, childId: string, signal: AbortSignal, readLegacy: LegacyChildEvidenceReader): Promise<ChildAdmissionEvidence>;
    /** B owns fresh invocation capture, role identity and target ceiling validation. */
    childAdmission: ChildAdmissionCompletion;
    assertDelivery(ticket: ParentAdmissionTicket, childId: string, evidence: ChildAdmissionEvidence): void;
    classifyParent(parent: Agent): "dsmm" | "native";
}
export interface ChildAdmissionBindingOptions {
    readonly ctx: Context;
    readonly owner: object;
    readonly deliveryAuthority: DsmmDeliveryAuthority<DsmmProfileAdmission, ChildAdmissionEvidence>;
    readonly collaborators: ChildAdmissionCollaborators;
    readonly nativeSubstrate: DsmmSettings;
    /** The exact public Host query service, borrowed in the same scope as the native catalog. */
    readonly nativeHistory: NativeChildHistory;
    readonly legacyCapabilities: LegacyCapabilityCollaborators;
}
/** Connects A's structural contract to C1's opaque ticket provenance without manufacturing Agents. */
export declare function createChildAdmissionBinding(options: ChildAdmissionBindingOptions): {
    authority: DsmmChildAdmissionAuthority;
    policy: DeliveryPolicyBinding<DsmmProfileAdmission, ChildAdmissionEvidence>;
    childAdmission: ChildAdmissionCompletion;
    readLegacy: LegacyChildEvidenceReader;
    resolveOriginalEvidence: (ticket: ParentAdmissionTicket, id: string, signal: AbortSignal) => Promise<ChildAdmissionEvidence>;
    bind(scope: Context): () => void;
    onAdmissionGuardsInstalled(): void;
    /** Holder owner calls this before native disposal/drain; no replacement residency is revoked. */
    revokeBeforeDispose(parent: DshAgent, dispose: () => void | Promise<void>): Promise<void>;
};
/** DTO consumers supply the CURRENT direct-parent epoch; original epochs are not an authorization equality test. */
export declare function projectChildAdmissionEvidence(evidence: ChildAdmissionEvidence, parentAdmissionEpoch: string, parentDenied?: readonly ChildEvidenceField[]): ChildAdmissionEvidenceView;
//# sourceMappingURL=child-admission.d.ts.map