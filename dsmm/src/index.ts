import { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import type { DshAgent, DshContext } from "./dsh-types.js";
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
import { DeepworkModeController, isDeepworkActive } from "./state.js";
import DsmmSessionPersistence from "./session-persistence.js";
import { isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DsmmProfileAdmission, DsmmSettings } from "./settings.js";
import { DsmmProfileError } from "./profiles.js";
import { DsmmDeploymentConfig } from "./deployment-config.js";
import type { DsmmDeploymentSnapshot } from "./settings.js";
import { agentForScope } from "./native-scope.js";
import { resolveSelectedAgentPreset, sessionEvents } from "./session-scope.js";
import { projectDeepworkModule } from "./modules.js";
import { classifyDsmmAgent, integrateSubagentRuntime, managedAgentContext, publicProfileRuntime, registerRoleControlContribution, registerRuntimeGuidance, runtimeAdmissionView } from "./runtime-integration.js";
import type { DsmmHostStartupOptions } from "./runtime-integration.js";
import { LegacyReadUnavailable } from "./legacy-read-contracts.js";

export const name = "dsmm";
export const inject = ["profileContext", "agents"] as const;

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

export type { DsmmHostStartupOptions } from "./runtime-integration.js";

/** Experimental Host collaborators are programmatic only; serialized settings cannot authenticate them. */
export function createDsmmHostPlugin(startup: DsmmHostStartupOptions) {
  if (startup.experimentalLegacyRead !== undefined) {
    const host = startup.experimentalLegacyRead.startup;
    if (host === null || typeof host !== "object" || [host.captureClosedComposition, host.resolveReadBindings, host.acquireCallContext,
      host.reportAuditFault, host.reportRetirementFault, host.revoke].some(callback => typeof callback !== "function")) throw new DsmmProfileError("unavailable", "Legacy read startup requires actual Host composition, FS, turn and audit collaborators.");
  }
  return { name, Config, inject: startup.experimentalLegacyRead === undefined ? inject : [...inject, "subagents"],
    apply(ctx: DshContext, config: Config = {}) { return apply(ctx, config, startup); } };
}

export function apply(ctx: DshContext, config: Config = {}, hostStartup: DsmmHostStartupOptions = {}): void | Promise<void> {
  if (!(ctx instanceof Context)) {
    if (hostStartup.experimentalLegacyRead !== undefined) throw new DsmmProfileError("unavailable", "Legacy read requires a real cold native Host.");
    return applyConfigured(ctx, config, undefined, undefined, hostStartup);
  }
  if (hostStartup.experimentalLegacyRead !== undefined && (ctx.get("dsmmProfileRuntime") !== undefined || runtimeAdmissionView(ctx).deliveryFenceReady)) throw new LegacyReadUnavailable("lifetime-unavailable");
  const deployment = new DsmmDeploymentConfig(ctx, config);
  return deployment.readDesired().then((startup) => applyConfigured(ctx, config, deployment, startup, hostStartup));
}

function applyConfigured(ctx: DshContext, config: Config, deployment?: DsmmDeploymentConfig, startup?: DsmmDeploymentSnapshot, hostStartup: DsmmHostStartupOptions = {}): void | Promise<void> {
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
    return fiber.await().then(() => applyRuntime(ctx, config, deployment, startup, hostStartup));
  }
  return applyRuntime(ctx, config, deployment, startup, hostStartup);
}

