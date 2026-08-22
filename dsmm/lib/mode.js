import { buildDeepworkPrompt } from "./prompts.js";
function modelFromAgent(context) {
    const model = context.agent?.options?.model;
    if (model === undefined)
        return undefined;
    return { id: model, name: model };
}
export function registerDeepworkPrompt(ctx, controller, getSettings, config = {}) {
    ctx.systemPrompt?.section({
        name: "dsmm:deepwork",
        order: getSettings().promptOrder,
        text(context) {
            const settings = getSettings();
            if (!controller.active(context.agent, settings.defaultActive))
                return "";
            return buildDeepworkPrompt(settings, modelFromAgent(context), config.section);
        }
    });
}
//# sourceMappingURL=mode.js.map