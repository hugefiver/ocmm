import { AsyncLocalStorage } from "node:async_hooks";
import { parentAgentOptionsForDelegation, SubagentError } from "@deepseek-ai/dsh-subagent";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import { isDsmmRoleId } from "./roles.js";
import { freezeSettings, normalizeLevelOverride } from "./settings.js";
import { resolveRoleRuntimePolicy } from "./routing-policy.js";
import { selectInitialModelRoute } from "./role-routing.js";
const scoped = new AsyncLocalStorage();
const captured = new WeakMap();
const originalCaptures = new WeakMap();
export function duringRoleInvocation(parent, invocation, operation) {
    return scoped.run({ parent, invocation }, operation);
}
export function currentRoleInvocation(parent, target) {
    const current = scoped.getStore();
    return current?.parent === parent && current.invocation.target === target ? current.invocation : undefined;
}
export function bindRoleInvocation(agent, invocation, original) {
    captured.set(agent, invocation);
    if (original === undefined)
        originalCaptures.delete(agent);
    else
        originalCaptures.set(agent, original);
}
export function capturedRoleInvocation(agent) { return captured.get(agent); }
export function capturedOriginalRoleInvocation(agent) { return originalCaptures.get(agent)?.invocation; }
/** Complete selections replace model and effort together; effort-only selections narrow candidates. */
export async function resolveRoleInvocation(parent, target, settings, signal, options = {}, nativeOptions) {
    if (!isDsmmRoleId(target) || target === "dsmm-orchestrator")
        throw new SubagentError("Unknown DSMM delegation target", "UNAUTHORIZED");
    if (Object.keys(options).some(key => key !== "level" && key !== "route"))
        throw new SubagentError("Unknown DSMM invocation parameter", "UNSUPPORTED_CAPABILITY");
    const level = options.level ?? "normal";
    if (!["normal", "low", "high", "max"].includes(level))
        throw new SubagentError("Unsupported DSMM invocation level", "UNSUPPORTED_CAPABILITY");
    if (options.route !== undefined && !settings.subagents.allowRouteOverride)
        throw new SubagentError("DSMM invocation route override is not admitted", "UNAUTHORIZED");
    const inherited = parentAgentOptionsForDelegation(parent);
    if (inherited.provider === undefined || inherited.model === undefined)
        throw new Error("DSMM role delegation requires an inherited provider/model");
    let route = { provider: inherited.provider, model: inherited.model, ...(inherited.reasoningEffort === undefined ? {} : { reasoningEffort: inherited.reasoningEffort }) };
    let source = "inherited";
    const policy = resolveRoleRuntimePolicy(settings, target);
    if (policy.primary !== undefined) {
        route = { ...policy.primary };
        source = "primary";
    }
    let exactEffort = false;
    let fixed = false;
    let candidateEffort;
    const apply = (raw, nextSource) => {
        const override = normalizeLevelOverride(raw);
        if (override.provider !== undefined)
            route = { ...override };
        else {
            route = { ...route, reasoningEffort: override.reasoningEffort };
            candidateEffort = override.reasoningEffort;
        }
        exactEffort = override.reasoningEffort !== undefined;
        source = nextSource;
    };
    if (level !== "normal") {
        const override = settings.roleRouting[target]?.levels?.[level];
        if (override === undefined)
            throw new SubagentError("DSMM invocation level has no configured route", "UNSUPPORTED_CAPABILITY");
        apply(override, "level");
    }
    // Native host AgentOptions remain an explicit selection, not a model-facing permission grant.
    if (nativeOptions?.provider !== undefined || nativeOptions?.model !== undefined) {
        route = { provider: nativeOptions.provider ?? route.provider, model: nativeOptions.model ?? route.model,
            ...(nativeOptions.reasoningEffort === undefined ? {} : { reasoningEffort: nativeOptions.reasoningEffort }) };
        fixed = true;
        candidateEffort = undefined;
    }
    else if (nativeOptions?.reasoningEffort !== undefined) {
        route = { ...route, reasoningEffort: nativeOptions.reasoningEffort };
        candidateEffort = nativeOptions.reasoningEffort;
    }
    if (options.route !== undefined) {
        apply(options.route, "invocation-route");
        fixed = options.route.provider !== undefined;
    }
    const initialFallbacks = policy.fallbackRoutes.map(fallback => ({ ...fallback, ...(candidateEffort === undefined ? {} : { reasoningEffort: candidateEffort }) }));
    const initialCandidates = [route, ...fixed ? [] : initialFallbacks];
    const llm = parent.ctx.get("llm");
    if (llm === undefined)
        throw new Error("DSMM invocation requires the parent's native LLM service");
    const selected = await selectInitialModelRoute(llm, initialCandidates, signal);
    signal.throwIfAborted();
    const fallbackRoutes = options.route?.provider !== undefined ? [] : level === "normal" && options.route === undefined ? policy.fallbackRoutes : initialFallbacks;
    const candidates = [route, ...fallbackRoutes];
    return freezeSettings({ target, ...(options.level === undefined ? {} : { requestedLevel: options.level }), effectiveLevel: level,
        routeSource: source, initialRoute: selected, candidates, exactEffort,
        policy: { ...policy, primary: route, fallbackRoutes } });
}
export function invocationAgentOptions(invocation, options) {
    const route = invocation.initialRoute;
    return { ...options, ...route, reasoningEffort: route.reasoningEffort === undefined ? undefined : ReasoningEffortId(route.reasoningEffort) };
}
export function invocationView(invocation, label, mode, ids = {}) {
    return { role: invocation.target, label, level: invocation.effectiveLevel, routeSource: invocation.routeSource, route: { ...invocation.initialRoute }, mode, ...ids };
}
//# sourceMappingURL=role-invocation.js.map