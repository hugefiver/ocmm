import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Scope } from "@deepseek-ai/dsh-scope";
import type { ToolDefinition, ToolExecution } from "@deepseek-ai/dsh-tools";
import type { ChildAdmissionEvidence, LegacyChildEvidence } from "./child-capture.js";
import type { ChildAdmissionCollaborators } from "./child-admission.js";
import type { ParentAdmissionTicket as ProfileParentAdmissionTicket } from "./child-admission-contract.js";
import type { DsmmDeliveryAuthority, ParentAdmissionTicket } from "./delivery-authority.js";
import type { LegacyCapabilityCollaborators, LegacyToolCapability } from "./legacy-child-policy.js";
import type { LegacyReadActualOutcomes, LegacyReadBindings, LegacyReadCallLease, LegacyReadClosedSnapshot, LegacyReadCompositionLease } from "./legacy-read-contracts.js";
import type { LegacyReadProxy } from "./legacy-read-proxy.js";
import type { NativeChildHistory } from "./native-child-evidence.js";
import type { DsmmProfileAdmission } from "./settings.js";
export interface LegacyReadAdmissionSource {
    /** A's corruption-vs-absence resolver, using the issued C1 ticket; a capture never enters this adapter. */
    resolveOriginalChildEvidence(ticket: ParentAdmissionTicket<DsmmProfileAdmission>, childId: string, signal: AbortSignal): Promise<ChildAdmissionEvidence>;
    /** The exact immutable A admission, published before external execution but after original evidence validation. */
    childAdmission(child: Agent): DsmmProfileAdmission;
    /** B's current module/role/direct-target ceiling. This does not check or grant a read permission. */
    assertCurrentParent(ticket: ParentAdmissionTicket<DsmmProfileAdmission>, child: Agent, evidence: LegacyChildEvidence): void;
}
export interface LegacyReadIntegrationChild {
    readonly parent: Agent;
    readonly child: Agent;
    readonly evidence: LegacyChildEvidence;
    readonly admission: DsmmProfileAdmission;
    readonly bindings: LegacyReadBindings;
    readonly proxy: LegacyReadProxy;
    readonly policyScope: Scope;
    readonly contributions: LegacyReadClosedSnapshot["policies"];
}
export interface LegacyReadTrustedStartup {
    /** Host constructs/controls ALL applicable ancestors/global policies and service/mount/config ordering. No SDK scanning. */
    captureClosedComposition(children: readonly LegacyReadIntegrationChild[]): Omit<LegacyReadClosedSnapshot, "owner" | "bindings"> | undefined;
    /** References from the actual Host-owned native FS mount, never a tool-name/visibility lookup as provenance. */
    resolveReadBindings(parent: Agent, child: Agent): LegacyReadBindings | undefined;
    /** Outer pre acquisition receives RAW child arguments BEFORE body validation/target mapping and downstream child policy.
     * Never infer permission from those arguments. Consume lease.signal before own awaits and cover both pipelines/finalization.
     * finish must audit child-only deny/cancel/error without parentExecution/parentResult. Never-ask covers both sides;
     * The native pre exec.signal is read-only: use local fusion, never cast/write it.
     * Stock/model/native child asks are unavailable before approval; childTurn does not enable controlled child ask.
     * Legal parent approval uses L's merged PUBLIC parent tools.execute input from the proxy body. */
    acquireCallContext(parent: Agent, child: Agent, exec: ToolExecution, lease: LegacyReadCompositionLease): Promise<LegacyReadCallLease>;
    reportAuditFault(error: unknown, outcomes: LegacyReadActualOutcomes): void;
    reportRetirementFault(error: unknown, child: Agent): void;
    /** Close Host-owned turn/audit lifetimes synchronously, before native drain. */
    revoke(reason: string): void;
}
export interface LegacyReadProxyDefinitions {
    /** Awaited registration in B's actual exact-Agent trusted-definition registry, not a name allowlist. */
    admit(parent: Agent, child: Agent, definition: ToolDefinition): void | Promise<void>;
    /** Assert the exact registered object in B's real guard. This is NOT parent parameter permission. */
    assertAdmitted(child: Agent, definition: ToolDefinition): void;
}
export interface LegacyReadCoreAdmissions {
    /** A's actual resolver receives the bridge's genuine borrowed-ticket -> native-history reader as its fourth argument. */
    readonly resolveOriginalChildEvidence: ChildAdmissionCollaborators["resolveOriginalChildEvidence"];
    /** B's actual original/current direct-parent delivery validator, not a tool-permission query. */
    readonly assertDelivery: ChildAdmissionCollaborators["assertDelivery"];
}
export interface LegacyReadCoreConsumption {
    readonly legacyCapabilities: LegacyCapabilityCollaborators;
    readonly classifyLegacyTool: LegacyCapabilityCollaborators["classifyTool"];
    readonly resolveOriginalChildEvidence: ChildAdmissionCollaborators["resolveOriginalChildEvidence"];
    /** Called ONLY inside the bridge's already native-ticket-validated legacy delivery branch. Captured delivery stays in Core/B. */
    assertLegacyDelivery(ticket: ProfileParentAdmissionTicket, childId: string, evidence: LegacyChildEvidence): void;
    /** Await after immutable A admission, inside native serial created admission BEFORE the holder/inbox is exposed. */
    afterChildAdmission(parent: Agent, child: Agent, signal: AbortSignal): Promise<LegacyReadIntegrationChild | undefined>;
    publishCheckedGeneration(): void;
    changeConfiguration(reason: string, mutate: () => void | Promise<void>): Promise<void>;
    /** Wrap Core's revoke/registry/native disposal; revoke operation lifetimes and drain audit before calling it. */
    revokeBeforeDispose(agent: Agent, nativeDrainAndDispose: () => void | Promise<void>): Promise<void>;
    dispose(nativeDrain: () => Promise<void>): Promise<void>;
}
export interface LegacyReadIntegrationOptions<E = ChildAdmissionEvidence> {
    readonly ctx: Context;
    readonly authority: DsmmDeliveryAuthority<DsmmProfileAdmission, E>;
    readonly authorityOwner: object;
    readonly admissions: LegacyReadAdmissionSource;
    readonly nativeHistory: NativeChildHistory;
    /** Missing managed-definition admission makes the optional read path unavailable. */
    readonly proxyDefinitions?: LegacyReadProxyDefinitions;
    /** Optional COLD Core seam. Construct before this actual C1 authority enables delivery; never a post-ready replacement. */
    readonly coreAdmissions?: LegacyReadCoreAdmissions;
    /** B's exact native report contract is independent of the optional read composition. */
    readonly classifyChildReport?: LegacyCapabilityCollaborators["classifyTool"];
    /** Omitted by default. A profile/RPC boolean is not this trusted programmatic startup contract. */
    readonly trustedHostStartup?: LegacyReadTrustedStartup;
}
export interface LegacyReadIntegrationView {
    readonly state: "off" | "ready" | "quiescing" | "unavailable";
    readonly operation: "read";
    readonly generation?: number;
    readonly activeCalls: number;
    readonly reason?: "startup-opt-in-required" | "unknown-chain" | "audit-unavailable";
}
/** Explicit Host programmatic composition only. Owns glue, not a second permission, retry or audit service. */
export declare function createLegacyReadIntegration<E>(options: LegacyReadIntegrationOptions<E>): {
    core: LegacyReadCoreConsumption | undefined;
    host: {
        composition: import("./legacy-read-composition.js").LegacyReadComposition;
        attachChild(parent: Agent, child: Agent, evidence: LegacyChildEvidence, definition: ToolDefinition): LegacyReadProxy;
        releaseAfterChildDispose(child: Agent): Promise<void>;
        publishCheckedGeneration(): void;
        dispose(nativeDrain: () => Promise<void>): Promise<void>;
    };
    legacyCapabilities: LegacyCapabilityCollaborators;
    /** B consumes this same classifier when validating the child report/tool definition. */
    classifyLegacyTool: (name: string, tools: import("@deepseek-ai/dsh-tools").ToolRuntime, child: Agent) => LegacyToolCapability | undefined;
    view(): LegacyReadIntegrationView;
    attachChild(parent: Agent, child: Agent, signal: AbortSignal): Promise<LegacyReadIntegrationChild>;
    publishCheckedGeneration(): void;
    /** Close synchronously; mutate only after real pipelines AND audit leases have drained. */
    change(reason: string, mutate: () => void | Promise<void>): Promise<void>;
    removeProxy(child: Agent): Promise<void>;
    /** Opaque native holders call before beginning disposal; ordinary residency teardown also retires automatically. */
    revokeChildBeforeDispose(child: Agent, nativeDispose: () => void | Promise<void>): Promise<void>;
    whenChildRetired(child: Agent): Promise<void>;
    dispose(nativeDrain: () => Promise<void>): Promise<void>;
};
//# sourceMappingURL=legacy-read-integration.d.ts.map