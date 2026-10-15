import { Context } from "@deepseek-ai/cordis";
import type { Events } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { GenerateOptions, LlmCallConfig, PreparedLlmCall, PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk } from "@deepseek-ai/dsh-llm";
export type DsmmJson = null | boolean | number | string | readonly DsmmJson[] | {
    readonly [key: string]: DsmmJson;
};
export type DsmmLlmRequestFrame = Parameters<Events["agent/request"]>[0];
export interface DsmmLlmCallConfig extends LlmCallConfig {
    readonly customParameters?: Readonly<Record<string, DsmmJson>>;
}
export interface DsmmLlmCallClassifier {
    requiresRaw?(config: DsmmLlmCallConfig): boolean;
}
/** Use the live provider owner and this call's complete frozen parameters, not envelope presence alone. */
export declare function requiresDsmmCallAdmission(config: DsmmLlmCallConfig, classifier?: DsmmLlmCallClassifier, uncapturedAgent?: Agent): boolean;
/** A Host-held admission, not a credential or a value accepted from serialized configuration. */
export interface DsmmLlmAdmission {
    readonly agent: Agent;
    readonly admission: object;
    readonly capture: object;
    readonly epoch: string;
    readonly signal: AbortSignal;
    assertCurrent(): void;
}
export interface DsmmLlmGeneration {
    readonly identity: object;
    readonly signal: AbortSignal;
    readonly retryPolicy: ResolvedRetryPolicy;
    readonly defaultReasoningEffort?: LlmCallConfig["reasoningEffort"];
    assertCurrent(): void;
    prepareCall(provider: string, model: string, signal: AbortSignal, assertAdmission?: () => void): Promise<PreparedAdapterCall>;
}
export interface DsmmLlmHostOwner {
    /** Classification must reject lost DSMM evidence instead of returning native. */
    preflight(frame: DsmmLlmRequestFrame, proposal: LlmCallConfig): Promise<{
        readonly kind: "native";
    } | {
        readonly kind: "stock";
        readonly admission: DsmmLlmAdmission;
        readonly config: LlmCallConfig;
    } | {
        readonly kind: "dsmm";
        readonly admission: DsmmLlmAdmission;
        readonly generation: DsmmLlmGeneration;
        readonly config: DsmmLlmCallConfig;
    }>;
}
export declare function freezeDsmmJson<T>(value: T): T;
export declare function snapshotDsmmCall(config: DsmmLlmCallConfig): DsmmLlmCallConfig;
export declare function preparedConfigMatches(request: GenerateOptions, config: DsmmLlmCallConfig): boolean;
/** Consumption is synchronous, including rejected dispatches and streams never iterated. */
export declare function singleUsePreparedStream(dispatch: PreparedLlmCall["stream"]): PreparedLlmCall["stream"];
/** Native execution service; an optional stock collaborator supports explicit isolated hosts. */
export declare class DsmmAwareLlmRuntime extends LlmRuntime {
    readonly stock: LlmRuntime | undefined;
    private readonly requestOwner;
    private readonly calls;
    private readonly admitted;
    private readonly preparedRequests;
    private readonly pending;
    private readonly active;
    private readonly nativeClassifications;
    private readonly lifetime;
    private detachRequestOwner?;
    constructor(ctx: Context, stock: LlmRuntime | undefined, requestOwner: DsmmLlmHostOwner);
    /** The Core entry installs its final binder after its request-routing collaborators. */
    protected bindRequestOwner(ctx: Context): void;
    private ownsScope;
    private assertCaptured;
    private finishCaptured;
    private uncapturedNativeConfig;
    prepareCall(proposal: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>;
    private prepareAdmittedCall;
    private bindPrepared;
    private adapterStreamFor;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    registerAdapter(...args: Parameters<LlmRuntime["registerAdapter"]>): import("@deepseek-ai/dsh-llm").AdapterRegistrationHandle;
    registerConfigurableProviders(...args: Parameters<LlmRuntime["registerConfigurableProviders"]>): import("@deepseek-ai/dsh-llm").DirectoryRegistrationHandle;
    registerModelDiscovery(...args: Parameters<LlmRuntime["registerModelDiscovery"]>): () => void;
    resolveCallConfig(...args: Parameters<LlmRuntime["resolveCallConfig"]>): Promise<LlmCallConfig>;
    resolveModelInfo(...args: Parameters<LlmRuntime["resolveModelInfo"]>): Promise<import("@deepseek-ai/dsh-llm").LlmResolvedModelInfo>;
    listModels(...args: Parameters<LlmRuntime["listModels"]>): Promise<import("@deepseek-ai/dsh-llm").LlmModelInfo[]>;
    listProviders(): import("@deepseek-ai/dsh-llm").LlmProviderInfo[];
    listConfigurableProviders(): import("@deepseek-ai/dsh-llm").LlmConfigurableProvider[];
    discoverModels(...args: Parameters<LlmRuntime["discoverModels"]>): Promise<import("@deepseek-ai/dsh-llm").LlmDiscoveredModel[]>;
    providerRetryPolicy(...args: Parameters<LlmRuntime["providerRetryPolicy"]>): ResolvedRetryPolicy;
    imageRequestPricing(...args: Parameters<LlmRuntime["imageRequestPricing"]>): import("@deepseek-ai/dsh-llm").LlmImageRequestPricing | undefined;
    fileRequestText(...args: Parameters<LlmRuntime["fileRequestText"]>): string;
}
//# sourceMappingURL=host-llm.d.ts.map