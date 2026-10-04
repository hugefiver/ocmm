import type { DshSkillRegistration, DshSkillRegistry } from "./dsh-types.js";
import type { DsmmSettings } from "./settings.js";
export declare const DSMM_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops"];
export declare const MVP_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops"];
export type DsmmSkillName = (typeof DSMM_SKILL_NAMES)[number];
export declare const DSMM_ON_DEMAND_SKILL_NAMES: readonly ["debugging"];
export type DsmmAvailableSkillName = DsmmSkillName | (typeof DSMM_ON_DEMAND_SKILL_NAMES)[number];
export type MvpSkillName = DsmmSkillName;
export declare function parseSkillMarkdown(markdown: string): {
    name: string;
    description: string;
    content: string;
};
export declare function enabledSkillNames(settings: DsmmSettings): readonly DsmmSkillName[];
export declare function loadBundledSkill(name: DsmmAvailableSkillName): DshSkillRegistration;
export declare function registerBundledSkills(skills: DshSkillRegistry | undefined, names: readonly DsmmAvailableSkillName[]): void;
export declare function renderBundledSkillPrompt(names: readonly DsmmSkillName[]): string;
//# sourceMappingURL=skills.d.ts.map