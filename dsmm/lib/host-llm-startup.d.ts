import { Context } from "@deepseek-ai/cordis";
import { AgentLoop } from "@deepseek-ai/dsh-agent-loop";
import type { Config as AgentLoopConfig } from "@deepseek-ai/dsh-agent-loop";
import { DsmmAwareLlmRuntime } from "./host-llm.js";
import type { DsmmLlmHostOwner } from "./host-llm.js";
import type { DsmmPiAiOwnerOptions, DsmmPiAiProviderOwner } from "./native-pi-ai-wire.js";
export interface DsmmLlmColdStartupOptions {
    /** Original validated declarative AgentLoop config, including all configured Agents. */
    readonly agentLoop: AgentLoopConfig;
    readonly provider: DsmmPiAiOwnerOptions;
    /** Install routing/admission guards and return their exact live request owner before constructing the loop. */
    readonly establish?: (ctx: Context, providers: DsmmPiAiProviderOwner) => Promise<DsmmLlmHostOwner>;
}
export interface DsmmLlmColdStartup {
    /** Append to profileContext.overlays before readProfilePatches; Settings recomposition must see this same layer. Provider handoff remains explicit in the stock provider row. */
    readonly patches: readonly [{
        readonly id: "agent-loop";
        readonly disabled: true;
    }, {
        readonly insert: readonly [{
            readonly id: string;
            readonly name: string;
            readonly config: DsmmPiAiOwnerOptions["config"];
        }];
    }];
    /** Pass to the public dsh-app-boot prepare callback, before the standard profile entries mount. */
    prepare(ctx: Context): Promise<void>;
    /** Call after boot settlement. Missing dependencies are a startup refusal, never an implicit stock fallback. */
    assertReady(): {
        readonly loop: AgentLoop;
        readonly llm: DsmmAwareLlmRuntime;
        readonly provider: DsmmPiAiProviderOwner;
    };
}
/**
 * Host-only cold composition. The profile must disable its original agent-loop
 * row and remove only this owner's routes from llm-pi-ai before mounting entries.
 * The standard MAIN, registries, persistence and other provider owners remain mounted.
 */
export declare function createDsmmLlmColdStartup(options: DsmmLlmColdStartupOptions): DsmmLlmColdStartup;
//# sourceMappingURL=host-llm-startup.d.ts.map