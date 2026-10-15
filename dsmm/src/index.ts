import { Context, symbols } from "@deepseek-ai/cordis";
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
import { projectDsmmModules } from "./modules.js";
import { scopeLifetime } from "./delivery-authority.js";
import { admittedAgentContext, classifyDsmmAgent, integrateSubagentRuntime, managedAgentContext, publicProfileRuntime, registerRoleControlContribution, registerRuntimeGuidance, runtimeAdmissionView } from "./runtime-integration.js";
import type { DsmmHostStartupOptions } from "./runtime-integration.js";
import { LegacyReadUnavailable } from "./legacy-read-contracts.js";
import type { DsmmCoreLlmOwner } from "./role-llm-runtime.js";
import type { DsmmLlmAdmission } from "./host-llm.js";
import { createCorePermissionAuthority } from "./core-permission-authority.js";
import { nativeStandingFullAccess } from "./permission-native-access.js";
import { installCorePermissions } from "./core-permissions.js";

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
export { DsmmNativeLlmRuntime } from "./llm-runtime.js";
export type { DsmmLlmAdmission, DsmmLlmCallConfig, DsmmLlmHostOwner, DsmmLlmGeneration, DsmmJson } from "./host-llm.js";

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
  if (!Context.is(ctx)) {
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
  if (Context.is(ctx) && ctx.fiber.entry !== undefined) {
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
    if (!Context.is(ctx)) throw new Error("Deepwork sessionPersistence requires a native Cordis Context");
    const native: Context = ctx;
    if (native.get("sessionPersistence") !== undefined) throw new Error("Disable the exact existing JSONL entry at startup before enabling Deepwork sessionPersistence; live replacement is refused");
    const fiber = native.plugin(DsmmSessionPersistence, storage);
    return fiber.await().then(() => applyRuntime(ctx, config, deployment, startup, hostStartup));
  }
  return applyRuntime(ctx, config, deployment, startup, hostStartup);
}

