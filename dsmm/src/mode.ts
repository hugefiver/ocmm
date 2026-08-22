import type { DshContext, DshSystemPromptContext } from "./dsh-types.js";
import type { Config } from "./index.js";
import { buildDeepworkPrompt } from "./prompts.js";
import type { DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

function modelFromAgent(context: DshSystemPromptContext): { id?: string; name?: string } | undefined {
  const model = context.agent?.options?.model;
  if (model === undefined) return undefined;
  return { id: model, name: model };
}

export function registerDeepworkPrompt(
  ctx: DshContext,
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings,
  config: Config = {}
): void {
  ctx.systemPrompt?.section({
    name: "dsmm:deepwork",
    order: getSettings().promptOrder,
    text(context) {
      const settings = getSettings();
      if (!controller.active(context.agent, settings.defaultActive)) return "";
      return buildDeepworkPrompt(settings, modelFromAgent(context), config.section);
    }
  });
}
