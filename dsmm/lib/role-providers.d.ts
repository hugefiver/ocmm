import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { Context } from "@deepseek-ai/cordis";
export { roleProviderName } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { NativeAdmission } from "./native-admission.js";
export interface DsmmSubagentRegistry {
    getProvider(name: string): SubagentProvider | undefined;
    registerProvider(provider: SubagentProvider): () => void;
    resolveMaxDepth?(configured?: number): number | undefined;
}
export declare function roleFromProviderName(name: string): DsmmRoleId | undefined;
export declare function registerRoleProviders(ctx: Context, getSettings: DsmmSettingsGetter, admission: NativeAdmission): void;
//# sourceMappingURL=role-providers.d.ts.map