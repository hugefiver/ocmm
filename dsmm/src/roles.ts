import { DSMM_SKILL_NAMES } from "./skills.js";
import type { DsmmSkillName } from "./skills.js";
import { buildRolePersona, SOURCE_ROLE_CATALOG } from "./prompt-content.js";
import { roleProviderName } from "./role-providers.js";
import type { DsmmModelRoute, DsmmRoleRouting } from "./settings.js";
import { allowedRoleChildren } from "./role-policy.js";

export const DSMM_ROLE_IDS = [
  "dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-builder",
  "dsmm-reviewer", "dsmm-oracle", "dsmm-oracle-2nd", "dsmm-creative",
  "dsmm-code-search", "dsmm-doc-search", "dsmm-clarifier", "dsmm-media-reader",
  "dsmm-frontend", "dsmm-hard-reasoning", "dsmm-research", "dsmm-quick",
  "dsmm-coding", "dsmm-normal-task", "dsmm-complex", "dsmm-deep",
  "dsmm-documenting", "dsmm-cross-cutting"
] as const;

export type DsmmRoleId = (typeof DSMM_ROLE_IDS)[number];
export type DsmmRoleMode = "primary" | "all" | "subagent";
export type DsmmDelegationGroup = "primary-coordinator" | "utility-leaf" | "read-only-workflow" | "standard-workflow" | "local-coordinator";

export interface DsmmRoleDefinition {
  id: DsmmRoleId;
  sourceId?: string;
  kind?: "role" | "category";
  name: string;
  description: string;
  order: number;
  mode: DsmmRoleMode;
  enabledByDefault: boolean;
  access?: "read-only" | "write";
  delegation?: DsmmDelegationGroup;
  allowedChildren?: readonly DsmmRoleId[];
  childBuilderAllowedChildren?: readonly DsmmRoleId[];
  persona: string;
}

// Generated source catalog is checked against the exact literal ID inventory.
// It carries no OCMM provider/model default and requires only package assets.
export const DSMM_ROLES: readonly (DsmmRoleDefinition & Required<Pick<DsmmRoleDefinition, "sourceId" | "kind" | "delegation" | "allowedChildren">>)[] = SOURCE_ROLE_CATALOG.map((row) => ({
  ...row,
  id: row.id as DsmmRoleId,
  allowedChildren: row.allowedChildren as DsmmRoleId[],
  childBuilderAllowedChildren: row.childBuilderAllowedChildren as DsmmRoleId[] | undefined,
  persona: buildRolePersona(row)
}));
const defaultEnabledRoleIds = DSMM_ROLES.filter((role) => role.enabledByDefault).map((role) => role.id);

export function isDsmmRoleId(value: unknown): value is DsmmRoleId {
  return typeof value === "string" && (DSMM_ROLE_IDS as readonly string[]).includes(value);
}

/** Root exposure is separate from whether a role is enabled for delegation. */
export function isRootRole(role: Pick<DsmmRoleDefinition, "mode">): boolean {
  return role.mode === "primary" || role.mode === "all";
}

/**
 * @param skills Ignored compatibility argument; preserve its published position.
 * Native Agent settings, not standing preset YAML, control skill visibility.
 */
export function renderAgentCordis(role: DsmmRoleDefinition, skills: readonly DsmmSkillName[] = DSMM_SKILL_NAMES, enabledRoles: readonly DsmmRoleId[] = defaultEnabledRoleIds, roleRouting: DsmmRoleRouting = {}): string {
  return rolePluginRows(role, skills, enabledRoles, roleRouting).map((row) => renderPluginRow(row)).join("");
}

export interface RolePluginRow {
  id: string;
  name: string;
  config?: Record<string, unknown> | RolePluginRow[];
  group?: boolean;
  isolate?: Record<string, boolean>;
  disabled?: boolean;
}

const longDevelopmentRoles: readonly DsmmRoleId[] = ["dsmm-coding", "dsmm-frontend", "dsmm-deep", "dsmm-complex", "dsmm-cross-cutting"];

// Deployment-owned guidance from DSH rc.2's public standard preset, not a new
// role permission: Planner remains read-only after native plan-mode exit.
const nativePlanSection = `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.`;

