import type { DshContext } from "./dsh-types.js";
import type { DsmmSettings } from "./settings.js";
export declare const MVP_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review"];
export declare function parseSkillMarkdown(markdown: string): {
    name: string;
    description: string;
    content: string;
};
export declare function registerBundledSkills(ctx: DshContext, getSettings: () => DsmmSettings): void;
//# sourceMappingURL=skills.d.ts.map