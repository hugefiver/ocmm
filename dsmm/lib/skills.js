import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DSMM_SKILL_NAMES } from "./settings.js";
export { DSMM_SKILL_NAMES, MVP_SKILL_NAMES } from "./settings.js";
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export function parseSkillMarkdown(markdown) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(markdown);
    if (match === null)
        throw new Error("skill markdown must start with YAML frontmatter");
    const frontmatter = match[1];
    const name = /^name:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    const description = /^description:\s*(.+)$/mu.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (name === undefined || description === undefined)
        throw new Error("skill frontmatter needs name and description");
    return { name, description, content: match[2].replace(/^\r?\n/u, "") };
}
function loadSkill(name) {
    const directory = join(packageRoot, "skills", name);
    const parsed = parseSkillMarkdown(readFileSync(join(directory, "SKILL.md"), "utf8"));
    return {
        name: parsed.name,
        description: parsed.description,
        content: parsed.content,
        source: "bundled",
        provider: "dsmm",
        resourceBase: { kind: "directory", path: directory },
        invocation: { modelInvocable: true, userInvocable: true }
    };
}
export function registerBundledSkills(ctx, getSettings) {
    const register = (skills) => {
        if (skills === undefined)
            return;
        const settings = getSettings();
        for (const name of DSMM_SKILL_NAMES) {
            if (settings.skills[name] && existsSync(join(packageRoot, "skills", name, "SKILL.md")))
                skills.register(loadSkill(name));
        }
    };
    if (ctx.inject !== undefined) {
        ctx.inject(["skills"], (services) => register(services.skills));
    }
    else if (Object.prototype.hasOwnProperty.call(ctx, "skills")) {
        register(Object.getOwnPropertyDescriptor(ctx, "skills")?.value);
    }
}
//# sourceMappingURL=skills.js.map