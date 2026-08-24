import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export const DSMM_SKILL_NAMES = [
    "brainstorming",
    "writing-plans",
    "requesting-code-review",
    "receiving-code-review",
    "subagent-driven-development",
    "dispatching-parallel-agents",
    "remove-ai-slops"
];
export const MVP_SKILL_NAMES = DSMM_SKILL_NAMES;
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
export function enabledSkillNames(settings) {
    return DSMM_SKILL_NAMES.filter((name) => settings.skills[name]);
}
export function loadBundledSkill(name) {
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
export function registerBundledSkills(skills, names) {
    if (skills === undefined)
        return;
    for (const name of DSMM_SKILL_NAMES) {
        if (names.includes(name))
            skills.register(loadBundledSkill(name));
    }
}
export function renderBundledSkillPrompt(names) {
    return DSMM_SKILL_NAMES
        .filter((name) => names.includes(name))
        .map((name) => {
        const body = loadBundledSkill(name).content.replace(/\r?\n$/u, "");
        return `<dsmm-skill name="${name}">\n${body}\n</dsmm-skill>`;
    })
        .join("\n\n");
}
//# sourceMappingURL=skills.js.map