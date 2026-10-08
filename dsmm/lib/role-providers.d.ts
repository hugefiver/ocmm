import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { Agent, AgentOptions } from "@deepseek-ai/dsh-agent";
import type { DshContext } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { DsmmRolePolicy } from "./role-policy.js";
export interface DsmmSubagentRegistry {
    getProvider(name: string): SubagentProvider | undefined;
    registerProvider(provider: SubagentProvider): () => void;
    resolveMaxDepth?(configured?: number): number | undefined;
}
export declare function roleProviderName(role: DsmmRoleId): string;
export declare function roleFromProviderName(provider: string): DsmmRoleId | undefined;
export declare function roleAgentOptions(parent: Agent, role: DsmmRoleId, settings: DsmmSettings, signal: AbortSignal, explicit?: AgentOptions): Promise<AgentOptions | undefined>;
/** Only the native outer start owns descriptors, capability admission and returned runs. */
export declare function registerRoleProviders(ctx: DshContext, getSettings: DsmmSettingsGetter, getDeploymentSettings?: DsmmSettingsGetter, policy?: DsmmRolePolicy): void;
//# sourceMappingURL=role-providers.d.ts.map