/** Native definitions and YAML share this inventory; skills is an ignored positional compatibility argument. */
export function rolePluginRows(role: DsmmRoleDefinition, skills: readonly DsmmSkillName[] = DSMM_SKILL_NAMES, enabledRoles: readonly DsmmRoleId[] = defaultEnabledRoleIds, roleRouting: DsmmRoleRouting = {}): RolePluginRow[] {
  const rows: RolePluginRow[] = [
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
    if (role.id !== "dsmm-planner") rows.push({ id: "tool-todo", name: "@deepseek-ai/dsh-tool-todo", config: { allowParallelInProgress: true } });
  }
  rows.push(...roleSubagentPluginRows(enabledRoles.filter((id) => allowedRoleChildren(role.id).includes(id)), roleRouting));
  return rows;
}

/** DSH's spawn provider joins the parent's preset; persona/filter give each child its own role. */
export function roleSubagentPluginRows(enabledRoles: readonly DsmmRoleId[] = defaultEnabledRoleIds, roleRouting: DsmmRoleRouting = {}): RolePluginRow[] {
  return DSMM_ROLES.filter((role) => role.id !== "dsmm-orchestrator" && enabledRoles.includes(role.id)).map((role) => ({
    id: `subagent-${role.id}`,
    name: "@deepseek-ai/dsh-tool-subagent",
    config: roleSubagentConfig(role, enabledRoles.map((id) => id.replace(/-/gu, "_")), roleRouting[role.id]?.primary)
  }));
}

export function roleSubagentConfig(role: DsmmRoleDefinition, availableTools: readonly string[] = [], primary?: DsmmModelRoute): Record<string, unknown> {
  const readOnlyTools = ["read", "glob", "grep"];
  if (role.id === "dsmm-doc-search" || role.id === "dsmm-media-reader") {
    readOnlyTools.push("web_search", "web_fetch");
  }
  // read_image is conditional on the DSH attachment store; an unknown name
  // would make DSH's native toolFilter reject the child at startup.
  if (role.id === "dsmm-media-reader" && availableTools.includes("read_image")) readOnlyTools.push("read_image");
  readOnlyTools.push(...allowedRoleChildren(role.id).map((id) => id.replace(/-/gu, "_")).filter((name) => availableTools.includes(name)));
  return {
    provider: roleProviderName(role.id),
    ...(primary === undefined ? {} : { agentOptions: { ...primary } }),
    toolName: role.id.replace(/-/gu, "_"),
    // Selection remains host-owned; identity and monotonic execution fences are
    // admitted separately from this standing composition.
    modelSelectionSettings: false,
    backgroundMode: "one-shot",
    enableRunInBackground: false,
    persona: role.persona,
    ...(role.access === "read-only" ? { toolFilter: { allow: readOnlyTools } } : {})
  };
}

export function renderPresetMetadata(role: DsmmRoleDefinition): string {
  return `id: ${role.id}
name: ${quoteYamlString(role.name)}
description: ${quoteYamlString(role.description)}
`;
}

function indentBlock(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value.split(/\r?\n/u).map((line) => line.length === 0 ? "" : `${prefix}${line}`).join("\n");
}

function renderPluginRow(row: RolePluginRow, spaces = 0): string {
  const prefix = " ".repeat(spaces);
  let output = `${prefix}- id: ${row.id}\n${prefix}  name: ${quoteYamlString(row.name)}\n`;
  if (row.disabled !== undefined) {
    output += `${prefix}  disabled: !!js process.platform ${row.id === "tool-bash" ? "===" : "!=="} 'win32'\n`;
  }
  if (row.group !== undefined) output += `${prefix}  group: ${row.group}\n`;
  if (row.isolate !== undefined) output += renderYamlField("isolate", row.isolate, spaces + 2);
  if (row.config === undefined) return output;
  if (Array.isArray(row.config)) return output + `${prefix}  config:\n${row.config.map((child) => renderPluginRow(child, spaces + 4)).join("")}`;
  return output + renderYamlField("config", row.config, spaces + 2);
}

function renderYamlField(key: string, value: unknown, spaces: number): string {
  const prefix = " ".repeat(spaces);
  if (typeof value === "string") return value.includes("\n") ? `${prefix}${key}: |-\n${indentBlock(value, spaces + 2)}\n` : `${prefix}${key}: ${quoteYamlString(value)}\n`;
  if (Array.isArray(value)) return value.length === 0 ? `${prefix}${key}: []\n` : `${prefix}${key}:\n${value.map((item) => `${prefix}  - ${quoteYamlString(String(item))}\n`).join("")}`;
  if (typeof value === "object" && value !== null) return `${prefix}${key}:\n${Object.entries(value).map(([nestedKey, nestedValue]) => renderYamlField(nestedKey, nestedValue, spaces + 2)).join("")}`;
  return `${prefix}${key}: ${String(value)}\n`;
}

function quoteYamlString(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}
