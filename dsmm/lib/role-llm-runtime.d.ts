import type { Context } from "@deepseek-ai/cordis";
import type { DsmmLlmHostOwner, DsmmLlmAdmission, DsmmLlmRequestFrame, DsmmLlmCallConfig } from "./host-llm.js";
import type { DsmmPiAiProviderOwner } from "./native-pi-ai-wire.js";
export interface DsmmCoreLlmOwner {
    /** Undefined is only the physically owned ordinary-native child path. */
    admit(frame: DsmmLlmRequestFrame): Promise<DsmmLlmAdmission | undefined>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        dsmmCoreLlmOwner: DsmmCoreLlmOwner;
    }
}
/** Connect the cold Host LLM owner to the existing exact Agent/role admission authority. */
export declare function createDsmmRoleLlmOwner(ctx: Context, providers: Pick<DsmmPiAiProviderOwner, "generation"> & {
    requiresRaw?(config: DsmmLlmCallConfig): boolean;
}): DsmmLlmHostOwner;
//# sourceMappingURL=role-llm-runtime.d.ts.map