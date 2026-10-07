import type { Context } from "@deepseek-ai/cordis";
import type { DshAgent, DshSkillRegistration, DshSkillRegistry } from "./dsh-types.js";
import type { DsmmSettings, DsmmSettingsGetter } from "./settings.js";
import type { DeepworkModeController } from "./state.js";
export declare const DSMM_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops", "debugging", "frontend", "git-master", "ast-grep", "coding-agent-sessions", "init-deep", "using-git-worktrees"];
export declare const MVP_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops", "debugging", "frontend", "git-master", "ast-grep", "coding-agent-sessions", "init-deep", "using-git-worktrees"];
export type DsmmSkillName = (typeof DSMM_SKILL_NAMES)[number];
export type DsmmAvailableSkillName = DsmmSkillName;
export type MvpSkillName = DsmmSkillName;
/** Packaged metadata only; discovery never reads SKILL.md. */
export declare const DSMM_SKILL_DESCRIPTIONS: Record<DsmmAvailableSkillName, string>;
export declare const BUNDLED_SKILL_RANK = 600;
export declare function bundledSkillMetadata(name: DsmmAvailableSkillName): Omit<DshSkillRegistration, "content">;
export declare function parseSkillMarkdown(markdown: string): {
    name: string;
    description: string;
    content: string;
};
export declare function enabledSkillNames(settings: DsmmSettings): readonly DsmmSkillName[];
export declare function readBundledSkill(name: DsmmAvailableSkillName, signal: AbortSignal): Promise<DshSkillRegistration>;
export interface BundledSkillProviderOptions {
    agent: DshAgent;
    controller: DeepworkModeController;
    getSettings: DsmmSettingsGetter;
    /** Body I/O seam for deterministic cancellation/race contract tests. */
    load?: typeof readBundledSkill;
}
/** Exact Agent layer, native revision cache, metadata-only ancestor avoidance. */
export declare function registerBundledSkills(ctx: Context, skills: DshSkillRegistry, options: BundledSkillProviderOptions): {
    dispose(): void;
    invalidate(): void;
};
//# sourceMappingURL=skills.d.ts.map