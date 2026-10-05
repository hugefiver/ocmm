export const DEFAULT_DSMM_RATE_LIMIT_POLICY = Object.freeze({
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    maxTotalDelayMs: 30000,
    switchAfterRateLimits: 3,
    maxSwitches: 2
});
export const DEFAULT_DSMM_RUNTIME_POLICY = Object.freeze({
    strategy: "startup-lock",
    rateLimit: DEFAULT_DSMM_RATE_LIMIT_POLICY
});
export const DSMM_RATE_LIMIT_BOUNDS = Object.freeze({
    maxRetries: Object.freeze([0, 10]),
    initialDelayMs: Object.freeze([0, 30000]),
    maxDelayMs: Object.freeze([0, 30000]),
    maxTotalDelayMs: Object.freeze([0, 120000]),
    switchAfterRateLimits: Object.freeze([1, 10]),
    maxSwitches: Object.freeze([0, 10])
});
export function normalizeRoutingStrategy(value) {
    if (value !== "startup-lock" && value !== "rate-limit-fallback") {
        throw new TypeError("dsmm strategy must be startup-lock or rate-limit-fallback");
    }
    return value;
}
export function normalizeRateLimitOverrides(value) {
    if (!isRecord(value))
        throw new TypeError("dsmm rateLimit must be an object");
    const result = {};
    for (const [field, raw] of Object.entries(value)) {
        if (!Object.hasOwn(DSMM_RATE_LIMIT_BOUNDS, field))
            throw new TypeError("dsmm rateLimit contains an unknown field");
        const [minimum, maximum] = DSMM_RATE_LIMIT_BOUNDS[field];
        if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < minimum || raw > maximum) {
            throw new TypeError(`dsmm rateLimit ${field} must be an integer from ${minimum} to ${maximum}`);
        }
        result[field] = raw;
    }
    return result;
}
export function normalizeRateLimitPolicy(value = undefined, defaults = DEFAULT_DSMM_RATE_LIMIT_POLICY) {
    return { ...defaults, ...(value === undefined ? {} : normalizeRateLimitOverrides(value)) };
}
export function normalizeRuntimePolicy(value = undefined) {
    if (value === undefined)
        return { strategy: "startup-lock", rateLimit: { ...DEFAULT_DSMM_RATE_LIMIT_POLICY } };
    if (!isRecord(value) || Object.keys(value).some((key) => key !== "strategy" && key !== "rateLimit")) {
        throw new TypeError("dsmm runtimePolicy must contain only strategy and rateLimit");
    }
    return {
        strategy: Object.hasOwn(value, "strategy") ? normalizeRoutingStrategy(value.strategy) : "startup-lock",
        rateLimit: normalizeRateLimitPolicy(Object.hasOwn(value, "rateLimit") ? normalizeRateLimitOverrides(value.rateLimit) : undefined)
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
const resolvedRoleRuntimePolicies = new WeakMap();
/** Resolve once per immutable settings admission; omission and explicit [] remain distinct. */
export function resolveRoleRuntimePolicy(settings, role) {
    let policies = resolvedRoleRuntimePolicies.get(settings);
    if (policies === undefined) {
        policies = new Map();
        resolvedRoleRuntimePolicies.set(settings, policies);
    }
    const existing = policies.get(role);
    if (existing !== undefined)
        return existing;
    const configured = role === undefined ? undefined : settings.roleRouting[role];
    const defaults = settings.runtimePolicy;
    const primary = configured?.primary === undefined ? undefined : Object.freeze({ ...configured.primary });
    const seen = new Set(primary === undefined ? [] : [JSON.stringify([primary.provider, primary.model])]);
    const fallbacks = [];
    for (const route of configured?.fallbackRoutes ?? settings.runtimeRecovery.fallbackRoutes) {
        const identity = JSON.stringify([route.provider, route.model]);
        if (seen.has(identity))
            continue;
        seen.add(identity);
        fallbacks.push(Object.freeze({ ...route }));
    }
    const policy = Object.freeze({
        strategy: configured?.strategy ?? defaults.strategy,
        rateLimit: Object.freeze(normalizeRateLimitPolicy(configured?.rateLimit, defaults.rateLimit)),
        ...(primary === undefined ? {} : { primary }),
        fallbackRoutes: Object.freeze(fallbacks),
        fallbackSource: configured?.fallbackRoutes === undefined ? "global" : "role"
    });
    policies.set(role, policy);
    return policy;
}
//# sourceMappingURL=routing-policy.js.map