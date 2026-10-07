import type { DsmmSkillName } from "./skills.js";
import type { DsmmModelRoute, DsmmRoleRouting } from "./settings.js";
export declare const DSMM_ROLE_IDS: readonly ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-builder", "dsmm-reviewer", "dsmm-oracle", "dsmm-oracle-2nd", "dsmm-creative", "dsmm-code-search", "dsmm-doc-search", "dsmm-clarifier", "dsmm-media-reader", "dsmm-frontend", "dsmm-hard-reasoning", "dsmm-research", "dsmm-quick", "dsmm-coding", "dsmm-normal-task", "dsmm-complex", "dsmm-deep", "dsmm-documenting", "dsmm-cross-cutting"];
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
export declare const DSMM_ROLES: readonly (DsmmRoleDefinition & Required<Pick<DsmmRoleDefinition, "sourceId" | "kind" | "delegation" | "allowedChildren">>)[];
export declare function isDsmmRoleId(value: unknown): value is DsmmRoleId;
/** Root exposure is separate from whether a role is enabled for delegation. */
export declare function isRootRole(role: Pick<DsmmRoleDefinition, "mode">): boolean;
/**
 * @param skills Ignored compatibility argument; preserve its published position.
 * Native Agent settings, not standing preset YAML, control skill visibility.
 */
export declare function renderAgentCordis(role: DsmmRoleDefinition, skills?: readonly DsmmSkillName[], enabledRoles?: readonly DsmmRoleId[], roleRouting?: DsmmRoleRouting): string;
export interface RolePluginRow {
    id: string;
    name: string;
    config?: Record<string, unknown>;
    disabled?: boolean;
}
/** Native definitions and YAML share this inventory; skills is an ignored positional compatibility argument. */
export declare function rolePluginRows(role: DsmmRoleDefinition, skills?: readonly DsmmSkillName[], enabledRoles?: readonly DsmmRoleId[], roleRouting?: DsmmRoleRouting): RolePluginRow[];
/** DSH's spawn provider joins the parent's preset; persona/filter give each child its own role. */
export declare function roleSubagentPluginRows(enabledRoles?: readonly DsmmRoleId[], roleRouting?: DsmmRoleRouting): RolePluginRow[];
export declare function roleSubagentConfig(role: DsmmRoleDefinition, availableTools?: readonly string[], primary?: DsmmModelRoute): Record<string, unknown>;
export declare function renderPresetMetadata(role: DsmmRoleDefinition): string;
//# sourceMappingURL=roles.d.ts.map