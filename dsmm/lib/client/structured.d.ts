import type { DsmmRoleRoutingConfig } from "../settings.js";
import type { DsmmRateLimitPolicy, DsmmRuntimePolicySettings } from "../routing-policy.js";
export type JsonPath = (string | number)[];
export interface StructuredDocument {
    label?: string;
    settings: Record<string, unknown>;
    roleRouting: Record<string, DsmmRoleRoutingConfig>;
    runtimePolicy: {
        strategy?: DsmmRuntimePolicySettings["strategy"];
        rateLimit?: Partial<DsmmRateLimitPolicy>;
    };
}
/** Read-only projection. Malformed raw drafts cannot be rewritten by the form. */
export declare function structuredDocument(content: string): StructuredDocument | null;
/** Only the named path changes; comments/unrelated raw JSONC remain untouched. */
export declare function editStructuredPath(content: string, path: JsonPath, value: unknown): string | null;
export declare function moveFallback(content: string, role: string, from: number, to: number): string | null;
//# sourceMappingURL=structured.d.ts.map