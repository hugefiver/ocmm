import type { ToolRestriction, ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "./dsh-types.js";
export { allowedRoleChildren } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { ChildAdmissionCompletion, ChildRoleAdmissionCandidate, ParentAdmissionTicket } from "./child-admission-contract.js";
import type { ChildAdmissionEvidence, PreparedChildAdmission } from "./child-capture.js";
import type { LegacyCapabilityCollaborators } from "./legacy-child-policy.js";
export { createConservativeLegacyAdmission as conservativeLegacyAdmission } from "./legacy-child-policy.js";
import type { ResolvedRoleInvocation } from "./role-invocation.js";
import type { DeepworkModeController } from "./state.js";
export interface DsmmRoleIdentity {
    readonly role?: DsmmRoleId;
    readonly child: boolean;
    readonly epoch: string;
    readonly parent?: DshAgent;
    readonly readOnly?: boolean;
    readonly toolFilter?: ToolRestriction;
}
export declare function inheritToolFilter(parent?: ToolRestriction, requested?: ToolRestriction): ToolRestriction | undefined;
export declare function resolveAdmittedDsmmRole(agent: DshAgent, settings: DsmmSettings, active: boolean): DsmmRoleId | undefined;
export declare function roleToolName(role: DsmmRoleId): string;
export declare function roleFromToolName(name: string): DsmmRoleId | undefined;
export declare function readonlyRoleTool(name: string, settings: DsmmSettings): boolean;
interface DelegationIdentity {
    parent: DshAgent;
    role: DsmmRoleId;
    epoch: string;
    toolFilter?: ToolRestriction;
    maxDepth?: number;
    admittedChild?(agent: DshAgent): void;
}
export interface RoleAdmissionCollaborators {
    resolveOriginalEvidence(ticket: ParentAdmissionTicket, childId: string, signal: AbortSignal): Promise<ChildAdmissionEvidence>;
    nativeSubstrate: DsmmSettings;
    revokeParent(agent: DshAgent, reason: string): void;
    /** Shared C2b native-capability audit; this does not grant parent tool permissions. */
    classifyLegacyTool?: LegacyCapabilityCollaborators["classifyTool"];
}
/** Identity admission only: native services retain every run, inbox and retry lifecycle. */
export declare class DsmmRolePolicy {
    private readonly ctx;
    private readonly getSettings;
    private readonly mode;
    private readonly calls;
    private readonly providers;
    private readonly continuableCreations;
    private readonly preparedInvocations;
    private readonly preparedCaptures;
    private collaborators?;
    constructor(ctx: DshContext, getSettings: DsmmSettingsGetter, mode: DeepworkModeController);
    captureProvider(provider: object): void;
    revokeResidency(agent: DshAgent): void;
    configureAdmission(collaborators: RoleAdmissionCollaborators): ChildAdmissionCompletion;
    validateRootRole(agent: DshAgent, admission: DsmmProfileAdmission): void;
    recordContinuableCreation(childId: string, parent: DshAgent, role: DsmmRoleId, invocation: ResolvedRoleInvocation | undefined, expectedEpoch: string, signal: AbortSignal): void;
    prepareChildAdmission(agent: DshAgent, parent: DshAgent, ticket: ParentAdmissionTicket, signal: AbortSignal): Promise<PreparedChildAdmission>;
    /** Used at A's single awaited completion point; old original epochs remain valid facts. */
    validatePreparedRole(agent: DshAgent, parent: DshAgent, candidate: ChildRoleAdmissionCandidate): void;
    assertChildDelivery(ticket: ParentAdmissionTicket, childId: string, raw: ChildAdmissionEvidence): void;
    private readOnly;
    private agents;
    assertLive(agent: DshAgent): void;
    /** Core fence runs before native prompt/body assembly or provider execution. */
    assertModuleAdmission(agent: DshAgent): void;
    identity(agent: DshAgent): DsmmRoleIdentity;
    targets(agent: DshAgent): readonly DsmmRoleId[];
    assertDelegation(parent: DshAgent, role: DsmmRoleId): DelegationIdentity;
    duringDelegation<T>(parent: DshAgent, role: DsmmRoleId, operation: () => T, toolFilter?: ToolRestriction, maxDepth?: number, admittedChild?: (agent: DshAgent) => void): T;
    prepareContinuable(parent: DshAgent, role: DsmmRoleId, signal: AbortSignal): DelegationIdentity;
    admit(agent: DshAgent): DsmmRoleIdentity;
    private captureIdentity;
    captureTools(agent: DshAgent, tools: ToolRuntime, controlledNames?: readonly string[], reset?: boolean): void;
    toolDenial(agent: DshAgent, name: string, tools?: ToolRuntime, execution?: {
        readonly arguments: unknown;
    }): string | undefined;
    installDrain(agent: DshAgent): void;
}
//# sourceMappingURL=role-policy.d.ts.map