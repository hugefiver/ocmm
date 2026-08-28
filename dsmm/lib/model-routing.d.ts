import type { DshContext, DshLlmCallConfig, DshModelReasoningInfo } from "./dsh-types.js";
import type { DeepseekDefaultReasoningEffort, DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export type DeepseekReasoningEffort = DeepseekDefaultReasoningEffort | "max";
export declare function isDeepseekV4ProRoute(config: Pick<DshLlmCallConfig, "provider" | "model">): boolean;
export declare function desiredDeepseekEffort(settings: DsmmSettings, preset?: string): DeepseekReasoningEffort;
export declare function selectAdvertisedEffort(desired: DeepseekReasoningEffort, reasoning: DshModelReasoningInfo | undefined): string | undefined;
export declare function registerModelRouting(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void;
//# sourceMappingURL=model-routing.d.ts.map