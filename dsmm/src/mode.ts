import { symbols } from "@deepseek-ai/cordis";
import type { DshAgent, DshContext, DshLlmCallConfig, DshSystemPromptContext, DshSystemPromptRegistry, DshSystemPromptSection } from "./dsh-types.js";
import type { Config } from "./index.js";
import { buildDeepworkPrompt } from "./prompts.js";
import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import type { DsmmSettingsGetter } from "./settings.js";
import { enabledSkillNames, renderBundledSkillPrompt } from "./skills.js";
import type { DeepworkModeController } from "./state.js";

type PromptAgent = DshAgent & { ctx?: DshContext };

function routeFromAgent(context: DshSystemPromptContext): Pick<DshLlmCallConfig, "provider" | "model"> | undefined {
  const header = context.agent?.session.requestHeader?.();
  const { provider, model } = (header === undefined ? context.agent?.options : header.config) ?? {};
  return typeof provider === "string" && typeof model === "string" ? { provider, model } : undefined;
}

export function registerDeepworkPrompt(
  readyCtx: DshContext,
  controller: DeepworkModeController,
  getSettings: DsmmSettingsGetter,
  config: Config = {}
): void {
  const section: DshSystemPromptSection = {
    name: "dsmm:deepwork",
    order: getSettings().promptOrder,
    interpolate: false,
    text(context) {
      const settings = getSettings(context.agent);
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
  };
  const installed = new WeakSet<DshSystemPromptRegistry>();
  const install = (registry: DshSystemPromptRegistry | undefined): void => {
    if (registry === undefined) return;
    const service = (registry as DshSystemPromptRegistry & Record<symbol, DshSystemPromptRegistry | undefined>)[symbols.original] ?? registry;
    if (installed.has(service)) return;
    const dispose = service.section(section);
    installed.add(service);
    readyCtx.effect?.(() => () => {
      installed.delete(service);
      if (typeof dispose === "function") dispose();
    });
  };
  const registry = readyCtx.get !== undefined
    ? readyCtx.get<DshSystemPromptRegistry>("systemPrompt")
    : readyCtx.systemPrompt;
  install(registry);
  const installForAgent = (agent: PromptAgent): void => {
    const presets = readyCtx.get?.<{ serviceFor(agent: DshAgent, name: string): DshSystemPromptRegistry | undefined }>("agentPresets");
    install(presets?.serviceFor(agent, "systemPrompt") ?? agent.ctx?.get?.<DshSystemPromptRegistry>("systemPrompt"));
  };
  // Creation and blank-session selection both finish mounting before these events.
  readyCtx.on?.("agent/created", ({ agent }: { agent: PromptAgent }) => installForAgent(agent), { global: true });
  readyCtx.on?.("agent-preset/selected", (sessionId: string) => {
    const agent = readyCtx.get?.<{ get(id: string): PromptAgent | undefined }>("agents")?.get(sessionId);
    if (agent !== undefined) installForAgent(agent);
  }, { global: true });
}
