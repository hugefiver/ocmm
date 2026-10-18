import { getTraceable } from "@deepseek-ai/cordis";
import { agentForScope, nativeAgentContext } from "./native-scope.js";
import { buildDeepworkPrompt } from "./prompts.js";
import { resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
const bindings = new WeakMap();
function routeFromAgent(agent) {
    const header = agent.session.requestHeader?.();
    const { provider, model } = (header === undefined ? agent.options : header.config) ?? {};
    return typeof provider === "string" && typeof model === "string" ? { provider, model } : undefined;
}
/** The admission installer owns scope selection; assembly reads the immutable Agent configuration. */
export function registerDeepworkPrompt(readyCtx, controller, getSettings, config, agent, lifetime) {
    const refresh = bindings.get(agent);
    if (refresh) {
        refresh();
        return;
    }
    const ctx = nativeAgentContext(agent);
    let dispose;
    const reconcile = () => {
        dispose?.();
        const registry = ctx.get("agentPresets")?.serviceFor(agent, "systemPrompt") ?? ctx.get("systemPrompt");
        if (!registry)
            throw new Error("Deepwork requires the native system prompt service");
        dispose = getTraceable(ctx, registry).section({ name: "dsmm:deepwork", order: getSettings(agent).promptOrder, interpolate: false,
            text(context) {
                if (context.signal?.aborted || getSettings.subagentRuntime !== undefined && !getSettings.subagentRuntime().deliveryFenceReady)
                    return "";
                if (context.scope !== agent && agentForScope(readyCtx, context.scope) !== agent)
                    return "";
                const settings = getSettings(agent);
                if (!settings.modules.deepwork.enabled || !controller.active(agent, settings.defaultActive))
                    return "";
                return buildDeepworkPrompt(settings, { route: routeFromAgent(agent), selectedPreset: resolveSelectedAgentPreset(agent.session), roleId: resolveEffectiveDsmmRole(agent, settings, true) ?? null, overrideSection: config.section });
            }
        });
    };
    bindings.set(agent, reconcile);
    const retire = () => { dispose?.(); bindings.delete(agent); lifetime.removeEventListener("abort", retire); };
    lifetime.addEventListener("abort", retire, { once: true });
    ctx.effect(() => retire);
    reconcile();
}
//# sourceMappingURL=mode.js.map