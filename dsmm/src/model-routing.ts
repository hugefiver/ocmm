import type { DshAgent, DshContext, DshLlmCallConfig, DshLlmRuntime, DshModelReasoningInfo } from "./dsh-types.js";
import { isDsmmRoleId } from "./roles.js";
import { applyModelRoute, clearRoleRouteLock, effectiveRoleFallbackRoutes, establishRolePolicy, latestNativeModelSelection, nativeModelSelectionWasAccepted, orderedModelRoutes, persistedRoleRoute, pinRoleRoute, roleRouteLock, selectInitialModelRoute, sameExactModelRoute, sameModelRoute, takeAdmittedRecoveryRoute } from "./role-routing.js";
import type { NativeModelSelectionIntent } from "./role-routing.js";
import { resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
import { childOwnedSessionEvents, sessionEvents } from "./session-scope.js";
import { isCurrentRecoveryStep } from "./recovery-policy.js";
import type { DeepseekDefaultReasoningEffort, DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

export type DeepseekReasoningEffort = DeepseekDefaultReasoningEffort | "max";
export type DeepseekModelRoute = "v4-pro" | "flash";

export function isDeepseekV4ProRoute(config: Pick<DshLlmCallConfig, "provider" | "model">): boolean {
  return config.provider.toLowerCase() === "deepseek-official" && config.model.toLowerCase() === "deepseek-v4-pro";
}

export function isDeepseekFlashRoute(config: Pick<DshLlmCallConfig, "provider" | "model">): boolean {
  return ["deepseek-official", "deepseek-account"].includes(config.provider.toLowerCase())
    && config.model.toLowerCase() === "deepseek-flash";
}

export function desiredDeepseekEffort(settings: DsmmSettings, preset?: string, route: DeepseekModelRoute = "v4-pro"): DeepseekReasoningEffort {
  const maxPresets = route === "flash" ? settings.deepseekFlashMaxReasoningPresets : settings.deepseekV4ProMaxReasoningPresets;
  return preset !== undefined && maxPresets.some((configuredPreset) => configuredPreset === preset)
    ? "max"
    : route === "flash" ? settings.deepseekFlashDefaultReasoningEffort : settings.deepseekV4ProDefaultReasoningEffort;
}

export function selectAdvertisedEffort(desired: DeepseekReasoningEffort, reasoning: DshModelReasoningInfo | undefined): string | undefined {
  if (!reasoning) return undefined;

  const advertised = new Set(reasoning.efforts.map((effort) => effort.id));
  const fallback = reasoning.defaultEffort !== undefined && advertised.has(reasoning.defaultEffort) ? reasoning.defaultEffort : undefined;

  if (desired === "max") {
    if (advertised.has("max")) return "max";
    if (advertised.has("high")) return "high";
    return fallback;
  }

  return advertised.has(desired) ? desired : fallback;
}

function hasLiveRuntimeOwner(ctx: DshContext, agent: DshAgent): boolean {
  const agents = ctx.get?.<{ list(): DshAgent[]; isOwnedBy(id: string, parent: DshAgent): boolean }>("agents");
  return agent.id !== undefined && agents !== undefined
    && agents.list().some((parent) => parent !== agent && agents.isOwnedBy(agent.id!, parent));
}

export function registerModelRouting(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void {
  const installedContexts = new WeakSet<DshContext>();

  const install = (readyCtx: DshContext): void => {
    if (installedContexts.has(readyCtx) || readyCtx.on === undefined) return;
    installedContexts.add(readyCtx);
    const lockedAgents = new Set<DshAgent>();
    const assembledSelections = new WeakMap<DshAgent, { signal: AbortSignal; intent?: NativeModelSelectionIntent }>();

    let dispose: unknown;
    let disposeAgent: unknown;
    let disposeAssembly: unknown;
    try {
      disposeAssembly = readyCtx.on("system-prompt/assemble", async (_assembly, context: { agent?: DshAgent; signal?: AbortSignal }, next) => {
        if (context.agent !== undefined && context.signal !== undefined) {
          assembledSelections.set(context.agent, { signal: context.signal, intent: latestNativeModelSelection(context.agent) });
        }
        return next();
      }, { prepend: true });
      dispose = readyCtx.on("agent/request", async (frame, next) => {
        let downstream = await next();
        if (frame.signal.aborted) return downstream;
        const settings = getSettings(frame.agent);
        const ordinaryRoot = frame.agent.session.header?.origin !== "subagent";
        const admitted = takeAdmittedRecoveryRoute(frame);
        const active = controller.active(frame.agent, settings.defaultActive);
        const role = resolveEffectiveDsmmRole(frame.agent, settings, active);
        const policy = role === undefined ? undefined : settings.roleRouting[role];
        const primary = policy?.primary;
        const epoch = getSettings.admission?.(frame.agent).epoch;
        const identity = await establishRolePolicy(frame, settings, role, readyCtx, epoch);
        const fallbacks = effectiveRoleFallbackRoutes(settings, role);
        const liveAlias = primary !== undefined && role !== undefined && frame.agent.session.header?.origin === "subagent"
          && (frame.agent.session.inheritedEventCount ?? 0) === 0
          && hasLiveRuntimeOwner(readyCtx, frame.agent);
        const currentStep = isCurrentRecoveryStep(frame.agent.session.header?.origin === "subagent" ? childOwnedSessionEvents(frame.agent.session) : sessionEvents(frame.agent.session), frame.turn, frame.step);
        if (role !== undefined && identity !== undefined && currentStep) {
          let lock = roleRouteLock(frame.agent, identity);
          const exactPolicy = primary !== undefined || policy?.fallbackRoutes !== undefined || fallbacks.length > 0;
          const captured = assembledSelections.get(frame.agent);
          const manual = captured?.signal === frame.signal ? captured.intent : undefined;
          if (ordinaryRoot) {
            const selected = { provider: downstream.provider, model: downstream.model,
              ...(downstream.reasoningEffort === undefined ? {} : { reasoningEffort: downstream.reasoningEffort }) };
            if (lock === undefined || !sameExactModelRoute(lock.route, selected) || lock.manualSelectionSeq !== manual?.seq) {
              const generation = (lock?.generation ?? -1) + 1;
              lock = pinRoleRoute(frame.agent, identity, selected, [selected]);
              lock.manualSelectionSeq = manual?.seq;
              lock.generation = generation;
              lockedAgents.add(frame.agent);
            }
            return downstream;
          }
          if (manual !== undefined && lock?.manualSelectionSeq !== manual.seq
            && (sameExactModelRoute(downstream, manual.route) || nativeModelSelectionWasAccepted(frame.agent, manual))) {
            const llm = frame.agent.ctx?.get?.<DshLlmRuntime>("llm")
              ?? (readyCtx.get !== undefined ? readyCtx.get<DshLlmRuntime>("llm") : readyCtx.llm);
            if (llm?.resolveCallConfig === undefined) throw new Error("dsmm explicit model selection requires the native LLM service");
            await llm.resolveCallConfig(applyModelRoute(downstream, manual.route), frame.signal);
            frame.signal.throwIfAborted();
            const generation = (lock?.generation ?? -1) + 1;
            lock = pinRoleRoute(frame.agent, identity, manual.route, [manual.route, ...fallbacks]);
            lock.manualSelectionSeq = manual.seq;
            lock.generation = generation;
            lockedAgents.add(frame.agent);
          }
          if (lock?.manualSelectionSeq !== undefined) {
            // An unchanged explicit intent must not undo a policy-authorized
            // fallback; a fresh native selection event re-admits above.
            return applyModelRoute(downstream, lock.route);
          }
          if (admitted !== undefined) return applyModelRoute(downstream, admitted);
          const accepted = persistedRoleRoute(frame, liveAlias ? undefined : primary, fallbacks, identity);
          if (lock !== undefined && accepted !== undefined && !sameModelRoute(accepted, lock.route)) {
            // An explicit already-committed native route change remains host-owned;
            // DSMM's pending current-frame route still has precedence above.
            lock.route = { ...accepted };
            lock.generation += 1;
            lock.startupSettled = true;
            lock.retries = 0;
            lock.rateLimits = 0;
          }
          if (lock === undefined) {
            const inherited = { provider: downstream.provider, model: downstream.model,
              ...(downstream.reasoningEffort === undefined ? {} : { reasoningEffort: downstream.reasoningEffort }) };
            const candidates = orderedModelRoutes([liveAlias ? inherited : primary ?? inherited, ...fallbacks]);
            const persisted = accepted;
            const llm = frame.agent.ctx?.get?.<DshLlmRuntime>("llm")
              ?? (readyCtx.get !== undefined ? readyCtx.get<DshLlmRuntime>("llm") : readyCtx.llm);
            const selected = persisted ?? (exactPolicy ? await selectInitialModelRoute(llm ?? {} as DshLlmRuntime, candidates, frame.signal) : inherited);
            frame.signal.throwIfAborted();
            lock = pinRoleRoute(frame.agent, identity, selected, candidates);
            if (persisted !== undefined) lock.startupSettled = true;
            lockedAgents.add(frame.agent);
          }
          downstream = applyModelRoute(downstream, lock.route);
          if (exactPolicy || lock.attempts > 0) return downstream;
        }
        // Ordinary roots belong to the native model tab, including its exact effort.
        if (ordinaryRoot) return downstream;
        // Named fallback efforts are native policy IDs, never legacy calibration inputs.
        if (fallbacks.some((fallback) => fallback.reasoningEffort !== undefined
          && sameModelRoute(fallback, downstream) && fallback.reasoningEffort === downstream.reasoningEffort)) return downstream;
        const route: DeepseekModelRoute | undefined = isDeepseekV4ProRoute(downstream) ? "v4-pro" : isDeepseekFlashRoute(downstream) ? "flash" : undefined;
        if (route === undefined) return downstream;
        const calibration = route === "flash" ? settings.deepseekFlashCalibration : settings.deepseekV4ProCalibration;
        if (calibration === "off") return downstream;

        const preset = resolveSelectedAgentPreset(frame.agent?.session);
        const inScope = active || isDsmmRoleId(preset);
        if (!inScope) return downstream;
        if (calibration === "auto" && downstream.reasoningEffort !== undefined) return downstream;

        const desired = desiredDeepseekEffort(settings, preset, route);
        let selected: string | undefined;
        try {
          const agentContext = (frame.agent as { ctx?: DshContext }).ctx;
          const llm = agentContext?.get?.<DshLlmRuntime>("llm")
            ?? (readyCtx.get !== undefined ? readyCtx.get<DshLlmRuntime>("llm") : readyCtx.llm);
          const modelInfo = await llm?.resolveModelInfo(downstream.provider, downstream.model, frame.signal);
          selected = selectAdvertisedEffort(desired, modelInfo?.reasoning);
        } catch {
          warnUnavailable(readyCtx, ctx, desired, `${downstream.provider}/${downstream.model}`);
          return downstream;
        }

        if (selected === undefined) {
          warnUnavailable(readyCtx, ctx, desired, `${downstream.provider}/${downstream.model}`);
          return downstream;
        }

        if (identity !== undefined) {
          const lock = roleRouteLock(frame.agent, identity);
          if (lock !== undefined) lock.route = { ...lock.route, reasoningEffort: selected };
        }
        return { ...downstream, reasoningEffort: selected };
      }, { prepend: true });
      disposeAgent = readyCtx.on("agent/disposed", ({ agent }: { agent: DshAgent }) => {
        lockedAgents.delete(agent);
        clearRoleRouteLock(agent);
      }, { global: true });
    } catch (error) {
      installedContexts.delete(readyCtx);
      if (typeof dispose === "function") dispose();
      if (typeof disposeAssembly === "function") disposeAssembly();
      throw error;
    }

    readyCtx.effect?.(() => () => {
      for (const agent of lockedAgents) clearRoleRouteLock(agent);
      lockedAgents.clear();
      installedContexts.delete(readyCtx);
      if (typeof disposeAgent === "function") disposeAgent();
      if (typeof disposeAssembly === "function") disposeAssembly();
      if (typeof dispose === "function") dispose();
    });
  };

  // Current DSH owns LLM services in Agent realms, invisible to Host injection.
  if (ctx.get !== undefined) {
    install(ctx);
    return;
  }

  if (ctx.inject !== undefined) {
    ctx.inject(["llm"], install);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(ctx, "llm") && Object.prototype.hasOwnProperty.call(ctx, "on")) install(ctx);
}

function warnUnavailable(readyCtx: DshContext, rootCtx: DshContext, desired: DeepseekReasoningEffort, modelRoute: string): void {
  try {
    (readyCtx.logger ?? rootCtx.logger)?.warn(`dsmm could not select advertised reasoning effort for ${modelRoute}; desired ${desired}`);
  } catch {
    // Warning emission is diagnostic-only and must not alter routing fail-open behavior.
  }
}
