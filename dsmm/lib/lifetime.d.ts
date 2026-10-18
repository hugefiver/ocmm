import type { Context } from "@deepseek-ai/cordis";
/** Revoke synchronously when an owning scope begins unloading, before async cleanup. */
export declare function scopeLifetime(scope: Context, label: string, revoke: () => void, install?: () => void): () => void;
//# sourceMappingURL=lifetime.d.ts.map