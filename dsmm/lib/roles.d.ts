import type { DsmmSkillName } from "./skills.js";
export declare const DSMM_ROLE_IDS: readonly ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-builder", "dsmm-reviewer", "dsmm-oracle", "dsmm-oracle-2nd", "dsmm-creative", "dsmm-code-search", "dsmm-doc-search", "dsmm-clarifier", "dsmm-media-reader"];
export type DsmmRoleId = (typeof DSMM_ROLE_IDS)[number];
export interface DsmmRoleDefinition {
    id: DsmmRoleId;
    name: string;
    description: string;
    order: number;
    enabledByDefault: boolean;
    access?: "read-only" | "write";
    persona: string;
}
export declare const DSMM_ROLES: readonly DsmmRoleDefinition[];
export declare function isDsmmRoleId(value: unknown): value is DsmmRoleId;
export declare function renderAgentCordis(role: DsmmRoleDefinition, skills?: readonly DsmmSkillName[], enabledRoles?: readonly DsmmRoleId[]): string;
export interface RolePluginRow {
    id: string;
    name: string;
    config?: Record<string, unknown>;
    disabled?: boolean;
}
/** The native PresetDefinition and the static YAML mirror use this same inventory. */
export declare function rolePluginRows(role: DsmmRoleDefinition, skills?: readonly DsmmSkillName[], enabledRoles?: readonly DsmmRoleId[]): RolePluginRow[];
/** DSH's spawn provider joins the parent's preset; persona/filter give each child its own role. */
export declare function roleSubagentPluginRows(enabledRoles?: readonly DsmmRoleId[]): RolePluginRow[];
export declare function roleSubagentConfig(role: DsmmRoleDefinition, availableTools?: readonly string[]): Record<string, unknown>;
export declare function renderPresetMetadata(role: DsmmRoleDefinition): string;
//# sourceMappingURL=roles.d.ts.map