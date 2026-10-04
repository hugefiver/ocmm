import { createHash } from "node:crypto";
import { isDsmmRoleId } from "./roles.js";
import { isCurrentRecoveryStep } from "./recovery-policy.js";
import { childOwnedSessionEvents, sessionEvents } from "./session-scope.js";
const admittedRecoveryRoutes = new WeakMap();
export const DSMM_ROLE_POLICY_EVENT = "dsmm/role-policy";
export function rolePolicyIdentity(settings, role) {
    if (role === undefined)
        return undefined;
    const policy = settings.roleRouting[role];
    if (policy?.primary === undefined && policy?.fallbackRoutes === undefined)
        return undefined;
    return createHash("sha256").update(JSON.stringify({
        version: 1, role, primary: policy.primary === undefined ? null : canonicalRoute(policy.primary),
        fallbackSource: policy.fallbackRoutes === undefined ? "global" : "role",
        fallbackRoutes: (policy.fallbackRoutes ?? settings.runtimeRecovery.fallbackRoutes).map(canonicalRoute),
        enabled: settings.runtimeRecovery.enabled
    })).digest("hex");
}
function canonicalRoute(route) {
    return { provider: route.provider, model: route.model, ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) };
}
function policyEvents(frame) {
    const session = frame.agent.session;
    return session.header?.origin === "subagent" ? childOwnedSessionEvents(session) : sessionEvents(session);
}
function isPresetBoundary(frame, event) {
    return frame.agent.session.header?.origin !== "subagent" && event.type === "agent-preset/selected"
        && isRecord(event.data) && typeof event.data.agentPreset === "string";
}
function readPolicyMarker(event) {
    if (event.type !== DSMM_ROLE_POLICY_EVENT)
        return undefined;
    const data = event.data;
    if (!isRecord(data) || data.version !== 1)
        return undefined;
    if (Object.keys(data).length !== 3 || !isDsmmRoleId(data.role)
        || (data.policy !== null && (typeof data.policy !== "string" || !/^[a-f0-9]{64}$/u.test(data.policy)))) {
        throw new TypeError("dsmm role-policy marker is malformed");
    }
    return { role: data.role, policy: data.policy };
}
/** Native custom events are model-hidden log facts, retained across surface compaction. */
export async function establishRolePolicy(frame, settings, role) {
    const identity = rolePolicyIdentity(settings, role);
    if (frame.signal.aborted)
        return identity;
    let latest;
    const events = policyEvents(frame);
    for (const event of events) {
        if (isPresetBoundary(frame, event))
            latest = undefined;
        else if (event.type === DSMM_ROLE_POLICY_EVENT)
            latest = readPolicyMarker(event);
    }
    if (frame.signal.aborted || !isCurrentRecoveryStep(events, frame.turn, frame.step))
        return identity;
    if (identity === undefined || role === undefined) {
        if (latest !== undefined && latest.policy !== null) {
            await frame.agent.session.append(DSMM_ROLE_POLICY_EVENT, { version: 1, role: latest.role, policy: null });
        }
        return undefined;
    }
    if (latest?.role !== role || latest.policy !== identity) {
        await frame.agent.session.append(DSMM_ROLE_POLICY_EVENT, { version: 1, role, policy: identity });
    }
    return identity;
}
export function recordAdmittedRecoveryRoute(frame, route) {
    admittedRecoveryRoutes.set(frame, { ...route });
}
export function takeAdmittedRecoveryRoute(frame) {
    const route = admittedRecoveryRoutes.get(frame);
    admittedRecoveryRoutes.delete(frame);
    return route;
}
export function effectiveRoleFallbackRoutes(settings, role) {
    if (!settings.runtimeRecovery.enabled)
        return [];
    return role === undefined ? settings.runtimeRecovery.fallbackRoutes
        : settings.roleRouting[role]?.fallbackRoutes ?? settings.runtimeRecovery.fallbackRoutes;
}
export function applyModelRoute(config, route) {
    const { reasoningEffort: _inheritedEffort, ...preserved } = config;
    return { ...preserved, ...route };
}
export function sameModelRoute(left, right) {
    return left.provider === right.provider && left.model === right.model;
}
/** Accepted post-policy route changes are durable host/recovery ownership, not a new primary request. */
export function persistedRoleRoute(frame, primary, fallbacks = [], identity) {
    const events = policyEvents(frame);
    let matchingPolicy = false;
    let sawPrimary = false;
    let initial;
    let sawChange = false;
    let selected;
    for (const event of events) {
        if (isPresetBoundary(frame, event) || event.type === DSMM_ROLE_POLICY_EVENT) {
            matchingPolicy = event.type === DSMM_ROLE_POLICY_EVENT && identity !== undefined && readPolicyMarker(event)?.policy === identity;
            sawPrimary = false;
            initial = undefined;
            sawChange = false;
            selected = undefined;
            continue;
        }
        if (!matchingPolicy)
            continue;
        if (event.type !== "request/header" || !isRecord(event.data)
            || !["initial", "resume", "change", "series"].includes(String(event.data.reason)) || !("header" in event.data))
            continue;
        const header = event.data.header;
        if (!isRecord(header) || !isRecord(header.config))
            continue;
        const config = header.config;
        if (typeof config?.provider !== "string" || config.provider.trim() === ""
            || typeof config.model !== "string" || config.model.trim() === "")
            continue;
        initial ??= config;
        if (!sameModelRoute(config, initial))
            sawChange = true;
        if (primary !== undefined && sameModelRoute(config, primary))
            sawPrimary = true;
        else if (primary === undefined ? sawChange : sawPrimary)
            selected = {
                provider: config.provider, model: config.model,
                ...(typeof config.reasoningEffort === "string" && !adapterDefaultEffort(header) ? { reasoningEffort: config.reasoningEffort } : {})
            };
        if (primary !== undefined && sameModelRoute(config, primary))
            selected = undefined;
    }
    // A configured fallback remains exact after its adapter/default header is
    // persisted. A later non-chain durable host route remains host-owned instead.
    return selected === undefined ? undefined : fallbacks.find((route) => sameModelRoute(route, selected)) ?? selected;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function adapterDefaultEffort(header) {
    if (!("adapterDefaults" in header) || typeof header.adapterDefaults !== "object" || header.adapterDefaults === null)
        return false;
    return "reasoningEffort" in header.adapterDefaults && header.adapterDefaults.reasoningEffort === true;
}
//# sourceMappingURL=role-routing.js.map