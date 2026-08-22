import { registerDeepworkCommand } from "./commands.js";
import { registerDeepworkPrompt } from "./mode.js";
import { DSMM_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import { registerBundledSkills } from "./skills.js";
import { DeepworkModeController } from "./state.js";
export const name = "dsmm";
export const inject = ["systemPrompt"];
export const Config = DSMM_CONFIG_SCHEMA;
export function apply(ctx, config = {}) {
    const getSettings = registerSettings(ctx, config);
    const controller = new DeepworkModeController(ctx);
    registerDeepworkPrompt(ctx, controller, getSettings, config);
    registerDeepworkCommand(ctx, controller, getSettings);
    registerBundledSkills(ctx, getSettings);
}
export default apply;
//# sourceMappingURL=index.js.map