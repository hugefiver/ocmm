import type { Agent, AgentOptions } from "@deepseek-ai/dsh-agent";
import type { DshAgent } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmInvocationOptions, DsmmInvocationLevel, DsmmModelRoute, DsmmSettings, DsmmResolvedRoleRuntimePolicy } from "./settings.js";
import type { DsmmRouteSource, DsmmInvocationView } from "./profile-types.js";
import type { ChildAdmissionCapture } from "./child-capture.js";
import type { ResolvedModelParameterPolicy } from "./model-parameter-policy.js";
export interface ResolvedRoleInvocation {
    readonly target: DsmmRoleId;
    readonly requestedLevel?: DsmmInvocationLevel;
    readonly effectiveLevel: DsmmInvocationLevel;
    readonly routeSource: DsmmRouteSource;
    readonly initialRoute: DsmmModelRoute;
    readonly candidates: readonly DsmmModelRoute[];
    readonly policy: DsmmResolvedRoleRuntimePolicy;
    readonly exactEffort: boolean;
    readonly requestedRoute?: DsmmModelRoute;
    readonly selectedCandidate?: DsmmModelRoute;
    readonly requestedPolicy?: DsmmResolvedRoleRuntimePolicy;
    readonly modelParameterPolicy?: ResolvedModelParameterPolicy;
    readonly effortSource?: "native" | "dsmm-config";
}
export declare function duringRoleInvocation<T>(parent: DshAgent, invocation: ResolvedRoleInvocation, operation: () => T): T;
export declare function currentRoleInvocation(parent: DshAgent, target: DsmmRoleId): ResolvedRoleInvocation | undefined;
export declare function bindRoleInvocation(agent: DshAgent, invocation: ResolvedRoleInvocation, original?: ChildAdmissionCapture): void;
export declare function capturedRoleInvocation(agent: DshAgent): ResolvedRoleInvocation | undefined;
export declare function capturedOriginalRoleInvocation(agent: DshAgent): ChildAdmissionCapture["invocation"] | undefined;
/** Complete selections replace model and effort together; effort-only selections narrow candidates. */
export declare function resolveRoleInvocation(parent: Agent, target: DsmmRoleId, settings: DsmmSettings, signal: AbortSignal, options?: DsmmInvocationOptions, nativeOptions?: AgentOptions): Promise<ResolvedRoleInvocation>;
export declare function invocationAgentOptions(invocation: ResolvedRoleInvocation, options?: AgentOptions): AgentOptions;
export declare function invocationView(invocation: ResolvedRoleInvocation, label: string, mode: DsmmInvocationView["mode"], ids?: Pick<DsmmInvocationView, "runId" | "childId" | "jobId">): {
    runId?: string | undefined;
    childId?: string | undefined;
    jobId?: string | undefined;
    role: "dsmm-orchestrator" | "dsmm-planner" | "dsmm-plan-critic" | "dsmm-builder" | "dsmm-reviewer" | "dsmm-oracle" | "dsmm-oracle-2nd" | "dsmm-creative" | "dsmm-code-search" | "dsmm-doc-search" | "dsmm-clarifier" | "dsmm-media-reader" | "dsmm-frontend" | "dsmm-hard-reasoning" | "dsmm-research" | "dsmm-quick" | "dsmm-coding" | "dsmm-normal-task" | "dsmm-complex" | "dsmm-deep" | "dsmm-documenting" | "dsmm-cross-cutting";
    label: string;
    level: DsmmInvocationLevel;
    routeSource: "primary" | "inherited" | "level" | "invocation-route";
    route: {
        [key: string]: import("./route-json.js").RouteJson;
        provider: string;
        model: string;
        reasoningEffort?: string;
    };
    mode: "one-shot" | "continuable";
};
//# sourceMappingURL=role-invocation.d.ts.map