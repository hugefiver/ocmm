import { registerDeepworkCommand } from "./commands.js";
import { registerDeepworkPrompt } from "./mode.js";
import { reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
import { DSMM_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import { registerBundledSkills } from "./skills.js";
import { DeepworkModeController } from "./state.js";
export const name = "dsmm";
export const inject = ["systemPrompt"];
export const Config = DSMM_CONFIG_SCHEMA;
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, MVP_SKILL_NAMES, isRoleEnabled, resolveConfig, registerSettings } from "./settings.js";
export function apply(ctx, config = {}) {
    const getSettings = registerSettings(ctx, config, {
        onChange(settings) {
            const root = resolveManagedPresetRoot(settings);
            if (root === undefined)
                return;
            reconcileRolePresets({ root, settings });
        }
    });
    const controller = new DeepworkModeController(ctx);
    registerDeepworkPrompt(ctx, controller, getSettings, config);
    registerDeepworkCommand(ctx, controller, getSettings);
    registerBundledSkills(ctx, getSettings);
}
export default apply;
//# sourceMappingURL=index.js.map