import { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import type { DshAgent, DshAgentsRegistry, DshContext } from "./dsh-types.js";
import { registerDeepworkCommand, registerDsmmStatusCommand } from "./commands.js";
import { registerSafetyGuards } from "./guards.js";
import { registerDeepworkPrompt } from "./mode.js";
import { registerAgentSkills } from "./preset-skills.js";
import { registerModelRouting } from "./model-routing.js";
import { registerRuntimeRecovery } from "./runtime-recovery.js";
import { reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
import { registerHeadlessRoleTools, registerNativeSubagentControls } from "./role-subagents.js";
import { registerRolePresets } from "./preset-registry.js";
import { registerRoleProviders } from "./role-providers.js";
import { DsmmRolePolicy } from "./role-policy.js";
import { registerLspRuntime } from "./lsp.js";
import { createProfileRuntime } from "./profile-runtime.js";
import type { DsmmProfileRuntime } from "./profile-runtime.js";
import { DsmmProfilesHost, registerConfigRpc } from "./profile-rpc.js";
import { DSMM_CONFIG_SCHEMA, DSMM_NATIVE_CONFIG_SCHEMA, registerSettings } from "./settings.js";
import type { DsmmPluginConfig } from "./settings.js";
import type { DsmmSettingsGetter } from "./settings.js";
import { DeepworkModeController } from "./state.js";
import DsmmSessionPersistence from "./session-persistence.js";
import { isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";
import { DsmmProfileError } from "./profiles.js";
import { DsmmDeploymentConfig } from "./deployment-config.js";
import type { DsmmDeploymentSnapshot } from "./settings.js";
import { agentForScope } from "./native-scope.js";
import { projectDeepworkModule } from "./modules.js";

export const name = "dsmm";
export const inject = ["profileContext"] as const;

export type Config = DsmmPluginConfig;
// Direct public Config calls keep the complete plain flat ABI. Native Cordis
// consumes the same object's Standard Schema protocol for sparse volatile refs.
export const Config = new Proxy(DSMM_NATIVE_CONFIG_SCHEMA, {
  apply(_target, _receiver, args) { return DSMM_CONFIG_SCHEMA(args[0] ?? {}); }
});

export type { DeepworkSessionEventMap } from "./dsh-events.js";
export type { DsmmRoleDefinition, DsmmRoleId } from "./roles.js";
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "./guards.js";
export { DEFAULT_DSMM_LSP_SETTINGS, DSMM_LSP_SERVER_NAME, DSMM_LSP_TOOL_NAMES, parseLspSmokeCommand, publicLspToolName, renderLspMcpPatch, resolveLspSettings, toDshMcpClientConfig } from "./lsp.js";
export type { DshMcpStdioConfig, DsmmLspSettings, DsmmLspToolName, DsmmLspRuntimeState } from "./lsp.js";
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
export type { DsmmSubagentSettings } from "./settings.js";
export { createProfileRuntime, DsmmProfileRuntime } from "./profile-runtime.js";
export { resolveDshHome } from "./dsh-home.js";
export { DsmmDeploymentConfig, parseGlobalConfig, editGlobalConfig } from "./deployment-config.js";
export type { GlobalConfigSnapshot, GlobalConfigSaveRequest, DeploymentPathEdit } from "./deployment-config.js";
export type { DsmmDeploymentSnapshot } from "./settings.js";
export { DSMM_MODULE_DESCRIPTORS, deepworkEnabled, projectDeepworkModule } from "./modules.js";
export type { DsmmModuleState } from "./modules.js";
export type { DsmmProfileRuntimeStore, DsmmProfileRuntimeOptions } from "./profile-runtime.js";
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";

export function apply(ctx: DshContext, config: Config = {}): void | Promise<void> {
  if (!(ctx instanceof Context)) return applyConfigured(ctx, config);
  const deployment = new DsmmDeploymentConfig(ctx, config);
  return deployment.readDesired().then((startup) => applyConfigured(ctx, config, deployment, startup));
}

function applyConfigured(ctx: DshContext, config: Config, deployment?: DsmmDeploymentConfig, startup?: DsmmDeploymentSnapshot): void | Promise<void> {
  // Volatile desired saves retain live realms. An ordinary Loader remount must
  // not replace already-admitted Agent policy/skill realms, including busy Agents.
  if (ctx instanceof Context && ctx.fiber.entry !== undefined) {
    const native: Context = ctx;
    const owner = ctx.fiber.entry;
    native.on("loader/patch-context", (entry, next) => {
      if (entry === owner && (native.get("agents")?.list().length ?? 0) > 0) {
        throw new Error("dsmm deployment Config requires restart while Agents are admitted; runtime mode/profile changes use idle maintenance instead");
      }
      next();
    }, { global: true });
  }
  const storage = config.sessionPersistence;
  if (storage !== undefined) {
    if (storage === null || typeof storage !== "object" || typeof storage.root !== "string" || !isAbsolute(storage.root)
      || Object.keys(storage).some((key) => !["root", "compression"].includes(key))
      || storage.compression !== undefined && !["zstd", "none"].includes(storage.compression)) {
      throw new Error("Deepwork sessionPersistence must preserve an explicit absolute native root and compression");
    }
    if (!(ctx instanceof Context)) throw new Error("Deepwork sessionPersistence requires a native Cordis Context");
    const native: Context = ctx;
    if (native.get("sessionPersistence") !== undefined) throw new Error("Disable the exact existing JSONL entry at startup before enabling Deepwork sessionPersistence; live replacement is refused");
    const fiber = native.plugin(DsmmSessionPersistence, storage);
    return fiber.await().then(() => applyRuntime(ctx, config, deployment, startup));
  }
  return applyRuntime(ctx, config, deployment, startup);
}

function applyRuntime(ctx: DshContext, config: Config, deployment?: DsmmDeploymentConfig, startup?: DsmmDeploymentSnapshot): void | Promise<void> {
  const controller = new DeepworkModeController(ctx, (agent) => getBoundSettings(agent).modules.deepwork.enabled);
  let runtime: DsmmProfileRuntime | undefined;
  let profileInitialization: Promise<void> | undefined;
  let requiresNativeProfiles = ctx.get !== undefined;
  const requireProfileAdmission = (): void => {
    if (requiresNativeProfiles && runtime === undefined) {
      throw new DsmmProfileError("unavailable", "Native Deepwork profile admission is not ready. No provider request or tool work is allowed.");
    }
  };
  const getBoundSettings: DsmmSettingsGetter = (agent) => {
    requireProfileAdmission();
    return runtime?.getSettings(agent) ?? getSettings();
  };
  const deploymentAdmissions = new WeakMap<DsmmSettings, DsmmProfileAdmission>();
  getBoundSettings.admission = (agent) => {
    requireProfileAdmission();
    const nativeAdmission = runtime?.getSettings.admission?.(agent);
    if (nativeAdmission !== undefined) return nativeAdmission;
    const settings = getSettings();
    let admission = deploymentAdmissions.get(settings);
    if (admission === undefined) {
      admission = Object.freeze({ settings, profile: null, scope: "deployment-baseline", epoch: createHash("sha256").update(randomUUID()).digest("hex") });
      deploymentAdmissions.set(settings, admission);
    }
    return admission;
  };
  getBoundSettings.moduleStates = (agent) => {
    requireProfileAdmission();
    return runtime?.getSettings.moduleStates?.(agent) ?? [projectDeepworkModule(getSettings(), startup, getBoundSettings.admission!(agent))];
  };
  const rolePolicy = new DsmmRolePolicy(ctx, getBoundSettings, controller);
  const getSettings = registerSettings(ctx, config, {
    ...(startup === undefined ? {} : { resolved: startup.settings }),
    install(readyCtx, getReadySettings) {
      const startupMounted = getReadySettings().modules.deepwork.enabled;
      // The global editor belongs to core, not profile/DW installation success.
      if (deployment !== undefined) {
        readyCtx.provide?.("dsmmDeploymentConfig", deployment);
        readyCtx.inject?.(["typert"], (rpcCtx) => {
          registerConfigRpc(rpcCtx as unknown as Context, deployment, getReadySettings());
        });
      }
      const install = (installCtx: DshContext, settingsGetter: DsmmSettingsGetter): void => {
        if (startupMounted) {
          registerDeepworkPrompt(installCtx, controller, settingsGetter, { section: startup === undefined ? config.section : startup.profile.section ?? startup.global.section });
          registerAgentSkills(installCtx, controller, settingsGetter);
        }
        const installCommands = (commandCtx: DshContext): void => {
          if (startupMounted) registerDeepworkCommand(commandCtx, controller, settingsGetter);
          registerDsmmStatusCommand(commandCtx, controller, settingsGetter);
        };
        if (installCtx.get !== undefined && installCtx.inject !== undefined) installCtx.inject(["commands"], installCommands);
        else installCommands(installCtx);
        if (!startupMounted) return;
        registerRoleProviders(installCtx, settingsGetter, getReadySettings, rolePolicy);
        // Standing compositions are deployment-only and never replaced on a
        // runtime profile selection. All routes are read from Agent bindings.
        const settings = getReadySettings();
        const root = resolveManagedPresetRoot(settings, deployment === undefined ? process.env : { ...process.env, DSH_HOME: deployment.home });
        if (root !== undefined) reconcileRolePresets({ root, settings });
      };
      if (readyCtx.get === undefined) {
        registerRolePresets(readyCtx, getReadySettings);
        install(readyCtx, getReadySettings);
        return;
      }
      requiresNativeProfiles = true;
      const installProfiles = async (profileCtx: DshContext): Promise<void> => {
        if (startupMounted) {
          await registerLspRuntime(profileCtx as Context, getReadySettings().lsp, getBoundSettings);
          await registerNativeSubagentControls(profileCtx as Context);
        }
        // Standing definitions must exist before initialize audits retained
        // Agents. A missing optional registry still installs later from this
        // same frozen startup getter, without blocking unrelated Hosts.
        const presets = registerRolePresets(profileCtx, getReadySettings);
        if (profileCtx.get?.("agentPresets") !== undefined) await presets;
        runtime = await createProfileRuntime(profileCtx, getReadySettings(), { modeController: controller,
          ...(startup === undefined ? {} : { startup }), ...(deployment === undefined ? {} : { readDesired: () => deployment.readDesired() }),
          subagentCapabilities: {
            backgroundJobs: profileCtx.get?.("jobs") !== undefined && (profileCtx.get?.("tools") as Context["tools"] | undefined)?.get("job_output") !== undefined,
            continuable: profileCtx.get?.("sessionPersistence") !== undefined && profileCtx.get?.("sessionQuery") !== undefined
              && (profileCtx.get?.("subagents") as Context["subagents"] | undefined)?.getProvider("spawn")?.prepareContinuable !== undefined
              && (profileCtx.get?.("tools") as Context["tools"] | undefined)?.get("send_message") !== undefined
          } });
        profileCtx.provide?.("dsmmProfileRuntime", runtime);
        const manager = runtime;
        profileCtx.inject?.(["typert"], (rpcCtx) => {
          new DsmmProfilesHost(rpcCtx as unknown as Context, manager);
        });
        install(profileCtx, runtime.getSettings);
        const admitIdentity = (agent: DshAgent): void => {
          rolePolicy.assertModuleAdmission(agent);
          rolePolicy.admit(agent);
        };
        profileCtx.on?.("agent/created", ({ agent }) => { admitIdentity(agent); }, { global: true });
        for (const agent of profileCtx.get?.<DshAgentsRegistry>("agents")?.list() ?? []) admitIdentity(agent);
        if (startupMounted) await registerHeadlessRoleTools(profileCtx, controller, runtime.getSettings, rolePolicy);
      };
      if (readyCtx.inject !== undefined) {
        const initialization = readyCtx.inject(["profileContext"], installProfiles);
        profileInitialization = Promise.resolve(initialization).then(() => undefined);
      }
      else throw new Error("dsmm native profiles require asynchronous profileContext injection");
    }
  });
  if (getSettings().modules.deepwork.enabled) {
    registerRuntimeRecovery(ctx, controller, getBoundSettings);
    registerModelRouting(ctx, controller, getBoundSettings);
  }
  if (ctx.get !== undefined) {
    ctx.on?.("system-prompt/assemble", async (_assembly, options: { scope?: object }, next) => {
      const agent = agentForScope(ctx, options.scope);
      if (agent !== undefined) rolePolicy.assertModuleAdmission(agent);
      return next();
    }, { prepend: true, global: true });
    ctx.on?.("agent/request", async (frame, next) => {
      rolePolicy.assertModuleAdmission(frame.agent);
      return next();
    }, { prepend: true, global: true });
  }
  registerSafetyGuards(ctx, controller, getBoundSettings, ctx.get === undefined ? undefined : rolePolicy);
  return profileInitialization;
}

// Cordis Loader introspects this object's Config/inject; a bare function loses
// the exported schema and may pass null where required DSMM defaults belong.
export default { name, inject, Config, apply };
