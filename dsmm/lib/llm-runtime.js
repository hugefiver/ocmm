import { DsmmAwareLlmRuntime } from "./host-llm.js";
import { LivePiAiOwner } from "./live-pi-ai-owner.js";
import { createDsmmRoleLlmOwner } from "./role-llm-runtime.js";
/** The selected profile's sole native LLM registry, installed by cold source migration. */
export class DsmmNativeLlmRuntime extends DsmmAwareLlmRuntime {
    providerOwner;
    constructor(ctx) {
        let owner;
        super(ctx, undefined, { preflight: (frame, proposal) => owner.preflight(frame, proposal) });
        this.providerOwner = new LivePiAiOwner(ctx, this);
        owner = createDsmmRoleLlmOwner(ctx, this.providerOwner);
        ctx.provide("dsmmLlmRoutes", this.providerOwner);
        ctx.inject(["dsmmCoreLlmOwner"], scope => this.bindRequestOwner(scope));
    }
    registerAdapter(...args) {
        const handle = super.registerAdapter(...args);
        return this.providerOwner.register(this.ctx, args[0], args[1], handle);
    }
}
export default DsmmNativeLlmRuntime;
//# sourceMappingURL=llm-runtime.js.map