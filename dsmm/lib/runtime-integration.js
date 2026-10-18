import { capturedRoleInvocation } from "./role-invocation.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
export function assertSupportedHostStartup(options) {
    if (options === null || typeof options !== "object" || Object.keys(options).length)
        throw new Error("DSMM uses official native services; runtime replacement options are unsupported");
}
export function classifyDsmmAgent(agent) {
    const preset = agent.ctx.get("agentPresets")?.composedPreset(agent.ctx) ?? resolveSelectedAgentPreset(agent.session);
    return preset?.startsWith("dsmm-") || capturedRoleInvocation(agent) ? "dsmm" : "native";
}
export function runtimeAdmissionView(ctx) {
    const native = ctx.get("subagents"), admission = ctx.get("dsmmNativeAdmission"), ready = native !== undefined && admission?.isReady === true;
    return { binding: native === undefined ? "unavailable" : "stock", deliveryFenceReady: ready,
        restartRequired: !ready, ...ready ? {} : { reason: "authority-not-ready" } };
}
//# sourceMappingURL=runtime-integration.js.map