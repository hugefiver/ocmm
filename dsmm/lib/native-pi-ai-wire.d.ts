import type { Context } from "@deepseek-ai/cordis";
import { PiAiAdapter, Config } from "@deepseek-ai/dsh-llm-pi-ai";
import type { Options, PiAiAdapterOptions } from "@deepseek-ai/dsh-llm-pi-ai";
import type { LlmAdapter } from "@deepseek-ai/dsh-llm";
import type { DsmmLlmCallConfig, DsmmLlmGeneration } from "./host-llm.js";
import type { DsmmLlmRouteResolver } from "./role-llm.js";
export interface DsmmPiAiOwnerOptions {
    readonly config: Options;
    readonly settingsNamespace: string;
    readonly auth: PiAiAdapterOptions["auth"];
    /** Called only at dispatch. An absent named credential fails; no ambient lookup is used. */
    readonly resolveApiKey: (provider: string, reference: string, signal?: AbortSignal) => Promise<string | undefined>;
}
export interface DsmmPiAiProviderOwner extends DsmmLlmRouteResolver {
    readonly stockAdapter: PiAiAdapter;
    readonly providers: readonly string[];
    requiresRaw(config: DsmmLlmCallConfig): boolean;
    supportsNativeStop(provider: string): boolean;
    generation(provider: string): DsmmLlmGeneration;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmLlmProviderOwner: DsmmPiAiProviderOwner;
    }
}
export interface DsmmPiAiProviderPlugin {
    readonly name: "dsmm-llm-provider-owner";
    readonly inject: string[];
    readonly Config: typeof Config;
    apply(ctx: Context, config: ReturnType<typeof Config>): void;
}
export declare function createDsmmPiAiProviderPlugin(options: DsmmPiAiOwnerOptions, ready: (owner: DsmmPiAiProviderOwner) => void): DsmmPiAiProviderPlugin;
/** Build the raw executor from declared profiles; borrowed registrations remain native-owned. */
export declare function createDsmmPiAiProviderOwner(ctx: Context, options: DsmmPiAiOwnerOptions, borrowed?: {
    readonly signal: AbortSignal;
    readonly adapter: LlmAdapter;
    assertCurrent(): void;
}): DsmmPiAiProviderOwner;
//# sourceMappingURL=native-pi-ai-wire.d.ts.map