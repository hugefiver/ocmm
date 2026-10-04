import type { DshContext } from "./dsh-types.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
/** The DSH headless runner never mounts Agent presets; give it role-specific native tools. */
export declare function registerHeadlessRoleTools(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void;
//# sourceMappingURL=role-subagents.d.ts.map