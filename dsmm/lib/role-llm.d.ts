import { LlmError } from "@deepseek-ai/dsh-llm";
import type { DsmmLlmCallConfig } from "./host-llm.js";
import type { ModelRouteJson } from "./route-json.js";
/** Host-owned metadata admission; never a completion or a request authorization. */
export interface DsmmLlmRouteResolver {
    resolveRoute(route: ModelRouteJson, signal?: AbortSignal): Promise<ModelRouteJson>;
}
/** Only a public provider-directory lookup can establish this absence. */
export declare class DsmmMissingProviderError extends LlmError {
    constructor();
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmLlmRoutes: DsmmLlmRouteResolver;
    }
}
/** Request projection only. The Host supplies provenance; this does not establish admission or ownership. */
export declare function projectModelRouteParameters(input: unknown, effortSource: "dsmm-config" | "native", passthrough?: boolean): DsmmLlmCallConfig;
/** An explicit effort-only choice replaces either spelling of the prior effort. */
export declare function withRouteEffort(route: ModelRouteJson, reasoningEffort: string): ModelRouteJson;
/** External route names remain body names; customParameters itself is ordinary user JSON. */
export declare function modelRouteToCall(input: unknown): DsmmLlmCallConfig;
/** Decode native header/config storage without treating the internal envelope as a user field. */
export declare function modelRouteFromCall(input: {
    provider: string;
    model: string;
    customParameters?: unknown;
}): ModelRouteJson;
/** Adapter defaults are not explicit route intent. */
export declare function modelRouteFromHeader(header: unknown): ModelRouteJson;
//# sourceMappingURL=role-llm.d.ts.map