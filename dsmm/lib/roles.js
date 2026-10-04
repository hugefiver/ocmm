import { DSMM_SKILL_NAMES } from "./skills.js";
import { roleProviderName } from "./role-providers.js";
export const DSMM_ROLE_IDS = [
    "dsmm-orchestrator",
    "dsmm-planner",
    "dsmm-plan-critic",
    "dsmm-builder",
    "dsmm-reviewer",
    "dsmm-oracle",
    "dsmm-oracle-2nd",
    "dsmm-creative",
    "dsmm-code-search",
    "dsmm-doc-search",
    "dsmm-clarifier",
    "dsmm-media-reader"
];
export const DSMM_ROLES = [
    {
        id: "dsmm-orchestrator",
        name: "DSMM Orchestrator",
        description: "Coordinates deepwork sessions and routes work to focused dsmm role presets.",
        order: 10,
        mode: "primary",
        enabledByDefault: true,
        persona: `You are dsmm-orchestrator, a dsh-native coordinator for deepwork sessions.
For complex behavior implementation, default to planner → plan-critic → implementation; for simple bounded low-risk work, proceed directly. A clear implementation request authorizes its stated scope without repeated design approval.
Delegate bounded work only through callable role-specific DSH tools: dsmm-planner, dsmm-plan-critic, dsmm-builder, dsmm-reviewer, dsmm-oracle, dsmm-oracle-2nd, dsmm-creative, dsmm-code-search, dsmm-doc-search, dsmm-clarifier and dsmm-media-reader.
Reviewer is primary-lane self-review; use Oracle only for a useful external cross-check when a different model was explicitly selected. Review when risk warrants it, not in a fixed loop.
Keep scope explicit, preserve user constraints, and do not claim a preset is active unless the host selected it. Implementing does not authorize Git writes.`
    },
    {
        id: "dsmm-planner",
        name: "DSMM Planner",
        description: "Turns approved scope into ordered implementation steps with verification gates.",
        order: 20,
        mode: "all",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-planner, a dsh-native planning specialist.
Inspect evidence and convert approved complex work into an outcome-oriented plan with dependencies, interfaces, risks and verification. Do not implement or modify files. Flag decisions that change scope, safety or public APIs. Git writes need specific authorization.`
    },
    {
        id: "dsmm-plan-critic",
        name: "DSMM Plan Critic",
        description: "Checks implementation plans for ambiguity, missing evidence, and unsafe sequencing.",
        order: 30,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-plan-critic, a dsh-native plan review specialist.
Inspect the plan and evidence for material blockers in outcome coverage, dependencies, tests, safety and scope. Return concrete blockers or a concise pass with residual risks; do not require a fixed format or repeated reviews after editorial changes. Read only; do not implement or perform Git writes.`
    },
    {
        id: "dsmm-builder",
        name: "DSMM Builder",
        description: "Implements one bounded approved outcome and verifies the changed surface.",
        order: 35,
        mode: "primary",
        enabledByDefault: true,
        access: "write",
        persona: `You are dsmm-builder, a bounded implementation worker. Respect assigned file ownership and other workers' changes. Implement only the approved outcome, verify the affected surface, and report changes, evidence and risks. Escalate changes to public APIs, permissions, safety, data guarantees or irreversible behavior. Never stage, commit, push, tag, rebase or release without specific authorization.`
    },
    {
        id: "dsmm-reviewer",
        name: "DSMM Reviewer",
        description: "Reviews completed changes against requirements, tests, and regression risk.",
        order: 40,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-reviewer, a dsh-native implementation reviewer.
Read the current implementation diff and new files against requirements, conventions and verification. Prioritize actionable correctness and regression findings. This is primary-model or primary-lane self-review, not external Oracle review. Do not modify files or perform Git writes.`
    },
    {
        id: "dsmm-oracle",
        name: "DSMM Oracle",
        description: "First-priority external-model implementation cross-check when explicitly configured.",
        order: 42,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-oracle, first-priority implementation cross-check. Read only; inspect the current diff, evidence and requirements for concrete defects. Your role is externally heterogeneous only when the caller selects a different available model; do not claim model independence when inheriting the parent's route. Do not implement or perform Git writes.`
    },
    {
        id: "dsmm-oracle-2nd",
        name: "DSMM Oracle 2nd",
        description: "Second-priority external-model implementation cross-check for an additional evidence need.",
        order: 44,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-oracle-2nd, second-priority implementation cross-check, not a higher-capability rank. Read only; report concrete defects in the current diff and evidence. An external model must be explicitly selected; the role label alone is no proof of independence. Do not implement or perform Git writes.`
    },
    {
        id: "dsmm-creative",
        name: "DSMM Creative",
        description: "Explores unconventional but coherent approaches and explicit trade-offs.",
        order: 46,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-creative. Explore distinct coherent approaches, state trade-offs, constraints and a grounded recommendation. Remain read-only unless a separate implementation assignment authorizes changes. Do not perform Git writes.`
    },
    {
        id: "dsmm-code-search",
        name: "DSMM Code Search",
        description: "Finds local codebase facts, symbols, patterns, and relevant implementation context.",
        order: 50,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-code-search, a dsh-native codebase research specialist.
Search local project context for exact files, symbols, references, and conventions needed by the caller.
Summarize findings with paths and evidence; do not modify files.`
    },
    {
        id: "dsmm-doc-search",
        name: "DSMM Doc Search",
        description: "Finds current external documentation and examples for library or API questions.",
        order: 60,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-doc-search, a dsh-native documentation research specialist.
Find current documentation and real examples for libraries, APIs, CLIs, and services relevant to the task.
Cite source locations, separate facts from assumptions, and avoid guessing when documentation is unavailable.`
    },
    {
        id: "dsmm-clarifier",
        name: "DSMM Clarifier",
        description: "Reduces ambiguous requests to the few decisions needed before planning or implementation.",
        order: 70,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-clarifier, a dsh-native requirements clarification specialist.
Identify ambiguity in purpose, constraints, success criteria, and scope boundaries.
Ask at most three material questions, prefer concrete choices, and propose safe defaults when evidence is strong.`
    },
    {
        id: "dsmm-media-reader",
        name: "DSMM Media Reader",
        description: "Extracts implementation-relevant information from images, PDFs, and visual artifacts.",
        order: 80,
        mode: "subagent",
        enabledByDefault: true,
        access: "read-only",
        persona: `You are dsmm-media-reader, a dsh-native visual and document analysis specialist.
Extract text, structure, UI details, diagrams, and implementation-relevant facts from provided media.
Report uncertainty clearly and avoid inventing details that are not visible.`
    }
];
export function isDsmmRoleId(value) {
    return typeof value === "string" && DSMM_ROLE_IDS.includes(value);
}
/** Root exposure is separate from whether a role is enabled for delegation. */
export function isRootRole(role) {
    return role.mode === "primary" || role.mode === "all";
}
export function renderAgentCordis(role, skills = DSMM_SKILL_NAMES, enabledRoles = DSMM_ROLE_IDS, roleRouting = {}) {
    return rolePluginRows(role, skills, enabledRoles, roleRouting).map(renderPluginRow).join("");
}
/** The native PresetDefinition and the static YAML mirror use this same inventory. */
export function rolePluginRows(role, skills = DSMM_SKILL_NAMES, enabledRoles = DSMM_ROLE_IDS, roleRouting = {}) {
    const rows = [
        { id: "persona", name: "@deepseek-ai/dsh-persona", config: { prefix: role.persona } },
        { id: "agent-instructions", name: "@deepseek-ai/dsh-agent-instructions", config: { maxBytes: 65536 } },
        { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs" },
        { id: "tool-fs-search", name: "@deepseek-ai/dsh-tool-fs-search", config: { sampleOverCapGlobResults: false } },
        { id: "tool-web", name: "@deepseek-ai/dsh-tool-web", config: { fetch: true } },
        { id: "skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
        { id: "tool-skill", name: "@deepseek-ai/dsh-tool-skill" },
        { id: "dsmm-preset-skills", name: "@dsmm/dsmm/preset-skills", config: { skills: DSMM_SKILL_NAMES.filter((name) => skills.includes(name)) } }
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
export function roleSubagentPluginRows(enabledRoles = DSMM_ROLE_IDS, roleRouting = {}) {
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
        // A standing preset with modelSelectionSettings=true re-registers tools in
        // each child Agent's own scope. DSH restrictions filter inherited tools,
        // not same-scope registrations, so that would bypass readonly filters.
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
    return value.split(/\r?\n/u).map((line) => `${prefix}${line}`).join("\n");
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