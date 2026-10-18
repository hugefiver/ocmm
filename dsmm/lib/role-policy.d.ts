import type { ToolRestriction, ToolRuntime, ToolExecution } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "./dsh-types.js";
export { allowedRoleChildren } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
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
export declare const READONLY_ROLE_DENIED_TOOLS: readonly ["write", "edit", "bash", "pwsh"];
export declare function roleToolName(role: DsmmRoleId): string;
export declare function roleFromToolName(name: string): DsmmRoleId | undefined;
export declare function readonlyRoleTool(name: string, settings: DsmmSettings): boolean;
export declare function inheritToolFilter(parent?: ToolRestriction, requested?: ToolRestriction): ToolRestriction | undefined;
export declare function resolveAdmittedDsmmRole(agent: DshAgent, settings: DsmmSettings, active: boolean): DsmmRoleId | undefined;
/** Role and exact-call restrictions; no child creation or execution owner. */
export declare class DsmmRolePolicy {
    private readonly ctx;
    private readonly getSettings;
    private readonly mode;
    private readonly executions;
    private readonly toolCalls;
    constructor(ctx: DshContext, getSettings: DsmmSettingsGetter, mode: DeepworkModeController);
    private agents;
    assertLive(agent: DshAgent): void;
    private selected;
    validateRootRole(agent: DshAgent, admission: DsmmProfileAdmission): void;
    bindChild(agent: DshAgent, parent: DshAgent, admission: DsmmProfileAdmission, invocation: ResolvedRoleInvocation, maximum: number | undefined, toolFilter: ToolRestriction): void;
    release(agent: DshAgent): void;
    assertModuleAdmission(agent: DshAgent): void;
    identity(agent: DshAgent): DsmmRoleIdentity;
    admit(agent: DshAgent): DsmmRoleIdentity;
    private readOnly;
    targets(agent: DshAgent): readonly DsmmRoleId[];
    assertDelegation(parent: DshAgent, role: DsmmRoleId): {
        parent: DshAgent;
        role: "dsmm-orchestrator" | "dsmm-planner" | "dsmm-plan-critic" | "dsmm-builder" | "dsmm-reviewer" | "dsmm-oracle" | "dsmm-oracle-2nd" | "dsmm-creative" | "dsmm-code-search" | "dsmm-doc-search" | "dsmm-clarifier" | "dsmm-media-reader" | "dsmm-frontend" | "dsmm-hard-reasoning" | "dsmm-research" | "dsmm-quick" | "dsmm-coding" | "dsmm-normal-task" | "dsmm-complex" | "dsmm-deep" | "dsmm-documenting" | "dsmm-cross-cutting";
        epoch: string;
    };
    captureTools(agent: DshAgent, tools: ToolRuntime, names?: readonly string[], reset?: boolean): void;
    toolBlacklistDenial(agent: DshAgent, name: string, execution?: Readonly<ToolExecution>): string | undefined;
    captureToolExecution(execution: Readonly<ToolExecution>, _full: boolean): void;
    /** Visible native names are a narrowing ceiling, never permission to execute a definition. */
    private visibleToolCeiling;
    delegationToolFilter(execution: Readonly<ToolExecution>): ToolRestriction;
    assertToolExecution(execution: Readonly<ToolExecution>): void;
    beforeToolDecision<T>(operation: () => T): T;
    duringToolExecution<T>(execution: Readonly<ToolExecution>, operation: () => Promise<T>): Promise<T>;
    toolDenial(agent: DshAgent, name: string, tools?: ToolRuntime, execution?: Readonly<ToolExecution>): string | undefined;
    preToolDenial(agent: DshAgent, name: string, tools?: ToolRuntime, execution?: Readonly<ToolExecution>): string | undefined;
}
//# sourceMappingURL=role-policy.d.ts.map