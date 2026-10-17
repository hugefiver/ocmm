import type { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { Agent, AgentHandle, CreateAgentOptions, ResumeAgentOptions } from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { SubagentError } from "@deepseek-ai/dsh-subagent";
export interface ManagedCreation {
    readonly registry: AgentRegistry;
    readonly parent: Agent;
    readonly childId: SessionId;
    readonly kind: "fresh" | "cold";
    readonly delegationMode?: "one-shot" | "continuable";
    readonly owner: object;
    readonly ownerSignal?: AbortSignal;
    entered(agent: Agent): void;
    claimed: boolean;
    child?: Agent;
    retired: boolean;
}
export declare function managedCancellation(reason: unknown): SubagentError;
export declare function isManagedCancellation(error: unknown): boolean;
export declare const exactRegistry: (registry: AgentRegistry) => AgentRegistry;
export declare function duringManagedCreation<T>(operation: ManagedCreation, run: () => T): T;
export declare function currentManagedCreation(): ManagedCreation | undefined;
export declare function duringActivationOwnership<T>(signal: AbortSignal, run: () => T): T;
export declare function activationOwnerSignal(): AbortSignal | undefined;
/** Startup-only agents provider. Factory, traced caller, ownership and handles stay native. */
export declare class DsmmAgentRegistry extends AgentRegistry {
    readonly managedLifetime: AbortController;
    constructor(ctx: Context);
    create(options: CreateAgentOptions): Promise<AgentHandle>;
    resume(options: ResumeAgentOptions): Promise<AgentHandle>;
    enter(agent: Agent, owner: Agent | undefined): () => void;
    private creation;
}
export default DsmmAgentRegistry;
//# sourceMappingURL=agent-registry.d.ts.map