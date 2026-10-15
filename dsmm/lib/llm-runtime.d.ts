import type { Context } from "@deepseek-ai/cordis";
import type { LlmRuntime } from "@deepseek-ai/dsh-llm";
import { DsmmAwareLlmRuntime } from "./host-llm.js";
/** The selected profile's sole native LLM registry, installed by cold source migration. */
export declare class DsmmNativeLlmRuntime extends DsmmAwareLlmRuntime {
    private readonly providerOwner;
    constructor(ctx: Context);
    registerAdapter(...args: Parameters<LlmRuntime["registerAdapter"]>): import("@deepseek-ai/dsh-llm").AdapterRegistrationHandle;
}
export default DsmmNativeLlmRuntime;
//# sourceMappingURL=llm-runtime.d.ts.map