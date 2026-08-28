import { buildDeepworkPrompt } from "./prompts.js";
import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import { enabledSkillNames, renderBundledSkillPrompt } from "./skills.js";
function routeFromAgent(context) {
    const { provider, model } = context.agent?.options ?? {};
    return typeof provider === "string" && typeof model === "string" ? { provider, model } : undefined;
}
export function registerDeepworkPrompt(readyCtx, controller, getSettings, config = {}) {
    readyCtx.systemPrompt?.section({
        name: "dsmm:deepwork",
        order: getSettings().promptOrder,
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
    });
}
//# sourceMappingURL=mode.js.map