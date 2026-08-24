import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
import type { DsmmSkillName } from "./skills.js";
export declare const name = "dsmm/preset-skills";
export declare const inject: readonly ["skills"];
export interface PresetSkillsConfig {
    skills?: DsmmSkillName[];
}
export declare const Config: Schema<PresetSkillsConfig>;
export declare function apply(ctx: DshContext, config?: PresetSkillsConfig): void;
export default apply;
//# sourceMappingURL=preset-skills.d.ts.map