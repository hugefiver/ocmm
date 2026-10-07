import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
import type { DsmmSkillName } from "./skills.js";
import type { DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export declare const name = "dsmm/preset-skills";
export declare const inject: readonly [];
export interface PresetSkillsConfig {
    skills?: DsmmSkillName[];
}
export declare const Config: Schema<PresetSkillsConfig>;
export declare function apply(ctx: DshContext, config?: PresetSkillsConfig): void;
export declare function registerAgentSkills(ctx: DshContext, controller: DeepworkModeController, getSettings: DsmmSettingsGetter): void;
export default apply;
//# sourceMappingURL=preset-skills.d.ts.map