import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { SubagentProvider, SubagentActivation, ContinuableCreateRequest } from "@deepseek-ai/dsh-subagent";
import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import type { DsmmProfileRuntime } from "./profile-runtime.js";
import type { DsmmProfileAdmission } from "./settings.js";
import type { ResolvedRoleInvocation } from "./role-invocation.js";
import type { DsmmRolePolicy } from "./role-policy.js";
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmNativeAdmission: NativeAdmission;
    }
}
/** Short-lived creation correlations and exact live bindings, never an execution queue. */
export declare class NativeAdmission {
    readonly ctx: Context;
    readonly profiles: DsmmProfileRuntime;
    readonly policy: DsmmRolePolicy;
    readonly lifetime: AbortController;
    private readonly pending;
    private readonly live;
    private readonly candidates;
    private readonly agents;
    private readonly activations;
    private readonly activities;
    private readonly calls;
    private readonly rebindings;
    private readonly guardedTools;
    private readonly agentLifetimes;
    private readonly retirements;
    private ready;
    private install?;
    constructor(ctx: Context, profiles: DsmmProfileRuntime, policy: DsmmRolePolicy);
    activate(install: NonNullable<NativeAdmission["install"]>): void;
    get isReady(): boolean;
    get(agent: Agent): DsmmProfileAdmission | undefined;
    configuration(agent: Agent): DsmmProfileAdmission;
    invocation(agent: Agent): ResolvedRoleInvocation | undefined;
    ensure(agent: Agent): Promise<DsmmProfileAdmission>;
    assert(agent: Agent): DsmmProfileAdmission;
    reserve(exec: Readonly<ToolExecution>, invocation: ResolvedRoleInvocation, provider: SubagentProvider, maxDepth?: number): Promise<{
        childId: SessionId;
        release(): Promise<void>;
        signal: AbortSignal;
    }>;
    duringCall<T>(agent: Agent, signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
    prepare(request: ContinuableCreateRequest, provider: SubagentProvider): void;
    private check;
    track(activation: SubagentActivation): void;
    private guardTools;
    private retireAgent;
    private rebindBlank;
    private created;
}
//# sourceMappingURL=native-admission.d.ts.map