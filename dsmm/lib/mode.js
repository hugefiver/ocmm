import { buildDeepworkPrompt } from "./prompts.js";
import { isDsmmRoleId } from "./roles.js";
import { enabledSkillNames, renderBundledSkillPrompt } from "./skills.js";
function modelFromAgent(context) {
    const model = context.agent?.options?.model;
    if (model === undefined)
        return undefined;
    return { id: model, name: model };
}
function selectedAgentPreset(session) {
    const events = session?.events ?? [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type !== "agent-preset/selected")
            continue;
        const data = event.data;
        if (typeof data === "object" && data !== null && "agentPreset" in data && typeof data.agentPreset === "string") {
            return data.agentPreset;
        }
    }
    return typeof session?.header?.agentPreset === "string" ? session.header.agentPreset : undefined;
}
export function registerDeepworkPrompt(readyCtx, controller, getSettings, config = {}) {
    readyCtx.systemPrompt?.section({
        name: "dsmm:deepwork",
        order: getSettings().promptOrder,
        text(context) {
            const settings = getSettings();
            if (!controller.active(context.agent, settings.defaultActive))
                return "";
            const preset = selectedAgentPreset(context.agent?.session);
            const skillPrompt = isDsmmRoleId(preset) ? "" : renderBundledSkillPrompt(enabledSkillNames(settings));
            return buildDeepworkPrompt(settings, modelFromAgent(context), config.section, skillPrompt);
        }
    });
}
//# sourceMappingURL=mode.js.map