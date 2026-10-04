import Schema from "@deepseek-ai/schemastery";
import type { DshContext, DshSkillRegistry } from "./dsh-types.js";
import { DSMM_SKILL_NAMES, DSMM_ON_DEMAND_SKILL_NAMES, registerBundledSkills } from "./skills.js";
import type { DsmmSkillName } from "./skills.js";

export const name = "dsmm/preset-skills";
export const inject = ["skills"] as const;

export interface PresetSkillsConfig {
  skills?: DsmmSkillName[];
}

const SKILL_NAME_SCHEMA = Schema.union([
  Schema.const("brainstorming"),
  Schema.const("writing-plans"),
  Schema.const("requesting-code-review"),
  Schema.const("receiving-code-review"),
  Schema.const("subagent-driven-development"),
  Schema.const("dispatching-parallel-agents"),
  Schema.const("remove-ai-slops")
]);

export const Config: Schema<PresetSkillsConfig> = Schema.object({
  skills: Schema.array(SKILL_NAME_SCHEMA).default([...DSMM_SKILL_NAMES])
});

export function apply(ctx: DshContext, config: PresetSkillsConfig = {}): void {
  const skills = config.skills ?? DSMM_SKILL_NAMES;
  const register = (registry: DshSkillRegistry | undefined): void => registerBundledSkills(registry, [...skills, ...DSMM_ON_DEMAND_SKILL_NAMES]);

  if (ctx.inject !== undefined) {
    ctx.inject(["skills"], (readyCtx) => register(readyCtx.skills));
  } else if (Object.prototype.hasOwnProperty.call(ctx, "skills")) {
    register(Object.getOwnPropertyDescriptor(ctx, "skills")?.value as DshSkillRegistry | undefined);
  }
}

export default apply;
