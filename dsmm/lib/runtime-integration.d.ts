import { Context } from "@deepseek-ai/cordis";
import type { Agent, AgentRegistry } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { ChildAdmissionCompletion } from "./child-admission-contract.js";
import type { ChildAdmissionEvidence } from "./child-capture.js";
import type { DshAgent, DshContext } from "./dsh-types.js";
import type { LegacyCapabilityCollaborators } from "./legacy-child-policy.js";
import type { LegacyReadIntegrationChild, LegacyReadTrustedStartup } from "./legacy-read-integration.js";
import type { DsmmProfileRuntime } from "./profile-runtime.js";
import type { DsmmInvocationView, SubagentRuntimeAdmissionView } from "./profile-types.js";
import type { DsmmRolePolicy } from "./role-policy.js";
import { RoleRunRegistry } from "./role-runs.js";
import type { DsmmRoleRunCapture } from "./role-subagents.js";
import type { DsmmProfileAdmission, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import { DsmmSubagentRuntime } from "./subagent-runtime.js";
/** An unestablished child is never a native-identity proof for delivery or resumed work. */
export declare function classifyDsmmAgent(agent: Agent): "dsmm" | "native";
/** Limit DSMM's observers/guards to its own children without altering the native service or factories. */
export declare function managedAgentContext(ctx: Context, controlledParent: (agent: DshAgent) => boolean): DshContext;
/** Enrollment consumes A's completed admissions while native creation retains its original serial owner. */
export declare function admittedAgentContext(ctx: DshContext, runtime: DsmmProfileRuntime): DshContext;
export declare function runtimeAdmissionView(ctx: Context): SubagentRuntimeAdmissionView;
/** Capability projection only. Admission objects and A's CAS/maintenance methods remain untouched. */
export declare function publicProfileRuntime(runtime: DsmmProfileRuntime, ctx: Context, integration?: {
    changeConfiguration(reason: string, mutate: () => Promise<void>): Promise<void>;
}): DsmmProfileRuntime;
/** Actual programmatic Host collaborators; never profile, YAML or RPC input. */
export interface DsmmHostStartupOptions {
    /** Experimental, cold-only read composition. Disabled in the default MAIN. */
    readonly experimentalLegacyRead?: {
        readonly startup: LegacyReadTrustedStartup;
        readonly classifyChildReport?: LegacyCapabilityCollaborators["classifyTool"];
    };
}
interface NativeDeliveryEvidence {
    readonly parent: Agent;
    readonly childId: SessionId;
    readonly registry: AgentRegistry;
    readonly resident: Agent | undefined;
    readonly residency: object;
    readonly provider: string;
    readonly mode: "continuable" | "one-shot";
}
export declare function integrateSubagentRuntime(ctx: Context, settings: DsmmSettings, policy: DsmmRolePolicy, getRuntime: () => DsmmProfileRuntime | undefined, startup?: DsmmHostStartupOptions): Promise<{
    bridge: {
        authority: import("./child-admission-contract.js").DsmmChildAdmissionAuthority;
        policy: import("./delivery-authority.js").DeliveryPolicyBinding<DsmmProfileAdmission, ChildAdmissionEvidence>;
        childAdmission: ChildAdmissionCompletion;
        readLegacy: import("./child-admission-contract.js").LegacyChildEvidenceReader;
        resolveOriginalEvidence: (ticket: import("./child-admission-contract.js").ParentAdmissionTicket, id: string, signal: AbortSignal) => Promise<ChildAdmissionEvidence>;
        bind(scope: Context): () => void;
        onAdmissionGuardsInstalled(): void;
        revokeBeforeDispose(parent: DshAgent, dispose: () => void | Promise<void>): Promise<void>;
    };
    owner: object;
    registry: RoleRunRegistry<DsmmRoleRunCapture, DsmmInvocationView>;
    runtime: DsmmSubagentRuntime<DsmmProfileAdmission, ChildAdmissionEvidence | NativeDeliveryEvidence>;
    legacyRead: {
        core: import("./legacy-read-integration.js").LegacyReadCoreConsumption | undefined;
        host: {
            composition: import("./legacy-read-composition.js").LegacyReadComposition;
            attachChild(parent: Agent, child: Agent, evidence: import("./child-capture.js").LegacyChildEvidence, definition: import("@deepseek-ai/dsh-tools").ToolDefinition): import("./legacy-read-proxy.js").LegacyReadProxy;
            releaseAfterChildDispose(child: Agent): Promise<void>;
            publishCheckedGeneration(): void;
            dispose(nativeDrain: () => Promise<void>): Promise<void>;
        };
        legacyCapabilities: LegacyCapabilityCollaborators;
        classifyLegacyTool: (name: string, tools: import("@deepseek-ai/dsh-tools").ToolRuntime, child: Agent) => import("./legacy-child-policy.js").LegacyToolCapability | undefined;
        view(): import("./legacy-read-integration.js").LegacyReadIntegrationView;
        attachChild(parent: Agent, child: Agent, signal: AbortSignal): Promise<LegacyReadIntegrationChild>;
        publishCheckedGeneration(): void;
        change(reason: string, mutate: () => void | Promise<void>): Promise<void>;
        removeProxy(child: Agent): Promise<void>;
        revokeChildBeforeDispose(child: Agent, nativeDispose: () => void | Promise<void>): Promise<void>;
        whenChildRetired(child: Agent): Promise<void>;
        dispose(nativeDrain: () => Promise<void>): Promise<void>;
    } | undefined;
    admitLlmRequest(agent: Agent, signal: AbortSignal): Promise<import("./host-llm.js").DsmmLlmAdmission | undefined>;
    afterChildAdmission(agent: Agent, signal?: AbortSignal): Promise<void>;
    changeConfiguration(reason: string, mutate: () => void | Promise<void>): Promise<void>;
    dispose(nativeDrain: () => Promise<void>): Promise<void>;
    onAdmissionGuardsInstalled(): void;
    continueStartup(complete: (signal: AbortSignal) => Promise<void>, callerSignal?: AbortSignal): Promise<void>;
    ready(): Promise<void>;
    revokeBeforeDispose(agent: Agent, dispose: () => void | Promise<void>): Promise<void>;
    registerControls(scope: Context): void;
} | undefined>;
export declare function registerRuntimeGuidance(ctx: DshContext, getSettings: DsmmSettingsGetter, policy: DsmmRolePolicy): void;
export declare function registerRoleControlContribution(ctx: Context): void;
export type DsmmHostRuntimeIntegration = NonNullable<Awaited<ReturnType<typeof integrateSubagentRuntime>>>;
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmRuntimeIntegration: DsmmHostRuntimeIntegration;
    }
}
/** Explicit startup entry; it owns one PUBLIC subclass, never a live replacement. */
export declare const subagentRuntimePlugin: {
    name: string;
    inject: string[];
    Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
        maxDepth: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
        maxActiveSubagents: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        maxDepth: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
        maxActiveSubagents: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    }>>, "plain">;
    apply(ctx: Context, config: ConstructorParameters<typeof SubagentRuntime>[1]): void;
};
export * from "./subagent-runtime.js";
export default subagentRuntimePlugin;
//# sourceMappingURL=runtime-integration.d.ts.map