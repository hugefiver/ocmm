import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolExecution, ToolGuard, ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { ChildAdmissionLimitation, ChildEvidenceField, LegacyChildEvidence } from "./child-capture.js";
import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";
import type { LegacyReadCompositionLease } from "./legacy-read-contracts.js";
import type { LegacyReadProxy } from "./legacy-read-proxy.js";
export interface LegacyToolCapability {
    readonly kind: "read" | "child-report" | "write" | "shell" | "delegation" | "other";
    /** Stable native definition identity; name alone does not prove parameter permissions. */
    readonly definition: ToolDefinition;
    /** Exact schema/argument contract is audited by the Host/B collaborator, never inferred from a name. */
    assertArguments(arguments_: unknown): void;
    /** A read is admitted only inside the real registered proxy's leased native invocation. */
    readonly operation?: LegacyReadOperationCapability;
}
export interface LegacyReadOperationCapability {
    readonly parent: Agent;
    readonly child: Agent;
    readonly definition: ToolDefinition;
    assertLeasedOperation(exec: Readonly<ToolExecution>): void;
}
/** Process-local glue for the trusted startup adapter, never a permission-query or wire grant. */
export declare function createLegacyReadOperationCapability(proxy: LegacyReadProxy, leaseFor: (exec: Readonly<ToolExecution>) => LegacyReadCompositionLease | undefined): LegacyReadOperationCapability;
export interface LegacyCapabilityCollaborators {
    classifyTool(name: string, tools: ToolRuntime, child: Agent): LegacyToolCapability | undefined;
    /** Exact direct-parent reporting authority only; read permission is decided by the real parent pipeline. */
    assertParentReport?(parent: Agent, child: Agent, arguments_: unknown, definition: ToolDefinition, evidence: LegacyChildEvidence): void;
    /** Older report collaborators may use this spelling. It is NEVER consulted for read. */
    assertParentTool?(parent: Agent, name: string, arguments_: unknown, definition: ToolDefinition): void;
    /** Trusted cold Host inventory of the actual registered child guard; never a permission grant. */
    onGuardInstalled?(child: Agent, guard: ToolGuard): void;
}
export interface LegacyToolDenial {
    readonly field: ChildEvidenceField;
    readonly code: ChildAdmissionLimitation["code"];
}
/** A restrictive current admission, explicitly NOT a reconstruction of the original settings or epoch. */
export declare function createConservativeLegacyAdmission(raw: LegacyChildEvidence, parent: DsmmProfileAdmission, nativeSubstrate: DsmmSettings): DsmmProfileAdmission;
/** Body-before guard for the proven read subset and the native child -> direct-parent report path. */
export declare class LegacyChildToolPolicy {
    private readonly evidence;
    private readonly parent;
    private readonly child;
    private readonly collaborators;
    constructor(evidence: LegacyChildEvidence, parent: Agent, child: Agent, collaborators: LegacyCapabilityCollaborators);
    denial(name: string, arguments_: unknown, tools: ToolRuntime, exec?: Readonly<ToolExecution>): LegacyToolDenial | undefined;
    assertTool(name: string, arguments_: unknown, tools: ToolRuntime, exec?: Readonly<ToolExecution>): void;
}
/** Scoped monotonic native guard; denied bodies never execute, including locally registered tools. */
export declare function installLegacyChildToolPolicy(evidence: LegacyChildEvidence, parent: Agent, child: Agent, collaborators: LegacyCapabilityCollaborators): () => void;
//# sourceMappingURL=legacy-child-policy.d.ts.map