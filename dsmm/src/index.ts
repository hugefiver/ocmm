import type { DshContext } from "./dsh-types.js";
import { registerDeepworkCommand } from "./commands.js";
import { registerSafetyGuards } from "./guards.js";
import { registerDeepworkPrompt } from "./mode.js";
import { reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
import { DSMM_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import type { DsmmPluginConfig } from "./settings.js";
import { DeepworkModeController } from "./state.js";

export const name = "dsmm";
export const inject = ["systemPrompt"] as const;

export type Config = DsmmPluginConfig;
export const Config = DSMM_CONFIG_SCHEMA;

export type { DeepworkSessionEventMap } from "./dsh-events.js";
export type { DsmmRoleDefinition, DsmmRoleId } from "./roles.js";
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "./guards.js";
export { DEFAULT_DSMM_LSP_SETTINGS, DSMM_LSP_SERVER_NAME, DSMM_LSP_TOOL_NAMES, parseLspSmokeCommand, publicLspToolName, renderLspMcpPatch, resolveLspSettings, toDshMcpClientConfig } from "./lsp.js";
export type { DshMcpStdioConfig, DsmmLspSettings, DsmmLspToolName } from "./lsp.js";
export { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, MVP_SKILL_NAMES, isRoleEnabled, resolveConfig, registerSettings } from "./settings.js";
export type { DsmmFinalReviewPolicy, DsmmGitWritePolicy, DsmmGuardScope, DsmmGuardSettings, DsmmPluginConfig, DsmmSettings, DsmmSkillName, DsmmWorkflowSettings, MvpSkillName } from "./settings.js";
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";

export function apply(ctx: DshContext, config: Config = {}): void {
  const controller = new DeepworkModeController(ctx);
  const getSettings = registerSettings(ctx, config, {
    install(readyCtx, getReadySettings) {
      registerDeepworkPrompt(readyCtx, controller, getReadySettings, config);
      registerDeepworkCommand(readyCtx, controller, getReadySettings);
      const settings = getReadySettings();
      const root = resolveManagedPresetRoot(settings);
      if (root === undefined) return;
      reconcileRolePresets({ root, settings });
    }
  });
  registerSafetyGuards(ctx, controller, getSettings);
}

export default apply;
