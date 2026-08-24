import type { DshContext } from "./dsh-types.js";
import type { DsmmPluginConfig } from "./settings.js";
export declare const name = "dsmm";
export declare const inject: readonly ["systemPrompt"];
export type Config = DsmmPluginConfig;
export declare const Config: import("@deepseek-ai/schemastery").default<DsmmPluginConfig>;
export type { DeepworkSessionEventMap } from "./dsh-events.js";
export type { DsmmRoleDefinition, DsmmRoleId } from "./roles.js";
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "./guards.js";
export { DEFAULT_DSMM_LSP_SETTINGS, DSMM_LSP_SERVER_NAME, DSMM_LSP_TOOL_NAMES, parseLspSmokeCommand, publicLspToolName, renderLspMcpPatch, resolveLspSettings, toDshMcpClientConfig } from "./lsp.js";
export type { DshMcpStdioConfig, DsmmLspSettings, DsmmLspToolName } from "./lsp.js";
export { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, MVP_SKILL_NAMES, isRoleEnabled, resolveConfig, registerSettings } from "./settings.js";
export type { DsmmFinalReviewPolicy, DsmmGitWritePolicy, DsmmGuardScope, DsmmGuardSettings, DsmmPluginConfig, DsmmSettings, DsmmSkillName, DsmmWorkflowSettings, MvpSkillName } from "./settings.js";
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";
export declare function apply(ctx: DshContext, config?: Config): void;
export default apply;
//# sourceMappingURL=index.d.ts.map