import { DSMM_SKILL_NAMES } from "./skills.js";
import { buildRolePersona, SOURCE_ROLE_CATALOG } from "./prompt-content.js";
export const DSMM_ROLE_IDS = [
    "dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-builder",
    "dsmm-reviewer", "dsmm-oracle", "dsmm-oracle-2nd", "dsmm-creative",
    "dsmm-code-search", "dsmm-doc-search", "dsmm-clarifier", "dsmm-media-reader",
    "dsmm-frontend", "dsmm-hard-reasoning", "dsmm-research", "dsmm-quick",
    "dsmm-coding", "dsmm-normal-task", "dsmm-complex", "dsmm-deep",
    "dsmm-documenting", "dsmm-cross-cutting"
];
// Generated source catalog is checked against the exact literal ID inventory.
// It carries no OCMM provider/model default and requires only package assets.
export const DSMM_ROLES = SOURCE_ROLE_CATALOG.map((row) => ({
    ...row,
    id: row.id,
    allowedChildren: row.allowedChildren,
    childBuilderAllowedChildren: row.childBuilderAllowedChildren,
    persona: buildRolePersona(row)
}));
const defaultEnabledRoleIds = DSMM_ROLES.filter((role) => role.enabledByDefault).map((role) => role.id);
export function isDsmmRoleId(value) {
    return typeof value === "string" && DSMM_ROLE_IDS.includes(value);
}
export function roleProviderName(role) { return `dsmm-role-${role.slice("dsmm-".length)}`; }
export function allowedRoleChildren(role, child = false) {
    const definition = DSMM_ROLES.find(row => row.id === role);
    return child && role === "dsmm-builder" ? definition.childBuilderAllowedChildren ?? [] : definition.allowedChildren;
}
/** Root exposure is separate from whether a role is enabled for delegation. */
export function isRootRole(role) {
    return role.mode === "primary" || role.mode === "all";
}
/**
 * @param skills Ignored compatibility argument; preserve its published position.
 * Native Agent settings, not standing preset YAML, control skill visibility.
 */
export function renderAgentCordis(role, skills = DSMM_SKILL_NAMES, enabledRoles = defaultEnabledRoleIds, roleRouting = {}) {
    return rolePluginRows(role, skills, enabledRoles, roleRouting).map((row) => renderPluginRow(row)).join("");
}
const longDevelopmentRoles = ["dsmm-coding", "dsmm-frontend", "dsmm-deep", "dsmm-complex", "dsmm-cross-cutting"];
// Deployment-owned guidance from DSH rc.2's public standard preset, not a new
// role permission: Planner remains read-only after native plan-mode exit.
const nativePlanSection = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.`;
/** Standing native capabilities; session routes, skills and callable delegation are admission-owned. */
export function rolePluginRows(role, _skills = DSMM_SKILL_NAMES, _enabledRoles = defaultEnabledRoleIds, _roleRouting = {}) {
    const rows = [
        { id: "persona", name: "@deepseek-ai/dsh-persona", config: { prefix: role.persona } },
        { id: "agent-instructions", name: "@deepseek-ai/dsh-agent-instructions", config: { maxBytes: 65536 } },
        { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs" },
        { id: "tool-fs-search", name: "@deepseek-ai/dsh-tool-fs-search", config: { sampleOverCapGlobResults: false } },
        { id: "tool-web", name: "@deepseek-ai/dsh-tool-web", config: { fetch: true } },
        { id: "skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
        { id: "tool-skill", name: "@deepseek-ai/dsh-tool-skill" }
    ];
    if (role.access !== "read-only") {
        rows.push({ id: "tool-bash", name: "@deepseek-ai/dsh-tool-bash", disabled: process.platform === "win32" });
        rows.push({ id: "tool-pwsh", name: "@deepseek-ai/dsh-tool-pwsh", disabled: process.platform !== "win32" });
        rows.push({ id: "tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" });
    }
    const root = isRootRole(role);
    const longDevelopment = longDevelopmentRoles.includes(role.id);
    if (root) {
        rows.push({ id: "planning", name: "cordis:group", group: true, isolate: { planMode: true }, config: [
                { id: "plan-mode", name: "@deepseek-ai/dsh-plan-mode", config: { section: nativePlanSection } }
            ] });
    }
    if (root || longDevelopment) {
        rows.push({ id: "compaction", name: "cordis:group", group: true, isolate: { compaction: true, toolResultPruner: true }, config: [
                { id: "compaction-basic", name: "@deepseek-ai/dsh-compaction-basic" },
                { id: "command-compact", name: "@deepseek-ai/dsh-command-compact" },
                { id: "tool-result-pruner", name: "@deepseek-ai/dsh-compaction-tool-result-pruner", config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } }
            ] });
        rows.push({ id: "tool-ask-user", name: "@deepseek-ai/dsh-tool-ask-user" });
        if (role.id !== "dsmm-planner")
            rows.push({ id: "tool-todo", name: "@deepseek-ai/dsh-tool-todo", config: { allowParallelInProgress: true } });
    }
    return rows;
}
export function renderPresetMetadata(role) {
    return `id: ${role.id}
name: ${quoteYamlString(role.name)}
description: ${quoteYamlString(role.description)}
`;
}
function indentBlock(value, spaces) {
    const prefix = " ".repeat(spaces);
    return value.split(/\r?\n/u).map((line) => line.length === 0 ? "" : `${prefix}${line}`).join("\n");
}
function renderPluginRow(row, spaces = 0) {
    const prefix = " ".repeat(spaces);
    let output = `${prefix}- id: ${row.id}\n${prefix}  name: ${quoteYamlString(row.name)}\n`;
    if (row.disabled !== undefined) {
        output += `${prefix}  disabled: !!js process.platform ${row.id === "tool-bash" ? "===" : "!=="} 'win32'\n`;
    }
    if (row.group !== undefined)
        output += `${prefix}  group: ${row.group}\n`;
    if (row.isolate !== undefined)
        output += renderYamlField("isolate", row.isolate, spaces + 2);
    if (row.config === undefined)
        return output;
    if (Array.isArray(row.config))
        return output + `${prefix}  config:\n${row.config.map((child) => renderPluginRow(child, spaces + 4)).join("")}`;
    return output + renderYamlField("config", row.config, spaces + 2);
}
function renderYamlField(key, value, spaces) {
    const prefix = " ".repeat(spaces);
    if (typeof value === "string")
        return value.includes("\n") ? `${prefix}${key}: |-\n${indentBlock(value, spaces + 2)}\n` : `${prefix}${key}: ${quoteYamlString(value)}\n`;
    if (Array.isArray(value))
        return value.length === 0 ? `${prefix}${key}: []\n` : `${prefix}${key}:\n${value.map((item) => `${prefix}  - ${quoteYamlString(String(item))}\n`).join("")}`;
    if (typeof value === "object" && value !== null)
        return `${prefix}${key}:\n${Object.entries(value).map(([nestedKey, nestedValue]) => renderYamlField(nestedKey, nestedValue, spaces + 2)).join("")}`;
    return `${prefix}${key}: ${String(value)}\n`;
}
function quoteYamlString(value) {
    return `'${value.replace(/'/gu, "''")}'`;
}
//# sourceMappingURL=roles.js.map