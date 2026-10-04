import type { DshContext } from "./dsh-types.js";
import { DSMM_STATUS_COMMAND } from "./settings.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export { DSMM_STATUS_COMMAND };
export interface DeepworkCommandInput {
    action: "on" | "off";
    message: string;
}
export declare function parseDeepworkCommandInput(rawInput: string): DeepworkCommandInput;
export declare function registerDeepworkCommand(readyCtx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void;
export declare function registerDsmmStatusCommand(readyCtx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void;
//# sourceMappingURL=commands.d.ts.map