import { DSMM_SKILL_NAMES } from "./skills.js";
import { buildRolePersona, SOURCE_ROLE_CATALOG } from "./prompt-content.js";
import { roleProviderName } from "./role-providers.js";
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
/** Root exposure is separate from whether a role is enabled for delegation. */
export function isRootRole(role) {
    return role.mode === "primary" || role.mode === "all";
}
/**
 * @param skills Ignored compatibility argument; preserve its published position.
 * Native Agent settings, not standing preset YAML, control skill visibility.
 */
export function renderAgentCordis(role, skills = DSMM_SKILL_NAMES, enabledRoles = defaultEnabledRoleIds, roleRouting = {}) {
    return rolePluginRows(role, skills, enabledRoles, roleRouting).map(renderPluginRow).join("");
}
/** Native definitions and YAML share this inventory; skills is an ignored positional compatibility argument. */
export function rolePluginRows(role, skills = DSMM_SKILL_NAMES, enabledRoles = defaultEnabledRoleIds, roleRouting = {}) {
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
    if (role.id === "dsmm-orchestrator" || role.id === "dsmm-builder")
        rows.push(...roleSubagentPluginRows(enabledRoles, roleRouting));
    return rows;
}
/** DSH's spawn provider joins the parent's preset; persona/filter give each child its own role. */
export function roleSubagentPluginRows(enabledRoles = defaultEnabledRoleIds, roleRouting = {}) {
    return DSMM_ROLES.filter((role) => role.id !== "dsmm-orchestrator" && enabledRoles.includes(role.id)).map((role) => ({
        id: `subagent-${role.id}`,
        name: "@deepseek-ai/dsh-tool-subagent",
        config: roleSubagentConfig(role, [], roleRouting[role.id]?.primary)
    }));
}
export function roleSubagentConfig(role, availableTools = [], primary) {
    const readOnlyTools = ["read", "glob", "grep"];
    if (role.id === "dsmm-doc-search" || role.id === "dsmm-media-reader") {
        readOnlyTools.push("web_search", "web_fetch");
    }
    // read_image is conditional on the DSH attachment store; an unknown name
    // would make DSH's native toolFilter reject the child at startup.
    if (role.id === "dsmm-media-reader" && availableTools.includes("read_image"))
        readOnlyTools.push("read_image");
    return {
        provider: roleProviderName(role.id),
        ...(primary === undefined ? {} : { agentOptions: { ...primary } }),
        toolName: role.id.replace(/-/gu, "_"),
        // Same-scope native re-registration can bypass inherited tool restrictions.
        modelSelectionSettings: false,
        backgroundMode: "one-shot",
        enableRunInBackground: false,
        persona: role.persona,
        ...(role.access === "read-only" ? { toolFilter: { allow: readOnlyTools } } : {})
    };
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
function renderPluginRow(row) {
    let output = `- id: ${row.id}\n  name: ${quoteYamlString(row.name)}\n`;
    if (row.disabled !== undefined) {
        output += `  disabled: !!js process.platform ${row.id === "tool-bash" ? "===" : "!=="} 'win32'\n`;
    }
    if (row.config === undefined)
        return output;
    output += "  config:\n";
    for (const [key, value] of Object.entries(row.config)) {
        if (typeof value === "string" && value.includes("\n"))
            output += `    ${key}: |-\n${indentBlock(value, 6)}\n`;
        else if (typeof value === "string")
            output += `    ${key}: ${quoteYamlString(value)}\n`;
        else if (Array.isArray(value))
            output += value.length === 0 ? `    ${key}: []\n` : `    ${key}:\n${value.map((item) => `      - ${quoteYamlString(String(item))}\n`).join("")}`;
        else if (typeof value === "object" && value !== null) {
            output += `    ${key}:\n`;
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                if (Array.isArray(nestedValue))
                    output += nestedValue.length === 0 ? `      ${nestedKey}: []\n` : `      ${nestedKey}:\n${nestedValue.map((item) => `        - ${quoteYamlString(String(item))}\n`).join("")}`;
                else
                    output += `      ${nestedKey}: ${typeof nestedValue === "string" ? quoteYamlString(nestedValue) : String(nestedValue)}\n`;
            }
        }
        else
            output += `    ${key}: ${String(value)}\n`;
    }
    return output;
}
function quoteYamlString(value) {
    return `'${value.replace(/'/gu, "''")}'`;
}
//# sourceMappingURL=roles.js.map