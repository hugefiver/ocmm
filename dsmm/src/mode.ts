import type { DshContext, DshSession, DshSystemPromptContext } from "./dsh-types.js";
import type { Config } from "./index.js";
import { buildDeepworkPrompt } from "./prompts.js";
import { isDsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";
import { enabledSkillNames, renderBundledSkillPrompt } from "./skills.js";
import type { DeepworkModeController } from "./state.js";

function modelFromAgent(context: DshSystemPromptContext): { id?: string; name?: string } | undefined {
  const model = context.agent?.options?.model;
  if (model === undefined) return undefined;
  return { id: model, name: model };
}

function selectedAgentPreset(session: DshSession | undefined): string | undefined {
  const events = session?.events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "agent-preset/selected") continue;
    const data = event.data;
    if (typeof data === "object" && data !== null && "agentPreset" in data && typeof data.agentPreset === "string") {
      return data.agentPreset;
    }
  }

  return typeof session?.header?.agentPreset === "string" ? session.header.agentPreset : undefined;
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
      if (!controller.active(context.agent, settings.defaultActive)) return "";
      const preset = selectedAgentPreset(context.agent?.session);
      const skillPrompt = isDsmmRoleId(preset) ? "" : renderBundledSkillPrompt(enabledSkillNames(settings));
      return buildDeepworkPrompt(settings, modelFromAgent(context), config.section, skillPrompt);
    }
  });
}
