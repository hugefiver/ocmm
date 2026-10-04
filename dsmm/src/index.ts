import type { Context } from "@deepseek-ai/cordis";
import type { DshContext } from "./dsh-types.js";
import { registerDeepworkCommand, registerDsmmStatusCommand } from "./commands.js";
import { registerSafetyGuards } from "./guards.js";
import { registerDeepworkPrompt } from "./mode.js";
import { registerModelRouting } from "./model-routing.js";
import { registerRuntimeRecovery } from "./runtime-recovery.js";
import { reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
import { registerHeadlessRoleTools } from "./role-subagents.js";
import { registerRolePresets } from "./preset-registry.js";
import { registerRoleProviders } from "./role-providers.js";
import { createProfileRuntime } from "./profile-runtime.js";
import type { DsmmProfileRuntime } from "./profile-runtime.js";
import { registerProfilesRpc } from "./profile-rpc.js";
import { DSMM_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import type { DsmmPluginConfig } from "./settings.js";
import type { DsmmSettingsGetter } from "./settings.js";
import { DeepworkModeController } from "./state.js";
import DsmmSessionPersistence from "./session-persistence.js";
import { isAbsolute } from "node:path";

export const name = "dsmm";
export const inject = ["profileContext"] as const;

export type Config = DsmmPluginConfig;
export const Config = DSMM_CONFIG_SCHEMA;

export type { DeepworkSessionEventMap } from "./dsh-events.js";
export type { DsmmRoleDefinition, DsmmRoleId } from "./roles.js";
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "./guards.js";
export { DEFAULT_DSMM_LSP_SETTINGS, DSMM_LSP_SERVER_NAME, DSMM_LSP_TOOL_NAMES, parseLspSmokeCommand, publicLspToolName, renderLspMcpPatch, resolveLspSettings, toDshMcpClientConfig } from "./lsp.js";
export type { DshMcpStdioConfig, DsmmLspSettings, DsmmLspToolName } from "./lsp.js";
export { classifyModelFamily } from "./model-family.js";
export type { DsmmModelFamily } from "./model-family.js";
export { desiredDeepseekEffort, isDeepseekV4ProRoute, registerModelRouting, selectAdvertisedEffort } from "./model-routing.js";
export type { DeepseekReasoningEffort } from "./model-routing.js";
export { classifyRecoveryFailure, foldAttemptedRecoveryRoutes, foldDurableRecoveryWork, selectFallbackRoute } from "./recovery-policy.js";
export type { DurableRecoveryWork, RecoveryFailureDecision } from "./recovery-policy.js";
export { registerRuntimeRecovery } from "./runtime-recovery.js";
export { childOwnedSessionEvents, resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
export { roleFromProviderName, roleProviderName, registerRoleProviders } from "./role-providers.js";
export { effectiveRoleFallbackRoutes } from "./role-routing.js";
export { DSMM_STATUS_COMMAND, registerDsmmStatusCommand } from "./commands.js";
export { DSMM_STATUS_VERSION, createDsmmStatusSnapshot, formatDsmmStatus } from "./status.js";
export type { DsmmStatusSnapshot } from "./status.js";
export type { AgentRequestErrorFrame, AgentRequestFrame, AgentTurnStoppingFrame, DshEpochHeader, DshGoalChangeEventData, DshGoalSnapshot, DshLlmCallConfig, DshLlmFailure, DshModelReasoningInfo, DshReasoningEffortInfo, DshRequestErrorAction, DshRequestHeaderEventData, DshResolvedModelInfo, DshStepBoundaryEventData, DshTodoItem, DshTodoWriteEventData } from "./dsh-types.js";
export { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, MVP_SKILL_NAMES, isRoleEnabled, resolveConfig, resolveRoleRouting, registerSettings } from "./settings.js";
export type { DeepseekCalibration, DeepseekDefaultReasoningEffort, DsmmFinalReviewPolicy, DsmmGitWritePolicy, DsmmGuardScope, DsmmGuardSettings, DsmmPluginConfig, DsmmModelRoute, DsmmRoleRoutingConfig, DsmmRoleRouting, DsmmRecoveryRoute, DsmmRuntimeRecoverySettings, DsmmSettings, DsmmSettingsGetter, DsmmSkillName, DsmmWorkflowSettings, MvpSkillName } from "./settings.js";
export { createProfileRuntime, DsmmProfileRuntime } from "./profile-runtime.js";
export type { DsmmProfileRuntimeStore, DsmmProfileRuntimeOptions } from "./profile-runtime.js";
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";

export function apply(ctx: DshContext, config: Config = {}): void | Promise<void> {
  const storage = config.sessionPersistence;
  if (storage !== undefined) {
    if (storage === null || typeof storage !== "object" || typeof storage.root !== "string" || !isAbsolute(storage.root)
      || Object.keys(storage).some((key) => !["root", "compression"].includes(key))
      || storage.compression !== undefined && !["zstd", "none"].includes(storage.compression)) {
      throw new Error("Deepwork sessionPersistence must preserve an explicit absolute native root and compression");
    }
    if (ctx.get === undefined || ctx.plugin === undefined) throw new Error("Deepwork sessionPersistence requires native startup composition");
    if (ctx.get("sessionPersistence") !== undefined) throw new Error("Disable the exact existing JSONL entry at startup before enabling Deepwork sessionPersistence; live replacement is refused");
    const fiber = (ctx as unknown as Context).plugin(DsmmSessionPersistence, storage);
    if (fiber === undefined) throw new Error("Deepwork sessionPersistence startup registration failed");
    return fiber.await().then(() => applyRuntime(ctx, config));
  }
  return applyRuntime(ctx, config);
}

function applyRuntime(ctx: DshContext, config: Config): void | Promise<void> {
  const controller = new DeepworkModeController(ctx);
  let runtime: DsmmProfileRuntime | undefined;
  let profileInitialization: Promise<void> | undefined;
  const getBoundSettings: DsmmSettingsGetter = (agent) => runtime?.getSettings(agent) ?? getSettings();
  const getSettings = registerSettings(ctx, config, {
    install(readyCtx, getReadySettings) {
      const install = (installCtx: DshContext, settingsGetter: DsmmSettingsGetter): void => {
        registerDeepworkPrompt(installCtx, controller, settingsGetter, config);
        const installCommands = (commandCtx: DshContext): void => {
          registerDeepworkCommand(commandCtx, controller, settingsGetter);
          registerDsmmStatusCommand(commandCtx, controller, settingsGetter);
        };
        if (installCtx.get !== undefined && installCtx.inject !== undefined) installCtx.inject(["commands"], installCommands);
        else installCommands(installCtx);
        registerRoleProviders(installCtx, settingsGetter, getReadySettings);
        // Standing compositions are deployment-only and never replaced on a
        // runtime profile selection. All routes are read from Agent bindings.
        registerRolePresets(installCtx, getReadySettings);
        const settings = getReadySettings();
        const root = resolveManagedPresetRoot(settings);
        if (root !== undefined) reconcileRolePresets({ root, settings });
      };
      if (readyCtx.get === undefined) {
        install(readyCtx, getReadySettings);
        return;
      }
      const installProfiles = async (profileCtx: DshContext): Promise<void> => {
        runtime = await createProfileRuntime(profileCtx, getReadySettings());
        profileCtx.provide?.("dsmmProfileRuntime", runtime);
        const manager = runtime;
        profileCtx.inject?.(["typert"], (rpcCtx) => {
          registerProfilesRpc(rpcCtx as unknown as Context, manager);
        });
        install(profileCtx, runtime.getSettings);
      };
      if (readyCtx.inject !== undefined) {
        const initialization = readyCtx.inject(["profileContext"], installProfiles);
        profileInitialization = Promise.resolve(initialization).then(() => undefined);
      }
      else throw new Error("dsmm native profiles require asynchronous profileContext injection");
    }
  });
  registerRuntimeRecovery(ctx, controller, getBoundSettings);
  registerModelRouting(ctx, controller, getBoundSettings);
  registerHeadlessRoleTools(ctx, controller, getBoundSettings);
  registerSafetyGuards(ctx, controller, getBoundSettings);
  return profileInitialization;
}

// Cordis Loader introspects this object's Config/inject; a bare function loses
// the exported schema and may pass null where required DSMM defaults belong.
export default { name, inject, Config, apply };
