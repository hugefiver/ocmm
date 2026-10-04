import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { classifyRecoveryFailure, foldAttemptedRecoveryRoutes, foldDurableRecoveryWork, isCurrentRecoveryStep, selectFallbackRoute } from "./recovery-policy.js";
import { isDsmmRoleId } from "./roles.js";
import { applyModelRoute, effectiveRoleFallbackRoutes, recordAdmittedRecoveryRoute, rolePolicyIdentity, sameModelRoute } from "./role-routing.js";
import { childOwnedSessionEvents, resolveEffectiveDsmmRole, resolveSelectedAgentPreset, sessionEvents } from "./session-scope.js";
const installedContexts = new WeakSet();
const RECOVERY_WARNING = "dsmm runtime recovery could not evaluate fallback; preserving the host request-error decision";
const CONTINUATION_WARNING = "dsmm runtime recovery continuation steering failed for turn";
function warnSafely(ctx, message) {
    try {
        ctx.logger?.warn(message);
    }
    catch { }
}
function recoveryEvents(agent) {
    return agent.session.header?.origin === "subagent" ? childOwnedSessionEvents(agent.session) : sessionEvents(agent.session);
}
export function registerRuntimeRecovery(ctx, controller, getSettings) {
    if (installedContexts.has(ctx) || ctx.on === undefined)
        return;
    installedContexts.add(ctx);
    let pendingByAgent = new WeakMap();
    let reservedByAgent = new WeakMap();
    let continuationsByAgent = new WeakMap();
    let disposeRequest;
    let disposeRequestError;
    let disposeTurnStopping;
    const reset = () => {
        const request = disposeRequest;
        const requestError = disposeRequestError;
        const turnStopping = disposeTurnStopping;
        disposeRequest = undefined;
        disposeRequestError = undefined;
        disposeTurnStopping = undefined;
        pendingByAgent = new WeakMap();
        reservedByAgent = new WeakMap();
        continuationsByAgent = new WeakMap();
        installedContexts.delete(ctx);
        if (typeof turnStopping === "function")
            turnStopping();
        if (typeof requestError === "function")
            requestError();
        if (typeof request === "function")
            request();
    };
    try {
        disposeRequest = ctx.on("agent/request", async (frame, next) => {
            const downstream = await next();
            const pending = pendingByAgent.get(frame.agent);
            if (pending === undefined)
                return downstream;
            if (frame.signal.aborted || !isCurrentRecoveryStep(recoveryEvents(frame.agent), pending.turn, pending.step)) {
                pendingByAgent.delete(frame.agent);
                return downstream;
            }
            if (pending.turn !== frame.turn || pending.step !== frame.step)
                return downstream;
            if (pending.policy !== undefined) {
                const settings = getSettings();
                const role = resolveEffectiveDsmmRole(frame.agent, settings, controller.active(frame.agent, settings.defaultActive));
                if (role !== pending.role || rolePolicyIdentity(settings, role) !== pending.policy) {
                    pendingByAgent.delete(frame.agent);
                    reservedByAgent.delete(frame.agent);
                    return downstream;
                }
            }
            const reserved = reservedByAgent.get(frame.agent);
            const accepted = frame.agent.session.requestHeader?.()?.config;
            if (reserved !== undefined && accepted !== undefined && !sameModelRoute(accepted, reserved.route) && !sameModelRoute(accepted, pending.route)) {
                pendingByAgent.delete(frame.agent);
                return downstream;
            }
            pendingByAgent.delete(frame.agent);
            recordAdmittedRecoveryRoute(frame, pending.route);
            return applyModelRoute(downstream, pending.route);
        }, { prepend: true });
        disposeRequestError = ctx.on("agent/request-error", async (frame, next) => {
            const downstream = await next();
            if (downstream?.kind === "retry") {
                pendingByAgent.delete(frame.agent);
                return downstream;
            }
            try {
                const settings = getSettings();
                if (!settings.runtimeRecovery.enabled || frame.signal.aborted
                    || !isCurrentRecoveryStep(recoveryEvents(frame.agent), frame.turn, frame.step))
                    return downstream;
                const preset = resolveSelectedAgentPreset(frame.agent.session);
                const role = resolveEffectiveDsmmRole(frame.agent, settings, controller.active(frame.agent, settings.defaultActive));
                const inScope = role !== undefined || controller.active(frame.agent, settings.defaultActive)
                    || (frame.agent.session.header?.origin !== "subagent" && isDsmmRoleId(preset) && settings.roles[preset]);
                if (!inScope || classifyRecoveryFailure(frame.failure, settings.runtimeRecovery).kind !== "retryable")
                    return downstream;
                const header = frame.agent.session.requestHeader?.();
                if (header === undefined || header.config.provider !== frame.provider)
                    return downstream;
                const policy = rolePolicyIdentity(settings, role);
                const reserved = reservedByAgent.get(frame.agent);
                if (reserved?.turn === frame.turn && reserved.step === frame.step
                    && reserved.policy === policy
                    && reserved.route.provider === header.config.provider && reserved.route.model === header.config.model)
                    return downstream;
                const attemptedRoutes = foldAttemptedRecoveryRoutes(recoveryEvents(frame.agent), frame.turn, frame.step);
                const lastAttemptedRoute = attemptedRoutes.at(-1);
                if (lastAttemptedRoute === undefined
                    || lastAttemptedRoute.provider !== header.config.provider
                    || lastAttemptedRoute.model !== header.config.model)
                    return downstream;
                const route = selectFallbackRoute({
                    failedRoute: { provider: header.config.provider, model: header.config.model },
                    attemptedRoutes,
                    fallbackRoutes: effectiveRoleFallbackRoutes(settings, role),
                    maxFallbackAttempts: settings.runtimeRecovery.maxFallbackAttempts
                });
                if (route === undefined)
                    return downstream;
                reservedByAgent.set(frame.agent, {
                    turn: frame.turn, step: frame.step,
                    route: { provider: header.config.provider, model: header.config.model }, role, policy
                });
                pendingByAgent.set(frame.agent, { turn: frame.turn, step: frame.step, route, role, policy });
                return { kind: "retry" };
            }
            catch {
                warnSafely(ctx, RECOVERY_WARNING);
                return downstream;
            }
        }, { prepend: true });
        disposeTurnStopping = ctx.on("agent/turn-stopping", async (frame) => {
            try {
                const settings = getSettings();
                const continuation = settings.runtimeRecovery.idleContinuation;
                if (!settings.runtimeRecovery.enabled || !continuation.enabled || frame.signal.aborted)
                    return;
                const preset = resolveSelectedAgentPreset(frame.agent.session);
                const inScope = controller.active(frame.agent, settings.defaultActive) || isDsmmRoleId(preset);
                if (!inScope || typeof frame.agent.steer !== "function")
                    return;
                const work = foldDurableRecoveryWork(sessionEvents(frame.agent.session));
                if (!work.incompleteTodo && !work.activeGoal)
                    return;
                const cap = continuation.maxContinuations;
                if (cap <= 0)
                    return;
                const previous = continuationsByAgent.get(frame.agent);
                const count = previous?.turn === frame.turn ? previous.count : 0;
                if (count >= cap)
                    return;
                continuationsByAgent.set(frame.agent, { turn: frame.turn, count: count + 1 });
                await frame.agent.steer(createUserMessage({
                    content: [{ type: "text", text: continuation.prompt }],
                    source: { kind: "user" }
                }));
            }
            catch {
                warnSafely(ctx, `${CONTINUATION_WARNING} ${frame.turn}`);
            }
        });
        ctx.effect?.(() => () => {
            reset();
        });
    }
    catch (error) {
        reset();
        throw error;
    }
}
//# sourceMappingURL=runtime-recovery.js.map