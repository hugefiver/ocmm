import { Context, getTraceable } from "@deepseek-ai/cordis";
import { agentForScope, nativeAgentContext } from "./native-scope.js";
import { buildDeepworkPrompt } from "./prompts.js";
import { resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
function routeFromAgent(agent) {
    const header = agent.session.requestHeader?.();
    const { provider, model } = (header === undefined ? agent.options : header.config) ?? {};
    return typeof provider === "string" && typeof model === "string" ? { provider, model } : undefined;
}
export function registerDeepworkPrompt(readyCtx, controller, getSettings, config = {}) {
    const agents = new Map();
    const install = (ctx, registry, agent) => {
        if (registry === undefined)
            return undefined;
        const section = {
            name: "dsmm:deepwork", order: getSettings().promptOrder, interpolate: false,
            text(context) {
                if (context.signal?.aborted)
                    return "";
                const subject = agent !== undefined && context.scope === agent ? agent : agentForScope(readyCtx, context.scope);
                if (subject === undefined)
                    return "";
                const settings = getSettings(subject);
                if (!settings.modules.deepwork.enabled || !controller.active(subject, settings.defaultActive))
                    return "";
                return buildDeepworkPrompt(settings, { route: routeFromAgent(subject), selectedPreset: resolveSelectedAgentPreset(subject.session), roleId: resolveEffectiveDsmmRole(subject, settings, true) ?? null, overrideSection: config.section });
            }
        };
        // Keep the caller's registration scope even when a primitive service is supplied.
        const service = ctx instanceof Context ? getTraceable(ctx, registry) : registry;
        return service.section(section);
    };
    install(readyCtx, readyCtx.get !== undefined ? readyCtx.get("systemPrompt") : readyCtx.systemPrompt);
    const installForAgent = (agent) => {
        agents.get(agent)?.();
        agents.delete(agent);
        const ctx = nativeAgentContext(agent);
        const presets = readyCtx.get?.("agentPresets");
        const dispose = install(ctx, presets?.serviceFor(agent, "systemPrompt") ?? ctx.get("systemPrompt"), agent);
        if (dispose !== undefined)
            agents.set(agent, dispose);
    };
    readyCtx.on?.("agent/created", ({ agent }) => installForAgent(agent), { global: true });
    readyCtx.on?.("agent-preset/selected", (id) => {
        const agent = readyCtx.get?.("agents")?.get(id);
        if (agent !== undefined)
            installForAgent(agent);
    }, { global: true });
    readyCtx.on?.("agent/disposed", ({ agent }) => { agents.get(agent)?.(); agents.delete(agent); }, { global: true });
    // Native fibers own each section. DSMM also releases the Agent-owned ones
    // when its own plugin is unloaded while those Agents remain alive.
    readyCtx.effect?.(() => () => { for (const dispose of agents.values())
        dispose(); agents.clear(); });
    for (const agent of readyCtx.get?.("agents")?.list() ?? [])
        installForAgent(agent);
}
//# sourceMappingURL=mode.js.map