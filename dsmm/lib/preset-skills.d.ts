import type { DshAgent, DshContext } from "./dsh-types.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
/** Admission owns installation; mode changes only invalidate this Agent's lazy provider. */
export declare function registerAgentSkills(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter, agent: DshAgent, lifetime: AbortSignal): void;
//# sourceMappingURL=preset-skills.d.ts.map