function applyRuntime(ctx: DshContext, config: Config, deployment?: DsmmDeploymentConfig, startup?: DsmmDeploymentSnapshot, hostStartup: DsmmHostStartupOptions = {}): void | Promise<void> {
  const native = ctx instanceof Context ? ctx : undefined;
  let rootAdmissionsInitialized = false;
  const completedRootAdmissions = new WeakSet<DshAgent>();
  let rolePolicy: DsmmRolePolicy;
  const controlledParent = (agent: DshAgent): boolean => {
    if (classifyDsmmAgent(agent as import("@deepseek-ai/dsh-agent").Agent) === "dsmm") return true;
    if (agent.session.header?.origin === "subagent") return false;
    // A pending parent admission cannot establish native-child eligibility.
    if (!rootAdmissionsInitialized && !completedRootAdmissions.has(agent)) return true;
    const settings = getBoundSettings(agent);
    return settings.modules.deepwork.enabled && isDeepworkActive(sessionEvents(agent.session), settings.defaultActive, resolveSelectedAgentPreset(agent.session));
  };
  if (native !== undefined) {
    ctx = managedAgentContext(native, controlledParent);
  }
  const validatingRootModule = new WeakMap<DshAgent, boolean>();
  const controller = new DeepworkModeController(ctx, (agent) => validatingRootModule.get(agent) ?? getBoundSettings(agent).modules.deepwork.enabled);
  let runtime: DsmmProfileRuntime | undefined;
  let profileInitialization: Promise<void> | undefined;
  let requiresNativeProfiles = ctx.get !== undefined;
  const requireProfileAdmission = (agent?: object): void => {
    if (agent !== undefined && requiresNativeProfiles && runtime === undefined) {
      throw new DsmmProfileError("unavailable", "Native Deepwork profile admission is not ready. No provider request or tool work is allowed.");
    }
  };
  const getBoundSettings: DsmmSettingsGetter = (agent) => {
    requireProfileAdmission(agent);
    return runtime?.getSettings(agent) ?? getSettings();
  };
  const deploymentAdmissions = new WeakMap<DsmmSettings, DsmmProfileAdmission>();
  getBoundSettings.admission = (agent) => {
    requireProfileAdmission(agent);
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
    requireProfileAdmission(agent);
    return runtime?.getSettings.moduleStates?.(agent) ?? [projectDeepworkModule(getSettings(), startup, getBoundSettings.admission!(agent))];
  };
  getBoundSettings.subagentRuntime = () => native === undefined
    ? { binding: "unavailable", deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" }
    : runtimeAdmissionView(native);
  rolePolicy = new DsmmRolePolicy(ctx, getBoundSettings, controller);
  const getSettings = registerSettings(ctx, config, {
    ...(startup === undefined ? {} : { resolved: startup.settings }),
    install(readyCtx, getReadySettings) {
      const startupMounted = getReadySettings().modules.deepwork.enabled;
      // The global editor belongs to core, not profile/DW installation success.
      if (deployment !== undefined) {
        readyCtx.provide?.("dsmmDeploymentConfig", deployment);
        readyCtx.inject?.(["typert"], (rpcCtx) => {
          registerConfigRpc(rpcCtx as unknown as Context, deployment, getReadySettings(), () => runtime, startup?.sources);
        });
      }
      const install = (installCtx: DshContext, settingsGetter: DsmmSettingsGetter): void => {
        if (startupMounted) {
          registerDeepworkPrompt(installCtx, controller, settingsGetter, { section: startup === undefined ? config.section : startup.profile.section ?? startup.global.section });
          registerAgentSkills(installCtx, controller, settingsGetter);
        }
        const installCommands = (commandCtx: DshContext): void => {
          if (startupMounted) registerDeepworkCommand(commandCtx, controller, settingsGetter);
          // Status projects live substrate readiness without replacing the exact
          // immutable admission reference used by authority and providers.
          const statusSettings = Object.assign(((agent?: DshAgent) => settingsGetter(agent)) as DsmmSettingsGetter, settingsGetter);
          statusSettings.admission = agent => ({ ...getBoundSettings.admission!(agent), subagentRuntime: getBoundSettings.subagentRuntime!() });
          registerDsmmStatusCommand(commandCtx, controller, statusSettings);
        };
        if (installCtx.get !== undefined && installCtx.inject !== undefined) installCtx.inject(["commands"], installCommands);
        else installCommands(installCtx);
        if (!startupMounted) return;
        // Standing compositions are deployment-only and never replaced on a
        // runtime profile selection. All routes are read from Agent bindings.
        const settings = getReadySettings();
        const root = resolveManagedPresetRoot(settings, deployment === undefined ? process.env : { ...process.env, DSH_HOME: deployment.home });
        if (root !== undefined) reconcileRolePresets({ root, settings });
      };
      if (readyCtx.get === undefined) {
        registerRolePresets(readyCtx, getReadySettings);
        install(readyCtx, getReadySettings);
        if (startupMounted) registerRoleProviders(readyCtx, getReadySettings, getReadySettings, rolePolicy);
        return;
      }
      requiresNativeProfiles = true;
      const installProfiles = async (profileCtx: DshContext): Promise<void> => {
        if (native === undefined) throw new Error("dsmm native profiles require the actual Cordis Host scope");
        const hostCtx = profileCtx as Context;
        profileCtx = managedAgentContext(hostCtx, controlledParent);
        if (startupMounted) {
          await registerLspRuntime(profileCtx as Context, getReadySettings().lsp, getBoundSettings);
          await registerNativeSubagentControls(profileCtx as Context);
        }
        // Standing definitions must exist before initialize audits retained
        // Agents. A missing optional registry still installs later from this
        // same frozen startup getter, without blocking unrelated Hosts.
        const presets = registerRolePresets(profileCtx, getReadySettings);
        if (profileCtx.get?.("agentPresets") !== undefined) await presets;
        const integration = await integrateSubagentRuntime(hostCtx, getReadySettings(), rolePolicy, () => runtime, hostStartup);
        if (hostStartup.experimentalLegacyRead !== undefined && integration === undefined) throw new DsmmProfileError("unavailable", "Legacy read requires the explicit cold DSMM runtime composition.");
        if (startupMounted && hostCtx.get("subagents") !== undefined) {
          // The actual registry exists now. Alias registration is synchronous and
          // does not wait on a policy-ready provider, avoiding a startup cycle.
          registerRoleProviders({ get: hostCtx.get.bind(hostCtx), effect: callback => hostCtx.effect(() => callback() ?? (() => {})) }, getBoundSettings, getReadySettings, rolePolicy);
        }
        const manager = await createProfileRuntime(profileCtx, getReadySettings(), { modeController: controller,
          ...(startup === undefined ? {} : { startup }), ...(deployment === undefined ? {} : { readDesired: () => deployment.readDesired() }),
          ...(integration === undefined ? {} : { childAuthority: integration.bridge.authority, childAuthorityOwner: integration.owner,
            childAdmission: integration.bridge.childAdmission, childCapturePersistence: hostCtx.get("sessionPersistence") === undefined ? "resident" as const : "durable" as const }),
          validateRootRole: (agent, admission) => {
            // Candidate identity validation precedes publication. Its mode check
            // must not recursively demand the not-yet-bound live admission.
            validatingRootModule.set(agent, admission.settings.modules.deepwork.enabled);
            try { rolePolicy.validateRootRole(agent, admission); }
            finally { validatingRootModule.delete(agent); }
          },
          onAdmissionGuardsInstalled: async (initializing) => {
            runtime = initializing;
            await integration?.ready();
            // Native descendants are filtered from their direct parent's actual
            // admission, including a preselected named profile, not startup mode.
            for (const root of hostCtx.agents.roots()) {
              const agent = root as unknown as DshAgent;
              await initializing.completeAdmission(agent, undefined, startup);
              completedRootAdmissions.add(agent);
            }
            rootAdmissionsInitialized = true;
            if (integration?.legacyRead !== undefined) {
              profileCtx.on?.("agent/created", async ({ agent, signal }: { agent: DshAgent; signal?: AbortSignal }) => {
                await integration.afterChildAdmission(agent as import("@deepseek-ai/dsh-agent").Agent, signal);
              }, { global: true });
            }
          },
          subagentCapabilities: {
            backgroundJobs: profileCtx.get?.("jobs") !== undefined,
            continuable: profileCtx.get?.("sessionPersistence") !== undefined && profileCtx.get?.("sessionQuery") !== undefined
              && (profileCtx.get?.("subagents") as Context["subagents"] | undefined)?.getProvider("spawn")?.prepareContinuable !== undefined
          } });
        runtime = manager;
        if (integration?.legacyRead !== undefined) for (const agent of profileCtx.get!<import("./dsh-types.js").DshAgentsRegistry>("agents")!.list()) await integration.afterChildAdmission(agent as import("@deepseek-ai/dsh-agent").Agent);
        install(profileCtx, getBoundSettings);
        if (startupMounted && integration !== undefined) await registerHeadlessRoleTools(profileCtx, controller, getBoundSettings, rolePolicy, integration);
        registerRuntimeGuidance(profileCtx, getBoundSettings, rolePolicy);
        const published = publicProfileRuntime(manager, hostCtx, integration?.legacyRead === undefined ? undefined : integration);
        profileCtx.provide?.("dsmmProfileRuntime", published);
        if (integration !== undefined) {
          hostCtx.provide("dsmmRuntimeIntegration", integration);
          hostCtx.inject(["typert"], scope => integration.registerControls(scope));
        } else registerRoleControlContribution(hostCtx);
        profileCtx.inject?.(["typert"], (rpcCtx) => {
          new DsmmProfilesHost(rpcCtx as unknown as Context, published);
        });
      };
      if (readyCtx.inject !== undefined) {
        profileInitialization = new Promise<void>((resolve, reject) => {
          readyCtx.inject!(["profileContext"], async (profileCtx) => {
            try { await installProfiles(profileCtx); resolve(); }
            catch (error) { reject(error); }
          });
        });
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
// Method-form apply keeps Cordis on its awaited callback, not constructor, path.
export default { name, inject, Config, apply(ctx: DshContext, config: Config = {}) { return apply(ctx, config); } };
