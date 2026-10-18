import type { DshAgent, DshContext } from "./dsh-types.js";
import type { Config } from "./index.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
/** The admission installer owns scope selection; assembly reads the immutable Agent configuration. */
export declare function registerDeepworkPrompt(readyCtx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter, config: Config, agent: DshAgent, lifetime: AbortSignal): void;
//# sourceMappingURL=mode.d.ts.map