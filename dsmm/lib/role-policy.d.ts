import type { ToolRestriction, ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { DshAgent, DshContext } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export interface DsmmRoleIdentity {
    readonly role?: DsmmRoleId;
    readonly child: boolean;
    readonly epoch: string;
    readonly parent?: DshAgent;
    readonly readOnly?: boolean;
    readonly toolFilter?: ToolRestriction;
}
export declare function resolveAdmittedDsmmRole(agent: DshAgent, settings: DsmmSettings, active: boolean): DsmmRoleId | undefined;
export declare function allowedRoleChildren(role: DsmmRoleId, child?: boolean): readonly DsmmRoleId[];
export declare function roleToolName(role: DsmmRoleId): string;
export declare function roleFromToolName(name: string): DsmmRoleId | undefined;
export declare function readonlyRoleTool(name: string, settings: DsmmSettings): boolean;
interface DelegationIdentity {
    parent: DshAgent;
    role: DsmmRoleId;
    epoch: string;
    toolFilter?: ToolRestriction;
}
/** Identity admission only: native services retain every run, inbox and retry lifecycle. */
export declare class DsmmRolePolicy {
    private readonly ctx;
    private readonly getSettings;
    private readonly mode;
    private readonly calls;
    private readonly providers;
    constructor(ctx: DshContext, getSettings: DsmmSettingsGetter, mode: DeepworkModeController);
    captureProvider(provider: object): void;
    private agents;
    assertLive(agent: DshAgent): void;
    /** Core fence runs before native prompt/body assembly or provider execution. */
    assertModuleAdmission(agent: DshAgent): void;
    identity(agent: DshAgent): DsmmRoleIdentity;
    targets(agent: DshAgent): readonly DsmmRoleId[];
    assertDelegation(parent: DshAgent, role: DsmmRoleId): DelegationIdentity;
    duringDelegation<T>(parent: DshAgent, role: DsmmRoleId, operation: () => T, toolFilter?: ToolRestriction): T;
    prepareContinuable(parent: DshAgent, role: DsmmRoleId, signal: AbortSignal): void;
    admit(agent: DshAgent): DsmmRoleIdentity;
    private bindChild;
    private captureIdentity;
    captureTools(agent: DshAgent, tools: ToolRuntime, controlledNames?: readonly string[], reset?: boolean): void;
    toolDenial(agent: DshAgent, name: string, tools?: ToolRuntime): string | undefined;
    installDrain(agent: DshAgent): void;
}
export {};
//# sourceMappingURL=role-policy.d.ts.map