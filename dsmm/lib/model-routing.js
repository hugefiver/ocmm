import { isDsmmRoleId } from "./roles.js";
import { applyModelRoute, clearRoleRouteLock, effectiveRoleFallbackRoutes, establishRolePolicy, latestNativeModelSelection, nativeModelSelectionWasAccepted, orderedModelRoutes, persistedRoleRoute, pinRoleRoute, roleRouteLock, selectInitialModelRoute, sameExactModelRoute, sameModelRoute, takeAdmittedRecoveryRoute } from "./role-routing.js";
import { resolveEffectiveDsmmRole, resolveSelectedAgentPreset } from "./session-scope.js";
import { childOwnedSessionEvents, sessionEvents } from "./session-scope.js";
import { isCurrentRecoveryStep } from "./recovery-policy.js";
export function isDeepseekV4ProRoute(config) {
    return config.provider.toLowerCase() === "deepseek-official" && config.model.toLowerCase() === "deepseek-v4-pro";
}
export function isDeepseekFlashRoute(config) {
    return ["deepseek-official", "deepseek-account"].includes(config.provider.toLowerCase())
        && config.model.toLowerCase() === "deepseek-flash";
}
export function desiredDeepseekEffort(settings, preset, route = "v4-pro") {
    const maxPresets = route === "flash" ? settings.deepseekFlashMaxReasoningPresets : settings.deepseekV4ProMaxReasoningPresets;
    return preset !== undefined && maxPresets.some((configuredPreset) => configuredPreset === preset)
        ? "max"
        : route === "flash" ? settings.deepseekFlashDefaultReasoningEffort : settings.deepseekV4ProDefaultReasoningEffort;
}
export function selectAdvertisedEffort(desired, reasoning) {
    if (!reasoning)
        return undefined;
    const advertised = new Set(reasoning.efforts.map((effort) => effort.id));
    const fallback = reasoning.defaultEffort !== undefined && advertised.has(reasoning.defaultEffort) ? reasoning.defaultEffort : undefined;
    if (desired === "max") {
        if (advertised.has("max"))
            return "max";
        if (advertised.has("high"))
            return "high";
        return fallback;
    }
    return advertised.has(desired) ? desired : fallback;
}
function hasLiveRuntimeOwner(ctx, agent) {
    const agents = ctx.get?.("agents");
    return agent.id !== undefined && agents !== undefined
        && agents.list().some((parent) => parent !== agent && agents.isOwnedBy(agent.id, parent));
}
export function registerModelRouting(ctx, controller, getSettings) {
    const installedContexts = new WeakSet();
    const install = (readyCtx) => {
        if (installedContexts.has(readyCtx) || readyCtx.on === undefined)
            return;
        installedContexts.add(readyCtx);
        const lockedAgents = new Set();
        const assembledSelections = new WeakMap();
        let dispose;
        let disposeAgent;
        let disposeAssembly;
        try {
            disposeAssembly = readyCtx.on("system-prompt/assemble", async (_assembly, context, next) => {
                if (context.agent !== undefined && context.signal !== undefined) {
                    assembledSelections.set(context.agent, { signal: context.signal, intent: latestNativeModelSelection(context.agent) });
                }
                return next();
            }, { prepend: true });
            dispose = readyCtx.on("agent/request", async (frame, next) => {
                let downstream = await next();
                if (frame.signal.aborted)
                    return downstream;
                const settings = getSettings(frame.agent);
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
                    if (manual !== undefined && lock?.manualSelectionSeq !== manual.seq
                        && (sameExactModelRoute(downstream, manual.route) || nativeModelSelectionWasAccepted(frame.agent, manual))) {
                        const llm = frame.agent.ctx?.get?.("llm")
                            ?? (readyCtx.get !== undefined ? readyCtx.get("llm") : readyCtx.llm);
                        if (llm?.resolveCallConfig === undefined)
                            throw new Error("dsmm explicit model selection requires the native LLM service");
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
                    if (admitted !== undefined)
                        return applyModelRoute(downstream, admitted);
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
                        const llm = frame.agent.ctx?.get?.("llm")
                            ?? (readyCtx.get !== undefined ? readyCtx.get("llm") : readyCtx.llm);
                        const selected = persisted ?? (exactPolicy ? await selectInitialModelRoute(llm ?? {}, candidates, frame.signal) : inherited);
                        frame.signal.throwIfAborted();
                        lock = pinRoleRoute(frame.agent, identity, selected, candidates);
                        if (persisted !== undefined)
                            lock.startupSettled = true;
                        lockedAgents.add(frame.agent);
                    }
                    downstream = applyModelRoute(downstream, lock.route);
                    if (exactPolicy || lock.attempts > 0)
                        return downstream;
                }
                // Named fallback efforts are native policy IDs, never legacy calibration inputs.
                if (fallbacks.some((fallback) => fallback.reasoningEffort !== undefined
                    && sameModelRoute(fallback, downstream) && fallback.reasoningEffort === downstream.reasoningEffort))
                    return downstream;
                const route = isDeepseekV4ProRoute(downstream) ? "v4-pro" : isDeepseekFlashRoute(downstream) ? "flash" : undefined;
                if (route === undefined)
                    return downstream;
                const calibration = route === "flash" ? settings.deepseekFlashCalibration : settings.deepseekV4ProCalibration;
                if (calibration === "off")
                    return downstream;
                const preset = resolveSelectedAgentPreset(frame.agent?.session);
                const inScope = active || isDsmmRoleId(preset);
                if (!inScope)
                    return downstream;
                if (calibration === "auto" && downstream.reasoningEffort !== undefined)
                    return downstream;
                const desired = desiredDeepseekEffort(settings, preset, route);
                let selected;
                try {
                    const agentContext = frame.agent.ctx;
                    const llm = agentContext?.get?.("llm")
                        ?? (readyCtx.get !== undefined ? readyCtx.get("llm") : readyCtx.llm);
                    const modelInfo = await llm?.resolveModelInfo(downstream.provider, downstream.model, frame.signal);
                    selected = selectAdvertisedEffort(desired, modelInfo?.reasoning);
                }
                catch {
                    warnUnavailable(readyCtx, ctx, desired, `${downstream.provider}/${downstream.model}`);
                    return downstream;
                }
                if (selected === undefined) {
                    warnUnavailable(readyCtx, ctx, desired, `${downstream.provider}/${downstream.model}`);
                    return downstream;
                }
                if (identity !== undefined) {
                    const lock = roleRouteLock(frame.agent, identity);
                    if (lock !== undefined)
                        lock.route = { ...lock.route, reasoningEffort: selected };
                }
                return { ...downstream, reasoningEffort: selected };
            }, { prepend: true });
            disposeAgent = readyCtx.on("agent/disposed", ({ agent }) => {
                lockedAgents.delete(agent);
                clearRoleRouteLock(agent);
            }, { global: true });
        }
        catch (error) {
            installedContexts.delete(readyCtx);
            if (typeof dispose === "function")
                dispose();
            if (typeof disposeAssembly === "function")
                disposeAssembly();
            throw error;
        }
        readyCtx.effect?.(() => () => {
            for (const agent of lockedAgents)
                clearRoleRouteLock(agent);
            lockedAgents.clear();
            installedContexts.delete(readyCtx);
            if (typeof disposeAgent === "function")
                disposeAgent();
            if (typeof disposeAssembly === "function")
                disposeAssembly();
            if (typeof dispose === "function")
                dispose();
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
    if (Object.prototype.hasOwnProperty.call(ctx, "llm") && Object.prototype.hasOwnProperty.call(ctx, "on"))
        install(ctx);
}
function warnUnavailable(readyCtx, rootCtx, desired, modelRoute) {
    try {
        (readyCtx.logger ?? rootCtx.logger)?.warn(`dsmm could not select advertised reasoning effort for ${modelRoute}; desired ${desired}`);
    }
    catch {
        // Warning emission is diagnostic-only and must not alter routing fail-open behavior.
    }
}
//# sourceMappingURL=model-routing.js.map