import type { DshLlmCallConfig } from "./dsh-types.js";
import type { ToolSchema } from "@deepseek-ai/dsh-llm";
import type { SourceRoleContent } from "./prompt-content.js";
import type { DsmmSettings } from "./settings.js";
import type { DsmmInvocationView, DsmmRoleAvailabilityState, SubagentRuntimeAdmissionView } from "./profile-types.js";
import type { DsmmCallableEntry } from "./role-subagents.js";
import type { ChildAdmissionEvidenceView } from "./child-evidence.js";
export { SOURCE_ROLE_CATALOG, buildRolePersona } from "./prompt-content.js";
export type { SourceRoleContent } from "./prompt-content.js";
export declare const BASE_DEEPWORK_PROMPT: string;
export declare function promptModelVariants(role: string | undefined, model: string): string[];
export declare function roleModelCalibration(role: SourceRoleContent | undefined, model: string): string;
export declare const DEEPSEEK_V4_PRO_OVERLAY = "<dsmm-deepseek-v4-pro-calibration>\n\nDeepSeek V4 Pro calibration is active.\n\n- Treat complex coding, architecture, migration, debugging, and review tasks as deliberate reasoning tasks.\n- First classify the task and identify the evidence needed.\n- Use tools before making repository-specific or API-specific claims.\n- Runtime reasoning effort is enforced by `agent/request`, not this prompt.\n- Ordinary root model and effort stay under the native model picker. Explicit preflighted invocation effort takes precedence over calibration.\n- For other eligible child requests, `auto` preserves explicit upstream effort; `strict` uses the configured default only when the adapter advertises a supported effort. If none is advertised, leave the request unchanged.\n- Keep final answers concise and do not expose private chain-of-thought.\n- When tool calls are enabled through the provider, preserve the provider-required reasoning/tool-call continuity.\n\n</dsmm-deepseek-v4-pro-calibration>";
export declare const DEEPSEEK_FLASH_OVERLAY = "<dsmm-deepseek-flash-calibration>\n\nDeepSeek-V41-Flash applies only to the verified deepseek-official/deepseek-flash or deepseek-account/deepseek-flash routes. The host catalog and explicit user model choice are authoritative.\n\n- Keep work outcome-first and avoid procedural review or approval loops.\n- Runtime reasoning effort is chosen by the adapter only from the resolved model's advertised efforts. If the catalog advertises no reasoning efforts, leave the request unchanged.\n- Ordinary root model and effort stay native-owned; explicit preflighted invocation effort takes precedence. For other eligible child requests, auto preserves explicit upstream effort; strict uses only an advertised effort.\n- Do not assume max, high, temperature, or another model's capabilities. Do not claim model heterogeneity when all child roles use the same route.\n- Maintain tool-call continuity required by the provider and never reveal private reasoning.\n\n</dsmm-deepseek-flash-calibration>";
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
        nativeJobs?: boolean;
        /** Admitted creation of new continuable children, not existing-child delivery. */
        continuable?: boolean;
        /** Observed managed running/idle/same-ID cold delivery to existing continuable children under this Agent's authority. */
        managedChildDelivery?: boolean;
        /** Only set after the operator/session/epoch-gated user surface is wired. */
        foregroundHandoff?: {
            surface: string;
        };
        nativeBrowserPrompt?: {
            surface: string;
        };
    };
    childEvidence?: Readonly<ChildAdmissionEvidenceView>;
}
export declare function buildDsmmLocaleGuidance(settings: Pick<DsmmSettings, "locale">): string;
/** Register independently of the common-mode section, in the exact Agent scope. */
export declare function buildDsmmAgentGuidance(settings: DsmmSettings, observed: DsmmPromptObservation): string;
export declare function buildDeepworkPrompt(settings: DsmmSettings, options?: DeepworkPromptOptions): string;
//# sourceMappingURL=prompts.d.ts.map