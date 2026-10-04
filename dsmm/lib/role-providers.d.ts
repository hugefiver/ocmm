import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { DshContext } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettingsGetter } from "./settings.js";
export interface DsmmSubagentRegistry {
    getProvider(name: string): SubagentProvider | undefined;
    registerProvider(provider: SubagentProvider): () => void;
}
export declare function roleProviderName(role: DsmmRoleId): string;
export declare function roleFromProviderName(provider: string): DsmmRoleId | undefined;
/** Only the native outer start owns descriptors, capability admission and returned runs. */
export declare function registerRoleProviders(ctx: DshContext, getSettings: DsmmSettingsGetter, getDeploymentSettings?: DsmmSettingsGetter): void;
//# sourceMappingURL=role-providers.d.ts.map