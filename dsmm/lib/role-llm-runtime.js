import { LlmError } from "@deepseek-ai/dsh-llm";
import { requiresDsmmCallAdmission, snapshotDsmmCall } from "./host-llm.js";
import { resolvedModelParameterPolicy } from "./model-parameter-policy.js";
import { modelRouteFromCall, projectModelRouteParameters } from "./role-llm.js";
import { capturedRoleInvocation } from "./role-invocation.js";
import { latestNativeModelSelection } from "./role-routing.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
/** Connect the cold Host LLM owner to the existing exact Agent/role admission authority. */
export function createDsmmRoleLlmOwner(ctx, providers) {
    const nativeFallback = async (frame, proposal) => {
        const config = snapshotDsmmCall(proposal);
        if (requiresDsmmCallAdmission(config, providers, frame.agent))
            throw new LlmError("Enhanced requests require exact Core admission", "DSMM_NOT_READY");
        // Missing opaque fields do not prove native equivalence: standard options
        // must still resolve using this request's complete frozen configuration.
        await ctx.get("llm").resolveCallConfig(config, frame.signal);
        frame.signal.throwIfAborted();
        return { kind: "native" };
    };
    return {
        async preflight(frame, proposal) {
            const core = ctx.get("dsmmCoreLlmOwner");
            if (core === undefined) {
                return nativeFallback(frame, proposal);
            }
            const admission = await core.admit(frame);
            if (admission === undefined) {
                return nativeFallback(frame, proposal);
            }
            const agent = frame.agent;
            const original = ctx.get("dsmmProfileRuntime").admission(agent);
            if (original !== admission.admission)
                throw new Error("LLM policy does not own the exact admission");
            const policy = resolvedModelParameterPolicy(original);
            const invocation = capturedRoleInvocation(agent);
            const effortSource = latestNativeModelSelection(agent) !== undefined
                || frame.agent.session.header.origin !== "subagent" && !resolveSelectedAgentPreset(agent.session)?.startsWith("dsmm-")
                ? "native" : invocation?.effortSource ?? (invocation?.routeSource === "inherited" ? "native" : "dsmm-config");
            const config = snapshotDsmmCall(projectModelRouteParameters(modelRouteFromCall(proposal), effortSource, policy.mode !== "native-defaults"));
            admission.assertCurrent();
            if (policy.mode !== "passthrough") {
                return { kind: "stock", admission, config };
            }
            if (!requiresDsmmCallAdmission(config, providers)) {
                try {
                    await ctx.get("llm").resolveCallConfig(config, frame.signal);
                    admission.assertCurrent();
                    return { kind: "stock", admission, config };
                }
                catch (error) {
                    if (!(error instanceof LlmError) || error.code !== "UNSUPPORTED_OPTION"
                        && (error.code !== "UNSUPPORTED_REASONING_EFFORT" || effortSource === "native"))
                        throw error;
                }
            }
            const generation = providers.generation(config.provider);
            admission.assertCurrent();
            return { kind: "dsmm", admission, config, generation };
        },
    };
}
//# sourceMappingURL=role-llm-runtime.js.map