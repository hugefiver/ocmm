import type { Context } from "@deepseek-ai/cordis";
import type { DshContext } from "./dsh-types.js";
import { DsmmRolePolicy } from "./role-policy.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
/** Keep native controls on the frozen startup substrate, not desired-save reconciliation. */
export declare function registerNativeSubagentControls(ctx: Context): Promise<void>;
/** Published name retained; all native/headless Agents consume one admitted policy. */
export declare function registerHeadlessRoleTools(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter, policy?: DsmmRolePolicy): Promise<void>;
//# sourceMappingURL=role-subagents.d.ts.map