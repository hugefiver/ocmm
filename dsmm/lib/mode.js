import { symbols } from "@deepseek-ai/cordis";
import { buildDeepworkPrompt } from "./prompts.js";
import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import { enabledSkillNames, renderBundledSkillPrompt } from "./skills.js";
function routeFromAgent(context) {
    const header = context.agent?.session.requestHeader?.();
    const { provider, model } = (header === undefined ? context.agent?.options : header.config) ?? {};
    return typeof provider === "string" && typeof model === "string" ? { provider, model } : undefined;
}
export function registerDeepworkPrompt(readyCtx, controller, getSettings, config = {}) {
    const section = {
        name: "dsmm:deepwork",
        order: getSettings().promptOrder,
        interpolate: false,
        text(context) {
            const settings = getSettings();
            const preset = resolveSelectedAgentPreset(context.agent?.session);
            const active = controller.active(context.agent, settings.defaultActive);
            if (!active && !isDsmmRoleId(preset))
                return "";
            const skillPrompt = isDsmmRoleId(preset) ? "" : renderBundledSkillPrompt(enabledSkillNames(settings));
            return buildDeepworkPrompt(settings, {
                route: routeFromAgent(context),
                selectedPreset: preset,
                overrideSection: config.section,
                skillPrompt
            });
        }
    };
    const installed = new WeakSet();
    const install = (registry) => {
        if (registry === undefined)
            return;
        const service = registry[symbols.original] ?? registry;
        if (installed.has(service))
            return;
        const dispose = service.section(section);
        installed.add(service);
        readyCtx.effect?.(() => () => {
            installed.delete(service);
            if (typeof dispose === "function")
                dispose();
        });
    };
    const registry = readyCtx.get !== undefined
        ? readyCtx.get("systemPrompt")
        : readyCtx.systemPrompt;
    install(registry);
    const installForAgent = (agent) => {
        const presets = readyCtx.get?.("agentPresets");
        install(presets?.serviceFor(agent, "systemPrompt") ?? agent.ctx?.get?.("systemPrompt"));
    };
    // Creation and blank-session selection both finish mounting before these events.
    readyCtx.on?.("agent/created", ({ agent }) => installForAgent(agent), { global: true });
    readyCtx.on?.("agent-preset/selected", (sessionId) => {
        const agent = readyCtx.get?.("agents")?.get(sessionId);
        if (agent !== undefined)
            installForAgent(agent);
    }, { global: true });
}
//# sourceMappingURL=mode.js.map