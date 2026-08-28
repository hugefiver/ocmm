import type { DshContext, DshLlmCallConfig, DshSystemPromptContext } from "./dsh-types.js";
import type { Config } from "./index.js";
import { buildDeepworkPrompt } from "./prompts.js";
import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import type { DsmmSettings } from "./settings.js";
import { enabledSkillNames, renderBundledSkillPrompt } from "./skills.js";
import type { DeepworkModeController } from "./state.js";

function routeFromAgent(context: DshSystemPromptContext): Pick<DshLlmCallConfig, "provider" | "model"> | undefined {
  const { provider, model } = context.agent?.options ?? {};
  return typeof provider === "string" && typeof model === "string" ? { provider, model } : undefined;
}

export function registerDeepworkPrompt(
  readyCtx: DshContext,
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings,
  config: Config = {}
): void {
  readyCtx.systemPrompt?.section({
    name: "dsmm:deepwork",
    order: getSettings().promptOrder,
    text(context) {
      const settings = getSettings();
      const preset = resolveSelectedAgentPreset(context.agent?.session);
      const active = controller.active(context.agent, settings.defaultActive);
      if (!active && !isDsmmRoleId(preset)) return "";
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
