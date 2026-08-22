import type { DshContext } from "./dsh-types.js";
import type { DsmmSettings } from "./settings.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./settings.js";
export declare function parseSkillMarkdown(markdown: string): {
    name: string;
    description: string;
    content: string;
};
export declare function registerBundledSkills(ctx: DshContext, getSettings: () => DsmmSettings): void;
//# sourceMappingURL=skills.d.ts.map