function applyRuntime(ctx: DshContext, config: Config, deployment?: DsmmDeploymentConfig, startup?: DsmmDeploymentSnapshot, hostStartup: DsmmHostStartupOptions = {}): void | Promise<void> {
  const native = Context.is(ctx) ? ctx : undefined;
  const lifetime = new AbortController();
  if (native !== undefined) scopeLifetime(native, "dsmm: revoke Core startup and admission", () => lifetime.abort());
  let permissionOwner: object | undefined;
  const getMountedPermission = (): boolean | null => {
    if (native === undefined || lifetime.signal.aborted) return null;
    const current = native.get("dsmmPermissionController");
    if (current === undefined || (Reflect.get(current, symbols.original) ?? current) !== permissionOwner) return null;
    return current?.rules.status().mounted ?? null;
  };
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
    return runtime?.getSettings.moduleStates?.(agent) ?? projectDsmmModules(getSettings(), startup, getBoundSettings.admission!(agent), false, getMountedPermission);
  };
  getBoundSettings.subagentRuntime = () => native === undefined
    ? { binding: "unavailable", deliveryFenceReady: false, restartRequired: true, reason: "explicit-composition-required" }
    : runtimeAdmissionView(native);
  rolePolicy = new DsmmRolePolicy(ctx, getBoundSettings, controller);
  const assertDwDelivery = (agent: DshAgent) => {
    if (rolePolicy.identity(agent).role === undefined) return;
    const integration = native?.get("dsmmRuntimeIntegration");
    if (integration === undefined || !integration.runtime.authority.view().deliveryFenceReady) throw new DsmmProfileError("unavailable", "Deepwork execution requires its live delivery fence.");
    return integration.bridge.authority.acquireParentTicket(agent);
  };
  const getSettings = registerSettings(ctx, config, {
    ...(startup === undefined ? {} : { resolved: startup.settings }),
    install(readyCtx, getReadySettings) {
      const startupMounted = getReadySettings().modules.deepwork.enabled;
      // The global editor belongs to core, not profile/DW installation success.
      if (deployment !== undefined) {
        readyCtx.provide?.("dsmmDeploymentConfig", deployment);
        readyCtx.inject?.(["typert"], (rpcCtx) => {
          registerConfigRpc(rpcCtx as unknown as Context, deployment, getReadySettings(), () => runtime, startup?.sources, getMountedPermission);
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
          await registerLspRuntime(profileCtx as Context, { ...getReadySettings().lsp, enabled: false }, getBoundSettings);
        }
        // Standing definitions must exist before initialize audits retained
        // Agents. A missing optional registry still installs later from this
        // same frozen startup getter, without blocking unrelated Hosts.
        const presets = registerRolePresets(profileCtx, getReadySettings);
        if (profileCtx.get?.("agentPresets") !== undefined) await presets;
        const integration = await integrateSubagentRuntime(hostCtx, getReadySettings(), rolePolicy, () => runtime, hostStartup);
        lifetime.signal.throwIfAborted();
        if (hostStartup.experimentalLegacyRead !== undefined && integration === undefined) throw new DsmmProfileError("unavailable", "Legacy read requires the explicit cold DSMM runtime composition.");
        if (startupMounted && hostCtx.get("subagents") !== undefined) {
          // The actual registry exists now. Alias registration is synchronous and
          // does not wait on a policy-ready provider, avoiding a startup cycle.
          registerRoleProviders({ get: hostCtx.get.bind(hostCtx), effect: callback => hostCtx.effect(() => callback() ?? (() => {})) }, getBoundSettings, getReadySettings, rolePolicy);
        }
        const retainedChildren = profileCtx.get!<import("./dsh-types.js").DshAgentsRegistry>("agents")!.list().filter(agent => agent.session.header?.origin === "subagent");
        const manager = await createProfileRuntime(profileCtx, getReadySettings(), { modeController: controller,
          getMountedPermission, deferRetainedChildren: integration !== undefined,
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
            integration?.onAdmissionGuardsInstalled();
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
        lifetime.signal.throwIfAborted();
        // Retained controlled children enroll only after their awaited admission
        // in the Core-dependent continuation; ordinary Core startup stays independent.
        const admittedCtx = admittedAgentContext(profileCtx, manager);
        install(admittedCtx, getBoundSettings);
        registerRuntimeGuidance(admittedCtx, getBoundSettings, rolePolicy);
        const published = publicProfileRuntime(manager, hostCtx, integration?.legacyRead === undefined ? undefined : integration);
        profileCtx.provide?.("dsmmProfileRuntime", published);
        if (integration !== undefined) {
          hostCtx.provide("dsmmRuntimeIntegration", integration);
          hostCtx.inject(["dsmmCoreLlmOwner"], async continuationCtx => {
            const continuation = new AbortController();
            scopeLifetime(continuationCtx, "dsmm: cancel DW startup continuation", () => continuation.abort());
            return integration.continueStartup(async signal => {
              const visited = new Set<DshAgent>();
              const admit = async (agent: DshAgent): Promise<void> => {
                signal.throwIfAborted(); lifetime.signal.throwIfAborted();
                if (visited.has(agent)) return;
                visited.add(agent);
                const parent = hostCtx.agents.list().find(parent => parent !== agent && hostCtx.agents.isOwnedBy(agent.id! as import("@deepseek-ai/dsh-session").SessionId, parent));
                if (parent !== undefined) await admit(parent as unknown as DshAgent);
                if (parent !== undefined && classifyDsmmAgent(agent as import("@deepseek-ai/dsh-agent").Agent) === "native" && !controlledParent(parent as unknown as DshAgent)) return;
                await manager.completeAdmission(agent, signal, startup);
                await integration.afterChildAdmission(agent as import("@deepseek-ai/dsh-agent").Agent, signal);
              };
              for (const agent of retainedChildren) if (hostCtx.agents.get(agent.id! as import("@deepseek-ai/dsh-session").SessionId) === agent) await admit(agent);
              signal.throwIfAborted(); lifetime.signal.throwIfAborted();
              await registerNativeSubagentControls(profileCtx as Context);
              signal.throwIfAborted(); lifetime.signal.throwIfAborted();
              await registerHeadlessRoleTools(admittedAgentContext(profileCtx, manager), controller, getBoundSettings, rolePolicy, integration);
              signal.throwIfAborted(); lifetime.signal.throwIfAborted();
              hostCtx.inject(["typert"], scope => integration.registerControls(scope));
            }, AbortSignal.any([lifetime.signal, continuation.signal]));
          });
        } else registerRoleControlContribution(hostCtx);
        profileCtx.inject?.(["typert"], (rpcCtx) => {
          new DsmmProfilesHost(rpcCtx as unknown as Context, published);
        });
      };
      if (readyCtx.inject !== undefined) {
        profileInitialization = new Promise<void>((resolve, reject) => {
          const fiber = readyCtx.inject!(["profileContext"], async (profileCtx) => {
            try { await installProfiles(profileCtx); resolve(); }
            catch (error) { reject(error); }
          }) as Context["fiber"];
          scopeLifetime(fiber.ctx, "dsmm: cancel Core profile initialization", () => reject(new DsmmProfileError("unavailable", "Core profile initialization was disposed.")));
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
      assertDwDelivery(frame.agent);
      return next();
    }, { prepend: true, global: true });
    ctx.on?.("tools/execute", async (exec, next) => {
      if (exec.agent === undefined) return next();
      return rolePolicy.duringToolExecution(exec, next);
    }, { global: true });
  }
  registerSafetyGuards(ctx, controller, getBoundSettings, ctx.get === undefined ? undefined : rolePolicy);
  if (native === undefined) return profileInitialization;
  native.inject(["tools"], scope => {
    managedAgentContext(scope, controlledParent).on!("tools/pre-execute", (exec, next) => rolePolicy.beforeToolDecision(async () => {
      if (exec.agent !== undefined && !nativeStandingFullAccess(scope, exec.agent)) {
        rolePolicy.assertModuleAdmission(exec.agent as unknown as DshAgent);
        assertDwDelivery(exec.agent as unknown as DshAgent);
      }
      return next();
    }), { prepend: true, global: true });
    managedAgentContext(scope, controlledParent).get!<import("@deepseek-ai/dsh-tools").ToolRuntime>("tools")!.guard(exec => {
      rolePolicy.assertToolExecution(exec);
    });
  });
  if (deployment !== undefined) {
    const permissions = createCorePermissionAuthority(native, { getSettings: getBoundSettings, rolePolicy, signal: lifetime.signal });
    native.inject(["tools"], scope => {
      const installed = installCorePermissions(scope, deployment, permissions.authority, permissions.assertWritable);
      const identity = Reflect.get(installed, symbols.original) ?? installed;
      scopeLifetime(scope, "dsmm: release mounted permission projection", () => { if (permissionOwner === identity) permissionOwner = undefined; }, () => { permissionOwner = identity; });
    });
  }
  return Promise.resolve(profileInitialization).then(() => {
    lifetime.signal.throwIfAborted();
    const owner: DsmmCoreLlmOwner = { async admit(frame) {
      const agent = frame.agent as unknown as DshAgent;
      frame.signal.throwIfAborted(); lifetime.signal.throwIfAborted();
      if (frame.agent.session.header.origin === "subagent" && classifyDsmmAgent(frame.agent) === "native") {
        const registry = native.agents;
        const parents = registry.list().filter(parent => parent !== frame.agent && registry.isOwnedBy(frame.agent.id, parent));
        if (registry.get(frame.agent.id) !== frame.agent || parents.length !== 1
          || frame.agent.session.header.parentSession !== parents[0].id) throw new DsmmProfileError("not-owned", "The native child lost its physical owner.");
        if (!controlledParent(parents[0] as unknown as DshAgent)) return undefined;
      }
      rolePolicy.assertModuleAdmission(agent);
      const admission = getBoundSettings.admission!(agent);
      const permissions = native.get("dsmmPermissionController");
      const full = nativeStandingFullAccess(native, frame.agent);
      if (!full && admission.settings.permissionControl.enabled && permissions === undefined) throw new DsmmProfileError("unavailable", "Core permission authority is not ready.");
      if (!full) await permissions?.rules.refresh();
      frame.signal.throwIfAborted(); lifetime.signal.throwIfAborted();
      const permissionIdentity = permissions === undefined ? undefined : Reflect.get(permissions, symbols.original) ?? permissions;
      const permissionRevision = full ? undefined : permissions?.rules.getPolicy().revision;
      const permissionSignal = full ? undefined : permissions?.rules.signal;
      const bindPermission = (captured: DsmmLlmAdmission): DsmmLlmAdmission => {
        if (full) return captured;
        const signal = AbortSignal.any([captured.signal, ...permissionSignal === undefined ? [] : [permissionSignal]]);
        const assertCurrent = (): void => {
          signal.throwIfAborted(); captured.assertCurrent();
          const current = native.get("dsmmPermissionController");
          if ((current === undefined ? undefined : Reflect.get(current, symbols.original) ?? current) !== permissionIdentity
            || current?.rules.getPolicy().revision !== permissionRevision
            || current?.rules.signal !== permissionSignal) throw new DsmmProfileError("not-owned", "LLM permission revision changed.");
        };
        assertCurrent();
        return Object.freeze({ ...captured, signal, assertCurrent });
      };
      if (rolePolicy.identity(agent).role !== undefined) {
        const integration = native.get("dsmmRuntimeIntegration");
        if (integration?.runtime.authority.view().deliveryFenceReady !== true) throw new DsmmProfileError("unavailable", "Deepwork requests require the live delivery fence.");
        const admitted = await integration.admitLlmRequest(frame.agent, frame.signal);
        if (admitted === undefined) throw new DsmmProfileError("not-owned", "Deepwork request lost its role admission.");
        return bindPermission(admitted);
      }
      const signal = AbortSignal.any([frame.signal, lifetime.signal]);
      const assertCurrent = (): void => {
        signal.throwIfAborted(); rolePolicy.assertModuleAdmission(agent);
        if (native.get("dsmmCoreLlmOwner") !== owner || getBoundSettings.admission!(agent) !== admission) throw new DsmmProfileError("not-owned", "Core LLM admission changed.");
      };
      assertCurrent();
      return bindPermission(Object.freeze({ agent: frame.agent, admission, capture: admission, epoch: admission.epoch, signal, assertCurrent }));
    } };
    native.provide("dsmmCoreLlmOwner", owner);
  });
}

// Cordis Loader introspects this object's Config/inject; a bare function loses
// the exported schema and may pass null where required DSMM defaults belong.
// Method-form apply keeps Cordis on its awaited callback, not constructor, path.
export default { name, inject, Config, apply(ctx: DshContext, config: Config = {}) { return apply(ctx, config); } };
