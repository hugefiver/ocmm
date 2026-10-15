export declare class PermissionRefusal extends Error {
    readonly code: "not-owned" | "stale" | "cancelled" | "unavailable" | "validation" | "not-found" | "scope-unavailable" | "replayed" | "denied";
    constructor(code: "not-owned" | "stale" | "cancelled" | "unavailable" | "validation" | "not-found" | "scope-unavailable" | "replayed" | "denied");
}
/** A policy lifetime may end while the native answerer is still waiting. */
export declare function permissionOutcome<T>(answer: () => Promise<T>, signal: AbortSignal, cancelled: T): Promise<T>;
//# sourceMappingURL=permission-errors.d.ts.map