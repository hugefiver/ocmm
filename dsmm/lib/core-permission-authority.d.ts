import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { PermissionControlCollaborators } from "./permission-control.js";
import type { DsmmRolePolicy } from "./role-policy.js";
import type { DsmmSettingsGetter } from "./settings.js";
export interface CorePermissionAuthorityOptions {
    readonly getSettings: DsmmSettingsGetter;
    readonly rolePolicy: DsmmRolePolicy;
    /** Borrowed actual Core lifetime, in addition to the calling fiber's lifetime. */
    readonly signal: AbortSignal;
}
export interface CorePermissionAuthority {
    readonly authority: PermissionControlCollaborators;
    assertWritable(root: Agent): void;
}
/** Live Core admissions and native realm facts; the calling fiber owns every observer. */
export declare function createCorePermissionAuthority(ctx: Context, options: CorePermissionAuthorityOptions): CorePermissionAuthority;
//# sourceMappingURL=core-permission-authority.d.ts.map