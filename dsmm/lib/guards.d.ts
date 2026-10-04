import type { DshContext, DshPostToolDecision, DshPreToolDecision, DshToolExecution, DshToolExecutionResult } from "./dsh-types.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export declare const DSMM_GUARD_PREFIX = "[dsmm safety]";
export declare function truncateTextMiddle(text: string, maxBytes: number, toolName: string): string;
export declare function isSafetyScopeActive(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): boolean;
export declare function decidePreToolExecution(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): DshPreToolDecision | undefined;
export declare function decidePostToolExecution(exec: DshToolExecution, result: Readonly<DshToolExecutionResult>, decision: DshPostToolDecision, settings: DsmmSettings, controller: DeepworkModeController): DshPostToolDecision;
export declare function registerSafetyGuards(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void;
//# sourceMappingURL=guards.d.ts.map