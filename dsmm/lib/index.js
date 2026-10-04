import { registerDeepworkCommand, registerDsmmStatusCommand } from "./commands.js";
import { registerSafetyGuards } from "./guards.js";
import { registerDeepworkPrompt } from "./mode.js";
import { registerModelRouting } from "./model-routing.js";
import { registerRuntimeRecovery } from "./runtime-recovery.js";
import { reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
import { registerHeadlessRoleTools } from "./role-subagents.js";
import { registerRolePresets } from "./preset-registry.js";
import { registerRoleProviders } from "./role-providers.js";
import { DSMM_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import { DeepworkModeController } from "./state.js";
export const name = "dsmm";
export const inject = [];
export const Config = DSMM_CONFIG_SCHEMA;
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "./guards.js";
export { DEFAULT_DSMM_LSP_SETTINGS, DSMM_LSP_SERVER_NAME, DSMM_LSP_TOOL_NAMES, parseLspSmokeCommand, publicLspToolName, renderLspMcpPatch, resolveLspSettings, toDshMcpClientConfig } from "./lsp.js";
export { classifyModelFamily } from "./model-family.js";
export { desiredDeepseekEffort, isDeepseekV4ProRoute, registerModelRouting, selectAdvertisedEffort } from "./model-routing.js";
export { classifyRecoveryFailure, foldAttemptedRecoveryRoutes, foldDurableRecoveryWork, selectFallbackRoute } from "./recovery-policy.js";
export { registerRuntimeRecovery } from "./runtime-recovery.js";
export { childOwnedSessionEvents, resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
export { roleFromProviderName, roleProviderName, registerRoleProviders } from "./role-providers.js";
export { effectiveRoleFallbackRoutes } from "./role-routing.js";
export { DSMM_STATUS_COMMAND, registerDsmmStatusCommand } from "./commands.js";
export { DSMM_STATUS_VERSION, createDsmmStatusSnapshot, formatDsmmStatus } from "./status.js";
export { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, MVP_SKILL_NAMES, isRoleEnabled, resolveConfig, resolveRoleRouting, registerSettings } from "./settings.js";
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";
export function apply(ctx, config = {}) {
    const controller = new DeepworkModeController(ctx);
    const getSettings = registerSettings(ctx, config, {
        install(readyCtx, getReadySettings) {
            registerDeepworkPrompt(readyCtx, controller, getReadySettings, config);
            const installCommands = (commandCtx) => {
                registerDeepworkCommand(commandCtx, controller, getReadySettings);
                registerDsmmStatusCommand(commandCtx, controller, getReadySettings);
            };
            if (readyCtx.get !== undefined && readyCtx.inject !== undefined)
                readyCtx.inject(["commands"], installCommands);
            else
                installCommands(readyCtx);
            registerRoleProviders(readyCtx, getReadySettings);
            registerRolePresets(readyCtx, getReadySettings);
            const settings = getReadySettings();
            const root = resolveManagedPresetRoot(settings);
            if (root === undefined)
                return;
            reconcileRolePresets({ root, settings });
        }
    });
    registerRuntimeRecovery(ctx, controller, getSettings);
    registerModelRouting(ctx, controller, getSettings);
    registerHeadlessRoleTools(ctx, controller, getSettings);
    registerSafetyGuards(ctx, controller, getSettings);
}
export default apply;
//# sourceMappingURL=index.js.map