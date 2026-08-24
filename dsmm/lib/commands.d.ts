import type { DshContext } from "./dsh-types.js";
import type { DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export interface DeepworkCommandInput {
    action: "on" | "off";
    message: string;
}
export declare function parseDeepworkCommandInput(rawInput: string): DeepworkCommandInput;
export declare function registerDeepworkCommand(readyCtx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void;
//# sourceMappingURL=commands.d.ts.map