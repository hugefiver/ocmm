export type RouteJson = null | boolean | number | string | RouteJson[] | {
    [key: string]: RouteJson;
};
export type ModelRouteJson = {
    provider: string;
    model: string;
    reasoningEffort?: string;
} & {
    [key: string]: RouteJson;
};
export declare function validateModelRouteFieldName(key: string): void;
/** Copies only lossless JSON, without evaluating getters or accepting prototype keys. */
export declare function copyRouteJson<T>(input: T): T;
/** Sparse deployment routes validate present fields; identity is required on complete values. */
export declare function normalizeModelRouteJson(input: unknown, sparse?: boolean, allowIdentityWhitespace?: boolean): ModelRouteJson;
/** Stable complete-value identity; not a replacement for legacy capture or role-pin hashes. */
export declare function canonicalModelRouteJson(input: unknown): string;
export declare function sameModelRouteJson(left: unknown, right: unknown): boolean;
//# sourceMappingURL=route-json.d.ts.map