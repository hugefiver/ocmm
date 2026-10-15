import type { Context } from "@deepseek-ai/cordis";
import type { LlmAdapter, LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { DsmmLlmGeneration, DsmmLlmCallConfig } from "./host-llm.js";
import type { DsmmLlmRouteResolver } from "./role-llm.js";
type RegistrationHandle = ReturnType<LlmRuntime["registerAdapter"]>;
/** Captures public registering-fiber provenance; the native runtime remains the sole registry. */
export declare class LivePiAiOwner implements DsmmLlmRouteResolver {
    private readonly ctx;
    private readonly native;
    private readonly registrations;
    constructor(ctx: Context, native: LlmRuntime);
    requiresRaw(config: DsmmLlmCallConfig): boolean;
    register(scope: Context, providers: readonly string[], adapter: LlmAdapter, handle: RegistrationHandle): RegistrationHandle;
    generation(provider: string): DsmmLlmGeneration;
    resolveRoute(input: Parameters<DsmmLlmRouteResolver["resolveRoute"]>[0], signal?: AbortSignal): Promise<import("./route-json.js").ModelRouteJson>;
}
export {};
//# sourceMappingURL=live-pi-ai-owner.d.ts.map