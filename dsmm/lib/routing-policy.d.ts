/** Browser-safe route policy grammar shared by settings, profiles and native UI. */
import type { DsmmRoleId } from "./roles.js";
import type { DsmmResolvedRoleRuntimePolicy, DsmmSettings } from "./settings.js";
export type DsmmRoutingStrategy = "startup-lock" | "rate-limit-fallback";
export interface DsmmRateLimitPolicy {
    /** Same-route requests after the first attempt. */
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    maxTotalDelayMs: number;
    /** Distinct failed native attempts, including the first attempt. */
    switchAfterRateLimits: number;
    maxSwitches: number;
}
export interface DsmmRuntimePolicyConfig {
    strategy?: DsmmRoutingStrategy;
    rateLimit?: Partial<DsmmRateLimitPolicy>;
}
export interface DsmmRuntimePolicySettings {
    strategy: DsmmRoutingStrategy;
    rateLimit: DsmmRateLimitPolicy;
}
export declare const DEFAULT_DSMM_RATE_LIMIT_POLICY: Readonly<DsmmRateLimitPolicy>;
export declare const DEFAULT_DSMM_RUNTIME_POLICY: Readonly<DsmmRuntimePolicySettings>;
export declare const DSMM_RATE_LIMIT_BOUNDS: Readonly<Record<keyof DsmmRateLimitPolicy, readonly [number, number]>>;
export declare function normalizeRoutingStrategy(value: unknown): DsmmRoutingStrategy;
export declare function normalizeRateLimitOverrides(value: unknown): Partial<DsmmRateLimitPolicy>;
export declare function normalizeRateLimitPolicy(value?: unknown, defaults?: Readonly<DsmmRateLimitPolicy>): DsmmRateLimitPolicy;
export declare function normalizeRuntimePolicy(value?: unknown): DsmmRuntimePolicySettings;
/** Resolve once per immutable settings admission; omission and explicit [] remain distinct. */
export declare function resolveRoleRuntimePolicy(settings: DsmmSettings, role?: DsmmRoleId): DsmmResolvedRoleRuntimePolicy;
//# sourceMappingURL=routing-policy.d.ts.map