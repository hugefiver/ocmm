import type { DshLlmCallConfig } from "./dsh-types.js";
import type { ToolSchema } from "@deepseek-ai/dsh-llm";
import type { SourceRoleContent } from "./prompt-content.js";
import type { DsmmSettings } from "./settings.js";
import type { DsmmInvocationView, DsmmRoleAvailabilityState, SubagentRuntimeAdmissionView } from "./profile-types.js";
import type { DsmmCallableEntry } from "./role-subagents.js";
export { SOURCE_ROLE_CATALOG, buildRolePersona } from "./prompt-content.js";
export type { SourceRoleContent } from "./prompt-content.js";
export declare const BASE_DEEPWORK_PROMPT: string;
export declare function promptModelVariants(role: string | undefined, model: string): string[];
export declare function roleModelCalibration(role: SourceRoleContent | undefined, model: string): string;
export interface DeepworkPromptOptions {
    route?: Pick<DshLlmCallConfig, "provider" | "model">;
    selectedPreset?: string;
    /** Existing effective-role resolver supplies content identity, not route authority. */
    roleId?: string | null;
    overrideSection?: string;
}
/** Host observations for this exact admitted Agent, not editor drafts or preset metadata. */
export interface DsmmPromptObservation {
    scope: "root" | "child";
    delegation: readonly DsmmCallableEntry[];
    /** Already policy-filtered native schemas, including controls that really are callable. */
    tools: readonly ToolSchema[];
    roleAvailability?: readonly DsmmRoleAvailabilityState[];
    invocation?: {
        view: Readonly<DsmmInvocationView>;
        routeKind: "initial" | "actual";
    };
    runtimeAdmission?: Readonly<SubagentRuntimeAdmissionView>;
    capabilities?: {
        continuable?: boolean;
        /** Existing exact live child delivery; never a cold-recovery claim. */
        nativeChildDelivery?: boolean;
        nativeBrowserPrompt?: {
            surface: string;
        };
    };
}
export declare function buildDsmmLocaleGuidance(settings: Pick<DsmmSettings, "locale">): string;
/** Register independently of the common-mode section, in the exact Agent scope. */
export declare function buildDsmmAgentGuidance(settings: DsmmSettings, observed: DsmmPromptObservation): string;
export declare function buildDeepworkPrompt(settings: DsmmSettings, options?: DeepworkPromptOptions): string;
//# sourceMappingURL=prompts.d.ts.map