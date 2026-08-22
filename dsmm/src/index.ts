import type { DshContext } from "./dsh-types.js";
import { registerDeepworkCommand } from "./commands.js";
import { registerDeepworkPrompt } from "./mode.js";
import { DSMM_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import type { DsmmPluginConfig } from "./settings.js";
import { registerBundledSkills } from "./skills.js";
import { DeepworkModeController } from "./state.js";

export const name = "dsmm";
export const inject = ["systemPrompt"] as const;

export type Config = DsmmPluginConfig;
export const Config = DSMM_CONFIG_SCHEMA;

export type { DeepworkSessionEventMap } from "./dsh-events.js";

export function apply(ctx: DshContext, config: Config = {}): void {
  const getSettings = registerSettings(ctx, config);
  const controller = new DeepworkModeController(ctx);
  registerDeepworkPrompt(ctx, controller, getSettings, config);
  registerDeepworkCommand(ctx, controller, getSettings);
  registerBundledSkills(ctx, getSettings);
}

export default apply;
