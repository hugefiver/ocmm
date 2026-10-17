import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContentBlock, MessageId } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SubagentActivation, SubagentActivationSpec, SubagentPromptReceipt, SubagentPromptRequest, SubagentProvider, SubagentSendMessageOptions } from "@deepseek-ai/dsh-subagent";
import { DsmmDeliveryAuthority } from "./delivery-authority.js";
import type { DeliveryAdmission, DeliveryParentClassifier } from "./delivery-authority.js";
export { DsmmDeliveryAuthority } from "./delivery-authority.js";
export type { DeliveryAdmission, DeliveryFenceView, DeliveryParentClassifier, DeliveryPolicyBinding, ParentAdmissionTicket } from "./delivery-authority.js";
declare module "@deepseek-ai/dsh-typert-protocol/types" {
    interface RemoteErrorDetailsMap {
        "subagent/unauthorized": {
            readonly childSessionId: SessionId;
        };
    }
}
type ActivationStart = (spec: SubagentActivationSpec) => Promise<SubagentActivation>;
type ActivationPreflight = (spec: SubagentActivationSpec, start: ActivationStart) => Promise<SubagentActivation>;
/** Explicit startup replacement for the stock row, in the SAME Host service scope. */
export declare class DsmmSubagentRuntime<A extends DeliveryAdmission = DeliveryAdmission, E = unknown> extends SubagentRuntime {
    static inject: string[];
    readonly authority: DsmmDeliveryAuthority<A, E>;
    private readonly waiters;
    private readonly lifetime;
    private requiredProviders;
    private activationPreflight?;
    constructor(ctx: Context, config: ConstructorParameters<typeof SubagentRuntime>[1], hostClassifier?: DeliveryParentClassifier);
    /** Host composition may select spawn/fork names before enabling the policy. */
    requireProviders(names: readonly string[]): void;
    registerProvider(provider: SubagentProvider): () => void;
    /** Host entry route preparation before native normalization loses caller option provenance. */
    configureActivationPreflight(preflight: ActivationPreflight, signal: AbortSignal): void;
    startActivation(spec: SubagentActivationSpec & {
        readonly childId: SessionId;
    }): Promise<SubagentActivation & {
        readonly messageId: MessageId;
    }>;
    startActivation(spec: SubagentActivationSpec): Promise<SubagentActivation>;
    private startManaged;
    private operation;
    private coldDelivery;
    private retireTree;
    drainDescendants(parents: readonly Agent[]): Promise<void>;
    drainChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>;
    /** Fulfillment proves this exact registry contains the provider, not just a mounted plugin. */
    waitForProvider(name: string, signal?: AbortSignal): Promise<SubagentProvider>;
    /** Policy explicitly enabled AND every required provider actually registered. */
    waitUntilReady(signal?: AbortSignal): Promise<void>;
    sendMessage(sender: Agent, targetId: SessionId, content: ContentBlock[], options: SubagentSendMessageOptions): Promise<MessageId>;
    prompt(request: SubagentPromptRequest, callerSignal: AbortSignal): Promise<SubagentPromptReceipt>;
    private wakeWaiters;
    private substrateReady;
    private waitFor;
}
export default DsmmSubagentRuntime;
//# sourceMappingURL=subagent-runtime.d.ts.map