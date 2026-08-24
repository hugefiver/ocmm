import Schema from "@deepseek-ai/schemastery";
import { DSMM_SKILL_NAMES, registerBundledSkills } from "./skills.js";
export const name = "dsmm/preset-skills";
export const inject = ["skills"];
const SKILL_NAME_SCHEMA = Schema.union([
    Schema.const("brainstorming"),
    Schema.const("writing-plans"),
    Schema.const("requesting-code-review"),
    Schema.const("receiving-code-review"),
    Schema.const("subagent-driven-development"),
    Schema.const("dispatching-parallel-agents"),
    Schema.const("remove-ai-slops")
]);
export const Config = Schema.object({
    skills: Schema.array(SKILL_NAME_SCHEMA).default([...DSMM_SKILL_NAMES])
});
export function apply(ctx, config = {}) {
    const skills = config.skills ?? DSMM_SKILL_NAMES;
    const register = (registry) => registerBundledSkills(registry, skills);
    if (ctx.inject !== undefined) {
        ctx.inject(["skills"], (readyCtx) => register(readyCtx.skills));
    }
    else if (Object.prototype.hasOwnProperty.call(ctx, "skills")) {
        register(Object.getOwnPropertyDescriptor(ctx, "skills")?.value);
    }
}
export default apply;
//# sourceMappingURL=preset-skills.js.map