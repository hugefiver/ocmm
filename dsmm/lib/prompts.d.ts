import type { DshLlmCallConfig } from "./dsh-types.js";
import type { SourceRoleContent } from "./prompt-content.js";
import type { DsmmSettings } from "./settings.js";
export { SOURCE_ROLE_CATALOG, buildRolePersona } from "./prompt-content.js";
export type { SourceRoleContent } from "./prompt-content.js";
export declare const BASE_DEEPWORK_PROMPT: string;
export declare function promptModelVariants(role: string | undefined, model: string): string[];
export declare function roleModelCalibration(role: SourceRoleContent | undefined, model: string): string;
export declare const DEEPSEEK_V4_PRO_OVERLAY = "<dsmm-deepseek-v4-pro-calibration>\n\nDeepSeek V4 Pro calibration is active.\n\n- Treat complex coding, architecture, migration, debugging, and review tasks as deliberate reasoning tasks.\n- First classify the task and identify the evidence needed.\n- Use tools before making repository-specific or API-specific claims.\n- Runtime reasoning effort is enforced by `agent/request`, not this prompt.\n- In `auto` calibration, explicit upstream reasoning effort is preserved; `strict` overrides it with computed policy.\n- Only adapter-advertised reasoning efforts are emitted; `max` is selected only for configured DW presets.\n- Keep final answers concise and do not expose private chain-of-thought.\n- When tool calls are enabled through the provider, preserve the provider-required reasoning/tool-call continuity.\n\n</dsmm-deepseek-v4-pro-calibration>";
export declare const DEEPSEEK_FLASH_OVERLAY = "<dsmm-deepseek-flash-calibration>\n\nDeepSeek-V41-Flash applies only to the verified deepseek-official/deepseek-flash or deepseek-account/deepseek-flash routes. The host catalog and explicit user model choice are authoritative.\n\n- Keep work outcome-first and avoid procedural review or approval loops.\n- Runtime reasoning effort is chosen by the adapter only from the resolved model's advertised efforts. If the catalog advertises no reasoning efforts, leave the request unchanged.\n- Auto preserves explicit upstream effort; strict overrides it only with an advertised effort.\n- Do not assume max, high, temperature, or another model's capabilities. Do not claim model heterogeneity when all child roles use the same route.\n- Maintain tool-call continuity required by the provider and never reveal private reasoning.\n\n</dsmm-deepseek-flash-calibration>";
export interface DeepworkPromptOptions {
    route?: Pick<DshLlmCallConfig, "provider" | "model">;
    selectedPreset?: string;
    /** Existing effective-role resolver supplies content identity, not route authority. */
    roleId?: string | null;
    overrideSection?: string;
}
export declare function buildDeepworkPrompt(settings: DsmmSettings, options?: DeepworkPromptOptions): string;
//# sourceMappingURL=prompts.d.ts.map